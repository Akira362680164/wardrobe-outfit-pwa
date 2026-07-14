import {
  AiGarmentRecognitionBatchResponseSchema,
  AiGarmentRecognitionResponseSchema,
  AiOutfitMetadataResponseSchema,
  type AiColorInfo,
  type AiEnhancementKind,
  type AiGarmentRecognitionBatchRequest,
  type AiGarmentRecognitionBatchResponse,
  type AiGarmentRecognitionRequest,
  type AiGarmentRecognitionResponse,
  type AiGarmentTag,
  type AiOutfitMetadataRequest,
  type AiOutfitMetadataResponse,
  type MiniMaxRuntimeSettings,
} from "@wardrobe/cloud-contracts";

import { WorkspaceApiError } from "../workspace/errors.js";

export interface MiniMaxIntakeServiceLike {
  recognizeGarment(
    input: AiGarmentRecognitionRequest,
  ): Promise<AiGarmentRecognitionResponse>;
  recognizeGarments(
    input: AiGarmentRecognitionBatchRequest,
  ): Promise<AiGarmentRecognitionBatchResponse>;
  generateOutfitMetadata(
    input: AiOutfitMetadataRequest,
  ): Promise<AiOutfitMetadataResponse>;
  enhance(
    kind: AiEnhancementKind,
    input: { miniMax: MiniMaxRuntimeSettings; input: Record<string, unknown> },
  ): Promise<unknown>;
  generateTryOn(input: {
    miniMax: MiniMaxRuntimeSettings;
    referenceImageDataUrl: string;
    garmentImageDataUrls: string[];
    prompt?: string;
  }): Promise<{ imageDataUrl: string }>;
}

interface MiniMaxResponse {
  choices?: Array<{
    message?: { content?: string | Array<{ text?: string }> };
  }>;
  base_resp?: { status_code?: number; status_msg?: string };
  error?: { message?: string };
}

const SEASONS = ["spring", "summer", "autumn", "winter", "all"] as const;
const STYLES = [
  "casual",
  "sweet",
  "elegant",
  "commute",
  "outdoor",
  "dinner",
  "vacation",
] as const;
const CATEGORIES = [
  "tops",
  "pants",
  "skirts",
  "one_piece",
  "shoes",
  "bags",
  "hats",
  "jewelry",
  "accessories",
] as const;
const FIT_GENDERS = ["menswear", "womenswear", "unisex", "unknown"] as const;
const GARMENT_RECOGNITION_BATCH_CONCURRENCY = 10;

export class MiniMaxIntakeService implements MiniMaxIntakeServiceLike {
  async recognizeGarment(
    input: AiGarmentRecognitionRequest,
  ): Promise<AiGarmentRecognitionResponse> {
    const content = await chat(
      input.miniMax,
      [
        {
          role: "system",
          name: "System",
          content: "你是衣橱 App 的 M3 多模态衣物识别助手，只输出可解析 JSON。",
        },
        {
          role: "user",
          name: "User",
          content: [
            { type: "text", text: buildGarmentPrompt(input.fallbackName) },
            { type: "image_url", image_url: { url: input.imageDataUrl } },
            { type: "image_url", image_url: { url: input.gridImageDataUrl } },
          ],
        },
      ],
      0.1,
      20_000,
    );
    const parsed = parseJsonObject(content);
    const tag = normalizeGarmentTag(
      parsed,
      input.fallbackName,
    );
    const crop = normalizeRecognitionCrop(parsed);
    return AiGarmentRecognitionResponseSchema.parse({ tag, ...crop });
  }

  async recognizeGarments(
    input: AiGarmentRecognitionBatchRequest,
  ): Promise<AiGarmentRecognitionBatchResponse> {
    const items = await runLimited(
      input.items,
      GARMENT_RECOGNITION_BATCH_CONCURRENCY,
      async (item) => {
        try {
          const response = await this.recognizeGarment({
            miniMax: input.miniMax,
            imageDataUrl: item.imageDataUrl,
            gridImageDataUrl: item.gridImageDataUrl,
            fallbackName: item.fallbackName,
          });
          return {
            clientItemId: item.clientItemId,
            status: "succeeded" as const,
            tag: response.tag,
            secondaryCropBox: response.secondaryCropBox,
            cropConfidence: response.cropConfidence,
            cropNeedsReview: response.cropNeedsReview,
          };
        } catch (error) {
          return {
            clientItemId: item.clientItemId,
            status: "failed" as const,
            error: recognitionErrorMessage(error),
          };
        }
      },
    );
    return AiGarmentRecognitionBatchResponseSchema.parse({ items });
  }

  async generateOutfitMetadata(
    input: AiOutfitMetadataRequest,
  ): Promise<AiOutfitMetadataResponse> {
    const content = await chat(
      input.miniMax,
      [
        { role: "system", name: "System", content: buildOutfitSystemPrompt() },
        { role: "user", name: "User", content: buildOutfitPrompt(input) },
      ],
      0.35,
      800,
    );
    const metadata = sanitizeOutfitMetadata(
      parseJsonObject(content),
      input.name,
    );
    return AiOutfitMetadataResponseSchema.parse(metadata);
  }

  async enhance(
    kind: AiEnhancementKind,
    request: {
      miniMax: MiniMaxRuntimeSettings;
      input: Record<string, unknown>;
    },
  ): Promise<unknown> {
    switch (kind) {
      case "garment-style-advice":
        return generateGarmentStyleAdvice(request.miniMax, request.input);
      case "wardrobe-diagnosis":
        return generateWardrobeDiagnosis(request.miniMax, request.input);
      case "wishlist-assessment":
        return generateWishlistAssessment(request.miniMax, request.input);
      case "outfit-ai-suggestion":
        return generateOutfitAiSuggestion(request.miniMax, request.input);
      case "outfit-recommendation":
        return generateOutfitRecommendation(request.miniMax, request.input);
    }
  }

  async generateTryOn(input: {
    miniMax: MiniMaxRuntimeSettings;
    referenceImageDataUrl: string;
    garmentImageDataUrls: string[];
    prompt?: string;
  }): Promise<{ imageDataUrl: string }> {
    const garmentDescription = await describeTryOnGarments(
      input.miniMax,
      input.garmentImageDataUrls,
    );
    const response = await postMiniMax<{
      data?: { image_base64?: string[]; image_urls?: string[] };
      base_resp?: { status_code?: number; status_msg?: string };
    }>(
      `${input.miniMax.apiHost.replace(/\/$/, "")}/v1/image_generation`,
      input.miniMax,
      {
        model: "image-01",
        prompt: [
          "生成写实服装试穿预览。严格保持参考人物身份、脸部、发型、体型与姿态自然，把下述衣物合理穿到人物身上。不要增加文字、水印或额外人物。",
          `衣物描述：${garmentDescription}`,
          input.prompt || "",
        ]
          .filter(Boolean)
          .join("\n"),
        subject_reference: [
          { type: "character", image_file: input.referenceImageDataUrl },
        ],
        aspect_ratio: "3:4",
        response_format: "base64",
      },
    );
    const base64 = response.data?.image_base64?.[0];
    const url = response.data?.image_urls?.[0];
    if (response.base_resp?.status_code || (!base64 && !url))
      throw new WorkspaceApiError(
        502,
        "server",
        response.base_resp?.status_msg || "MiniMax 未返回试穿图片",
        true,
      );
    return { imageDataUrl: base64 ? `data:image/jpeg;base64,${base64}` : url! };
  }
}

async function describeTryOnGarments(
  miniMax: MiniMaxRuntimeSettings,
  garmentImageDataUrls: string[],
): Promise<string> {
  const content = await chat(
    miniMax,
    [
      {
        role: "system",
        name: "System",
        content:
          "你是服装视觉分析助手。逐张识别用户选择的衣物，只输出一段精确、简短、可用于图像生成的中文服装描述。不要描述人物、背景或图片质量。",
      },
      {
        role: "user",
        name: "User",
        content: [
          { type: "text", text: "描述这些要试穿的衣物：" },
          ...garmentImageDataUrls.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
        ],
      },
    ],
    0.1,
    500,
  );
  const description = content.trim().slice(0, 1200);
  if (!description) {
    throw new WorkspaceApiError(
      502,
      "server",
      "MiniMax 未能识别所选衣物",
      true,
    );
  }
  return description;
}

async function runLimited<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await task(items[currentIndex]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

function recognitionErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message.slice(0, 500)
    : "识别失败，请重试";
}

async function chat(
  settings: MiniMaxRuntimeSettings,
  messages: unknown[],
  temperature: number,
  maxTokens: number,
): Promise<string> {
  if (!settings.apiKey.trim())
    throw new WorkspaceApiError(400, "invalid_request", "未填写 MiniMax Key");
  const response = await postMiniMax<MiniMaxResponse>(
    `${settings.apiHost.replace(/\/$/, "")}/v1/chat/completions`,
    settings,
    {
      model: settings.model || "MiniMax-M3",
      messages,
      temperature,
      max_completion_tokens: maxTokens,
      stream: false,
    },
  );
  const content = extractMiniMaxContent(response);
  if (response.base_resp?.status_code || response.error?.message || !content) {
    throw new WorkspaceApiError(
      502,
      "server",
      response.error?.message ||
        response.base_resp?.status_msg ||
        "MiniMax 调用失败",
      true,
    );
  }
  return content;
}

async function chatJson(
  settings: MiniMaxRuntimeSettings,
  system: string,
  prompt: string,
  temperature = 0.3,
  maxTokens = 1200,
): Promise<Record<string, unknown>> {
  const content = await chat(
    settings,
    [
      { role: "system", name: "System", content: system },
      { role: "user", name: "User", content: prompt },
    ],
    temperature,
    maxTokens,
  );
  return parseJsonObject(content);
}

async function generateWardrobeDiagnosis(
  settings: MiniMaxRuntimeSettings,
  input: Record<string, unknown>,
) {
  const raw = await chatJson(
    settings,
    "你是衣橱诊断助手，只输出合法 JSON。",
    [
      "基于衣物、套装、位置输出克制、可执行的诊断，不鼓励无意义消费。",
      "输出：{summary,duplicates,gaps,idleItems,reusableOutfits,purchaseSuggestions}",
      `input=${JSON.stringify(input).slice(0, 18000)}`,
    ].join("\n"),
    0.25,
    1600,
  );
  return {
    summary: text(raw.summary, 120) || "衣橱诊断已生成",
    duplicates: diagnosisIssues(raw.duplicates),
    gaps: diagnosisIssues(raw.gaps),
    idleItems: diagnosisIssues(raw.idleItems),
    reusableOutfits: diagnosisIssues(raw.reusableOutfits),
    purchaseSuggestions: stringList(raw.purchaseSuggestions, 5),
    updatedAt: new Date().toISOString(),
  };
}

async function generateGarmentStyleAdvice(
  settings: MiniMaxRuntimeSettings,
  input: Record<string, unknown>,
) {
  const raw = await chatJson(
    settings,
    "你是衣橱单品穿搭建议助手，只输出合法 JSON。",
    [
      "基于单件衣物和相关套装/搭配单品，输出可展示的穿搭建议。",
      "输出：{summary:string,scenes:string[],pairingTips:string[],avoidTips:string[]}",
      `input=${JSON.stringify(input).slice(0, 12000)}`,
    ].join("\n"),
    0.6,
    800,
  );
  return {
    summary: text(raw.summary, 60) || "已生成穿搭建议",
    scenes: stringList(raw.scenes, 3),
    pairingTips: stringList(raw.pairingTips, 3).map((item) =>
      item.slice(0, 40),
    ),
    avoidTips: stringList(raw.avoidTips, 2).map((item) => item.slice(0, 40)),
    generatedAt: new Date().toISOString(),
  };
}

async function generateWishlistAssessment(
  settings: MiniMaxRuntimeSettings,
  input: Record<string, unknown>,
) {
  return chatJson(
    settings,
    "你是种草单品买前评估助手，只输出合法 JSON。",
    [
      "结合本地规则评估和现有衣橱，输出 WishlistAssessment JSON。建议保守，不鼓励无意义消费。",
      "输出字段：score,verdict,summary,matchReasons,conflictReasons,similarOwnedItemIds,suggestedOutfits,missingItems。",
      `input=${JSON.stringify(input).slice(0, 18000)}`,
    ].join("\n"),
    0.4,
    1200,
  );
}

async function generateOutfitAiSuggestion(
  settings: MiniMaxRuntimeSettings,
  input: Record<string, unknown>,
) {
  const raw = await chatJson(
    settings,
    "你是套装使用建议助手，只输出合法 JSON。",
    [
      "基于真实套装衣物和可替换候选，输出套装 AI 建议。",
      "输出：{summary,suitableScenes,unsuitableScenes,strengths,risks,replacementSuggestions,missingItems}",
      `input=${JSON.stringify(input).slice(0, 18000)}`,
    ].join("\n"),
    0.35,
    1200,
  );
  return {
    summary: text(raw.summary, 120) || "已根据这套装的真实衣物生成使用建议。",
    suitableScenes: stringList(raw.suitableScenes, 5),
    unsuitableScenes: stringList(raw.unsuitableScenes, 5),
    strengths: stringList(raw.strengths, 5),
    risks: stringList(raw.risks, 5),
    replacementSuggestions: Array.isArray(raw.replacementSuggestions)
      ? raw.replacementSuggestions
      : [],
    missingItems: stringList(raw.missingItems, 5),
    generatedAt: new Date().toISOString(),
    source: "ai",
  };
}

async function generateOutfitRecommendation(
  settings: MiniMaxRuntimeSettings,
  input: Record<string, unknown>,
) {
  const raw = await chatJson(
    settings,
    "你是衣橱场景穿搭推荐助手，只输出合法 JSON。不得索取或依赖衣物图片，只能使用输入的结构化衣物字段。",
    [
      "结合目的地、天气、温度、活动、时间、季节、正式程度和用户偏好，从输入衣物 ID 中组合 1-3 套推荐。",
      "输出：{summary,recommendedOutfits:[{title,itemIds,reason,sceneTips}],warnings}",
      `input=${JSON.stringify(input).slice(0, 22000)}`,
    ].join("\n"),
    0.4,
    1500,
  );
  const allowedIds = new Set(
    (Array.isArray(input.items) ? input.items : []).flatMap((item) =>
      item && typeof item === "object" && typeof (item as any).id === "string"
        ? [(item as any).id]
        : [],
    ),
  );
  const recommendedOutfits = (
    Array.isArray(raw.recommendedOutfits) ? raw.recommendedOutfits : []
  )
    .slice(0, 3)
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const record = entry as Record<string, unknown>;
      const itemIds = stringList(record.itemIds, 8).filter((id) =>
        allowedIds.has(id),
      );
      if (!itemIds.length) return [];
      return [
        {
          title: text(record.title, 40) || "推荐穿搭",
          itemIds,
          reason: text(record.reason, 160),
          sceneTips: stringList(record.sceneTips, 4),
        },
      ];
    });
  return {
    summary: text(raw.summary, 160) || "已根据场景和衣橱生成推荐",
    recommendedOutfits,
    warnings: stringList(raw.warnings, 5),
    generatedAt: new Date().toISOString(),
  };
}

async function postMiniMax<T>(
  url: string,
  settings: MiniMaxRuntimeSettings,
  data: unknown,
): Promise<T> {
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
      const message =
        typeof body?.error?.message === "string"
          ? body.error.message
          : "MiniMax 服务返回错误";
      throw new WorkspaceApiError(
        response.status >= 500 ? 502 : 400,
        response.status >= 500 ? "server" : "invalid_request",
        message,
        response.status >= 500,
      );
    }
    return body as T;
  } catch (error) {
    if (error instanceof WorkspaceApiError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new WorkspaceApiError(504, "server", "MiniMax 请求超时", true);
    throw new WorkspaceApiError(502, "server", "无法连接 MiniMax 服务", true);
  } finally {
    clearTimeout(timer);
  }
}

function buildGarmentPrompt(fallbackName: string): string {
  return [
    "请识别图片中的单件衣物或配饰。只输出严格 JSON，不要 Markdown，不要解释文字。",
    "你会收到原图和同图10×10坐标网格版。原图用于属性，网格版用于定位完整可见主体边界。",
    "secondaryCropBox 使用本次识别输入图的归一化左上坐标（输入图可能已由用户预裁切），必须包含肩带、吊带、提手、裙摆、裤脚和包底；输出前在每一侧各安全外扩检测框宽高的20%并clamp到0..1。",
    "cropConfidence只表示框的几何可靠性，与属性confidence独立；遮挡、贴边或归属不确定时 cropNeedsReview=true 且 cropConfidence<0.6。",
    "不得把文件名当作衣物名称；文件名仅供排错参考：" + fallbackName,
    "candidateNames[0] 必须是具体中文衣物名称，不能是 garment、clothes、item、单品、衣物、衣服、服装。",
    "短裤/长裤必须按真实裤脚位置判断；工装裤按贴袋、多口袋、抽绳等功能结构判断。",
    "版型倾向不能按颜色刻板判断，优先看剪裁、品类、肩线、腰线、裤型、鞋型、包型和饰品风格。",
    "字段必须符合：",
    JSON.stringify({
      candidateNames: ["中文名称，1-3个候选"],
      category:
        "tops|pants|skirts|one_piece|shoes|bags|hats|jewelry|accessories",
      subcategory: "可选，无法判断为空字符串",
      colors: {
        mode: "single|multicolor|main_with_accent",
        primary: "主色",
        primaries: ["拼色"],
        accents: ["辅色"],
      },
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
      secondaryCropBox: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      cropConfidence: 0.8,
      cropNeedsReview: false,
    }),
  ].join("\n");
}

function normalizeRecognitionCrop(data: Record<string, unknown>): { secondaryCropBox?: { x: number; y: number; width: number; height: number }; cropConfidence?: number; cropNeedsReview?: boolean } {
  const candidate = data.secondaryCropBox;
  if (!candidate || typeof candidate !== "object") return { cropNeedsReview: true };
  const box = candidate as Record<string, unknown>;
  const x = Number(box.x); const y = Number(box.y); const width = Number(box.width); const height = Number(box.height);
  const confidence = Number(data.cropConfidence);
  const valid = [x, y, width, height].every(Number.isFinite) && x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 1.000001 && y + height <= 1.000001;
  if (!valid || !Number.isFinite(confidence) || confidence < 0.6 || data.cropNeedsReview === true) return { cropConfidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : undefined, cropNeedsReview: true };
  return { secondaryCropBox: { x, y, width, height }, cropConfidence: confidence, cropNeedsReview: false };
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
    input.name
      ? `已有名称：${input.name}`
      : "已有名称：未填写，请生成一个简洁中文名称",
    "衣物：",
    ...input.outfitItems.map(
      (item) =>
        `- itemId=${item.id} ${item.name} 分类=${item.category}${item.subcategory ? "/" + item.subcategory : ""} 颜色=${JSON.stringify(item.colors ?? {})} 季节=${item.seasons.join("、") || "未填"} 风格=${item.styles.join("、") || "未填"} 温度=${JSON.stringify(item.temperatureRange ?? {})}`,
    ),
    "输出字段：name 不超过30字；seasons 只能 spring/summer/autumn/winter/all；sceneTags/styleTags/pairingTags 为中文短词；notes 不超过90字。",
  ].join("\n");
}

function extractMiniMaxContent(response: MiniMaxResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((part) => part.text)
      .filter(Boolean)
      .join("\n");
  return "";
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    const json = extractFirstJsonObject(raw);
    if (!json)
      throw new WorkspaceApiError(
        502,
        "server",
        "MiniMax 返回不是合法 JSON",
        true,
      );
    try {
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      throw new WorkspaceApiError(
        502,
        "server",
        "MiniMax 返回不是合法 JSON",
        true,
      );
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
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
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

function normalizeGarmentTag(
  raw: Record<string, unknown>,
  fallbackName: string,
): AiGarmentTag {
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

function sanitizeOutfitMetadata(
  raw: Record<string, unknown>,
  currentName?: string,
): AiOutfitMetadataResponse {
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
  const names = Array.isArray(value)
    ? value.map((item) => text(item, 16)).filter(Boolean)
    : [];
  const concrete = names.filter(
    (name) =>
      !/^(garment|clothes|clothing|item|product|apparel|outfit|wear|单品|衣物|衣服|新衣服|商品|服装)$/i.test(
        name,
      ),
  );
  if (concrete.length > 0) return concrete.slice(0, 3);
  return [
    fallbackName.replace(/\.[a-z0-9]+$/i, "").slice(0, 12) || "待确认衣物",
  ];
}

function normalizeColors(value: unknown): AiColorInfo {
  const obj =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const mode =
    obj.mode === "main_with_accent" ||
    obj.mode === "multicolor" ||
    obj.mode === "single"
      ? obj.mode
      : "single";
  if (mode === "multicolor")
    return {
      mode,
      primaries: shortTags(obj.primaries, 4).length
        ? shortTags(obj.primaries, 4)
        : ["混色"],
    };
  if (mode === "main_with_accent")
    return {
      mode,
      primary: text(obj.primary, 12) || "未知色",
      accents: shortTags(obj.accents, 4),
    };
  return { mode: "single", primary: text(obj.primary, 12) || "未知色" };
}

function normalizeTemperature(
  value: unknown,
): { minC?: number; maxC?: number } | undefined {
  const obj =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const minC = finiteNumber(obj.minC);
  const maxC = finiteNumber(obj.maxC);
  if (minC === undefined && maxC === undefined) return undefined;
  const range = {
    ...(minC === undefined ? {} : { minC: clampNumber(minC, -20, 40, minC) }),
    ...(maxC === undefined ? {} : { maxC: clampNumber(maxC, -20, 40, maxC) }),
  };
  if (
    range.minC !== undefined &&
    range.maxC !== undefined &&
    range.minC > range.maxC
  )
    return { minC: range.maxC, maxC: range.minC };
  return range;
}

function normalizeList<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: Array<T[number]>,
): Array<T[number]> {
  const items = Array.isArray(value) ? value : [];
  const result = items.filter(
    (item): item is T[number] =>
      typeof item === "string" && (allowed as readonly string[]).includes(item),
  );
  const unique = [...new Set(result)].slice(0, 6);
  return unique.length > 0 ? unique : fallback;
}

function shortTags(value: unknown, max: number): string[] {
  return (Array.isArray(value) ? value : [])
    .map((item) => text(item, 12))
    .filter(Boolean)
    .slice(0, max);
}

function pick<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown, max: number): string[] {
  return (Array.isArray(value) ? value : [])
    .filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    )
    .map((item) => item.trim())
    .slice(0, max);
}

function diagnosisIssues(value: unknown) {
  const severityValues = new Set(["low", "medium", "high"]);
  return (Array.isArray(value) ? value : []).slice(0, 8).map((issue, index) => {
    const record = object(issue);
    const severity = text(record.severity, 10);
    return {
      id: text(record.id, 40) || `issue-${index + 1}`,
      title: text(record.title, 40) || "诊断项",
      summary: text(record.summary, 160),
      severity: severityValues.has(severity) ? severity : "low",
      itemIds: (Array.isArray(record.itemIds) ? record.itemIds : [])
        .map(Number)
        .filter(Number.isFinite),
      outfitIds: stringList(record.outfitIds, 8),
      action: text(record.action, 80) || undefined,
    };
  });
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  return Math.round(clampNumber(value, min, max, fallback));
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const number = finiteNumber(value) ?? fallback;
  return Math.min(max, Math.max(min, number));
}
