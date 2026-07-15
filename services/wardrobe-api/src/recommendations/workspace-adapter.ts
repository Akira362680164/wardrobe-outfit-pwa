import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { RecommendationEngineInputSchema, type RecommendationEngineInput, type SceneType, type WeatherEvidence } from "@wardrobe/cloud-contracts";
import { isSystemColor, normalizeSeasonList, normalizeStyleList } from "@wardrobe/domain-catalog";

const RECOMMENDATION_CATEGORIES = new Set(["tops", "pants", "skirts", "one_piece", "shoes", "bags", "hats", "jewelry", "accessories"]);
const ACTIVE_STATUSES = new Set(["active", "available", "clean", "in_wardrobe"]);
const SCENES = new Set<SceneType>(["business", "commute", "travel", "casual", "daily", "date", "formal"]);

type WorkspaceRow = { id: string; user_id: string; payload: Record<string, unknown>; deleted_at?: Date | null };

export interface RecommendationWorkspaceContext {
  input: RecommendationEngineInput;
  skipReason: "actual" | "primary_plan" | null;
  plan: Record<string, unknown> | null;
  protectedPlan: { id: string; payload: Record<string, unknown> } | null;
}

export class RecommendationWorkspaceAdapter {
  constructor(private readonly pool: Pool) {}

  async listEnabledUsers(): Promise<Array<{ userId: string; timezone: string }>> {
    const result = await this.pool.query<{ id: string; payload: Record<string, unknown> | null }>(`
      select u.id, p.payload from users u
      left join lateral (select payload from profiles where user_id = u.id and deleted_at is null order by updated_at desc limit 1) p on true
      where u.disabled_at is null order by u.id
    `);
    return result.rows.map((row) => ({ userId: row.id, timezone: validTimezone(text(row.payload?.timezone)) ?? "Asia/Shanghai" }));
  }

  async load(userId: string, targetDate: string, asOfDate: string, timezone: string, requestId: string = randomUUID()): Promise<RecommendationWorkspaceContext> {
    const [garmentResult, outfitResult, itemResult, wearResult, planResult, tripResult, profileResult, imageResult] = await Promise.all([
      this.pool.query<WorkspaceRow>("select id, user_id, payload, deleted_at from garments where user_id = $1", [userId]),
      this.pool.query<WorkspaceRow>("select id, user_id, payload, deleted_at from outfits where user_id = $1", [userId]),
      this.pool.query<{ outfit_id: string; garment_id: string }>("select outfit_id, garment_id from outfit_items where user_id = $1 and deleted_at is null order by sort_order nulls last, id", [userId]),
      this.pool.query<WorkspaceRow & { garment_id: string | null; outfit_id: string | null; worn_at: Date }>("select id, user_id, payload, deleted_at, garment_id, outfit_id, worn_at from wear_events where user_id = $1 and deleted_at is null order by worn_at desc limit 5000", [userId]),
      this.pool.query<WorkspaceRow & { plan_date: string | null; actual_outfit_id: string | null }>("select id, user_id, payload, deleted_at, plan_date, actual_outfit_id from outfit_plans where user_id = $1 and deleted_at is null and plan_date = $2", [userId, targetDate]),
      this.pool.query<WorkspaceRow & { start_date: string | null; end_date: string | null }>("select id, user_id, payload, deleted_at, start_date, end_date from trip_plans where user_id = $1 and deleted_at is null and start_date <= $2 and end_date >= $2 order by updated_at desc,id desc limit 1", [userId, targetDate]),
      this.pool.query<WorkspaceRow>("select id, user_id, payload, deleted_at from profiles where user_id = $1 and deleted_at is null order by updated_at desc limit 1", [userId]),
      this.pool.query<{ owner_entity_id: string }>("select distinct owner_entity_id from asset_bindings where user_id = $1 and owner_entity_type = 'garment' and field_name in ('primaryImage', 'image', 'cover')", [userId]),
    ]);
    const profile = profileResult.rows[0]?.payload ?? {};
    const outfitGarments = new Map<string, string[]>();
    for (const row of itemResult.rows) (outfitGarments.get(row.outfit_id) ?? outfitGarments.set(row.outfit_id, []).get(row.outfit_id)!).push(row.garment_id);
    const imageIds = new Set(imageResult.rows.map((row) => row.owner_entity_id));
    const garments = garmentResult.rows.map((row) => {
      const p = row.payload ?? {};
      const rawStatus = text(p.status) ?? "active";
      const category = categoryOf(p.category);
      const range = record(p.temperatureRange);
      return {
        id: row.id, userId: row.user_id, deleted: Boolean(row.deleted_at), status: ACTIVE_STATUSES.has(rawStatus) ? "active" as const : (["laundry", "repair", "archived"].includes(rawStatus) ? rawStatus as "laundry" | "repair" | "archived" : "archived" as const),
        hasPrimaryImage: imageIds.has(row.id) || Boolean(text(p.primaryImageUrl) ?? text(p.imageUrl) ?? text(p.image)),
        ...(category ? { category } : {}), ...(text(p.subcategory) ? { subcategory: text(p.subcategory)! } : {}),
        colors: colorsOf(p.colors ?? p.color).slice(0, 4), seasons: normalizeSeasonList(strings(p.seasons ?? p.season)).slice(0, 4), styles: normalizeStyleList(strings(p.styles ?? p.style)).slice(0, 8),
        ...(integer(p.formality, 1, 5) ? { formality: integer(p.formality, 1, 5)! } : {}), ...(integer(p.warmth, 1, 5) ? { warmth: integer(p.warmth, 1, 5)! } : {}),
        ...(text(p.material) ? { material: text(p.material)! } : {}),
        ...(number(p.temperatureMinC ?? range.min ?? range.minC) !== undefined ? { temperatureMinC: number(p.temperatureMinC ?? range.min ?? range.minC)! } : {}),
        ...(number(p.temperatureMaxC ?? range.max ?? range.maxC) !== undefined ? { temperatureMaxC: number(p.temperatureMaxC ?? range.max ?? range.maxC)! } : {}),
        ...(p.recommendationBlocked === true ? { recommendationBlocked: true } : {}),
      };
    });
    const activeGarments = new Set(garments.filter((g) => !g.deleted).map((g) => g.id));
    const savedOutfits = outfitResult.rows.filter((row) => !row.deleted_at).map((row) => ({
      id: row.id, userId, garmentIds: [...new Set(outfitGarments.get(row.id) ?? strings(row.payload.garmentIds))].filter((id) => activeGarments.has(id)).slice(0, 9),
      successfulWearCount: wearResult.rows.filter((wear) => wear.outfit_id === row.id).length,
    })).filter((outfit) => outfit.garmentIds.length >= 2);
    const wearHistory = wearResult.rows.map((row) => {
      const ids = [...new Set([...(row.garment_id ? [row.garment_id] : []), ...(row.outfit_id ? outfitGarments.get(row.outfit_id) ?? [] : []), ...strings(row.payload.garmentIds)])].filter((id) => activeGarments.has(id));
      return { garmentIds: ids, wornDate: dateInZone(row.worn_at, timezone), sceneType: scene(row.payload.sceneType ?? row.payload.activity) };
    }).filter((entry) => entry.garmentIds.length > 0 && entry.wornDate <= asOfDate);
    const feedback = wearResult.rows.flatMap((row) => {
      const sentiment = feedbackSentiment(row.payload);
      if (!sentiment) return [];
      const garmentIds = [...new Set([...(row.garment_id ? [row.garment_id] : []), ...(row.outfit_id ? outfitGarments.get(row.outfit_id) ?? [] : []), ...strings(row.payload.garmentIds)])].filter((id) => activeGarments.has(id)).slice(0, 9);
      return garmentIds.length ? [{ garmentIds, sceneType: scene(row.payload.sceneType ?? row.payload.activity), sentiment }] : [];
    });
    const plan = tripResult.rows[0]?.payload ?? null;
    const weatherEvidence = inferWeatherEvidence(targetDate, plan, `${asOfDate}T00:00:00.000Z`);
    const input = RecommendationEngineInputSchema.parse({
      requestId, userId, ruleVersion: "wardora-rules-1a", asOfDate,
      dateContextInput: { date: targetDate, weekday: isoWeekday(targetDate), dayType: isoWeekday(targetDate) >= 6 ? "rest_day" : "workday", timezone, weatherEvidence,
        ...(plan ? { travelPlan: { name: text(plan.title ?? plan.name) ?? "计划", destination: text(plan.destination) ?? "未指定目的地", activities: strings(plan.activities ?? plan.activity).slice(0, 12), ...(text(plan.notes) ? { notes: text(plan.notes)! } : {}) } } : {}),
        userProfile: { ...(sceneOrUndefined(profile.workdayScene) ? { workdayScene: sceneOrUndefined(profile.workdayScene) } : {}), ...(sceneOrUndefined(profile.restDayScene) ? { restDayScene: sceneOrUndefined(profile.restDayScene) } : {}), thermalBias: (["cold_sensitive", "normal", "heat_sensitive"].includes(text(profile.thermalBias) ?? "") ? text(profile.thermalBias) : "normal"), stylePreferences: strings(profile.stylePreferences).slice(0, 12) } },
      garments, savedOutfits, wearHistory, feedback, anchorGarmentIds: strings(profile.anchorGarmentIds).filter((id) => activeGarments.has(id)).slice(0, 9), pawCandidateEvaluatorEnabled: false,
    });
    const actualRow = planResult.rows.find((row) => row.actual_outfit_id || ["worn", "actual"].includes(text(row.payload.status) ?? ""));
    const primaryRow = planResult.rows.find((row) => row.payload.status === "planned" && row.payload.isPrimary === true);
    const protectedRow = actualRow ?? primaryRow;
    return { input, skipReason: actualRow ? "actual" : primaryRow ? "primary_plan" : null, plan, protectedPlan: protectedRow ? { id: protectedRow.id, payload: protectedRow.payload } : null };
  }
}

export function inferWeatherEvidence(targetDate: string, plan: Record<string, unknown> | null, updatedAt: string): WeatherEvidence {
  const activities = `${strings(plan?.activities ?? plan?.activity).join(" ")} ${text(plan?.notes) ?? ""}`.toLowerCase();
  if (plan && activities.trim()) return { weatherSource: "plan_semantic_inference", weatherConfidence: 0.45, weatherUpdatedAt: updatedAt, ...seasonalRange(targetDate), summary: "基于已确认计划语义与季节的规则估计，非实时天气" };
  const seasonal = seasonalRange(targetDate);
  if (seasonal) return { weatherSource: "seasonal_inference", weatherConfidence: 0.3, weatherUpdatedAt: updatedAt, ...seasonal, summary: "基于目标日期季节的规则估计，非实时天气" };
  return { weatherSource: "layering_default", weatherConfidence: 0.15, weatherUpdatedAt: updatedAt, temperatureMinC: 12, temperatureMaxC: 26, summary: "缺少天气证据，采用可增减层次默认值" };
}

function seasonalRange(date: string) { const month = Number(date.slice(5, 7)); return month <= 2 || month === 12 ? { temperatureMinC: 0, temperatureMaxC: 12 } : month <= 5 ? { temperatureMinC: 12, temperatureMaxC: 24 } : month <= 8 ? { temperatureMinC: 24, temperatureMaxC: 35 } : { temperatureMinC: 12, temperatureMaxC: 25 }; }
function isoWeekday(date: string) { const day = new Date(`${date}T00:00:00Z`).getUTCDay(); return day === 0 ? 7 : day; }
function dateInZone(value: Date, timezone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
function strings(value: unknown): string[] { if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0); if (typeof value === "string" && value.trim()) return value.split(/[,，、]/).map((v) => v.trim()).filter(Boolean); return []; }
function colorsOf(value: unknown): string[] { const direct = strings(value); const color = record(value); const values = direct.length ? direct : color.mode === "single" ? strings(color.primary) : color.mode === "main_with_accent" ? [...strings(color.primary), ...strings(color.accents)] : color.mode === "multicolor" ? strings(color.primaries) : []; return [...new Set(values)].filter(isSystemColor); }
function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function number(value: unknown): number | undefined { const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN; return Number.isFinite(n) ? n : undefined; }
function integer(value: unknown, min: number, max: number) { const n = number(value); return n !== undefined && Number.isInteger(n) && n >= min && n <= max ? n : undefined; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function categoryOf(value: unknown) { const raw = text(value); if (!raw) return undefined; const aliases: Record<string, string> = { bags: "bags", bag: "bags", hats: "hats", hat: "hats", accessories: "accessories", accessory: "accessories", dresses: "one_piece", dress: "one_piece" }; const normalized = aliases[raw] ?? raw; return RECOMMENDATION_CATEGORIES.has(normalized) ? normalized as RecommendationEngineInput["garments"][number]["category"] : undefined; }
function scene(value: unknown): SceneType { return sceneOrUndefined(value) ?? "daily"; }
function sceneOrUndefined(value: unknown): SceneType | undefined { const raw = text(value)?.toLowerCase() as SceneType | undefined; return raw && SCENES.has(raw) ? raw : undefined; }
function feedbackSentiment(payload: Record<string, unknown>) { const raw = text(payload.sentiment ?? payload.feedback); if (["positive", "moderate_negative", "severe_negative"].includes(raw ?? "")) return raw as "positive" | "moderate_negative" | "severe_negative"; const comfort = number(payload.comfortScore); return comfort !== undefined ? comfort >= 4 ? "positive" as const : comfort <= 1 ? "severe_negative" as const : comfort <= 2 ? "moderate_negative" as const : undefined : undefined; }
function validTimezone(value: string | undefined) { if (!value) return undefined; try { new Intl.DateTimeFormat("en", { timeZone: value }); return value; } catch { return undefined; } }

export function deterministicRequestId(seed: string): string { const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split(""); hex[12] = "5"; hex[16] = "8"; const s = hex.join(""); return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`; }
