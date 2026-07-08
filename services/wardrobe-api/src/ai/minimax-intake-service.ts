import {
  AiGarmentRecognitionResponseSchema,
  AiOutfitMetadataResponseSchema,
  type AiColorInfo,
  type AiGarmentRecognitionRequest,
  type AiGarmentRecognitionResponse,
  type AiGarmentTag,
  type AiOutfitMetadataRequest,
  type AiOutfitMetadataResponse,
  type MiniMaxRuntimeSettings,
} from "@wardrobe/cloud-contracts";

import { WorkspaceApiError } from "../workspace/errors.js";

export interface MiniMaxIntakeServiceLike {
  recognizeGarment(input: AiGarmentRecognitionRequest): Promise<AiGarmentRecognitionResponse>;
  generateOutfitMetadata(input: AiOutfitMetadataRequest): Promise<AiOutfitMetadataResponse>;
}

interface MiniMaxResponse {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  base_resp?: { status_code?: number; status_msg?: string };
  error?: { message?: string };
}

const SEASONS = ["spring", "summer", "autumn", "winter", "all"] as const;
const STYLES = ["casual", "sweet", "elegant", "commute", "outdoor", "dinner", "vacation"] as const;
const CATEGORIES = ["tops", "pants", "skirts", "one_piece", "shoes", "bags", "hats", "jewelry", "accessories"] as const;
const FIT_GENDERS = ["menswear", "womenswear", "unisex", "unknown"] as const;

export class MiniMaxIntakeService implements MiniMaxIntakeServiceLike {
  async recognizeGarment(input: AiGarmentRecognitionRequest): Promise<AiGarmentRecognitionResponse> {
    const content = await chat(input.miniMax, [
      { role: "system", name: "System", content: "你是衣橱 App 的 M3 多模态衣物识别助手，只输出可解析 JSON。" },
      {
        role: "user",
        name: "User",
        content: [
          { type: "text", text: buildGarmentPrompt(input.fallbackName) },
          { type: "image_url", image_url: { url: input.imageDataUrl } },
        ],
      },
    ], 0.1, 900);
    const tag = normalizeGarmentTag(parseJsonObject(content), input.fallbackName);
    return AiGarmentRecognitionResponseSchema.parse({ tag });
  }

  async generateOutfitMetadata(input: AiOutfitMetadataRequest): Promise<AiOutfitMetadataResponse> {
    const content = await chat(input.miniMax, [
      { role: "system", name: "System", content: buildOutfitSystemPrompt() },
      { role: "user", name: "User", content: buildOutfitPrompt(input) },
    ], 0.35, 800);
    const metadata = sanitizeOutfitMetadata(parseJsonObject(content), input.name);
    return AiOutfitMetadataResponseSchema.parse(metadata);
  }
}

async function chat(settings: MiniMaxRuntimeSettings, messages: unknown[], temperature: number, maxTokens: number): Promise<string> {
  if (!settings.apiKey.trim()) throw new WorkspaceApiError(400, "invalid_request", "未填写 MiniMax Key");
  const response = await postMiniMax<MiniMaxResponse>(`${settings.apiHost.replace(/\/$/, "")}/v1/chat/completions`, settings, {
    model: settings.model || "MiniMax-M3",
    messages,
    temperature,
    max_completion_tokens: maxTokens,
    stream: false,
  });
  const content = extractMiniMaxContent(response);
  if (response.base_resp?.status_code || response.error?.message || !content) {
    throw new WorkspaceApiError(502, "server", response.error?.message || response.base_resp?.status_msg || "MiniMax 调用失败", true);
  }
  return content;
}

async function postMiniMax<T>(url: string, settings: MiniMaxRuntimeSettings, data: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof body?.error?.message === "string" ? body.error.message : "MiniMax 服务返回错误";
      throw new WorkspaceApiError(response.status >= 500 ? 502 : 400, response.status >= 500 ? "server" : "invalid_request", message, response.status >= 500);
    }
    return body as T;
  } catch (error) {
    if (error instanceof WorkspaceApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new WorkspaceApiError(504, "server", "MiniMax 请求超时", true);
    throw new WorkspaceApiError(502, "server", "无法连接 MiniMax 服务", true);
  } finally {
    clearTimeout(timer);
  }
}

function buildGarmentPrompt(fallbackName: string): string {
  return [
    "请识别图片中的单件衣物或配饰。只输出严格 JSON，不要 Markdown，不要解释文字。",
    "不得把文件名当作衣物名称；文件名仅供排错参考：" + fallbackName,
    "candidateNames[0] 必须是具体中文衣物名称，不能是 garment、clothes、item、单品、衣物、衣服、服装。",
    "短裤/长裤必须按真实裤脚位置判断；工装裤按贴袋、多口袋、抽绳等功能结构判断。",
    "版型倾向不能按颜色刻板判断，优先看剪裁、品类、肩线、腰线、裤型、鞋型、包型和饰品风格。",
    "字段必须符合：",
    JSON.stringify({
      candidateNames: ["中文名称，1-3个候选"],
      category: "tops|pants|skirts|one_piece|shoes|bags|hats|jewelry|accessories",
      subcategory: "可选，无法判断为空字符串",
      colors: { mode: "single|multicolor|main_with_accent", primary: "主色", primaries: ["拼色"], accents: ["辅色"] },
      seasons: ["spring|summer|autumn|winter|all"],
      styles: ["casual|sweet|elegant|commute|outdoor|dinner|vacation"],
      material: "中文材质观感，不确定为空字符串",
      temperatureRange: { minC: 10, maxC: 28 },
      formality: 3,
      warmth: 3,
      confidence: 0.8,
      needsReview: false,
      notes: "20到80字中文备注，只描述图片中可见信息",
      fitGender: "menswear|womenswear|unisex|unknown",
      fitNotes: "一句话说明判断原因",
    }),
  ].join("\n");
}

function buildOutfitSystemPrompt(): string {
  return [
    "你是衣橱 App 的套装基础信息助手，只负责为一套已有衣物生成可展示给用户的基础元数据。",
    "只能基于输入衣物字段判断，不得编造品牌、地点、价格或不存在的衣物。",
    "输出必须是严格 JSON，不要 Markdown，不要解释文字。",
  ].join("\n");
}

function buildOutfitPrompt(input: AiOutfitMetadataRequest): string {
  return [
    "请为下面这套已选衣物生成套装基础信息。",
    input.name ? `已有名称：${input.name}` : "已有名称：未填写，请生成一个简洁中文名称",
    "衣物：",
    ...input.outfitItems.map((item) => `- itemId=${item.id} ${item.name} 分类=${item.category}${item.subcategory ? "/" + item.subcategory : ""} 颜色=${JSON.stringify(item.colors ?? {})} 季节=${item.seasons.join("、") || "未填"} 风格=${item.styles.join("、") || "未填"} 温度=${JSON.stringify(item.temperatureRange ?? {})}`),
    "输出字段：name 不超过30字；seasons 只能 spring/summer/autumn/winter/all；sceneTags/styleTags/pairingTags 为中文短词；notes 不超过90字。",
  ].join("\n");
}

function extractMiniMaxContent(response: MiniMaxResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => part.text).filter(Boolean).join("\n");
  return "";
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    const json = extractFirstJsonObject(raw);
    if (!json) throw new WorkspaceApiError(502, "server", "MiniMax 返回不是合法 JSON", true);
    try {
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      throw new WorkspaceApiError(502, "server", "MiniMax 返回不是合法 JSON", true);
    }
  }
}

function extractFirstJsonObject(text: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") inString = true;
    else if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function normalizeGarmentTag(raw: Record<string, unknown>, fallbackName: string): AiGarmentTag {
  const tag: AiGarmentTag = {
    candidateNames: normalizeNames(raw.candidateNames, fallbackName),
    category: pick(raw.category, CATEGORIES, "tops"),
    subcategory: text(raw.subcategory, 40),
    colors: normalizeColors(raw.colors),
    seasons: normalizeList(raw.seasons, SEASONS, ["all"]),
    styles: normalizeList(raw.styles, STYLES, ["casual"]),
    temperatureRange: normalizeTemperature(raw.temperatureRange),
    material: text(raw.material, 24),
    formality: clampInt(raw.formality, 1, 5, 3),
    warmth: clampInt(raw.warmth, 1, 5, 3),
    confidence: clampNumber(raw.confidence, 0, 1, 0.5),
    needsReview: typeof raw.needsReview === "boolean" ? raw.needsReview : true,
    notes: text(raw.notes, 120),
    fitGender: pick(raw.fitGender, FIT_GENDERS, "unknown"),
    fitNotes: text(raw.fitNotes, 40),
  };
  return tag;
}

function sanitizeOutfitMetadata(raw: Record<string, unknown>, currentName?: string): AiOutfitMetadataResponse {
  return {
    name: text(raw.name, 30) || text(currentName, 30) || undefined,
    seasons: normalizeList(raw.seasons, SEASONS, ["all"]),
    sceneTags: shortTags(raw.sceneTags, 5),
    styleTags: shortTags(raw.styleTags, 5),
    pairingTags: shortTags(raw.pairingTags, 6),
    temperatureRange: normalizeTemperature(raw.temperatureRange),
    notes: text(raw.notes, 90) || undefined,
  };
}

function normalizeNames(value: unknown, fallbackName: string): string[] {
  const names = Array.isArray(value) ? value.map((item) => text(item, 16)).filter(Boolean) : [];
  const concrete = names.filter((name) => !/^(garment|clothes|clothing|item|product|apparel|outfit|wear|单品|衣物|衣服|新衣服|商品|服装)$/i.test(name));
  if (concrete.length > 0) return concrete.slice(0, 3);
  return [fallbackName.replace(/\.[a-z0-9]+$/i, "").slice(0, 12) || "待确认衣物"];
}

function normalizeColors(value: unknown): AiColorInfo {
  const obj = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const mode = obj.mode === "main_with_accent" || obj.mode === "multicolor" || obj.mode === "single" ? obj.mode : "single";
  if (mode === "multicolor") return { mode, primaries: shortTags(obj.primaries, 4).length ? shortTags(obj.primaries, 4) : ["混色"] };
  if (mode === "main_with_accent") return { mode, primary: text(obj.primary, 12) || "未知色", accents: shortTags(obj.accents, 4) };
  return { mode: "single", primary: text(obj.primary, 12) || "未知色" };
}

function normalizeTemperature(value: unknown): { minC?: number; maxC?: number } | undefined {
  const obj = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const minC = finiteNumber(obj.minC);
  const maxC = finiteNumber(obj.maxC);
  if (minC === undefined && maxC === undefined) return undefined;
  const range = { ...(minC === undefined ? {} : { minC: clampNumber(minC, -20, 40, minC) }), ...(maxC === undefined ? {} : { maxC: clampNumber(maxC, -20, 40, maxC) }) };
  if (range.minC !== undefined && range.maxC !== undefined && range.minC > range.maxC) return { minC: range.maxC, maxC: range.minC };
  return range;
}

function normalizeList<T extends readonly string[]>(value: unknown, allowed: T, fallback: Array<T[number]>): Array<T[number]> {
  const items = Array.isArray(value) ? value : [];
  const result = items.filter((item): item is T[number] => typeof item === "string" && (allowed as readonly string[]).includes(item));
  const unique = [...new Set(result)].slice(0, 6);
  return unique.length > 0 ? unique : fallback;
}

function shortTags(value: unknown, max: number): string[] {
  return (Array.isArray(value) ? value : []).map((item) => text(item, 12)).filter(Boolean).slice(0, max);
}

function pick<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T[number] : fallback;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNumber(value, min, max, fallback));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = finiteNumber(value) ?? fallback;
  return Math.min(max, Math.max(min, number));
}
