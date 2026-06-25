import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";
import {
  CATEGORY_LABELS,
  FIT_NOTES_MAX_LEN,
  type DetectedGarmentCandidate,
  type ClosetLocation,
  type GarmentCategory,
  type GarmentCropBox,
  type GarmentStyle,
  type GarmentStyleAdvice,
  type GarmentTagResult,
  type OutfitAiSuggestion,
  type OutfitRecommendation,
  type OutfitRequest,
  type SavedOutfit,
  type SceneInsight,
  type Season,
  type ShoppingAssessment,
  type ShoppingAssessmentCandidate,
  type ShoppingImageAnalysis,
  type TryOnProfile,
  type TryOnProfileSummary,
  type WardrobeDiagnosis,
  type WardrobeItem,
  type WeatherInsight,
} from "@/lib/types";
import { normalizeAiColorInfo, getPrimaryColors, getAccentColors, emptyColorInfo } from "@/lib/color-fields";
import {
  COLOR_OPTIONS,
  buildColorRecognitionPrompt,
  normalizeSystemColorList,
} from "@/lib/color-catalog";
import { recordDiagnosticEvent } from "@/lib/diagnostic-log";
import { GARMENT_CATEGORY_CATALOG } from "@/lib/garment-category-catalog";

const DEFAULT_API_HOST = "https://api.minimaxi.com";
const DEFAULT_MODEL = "MiniMax-M3";
const DEFAULT_TIMEOUT_MS = 60000;
const SETTINGS_KEY = "wardrobe-minimax-settings";
const SEASON_VALUES: Season[] = ["spring", "summer", "autumn", "winter", "all"];
const STYLE_VALUES: GarmentStyle[] = ["casual", "sweet", "elegant", "commute", "outdoor", "dinner", "vacation"];
const FIT_GENDER_VALUES: Array<"menswear" | "womenswear" | "unisex" | "unknown"> = ["menswear", "womenswear", "unisex", "unknown"];
const SCENE_TYPES: SceneInsight["sceneType"][] = [
  "city",
  "restaurant",
  "bar",
  "hotel",
  "cruise",
  "theme_park",
  "water_park",
  "ski",
  "camping",
  "business",
  "formal_event",
  "outdoor",
  "unknown",
];

// 通用场景视觉/场景描述：按 SceneType 查表，不再维护地名关键词硬编码。
// SceneType 枚举已覆盖餐厅/酒吧/邮轮/酒店/主题乐园/水上乐园/滑雪/露营/商务/正式活动/户外/城市 12 类通用场景。
// 当 destination 文字未命中 SceneType 时落到 "city" 或 "unknown"（由 classifySceneType 决定），
// 此时由 LLM 自行根据 destination 文字推理具体地貌（草原/雪山/海岛/水乡/沙漠 等），避免为单点地名写死正则。
const SCENE_TYPE_PROFILE: Record<SceneInsight["sceneType"], string> = {
  city:
    "城市旅行目的地，使用当地城市街区、公园、历史建筑、河岸、咖啡店/街巷或夜景氛围，避免随机自然荒野。",
  restaurant:
    "餐厅/用餐场景，背景应是有质感的餐厅室内、餐桌、柔和灯光、窗边座位或高级用餐氛围；不要生成户外荒野或景区背景。",
  bar:
    "酒吧/夜生活场景，背景应是低照度暖光、吧台、酒柜、霓虹或现场音乐氛围，适合夜间社交；不要生成白天自然景区。",
  hotel:
    "酒店/度假空间场景，背景应是高级酒店大堂、走廊、露台、庭院、泳池边或度假设施，干净精致、有服务业空间质感。",
  cruise:
    "邮轮/游轮场景，背景应是邮轮甲板、海景、栏杆、落日或船舱公共区域，可有海风和度假感；不要生成普通海滩或内陆风景。",
  theme_park:
    "主题乐园/游乐设施场景，背景应是乐园道路、游乐设施、摩天轮、过山车、彩色建筑和人群氛围，明亮活泼；不要生成普通自然风景。",
  water_park:
    "水上/温泉设施场景，背景应是水滑梯、泳池、温泉庭院、湿润光线或度假水景，注意服装仍要保持穿搭展示完整。",
  ski:
    "冰雪运动场景，背景应是雪场、缆车、雪道、室内冰场或雪山设施，冬季寒冷氛围明确。",
  camping:
    "露营场景，背景应是营地帐篷、篝火、星空、林间空地或户外炊事氛围；按月份表现植被、晨雾或夜间天光。",
  business:
    "商务/办公场景，背景应是现代写字楼、会议空间、城市街区或通勤场景，干净专业，不要生成度假或荒野。",
  formal_event:
    "正式社交/宴会场景，背景应是宴会厅、花艺、灯光、红毯、会场入口或精致派对环境，突出正式和仪式感。",
  outdoor:
    "户外活动场景。LLM 应根据 destination 文字自行推理具体地貌（草原/雪山/高原/海岛/水乡/沙漠/湖泊/城市公园 等），结合季节和天气生成对应自然元素；不要默认生成荒漠旅拍也不要无视具体地名。",
  unknown:
    "未命中特定场景分类时，LLM 应根据 destination 文字推理它更像室内场所、户外设施、城市街区、山地、草原、海边、水乡、高原还是沙漠；无法确定时选择可信的当地街区、公园、室内公共空间或自然景观，不要默认生成荒漠旅拍。",
};

export interface DeviceMiniMaxSettings {
  apiKey: string;
  apiHost: string;
  model: string;
  timeoutMs: number;
}

interface NativeHttpResponse<T = unknown> {
  status: number;
  data: T;
}

interface NativeMiniMaxPostOptions {
  url: string;
  headers: Record<string, string>;
  data: unknown;
  connectTimeout: number;
  readTimeout: number;
  // v0.9.27-dev: notificationTitle / notificationText 已弃用, 用户可见
  // 进度统一走 NativeProgressNotificationPlugin, 旧字段保留只为类型兼容。
  notificationTitle?: string;
  notificationText?: string;
}

interface NativeMiniMaxPlugin {
  post(options: NativeMiniMaxPostOptions): Promise<NativeHttpResponse<unknown>>;
}

const NativeMiniMax = registerPlugin<NativeMiniMaxPlugin>("NativeMiniMax");

// 客户端图片压缩闸门：单次 MiniMax 请求里的图片 base64 总和控制在 ~2-3MB 内，
// 避免 4G 弱网下 timeout + 服务端二次重压。AI 试穿 preview 单请求最多 8 张衣物图 +
// 全身/脸部照, 24MB+ 容易让 readTimeout 触发。压缩失败时静默 fallback 到原图,
// 不阻断主流程。
const COMPRESS_THRESHOLD_BYTES = 800 * 1024;
const COMPRESS_MAX_SIDE = 1280;
const COMPRESS_QUALITY = 0.85;

async function compressImageDataUrlForUpload(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx < 0) return dataUrl;
  const base64Part = dataUrl.slice(commaIdx + 1);
  const approxBytes = Math.floor((base64Part.length * 3) / 4);
  if (approxBytes < COMPRESS_THRESHOLD_BYTES) return dataUrl;

  try {
    const blob = await (await fetch(dataUrl)).blob();
    const source = await createImageBitmap(blob).catch(() => null);
    if (!source) return dataUrl;
    const isWidthDominant = source.width >= source.height;
    const target = await createImageBitmap(
      blob,
      isWidthDominant
        ? { resizeWidth: COMPRESS_MAX_SIDE, resizeQuality: "high" }
        : { resizeHeight: COMPRESS_MAX_SIDE, resizeQuality: "high" },
    ).catch(() => null);
    if (!target) {
      source.close();
      return dataUrl;
    }
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    source.close();
    if (!ctx) {
      target.close();
      return dataUrl;
    }
    ctx.drawImage(target, 0, 0);
    target.close();
    return canvas.toDataURL("image/jpeg", COMPRESS_QUALITY);
  } catch {
    return dataUrl;
  }
}

interface MiniMaxResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
  error?: {
    message?: string;
  };
}

interface MiniMaxVisionResponse {
  content?: string;
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
}

interface MiniMaxSearchResponse {
  content?: string;
  results?: Array<{ title?: string; snippet?: string; content?: string }>;
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
  error?: {
    message?: string;
  };
}

interface MiniMaxImageGenerationResponse {
  data?: {
    image_base64?: string[];
    image_urls?: string[];
    images?: Array<{ image_base64?: string; url?: string }>;
  };
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
  error?: {
    message?: string;
  };
}

interface AiOutfitPayload {
  id?: string;
  title?: string;
  score?: number;
  confidence?: number;
  sceneFit?: string;
  slots?: Array<{
    role?: OutfitRecommendation["slots"][number]["role"];
    itemId?: number;
    why?: string;
  }>;
  reasons?: string[];
  reuseOutfitIds?: string[];
  avoidItems?: Array<{ itemId?: number; reason?: string }>;
  missingItems?: string[];
  packingReminders?: string[];
  stylingTips?: string[];
}

type LooseGarmentTagPayload = Partial<GarmentTagResult> & {
  colors?: unknown;
  [key: string]: unknown;
};

type LooseDetectedGarmentPayload = LooseGarmentTagPayload & {
  id?: unknown;
  tag?: LooseGarmentTagPayload;
  box?: unknown;
  cropBox?: unknown;
  boundingBox?: unknown;
  bbox?: unknown;
};

export function defaultMiniMaxSettings(): DeviceMiniMaxSettings {
  return {
    apiKey: "",
    apiHost: DEFAULT_API_HOST,
    model: DEFAULT_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

export function loadMiniMaxSettings(): DeviceMiniMaxSettings {
  if (typeof window === "undefined") return defaultMiniMaxSettings();

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultMiniMaxSettings();
    const parsed = JSON.parse(raw) as Partial<DeviceMiniMaxSettings>;

    return {
      ...defaultMiniMaxSettings(),
      ...parsed,
      apiKey: parsed.apiKey ?? "",
      apiHost: parsed.apiHost || DEFAULT_API_HOST,
      model: DEFAULT_MODEL,
      timeoutMs: typeof parsed.timeoutMs === "number" ? parsed.timeoutMs : DEFAULT_TIMEOUT_MS,
    };
  } catch {
    return defaultMiniMaxSettings();
  }
}

export function saveMiniMaxSettings(settings: DeviceMiniMaxSettings) {
  window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      ...settings,
      apiKey: settings.apiKey.trim(),
      apiHost: settings.apiHost.trim().replace(/\/$/, "") || DEFAULT_API_HOST,
      model: DEFAULT_MODEL,
      timeoutMs: Number.isFinite(settings.timeoutMs) ? settings.timeoutMs : DEFAULT_TIMEOUT_MS,
    }),
  );
}

export function hasDeviceMiniMaxKey(settings: DeviceMiniMaxSettings) {
  return settings.apiKey.trim().length > 0;
}

export async function validateMiniMaxKey(settings: DeviceMiniMaxSettings): Promise<{ valid: boolean; message: string }> {
  if (!hasDeviceMiniMaxKey(settings)) {
    return { valid: false, message: "未填写 API Key" };
  }

  try {
    const response = await nativePost<MiniMaxResponse>(`${settings.apiHost}/v1/chat/completions`, {
      settings: { ...settings, timeoutMs: 15000 },
      data: {
        model: settings.model,
        messages: [{ role: "user", name: "User", content: "ping" }],
        max_completion_tokens: 1,
        stream: false,
      },
    });

    if (response.status >= 400 || response.data.base_resp?.status_code) {
      return { valid: false, message: response.data.base_resp?.status_msg || response.data.error?.message || "服务器返回错误" };
    }

    return { valid: true, message: "MiniMax Key 验证通过，模型能力已激活" };
  } catch (error) {
    return { valid: false, message: `连接失败：${error instanceof Error ? error.message : "网络不可达"}` };
  }
}

async function chatJsonWithImage(
  prompt: string,
  imageDataUrl: string,
  settings: DeviceMiniMaxSettings,
  options: { system: string; temperature?: number; maxTokens?: number },
): Promise<string> {
  // 客户端压缩闸门：单张图 > 800KB 时缩到长边 1280px / JPEG 0.85, 失败 fallback 原图
  const compressedImage = await compressImageDataUrlForUpload(imageDataUrl);
  const response = await nativePost<MiniMaxResponse>(`${settings.apiHost}/v1/chat/completions`, {
    settings,
    data: {
      model: settings.model || DEFAULT_MODEL,
      messages: [
        { role: "system", name: "System", content: options.system },
        {
          role: "user",
          name: "User",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: compressedImage } },
          ],
        },
      ],
      temperature: options.temperature ?? 0.1,
      max_completion_tokens: options.maxTokens ?? 1200,
      stream: false,
    },
  });

  const content = extractMiniMaxContent(response.data);
  if (response.status >= 400 || response.data.base_resp?.status_code || !content) {
    throw new Error(response.data.error?.message || response.data.base_resp?.status_msg || "MiniMax M3 图片理解失败");
  }
  return content;
}

function extractMiniMaxContent(response: MiniMaxResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => part.text).filter(Boolean).join("\n");
  }
  return "";
}

// v1.1.31 commit2: 显式结构化识别错误。
export type GarmentRecognitionFailureCode =
  | "not_configured"
  | "network"
  | "timeout"
  | "service"
  | "invalid_json"
  | "invalid_result";

export class GarmentRecognitionError extends Error {
  code: GarmentRecognitionFailureCode;
  retryable: boolean;
  constructor(code: GarmentRecognitionFailureCode, message: string, retryable: boolean) {
    super(message);
    this.name = "GarmentRecognitionError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type AiProgressCallback = (stage: string, percent: number) => void;

export async function tagGarmentOnDevice(
  imageDataUrl: string,
  fallbackName: string,
  settings: DeviceMiniMaxSettings,
  onProgress?: AiProgressCallback,
): Promise<GarmentTagResult> {
  const prompt = [
    "你是衣橱管理 App 的单品识别助手。你只能根据用户提供的裁切后衣物图片识别衣物属性。请只输出严格 JSON，不要输出 Markdown，不要输出解释文字。",
    "你必须使用系统固定枚举，不允许自由创造字段值。",
    buildCatalogDictionaryPrompt(),
    ...buildColorRecognitionPrompt(),
    "版型倾向判断：不要按颜色刻板判断版型，不要因为粉色判女装，不要因为黑灰蓝判男装。",
    "优先根据剪裁、品类、肩线、腰线、裙摆、裤型、鞋型、包型、饰品风格判断。",
    "卫衣、T恤、牛仔裤、运动鞋、棒球帽等可优先判断为 unisex，除非剪裁明显偏男装或女装。",
    "男装识别重点：肩线、胸围宽松度、衣长、裤腰/裤裆结构、鞋型厚重度、商务/休闲/运动属性。",
    "女装识别重点：腰线、裙长、廓形、修身/宽松、露肤度、跟高、包型、饰品风格。",
    "字段必须符合：",
    "{",
    '  "candidateNames": ["中文名称，1-3个候选，8字以内，描述品类和显著特征"],',
    '  "category": "catalog group id 之一（tops / pants / skirts / one_piece / shoes / bags / hats / jewelry / accessories）",',
    '  "subcategory": "catalog subcategory id 之一，从对应 group 的细分中选；不识别时输出空字符串",',
    '  "colors": {"mode": "single|multicolor|main_with_accent", "primary": "单主色时填写", "primaries": ["拼色时填写"], "accents": ["主辅色时填写"]},',
    '  "seasons": ["spring|summer|autumn|winter|all"],',
    '  "styles": ["casual|sweet|elegant|commute|outdoor|dinner|vacation"],',
    '  "material": "中文材质观感，不确定为空字符串",',
    '  "temperatureRange": {"minC": 数字或 null, "maxC": 数字或 null},',
    '  "formality": 1-5,',
    '  "warmth": 1-5,',
    '  "confidence": 0-1,',
    '  "needsReview": true/false,',
    '  "notes": "20到80字中文备注，只描述图片中可见信息",',
    '  "fitGender": "menswear|womenswear|unisex|unknown",',
    '  "fitNotes": "一句话说明判断原因，例如男款宽松衬衫、女款修身连衣裙、中性运动卫衣"',
    "}",
    "禁止输出以下字段：price、currency、productUrl、url、link、brand、shop、sceneTags、styleTags、imageType、candidates、purchaseDate、locationId、status、wornDates、referenceOutfitImages、aiStyleAdvice、aiAssessment、convertedItemId、convertedAt、note（拼写错误，禁止用 note 单数）、其他字段。",
    "备注必须识别。备注只描述图片中能看见的版型、材质观感、设计点、搭配倾向。不要编品牌、价格、链接。",
  ].join("\n");

  try {
    onProgress?.("发送识别请求", 25);
    const content = await chatJsonWithImage(prompt, imageDataUrl, settings, {
      system: "你是衣橱 App 的 M3 多模态衣物识别助手，只输出可解析 JSON。",
      temperature: 0.1,
      maxTokens: 900,
    });
    onProgress?.("等待 AI 回复", 80);
    const result = normalizeGarmentTag(parseJsonObject<LooseGarmentTagPayload>(content), fallbackName);
    onProgress?.("识别完成", 100);
    return result;
  } catch {
    onProgress?.("回退旧 VLM 接口", 80);
    const response = await nativePost<MiniMaxVisionResponse>(`${settings.apiHost}/v1/coding_plan/vlm`, {
      settings,
      data: {
        prompt,
        image_url: imageDataUrl,
      },
    });

    if (response.status >= 400 || response.data.base_resp?.status_code || !response.data.content) {
      throw new Error(response.data.base_resp?.status_msg || "MiniMax 图片理解失败");
    }

    const result = normalizeGarmentTag(parseJsonObject<LooseGarmentTagPayload>(response.data.content), fallbackName);
    onProgress?.("识别完成", 100);
    return result;
  }
}

export async function detectGarmentsOnDevice(
  imageDataUrl: string,
  fallbackName: string,
  settings: DeviceMiniMaxSettings,
  onProgress?: AiProgressCallback,
): Promise<DetectedGarmentCandidate[]> {
  const prompt = [
    "你是一个衣橱管理 App 的多衣物识别和分割助手。",
    "请识别图片里所有清晰可见、适合单独录入衣橱的衣物或配饰。帽子、项链、上衣、裤子、外套、鞋、包都要拆成独立候选。",
    "成对物品按一件候选处理：一双鞋、一副手套、一双袜子、成对耳饰等左右两只属于同一件衣物或配饰。",
    "category=shoes 时，一个候选必须代表一双鞋，box 要包含左右两只鞋的完整轮廓；不要把左鞋、右鞋分别输出为两个候选。",
    "只有图片里明显有两双不同的鞋，才输出两个 shoes 候选。",
    "若只露出单只鞋，也作为一双鞋的候选并在 notes 中说明只露出单只。",
    "每个候选必须提供 box 裁剪框。归一化坐标 x/y/width/height 在 0-1 之间。box 必须完全包含该单件衣物的整体，上下左右各留约 10%~15% 的宽松边距，确保不裁切衣物任何部分。宁可框大一些，也不能裁掉衣物。",
    "请只输出 JSON 数组，不要 Markdown，不要解释文字。每个元素代表一件候选衣物，最多 12 件。",
    "颜色识别规则：只输出 colors 对象；单主色用 primary，拼色用 primaries，主辅色用 primary + accents。",
    "版型倾向判断：不要按颜色刻板判断版型，不要因为粉色判女装，不要因为黑灰蓝判男装。",
    "优先根据剪裁、品类、肩线、腰线、裙摆、裤型、鞋型、包型、饰品风格判断。",
    "卫衣、T恤、牛仔裤、运动鞋、棒球帽等可优先判断为 unisex，除非剪裁明显偏男装或女装。",
    "鞋子继续按一双鞋作为一件候选，不要退化成左右脚分别识别。",
    "包、帽子、项链、手链、手镯等配饰要尽量识别，不要因为在人身上就忽略。",
    "字段必须符合：",
    "[{",
    '  "id": "item-1",',
    '  "candidateNames": ["中文名称，1-3个"],',
    '  "category": "tops|pants|skirts|one_piece|shoes|bags|hats|jewelry|accessories",',
    '  "colors": {"mode": "single|multicolor|main_with_accent", "primary": "单主色时填写", "primaries": ["拼色时填写"], "accents": ["主辅色时填写"]},',
    '  "seasons": ["spring|summer|autumn|winter|all"],',
    '  "styles": ["casual|sweet|elegant|commute|outdoor|dinner|vacation"],',
    '  "formality": 1-5,',
    '  "warmth": 1-5,',
    '  "confidence": 0-1,',
    '  "needsReview": true/false,',
    '  "notes": "一句给用户确认的短备注",',
    '  "fitGender": "menswear|womenswear|unisex|unknown",',
    '  "fitNotes": "一句话说明判断原因，例如男款宽松衬衫、女款修身连衣裙、中性运动卫衣",',
    '  "box": { "x": 0.1, "y": 0.2, "width": 0.4, "height": 0.5 }',
    "}]",
  ].join("\n");

  try {
    onProgress?.("发送识别请求", 25);
    const content = await chatJsonWithImage(prompt, imageDataUrl, settings, {
      system: "你是衣橱 App 的 M3 多模态多衣物识别助手，只输出可解析 JSON。",
      temperature: 0.1,
      maxTokens: 2200,
    });
    onProgress?.("等待 AI 回复", 80);
    const result = normalizeDetectedGarments(parseJsonObject<LooseDetectedGarmentPayload[] | LooseDetectedGarmentPayload>(content), fallbackName, imageDataUrl);
    onProgress?.("识别完成", 100);
    return result;
  } catch {
    onProgress?.("回退旧 VLM 接口", 80);
    const response = await nativePost<MiniMaxVisionResponse>(`${settings.apiHost}/v1/coding_plan/vlm`, {
      settings,
      data: {
        prompt,
        image_url: imageDataUrl,
      },
    });

    if (response.status >= 400 || response.data.base_resp?.status_code || !response.data.content) {
      throw new Error(response.data.base_resp?.status_msg || "MiniMax 多衣物识别失败");
    }

    const result = normalizeDetectedGarments(parseJsonObject<LooseDetectedGarmentPayload[] | LooseDetectedGarmentPayload>(response.data.content), fallbackName, imageDataUrl);
 onProgress?.("识别完成",100);
 return result;
 }
}

// ============================================================
// v0.9.32-dev: 单件属性识别（单件录入专用）
// ------------------------------------------------------------
// 与 `detectGarmentsOnDevice`（多衣物检测 /拆分）的区别：
// -走 `tagGarmentOnDevice`（单件衣物属性识别），不会调用多衣物检测 prompt
// - 只返回单件属性标签 + 原图地址,不返回 cropBox / 多候选
// - 单件录入模式（captureMode === "item"）下必须走这里,禁止调用多衣物检测
// -套装录入（captureMode === "outfit"）继续走 `detectGarmentsOnDevice` / `recognizeImageCandidatesFromDataUrl`
// -失败 fallback：返回可编辑默认 `GarmentTagResult`，由 caller 转 WardrobeDraft
// ============================================================
export interface SingleItemRecognition {
 tag: GarmentTagResult;
 imageDataUrl: string;
 sourceImageDataUrl: string;
}

export async function recognizeSingleItemFromDataUrl(
  aiRequestDataUrl: string,
  originalDataUrl: string,
  fileName: string,
  settings: DeviceMiniMaxSettings,
  onProgress?: AiProgressCallback,
): Promise<SingleItemRecognition> {
  if (!hasDeviceMiniMaxKey(settings)) {
    onProgress?.("未配置 Key", 100);
    throw new GarmentRecognitionError(
      "not_configured",
      "未配置 MiniMax Key，无法进行 AI 识别。",
      false,
    );
  }
  try {
    onProgress?.("识别衣物属性", 30);
    const tag = await tagGarmentOnDevice(aiRequestDataUrl, fileName, settings, onProgress);
    return {
      tag,
      imageDataUrl: originalDataUrl,
      sourceImageDataUrl: originalDataUrl,
    };
  } catch (error) {
    // v1.1.31 commit2: 失败时抛结构化错误，禁止返回 buildSingleItemFallback 假成功。
    const code: GarmentRecognitionFailureCode =
      error instanceof GarmentRecognitionError ? error.code : "service";
    const retryable = error instanceof GarmentRecognitionError ? error.retryable : true;
    const message =
      error instanceof Error && error.message ? error.message : "MiniMax 识别失败，请稍后重试。";
    if (typeof console !== "undefined") {
      console.warn("[recognizeSingleItemFromDataUrl] MiniMax tag失败", code, error);
    }
    onProgress?.("识别失败", 100);
    throw new GarmentRecognitionError(code, message, retryable);
  }
}

export async function recommendOutfitsOnDevice(
  items: WardrobeItem[],
  request: OutfitRequest,
  settings: DeviceMiniMaxSettings,
  context: {
    outfits?: SavedOutfit[];
    locations?: ClosetLocation[];
    tryOnProfile?: TryOnProfile;
    weatherInsight?: WeatherInsight;
  } = {},
  onProgress?: AiProgressCallback,
): Promise<OutfitRecommendation[]> {
  const compactItems = items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    colors: item.colors,
    seasons: item.seasons,
    styles: item.styles,
    formality: item.formality,
    warmth: item.warmth,
    locationId: item.locationId,
    locationName: context.locations?.find((location) => location.id === item.locationId)?.name ?? item.locationId,
    status: item.status,
    notes: item.notes ?? "",
  }));
  const savedOutfits = (context.outfits ?? []).map((outfit) => ({
    id: outfit.id,
    name: outfit.name,
    itemIds: outfit.itemIds,
    destination: outfit.destination,
    activity: outfit.activity,
    style: outfit.style,
    source: outfit.source,
  }));
  const weatherInsight = context.weatherInsight ?? {
    weather: request.weather,
    temperatureC: request.temperatureC,
    summary: "用户手动确认天气",
    source: "confirmed" as const,
    sceneType: classifySceneType(request.destination),
    sceneSummary: buildDestinationSceneProfile(request.destination || "", resolveContextMonth(request)),
  };
  const sceneInsight: SceneInsight = {
    sceneType: weatherInsight.sceneType ?? classifySceneType(request.destination),
    summary: weatherInsight.sceneSummary || buildDestinationSceneProfile(request.destination || "", resolveContextMonth(request)),
    constraints: [
      buildSeasonSceneProfile(resolveContextMonth(request)),
      buildDestinationSceneProfile(request.destination || "", resolveContextMonth(request)),
      `${weatherInsight.weather}，约${weatherInsight.temperatureC}度`,
    ].slice(0, 4),
  };
  const tryOnProfileSummary = summarizeTryOnProfile(context.tryOnProfile);

  const systemPrompt = [
    "你是一个私人衣橱穿搭总监，任务是把用户的真实衣橱、实时天气、目的地/场景、活动和风格偏好，转成最多 3 套可执行穿搭。",
    "硬性规则优先级高于审美：",
    "1. 只能使用输入衣物库中真实存在的 itemId，不得编造 itemId、衣物名称或不存在的品类。",
    '2. 只能推荐 status="active" 且 locationId 在 availableLocationIds 内的衣物。',
    "3. 不得推荐待洗、待修、暂不穿、不可用地点内的衣物；如这些衣物很适合，也只能放入 avoidItems 或 packingReminders 说明，不能放入 slots。",
    '4. 天气必须来自输入的实时天气或用户手动确认天气。如果 weatherInsight.source 不是 "forecast" 或 "confirmed"，或缺少 temperatureC/weather，则不要生成穿搭，返回 needsWeatherConfirmation=true。',
    "5. 推荐前必须先理解 destination/scene：它可能是城市、餐厅、酒吧、酒店、邮轮、商场、游乐园、水上乐园、滑雪场、露营地、剧院、商务会议、正式宴会等，不要把所有目的地都当成户外旅行。",
    "6. 室内/半室内社交场景要关注正式度、灯光氛围、鞋包精致度、空调温差、拍照效果；不要按徒步或自然景区处理。",
    "7. 户外活动/游乐设施要关注移动量、安全性、天气、温度、舒适度、防晒/防风/防雨；不要只按“出片”推荐。",
    "8. 商务、年会、婚礼、晚宴等正式场景要关注正式度、材质感、颜色稳妥度、鞋包配饰完整度。",
    "9. 每套推荐必须能被用户直接穿出去，不能只讲风格概念。",
    "10. 输出必须是合法 JSON，不要 Markdown，不要解释文字，不要输出思考过程，不要输出 <think> 标签。",
  ].join("\n");

  const prompt = [
    "请基于以下结构化输入生成穿搭推荐。",
    "",
    `【出行需求】\nrequest = ${JSON.stringify(request)}`,
    "",
    `【实时天气】\nweatherInsight = ${JSON.stringify(weatherInsight)}`,
    "",
    '说明：weatherInsight.source 只能是 "forecast" 或 "confirmed" 才可直接推荐。否则返回 needsWeatherConfirmation=true。',
    "",
    `【场景理解】\nsceneInsight = ${JSON.stringify(sceneInsight)}`,
    "",
    `【可用衣橱】\navailableLocationIds = ${JSON.stringify(request.availableLocationIds)}\nlocations = ${JSON.stringify(context.locations ?? [])}`,
    "",
    `【衣物库】\nwardrobeItems = ${JSON.stringify(compactItems)}`,
    "",
    `【已收藏套装】\nsavedOutfits = ${JSON.stringify(savedOutfits)}`,
    "",
    `【试穿资料摘要】\ntryOnProfileSummary = ${JSON.stringify(tryOnProfileSummary)}`,
    "",
    "【内部评估步骤】请按以下步骤完成，但不要输出步骤过程：检查天气是否可用；判断场景类型和穿搭约束；过滤真实可用衣物；评估收藏套装复用；组合最多3套；检查缺失品类、颜色冲突、温度不适、场景不适、近期重复穿着；输出JSON。",
    "",
    "【输出 JSON Schema】",
    JSON.stringify({
      needsWeatherConfirmation: false,
      weatherQuestion: "",
      sceneInsight: {
        sceneType: "city|restaurant|bar|hotel|cruise|theme_park|water_park|ski|camping|business|formal_event|outdoor|unknown",
        summary: "一句中文场景判断",
        constraints: ["最多4条穿搭约束"],
      },
      recommendations: [
        {
          id: "ai-outfit-1",
          title: "中文标题，8字以内优先",
          score: 0,
          confidence: 0,
          sceneFit: "一句话说明为什么适合这个场景",
          slots: [{ role: "上装|下装|连衣裙|外套|鞋|包|帽子|项链|手链|手镯", itemId: 123, why: "这件单品的作用" }],
          reasons: ["2到4条短理由"],
          reuseOutfitIds: [],
          avoidItems: [{ itemId: 456, reason: "不建议原因" }],
          missingItems: [],
          packingReminders: [],
          stylingTips: [],
        },
      ],
      globalWarnings: [],
    }),
    "",
    "输出限制：recommendations最多3套；slots中itemId必须来自wardrobeItems；没有足够可用衣物也要返回合法JSON；不要输出JSON之外的文字。",
  ].join("\n");

  const response = await nativePost<MiniMaxResponse>(`${settings.apiHost}/v1/chat/completions`, {
    settings,
    data: {
      model: settings.model,
      messages: [
        {
          role: "system",
          name: "WardrobeStylist",
          content: systemPrompt,
        },
        {
          role: "user",
          name: "User",
          content: prompt,
        },
      ],
      temperature: 0.4,
      top_p: 0.9,
      max_completion_tokens: 1600,
      stream: false,
    },
  });

  const content = extractMiniMaxContent(response.data);
  if (response.status >= 400 || response.data.base_resp?.status_code || !content) {
    throw new Error(response.data.error?.message || response.data.base_resp?.status_msg || "MiniMax 推荐失败");
  }

  onProgress?.("生成搭配", 85);
  const parsed = parseJsonObject<AiOutfitPayload[] | { recommendations?: AiOutfitPayload[]; needsWeatherConfirmation?: boolean; weatherQuestion?: string }>(content);
  if (!Array.isArray(parsed) && parsed.needsWeatherConfirmation) {
    throw new Error(parsed.weatherQuestion || "需要先确认实时天气后再推荐");
  }
  const result = normalizeAiRecommendations(Array.isArray(parsed) ? parsed : parsed.recommendations ?? [], items);
  onProgress?.("展示结果", 100);
  return result;
}

export async function resolveWeatherInsightOnDevice(
  request: Pick<OutfitRequest, "destination" | "date" | "activity" | "stylePreference">,
  settings: DeviceMiniMaxSettings,
): Promise<WeatherInsight> {
  const query = `${request.destination || "目的地"} ${request.date} 实时天气预报 气温 降雨 风力`;
  let searchText = "";

  try {
    const searchResponse = await nativePost<MiniMaxSearchResponse>(`${settings.apiHost}/v1/coding_plan/search`, {
      settings: { ...settings, timeoutMs: Math.min(settings.timeoutMs, 20000) },
      data: { query },
    });
    if (searchResponse.status < 400 && !searchResponse.data.base_resp?.status_code) {
      searchText = stringifySearchResponse(searchResponse.data);
    }
  } catch (error) {
    if (typeof console !== "undefined") console.warn("[weather] search fallback:", error);
    searchText = "";
  }

  if (!searchText.trim()) {
    return {
      weather: "cloudy",
      temperatureC: 23,
      summary: "未获取到实时天气，请手动确认天气和温度",
      source: "unavailable",
      sceneType: classifySceneType(request.destination || ""),
      sceneSummary: buildDestinationSceneProfile(request.destination || "", resolveContextMonth(request)),
      weatherConfidence: 0,
      needsConfirmation: true,
      question: "未获取到实时天气，请手动确认天气和温度后再生成推荐",
    };
  }

  const prompt = [
    "你是穿搭 App 的天气判断助手。",
    "根据目的地、日期和搜索材料，判断穿搭需要的实时天气和气温。",
    "只能使用搜索材料中的天气信息。若材料不足、日期太远或无法确认实时预报，source 必须返回 unavailable，needsConfirmation 返回 true。",
    "同时判断场景类型，辅助穿搭推荐。",
    "只输出 JSON，不要解释文字。",
    '{ "weather": "sunny|cloudy|rainy|windy", "temperatureC": 23, "summary": "一句中文说明", "source": "forecast|unavailable", "sceneType": "city|restaurant|bar|hotel|cruise|theme_park|water_park|ski|camping|business|formal_event|outdoor|unknown", "sceneSummary": "一句场景判断", "weatherConfidence": 0.8, "needsConfirmation": false, "question": "" }',
    "",
    `目的地：${request.destination || "未填写"}`,
    `日期：${request.date || new Date().toISOString().slice(0, 10)}`,
    `活动：${request.activity || "未填写"}`,
    `风格：${request.stylePreference || "未填写"}`,
    `搜索材料：${searchText}`,
  ].join("\n");

  const response = await nativePost<MiniMaxResponse>(`${settings.apiHost}/v1/chat/completions`, {
    settings,
    data: {
      model: settings.model,
      messages: [{ role: "user", name: "User", content: prompt }],
      temperature: 0.2,
      max_completion_tokens: 500,
      stream: false,
    },
  });

  const content = extractMiniMaxContent(response.data);
  if (response.status >= 400 || response.data.base_resp?.status_code || !content) {
    throw new Error(response.data.error?.message || response.data.base_resp?.status_msg || "天气判断失败");
  }

  return normalizeWeatherInsight(parseJsonObject<Partial<WeatherInsight>>(content), "forecast");
}

export async function generateOutfitPreviewOnDevice(
  items: WardrobeItem[],
  context: Pick<OutfitRequest, "destination" | "date" | "activity" | "stylePreference" | "weather" | "temperatureC">,
  settings: DeviceMiniMaxSettings,
  tryOnProfile?: TryOnProfile,
  onProgress?: AiProgressCallback,
): Promise<string> {
  const usePersonRef = Boolean(tryOnProfile?.enabled && tryOnProfile.fullBodyImageDataUrl);

  const itemSummary = items
    .map((item) => `${item.name}（${item.category}，主色${getPrimaryColors(item.colors).join("、") || "未知"}，配色${getAccentColors(item.colors).join("、") || "无"}，${item.styles.join("、")}）`)
    .join("；");
  const hasContext = context.destination && context.destination !== "新餐厅";
  const scenePrompt = buildPreviewScenePrompt(context, Boolean(hasContext));

  // v0.9.22: 文字画像 (版型/身高/体型/肩宽/腿长/发型/肤色/备注) 不受 usePersonRef 控制,
  // 始终参与 prompt; 只有参考照片字段受 usePersonRef 控制。
  const profileLines = tryOnProfile
    ? [
        tryOnProfile.fitGender && tryOnProfile.fitGender !== "unspecified" ? `版型倾向：${{ menswear: "男装版型", womenswear: "女装版型", unisex: "中性风格" }[tryOnProfile.fitGender]}` : "",
        tryOnProfile.heightCm ? `身高：${tryOnProfile.heightCm}cm` : "",
        tryOnProfile.bodyType && tryOnProfile.bodyType !== "custom" ? `体型：${{ slim: "偏瘦", balanced: "匀称", curvy: "曲线感", plus: "丰满" }[tryOnProfile.bodyType]}` : "",
        tryOnProfile.bodyType === "custom" && tryOnProfile.bodyTypeCustom ? `体型：${tryOnProfile.bodyTypeCustom}` : "",
        tryOnProfile.shoulderWidth ? `肩宽：${{ narrow: "偏窄", normal: "正常", wide: "偏宽" }[tryOnProfile.shoulderWidth]}` : "",
        tryOnProfile.legRatio ? `腿长比例：${{ short: "偏短", normal: "正常", long: "偏长" }[tryOnProfile.legRatio]}` : "",
        tryOnProfile.hairDescription ? `发型/发色：${tryOnProfile.hairDescription}` : "",
        tryOnProfile.skinToneDescription ? `肤色/妆容：${tryOnProfile.skinToneDescription}` : "",
        tryOnProfile.styleNote ? `备注：${tryOnProfile.styleNote}` : "",
      ].filter(Boolean)
    : [];

  let prompt: string;
  if (usePersonRef) {
    prompt = [
      "生成一张手机 App 内使用的 AI 试穿预览图。",
      "请以参考人物为主体，生成真人全身正面自然站姿。",
      "请尽量保留参考人物的脸部气质、发型、身材比例、身高体态和整体轮廓。",
      "请让该人物穿上以下衣物组合，衣服颜色、类别和风格尽量准确。",
      "不要生成拼贴图，不要商品陈列图，不要文字、水印、logo。",
      "画面真实、干净、明亮，适合手机查看。",
      "",
      profileLines.length > 0 ? `人物资料：\n${profileLines.join("\n")}` : "",
      "",
      `衣物：\n${itemSummary}`,
      "",
      scenePrompt,
    ].join("\n");
  } else {
    // 没有 usePersonRef 时仍可传文字画像, 让模特姿态 / 身高比例 / 发型 / 风格 与用户偏好对齐
    const guidanceLines = [
      "请根据用户穿衣版型/身高/体型等文字画像生成合适的真人模特。",
      "模特的版型姿态 (男装版型 / 女装版型 / 中性风格) 应与用户画像一致, 但不要对用户身份做判断。",
      "模特的身高比例、发型、肤色基调可参考文字画像 (有值才遵循)。",
    ];
    prompt = [
      "生成一张手机 App 内使用的 AI 试穿预览图。",
      "请生成真人模特全身正面自然站姿，展示完整穿搭。",
      "参考图是单件衣物图片，不是人物；请把参考衣物组合成一套穿在模特身上。",
      "衣服颜色、类别、风格尽量参考下列衣物。",
      "不要生成拼贴图，不要商品陈列图，不要文字、水印、logo。",
      "画面真实、干净、明亮，适合手机查看。",
      "",
      guidanceLines.join("\n"),
      profileLines.length > 0 ? `用户穿衣画像：\n${profileLines.join("\n")}` : "",
      "",
      `衣物：${itemSummary}`,
      "",
      scenePrompt,
    ].join("\n");
  }

  onProgress?.("整理衣物信息", 10);
  const plannedPrompt = await planOutfitPreviewPromptOnDevice(prompt, items, context, settings, tryOnProfile).catch(() => prompt);
  prompt = plannedPrompt;
  onProgress?.("规划试穿画面", 25);
  const refImages = await buildPreviewReferenceImages(items, tryOnProfile);

  // Try with reference images, with progressive fallback
  const refLevels = [
    refImages,
    refImages.slice(0, Math.max(1, refImages.length - 2)),
    [],
  ];

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < refLevels.length; attempt++) {
    const refs = refLevels[attempt];
    if (attempt > 0) {
      onProgress?.("降级参考图重试", Math.min(85, 60 + attempt * 5));
    }
    try {
      const requestBody: Record<string, unknown> = {
        model: "image-01",
        prompt,
        response_format: "base64",
        n: 1,
        aspect_ratio: "1:1",
      };
      if (refs.length > 0) {
        requestBody.subject_reference = refs;
      }

      onProgress?.("生成图片", 80);
      const response = await nativePost<MiniMaxImageGenerationResponse>(
        `${settings.apiHost}/v1/image_generation`,
        { settings, data: requestBody },
      );

      if (response.status < 400 && !response.data.base_resp?.status_code) {
        const base64 = response.data.data?.image_base64?.[0]
          ?? response.data.data?.images?.find((image) => image.image_base64)?.image_base64;
        if (base64) {
          const image = `data:image/png;base64,${base64}`;
          onProgress?.("质检图片", 92);
          const review = await reviewOutfitPreviewOnDevice(image, prompt, settings).catch(() => ({ pass: true, reason: "" }));
          if (review.pass || refs.length === 0) {
            onProgress?.("完成", 100);
            return image;
          }
          lastError = new Error(review.reason || "生成图与穿搭要求不一致，正在重试");
          continue;
        }
        const url = response.data.data?.image_urls?.[0]
          ?? response.data.data?.images?.find((image) => image.url)?.url;
        if (url) {
          onProgress?.("质检图片", 92);
          const review = await reviewOutfitPreviewOnDevice(url, prompt, settings).catch(() => ({ pass: true, reason: "" }));
          if (review.pass || refs.length === 0) {
            onProgress?.("完成", 100);
            return url;
          }
          lastError = new Error(review.reason || "生成图与穿搭要求不一致，正在重试");
          continue;
        }
      }

      lastError = new Error(response.data.error?.message || response.data.base_resp?.status_msg || "图片生成失败");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("图片生成失败");
    }
  }

  throw lastError ?? new Error("MiniMax 未返回可用预览图");
}

async function planOutfitPreviewPromptOnDevice(
  basePrompt: string,
  items: WardrobeItem[],
  context: Pick<OutfitRequest, "destination" | "date" | "activity" | "stylePreference" | "weather" | "temperatureC">,
  settings: DeviceMiniMaxSettings,
  tryOnProfile?: TryOnProfile,
): Promise<string> {
  const plannerPrompt = [
    "你是 AI 试穿图的画面规划助手。请把基础 prompt 改写成更稳定的 image_generation prompt。",
    "必须保留：衣物颜色和品类、人物参考要求、目的地/场景、日期季节、天气温度、不要文字水印、不要拼贴图、不要商品陈列图。",
    "请只输出 JSON：{\"prompt\":\"改写后的中文图片生成prompt\"}",
    "",
    `基础 prompt：${basePrompt}`,
    `衣物：${JSON.stringify(items.map((item) => ({ name: item.name, category: item.category, colors: item.colors, styles: item.styles })))}`,
    `场景：${JSON.stringify(context)}`,
    `试穿资料摘要：${JSON.stringify(summarizeTryOnProfile(tryOnProfile))}`,
  ].join("\n");

  const response = await nativePost<MiniMaxResponse>(`${settings.apiHost}/v1/chat/completions`, {
    settings: { ...settings, timeoutMs: Math.min(settings.timeoutMs, 25000) },
    data: {
      model: settings.model || DEFAULT_MODEL,
      messages: [
        { role: "system", name: "PreviewPlanner", content: "你只输出合法 JSON，不输出解释。" },
        { role: "user", name: "User", content: plannerPrompt },
      ],
      temperature: 0.25,
      max_completion_tokens: 1200,
      stream: false,
    },
  });

  const content = extractMiniMaxContent(response.data);
  if (response.status >= 400 || response.data.base_resp?.status_code || !content) return basePrompt;
  const parsed = parseJsonObject<{ prompt?: string }>(content);
  return parsed.prompt?.trim() || basePrompt;
}

async function reviewOutfitPreviewOnDevice(
  imageUrlOrDataUrl: string,
  prompt: string,
  settings: DeviceMiniMaxSettings,
): Promise<{ pass: boolean; reason: string }> {
  const reviewPrompt = [
    "你是 AI 试穿图质检助手。请检查图片是否符合生成要求。",
    "通过条件：人物/模特是完整穿搭展示；不是拼贴图；不是商品陈列图；没有明显文字水印；背景符合目的地/场景/季节；衣物类别和主要颜色大体匹配。",
    "如果只是局部小误差，可以通过；如果严重不符，请不通过。",
    "只输出 JSON：{\"pass\":true,\"reason\":\"一句话原因\"}",
    "",
    `原始生成要求：${prompt}`,
  ].join("\n");

  const content = await chatJsonWithImage(reviewPrompt, imageUrlOrDataUrl, settings, {
    system: "你只输出合法 JSON，不输出解释。",
    temperature: 0,
    maxTokens: 500,
  });
  const parsed = parseJsonObject<{ pass?: boolean; reason?: string }>(content);
  return { pass: parsed.pass !== false, reason: parsed.reason || "" };
}

function buildPreviewScenePrompt(
  context: Pick<OutfitRequest, "destination" | "date" | "activity" | "stylePreference" | "weather" | "temperatureC">,
  hasContext: boolean,
) {
  if (!hasContext) {
    return "场景：日常出门，背景简洁、中性，适合日常穿搭展示。";
  }

  const destination = context.destination || "目的地";
  const month = resolveContextMonth(context);
  // 直接查 SCENE_TYPE_PROFILE, 不调 buildDestinationSceneProfile (后者会再次拼 season, 80 token 浪费)
  const seasonProfile = buildSeasonSceneProfile(month);
  const destinationProfile = SCENE_TYPE_PROFILE[classifySceneType(destination)];
  const sceneLines = [
    `场景描述：${destination}，日期${context.date}，活动${context.activity}，风格${context.stylePreference}，${context.weather}天气，${context.temperatureC}度。`,
    `季节判断：${seasonProfile}`,
    `场景特征：${destinationProfile}`,
    "生成前请先判断输入的是地理目的地、室内场所、交通/度假设施，还是户外游乐/活动场景，再决定背景。",
    "如果输入是餐厅、酒吧、酒店、邮轮、剧院、展览、商场等场所，必须优先生成对应室内/半室内空间，不要强行生成当地地貌风景。",
    "如果输入是游乐园、水上乐园、露营、滑雪场、音乐节、动物园等户外设施或活动，必须优先生成设施/活动现场，而不是泛自然风景。",
    "如果输入是城市或自然景区，再使用当地街区、建筑、河湖、公园、文化地标、地貌、植被、水体、山形或气候。",
    "背景必须服务于“这个时间去这个场景做这个活动”的真实感，而不是只按服装风格生成泛旅游写真。",
    "除非场景明确是沙漠、戈壁或荒漠景区，否则不要生成沙漠、戈壁、干旱荒地、黄褐色灌木地、海边或中东风背景。",
    "画面中背景要可辨认但不要抢走人物主体，保持真实摄影感，不要生成旅游宣传海报或文字标识。",
  ];

  return sceneLines.join("\n");
}

function resolveContextMonth(context: Pick<OutfitRequest, "destination" | "date">) {
  const textMonth = context.destination?.match(/(?:^|[^0-9])([1-9]|1[0-2])\s*月/)?.[1];
  if (textMonth) return Number(textMonth);
  const dateMonth = Number((context.date || "").slice(5, 7));
  return Number.isFinite(dateMonth) && dateMonth >= 1 && dateMonth <= 12 ? dateMonth : new Date().getMonth() + 1;
}

function buildSeasonSceneProfile(month: number) {
  if ([3, 4, 5].includes(month)) {
    return "春季，画面应有新绿、花期、柔和日照和清爽空气感；山区可有残雪和初生草甸。";
  }
  if ([6, 7, 8].includes(month)) {
    return "夏季，植被通常更繁茂，草原/山地应偏鲜绿色，光线明亮；高海拔地区应清爽通透，低海拔城市或海边可更炎热。";
  }
  if ([9, 10, 11].includes(month)) {
    return "秋季，画面可出现金黄、红叶、成熟草甸、清澈空气和偏暖低角度阳光。";
  }
  return "冬季，画面应考虑寒冷、枯草、雪景、低饱和度植被、厚重光线和保暖氛围。";
}

function buildDestinationSceneProfile(destination: string, month: number) {
  // 通用场景机制：先按 destination 文字走 classifySceneType 归到 13 个 SceneType 之一，
  // 再从 SCENE_TYPE_PROFILE 查表拿视觉/场景描述；季节特征由 buildSeasonSceneProfile(month) 单独叠加。
  // 严禁在调用方或本函数里维护"伊犁/伊宁/那拉提/喀拉峻/昭苏"等单点地名关键词。
  const sceneType = classifySceneType(destination);
  const seasonProfile = buildSeasonSceneProfile(month);
  return `${seasonProfile}\n${SCENE_TYPE_PROFILE[sceneType]}`;
}

function classifySceneType(destination = ""): SceneInsight["sceneType"] {
  if (/餐厅|饭店|西餐|法餐|日料|寿司|烧鸟|火锅|私房菜|restaurant/i.test(destination)) return "restaurant";
  if (/酒吧|清吧|lounge|club|夜店|livehouse|鸡尾酒|微醺/i.test(destination)) return "bar";
  if (/邮轮|游轮|cruise|甲板|海上航行/i.test(destination)) return "cruise";
  if (/酒店|大堂|lobby|resort|套房/i.test(destination)) return "hotel";
  if (/迪士尼|环球影城|游乐园|主题乐园|欢乐谷|方特|过山车|摩天轮|旋转木马/.test(destination)) return "theme_park";
  if (/水上乐园|水世界|漂流|冲浪|泳池|温泉|汤泉|泡汤/.test(destination)) return "water_park";
  if (/滑雪|雪场|雪山缆车|滑冰|冰场/.test(destination)) return "ski";
  if (/露营|营地/.test(destination)) return "camping";
  if (/办公室|会议|商务|通勤|面试|公司|写字楼|发布会|论坛|峰会/.test(destination)) return "business";
  if (/婚礼|宴会|晚宴|年会|派对|酒会|颁奖|典礼|红毯/.test(destination)) return "formal_event";
  if (/徒步|登山|骑行|野餐|公园|音乐节|户外|动物园|植物园/.test(destination)) return "outdoor";
  if (destination.trim()) return "city";
  return "unknown";
}

function summarizeTryOnProfile(profile?: TryOnProfile): TryOnProfileSummary {
  // v0.9.22: 拆分 enabled 控制范围。
  //  - enabled=true: 启用参考照 (后续如试穿时附带全身照/脸部照)
  //  - 文字画像 (身高/体型/版型/肩宽/腿长/发型/肤色/备注) 不受 enabled 控制, 始终参与 prompt/推荐
  // v0.9.23-dev: 字段为空时不进 summary, 减少 LLM 噪声和 prompt 长度;
  //  返回类型 TryOnProfileSummary (src/lib/types.ts) 保证字段可空且类型精确
  if (!profile) return { enabled: false };
  const summary: TryOnProfileSummary = {
    enabled: Boolean(profile.enabled),
  };
  if (profile.fitGender && profile.fitGender !== "unspecified") summary.fitGender = profile.fitGender;
  if (profile.heightCm) summary.heightCm = profile.heightCm;
  if (profile.bodyType) {
    summary.bodyType = profile.bodyType === "custom" ? profile.bodyTypeCustom : profile.bodyType;
  }
  if (profile.shoulderWidth) summary.shoulderWidth = profile.shoulderWidth;
  if (profile.legRatio) summary.legRatio = profile.legRatio;
  if (profile.hairDescription?.trim()) summary.hairDescription = profile.hairDescription;
  if (profile.skinToneDescription?.trim()) summary.skinToneDescription = profile.skinToneDescription;
  if (profile.styleNote?.trim()) summary.styleNote = profile.styleNote;
  return summary;
}

const GARMENT_PRIORITY: GarmentCategory[] = [
  "one_piece", "tops", "pants", "skirts", "shoes", "bags", "hats", "jewelry", "accessories",
];

async function buildPreviewReferenceImages(
  items: WardrobeItem[],
  tryOnProfile?: TryOnProfile,
): Promise<Array<{ type: string; image_file: string }>> {
  // 客户端压缩闸门：单次 preview 最多 8 张衣物图 + 全身/脸部照, 24MB+ 容易触发 readTimeout。
  // 每张图都过 compressImageDataUrlForUpload (单图 > 800KB 时缩到长边 1280px / JPEG 0.85)。
  if (tryOnProfile?.enabled && tryOnProfile.fullBodyImageDataUrl) {
    const fullBody = await compressImageDataUrlForUpload(tryOnProfile.fullBodyImageDataUrl);
    const refs: Array<{ type: string; image_file: string }> = [{ type: "character", image_file: fullBody }];
    if (tryOnProfile.faceImageDataUrl) {
      const face = await compressImageDataUrlForUpload(tryOnProfile.faceImageDataUrl);
      refs.push({ type: "character", image_file: face });
    }
    return refs;
  }

  const garmentItems = items
    .filter((item) => Boolean(item.imageDataUrl))
    .sort((a, b) => {
      const ai = GARMENT_PRIORITY.indexOf(a.category);
      const bi = GARMENT_PRIORITY.indexOf(b.category);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  const top = garmentItems.slice(0, 8);
  return Promise.all(
    top.map(async (item) => ({
      type: "character" as const,
      image_file: await compressImageDataUrlForUpload(item.imageDataUrl),
    })),
  );
}

function sanitizeOutfitName(raw: string): string | null {
  let cleaned = raw.trim();

  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const thinkIdx = cleaned.toLowerCase().indexOf("<think");
  if (thinkIdx >= 0) return null;

  cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1");
  cleaned = cleaned.replace(/```/g, "");

  try {
    const jsonText = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned;
    const parsed = JSON.parse(jsonText);
    if (parsed && typeof parsed.name === "string" && parsed.name.trim()) {
      cleaned = parsed.name.trim();
    }
  } catch {}

  cleaned = cleaned.replace(/^["「『\s]+/, "").replace(/["」』\s]+$/, "");
  cleaned = cleaned.replace(/^(名称|套装名|套装名称|穿搭名称|outfit\s*name|name)\s*[:：]\s*/i, "");
  cleaned = cleaned.replace(/<[^>]+>/g, "");

  const lines = cleaned.split(/[\n\r]+/).map((l) => l.trim()).filter((l) => l.length > 0);
  const chineseNameLine = lines.find((l) => {
    if (!/[一-鿿]/.test(l)) return false;
    if (/(?:^|[\s（(])(user|think|name|outfit|the|this|is|are|would|should|can|please|output|result|response|assistant|model|建议|根据|输出|以下|名称)(?:$|[\s）).,，!！?？:：])/i.test(l)) return false;
    if (l.length > 30) return false;
    return true;
  });
  if (chineseNameLine) cleaned = chineseNameLine;
  else if (lines.length > 0) cleaned = lines[0];

  cleaned = cleaned.replace(/^[^a-zA-Z0-9一-鿿]+/, "").replace(/[^a-zA-Z0-9一-鿿]+$/, "").replace(/\s+/g, "");

  const forbiddenExactNames = new Set([
    "关键信息", "套装名称", "穿搭名称", "名称", "套装名",
    "衣物信息", "搭配信息", "推荐名称", "时尚套装", "精致套装", "好看套装",
    "穿搭", "套装", "日常穿搭", "今日穿搭",
  ]);
  const forbiddenFragments = [
    "以下", "输出", "JSON", "json", "可以", "建议", "根据",
    "用户", "模型", "助手", "思考", "关键信息",
  ];
  if (forbiddenExactNames.has(cleaned)) return null;
  if (forbiddenFragments.some((f) => cleaned.includes(f))) return null;
  if (cleaned.endsWith("套装") || cleaned.endsWith("穿搭")) return null;

  let result = cleaned.trim();
  if (result.length > 15) result = result.slice(0, 15);
  if (result.endsWith("套装") || result.endsWith("穿搭")) return null;
  if (!result || result.length < 2 || /^[{["<]/.test(result) || !/[一-鿿]/.test(result)) return null;

  return result;
}

export async function generateOutfitNameOnDevice(
  items: Array<Pick<WardrobeItem, "name" | "category" | "colors" | "styles">>,
  context: { destination?: string; activity?: string; stylePreference?: string },
  settings: DeviceMiniMaxSettings,
): Promise<string> {
  const colorSummary = (() => {
    const allColors = new Set(items.flatMap((i) => [...getPrimaryColors(i.colors), ...getAccentColors(i.colors)]));
    return [...allColors].slice(0, 4).join("、") || "未知";
  })();
  const styleSummary = (() => {
    const allStyles = new Set(items.flatMap((i) => i.styles));
    return [...allStyles].slice(0, 3).join("、") || "未知";
  })();
  const categorySummary = items.map((i) => CATEGORY_LABELS[i.category] || i.category).join("+");

  const parts = [
    `整体色系：${colorSummary}`,
    `风格标签：${styleSummary}`,
    `品类组合：${categorySummary}`,
    context.destination ? `目的地：${context.destination}` : "",
    context.activity ? `活动：${context.activity}` : "",
    context.stylePreference ? `风格偏好：${context.stylePreference}` : "",
  ].filter(Boolean);

  const systemPrompt = [
    "你是一个中文时尚编辑，擅长为穿搭起有画面感、像杂志栏目一样的短名称。",
    "你只输出最终 JSON，不输出思考过程，不输出解释文字。",
  ].join("");

  const userPrompt = [
    "任务：为这套穿搭生成一个中文短名称。",
    "",
    "必须只返回一行 JSON：",
    '{"name":"甜趣游园"}',
    "",
    "命名要求：",
    "- 中文，2 到 10 字优先，最多 15 字",
    "- 像时尚杂志栏目名，有画面感",
    "- 可从场景、氛围、色彩、风格中提炼，不要机械拼接",
    '- 不要以"套装""穿搭"结尾',
    '- 不要出现"名称""套装名称""关键信息"等占位词',
    '- 不要罗列单品，不要写"上衣+裤子+鞋"',
    "- 不要 Markdown，不要解释，不要候选列表，不要英文",
    "",
    "好例子：",
    "甜趣游园、雾蓝通勤、奶油漫步、清冷假日、元气乐园、薄荷午后、黑糖甜酷、法式晴天",
    "",
    "坏例子：",
    "黑蓝休闲套装、米白优雅套装、白色衬衫牛仔裙套装、套装名称、关键信息",
    "",
    "套装信息：",
    ...parts,
  ].join("\n");

  const response = await nativePost<MiniMaxResponse>(`${settings.apiHost}/v1/chat/completions`, {
    settings: { ...settings, timeoutMs: Math.min(settings.timeoutMs, 25000) },
    data: {
      model: settings.model,
      messages: [
        { role: "system", name: "FashionEditor", content: systemPrompt },
        { role: "user", name: "User", content: userPrompt },
      ],
      temperature: 0.45,
      max_completion_tokens: 512,
      reasoning_split: true,
      stream: false,
    },
  });

  const content = extractMiniMaxContent(response.data);
  if (response.status >= 400 || response.data.base_resp?.status_code || !content) {
    throw new Error(response.data.error?.message || response.data.base_resp?.status_msg || "套装命名失败");
  }

  const name = sanitizeOutfitName(content);
  if (!name) {
    throw new Error("MiniMax 未返回有效套装名称");
  }
  return name;
}

export async function diagnoseWardrobeOnDevice(
  items: WardrobeItem[],
  outfits: SavedOutfit[],
  locations: ClosetLocation[],
  settings: DeviceMiniMaxSettings,
  onProgress?: AiProgressCallback,
): Promise<WardrobeDiagnosis> {
  const prompt = [
    "你是衣橱诊断助手。请基于用户现有衣橱输出简短、可执行的诊断，不要鼓励无意义消费。",
    "硬性输出规则（违反任一条都会让用户看不到结果）：",
    "1. 只输出一个 JSON object，不要任何解释文字。",
    "2. 不要 Markdown 包裹：禁止 ```json、```、###、标题等任何 Markdown 语法。",
    "3. 不要 <think>、</think> 或任何内部思考标签。",
    "4. 不要代码块、不要换行说明、不要 \"以下是诊断：\" 这类前缀。",
    "5. 输出内容必须以 { 开头，} 结尾，中间是合法 JSON。",
    "6. 字符串内不要出现未转义的双引号或换行；中文标点正常输出即可。",
    "输出结构：",
    JSON.stringify({
      summary: "一句总评",
      duplicates: [{ id: "dup-1", title: "重复项标题", summary: "说明", severity: "low|medium|high", itemIds: [1], outfitIds: [], action: "建议动作" }],
      gaps: [{ id: "gap-1", title: "缺口标题", summary: "说明", severity: "low|medium|high", itemIds: [], outfitIds: [], action: "建议动作" }],
      idleItems: [{ id: "idle-1", title: "闲置标题", summary: "说明", severity: "low|medium|high", itemIds: [1], outfitIds: [], action: "建议动作" }],
      reusableOutfits: [{ id: "reuse-1", title: "可复用套装", summary: "说明", severity: "low|medium|high", itemIds: [], outfitIds: ["outfit-id"], action: "建议动作" }],
      purchaseSuggestions: ["最多5条购买方向"],
    }),
    "",
    `locations=${JSON.stringify(locations)}`,
    `items=${JSON.stringify(items.map((item) => ({ id: item.id, name: item.name, category: item.category, colors: item.colors, seasons: item.seasons, styles: item.styles, formality: item.formality, warmth: item.warmth, status: item.status, locationId: item.locationId, notes: item.notes })))}`,
    `outfits=${JSON.stringify(outfits.map((outfit) => ({ id: outfit.id, name: outfit.name, itemIds: outfit.itemIds, destination: outfit.destination, activity: outfit.activity, style: outfit.style, source: outfit.source })))}`,
  ].join("\n");

  const response = await nativePost<MiniMaxResponse>(`${settings.apiHost}/v1/chat/completions`, {
    settings,
    data: {
      model: settings.model || DEFAULT_MODEL,
      messages: [
        { role: "system", name: "WardrobeDiagnosis", content: "你只输出合法 JSON。" },
        { role: "user", name: "User", content: prompt },
      ],
      temperature: 0.25,
      max_completion_tokens: 1600,
      stream: false,
    },
  });
  onProgress?.("分析问题", 70);
  const content = extractMiniMaxContent(response.data);
  if (response.status >= 400 || response.data.base_resp?.status_code || !content) {
    throw new Error(response.data.error?.message || response.data.base_resp?.status_msg || "衣橱诊断失败");
  }
  onProgress?.("整理结果", 90);
  return normalizeWardrobeDiagnosis(parseJsonObject<Partial<WardrobeDiagnosis>>(content));
}

export async function analyzeShoppingImageOnDevice(
  imageDataUrl: string,
  settings: DeviceMiniMaxSettings,
  userHint = "",
  onProgress?: AiProgressCallback,
): Promise<ShoppingImageAnalysis> {
  const prompt = [
    "你是衣橱 App 的买前评估图片理解助手。你的任务是识别图片里可被购买或评估的服装/配饰候选，而不是给出购买建议。",
    "硬性规则：只根据图片可见内容判断，不编造价格、面料成分、尺码或链接；套装/自拍/淘宝截图/多商品图必须 requiresUserSelection=true；对镜自拍只评价服装和搭配，不评价身体。",
    "只输出合法 JSON，不要 Markdown，不要解释文字，不要 <think>。",
    "",
    `用户补充：${userHint || "无"}`,
    "允许的 category：tops|pants|skirts|one_piece|shoes|bags|hats|jewelry|accessories",
    "输出 JSON Schema：",
    JSON.stringify({
      imageType: "single_item|outfit|multiple_items|taobao_screenshot|mirror_selfie|uncertain",
      sourceSummary: "一句话描述",
      requiresUserSelection: true,
      overallOutfitSummary: { exists: true, style: "整体风格", mainColors: ["主色"], formality: 1, seasonGuess: ["spring"], notes: "套装概括" },
      candidates: [{
        tempId: "candidate-1",
        name: "中文候选名称",
        category: "tops|pants|skirts|one_piece|shoes|bags|hats|jewelry|accessories",
        colors: { mode: "single|multicolor|main_with_accent", primary: "单主色时填写", primaries: ["拼色时填写"], accents: ["主辅色时填写"] },
        seasonGuess: ["spring|summer|autumn|winter|all"],
        styles: ["casual|sweet|elegant|commute|outdoor|dinner|vacation"],
        formality: 1,
        warmth: 1,
        fitAndMaterialGuess: "版型/材质观感",
        visualFeatures: ["最多4条"],
        cropBox: { x: 0.1, y: 0.2, width: 0.4, height: 0.5 },
        confidence: 0,
        needsReview: false,
        notes: "短备注",
        // 以下字段只从图片可见文字提取，不可见的写 null
        price: null,
        subcategory: "短袖衬衫",
        temperatureRange: { minC: 18, maxC: 30 },
        material: "棉麻观感",
        fitGender: "menswear|womenswear|unisex|unknown",
        fitNotes: "宽松男装版型",
      }],
      warnings: [],
    }),
  ].join("\n");

  onProgress?.("准备图片", 15);
  const content = await chatJsonWithImage(prompt, imageDataUrl, settings, {
    system: "你只输出合法 JSON。",
    temperature: 0.1,
    maxTokens: 2200,
  });
  onProgress?.("识别候选单品", 80);
  const result = normalizeShoppingImageAnalysis(parseJsonObject<Partial<ShoppingImageAnalysis>>(content), imageDataUrl);
  onProgress?.("整理候选", 95);
  return result;
}

export async function analyzeWishlistIntakeImageOnDevice(
  imageDataUrl: string,
  settings: DeviceMiniMaxSettings,
  onProgress?: AiProgressCallback,
): Promise<ShoppingAssessmentCandidate> {
  const prompt = [
    "你是衣橱管理 App 的种草单品识别助手。你只能根据用户提供的商品图、截图或裁切图识别衣物本身的穿搭属性。请只输出严格 JSON，不要输出 Markdown，不要输出解释文字。",
    "本任务不是商品 OCR，不识别价格，不识别币种，不识别链接，不输出购买建议。",
    buildCatalogDictionaryPrompt(),
    ...buildColorRecognitionPrompt(),
    "请识别以下字段：",
    JSON.stringify({
      name: "中文名称，1-3个候选，8字以内，描述品类和显著特征",
      category: "catalog group id 之一（tops / pants / skirts / one_piece / shoes / bags / hats / jewelry / accessories）",
      subcategory: "catalog subcategory id 之一，从对应 group 的细分中选；不识别时输出空字符串",
      colors: { mode: "single|multicolor|main_with_accent", primary: "单主色时填写", primaries: ["拼色时填写"], accents: ["主辅色时填写"] },
      seasons: ["spring|summer|autumn|winter|all"],
      styles: ["casual|sweet|elegant|commute|outdoor|dinner|vacation"],
      material: "中文材质观感，不确定为空字符串",
      temperatureRange: { minC: null, maxC: null },
      formality: 1,
      warmth: 1,
      fitGender: "menswear|womenswear|unisex|unknown",
      fitNotes: "一句话说明判断原因，最多 40 字",
      notes: "20到80字中文备注，只描述图片中可见信息",
    }),
    "禁止输出以下字段：price、currency、productUrl、url、link、brand、shop、sceneTags、styleTags、imageType、candidates、purchaseDate、locationId、status、wornDates、referenceOutfitImages、aiStyleAdvice、aiAssessment、convertedItemId、convertedAt、note（拼写错误，禁止用 note 单数）、其他字段。",
    "备注必须识别。备注只描述图片中能看见的版型、材质观感、设计点、搭配倾向。不要编品牌、价格、链接、购买建议。",
  ].join("\n");

  onProgress?.("准备种草图片", 15);
  const content = await chatJsonWithImage(prompt, imageDataUrl, settings, {
    system: "你只输出合法 JSON，且不得输出 price、currency、productUrl、url、link、brand、shop、purchaseAdvice、worthBuying。",
    temperature: 0.1,
    maxTokens: 1200,
  });
  const candidate = normalizeShoppingCandidate(parseJsonObject<Partial<ShoppingAssessmentCandidate>>(content), 0, imageDataUrl);
  onProgress?.("识别完成", 100);
  return { ...candidate, price: undefined };
}

export async function assessShoppingItemOnDevice(
  selectedCandidates: ShoppingAssessmentCandidate[],
  wardrobeItems: WardrobeItem[],
  context: { targetScene?: string; outfits?: SavedOutfit[]; locations?: ClosetLocation[]; tryOnProfile?: TryOnProfile },
  settings: DeviceMiniMaxSettings,
  onProgress?: AiProgressCallback,
): Promise<ShoppingAssessment> {
  return assessShoppingCandidatesOnDevice(selectedCandidates, wardrobeItems, context, settings, onProgress);
}

export async function assessShoppingOutfitOnDevice(
  selectedCandidates: ShoppingAssessmentCandidate[],
  wardrobeItems: WardrobeItem[],
  context: { targetScene?: string; outfits?: SavedOutfit[]; locations?: ClosetLocation[]; tryOnProfile?: TryOnProfile },
  settings: DeviceMiniMaxSettings,
  onProgress?: AiProgressCallback,
): Promise<ShoppingAssessment> {
  return assessShoppingCandidatesOnDevice(selectedCandidates, wardrobeItems, context, settings, onProgress);
}

async function assessShoppingCandidatesOnDevice(
  selectedCandidates: ShoppingAssessmentCandidate[],
  wardrobeItems: WardrobeItem[],
  context: { targetScene?: string; outfits?: SavedOutfit[]; locations?: ClosetLocation[]; tryOnProfile?: TryOnProfile },
  settings: DeviceMiniMaxSettings,
  onProgress?: AiProgressCallback,
): Promise<ShoppingAssessment> {
  const prompt = [
    "你是一个克制、实用的买前穿搭顾问。请基于用户现有衣橱判断候选单品或候选套装是否值得买、是否重复、能否搭出现有衣物、适合什么场景，以及是否适合用户输入的目标场景。",
    "硬性规则：购买建议要保守；默认只做评估，不写入正式衣橱；不得编造 wardrobeItems 中不存在的 itemId；只能评价 selectedCandidates；对镜自拍只评价衣服和搭配，不评价身体。",
    "conclusion 必须是：值得买|可买但重复|不建议买|只建议买其中某几件。",
    "只输出合法 JSON，不要 Markdown，不要解释文字。",
    "",
    `selectedCandidates=${JSON.stringify(selectedCandidates)}`,
    `targetScene=${context.targetScene || ""}`,
    `wardrobeItems=${JSON.stringify(wardrobeItems.map((item) => ({ id: item.id, name: item.name, category: item.category, colors: item.colors, seasons: item.seasons, styles: item.styles, formality: item.formality, warmth: item.warmth, locationId: item.locationId, status: item.status, notes: item.notes })))}`,
    `savedOutfits=${JSON.stringify(context.outfits ?? [])}`,
    `locations=${JSON.stringify(context.locations ?? [])}`,
    `tryOnProfileSummary=${JSON.stringify(summarizeTryOnProfile(context.tryOnProfile))}`,
    "",
    "输出 JSON Schema：",
    JSON.stringify({
      conclusion: "值得买|可买但重复|不建议买|只建议买其中某几件",
      overallScore: 0,
      summary: "一句总评",
      purchaseReasoning: ["2到5条短理由"],
      duplicateAssessment: { level: "low|medium|high", summary: "重复度判断", similarItems: [{ candidateTempId: "candidate-1", itemId: 123, similarity: 0, reason: "相似原因" }] },
      candidateAssessments: [{ tempId: "candidate-1", singleConclusion: "值得买|可买但重复|不建议买", score: 0, strengths: [], risks: [], wardrobeGapFit: "是否补足缺口", recommendedAction: "买|不买|等打折|需要试尺码|只适合特定场景" }],
      outfitCompatibility: { applies: true, score: 0, summary: "整套协调度", buyOnlyTempIds: [], skipTempIds: [] },
      recommendedOutfits: [{ title: "搭配标题", scene: "适用场景", slots: [{ role: "上衣|裤子|半身裙|连体装|鞋|包|帽子|首饰|配饰", source: "candidate|wardrobe", tempId: "candidate-1", itemId: 123, why: "作用" }], missingItems: [], notes: [] }],
      suitableScenes: [],
      unsuitableScenes: [],
      targetSceneAssessment: { targetScene: context.targetScene || "", fit: "good|maybe|bad|unknown", reason: "原因", adjustments: [] },
      risks: [],
      nextActions: ["加入待购清单", "确认购买后录入衣橱", "用这件生成搭配", "重新选择单品"],
    }),
  ].join("\n");

  onProgress?.("整理已选单品", 20);
  let response: NativeHttpResponse<MiniMaxResponse>;
  try {
    response = await nativePost<MiniMaxResponse>(`${settings.apiHost}/v1/chat/completions`, {
      settings,
      data: {
        model: settings.model || DEFAULT_MODEL,
        messages: [
          { role: "system", name: "ShoppingAdvisor", content: "你只输出合法 JSON。" },
          { role: "user", name: "User", content: prompt },
        ],
        temperature: 0.25,
        max_completion_tokens: 2600,
        stream: false,
      },
    });
  } catch (error) {
    onProgress?.("评估失败", 0);
    throw error;
  }
  onProgress?.("对比现有衣橱", 65);
  const content = extractMiniMaxContent(response.data);
  if (response.status >= 400 || response.data.base_resp?.status_code || !content) {
    onProgress?.("评估失败", 0);
    throw new Error(response.data.error?.message || response.data.base_resp?.status_msg || "买前评估失败");
  }
  onProgress?.("生成建议", 90);
  return normalizeShoppingAssessment(parseJsonObject<Partial<ShoppingAssessment>>(content), selectedCandidates);
}

async function nativePost<T>(
  url: string,
  options: {
    settings: DeviceMiniMaxSettings;
    data: unknown;
  },
): Promise<NativeHttpResponse<T>> {
  const headers = {
    Authorization: `Bearer ${options.settings.apiKey.trim()}`,
    "Content-Type": "application/json",
  };

  // v1.1.20-dev commit2 (P2 诊断): minimax_api_called / failed
  // 所有 MiniMax API 调用都走 nativePost, 在这里集中打点。
  // 复现"AI 识别失败 / 401 / 超时"必备 — 日志里能看到 host / status / 真实 error。
  const transport = (Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("NativeMiniMax"))
    ? "NativeMiniMax"
    : "CapacitorHttp";
  const startedAt = Date.now();
  recordDiagnosticEvent("minimax_api_called", { url, transport, model: options.settings.model });
  try {
    if (transport === "NativeMiniMax") {
      // v0.9.27-dev: notificationTitle / notificationText 已弃用, NativeMiniMax
      // 内部不再做用户可见通知。App 内 / 系统通知栏的进度由
      // useSoftAiProgress + NativeProgressNotificationPlugin 统一管理。
      const response = await NativeMiniMax.post({
        url,
        headers,
        data: options.data,
        connectTimeout: options.settings.timeoutMs,
        readTimeout: options.settings.timeoutMs,
      });
      recordDiagnosticEvent("minimax_api_succeeded", {
        url,
        transport,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return {
        status: response.status,
        data: normalizeNativeResponseData<T>(response.data),
      };
    }

    const response = await CapacitorHttp.post({
      url,
      headers,
      data: options.data,
      connectTimeout: options.settings.timeoutMs,
      readTimeout: options.settings.timeoutMs,
    });
    recordDiagnosticEvent("minimax_api_succeeded", {
      url,
      transport,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return {
      status: response.status,
      data: normalizeNativeResponseData<T>(response.data),
    };
  } catch (error) {
    recordDiagnosticEvent("minimax_api_failed", {
      url,
      transport,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function normalizeNativeResponseData<T>(data: unknown): T {
  return typeof data === "string" ? (JSON.parse(data) as T) : (data as T);
}

function parseJsonObject<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  // v0.9.19: 用括号匹配提取"第一个完整 JSON object/array"代替简单的 first/last index，
  // 避免模型在 JSON 前后夹杂解释文字时切到不完整的 JSON 段。
  const candidate = extractFirstBalancedJson(cleaned) ?? cleaned;

  try {
    return JSON.parse(candidate) as T;
  } catch (error) {
    // 脱敏：原始内容（可能含模型幻觉/脏话/用户参考 prompt）只进 console / Logcat，**不**通过 error.message 抛给 UI。
    // UI 拿到的只是一个用户可理解的通用 message（"AI 没能正确整理这次结果"），由调用方映射到具体场景。
    const length = raw.trim().length;
    if (typeof console !== "undefined") {
      console.error("[parseJsonObject] 解析失败", {
        length,
        jsonError: error instanceof Error ? error.message : String(error),
        preview: raw.slice(0, 200),
        truncated: raw.slice(0, 1000),
      });
    }
    throw new Error("AI 没能正确整理这次结果，请稍后重试");
  }
}

/**
 * 在 cleaned 文本中寻找第一个**完整**的 JSON object ({...}) 或 array ([...]) 段。
 * 用括号配对算法，跳过字符串内的引号、转义。
 * 找不到时返回 null。
 */
function extractFirstBalancedJson(cleaned: string): string | null {
  for (let start = 0; start < cleaned.length; start += 1) {
    const ch = cleaned[start];
    if (ch !== "{" && ch !== "[") continue;
    const open = ch;
    const close = ch === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < cleaned.length; i += 1) {
      const c = cleaned[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (c === "\\") {
          escape = true;
        } else if (c === '"') {
          inString = false;
        }
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === open) {
        depth += 1;
      } else if (c === close) {
        depth -= 1;
        if (depth === 0) {
          return cleaned.slice(start, i + 1);
        }
      }
    }
  }
  return null;
}

/**
 * v2: 把完整 catalog 9 组 90 项渲染成 AI prompt 的字典段。
 * 强制 AI 输出 catalog id（subcategory），不输出中文细分。
 */
function buildCatalogDictionaryPrompt(): string {
  const lines: string[] = ["[catalog 字典] 9 组 90 项，subcategory 必须输出 id（例如 shirt），不输出中文："];
  for (const group of GARMENT_CATEGORY_CATALOG) {
    const parts = group.subcategories.map((s) => `${s.id}(${s.label})`).join("、");
    lines.push(`- ${group.id} (${group.label}): ${parts}`);
  }
  return lines.join("\n");
}

export function normalizeGarmentTag(data: LooseGarmentTagPayload, fallbackName: string): GarmentTagResult {
  const confidence = clampNumber(data.confidence, 0.5, 0, 1);

  // v1.1.27-fix: 优先从嵌套 data.colors 对象读取（v1.1.27 prompt 要求的新结构）。
  // 旧式顶层字段（colorMode / primaryColors / secondaryColors / mainColor / accentColors）作为兼容 fallback。
  // 优先级：嵌套 colors > 旧式顶层字段 > legacy 数组/字符串。
  const nestedColorsObj =
    data && typeof data === "object" && data.colors && typeof data.colors === "object" && !Array.isArray(data.colors)
      ? (data.colors as Record<string, unknown>)
      : null;
  const nestedColorMode =
    nestedColorsObj && typeof nestedColorsObj.mode === "string" ? nestedColorsObj.mode : undefined;
  const nestedColorPrimary =
    nestedColorsObj && typeof nestedColorsObj.primary === "string" ? nestedColorsObj.primary : undefined;
  const nestedColorPrimaries =
    nestedColorsObj && Array.isArray(nestedColorsObj.primaries)
      ? nestedColorsObj.primaries.filter((v): v is string => typeof v === "string")
      : undefined;
  const nestedColorAccents =
    nestedColorsObj && Array.isArray(nestedColorsObj.accents)
      ? nestedColorsObj.accents.filter((v): v is string => typeof v === "string")
      : undefined;

  const legacyColors = (() => {
    if (nestedColorPrimaries && nestedColorPrimaries.length > 0) return nestedColorPrimaries;
    if (nestedColorPrimary) return [nestedColorPrimary];
    return normalizeColorArray(readFirstDefined(data, ["colors", "颜色"]), []);
  })();
  const rawColorMode = nestedColorMode ?? readFirstDefined(data, ["colorMode", "color_mode", "mode", "颜色模式"]);
  const explicitColorMode = rawColorMode === "single" || rawColorMode === "multicolor" || rawColorMode === "main_with_accent"
    ? rawColorMode
    : undefined;
  const rawMainColor = nestedColorPrimary ?? readFirstDefined(data, ["mainColor", "main_color", "primary", "主色"]);
  const rawPrimaryColors = nestedColorPrimaries ?? normalizeColorArray(
    readFirstDefined(data, ["primaryColors", "primary_colors", "primaries", "primaryColor", "mainColors", "main_colors", "dominantColors", "dominant_colors", "主色", "主体色"]),
    [],
  );
  const rawSecondaryColors = nestedColorAccents ?? normalizeColorArray(
    readFirstDefined(data, [
      "secondaryColors",
      "secondary_colors",
      "secondaryColor",
      "accentColors",
      "accents",
      "accent_colors",
      "accentColor",
      "detailColors",
      "detail_colors",
      "trimColors",
      "trim_colors",
      "配色",
      "点缀色",
      "辅色",
    ]),
    [],
  );
  const colorPayload: Record<string, unknown> = {};
  if (explicitColorMode) {
    colorPayload.mode = explicitColorMode;
    if (explicitColorMode === "multicolor") {
      const primaries = rawPrimaryColors.length > 0 ? rawPrimaryColors : legacyColors;
      colorPayload.primaries = primaries;
    } else if (explicitColorMode === "main_with_accent") {
      colorPayload.primary = (typeof rawMainColor === "string" && rawMainColor) || rawPrimaryColors[0] || legacyColors[0] || "";
      colorPayload.accents = rawSecondaryColors;
    } else {
      colorPayload.primary = (typeof rawMainColor === "string" && rawMainColor) || rawPrimaryColors[0] || legacyColors[0] || "";
    }
  } else {
    const split = splitPrimaryAndSecondaryColors(rawPrimaryColors, rawSecondaryColors, legacyColors);
    if (split.secondaryColors.length > 0) {
      colorPayload.mode = "main_with_accent";
      colorPayload.primary = split.primaryColors[0] || (typeof rawMainColor === "string" ? rawMainColor : "") || "";
      colorPayload.accents = split.secondaryColors;
    } else {
      colorPayload.mode = "single";
      colorPayload.primary = split.primaryColors[0] || (typeof rawMainColor === "string" ? rawMainColor : "") || "";
    }
  }
  const colorResult = normalizeAiColorInfo(colorPayload);

  return {
    candidateNames: normalizeStringArray(data.candidateNames, [cleanName(fallbackName)]).slice(0, 3),
    category: (data.category as GarmentCategory) ?? "tops",
    subcategory: sanitizeOptionalText(readFirstDefined(data, ["subcategory", "sub_category", "细分", "二级分类"])),
    colors: colorResult.colors,
    seasons: normalizeEnumArray(data.seasons, SEASON_VALUES, ["all"]),
    styles: normalizeEnumArray(data.styles, STYLE_VALUES, ["casual"]),
    temperatureRange: normalizeTemperatureRange(readFirstDefined(data, ["temperatureRange", "temperature_range", "tempRange", "适穿温度"])),
    material: sanitizeOptionalText(readFirstDefined(data, ["material", "fabric", "材质", "fitAndMaterialGuess"])),
    formality: clampNumber(data.formality, 2, 1, 5),
    warmth: clampNumber(data.warmth, 2, 1, 5),
    confidence,
    needsReview: data.needsReview ?? (confidence < 0.72 || colorResult.needsReview),
    notes: sanitizeOptionalText(readFirstDefined(data, ["notes", "note", "备注"])),
    fitGender: normalizeFitGender(data.fitGender),
    fitNotes: sanitizeFitNotes(data.fitNotes),
  };
}

function sanitizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean || undefined;
}

function normalizeTemperatureRange(value: unknown): { minC?: number; maxC?: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const min = Number(readFirstDefined(record, ["minC", "min", "minTemperature", "最低温"]));
  const max = Number(readFirstDefined(record, ["maxC", "max", "maxTemperature", "最高温"]));
  const result: { minC?: number; maxC?: number } = {};
  if (Number.isFinite(min)) result.minC = min;
  if (Number.isFinite(max)) result.maxC = max;
  return result.minC === undefined && result.maxC === undefined ? undefined : result;
}

function normalizeFitGender(value: unknown): "menswear" | "womenswear" | "unisex" | "unknown" {
  if (typeof value !== "string") return "unknown";
  const v = value.trim().toLowerCase();
  if ((FIT_GENDER_VALUES as string[]).includes(v)) return v as "menswear" | "womenswear" | "unisex" | "unknown";
  return "unknown";
}

function sanitizeFitNotes(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > FIT_NOTES_MAX_LEN ? trimmed.slice(0, FIT_NOTES_MAX_LEN) : trimmed;
}

function normalizeDetectedGarments(
  payload: LooseDetectedGarmentPayload[] | LooseDetectedGarmentPayload,
  fallbackName: string,
  sourceImageDataUrl: string,
): DetectedGarmentCandidate[] {
  const rawItems = Array.isArray(payload) ? payload : normalizeCandidateContainer(payload);
  const normalized = rawItems.slice(0, 12).map((candidate, index) => {
    const tagSource = typeof candidate.tag === "object" && candidate.tag ? candidate.tag : candidate;
    const tag = normalizeGarmentTag(tagSource, `${fallbackName}-${index + 1}`);
    const cropBox = normalizeCropBox(
      readFirstDefined(candidate, ["box", "cropBox", "crop_box", "boundingBox", "bounding_box", "bbox"]) ??
        readFirstDefined(tagSource, ["box", "cropBox", "crop_box", "boundingBox", "bounding_box", "bbox"]),
    );

    return {
      id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : `detected-${index + 1}`,
      tag,
      cropBox,
      imageDataUrl: sourceImageDataUrl,
      sourceImageDataUrl,
    };
  });

  if (normalized.length > 0) return normalized;
  return [
    {
      id: "detected-1",
      tag: normalizeGarmentTag({}, fallbackName),
      imageDataUrl: sourceImageDataUrl,
      sourceImageDataUrl,
    },
  ];
}

function normalizeCandidateContainer(payload: LooseDetectedGarmentPayload): LooseDetectedGarmentPayload[] {
  const candidates = readFirstDefined(payload, ["items", "garments", "clothes", "candidates", "detectedGarments"]);
  return Array.isArray(candidates) ? (candidates as LooseDetectedGarmentPayload[]) : [payload];
}

function normalizeCropBox(value: unknown): GarmentCropBox | undefined {
  if (Array.isArray(value) && value.length >= 4) {
    const [x, y, width, height] = value.map((part) => Number(part));
    return validCropBox({ x, y, width, height });
  }

  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const x = Number(readFirstDefined(record, ["x", "left"]));
  const y = Number(readFirstDefined(record, ["y", "top"]));
  const width = Number(readFirstDefined(record, ["width", "w"]));
  const height = Number(readFirstDefined(record, ["height", "h"]));
  return validCropBox({ x, y, width, height });
}

function validCropBox(box: GarmentCropBox): GarmentCropBox | undefined {
  if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) return undefined;
  const x = clampNumber(box.x, 0, 0, 1);
  const y = clampNumber(box.y, 0, 0, 1);
  const width = clampNumber(box.width, 1 - x, 0.05, 1 - x);
  const height = clampNumber(box.height, 1 - y, 0.05, 1 - y);
  return { x, y, width, height };
}

function stringifySearchResponse(data: MiniMaxSearchResponse) {
  if (data.content) return data.content;
  return (data.results ?? [])
    .map((result) => [result.title, result.snippet, result.content].filter(Boolean).join(" "))
    .filter(Boolean)
    .join("\n");
}

function normalizeWeatherInsight(payload: Partial<WeatherInsight>, fallbackSource: WeatherInsight["source"]): WeatherInsight {
  const weatherValues: WeatherInsight["weather"][] = ["sunny", "cloudy", "rainy", "windy"];
  const sourceValues: WeatherInsight["source"][] = ["forecast", "confirmed", "typical", "fallback", "unavailable"];
  const source = sourceValues.includes(payload.source as WeatherInsight["source"]) ? (payload.source as WeatherInsight["source"]) : fallbackSource;
  return {
    weather: weatherValues.includes(payload.weather as WeatherInsight["weather"]) ? (payload.weather as WeatherInsight["weather"]) : "cloudy",
    temperatureC: clampNumber(payload.temperatureC, 23, -30, 45),
    summary: typeof payload.summary === "string" && payload.summary.trim() ? payload.summary.trim() : (source === "unavailable" ? "未获取到实时天气，请手动确认" : "已获取天气参考"),
    source,
    sceneType: SCENE_TYPES.includes(payload.sceneType as SceneInsight["sceneType"]) ? (payload.sceneType as SceneInsight["sceneType"]) : "unknown",
    sceneSummary: typeof payload.sceneSummary === "string" ? payload.sceneSummary : undefined,
    weatherConfidence: clampNumber(payload.weatherConfidence, source === "forecast" ? 0.7 : 0, 0, 1),
    needsConfirmation: payload.needsConfirmation ?? source === "unavailable",
    question: typeof payload.question === "string" ? payload.question : undefined,
  };
}

function splitPrimaryAndSecondaryColors(primaryColors: string[], secondaryColors: string[], legacyColors: string[]) {
  let normalizedPrimary = primaryColors.length > 0 ? primaryColors : legacyColors.slice(0, 1);
  let normalizedSecondary = secondaryColors;

  // v1.1.27-fix: 缺主色时不再静默兜底为"白"。
  // 透传空数组给 normalizeAiColorInfo，由其在 single 分支返回 emptyColorInfo + needsReview=true，
  // 让 UI 显示"暂未选择"和红色"待确认"角标，避免用户拿到错误的"白"识别结果。

  if (normalizedSecondary.length === 0) {
    const legacySecondary = legacyColors.filter((color) => !normalizedPrimary.includes(color));
    if (legacySecondary.length > 0) {
      normalizedSecondary = legacySecondary;
    } else if (primaryColors.length > 1) {
      normalizedPrimary = primaryColors.slice(0, 1);
      normalizedSecondary = primaryColors.slice(1);
    }
  }

  return {
    primaryColors: uniqueStrings(normalizedPrimary).slice(0, 3),
    secondaryColors: uniqueStrings(normalizedSecondary.filter((color) => !normalizedPrimary.includes(color))).slice(0, 3),
  };
}

function normalizeAiRecommendations(payloads: AiOutfitPayload[], items: WardrobeItem[]): OutfitRecommendation[] {
  const byId = new Map(items.map((item) => [item.id, item]));

  return payloads
    .slice(0, 3)
    .map((payload, index) => ({
      id: payload.id || `ai-outfit-${index + 1}`,
      title: payload.title || `AI 推荐 ${index + 1}`,
      score: clampNumber(payload.score, 60, 0, 100),
      confidence: clampNumber(payload.confidence, 0.7, 0, 1),
      sceneFit: typeof payload.sceneFit === "string" ? payload.sceneFit : undefined,
      slots: (payload.slots ?? [])
        .map((slot) => {
          const item = byId.get(slot.itemId);
          if (!item || !slot.role) return null;
          return { role: slot.role, item, why: slot.why };
        })
        .filter(Boolean) as OutfitRecommendation["slots"],
      reasons: normalizeStringArray(payload.reasons, ["由 MiniMax 根据当前衣橱标签生成"]),
      reuseOutfitIds: normalizeStringArray(payload.reuseOutfitIds, []),
      avoidItems: (payload.avoidItems ?? [])
        .map((avoid) => ({ itemId: Number(avoid.itemId), reason: String(avoid.reason ?? "") }))
        .filter((avoid) => Number.isFinite(avoid.itemId) && avoid.reason.trim().length > 0),
      missingItems: normalizeStringArray(payload.missingItems, []),
      packingReminders: normalizeStringArray(payload.packingReminders, []),
      stylingTips: normalizeStringArray(payload.stylingTips, []),
    }))
    .filter((recommendation) => recommendation.slots.length > 0);
}

function normalizeWardrobeDiagnosis(payload: Partial<WardrobeDiagnosis>): WardrobeDiagnosis {
  return {
    summary: typeof payload.summary === "string" && payload.summary.trim() ? payload.summary.trim() : "衣橱诊断已生成",
    duplicates: normalizeDiagnosisIssues(payload.duplicates),
    gaps: normalizeDiagnosisIssues(payload.gaps),
    idleItems: normalizeDiagnosisIssues(payload.idleItems),
    reusableOutfits: normalizeDiagnosisIssues(payload.reusableOutfits),
    purchaseSuggestions: normalizeStringArray(payload.purchaseSuggestions, []),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDiagnosisIssues(value: unknown): WardrobeDiagnosis["duplicates"] {
  const severityValues = new Set(["low", "medium", "high"]);
  return Array.isArray(value)
    ? value.slice(0, 8).map((issue, index) => {
        const record = typeof issue === "object" && issue ? (issue as Record<string, unknown>) : {};
        const severity = String(record.severity ?? "low");
        return {
          id: String(record.id ?? `issue-${index + 1}`),
          title: String(record.title ?? "诊断项"),
          summary: String(record.summary ?? ""),
          severity: (severityValues.has(severity) ? severity : "low") as "low" | "medium" | "high",
          itemIds: Array.isArray(record.itemIds) ? record.itemIds.map(Number).filter(Number.isFinite) : [],
          outfitIds: normalizeStringArray(record.outfitIds, []),
          action: typeof record.action === "string" ? record.action : undefined,
        };
      })
    : [];
}

function normalizeShoppingImageAnalysis(payload: Partial<ShoppingImageAnalysis>, sourceImage: string): ShoppingImageAnalysis {
  const imageTypes = new Set(["single_item", "outfit", "multiple_items", "taobao_screenshot", "mirror_selfie", "uncertain"]);
  const rawType = String(payload.imageType ?? "uncertain");
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  return {
    imageType: (imageTypes.has(rawType) ? rawType : "uncertain") as ShoppingImageAnalysis["imageType"],
    sourceSummary: typeof payload.sourceSummary === "string" ? payload.sourceSummary : "买前评估图片",
    requiresUserSelection: payload.requiresUserSelection ?? candidates.length !== 1,
    overallOutfitSummary: payload.overallOutfitSummary,
    candidates: candidates.slice(0, 12).map((candidate, index) => normalizeShoppingCandidate(candidate, index, sourceImage)),
    warnings: normalizeStringArray(payload.warnings, []),
  };
}

function normalizeShoppingCandidate(candidate: Partial<ShoppingAssessmentCandidate>, index: number, sourceImage?: string): ShoppingAssessmentCandidate {
  const raw = candidate as Partial<ShoppingAssessmentCandidate> & Record<string, unknown>;
  const tag = normalizeGarmentTag(
    {
      candidateNames: [candidate.name || `候选单品${index + 1}`],
      category: candidate.category,
      colors: candidate.colors,
      seasons: candidate.seasonGuess,
      styles: candidate.styles,
      formality: candidate.formality,
      warmth: candidate.warmth,
      confidence: candidate.confidence,
      needsReview: candidate.needsReview,
      notes: candidate.notes,
    },
    `candidate-${index + 1}`,
  );
  const colorPayload = raw.colors ?? {
    mode: raw.colorMode,
    primary: raw.mainColor,
    primaries: raw.primaryColors,
    accents: raw.accentColors ?? raw.secondaryColors,
  };
  const fitGenderValues = new Set(["menswear", "womenswear", "unisex", "unknown"]);
  const normalizedColors = normalizeAiColorInfo(colorPayload);
  return {
    tempId: typeof candidate.tempId === "string" && candidate.tempId.trim() ? candidate.tempId : `candidate-${index + 1}`,
    name: candidate.name || tag.candidateNames[0] || `候选单品${index + 1}`,
    category: tag.category,
    colors: normalizedColors.needsReview ? tag.colors : normalizedColors.colors,
    seasonGuess: tag.seasons,
    styles: tag.styles,
    formality: tag.formality,
    warmth: tag.warmth,
    fitAndMaterialGuess: candidate.fitAndMaterialGuess,
    visualFeatures: normalizeStringArray(candidate.visualFeatures, []).slice(0, 4),
    cropBox: normalizeCropBox(candidate.cropBox),
    imageDataUrl: candidate.imageDataUrl || sourceImage,
    confidence: tag.confidence,
    needsReview: tag.needsReview,
    notes: candidate.notes ?? (typeof raw.note === "string" ? raw.note : undefined),
    subcategory: typeof candidate.subcategory === "string" ? candidate.subcategory : undefined,
    temperatureRange: candidate.temperatureRange && typeof candidate.temperatureRange === "object" ? {
      minC: typeof candidate.temperatureRange.minC === "number" ? candidate.temperatureRange.minC : undefined,
      maxC: typeof candidate.temperatureRange.maxC === "number" ? candidate.temperatureRange.maxC : undefined,
    } : undefined,
    material: typeof candidate.material === "string" ? candidate.material : undefined,
    price: typeof candidate.price === "number" ? candidate.price : undefined,
    fitGender: typeof candidate.fitGender === "string" && fitGenderValues.has(candidate.fitGender) ? candidate.fitGender as "menswear" | "womenswear" | "unisex" | "unknown" : undefined,
    fitNotes: typeof candidate.fitNotes === "string" ? candidate.fitNotes : undefined,
  };
}

function normalizeShoppingAssessment(payload: Partial<ShoppingAssessment>, candidates: ShoppingAssessmentCandidate[]): ShoppingAssessment {
  const conclusionValues: ShoppingAssessment["conclusion"][] = ["值得买", "可买但重复", "不建议买", "只建议买其中某几件"];
  const conclusion = conclusionValues.includes(payload.conclusion as ShoppingAssessment["conclusion"])
    ? (payload.conclusion as ShoppingAssessment["conclusion"])
    : "可买但重复";
  return {
    conclusion,
    overallScore: clampNumber(payload.overallScore, 60, 0, 100),
    summary: typeof payload.summary === "string" && payload.summary.trim() ? payload.summary.trim() : "已完成买前评估",
    purchaseReasoning: normalizeStringArray(payload.purchaseReasoning, []),
    duplicateAssessment: {
      level: ["low", "medium", "high"].includes(payload.duplicateAssessment?.level ?? "") ? payload.duplicateAssessment!.level : "medium",
      summary: payload.duplicateAssessment?.summary || "已根据衣橱相似款判断重复度",
      similarItems: (payload.duplicateAssessment?.similarItems ?? [])
        .map((item) => ({ candidateTempId: String(item.candidateTempId ?? ""), itemId: Number(item.itemId), similarity: clampNumber(item.similarity, 0, 0, 1), reason: String(item.reason ?? "") }))
        .filter((item) => item.candidateTempId && Number.isFinite(item.itemId)),
    },
    candidateAssessments: ((payload.candidateAssessments ?? candidates.map((candidate) => ({ tempId: candidate.tempId }))) as Array<{
      tempId?: string;
      singleConclusion?: string;
      score?: number;
      strengths?: unknown;
      risks?: unknown;
      wardrobeGapFit?: string;
      recommendedAction?: string;
    }>)
      .map((assessment) => ({
        tempId: String(assessment.tempId ?? ""),
        singleConclusion: (["值得买", "可买但重复", "不建议买"].includes(assessment.singleConclusion ?? "") ? assessment.singleConclusion : conclusion === "只建议买其中某几件" ? "可买但重复" : conclusion) as "值得买" | "可买但重复" | "不建议买",
        score: clampNumber(assessment.score, 60, 0, 100),
        strengths: normalizeStringArray(assessment.strengths, []),
        risks: normalizeStringArray(assessment.risks, []),
        wardrobeGapFit: assessment.wardrobeGapFit || "",
        recommendedAction: assessment.recommendedAction || "",
      }))
      .filter((assessment) => assessment.tempId),
    outfitCompatibility: {
      applies: payload.outfitCompatibility?.applies ?? candidates.length > 1,
      score: clampNumber(payload.outfitCompatibility?.score, 60, 0, 100),
      summary: payload.outfitCompatibility?.summary || "",
      buyOnlyTempIds: normalizeStringArray(payload.outfitCompatibility?.buyOnlyTempIds, []),
      skipTempIds: normalizeStringArray(payload.outfitCompatibility?.skipTempIds, []),
    },
    recommendedOutfits: (payload.recommendedOutfits ?? []).slice(0, 3).map((outfit) => ({
      title: outfit.title || "可搭配方案",
      scene: outfit.scene || "日常",
      slots: (outfit.slots ?? []).map((slot) => ({
        role: slot.role,
        source: slot.source === "candidate" ? "candidate" : "wardrobe",
        tempId: slot.tempId,
        itemId: typeof slot.itemId === "number" ? slot.itemId : undefined,
        why: slot.why || "",
      })),
      missingItems: normalizeStringArray(outfit.missingItems, []),
      notes: normalizeStringArray(outfit.notes, []),
    })),
    suitableScenes: normalizeStringArray(payload.suitableScenes, []),
    unsuitableScenes: normalizeStringArray(payload.unsuitableScenes, []),
    targetSceneAssessment: {
      targetScene: payload.targetSceneAssessment?.targetScene || "",
      fit: (["good", "maybe", "bad", "unknown"].includes(payload.targetSceneAssessment?.fit ?? "") ? payload.targetSceneAssessment!.fit : "unknown") as "good" | "maybe" | "bad" | "unknown",
      reason: payload.targetSceneAssessment?.reason || "",
      adjustments: normalizeStringArray(payload.targetSceneAssessment?.adjustments, []),
    },
    risks: normalizeStringArray(payload.risks, []),
    nextActions: normalizeStringArray(payload.nextActions, ["加入待购清单", "确认购买后录入衣橱", "用这件生成搭配", "重新选择单品"]),
  };
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : fallback;
}

function normalizeColorArray(value: unknown, fallback: string[]) {
  const colorSource =
    typeof value === "string" ? value.replace(/[和及与]/gu, "、").split(/[、,，/|;；\s]+/u) : value;
  const normalized = normalizeSystemColorList(colorSource, 5);
  if (normalized.length === 0) return uniqueStrings(fallback);
  return normalized;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function readFirstDefined(source: object, keys: string[]) {
  const record = source as Record<string, unknown>;
  return keys.map((key) => record[key]).find((value) => value !== undefined && value !== null);
}

function normalizeEnumArray<T extends string>(value: unknown, allowed: T[], fallback: T[]) {
  if (!Array.isArray(value)) return fallback;
  const selected = value.filter((item): item is T => typeof item === "string" && allowed.includes(item as T));
  return selected.length > 0 ? selected : fallback;
}

// v0.9.45-dev 详情页 2.0: AI 穿搭风格建议 — 文本结构化请求, 不传图 (第一版降低成本与失败率)。
// v0.9.47-dev 详情页 3.0: 新增 context 参数 (历史套装 + 推荐搭配单品摘要), 提升建议质量。
export async function generateGarmentStyleAdviceOnDevice(
  item: WardrobeItem,
  settings: DeviceMiniMaxSettings,
  context?: {
    relatedOutfits?: SavedOutfit[];
    recommendedPairingItems?: import("@/lib/garment-detail-pairing").RecommendedPairingItem[];
  },
): Promise<GarmentStyleAdvice> {
  // 动态 import 避免循环依赖 — garment-style-advice 纯函数文件
  const { buildGarmentStyleAdvicePrompt, buildGarmentStyleAdviceSystemPrompt } = await import("@/lib/garment-style-advice");
  const prompt = buildGarmentStyleAdvicePrompt(item, {
    relatedOutfits: context?.relatedOutfits,
    recommendedPairingItems: context?.recommendedPairingItems,
  });
  const systemPrompt = buildGarmentStyleAdviceSystemPrompt();

  const response = await nativePost<MiniMaxResponse>(`${settings.apiHost}/v1/chat/completions`, {
    settings,
    data: {
      model: settings.model || DEFAULT_MODEL,
      messages: [
        { role: "system", name: "System", content: systemPrompt },
        { role: "user", name: "User", content: prompt },
      ],
      temperature: 0.6,
      max_completion_tokens: 800,
      stream: false,
    },
  });

  const content = extractMiniMaxContent(response.data);
  if (response.status >= 400 || response.data.base_resp?.status_code || !content) {
    throw new Error(response.data.error?.message || response.data.base_resp?.status_msg || "AI 建议生成失败");
  }

  const raw = parseJsonObject<Record<string, unknown>>(content);
  if (!raw || typeof raw !== "object") throw new Error("AI 建议解析失败");

  const summary = typeof raw.summary === "string" ? raw.summary.slice(0, 60) : "";
  if (!summary) throw new Error("AI 建议摘要为空");

  const scenes = Array.isArray(raw.scenes)
    ? raw.scenes.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 3)
    : [];
  const pairingTips = Array.isArray(raw.pairingTips)
    ? raw.pairingTips.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.slice(0, 40)).slice(0, 3)
    : [];
  const avoidTips = Array.isArray(raw.avoidTips)
    ? raw.avoidTips.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.slice(0, 40)).slice(0, 2)
    : [];

  return {
    summary,
    scenes,
    pairingTips,
    avoidTips,
    generatedAt: new Date().toISOString(),
  };
}

function cleanName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "新衣服";
}

// v0.9.49-dev 种草 2.0: AI 买前评估。
export async function assessWishlistItemOnDevice(
  wishlistItem: import("@/lib/types").WishlistItem,
  context: {
    ruleAssessment: import("@/lib/types").WishlistRuleAssessment;
    wardrobeItems: import("@/lib/types").WardrobeItem[];
    outfits: import("@/lib/types").SavedOutfit[];
  },
  settings: DeviceMiniMaxSettings,
): Promise<import("@/lib/types").WishlistAssessment> {
  const {
    buildWishlistAssessmentPrompt,
    buildWishlistAssessmentSystemPrompt,
    parseWishlistAssessmentJson,
    sanitizeWishlistAssessment,
  } = await import("@/lib/wishlist-ai-prompt");

  const systemPrompt = buildWishlistAssessmentSystemPrompt();
  const userPrompt = buildWishlistAssessmentPrompt({
    wishlistItem,
    ruleAssessment: context.ruleAssessment,
    wardrobeItems: context.wardrobeItems,
  });

  const response = await nativePost<MiniMaxResponse>(`${settings.apiHost}/v1/chat/completions`, {
    settings,
    data: {
      model: settings.model || DEFAULT_MODEL,
      messages: [
        { role: "system", name: "System", content: systemPrompt },
        { role: "user", name: "User", content: userPrompt },
      ],
      temperature: 0.4,
      max_completion_tokens: 1200,
      stream: false,
    },
  });

  const content = extractMiniMaxContent(response.data);
  if (response.status >= 400 || response.data.base_resp?.status_code || !content) {
    throw new Error(response.data.error?.message || response.data.base_resp?.status_msg || "AI 评估失败");
  }

  const raw = parseWishlistAssessmentJson(content);
  const validIds = new Set(
    context.wardrobeItems
      .map((item) => item.id)
      .filter((id): id is number => typeof id === "number"),
  );

  return sanitizeWishlistAssessment({
    raw,
    ruleAssessment: context.ruleAssessment,
    validWardrobeItemIds: validIds,
  });
}

// v0.9.50-dev 套装 AI 化: 套装建议文本请求，不传衣物图片；打开详情页不会自动调用。
export async function generateOutfitAiSuggestionOnDevice(
  outfit: SavedOutfit,
  context: {
    outfitItems: WardrobeItem[];
    allItems: WardrobeItem[];
  },
  settings: DeviceMiniMaxSettings,
): Promise<OutfitAiSuggestion> {
  const { getReplacementCandidatesForOutfitItem, sanitizeOutfitAiSuggestion } = await import("@/lib/outfit-ai-suggestion");
  const {
    buildOutfitAiSuggestionPrompt,
    buildOutfitAiSuggestionSystemPrompt,
    parseOutfitAiSuggestionJson,
  } = await import("@/lib/outfit-ai-prompt");

  const replacementCandidatesByItem = context.outfitItems.map((item) => ({
    originalItem: item,
    candidates: getReplacementCandidatesForOutfitItem({
      originalItem: item,
      outfit,
      allItems: context.allItems,
      limit: 4,
    }),
  }));

  const response = await nativePost<MiniMaxResponse>(`${settings.apiHost}/v1/chat/completions`, {
    settings,
    data: {
      model: settings.model || DEFAULT_MODEL,
      messages: [
        { role: "system", name: "System", content: buildOutfitAiSuggestionSystemPrompt() },
        {
          role: "user",
          name: "User",
          content: buildOutfitAiSuggestionPrompt({
            outfit,
            outfitItems: context.outfitItems,
            replacementCandidatesByItem,
          }),
        },
      ],
      temperature: 0.35,
      max_completion_tokens: 1200,
      stream: false,
    },
  });

  const content = extractMiniMaxContent(response.data);
  if (response.status >= 400 || response.data.base_resp?.status_code || !content) {
    throw new Error(response.data.error?.message || response.data.base_resp?.status_msg || "套装 AI 建议生成失败");
  }

  const raw = parseOutfitAiSuggestionJson(content);
  const validItemIds = new Set(
    context.allItems.map((item) => item.id).filter((id): id is number => typeof id === "number"),
  );
  const outfitItemIds = new Set(
    context.outfitItems.map((item) => item.id).filter((id): id is number => typeof id === "number"),
  );
  const allowedReplacementItemIdsByOriginal = new Map<number, Set<number>>();
  for (const entry of replacementCandidatesByItem) {
    if (typeof entry.originalItem.id !== "number") continue;
    allowedReplacementItemIdsByOriginal.set(
      entry.originalItem.id,
      new Set(entry.candidates.map((candidate) => candidate.item.id).filter((id): id is number => typeof id === "number")),
    );
  }

  return sanitizeOutfitAiSuggestion({
    raw,
    validItemIds,
    outfitItemIds,
    allowedReplacementItemIdsByOriginal,
    source: "ai",
    fallbackSummary: "已根据这套装的真实衣物生成使用建议。",
  });
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
 const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
 return Math.min(max, Math.max(min, numeric));
}

// ============================================================
// v1.0套装基础信息生成 (与 generateOutfitAiSuggestionOnDevice独立):
// - 只送结构化衣物字段, 不送图片
// - 输出 name / seasons / sceneTags / styleTags / pairingTags / temperatureRange / notes
// - 不直接写数据库; 只给 OutfitIntakeFlow / 编辑页 "重新使用 AI 生成信息" 回填表单
// - 与 generateOutfitAiSuggestionOnDevice 是两个不同能力, 不要混用
// ============================================================
export interface OutfitMetadataGenerationResult {
 name?: string;
 seasons?: Season[];
 sceneTags?: string[];
 styleTags?: string[];
 pairingTags?: string[];
 temperatureRange?: { minC?: number; maxC?: number };
 notes?: string;
}

export interface GenerateOutfitMetadataInput {
 itemIds: number[];
 name?: string;
}

export async function generateOutfitMetadataOnDevice(
 input: GenerateOutfitMetadataInput,
 context: { outfitItems: WardrobeItem[]; allItems: WardrobeItem[] },
 settings: DeviceMiniMaxSettings,
): Promise<OutfitMetadataGenerationResult> {
 const {
 buildOutfitMetadataPrompt,
 buildOutfitMetadataSystemPrompt,
 parseOutfitMetadataJson,
 sanitizeOutfitMetadata,
 } = await import("@/lib/outfit-ai-metadata");

 const response = await nativePost<MiniMaxResponse>(`${settings.apiHost}/v1/chat/completions`, {
 settings,
 data: {
 model: settings.model || DEFAULT_MODEL,
 messages: [
 { role: "system", name: "System", content: buildOutfitMetadataSystemPrompt() },
 { role: "user", name: "User", content: buildOutfitMetadataPrompt({ ...input, outfitItems: context.outfitItems, allItems: context.allItems }) },
 ],
 temperature:0.35,
 max_completion_tokens:800,
 stream: false,
 },
 });

 const content = extractMiniMaxContent(response.data);
 if (response.status >=400 || response.data.base_resp?.status_code || !content) {
 throw new Error(response.data.error?.message || response.data.base_resp?.status_msg || "套装基础信息生成失败");
 }

 const raw = parseOutfitMetadataJson(content);
 return sanitizeOutfitMetadata(raw, { currentName: input.name });
}
