export type GarmentCategory =
  | "tops"
  | "pants"
  | "skirts"
  | "one_piece"
  | "shoes"
  | "bags"
  | "hats"
  | "jewelry"
  | "accessories";

export type Season = "spring" | "summer" | "autumn" | "winter" | "all";
export type GarmentStyle = "casual" | "sweet" | "elegant" | "commute" | "outdoor" | "dinner" | "vacation";
export type GarmentStatus = "active" | "laundry" | "repair" | "archived";

/**
 * v2 (2026-06-23): 颜色信息 discriminated union。
 * 替换 v1 的 colorMode/mainColor/accentColors/primaryColors/secondaryColors 五字段散布。
 */
export type ColorInfo =
  | { mode: "single"; primary: string }
  | { mode: "main_with_accent"; primary: string; accents: string[] }
  | { mode: "multicolor"; primaries: string[] };

export type ColorMode = ColorInfo["mode"];

/** v0.9.46-dev 基础设施批次 1: 适穿温度范围 */
export interface TemperatureRange {
  minC?: number;
  maxC?: number;
}

/** v0.9.46-dev 基础设施批次 1: 种草单品状态 */
export type WishlistStatus = "interested" | "rejected" | "archived";

/** v0.9.46-dev 基础设施批次 1: 种草 AI 评估结论 */
export type WishlistVerdict =
  | "worth_buying"
  | "consider"
  | "not_recommended"
  | "unknown";

/**
 * 用户穿衣画像的版型倾向（"我是哪种版型的人"）。
 *  - menswear   = 男装版型
 *  - womenswear = 女装版型
 *  - unisex     = 中性风格
 *  - unspecified = 不限定/未设置
 *
 * 仅用于 AI 推荐、买前评估、试穿姿态参考，不限制用户录入或购买任何衣物。
 */
export type FitGender = "menswear" | "womenswear" | "unisex" | "unspecified";

/**
 * 单件衣物的版型倾向（"这件是男/女/中性版型"）。
 *  - menswear / womenswear / unisex 同上
 *  - unknown = 未判断（AI 未识别或老数据）
 */
export type GarmentFitGender = "menswear" | "womenswear" | "unisex" | "unknown";

/**
 * v2: fitNotes 字段最大长度（防御性截断，与 device-minimax.ts 中 FIT_NOTES_MAX_LEN 保持一致）。
 */
export const FIT_NOTES_MAX_LEN = 40;

/**
 * v0.9.43-dev (批次 1 缩略图基础设施): 缩略图生成状态。
 *  - "ready"  生成成功, thumbnailDataUrl 有效
 *  - "missing" 尚未生成 (新录入 / 老数据 / 旧版本)
 *  - "failed" 生成失败, 前端应 fallback 到 imageDataUrl 显示
 *
 * 非法值由 migrateItemRecord / thumbnail.ts 清理成 undefined 或 "missing"。
 */
export type ThumbnailStatus = "ready" | "missing" | "failed";

/** v0.9.43-dev (批次 1): 当前缩略图规格版本号。
 * 用于判断已有缩略图是否过期 (例如未来调整缩略图尺寸/质量时升级到 2)。 */
export const CURRENT_THUMBNAIL_VERSION = 1;

export interface ServerAssetReference {
  assetId: string;
  variants: Array<"original" | "thumbnail">;
  sha256?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  variantSha256?: Partial<Record<"original" | "thumbnail", string>>;
}

export interface ServerEntityMetadata {
  serverId?: string;
  serverRevision?: number;
  assetRefs?: Record<string, ServerAssetReference>;
}

export interface ClosetLocation extends ServerEntityMetadata {
  id: string;
  name: string;
  note?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceOutfitImage {
 id: string;
 imageDataUrl: string;
 /** @deprecated 历史字段 */
 sourceImageDataUrl?: string;
 cropBox?: GarmentCropBox;
 /** v0.9.47-dev 详情页 3.0: 灵感图说明 */
 caption?: string;
 createdAt: string;
 updatedAt: string;
 thumbnailDataUrl?: string;
 thumbnailVersion?: number;
 thumbnailUpdatedAt?: string;
 thumbnailStatus?: ThumbnailStatus;
 cropRevision?: number;
 thumbnailCropRevision?: number;
 assetRef?: ServerAssetReference;
}

/** v0.9.45-dev 详情页 2.0: AI 穿搭风格建议，由 MiniMax 按衣物结构化属性生成。 */
export interface GarmentStyleAdvice {
  summary: string;
  scenes: string[];
  pairingTips: string[];
  avoidTips: string[];
  generatedAt: string;
}

/**
 * v2 (2026-06-23): 衣物通用字段。WardrobeItem / WishlistItem 都继承它。
 * 颜色用 ColorInfo discriminated union，价格统一为 price，备注统一为 notes。
 */
export interface BaseItem {
  name: string;
  /** 唯一完整原图 dataURL */
  imageDataUrl: string;
  /** @deprecated 历史字段，新数据不再写入，读取时兜底到 imageDataUrl */
  sourceImageDataUrl?: string;
  thumbnailDataUrl?: string;
  cropBox?: GarmentCropBox;
  category: GarmentCategory;
  /** v2: catalog subcategory id（如 "shirt"），不是中文 label */
  subcategory?: string;
  /** v2: 颜色信息 discriminated union */
  colors: ColorInfo;
  seasons: Season[];
  styles: GarmentStyle[];
  /** 1-5 */
  formality?: number;
  /** 1-5 */
  warmth?: number;
  temperatureRange?: TemperatureRange;
  material?: string;
  /** 版型倾向：男装 / 女装 / 中性 / 未判断 */
  fitGender?: GarmentFitGender;
  /** AI 识别给出的版型说明短句，最多 40 字 */
  fitNotes?: string;
  /** 备注（用户/AI 共用，统一 notes 复数） */
  notes?: string;
  /** 含义按状态决定：种草=售价，衣橱=历史成本 */
  price?: number;
  productUrl?: string;
  /** 当前裁切版本号 */
  cropRevision?: number;
  /** 当前缩略图对应的裁切版本号 */
  thumbnailCropRevision?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WardrobeItem extends Omit<BaseItem, "sourceImageDataUrl">, ServerEntityMetadata {
  id?: number;
  locationId: string;
  status: GarmentStatus;
  wornDates: string[];
  purchaseDate?: string;
  referenceOutfitImages?: ReferenceOutfitImage[];
  aiStyleAdvice?: GarmentStyleAdvice;
  aiConfidence?: number;
  needsReview?: boolean;
  thumbnailVersion?: number;
  thumbnailUpdatedAt?: string;
  thumbnailStatus?: ThumbnailStatus;
}

export interface GarmentCropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedGarmentCandidate {
  id: string;
  tag: GarmentTagResult;
  cropBox?: GarmentCropBox;
  imageDataUrl: string;
  /** @deprecated 历史字段 */
  sourceImageDataUrl?: string;
}

export interface SimilarWardrobeMatch {
  item: WardrobeItem;
  similarity: number;
  reasons: string[];
}

export interface OutfitRequest {
  destination: string;
  date: string;
  activity: GarmentStyle | string;
  weather: "sunny" | "cloudy" | "rainy" | "windy";
  temperatureC: number;
  stylePreference: GarmentStyle | string;
  availableLocationIds: string[];
}

export interface OutfitSlot {
  role: "上衣" | "裤子" | "半身裙" | "连体装" | "鞋" | "包" | "帽子" | "首饰" | "配饰";
  item: WardrobeItem;
  why?: string;
}

export interface OutfitRecommendation {
  id: string;
  title: string;
  score: number;
  confidence?: number;
  sceneFit?: string;
  slots: OutfitSlot[];
  reasons: string[];
  reuseOutfitIds?: string[];
  avoidItems?: Array<{ itemId: number; reason: string }>;
  missingItems: string[];
  packingReminders: string[];
  stylingTips?: string[];
}

export interface OutfitAiReplacementSuggestion {
  originalItemId: number;
  suggestedItemIds: number[];
  reason: string;
}

export interface OutfitAiReplacementSuggestion {
  originalItemId: number;
  suggestedItemIds: number[];
  reason: string;
}

export interface OutfitAiSuggestion {
  summary: string;
  suitableScenes: string[];
  unsuitableScenes: string[];
  strengths: string[];
  risks: string[];
  replacementSuggestions: OutfitAiReplacementSuggestion[];
  missingItems: string[];
  generatedAt: string;
  source?: "ai" | "local";
}

export interface SavedOutfit extends ServerEntityMetadata {
  id: string;
  name: string;
  itemIds: number[];
  coverImageDataUrl?: string;
  previewImageDataUrl?: string;
  destination?: string;
  activity?: string;
  style?: string;
  source?: "manual" | "ai" | "capture";
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  /** @deprecated 历史字段 */
  sourceImageDataUrl?: string;
  /** v0.9.46-dev 基础设施批次 1: 套装卡片缩略图 */
  thumbnailDataUrl?: string;
  thumbnailVersion?: number;
  thumbnailUpdatedAt?: string;
  thumbnailStatus?: "ready" | "failed";
  /** v0.9.46-dev 基础设施批次 1: 适合季节 */
  seasons?: Season[];
  /** v0.9.46-dev 基础设施批次 1: 适合场景 */
  sceneTags?: string[];
  /** v0.9.46-dev 基础设施批次 1: 风格标签 */
  styleTags?: string[];
  /** v0.9.46-dev 基础设施批次 1: 搭配标签 */
  pairingTags?: string[];
  /** v0.9.46-dev 基础设施批次 1: 适穿温度 */
  temperatureRange?: TemperatureRange;
  /** v0.9.46-dev 基础设施批次 1: 备注 */
  notes?: string;
  /** v0.9.46-dev 基础设施批次 1: 穿过日期 YYYY-MM-DD */
  wornDates?: string[];
  /** v0.9.47-dev 套装资产中心: 穿搭实图列表 */
  outfitRealImages?: OutfitRealImage[];
  /** v0.9.47-dev 套装资产中心: 自动生成的四宫格封面 data URL */
  autoCoverImageDataUrl?: string;
  /** v0.9.50-dev 套装 AI 化: 手动触发生成的套装建议缓存。 */
  aiSuggestion?: OutfitAiSuggestion;
}

/** v0.9.46-dev 基础设施批次 1: 种草 AI 评估结果 */
export interface WishlistAssessment {
  score?: number;
  verdict: WishlistVerdict;
  summary: string;
  matchReasons: string[];
  conflictReasons: string[];
  similarOwnedItemIds: number[];
  suggestedOutfits: Array<{
    title: string;
    itemIds: number[];
    reason: string;
  }>;
  missingItems?: string[];
  generatedAt: string;
}

/** v0.9.49-dev 种草 2.0: 规则预评估结果 */
export interface WishlistRuleAssessment {
  score: number;
  localVerdict: WishlistVerdict;
  matchCount: number;
  similarCount: number;
  highSimilarityCount: number;
  duplicateRisk: "low" | "medium" | "high";
  pairingCoverage: "low" | "medium" | "high";
  informationCompleteness: "low" | "medium" | "high";
  priceLevel: "low" | "medium" | "high" | "unknown";
  recommendedPairings: WishlistPairingMatch[];
  similarOwnedItems: SimilarOwnedWishlistMatch[];
  missingInfoHints: string[];
  summary: string;
}

/** v0.9.49-dev 种草 2.0: 种草搭配匹配 */
export interface WishlistPairingMatch {
  item: WardrobeItem;
  score: number;
  reasons: string[];
  confidence: "high" | "medium" | "low";
  availabilityHint?: string;
}

/** v0.9.49-dev 种草 2.0: 相似已有单品匹配 */
export interface SimilarOwnedWishlistMatch {
  item: WardrobeItem;
  similarity: number;
  reasons: string[];
}

/** v2 (2026-06-23): 种草 / 心愿单单品。继承 BaseItem，价格 = price，备注 = notes。 */
export interface WishlistItem extends BaseItem, ServerEntityMetadata {
  id: string;
  status: WishlistStatus;
  convertedItemId?: number;
  convertedAt?: string;
  convertedItemDeletedAt?: string;
  aiAssessment?: WishlistAssessment;
}

export interface WeatherInsight {
  weather: OutfitRequest["weather"];
  temperatureC: number;
  summary: string;
  source: "forecast" | "confirmed" | "typical" | "fallback" | "unavailable";
  sceneType?: SceneType;
  sceneSummary?: string;
  weatherConfidence?: number;
  needsConfirmation?: boolean;
  question?: string;
}

export type SceneType =
  | "city"
  | "restaurant"
  | "bar"
  | "hotel"
  | "cruise"
  | "theme_park"
  | "water_park"
  | "ski"
  | "camping"
  | "business"
  | "formal_event"
  | "outdoor"
  | "unknown";

export interface SceneInsight {
  sceneType: SceneType;
  summary: string;
  constraints: string[];
}

export interface GarmentTagResult {
  candidateNames: string[];
  category: GarmentCategory;
  subcategory?: string;
  colors: ColorInfo;
  seasons: Season[];
  styles: GarmentStyle[];
  temperatureRange?: TemperatureRange;
  material?: string;
  formality: number;
  warmth: number;
  confidence: number;
  needsReview: boolean;
  notes?: string;
  fitGender?: GarmentFitGender;
  /** AI 识别给出的版型判断短句，最多 40 字 */
  fitNotes?: string;
}

export interface TryOnProfile extends ServerEntityMetadata {
  id: "default";
  enabled: boolean;
  fullBodyImageDataUrl?: string;
  faceImageDataUrl?: string;
  heightCm?: number;
  bodyType?: "slim" | "balanced" | "curvy" | "plus" | "custom";
  bodyTypeCustom?: string;
  shoulderWidth?: "narrow" | "normal" | "wide";
  legRatio?: "short" | "normal" | "long";
  hairDescription?: string;
  skinToneDescription?: string;
  styleNote?: string;
  /**
   * 用户穿衣版型倾向。默认 "unspecified"。
   * 仅用于 AI 推荐、买前评估、试穿姿态参考，不限制录入或购买任何衣物。
   */
  fitGender?: FitGender;
  updatedAt: string;
}

/**
 * 注入到 LLM prompt 的穿衣画像摘要 (v0.9.23-dev)。
 *  - 字段为空时**不**进 summary, 减少 prompt 噪声和 token 数
 *  - `enabled` 始终返回 (决定参考照是否参与试穿图附件)
 *  - 其他文字画像 (fitGender/身高/体型/肩宽/腿长/发型/肤色/备注) 仅在有值时出现
 *  - 仅用于 JSON.stringify 注入 prompt, 不要做字段级类型访问
 */
export interface TryOnProfileSummary {
  enabled: boolean;
  fitGender?: FitGender;
  heightCm?: number;
  /**
   * 体型。custom 时合并为 bodyTypeCustom 字符串 (避免 prompt 看到两个字段二义性)。
   */
  bodyType?: string;
  shoulderWidth?: TryOnProfile["shoulderWidth"];
  legRatio?: TryOnProfile["legRatio"];
  hairDescription?: string;
  skinToneDescription?: string;
  styleNote?: string;
}

/** v0.9.47-dev 套装资产中心: 穿搭实图 */
export interface OutfitRealImage {
  id: string;
  imageDataUrl: string;
  /** @deprecated 历史字段 */
  sourceImageDataUrl?: string;
  thumbnailDataUrl?: string;
  caption?: string;
  takenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WardrobeBackup {
  version: 5;
  exportedAt: string;
  locations: ClosetLocation[];
  items: WardrobeItem[];
  outfits?: SavedOutfit[];
  wishlistItems?: WishlistItem[];
  tryOnProfile?: TryOnProfile;
  outfitPlanEntries?: OutfitPlanEntry[];
  outfitCalendarPlans?: OutfitCalendarPlan[];
  planPackingChecklistItems?: PlanPackingChecklistItem[];
}

// ============================================================
// v1.1.0-dev 穿搭计划: 单日穿搭计划
// ============================================================

export type OutfitPlanEntryStatus = "planned" | "worn" | "skipped" | "changed";

/** v1.1.0 fix: 计划场景/时段，用于同一天多套排序和主展示 */
export type OutfitPlanEntryRole = "primary" | "backup" | "morning" | "afternoon" | "evening" | "other";

/** v1.1.0 fix: 实际穿着来源，用于取消已穿时恢复正确状态 */
export type OutfitWearOrigin = "planned_confirmed" | "manual_actual";

export interface OutfitPlanEntry extends ServerEntityMetadata {
  id: string;
  date: string;
  outfitId?: string;
  itemIds?: number[];
  calendarPlanId?: string;
  title?: string;
  scene?: string;
  weatherNote?: string;
  status: OutfitPlanEntryStatus;
  wornDateLinked?: string;
  actualOutfitId?: string;
  notes?: string;
  /** v1.1.0 fix: 同一天多套时，哪套作为日历主展示计划 */
  isPrimary?: boolean;
  /** v1.1.0 fix: 同一天多套排序，越小越靠前 */
  sortOrder?: number;
  /** v1.1.0 fix: 计划场景/时段，仅用于 UI 展示和排序 */
  role?: OutfitPlanEntryRole;
  /** v1.1.0 fix: 同一天多套实际穿搭时，哪套作为实际主展示 */
  isPrimaryActual?: boolean;
  /** v1.1.0 fix: 实际穿着来源；取消已穿时恢复 planned 或删除纯实际 entry */
  wearOrigin?: OutfitWearOrigin;
  /** v1.1.0 fix: 兼容简化实现：如果不用 wearOrigin，至少使用此字段 */
  plannedBeforeWorn?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// v1.1.0-dev 穿搭计划: 范围计划 (旅行/出差/自定义)
// ============================================================

export type OutfitCalendarPlanType = "travel" | "business" | "custom";
export type OutfitCalendarPlanTone = "denim" | "moss" | "clay" | "amber" | "rose" | "purple" | "slate";

export interface OutfitCalendarPlan extends ServerEntityMetadata {
  id: string;
  type: OutfitCalendarPlanType;
  title: string;
  startDate: string;
  endDate: string;
  tone: OutfitCalendarPlanTone;
  destination?: string;
  activities?: string[];
  weatherNote?: string;
  notes?: string;
  packingEnabled?: boolean;
  aiSummary?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// v1.1.0-dev 穿搭计划: 打包清单
// ============================================================

export type PlanPackingChecklistSource = "wardrobe" | "manual" | "ai" | "rule";

export interface PlanPackingChecklistItem {
  id: string;
  calendarPlanId: string;
  source: PlanPackingChecklistSource;
  itemId?: number;
  label: string;
  category?: string;
  quantity?: number;
  dateKeys?: string[];
  checked: boolean;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WardrobeDiagnosisIssue {
  id: string;
  title: string;
  summary: string;
  severity: "low" | "medium" | "high";
  itemIds?: number[];
  outfitIds?: string[];
  action?: string;
}

export interface WardrobeDiagnosis {
  summary: string;
  duplicates: WardrobeDiagnosisIssue[];
  gaps: WardrobeDiagnosisIssue[];
  idleItems: WardrobeDiagnosisIssue[];
  reusableOutfits: WardrobeDiagnosisIssue[];
  purchaseSuggestions: string[];
  updatedAt: string;
}

export type ShoppingAssessmentConclusion = "值得买" | "可买但重复" | "不建议买" | "只建议买其中某几件";

export interface ShoppingAssessmentCandidate {
  tempId: string;
  name: string;
  category: GarmentCategory;
  subcategory?: string;
  colors: ColorInfo;
  seasonGuess: Season[];
  styles: GarmentStyle[];
  formality: number;
  warmth: number;
  fitAndMaterialGuess?: string;
  visualFeatures: string[];
  cropBox?: GarmentCropBox;
  imageDataUrl?: string;
  confidence: number;
  needsReview: boolean;
  notes?: string;
  temperatureRange?: TemperatureRange;
  material?: string;
  price?: number;
  fitGender?: GarmentFitGender;
  fitNotes?: string;
}

export interface ShoppingImageAnalysis {
  imageType: "single_item" | "outfit" | "multiple_items" | "taobao_screenshot" | "mirror_selfie" | "uncertain";
  sourceSummary: string;
  requiresUserSelection: boolean;
  overallOutfitSummary?: {
    exists: boolean;
    style?: string;
    mainColors?: string[];
    formality?: number;
    seasonGuess?: Season[];
    note?: string;
  };
  candidates: ShoppingAssessmentCandidate[];
  warnings: string[];
}

export interface ShoppingAssessment {
  conclusion: ShoppingAssessmentConclusion;
  overallScore: number;
  summary: string;
  purchaseReasoning: string[];
  duplicateAssessment: {
    level: "low" | "medium" | "high";
    summary: string;
    similarItems: Array<{ candidateTempId: string; itemId: number; similarity: number; reason: string }>;
  };
  candidateAssessments: Array<{
    tempId: string;
    singleConclusion: Exclude<ShoppingAssessmentConclusion, "只建议买其中某几件">;
    score: number;
    strengths: string[];
    risks: string[];
    wardrobeGapFit: string;
    recommendedAction: string;
  }>;
  outfitCompatibility: {
    applies: boolean;
    score: number;
    summary: string;
    buyOnlyTempIds: string[];
    skipTempIds: string[];
  };
  recommendedOutfits: Array<{
    title: string;
    scene: string;
    slots: Array<{
      role: OutfitSlot["role"];
      source: "candidate" | "wardrobe";
      tempId?: string;
      itemId?: number;
      why: string;
    }>;
    missingItems: string[];
    notes: string[];
  }>;
  suitableScenes: string[];
  unsuitableScenes: string[];
  targetSceneAssessment: {
    targetScene: string;
    fit: "good" | "maybe" | "bad" | "unknown";
    reason: string;
    adjustments: string[];
  };
  risks: string[];
  nextActions: string[];
}

export const CATEGORY_LABELS: Record<GarmentCategory, string> = {
  tops: "上衣",
  pants: "裤子",
  skirts: "半身裙",
  one_piece: "连体装",
  shoes: "鞋",
  bags: "包",
  hats: "帽子",
  jewelry: "首饰",
  accessories: "配饰",
};

export const SEASON_LABELS: Record<Season, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
  all: "四季",
};

export const STYLE_LABELS: Record<GarmentStyle, string> = {
  casual: "休闲",
  sweet: "甜美",
  elegant: "优雅",
  commute: "通勤",
  outdoor: "户外",
  dinner: "吃饭",
  vacation: "旅行",
};

export const STATUS_LABELS: Record<GarmentStatus, string> = {
  active: "可穿",
  laundry: "待洗",
  repair: "待修",
  archived: "暂不穿",
};

// v1.1.27: 标准颜色目录已迁移至 @/lib/color-catalog。types.ts 不再维护 COLOR_OPTIONS。
// 业务类型 ColorInfo / ColorMode 仍在本文件内。

export const DEFAULT_LOCATIONS: ClosetLocation[] = [
  {
    id: "home",
    name: "默认衣橱",
    note: "默认衣橱",
    sortOrder: 1,
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
  },
];
