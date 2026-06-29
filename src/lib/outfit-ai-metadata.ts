// src/lib/outfit-ai-metadata.ts
// v1.0套装基础信息生成 (与 generateOutfitAiSuggestionOnDevice独立):
// - 输入: 已选衣物的结构化字段 +套装名称候选
// - 输出: name / seasons / sceneTags / styleTags / pairingTags / temperatureRange / notes
// - 不写数据库; 仅给 OutfitIntakeFlow / 编辑页 "重新使用 AI 生成信息" 回填表单
// - 不发送衣物图片, 只发送结构化字段
// -风格标签强制中文,内部不混英文枚举

import type { GarmentStyle, SavedOutfit, Season, WardrobeItem } from "@/lib/types";
import { CATEGORY_LABELS, SEASON_LABELS, STYLE_LABELS } from "@/lib/types";
import { createIntakeField, type OutfitIntakeDraft } from "@/lib/intake-draft";
import { getAllColors } from "@/lib/color-fields";
import { normalizeTemperatureRange } from "@/lib/temperature-range";

export interface OutfitMetadataDraft {
 name?: string;
 seasons?: Season[];
 sceneTags?: string[];
 styleTags?: string[];
 pairingTags?: string[];
 temperatureRange?: { minC?: number; maxC?: number };
 notes?: string;
}

export interface OutfitMetadataGenerationInput {
 /** 已选衣物的数字 id列表 */
 itemIds: number[];
 /** 当前草稿的套装名称 (可选,供 AI 参考或保留) */
 name?: string;
}

export interface BuildOutfitMetadataPromptInput extends OutfitMetadataGenerationInput {
 outfitItems: WardrobeItem[];
 allItems: WardrobeItem[];
}

const SEASON_VALUES: Season[] = ["spring", "summer", "autumn", "winter", "all"];
const STYLE_VALUES: GarmentStyle[] = ["casual", "sweet", "elegant", "commute", "outdoor", "dinner", "vacation"];
const MAX_NAME_LEN =30;
const MAX_TAG_LEN =12;
const MAX_NOTES_LEN =90;
const MAX_SCENE_TAGS =5;
const MAX_STYLE_TAGS =5;
const MAX_PAIRING_TAGS =6;

/** 系统 prompt:强调中文标签 + 不输出英文枚举 + 输出严格 JSON。 */
export function buildOutfitMetadataSystemPrompt(): string {
 return [
 "你是衣橱 App 的套装基础信息助手, 只负责为一套已有衣物生成可展示给用户的基础元数据。",
 "你只能基于输入衣物库中真实存在的字段做判断,不得编造 itemId、衣物名称、品牌、目的地或场景。",
 "输出必须用中文:风格标签(sceneTags/styleTags/pairingTags)必须是中文短词, 不要输出 casual/commute/outdoor 等英文枚举。",
 "seasons必须是 spring/summer/autumn/winter/all 的英文枚举(因为这是系统枚举), 不要输出汉字季节。",
 "notes输出一句中文搭配说明, 不要超过90 字, 不要营销腔, 不要硬编码地名。",
 "看不清或无依据时, 对应数组留空或返回空字符串, 不要硬编。",
 "输出必须是严格 JSON, 不要 Markdown, 不要代码块, 不要 JSON外的解释文字。",
 ].join("\n");
}

/** 用户 prompt: 把结构化衣物字段 + 白名单 + 输出 schema拼接。 */
export function buildOutfitMetadataPrompt(input: BuildOutfitMetadataPromptInput): string {
 const { outfitItems, name } = input;
 const outfitItemIds = outfitItems.map((item) => item.id).filter((id): id is number => typeof id === "number");

 return [
 "请为下面这套已选衣物生成套装基础信息, 用于衣橱 App套装卡片展示。",
 "",
 "【已有套装名称 (供参考, 不强制)】",
 name ? `name = ${name}` : "name = 未填写, 请根据组成生成一个简洁中文名称",
 "",
 "【套装内真实衣物】",
 outfitItems.length >0 ? outfitItems.map(formatMetadataItemForPrompt).join("\n") : "暂无可用衣物",
 "",
 "【白名单】",
 `itemIds (套装内, 仅做参考): ${outfitItemIds.join("、") || "无"}`,
 `seasons只能使用: ${SEASON_VALUES.join(" | ")}`,
 "",
 "【输出 JSON Schema】",
 JSON.stringify({
 name: "中文套装名称, 不超过30字",
 seasons: ["spring|summer|autumn|winter|all"],
 sceneTags: ["中文短词, 不超过12字,最多5个"],
 styleTags: ["中文短词, 不超过12字,最多5个"],
 pairingTags: ["中文短词, 不超过12字,最多6个"],
 temperatureRange: { minC:0, maxC:30 },
 notes: "一句中文搭配说明, 不超过90字",
 }, null,2),
 "",
 "判断规则:",
 "1.名称: 基于主要单品 (首件/外套/连衣裙) 生成, 例如「短袖衬衫等2件」「蓝白通勤套装」; 不要超过30字。",
 "2. seasons:聚合各衣物的 seasons, 全空时使用 all;多个时按春夏秋冬顺序输出。",
 "3. styleTags: 把单品的 styles 从英文枚举映射成中文标签, 例如 casual→休闲, commute→通勤, outdoor→户外; 不要输出英文枚举。",
 "4. sceneTags: 基于 styleTags 和单品类别推断中文场景, 例如:通勤 /周末出行 /旅行 /约会 /户外 /居家 /运动; 不要硬编码地名。",
 "5. pairingTags:给出0-6 个穿搭效果标签, 例如显高 /显瘦 /学院风 /复古 / 清爽。",
 "6. temperatureRange:聚合各衣物的 temperatureRange; 若全部缺失则根据 seasons 给保守范围 (春夏18-30 /秋冬5-22 /四季10-28)。",
 "7. notes: 一句中文搭配说明, 例如「适合春夏日常出行,整体偏休闲,建议搭配轻便鞋包。」; 不要营销腔。",
 ].join("\n");
}

/**解析 AI 返回的 JSON, 容错提取第一个 JSON 对象。 */
export function parseOutfitMetadataJson(text: string): unknown {
 try {
 return JSON.parse(text);
 } catch {
 const json = extractFirstJsonObject(text);
 if (!json) throw new Error("AI 返回不是合法 JSON");
 return JSON.parse(json);
 }
}

/** 把 AI原始输出清洗成 OutfitMetadataDraft,严格白名单过滤 +英文枚举转中文。 */
export function sanitizeOutfitMetadata(
 raw: unknown,
 input: { currentName?: string },
): OutfitMetadataDraft {
 const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
 const name = sanitizeString(obj.name, input.currentName?.trim() ?? "", MAX_NAME_LEN);
 const seasons = sanitizeSeasonArray(obj.seasons);
 const sceneTags = sanitizeChineseTagArray(obj.sceneTags, MAX_SCENE_TAGS, MAX_TAG_LEN);
 const styleTags = sanitizeChineseTagArray(obj.styleTags, MAX_STYLE_TAGS, MAX_TAG_LEN, { englishGarmentStyleValues: STYLE_VALUES });
 const pairingTags = sanitizeChineseTagArray(obj.pairingTags, MAX_PAIRING_TAGS, MAX_TAG_LEN);
 const temperatureRange = normalizeTemperatureRange(obj.temperatureRange);
 const notes = sanitizeString(obj.notes, "", MAX_NOTES_LEN);

 return {
 ...(name ? { name } : {}),
 ...(seasons.length >0 ? { seasons } : {}),
 ...(sceneTags.length >0 ? { sceneTags } : {}),
 ...(styleTags.length >0 ? { styleTags } : {}),
 ...(pairingTags.length >0 ? { pairingTags } : {}),
 ...(temperatureRange ? { temperatureRange } : {}),
 ...(notes ? { notes } : {}),
 };
}

/** 把 OutfitMetadataDraft字段 merge 回 OutfitIntakeDraft 的对应字段,保留 source/confidence标记。 */
export function mergeOutfitMetadataIntoDraft(
 draft: OutfitIntakeDraft,
 meta: OutfitMetadataDraft,
 source: "ai" | "local",
): OutfitIntakeDraft {
 const now = new Date().toISOString();
 return {
 ...draft,
 ...(meta.name ? { name: createIntakeField(meta.name, source, "medium") } : {}),
 ...(meta.seasons ? { seasons: createIntakeField(meta.seasons, source, "medium") } : {}),
 ...(meta.sceneTags ? { sceneTags: createIntakeField(meta.sceneTags, source, "medium") } : {}),
 ...(meta.styleTags ? { styleTags: createIntakeField(meta.styleTags, source, "medium") } : {}),
 ...(meta.pairingTags ? { pairingTags: createIntakeField(meta.pairingTags, source, "medium") } : {}),
 ...(meta.temperatureRange ? {
 temperatureRange: createIntakeField(meta.temperatureRange, source, "medium"),
 } : {}),
 ...(meta.notes ? { notes: createIntakeField(meta.notes, source, "medium") } : {}),
 updatedAt: now,
 };
}

// ───内部 helpers ─────────────────────────────────────────

function formatMetadataItemForPrompt(item: WardrobeItem): string {
 const colors = getAllColors(item.colors).join("、") || "未填写";
 const seasons = (item.seasons ?? []).map((s) => SEASON_LABELS[s] ?? s).join("、") || "未填写";
 const styles = (item.styles ?? []).map(labelGarmentStyle).filter(Boolean).join("、") || "未填写";
 const scenes = styles;
 const temp = item.temperatureRange
 ? `${item.temperatureRange.minC ?? "?"}-${item.temperatureRange.maxC ?? "?"}℃`
 : "未填写";
 return [
 `- itemId=${item.id ?? "未知"}, ${item.name}`,
 `分类: ${CATEGORY_LABELS[item.category] ?? item.category}${item.subcategory ? ` / ${item.subcategory}` : ""}`,
 `颜色: ${colors}`,
 `季节: ${seasons}`,
 `风格: ${styles}`,
 `场景: ${scenes}`,
 `适穿温度: ${temp}`,
 ].join("\n");
}

function sanitizeString(value: unknown, fallback: string, maxLen: number): string {
 if (typeof value === "string" && value.trim()) {
 return value.trim().slice(0, maxLen);
 }
 return fallback;
}

function sanitizeSeasonArray(value: unknown): Season[] {
 if (!Array.isArray(value)) return [];
 const result: Season[] = [];
 const order: Season[] = ["spring", "summer", "autumn", "winter", "all"];
 for (const entry of value) {
 if (typeof entry !== "string") continue;
 if (SEASON_VALUES.includes(entry as Season) && !result.includes(entry as Season)) {
 result.push(entry as Season);
 }
 }
 return result.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function sanitizeChineseTagArray(
 value: unknown,
 maxItems: number,
 maxLen: number,
 options: { englishGarmentStyleValues?: readonly string[] } = {},
): string[] {
 if (!Array.isArray(value)) return [];
 const result: string[] = [];
 for (const entry of value) {
 if (typeof entry !== "string") continue;
 let clean = entry.trim().slice(0, maxLen);
 if (!clean) continue;
 if (options.englishGarmentStyleValues?.includes(clean)) {
 clean = STYLE_LABELS[clean as GarmentStyle] ?? clean;
 }
 if (!result.includes(clean)) result.push(clean);
 if (result.length >= maxItems) break;
 }
 return result;
}

function extractFirstJsonObject(text: string): string | null {
 const start = text.indexOf("{");
 const end = text.lastIndexOf("}");
 if (start <0 || end <= start) return null;
 return text.slice(start, end +1);
}

/** 把英文枚举 GarmentStyle映射成中文标签; 非枚举值原样返回(供场景/搭配标签使用)。 */
export function labelGarmentStyle(tag: string | GarmentStyle): string {
 const value = tag?.trim();
 if (!value) return "";
 return STYLE_LABELS[value as GarmentStyle] ?? value;
}

/** 本地规则兜底: 不调 MiniMax, 仅用本地聚合生成 OutfitMetadataDraft。 */
export function buildLocalOutfitMetadataFromItems(input: {
 outfitItems: WardrobeItem[];
 currentName?: string;
}): OutfitMetadataDraft {
 const items = input.outfitItems;
 if (items.length ===0) return {};
 const seasons = aggregateSeasons(items);
 const styleTags = aggregateStylesAsChinese(items);
 const sceneTags = inferScenesFromStyles(styleTags);
 const pairingTags = aggregatePairingTags(items);
 const temperatureRange = aggregateTemperature(items);
 const notes = buildLocalNotes(items);
 const name = input.currentName?.trim() || buildLocalName(items);
 return {
 name,
 seasons,
 styleTags,
 sceneTags,
 pairingTags: pairingTags.length >0 ? pairingTags : undefined,
 temperatureRange,
 notes,
 };
}

function buildLocalName(items: WardrobeItem[]): string {
 if (items.length ===1) return `${items[0]!.name}套装`;
 return `${items[0]!.name}等${items.length}件`;
}

function aggregateSeasons(items: WardrobeItem[]): Season[] | undefined {
 const counts = new Map<Season, number>();
 for (const item of items) {
 for (const s of item.seasons ?? []) {
 if (SEASON_VALUES.includes(s as Season)) {
 counts.set(s as Season, (counts.get(s as Season) ??0) +1);
 }
 }
 }
 if (counts.size ===0) return ["all"];
 const order: Season[] = ["spring", "summer", "autumn", "winter", "all"];
 return Array.from(counts.entries())
 .sort((a, b) => b[1] - a[1])
 .map(([s]) => s)
 .sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function aggregateStylesAsChinese(items: WardrobeItem[]): string[] | undefined {
 const set = new Set<string>();
 for (const item of items) {
 for (const s of item.styles ?? []) {
 const label = labelGarmentStyle(s);
 if (label) set.add(label);
 }
 }
 return set.size >0 ? Array.from(set).slice(0, MAX_STYLE_TAGS) : undefined;
}

function inferScenesFromStyles(styleTags: string[] | undefined): string[] | undefined {
 if (!styleTags || styleTags.length ===0) return ["日常"];
 const map: Record<string, string[]> = {
休闲: ["日常", "周末出行"],
通勤: ["通勤", "办公"],
户外: ["户外", "郊游"],
旅行: ["旅行", "度假"],
吃饭: ["聚餐", "朋友聚会"],
甜美: ["约会", "逛街"],
优雅: ["约会", "正式场合"],
 };
 const scenes = new Set<string>();
 for (const tag of styleTags) {
 for (const scene of map[tag] ?? []) scenes.add(scene);
 }
 if (scenes.size ===0) return ["日常"];
 return Array.from(scenes).slice(0, MAX_SCENE_TAGS);
}

function aggregatePairingTags(items: WardrobeItem[]): string[] {
 const set = new Set<string>();
 for (const item of items) {
 for (const tag of item.styles ?? []) {
 const clean = labelGarmentStyle(tag).trim();
 if (!clean) continue;
 if (clean.length <= MAX_TAG_LEN) set.add(clean);
 }
 }
 return Array.from(set).slice(0, MAX_PAIRING_TAGS);
}

function aggregateTemperature(items: WardrobeItem[]): { minC?: number; maxC?: number } | undefined {
 const mins: number[] = [];
 const maxs: number[] = [];
 for (const item of items) {
 const range = item.temperatureRange;
 if (!range) continue;
 if (typeof range.minC === "number" && Number.isFinite(range.minC)) mins.push(range.minC);
 if (typeof range.maxC === "number" && Number.isFinite(range.maxC)) maxs.push(range.maxC);
 }
 if (mins.length ===0 && maxs.length ===0) return undefined;
 return normalizeTemperatureRange({
 ...(mins.length ? { minC: Math.max(...mins) } : {}),
 ...(maxs.length ? { maxC: Math.min(...maxs) } : {}),
 });
}

function buildLocalNotes(items: WardrobeItem[]): string {
 const styles = aggregateStylesAsChinese(items)?.slice(0,2).join("、") || "日常";
 const seasons = aggregateSeasons(items)?.map((s) => SEASON_LABELS[s] ?? s).slice(0,2).join("") || "四季";
 const paletteHint = items.length >1 ? "整体偏" + styles + ",建议搭配轻便鞋包。" : "可作为基础单品与其他衣物组合。";
 return `适合${seasons}${styles}出行, ${paletteHint}`.slice(0, MAX_NOTES_LEN);
}

// ───工厂函数: 把本地规则生成的 metadata喂给 intake draft字段 ─────────────

export interface BuildLocalMetadataPatchInput {
 draft: OutfitIntakeDraft;
 outfitItems: WardrobeItem[];
 currentName?: string;
}

/** 给 OutfitIntakeDraft 打补丁 (本地规则, source = "local"), 不直接入库。 */
export function buildLocalMetadataPatch(input: BuildLocalMetadataPatchInput): OutfitMetadataDraft {
 return buildLocalOutfitMetadataFromItems({
 outfitItems: input.outfitItems,
 currentName: input.currentName ?? input.draft.name.value,
 });
}

/** 检查 SavedOutfit 的元数据是否完整, 给 OutfitListView列表卡用 (例如显示"补全信息"标记)。 */
export function isOutfitMetadataComplete(outfit: SavedOutfit): boolean {
 return Boolean(outfit.name?.trim()) && (outfit.itemIds?.length ??0) >0;
}
