import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  AcceptRecommendationResponseSchema,
  RECOMMENDATION_FORECAST_RULE_VERSION,
  RECOMMENDATION_LOCATIONLESS_RULE_VERSION,
  RecommendationEngineInputV2Schema,
  RecommendationPlanPayloadSchema,
  type AcceptRecommendationCommand,
  type AcceptRecommendationResponse,
  type GarmentSlot,
  type RecommendationGarment,
} from "@wardrobe/cloud-contracts";

import { getPostgresPool } from "../db/client.js";
import { WorkspaceApiError } from "../workspace/errors.js";
import { WeatherOverviewService } from "../weather/overview-service.js";
import { mapGarmentRole, validateRecommendationCandidateCurrent } from "./engine.js";
import { RecommendationWorkspaceAdapter } from "./workspace-adapter.js";

export type RecommendationAcceptStage = "afterPrevalidation" | "afterValidation" | "afterPlan" | "afterBindings" | "afterAction" | "beforeCommit";
type Selection = { garment: RecommendationGarment; role: GarmentSlot };
type SelectionValidator = (userId: string, date: string, selectedIds: readonly string[], candidate?: any) => Promise<Selection[]>;

const TEMPLATE_SLOTS: Record<string, GarmentSlot[]> = {
  T1: ["tops", "pants", "shoes"], T2: ["tops", "pants", "outerwear", "shoes"], T3: ["tops", "skirts", "shoes"],
  T4: ["tops", "skirts", "outerwear", "shoes"], T5: ["one_piece", "shoes"], T6: ["one_piece", "outerwear", "shoes"],
  T7: ["tops", "pants", "shoes", "bag"], T8: ["tops", "pants", "shoes", "hat"],
};

export class RecommendationAcceptService {
  private readonly validateSelection: SelectionValidator;
  private readonly prevalidateCurrent: boolean;

  constructor(
    private readonly pool: Pool = getPostgresPool(),
    options: { validateSelection?: SelectionValidator; overview?: WeatherOverviewService; fault?: (stage: RecommendationAcceptStage) => void | Promise<void>; clock?: () => Date } = {},
  ) {
    this.fault = options.fault;
    this.clock = options.clock ?? (() => new Date());
    this.prevalidateCurrent = !options.validateSelection;
    this.validateSelection = options.validateSelection ?? this.currentSelectionValidator(options.overview ?? new WeatherOverviewService({ pool }));
  }

  private readonly fault?: (stage: RecommendationAcceptStage) => void | Promise<void>;
  private readonly clock: () => Date;

  async accept(userId: string, deviceId: string, date: string, command: AcceptRecommendationCommand): Promise<AcceptRecommendationResponse> {
    const fingerprint = hash(command);
    const replayBeforeValidation = await this.pool.query("select payload,response_json from sync_mutations where user_id=$1 and mutation_id=$2", [userId, command.clientMutationId]);
    if (replayBeforeValidation.rows[0]) {
      if (replayBeforeValidation.rows[0].payload?.acceptFingerprint !== fingerprint) throw conflict("mutation_payload_conflict");
      return this.readCommittedPlan(userId, (replayBeforeValidation.rows[0].response_json as AcceptRecommendationResponse).plan.id, true);
    }
    const preselection = this.prevalidateCurrent ? await this.validateSelection(userId, date, command.selectedGarmentIds) : null;
    if (preselection) await this.fault?.("afterPrevalidation");
    const client = await this.pool.connect();
    let planId = "";
    let replay = false;
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`recommendation-accept-mutation:${userId}:${command.clientMutationId}`]);
      const existing = await client.query("select payload,response_json from sync_mutations where user_id=$1 and mutation_id=$2 for update", [userId, command.clientMutationId]);
      if (existing.rows[0]) {
        if (existing.rows[0].payload?.acceptFingerprint !== fingerprint) throw conflict("mutation_payload_conflict");
        const response = existing.rows[0].response_json as AcceptRecommendationResponse;
        planId = response.plan.id;
        replay = true;
        await client.query("commit");
        return this.readCommittedPlan(userId, planId, true);
      }

      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`workspace-plan-date:${userId}:${date}`]);
      const recResult = await client.query("select * from daily_recommendations where id=$1 and user_id=$2 and target_date=$3 for share", [command.recommendationId, userId, date]);
      const rec = recResult.rows[0];
      if (!rec || rec.revision !== command.expectedRecommendationRevision || rec.payload?.schemaVersion !== 3) throw conflict("recommendation_no_longer_valid");
      const candidates = [...(rec.payload.engineOutput?.recommendations ?? []), ...(rec.payload.engineOutput?.shortlist ?? [])];
      const candidate = candidates.find((value: any) => value.candidateId === command.candidateId);
      if (!candidate) throw conflict("recommendation_no_longer_valid");

      const selectedRows = await client.query(`
        select g.id,g.payload from garments g
        where g.user_id=$1 and g.id=any($2::uuid[]) and g.deleted_at is null for share of g
      `, [userId, command.selectedGarmentIds]);
      const bindingRows = await client.query("select owner_entity_id,asset_id,field_name from asset_bindings where user_id=$1 and owner_entity_type='garment' and owner_entity_id=any($2::uuid[]) for share", [userId, command.selectedGarmentIds]);
      let selection: Selection[];
      try { selection = await this.validateSelection(userId, date, command.selectedGarmentIds, candidate); }
      catch { throw conflict("recommendation_no_longer_valid"); }
      validateReplacement(candidate, command.selectedGarmentIds, selection);
      const boundIds = new Set(bindingRows.rows.filter((row) => ["primaryImage", "image", "cover"].includes(row.field_name)).map((row) => row.owner_entity_id));
      if (selectedRows.rowCount !== command.selectedGarmentIds.length || selectedRows.rows.some((row) => {
        const expected = (preselection ?? selection).find((entry) => entry.garment.id === row.id)?.garment; const payload = row.payload ?? {};
        return !expected || !["active", "available", "clean", "in_wardrobe"].includes(String(payload.status ?? "active"))
          || payload.category !== expected.category || (payload.subcategory ?? undefined) !== expected.subcategory
          || !sameStrings(payload.colors ?? payload.color, expected.colors) || !sameStrings(payload.seasons ?? payload.season, expected.seasons)
          || !sameStrings(payload.styles ?? payload.style, expected.styles) || (payload.material ?? undefined) !== expected.material
          || (payload.formality ?? undefined) !== expected.formality || (payload.warmth ?? undefined) !== expected.warmth
          || (payload.temperatureMinC ?? payload.temperatureRange?.minC) !== expected.temperatureMinC
          || (payload.temperatureMaxC ?? payload.temperatureRange?.maxC) !== expected.temperatureMaxC
          || (payload.recommendationBlocked === true) !== (expected.recommendationBlocked === true)
          || (boundIds.has(row.id) || Boolean(payload.primaryImageUrl ?? payload.imageUrl ?? payload.image)) !== expected.hasPrimaryImage;
      })) throw conflict("recommendation_no_longer_valid");
      await this.fault?.("afterValidation");

      const primaryResult = await client.query("select * from outfit_plans where user_id=$1 and plan_date=$2 and deleted_at is null and payload->>'status'='planned' and payload->>'isPrimary'='true' for update", [userId, date]);
      const primary = primaryResult.rows[0];
      if (primary) {
        const replace = command.replaceExistingPrimary;
        if (!replace || replace.planEntryId !== primary.id || replace.expectedRevision !== primary.revision) throw conflict("existing_primary_requires_confirmation");
        const demoted = { ...primary.payload, isPrimary: false, role: "backup", updatedAt: this.clock().toISOString() };
        await client.query("update outfit_plans set revision=revision+1,origin_device_id=$1,payload=$2::jsonb,updated_at=now() where id=$3 and revision=$4", [deviceId, JSON.stringify(demoted), primary.id, primary.revision]);
        await appendChange(client, userId, "outfitPlan", primary.id, "update", primary.revision + 1, demoted);
      } else if (command.replaceExistingPrimary) {
        throw conflict("existing_primary_changed");
      }

      planId = randomUUID();
      const now = this.clock().toISOString();
      const byId = new Map(selectedRows.rows.map((row) => [row.id, row]));
      const roleById = new Map(selection.map((entry) => [entry.garment.id, entry.role]));
      const garmentSnapshots = command.selectedGarmentIds.map((garmentId) => {
        const row = byId.get(garmentId)!; const payload = row.payload ?? {};
        const asset = bindingRows.rows.find((binding) => binding.owner_entity_id === garmentId && ["primaryImage", "image", "cover"].includes(binding.field_name));
        return { garmentId, ...(Number.isInteger(payload.legacyItemId) ? { legacyItemId: payload.legacyItemId } : {}), name: String(payload.name ?? "未命名衣物").slice(0, 120), role: roleById.get(garmentId)!, category: selection.find((entry) => entry.garment.id === garmentId)!.garment.category!, ...(asset?.asset_id ? { imageAssetId: asset.asset_id } : {}) };
      });
      const originalIds = candidate.garmentIds as string[];
      const sourceVariant = sameSet(originalIds, command.selectedGarmentIds) ? "original" : "item_replaced";
      const payload = RecommendationPlanPayloadSchema.parse({
        sourceType: "daily_recommendation", date, garmentIds: command.selectedGarmentIds,
        itemIds: garmentSnapshots.flatMap((snapshot) => snapshot.legacyItemId === undefined ? [] : [snapshot.legacyItemId]),
        recommendationId: rec.id, recommendationRevision: rec.revision, recommendationCandidateId: candidate.candidateId,
        recommendationInputFingerprint: rec.input_fingerprint, algorithmVersion: rec.algorithm_version, sourceVariant, originalGarmentIds: originalIds,
        garmentSnapshots, recommendationSnapshot: { candidateId: candidate.candidateId, ...(candidate.objective ? { objective: candidate.objective } : {}), ...(typeof candidate.finalScore === "number" ? { finalScore: candidate.finalScore } : {}), reasonCodes: candidate.reasonCodes ?? [], riskCodes: [...(candidate.deterministicRiskAssessment?.blockingCodes ?? []), ...(candidate.deterministicRiskAssessment?.warningCodes ?? []), ...(candidate.deterministicRiskAssessment?.advisoryCodes ?? [])] },
        snapshotVersion: 1, selectedAt: now, status: "planned", isPrimary: true, role: "primary",
      });
      await client.query("insert into outfit_plans(id,user_id,revision,origin_device_id,payload,plan_date,created_at,updated_at) values($1,$2,1,$3,$4::jsonb,$5,$6,$6)", [planId, userId, deviceId, JSON.stringify(payload), date, now]);
      await this.fault?.("afterPlan");
      for (const snapshot of garmentSnapshots) if (snapshot.imageAssetId) {
        await client.query("insert into asset_bindings(user_id,asset_id,owner_entity_type,owner_entity_id,field_name,created_at,updated_at) values($1,$2,'outfitPlan',$3,$4,$5,$5)", [userId, snapshot.imageAssetId, planId, `garment:${snapshot.garmentId}:primaryImage`, now]);
      }
      await this.fault?.("afterBindings");
      await client.query("insert into recommendation_actions(user_id,recommendation_id,plan_entry_id,action,candidate_id,client_mutation_id,payload) values($1,$2,$3,$4,$5,$6,$7::jsonb)", [userId, rec.id, planId, sourceVariant === "original" ? "accepted" : "item_replaced", candidate.candidateId, command.clientMutationId, JSON.stringify({ recommendationRevision: rec.revision, originalGarmentIds: originalIds, selectedGarmentIds: command.selectedGarmentIds })]);
      await this.fault?.("afterAction");
      await appendChange(client, userId, "outfitPlan", planId, "create", 1, payload);
      const provisional = response(planId, payload, now, false);
      await client.query("insert into sync_mutations(user_id,mutation_id,entity_type,entity_id,operation,status,result_revision,payload,response_json) values($1,$2,'outfitPlan',$3,'create','accepted',1,$4::jsonb,$5::jsonb)", [userId, command.clientMutationId, planId, JSON.stringify({ acceptFingerprint: fingerprint, command }), JSON.stringify(provisional)]);
      await this.fault?.("beforeCommit");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
    return this.readCommittedPlan(userId, planId, replay);
  }

  private async readCommittedPlan(userId: string, planId: string, replay: boolean): Promise<AcceptRecommendationResponse> {
    const result = await this.pool.query("select id,revision,payload,created_at,updated_at from outfit_plans where id=$1 and user_id=$2 and deleted_at is null", [planId, userId]);
    if (!result.rows[0]) throw new WorkspaceApiError(500, "server", "计划提交后读回失败");
    const row = result.rows[0];
    return AcceptRecommendationResponseSchema.parse({ status: "committed", idempotentReplay: replay, plan: { id: row.id, revision: row.revision, payload: row.payload, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() } });
  }

  private currentSelectionValidator(overview: WeatherOverviewService): SelectionValidator {
    const adapter = new RecommendationWorkspaceAdapter(this.pool);
    return async (userId, date, selectedIds, candidate) => {
      const current = await overview.get(userId, date);
      const workspace = await adapter.load(userId, date, shanghaiDate(this.clock()), "Asia/Shanghai");
      const input = RecommendationEngineInputV2Schema.parse({
        ...workspace.input,
        ruleVersion: current.contextMode === "forecast" ? RECOMMENDATION_FORECAST_RULE_VERSION : RECOMMENDATION_LOCATIONLESS_RULE_VERSION,
        resolvedContext: { targetDate: date, targetTimezone: current.targetTimezone, contextResolvedAt: current.contextResolvedAt, contextMode: current.contextMode, ...(current.resolvedLocation ? { resolvedLocation: current.resolvedLocation, locationSource: current.locationSource } : {}) },
        dateContextInput: { ...workspace.input.dateContextInput, weatherEvidence: current.weatherEvidence },
      });
      return validateRecommendationCandidateCurrent(input, candidate ?? {}, selectedIds);
    };
  }
}

function validateReplacement(candidate: any, selectedIds: readonly string[], selection: Selection[]) {
  const original = candidate.garmentIds as string[];
  const removed = original.filter((id) => !selectedIds.includes(id)); const added = selectedIds.filter((id) => !original.includes(id));
  if (removed.length > 1 || added.length > 1 || removed.length !== added.length) throw conflict("recommendation_no_longer_valid");
  const roles = selection.map((entry) => entry.role).sort(); const expected = [...(TEMPLATE_SLOTS[candidate.template] ?? [])].sort();
  if (JSON.stringify(roles) !== JSON.stringify(expected)) throw conflict("recommendation_no_longer_valid");
}
async function appendChange(client: PoolClient, userId: string, entityType: string, entityId: string, operation: string, revision: number, payload: unknown) {
  await client.query("select pg_advisory_xact_lock(hashtext($1))", [`workspace-seq:${userId}`]);
  await client.query("insert into sync_changes(user_id,change_seq,entity_type,entity_id,operation,revision,payload) select $1,coalesce(max(change_seq),0)+1,$2,$3,$4,$5,$6::jsonb from sync_changes where user_id=$1", [userId, entityType, entityId, operation, revision, JSON.stringify(payload)]);
}
function response(id: string, payload: unknown, now: string, replay: boolean): AcceptRecommendationResponse { return AcceptRecommendationResponseSchema.parse({ status: "committed", idempotentReplay: replay, plan: { id, revision: 1, payload, createdAt: now, updatedAt: now } }); }
function conflict(code: string) { return new WorkspaceApiError(409, "conflict", code, false, { reasonCode: code }); }
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function sameSet(a: readonly string[], b: readonly string[]) { return a.length === b.length && a.every((value) => b.includes(value)); }
function sameStrings(value: unknown, expected: readonly string[]) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const from = (item: unknown) => Array.isArray(item) ? item.filter((entry): entry is string => typeof entry === "string") : typeof item === "string" ? item.split(/[,，、]/).map((entry) => entry.trim()).filter(Boolean) : [];
  const actual = Array.isArray(value) || typeof value === "string" ? from(value) : record.mode === "single" ? from(record.primary) : record.mode === "main_with_accent" ? [...from(record.primary), ...from(record.accents)] : record.mode === "multicolor" ? from(record.primaries) : [];
  return JSON.stringify([...new Set(actual)].sort()) === JSON.stringify([...new Set(expected)].sort());
}
function shanghaiDate(date: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
