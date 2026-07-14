import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";
import {
  CATEGORY_LABELS,
  FIT_NOTES_MAX_LEN,
  type DetectedGarmentCandidate,
  type ClosetLocation,
  type ColorInfo,
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
import { normalizeAiColorInfo, getPrimaryColors, getAccentColors } from "@/lib/color-fields";
import {
  buildColorRecognitionPrompt,
  normalizeSystemColorList,
} from "@/lib/color-catalog";
import { recordDiagnosticEvent } from "@/lib/diagnostic-log";
import { GARMENT_CATEGORY_CATALOG, getSubcategoryLabel } from "@/lib/garment-category-catalog";
import { normalizeTemperatureRange as normalizeDomainTemperatureRange } from "@/lib/temperature-range";

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

export function clearMiniMaxSettings() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SETTINGS_KEY);
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
    "【裤装判断规则】",
    "短裤：衣物真实裤脚终止于大腿或膝盖附近。",
    "长裤：衣物真实裤脚延伸至小腿、脚踝附近。",
    "不要根据模特腿部是否被截图裁切判断裤长，必须寻找衣物自身真实裤脚。",
    "【工装裤特征】",
    "工装裤特征：明显贴袋、翻盖袋、多口袋、工具袋结构、功能抽绳、粗犷机能设计。",
    "具备工装特征且裤脚在大腿或膝盖附近时，输出 cargo_shorts。",
    "具备工装特征且裤脚延伸至小腿或脚踝时，输出 cargo_pants。",
    "【名称规则】",
    "candidateNames[0] 必须是具体中文衣物名称。",
    "不得返回 garment、clothes、clothing、item、product、单品、衣物、衣服、新衣服、商品、服装。",
    "不得只返回「上衣」「裤子」「鞋」等一级分类名称。",
    "名称必须包含明确衣物品类。",
    "优先使用：主色 + 版型/功能特征 + 标准二级分类名称。",
    "名称控制在 4 至 12 个中文字符。",
    "不要把图片文件名当作衣物名称。",
    "【名称正例】",
    "棕色宽松工装短裤 / 黑色阔腿休闲长裤 / 蓝色直筒牛仔长裤 / 灰色束脚运动长裤。",
    "【版型倾向】不要按颜色刻板判断版型，不要因为粉色判女装，不要因为黑灰蓝判男装。",
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
// 与 `detectGarmentsOnDevice`（多衣物检测 / 拆分）的区别：
// - 走 `tagGarmentOnDevice`（单件衣物属性识别），不会调用多衣物检测 prompt
// - 只返回单件属性标签 + 原图地址，不返回 cropBox / 多候选
// - 正式单件录入必须走这里，禁止调用多衣物检测
// - 失败 fallback：返回可编辑默认 `GarmentTagResult`，由 caller 转 WardrobeDraft
// ============================================================
export interface SingleItemRecognition {
 tag: GarmentTagResult;
 imageDataUrl: string;
 sourceImageDataUrl: string;
 secondaryCropBox?: { x: number; y: number; width: number; height: number };
 cropConfidence?: number;
 cropNeedsReview?: boolean;
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
 * v1.1.31 commit3: catalog 字典动态计算 group/subcategory 数量。
 * 强制 AI 输出 catalog id（subcategory），不输出中文细分。
 */
function buildCatalogDictionaryPrompt(): string {
  const groupCount = GARMENT_CATEGORY_CATALOG.length;
  const subcategoryCount = GARMENT_CATEGORY_CATALOG.reduce(
    (sum, group) => sum + group.subcategories.length,
    0,
  );
  const lines: string[] = [
    `[catalog 字典] ${groupCount} 组 ${subcategoryCount} 项，subcategory 必须输出 id（例如 shirt），不输出中文：`,
  ];
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
    // v1.1.31 commit3: 名称归一化。若 AI 名称是泛化词或为空，尝试从结构字段构造具体名称。
    candidateNames: (() => {
      const raw = normalizeStringArray(data.candidateNames, [cleanName(fallbackName)]).slice(0, 3);
      const first = raw[0];
      if (!isGenericGarmentName(first)) return raw;
      const sub = sanitizeOptionalText(readFirstDefined(data, ["subcategory", "sub_category", "细分", "二级分类"]));
      const categoryId = (data.category as GarmentCategory | undefined) ?? "tops";
      const concrete = buildConcreteGarmentName({
        colors: colorResult.colors,
        category: categoryId,
        subcategory: sub,
      });
      if (concrete) {
        return [concrete, ...raw.filter((n) => !isGenericGarmentName(n))].slice(0, 3);
      }
      // 无法生成具体名：返回空数组（由 buildLocalGarmentDraft 标记 needsReview）
      return [""];
    })(),
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
  return normalizeDomainTemperatureRange(result);
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
function cleanName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "新衣服";
}

// v0.9.49-dev 种草 2.0: AI 买前评估。
function clampNumber(value: unknown, fallback: number, min: number, max: number) {
 const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
 return Math.min(max, Math.max(min, numeric));
}

// ============================================================
// v1.0套装基础信息生成 (与套装详情 AI 建议独立):
// - 只送结构化衣物字段, 不送图片
// - 输出 name / seasons / sceneTags / styleTags / pairingTags / temperatureRange / notes
// - 不直接写数据库; 只给 OutfitIntakeFlow / 编辑页 "重新使用 AI 生成信息" 回填表单
// - 与套装详情 AI 建议是两个不同能力, 不要混用
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
// v1.1.31 commit3: 名称归一化与兜底。
// AI 名称合法时保留；为空 / 英文泛化词 / 中文泛化词时尝试从结构字段生成。
const GENERIC_GARMENT_NAMES: ReadonlySet<string> = new Set([
  // 英文泛化词
  "garment",
  "clothes",
  "clothing",
  "item",
  "product",
  "apparel",
  "outfit",
  "wear",
  "top",
  "bottom",
  "shoe",
  "bag",
  "hat",
  // 中文泛化词
  "单品",
  "衣物",
  "衣服",
  "新衣服",
  "商品",
  "服装",
  "上衣",
  "裤子",
  "半身裙",
  "连体装",
  "鞋",
  "包",
  "帽子",
  "首饰",
  "配饰",
]);

export function isGenericGarmentName(value: string | undefined | null): boolean {
  if (!value) return true;
  const cleaned = value.trim();
  if (!cleaned) return true;
  if (GENERIC_GARMENT_NAMES.has(cleaned)) return true;
  if (GENERIC_GARMENT_NAMES.has(cleaned.toLowerCase())) return true;
  return false;
}

/**
 * v1.1.31 commit3: 从结构字段生成具体中文名称。
 * - 颜色 + subcategory label → "棕色工装短裤"
 * - 颜色为空 → 仅 subcategory label
 * - subcategory 为空 → 返回 undefined（不生成"棕色裤子"这种泛化兜底）
 */
export function buildConcreteGarmentName(input: {
  colors?: ColorInfo;
  primaryColorText?: string;
  category?: GarmentCategory;
  subcategory?: string;
}): string | undefined {
  const subLabel = getSubcategoryLabel(input.category ?? "", input.subcategory);
  if (!subLabel) return undefined;
  // 尝试主色中文：优先从 primaryColorText（已标准化），否则从 colors.primary。
  const mainColor = (input.primaryColorText && input.primaryColorText.trim()) ||
    (input.colors?.mode === "single" ? input.colors.primary.trim() : "") ||
    (input.colors?.mode === "main_with_accent" ? input.colors.primary.trim() : "") ||
    (input.colors?.mode === "multicolor" ? (input.colors.primaries[0] ?? "").trim() : "");
  if (mainColor) {
    return `${mainColor}${subLabel}`;
  }
  return subLabel;
}
