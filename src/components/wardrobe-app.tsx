"use client";

import { App } from "@capacitor/app";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { useAppNavigationController } from "@/components/use-app-navigation-controller";
import type { AppRoute } from "@/lib/app-route";
import { getBackRoute, isDetailRoute, isIntakeRouteName } from "@/lib/app-route";
import {
  Archive,
  BarChart3,
  Briefcase,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crop,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FolderOpen,
  GalleryVerticalEnd,
  ImageIcon,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  MoreHorizontal,
  Plus,
  RefreshCw,
  SaveAll,
  ScrollText,
  Search,
  Settings,
  Shield,
  Shirt,
  ShoppingBag,
  Sparkles,
  Trash2,
  Upload,
  User,
  WandSparkles,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OutfitListView } from "@/components/outfit-list-view";
import { GarmentDetail30 } from "@/components/garment-detail-3.0";
import { GarmentIntakeFlow } from "@/components/garment-intake-flow";
import { OutfitCover } from "@/components/outfit-cover";
import { WishlistView20 } from "@/components/wishlist-view-2.0";
import { WearStatisticsView } from "@/components/wear-statistics-view";
import { getRecommendedPairingItemsForItem } from "@/lib/garment-detail-pairing";
import { garmentDraftToWardrobeItem } from "@/lib/intake-save-adapters";
import { deleteItemsWithCascade } from "@/lib/data-repo";
import { useWardrobeDataController } from "@/components/use-wardrobe-data-controller";
import { useWardrobeMessageController } from "@/components/use-wardrobe-message-controller";
import { useWardrobeLightboxController } from "@/components/use-wardrobe-lightbox-controller";
import { WardrobeImageSourceSheet } from "@/components/wardrobe-image-source-sheet";
import { WardrobeHiddenImageInputs } from "@/components/wardrobe-hidden-image-inputs";
import { createActionsForView, preferredCreateActionByView, type CreateActionType, type CreateActionItem, type ViewKey } from "@/components/wardrobe-create-actions";
import { useWardrobeImageIntakeController } from "@/components/use-wardrobe-image-intake-controller";
import { useWardrobeCaptureQueueController } from "@/components/use-wardrobe-capture-queue-controller";
import { WardrobeSelectedImagesReviewPortal } from "@/components/wardrobe-selected-images-review-portal";
import { BatchReviewView } from "@/components/batch-review-view";
import {
  AnimatedPage,
  AiTaskProgressCard,
  MotionAccordion,
  MotionCard,
  MotionCheckBadge,
  MotionImageLightbox,
  MotionPopoverMenu,
  MotionSheet,
  MotionShimmer,
  MotionToast,
} from "@/components/motion-common";
import { duration, ease, staggerReveal, spring } from "@/lib/motion-tokens";
import { generateThumbnailSafe } from "@/lib/thumbnail-runtime";
import { backfill } from "@/lib/thumbnail-backfill";
import { countMissingThumbnails } from "@/lib/thumbnail";
import { GarmentImage } from "@/components/garment-image";

// v1.1.23 six-page design: 共享的 item/ 编辑/详情展示小组件。
import { ItemField } from "@/components/item/field";
import { WardrobeExtras } from "@/components/item/wardrobe-extras";
import { ItemSectionCard } from "@/components/item/section-card";
import { ItemColorFields } from "@/components/item/color-fields";
import { CategorySubcategoryPicker } from "@/components/category-subcategory-picker";
import { TemperatureRangeSlider } from "@/components/temperature-range-slider";
import { FIT_NOTES_MAX_LEN } from "@/lib/types";
import { buildWardrobeEditRecognitionPatch } from "@/lib/item-recognition-patch";
import { SwipeImageCarousel, type SwipeSlide } from "@/components/swipe-image-carousel";
import { COLOR_SWATCHES, COLOR_OPTIONS, type SystemColor } from "@/lib/color-catalog";
import { GarmentImmersiveDetail } from "@/components/garment-immersive-detail";
import { GarmentColorInline } from "@/components/catalog-waterfall-card";
import { formatGarmentCategoryColorLine, formatGarmentWearLine } from "@/lib/catalog-card-format";
import { exportWardrobeDiagnosticLog, recordDiagnosticEvent } from "@/lib/diagnostic-log";
import {
  ChipGroup,
  SelectableChipGroup,
  RangeField,
} from "@/components/wardrobe-form-controls";
import { validateLatestBackupReferences, applyLatestWardrobeBackup, type BackupRestorePreview } from "@/lib/backup-restore";
import {
 LONG_TERM_BACKUP_EXTENSION,
 LONG_TERM_BACKUP_DIR_LABEL,
 sortLongTermBackupFiles,
 type LongTermBackupFileEntry,
} from "@/lib/long-term-backup-package";
import {
 exportLongTermBackupToDefault,
 exportLongTermBackupSaveAs,
 listDefaultLongTermBackups,
 restoreDefaultLongTermBackup,
 restorePickedLongTermBackup,
 DEFAULT_BACKUP_READ_REQUIRES_PICKER,
} from "@/lib/long-term-backup";
import {
 CaptureImageQueueItem,
 SelectedImagesReview,
 type SelectedImagesReviewMode,
} from "@/components/selected-images-review";
import { getWardrobeDb, readTryOnProfile, saveTryOnProfile } from "@/lib/db";
import { migrateWishlistItemRecord } from "@/lib/migrate";
import {
 defaultMiniMaxSettings,
 analyzeShoppingImageOnDevice,
 assessShoppingItemOnDevice,
 assessShoppingOutfitOnDevice,
 diagnoseWardrobeOnDevice,
 detectGarmentsOnDevice,
 generateOutfitNameOnDevice,
 generateGarmentStyleAdviceOnDevice,
 generateOutfitPreviewOnDevice,
 hasDeviceMiniMaxKey,
 loadMiniMaxSettings,
 recognizeSingleItemFromDataUrl,
 recommendOutfitsOnDevice,
 resolveWeatherInsightOnDevice,
 saveMiniMaxSettings,
 validateMiniMaxKey,
 type DeviceMiniMaxSettings,
} from "@/lib/device-minimax";
import { ImageCropEditor } from "@/components/image-crop-editor";
import { cropFromOriginal, dataUrlToFile, expandAiCropBox, fileToAiRequestDataUrl, fileToCompressedDataUrl, fileToOriginalDataUrl, isHeicFile, type NormalizedCropBox } from "@/lib/image";
import { fallbackWishlistItem } from "@/lib/wishlist-intake-from-ai";
import { useSoftAiProgress } from "@/lib/use-soft-ai-progress";
import {
  completeProgressNotification,
  dismissProgressNotification,
  ensureProgressNotificationPermission,
  failProgressNotification,
  isNativeProgressNotificationSupported,
  markSynced,
  resetThrottle,
  shouldSyncNotification,
  startProgressNotification,
  summarizeErrorMessage,
  updateProgressNotification,
  type NativeProgressTaskId,
} from "@/lib/native-progress-notification";
import { recommendOutfits } from "@/lib/recommendations";
import { findSimilarWardrobeItems } from "@/lib/similarity";
import { deriveGarmentImageList, type GarmentImageEntry } from "@/lib/garment-image-source";
import { buildOutfitCoverRefreshPatch } from "@/lib/outfit-cover";
import { buildSyncedOutfitPatch, buildSyncedPurchasedWishlistPatch } from "@/lib/wardrobe-reference-sync";
import { getWearSummary, toggleTodayWornDate } from "@/lib/wear-records";
import { useLocalDateKey } from "@/lib/use-local-date-key";
import {
  CATEGORY_LABELS,
  DEFAULT_LOCATIONS,
  SEASON_LABELS,
  STATUS_LABELS,
  STYLE_LABELS,
  type ColorInfo,
  type ColorMode,
  type ClosetLocation,
  type FitGender,
  type GarmentCategory,
  type GarmentFitGender,
  type GarmentStatus,
  type GarmentStyle,
  type GarmentTagResult,
  type OutfitRecommendation,
  type OutfitRequest,
  type SavedOutfit,
  type ShoppingAssessment,
  type ShoppingAssessmentCandidate,
  type ShoppingImageAnalysis,
  type SimilarWardrobeMatch,
  type Season,
  type TryOnProfile,
  type WardrobeDiagnosis,
  type WardrobeBackup,
  type WardrobeItem,
  type WeatherInsight,
  type WishlistItem,
  type OutfitPlanEntry,
  type OutfitCalendarPlan,
  type PlanPackingChecklistItem,
  type GarmentCropBox,
  type ReferenceOutfitImage,
} from "@/lib/types";
import { COLOR_MODE_LABELS } from "@/lib/display-labels";
import { buildColorInfo, emptyColorInfo, getAccentColors, getAllColors, getPrimaryColor, getPrimaryColors, uniqueTrimmed } from "@/lib/color-fields";
import type { GarmentIntakeDraft } from "@/lib/intake-draft";

// ViewKey now imported from wardrobe-create-actions
type PendingCreateAction = "add_single_item" | "create_outfit" | "add_wishlist_item";

export type CaptureMode = "item" | "outfit";

/** 图片录入用途：衣物录入 / 种草录入 / 衣物参考图 */
// P0 收口: 类型允许 null, 表示「当前没有走图片队列正式录入」, 全局加号菜单的
// add_single_item / add_wishlist_item 在 handleCreateAction 里会把它重置为 null,
// 确保后续任何残留的 SelectedImagesReview 路径都不会把衣橱 / 种草用途当正式录入。
export type ImageIntakePurpose = "garment" | "wishlist" | "reference" | null;

/**
 * 首页当前浏览范围。
 * - "all"            => 全部衣橱（不受具体衣橱 id 限制）
 * - "<wardrobe.id>"  => 限定到某个具体衣橱
 *
 * 搜索不受该状态影响；搜索始终基于全部衣物。
 */
type WardrobeScope = "all" | string;

type WardrobeDraft = Omit<WardrobeItem, "id" | "createdAt" | "updatedAt" | "wornDates"> & {
  clientId?: string;
  selected?: boolean;
  batchGroupId?: number;
  similarMatches?: SimilarWardrobeMatch[];
  useExistingItemId?: number;
  captureSource?: "single" | "batch" | "outfit";
  cropBox?: GarmentCropBox;
};

interface EditSnapshot {
  name: string;
  category: GarmentCategory;
  subcategory: string;
  colors: string;
  seasons: string[];
  styles: string[];
  formality: number;
  warmth: number;
  status: GarmentStatus;
  locationId: string;
  notes: string;
  imageDataUrl: string;
  sourceImageDataUrl: string;
  cropBox: string;
  fitGender: string;
  fitNotes: string;
  price: string;
  productUrl: string;
  purchaseDate: string;
  temperatureRange: string;
  material: string;
  aiConfidence: number | undefined;
  needsReview: boolean | undefined;
}

const viewItems: Array<{ key: ViewKey; label: string; icon: typeof Shirt }> = [
  { key: "wardrobe", label: "衣橱", icon: Shirt },
  { key: "recommend", label: "套装", icon: Sparkles },
  { key: "shopping", label: "种草", icon: ShoppingBag },
  { key: "settings", label: "设置", icon: Settings },
];

const categoryOptions = Object.keys(CATEGORY_LABELS) as GarmentCategory[];
const seasonOptions = Object.keys(SEASON_LABELS) as Season[];
const styleOptions = Object.keys(STYLE_LABELS) as GarmentStyle[];
const statusOptions = Object.keys(STATUS_LABELS) as GarmentStatus[];
const MESSAGE_AUTO_DISMISS_MS = 5000;

export interface CaptureCropJob {
  dataUrl: string;
  fileName: string;
  mode: CaptureMode;
  /** 图片录入用途 */
  purpose: ImageIntakePurpose;
  /** 二次裁切时, 传入当前 cropBox 反显裁切范围 */
  startBox?: NormalizedCropBox;
  /** 二次裁切完成后, 回调更新 draft (不修改 sourceImageDataUrl) */
  onConfirm?: (newImageDataUrl: string, newBox: NormalizedCropBox) => void;
}

type BackupOperationState =
  | {
      phase: "exporting";
      operation: "export_default" | "export_save_as";
      title: string;
      status: string;
      progress: number;
    }
  | {
      phase: "scanning";
      operation: "restore_default";
      title: string;
      status: string;
      progress: number;
    }
  | {
      phase: "backup_list";
      operation: "restore_default";
      files: LongTermBackupFileEntry[];
    }
  | {
      phase: "reading";
      operation: "restore_default" | "restore_picker";
      title: string;
      status: string;
      progress: number;
    }
  | {
      phase: "awaiting_confirmation";
      operation: "restore_default" | "restore_picker";
      preview: BackupRestorePreview;
    }
  | {
      phase: "restoring";
      operation: "restore_default" | "restore_picker";
      title: string;
      status: string;
      progress: number;
    }
  | {
      phase: "success";
      operation: "export_default" | "export_save_as" | "restore_default" | "restore_picker";
      title: string;
      status: string;
      resultLabel?: string;
    }
  | {
      phase: "failed";
      operation: "export_default" | "export_save_as" | "restore_default" | "restore_picker";
      title: string;
      error: string;
      retryable: boolean;
    };

async function getRuntimeAppVersion(): Promise<string> {
  try {
    const info = await App.getInfo();
    return info.version || "1.1.30";
  } catch {
    return "1.1.30";
  }
}

async function withKeepAwake<T>(fn: () => Promise<T>): Promise<T> {
  try { await KeepAwake.keepAwake(); } catch {}
  try { return await fn(); } finally {
    try { await KeepAwake.allowSleep(); } catch {}
  }
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    window.requestAnimationFrame(() => resolve());
  });
}

const hasSubPageRef: React.RefObject<boolean | null> = { current: false };

export function WardrobeApp() {
  // v1.1.20-dev (方案 C): 消除独立 activeView useState — view 完全由 navigation.route 派生。
  // Bug 1 根因: 旧版 activeView 独立 state + useEffect 异步同步 + switchView 强制切 view
  //   导致 create_outfit / add_wishlist_item 退出时 activeView 卡在非原 tab,
  //   且 resetToMainTab 同值时 React bail out → useEffect 不跑 → view 无法回切。
  // 修复: route 包含全部 view (含 intake_* 三个录入流 route), view 直接从 route.name 派生。
  // v1.1.7 4A: AppRoute navigation controller
  const navigation = useAppNavigationController();
  const route = navigation.route;
  const { rememberCreateReturnRoute, closeCreateFlow } = navigation;
  // v1.1.20-dev: activeViewForCreateActions 仅用于 (a) 加号弹窗按 view 高亮推荐 action,
  // (b) SettingsView 诊断日志导出。intake_* 三种录入 route 映射回兼容的 ViewKey。
  const activeViewForCreateActions: ViewKey = useMemo(() => {
    if (route.name === "intake_single_item") return "capture";
    if (route.name === "intake_outfit") return "recommend";
    if (route.name === "intake_wishlist") return "shopping";
    if (route.name === "settings_home") return "settings";
    if (route.name === "outfit_home" || route.name === "outfit_detail" || route.name === "outfit_calendar") return "recommend";
    if (route.name.startsWith("wishlist_")) return "shopping";
    return "wardrobe";
  }, [route.name]);
  const [outfitCaptureDetailActive, setOutfitCaptureDetailActive] = useState(false);  // v0.9.8: BatchReviewView isDetail 状态
 	  const [wardrobeSubPageActive, setWardrobeSubPageActive] = useState(false);
  const [outfitSubPageActive, setOutfitSubPageActive] = useState(false);
  // v1.1 review fix: 扩展为子页 key，让 wardrobe-app 能识别当前 outfit 子页（library / detail / planning_calendar / plan_add / packing_list …），
  // 用于全局新建面板在 planning 子页高亮「添加穿搭计划」。
  const [outfitSubPageKey, setOutfitSubPageKey] = useState<string | null>(null);
  const [shoppingSubPageActive, setShoppingSubPageActive] = useState(false);
  const [createOutfitTrigger, setCreateOutfitTrigger] = useState(0);
  const [createWishlistTrigger, setCreateWishlistTrigger] = useState(0);
  const [createOutfitPlanTrigger, setCreateOutfitPlanTrigger] = useState(0);
  const [pendingCreateAction, setPendingCreateAction] = useState<PendingCreateAction | null>(null);
  // v1.1.20-dev (方案 C): createOriginViewRef 不再需要 — 加号弹窗按 activeViewForCreateActions 高亮。
  // 保留 ref stub 以避免下游依赖断裂, 后续 commit 清理。
  const createOriginViewRef = useRef<ViewKey>("wardrobe");
  const wardrobeData = useWardrobeDataController();
  const { items, setItems, locations, setLocations, outfits, setOutfits, wishlistItems, setWishlistItems, outfitPlanEntries, setOutfitPlanEntries, outfitCalendarPlans, setOutfitCalendarPlans, planPackingChecklistItems, setPlanPackingChecklistItems, loading, refreshState } = wardrobeData;
  // Subagent D: 待打开的衣物详情 ID（种草转换后触发）
  const [pendingViewingItemId, setPendingViewingItemId] = useState<number | null>(null);
  const [pendingViewingItemReturnTarget, setPendingViewingItemReturnTarget] = useState<"wardrobe_home" | "wishlist_owned">("wardrobe_home");
  const [wishlistInitialSubPage, setWishlistInitialSubPage] = useState<"purchased" | null>(null);
  const [tryOnProfile, setTryOnProfile] = useState<TryOnProfile>(() => ({ id: "default", enabled: false, fitGender: "unspecified", updatedAt: new Date().toISOString() }));
  const [isReady, setIsReady] = useState(false);
  // v0.9.43-dev 批次 4: 首页懒 enqueue 标记。同一 render 周期不重复 enqueue
  const lastEnqueuedSigRef = useRef<string>("");
  const messageCtrl = useWardrobeMessageController();
  const { message, messageType, showMessage, clearMessage } = messageCtrl;

  // 4C Follow-up: 图片队列状态与控制器（先初始化，供 image intake controller 使用）
  const [captureCropJob, setCaptureCropJob] = useState<CaptureCropJob | null>(null);
  const [captureImageQueue, setCaptureImageQueue] = useState<CaptureImageQueueItem[]>([]);
  const [captureQueueIndex, setCaptureQueueIndex] = useState(0);
  const [captureQueueMode, setCaptureQueueMode] = useState<SelectedImagesReviewMode>("capture");
  const [referenceOutfitTargetItemId, setReferenceOutfitTargetItemId] = useState<number | null>(null);

  // 4C Follow-up: 图片入口控制器（依赖 capture queue 的 setCaptureCropJob）
  const imageIntake = useWardrobeImageIntakeController({
    showMessage,
    clearMessage,
    setCaptureCropJob,
  });

  // 4C Follow-up: 为保持 JSX 兼容性，创建局部别名（后续逐步迁移到直接使用 imageIntake.xxx）
  const captureMode = imageIntake.captureMode;
  const setCaptureMode = imageIntake.setCaptureMode;
  const imageIntakePurpose = imageIntake.imageIntakePurpose;
  const setImageIntakePurpose = imageIntake.setImageIntakePurpose;
  const showImageSourceSheet = imageIntake.showImageSourceSheet;
  const setShowImageSourceSheet = imageIntake.setShowImageSourceSheet;
  const triggerCameraInput = imageIntake.triggerCameraInput;
  const triggerGalleryInput = imageIntake.triggerGalleryInput;
  const handleCameraCapture = imageIntake.handleCameraCapture;
  const handleGallerySelect = imageIntake.handleGallerySelect;

  const [query, setQuery] = useState("");
  // 首页当前浏览范围："all" 或某个衣橱 id。搜索不受该状态影响。
  const [wardrobeScope, setWardrobeScope] = useState<WardrobeScope>("all");
  // 首页分类筛选（横向 chip 行）；不影响全局搜索。
  const [homeCategoryFilter, setHomeCategoryFilter] = useState<GarmentCategory | "all">("all");
  const [isRecognizing, setIsRecognizing] = useState(false);
  const tagProgress = useSoftAiProgress("garment_detection", { label: "AI 识别衣物" });
  const [request, setRequest] = useState<OutfitRequest>(() => createDefaultRequest());
  const [recommendations, setRecommendations] = useState<OutfitRecommendation[]>([]);
	  const [useAiRecommendations, setUseAiRecommendations] = useState(true);
	  const [isRecommending, setIsRecommending] = useState(false);
	  const recProgress = useSoftAiProgress("outfit_recommendation", { label: "AI 生成套装推荐" });
	  // v1.1.4-dev 种草 AI 识别批次: 种草图片队列处理专用进度
	  const wishlistQueueProgress = useSoftAiProgress("shopping_image_analysis", { label: "AI 分析购物图片" });
	  const [weatherInsight, setWeatherInsight] = useState<WeatherInsight | null>(null);
	  const [miniMaxSettings, setMiniMaxSettings] = useState<DeviceMiniMaxSettings>(() => defaultMiniMaxSettings());
  const [showKeyBanner, setShowKeyBanner] = useState(true);
  const [showGarmentIntakeFlow, setShowGarmentIntakeFlow] = useState(false);
  // v1.1.20-dev (方案 C): 删除 v1.1.7 4A 的 route.mainTab → activeView useEffect 同步逻辑。
  // 旧逻辑是 Bug 1 根因之一 — useEffect 异步同步 + showGarmentIntakeFlow guard + React 18 同值 bail out
  // 共同导致 create_outfit / add_wishlist_item 退出时 activeView 卡住。view 现在完全从 route 派生。
		  const [outfitCaptureDrafts, setOutfitCaptureDrafts] = useState<WardrobeDraft[]>([]);
	  const [outfitCaptureGroups, setOutfitCaptureGroups] = useState<WardrobeDraft[][]>([]);
  const [outfitCaptureStatuses, setOutfitCaptureStatuses] = useState<("pending" | "confirmed" | "cancelled")[]>([]);
  const [outfitCaptureNames, setOutfitCaptureNames] = useState<string[]>([]);
  
		  const [outfitCaptureLocationId, setOutfitCaptureLocationId] = useState("");
		  const [outfitCaptureSaveAsOutfit, setOutfitCaptureSaveAsOutfit] = useState(true);
		  const [outfitCaptureReviewIndex, setOutfitCaptureReviewIndex] = useState(0);
	  const [manualSelectedItemIds, setManualSelectedItemIds] = useState<number[]>([]);
	  const [editingOutfitId, setEditingOutfitId] = useState<string | null>(null);
      const [usePersonRef, setUsePersonRef] = useState(tryOnProfile.enabled);
	  const [previewImageDataUrl, setPreviewImageDataUrl] = useState("");
  const [showPreviewContextPopup, setShowPreviewContextPopup] = useState(false);
  const [previewCtxDestination, setPreviewCtxDestination] = useState("");
  const [previewCtxActivity, setPreviewCtxActivity] = useState<GarmentStyle>("casual");
  const [previewCtxStyle, setPreviewCtxStyle] = useState<GarmentStyle>("casual");
  const [previewCtxDate, setPreviewCtxDate] = useState(new Date().toISOString().slice(0, 10));
	  const [isPreviewGenerating, setIsPreviewGenerating] = useState(false);
	  const tryonProgress = useSoftAiProgress("try_on_preview", { label: "AI 生成试穿预览" });
   const lightbox = useWardrobeLightboxController();
  const { expandedImage } = lightbox;
 	 const [showExitDialog, setShowExitDialog] = useState(false);
 	 const [backupOperation, setBackupOperation] = useState<BackupOperationState | null>(null);
  const pendingRestoreRef = useRef<{
    backup: WardrobeBackup;
    preview: BackupRestorePreview;
    operation: "restore_default" | "restore_picker";
  } | null>(null);
 	 const [showCreateSheet, setShowCreateSheet] = useState(false);
  // v0.9.24-dev: onClearAllData 进行中锁, lift 到 WardrobeApp 级, 父级 backButton handler
  // (line 297 下方) 也要感知, 否则在清空中按 Android 返回键会同时弹"退出 App?"对话框
  // (subagent I-3)。ref 锁用于 click handler / backButton handler 的同步守卫 (避免 React
  // state 闭包过期值双触发 race, subagent I-2)。
  const [isClearingAll, setIsClearingAll] = useState(false);
  const isClearingAllRef = useRef(false);

  // v0.9.31-dev: 共享 window 全局滚动容器 + scroll 恢复逻辑保留。
  // v1.1.20-dev (方案 C): key 从 ViewKey 改为 AppRouteName — 每个 route (含 wardrobe/outfit/wishlist
  // 子页 + intake_*) 独立保存滚动位置。
  //
  // 历史 4 个关键点 + 1 个 I-1 加固保留:
  //  1. **保存时机**: switchView (现 setRouteByView) 同步在 setRoute 之前保存旧 route 的 scrollY
  //  2. **消除 inherit 闪动**: switchView 入口先 scrollTo(0, 0)
  //  3. **恢复时机**: motion.div onAnimationComplete 触发
  //  4. **race 防御**: pendingRestoreViewRef 当 generation 计数器
  //  5. **transition 字段区分 enter/exit**: 不依赖 opacity 数值
  const viewScrollPositionsRef = useRef<Record<string, number>>({});
  // v1.1.20-dev (方案 C): activeViewRef 删除 — view 现在从 route 派生, controller 内已有 routeRef。
  // 待恢复的 view key: pendingRestoreViewRef 用 route.name 作为 key (覆盖 wardrobe/outfit/wishlist 子页 + intake_*)。
  // 仍然当 generation 计数器防 race。
  const pendingRestoreViewRef = useRef<string | null>(null);
  // 恢复动作进行中的标记 (subagent I-4: 保留用于未来加全局 scroll listener 守护,
  // 当前 scrollTo 之前/之后 rAF 内不需要重复 check 这个 flag — 简化为只 set/clear)。
  const isRestoringScrollRef = useRef(false);
  // 跟踪最近一次 switchView 序号, 防御 onAnimationComplete 同步 check 跟 rAF2 之间
  // 的细缝 (subagent C-1 修法 1 备选)。当前用 pendingRestoreViewRef 已够, 保留
  // 备用 — 如果未来 onAnimationComplete 改成不同步 check 即可启用。
  const restoreFrameIdRef = useRef<number | null>(null);
  // 用于 GarmentIntakeFlow 多图录入时的 Web fallback 回调
  const pendingGalleryResolverRef = useRef<((files: File[] | null) => void) | null>(null);

  // v1.1.20-dev (方案 C): switchView 改为基于 navigation.openRoute 派生 view。
  // 旧版 setActiveView 会让 activeView 偏离 mainTab (Bug 1 根因), 现改为 setRoute。
  // view 派生自 route.name, motion + AnimatePresence 自动根据 key={route.name} 重 mount。
  function switchView(next: ViewKey): void {
    let targetRoute: AppRoute;
    switch (next) {
      case "wardrobe": targetRoute = { name: "wardrobe_home" }; break;
      case "recommend": targetRoute = { name: "outfit_home" }; break;
      case "shopping": targetRoute = { name: "wishlist_home" }; break;
      case "settings": targetRoute = { name: "settings_home" }; break;
      case "capture":
        // capture 不是合法外部切换目标 (录入流由 handleCreateAction 入口通过 setRoute({name: "intake_*"}) 打开)。
        // 兜底: 切到 wardrobe_home 而不是 no-op。
        targetRoute = { name: "wardrobe_home" };
        break;
    }
    // 同 route 早退 — 避免 React 18 useState 同值 bail out 后的潜在副作用。
    if (targetRoute.name === route.name) return;
    recordDiagnosticEvent("view_switch", { from: route.name, to: next, route });
    if (typeof window === "undefined") {
      navigation.openRoute(targetRoute);
      return;
    }
    // 1. 保存当前 route 的滚动位置 (setRoute 之前同步执行, 防 useScrollLock 副作用)。
    if (document.body.style.position !== "fixed") {
      viewScrollPositionsRef.current[route.name] = window.scrollY || window.pageYOffset || 0;
    }
    // 2. 中断上一次的 restore rAF 链。
    if (restoreFrameIdRef.current !== null) {
      window.cancelAnimationFrame(restoreFrameIdRef.current);
      restoreFrameIdRef.current = null;
    }
    // 3. 触发 setRoute → 重渲染 → AnimatePresence exit → 新页 mount → motion.div
    //    onAnimationComplete → useLayoutEffect 已设 pendingRestoreViewRef → rAF2 scrollTo。
    navigation.openRoute(targetRoute);
  }

  // v0.9.31-dev: 卸载时清理残留的 restore rAF id, 防止 WardrobeApp 卸载后
  // rAF 回调仍访问 ref。
  useEffect(() => () => {
    if (restoreFrameIdRef.current !== null) {
      window.cancelAnimationFrame(restoreFrameIdRef.current);
      restoreFrameIdRef.current = null;
    }
  }, []);


  useEffect(() => {
    setMiniMaxSettings(loadMiniMaxSettings());
    refreshState().catch(() => { showMessage("数据库打开失败，已进入临时演示模式", "error"); }).finally(() => setIsReady(true));
    readTryOnProfile().then(setTryOnProfile).catch(() => {});
  }, []);



  useEffect(() => { if (locations.length === 0) return; setOutfitCaptureLocationId((c) => c || locations[0].id); setRequest((c) => ({ ...c, availableLocationIds: c.availableLocationIds.length > 0 ? c.availableLocationIds : locations.map((l) => l.id) })); }, [locations]);

  useEffect(() => { setUsePersonRef(tryOnProfile.enabled); }, [tryOnProfile.enabled]);

  // v0.9.43-dev 批次 4: 首页懒 enqueue (前 6-10 个 item)。
  // - 不直接 start backfill, 仅入队; backfill 由设置页"优化图片缓存"按钮触发
  // - 用 lastEnqueuedSigRef 记录已 enqueue 的 items 签名, 避免每次 render 重复入队
  // - items 变化时 (新增衣物 / 刷新) 重新计算签名 + enqueue
  // - 超过 10 个不分批, 后续依赖设置页手动触发全量回填
  useEffect(() => {
    if (!Array.isArray(items) || items.length === 0) return;
    const slice = items.slice(0, 10);
    const sig = slice.map((it) => `${it.id ?? "x"}:${it.thumbnailStatus ?? "x"}`).join(",");
    if (sig === lastEnqueuedSigRef.current) return;
    lastEnqueuedSigRef.current = sig;
    backfill.enqueueVisibleItems(slice);
  }, [items]);

  // v1.1.20-dev (方案 C): 删除 v0.9.31-dev "activeViewRef 同步" useEffect — activeViewRef 不再存在。
  // v0.9.31-dev: pendingRestoreViewRef 单一入口 (subagent I-2 修法 B)。
  // v1.1.20-dev: 改为监听 route.name — 每个 route 独立保存滚动位置 generation 计数器,
  // 防 race (快速连点 tab 时旧 onAnimationComplete 在新 route 切换后到达会被 cancel)。
  useLayoutEffect(() => {
    pendingRestoreViewRef.current = route.name;
  }, [route.name]);

  const handleTopLevelBack = useCallback(() => {
    // v0.9.24-dev: onClearAllData 进行中屏蔽返回键。
    // v1.1.20-dev commit2 (P0 诊断): top_level_back_triggered
    // Android 返回键 / Escape 每按一次都打点 — handler 字段标明在哪一层被吃掉。
    // 复现 Bug 1 "返回键到底有没有生效" / 后续 back priority 类 bug 必备。
    const logTopLevelBack = (handler: string | null) => {
      recordDiagnosticEvent("top_level_back_triggered", {
        handler,
        route: route.name,
      });
    };
    if (isClearingAllRef.current) { logTopLevelBack("clearing_all"); return true; }
    if (expandedImage) {
      lightbox.closeExpandedImage();
      logTopLevelBack("lightbox");
      return true;
    }
    if (backupOperation) {
      const backupInProgress =
        backupOperation.phase === "exporting" ||
        backupOperation.phase === "scanning" ||
        backupOperation.phase === "reading" ||
        backupOperation.phase === "restoring";
      if (backupInProgress) {
        showMessage("备份正在进行，请等待完成", "info");
        logTopLevelBack("backup_in_progress");
        return true;
      }
      setBackupOperation(null);
      logTopLevelBack("backup");
      return true;
    }
    if (showCreateSheet) {
      setShowCreateSheet(false);
      setPendingCreateAction(null);
      logTopLevelBack("createSheet");
      return true;
    }
    if (showImageSourceSheet) {
      setShowImageSourceSheet(false);
      setImageIntakePurpose(null);
      setPendingCreateAction(null);
      logTopLevelBack("imageSourceSheet");
      return true;
    }
    if (captureCropJob) {
      setCaptureCropJob(null);
      logTopLevelBack("cropJob");
      return true;
    }
    if (showPreviewContextPopup) {
      setShowPreviewContextPopup(false);
      logTopLevelBack("previewPopup");
      return true;
    }
    if (showGarmentIntakeFlow) { logTopLevelBack("intakeFlow"); return true; }
    if (wardrobeSubPageActive || outfitSubPageActive || shoppingSubPageActive) { logTopLevelBack("subPage"); return true; }
    if (hasSubPageRef.current || outfitCaptureDetailActive) { logTopLevelBack("hasSubPageRef"); return true; }
    if (isDetailRoute(route)) {
      navigation.goBack();
      logTopLevelBack("detailRoute");
      return true;
    }
    if (route.name === "wishlist_purchased" || route.name === "wishlist_rejected" || route.name === "wishlist_archived") {
      navigation.goBack();
      logTopLevelBack("wishlistSubpage");
      return true;
    }
    if (route.name === "outfit_calendar") {
      navigation.goBack();
      logTopLevelBack("outfitCalendar");
      return true;
    }
    setShowExitDialog(true);
    logTopLevelBack("exit");
    return true;
  }, [
    backupOperation,
    captureCropJob,
    expandedImage,
    lightbox,
    navigation,
    outfitCaptureDetailActive,
    outfitSubPageActive,
    route,
    setImageIntakePurpose,
    setShowImageSourceSheet,
    shoppingSubPageActive,
    showCreateSheet,
    showGarmentIntakeFlow,
    showImageSourceSheet,
    showMessage,
    showPreviewContextPopup,
    wardrobeSubPageActive,
  ]);

  useEffect(() => {
    let removed = false;
    let handle: { remove: () => void } | null = null;
    App.addListener("backButton", () => {
      if (removed) return;
      handleTopLevelBack();
    }).then((h) => {
      if (!removed) handle = h;
    });
    return () => {
      removed = true;
      handle?.remove();
    };
  }, [handleTopLevelBack]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      handleTopLevelBack();
    };
    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [handleTopLevelBack]);

  // v1.1.20-dev commit2 (P2 诊断): app_visibility_changed + window_resize_observed
  // App 从后台切回前台 / 横竖屏切换 是 Android 真机高频 bug 源 (WebView 重渲染、
  // 缩略图缓存丢失、滚动位置错乱), 但用户报问题时常常不记得什么时候切过后台。
  // 集中打点 — 导出日志能直接看到完整 visibility + resize 时间线。
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      recordDiagnosticEvent("app_visibility_changed", {
        hidden: document.hidden,
        visibilityState: document.visibilityState,
      });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;
    const handleResize = () => {
      // 节流到 250ms — resize 事件在 Android WebView 高频触发, 不打点会刷屏。
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        // 同尺寸不记录 (软键盘收起时只触发 height 微变)。
        if (width === lastWidth && height === lastHeight) return;
        recordDiagnosticEvent("window_resize_observed", {
          width,
          height,
          previousWidth: lastWidth,
          previousHeight: lastHeight,
          orientation: width > height ? "landscape" : "portrait",
        });
        lastWidth = width;
        lastHeight = height;
      }, 250);
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);



  function patchItemInItemsState(itemId: number, patch: Partial<WardrobeItem>) {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

 async function prepareQueueItemForSingleRecognition(item: CaptureImageQueueItem) {
 const recognitionSourceDataUrl = item.cropped && item.cropBox
 ? await cropFromOriginal(item.originalDataUrl, item.cropBox).catch(() => item.imageDataUrl)
 : item.imageDataUrl || item.originalDataUrl;
 const recognitionFile = await dataUrlToFile(recognitionSourceDataUrl, item.fileName);
 const aiRequestDataUrl = await fileToAiRequestDataUrl(recognitionFile).catch(() => recognitionSourceDataUrl);
 return {
 recognitionSourceDataUrl,
 aiRequestDataUrl,
 sourceImageDataUrl: item.originalDataUrl,
 cropBox: item.cropBox,
 };
 }

 async function processSingleCaptureImage(originalDataUrl: string, fileName: string, mode: CaptureMode) {
	setIsRecognizing(true);
    // v0.9.27-dev: 通知栏 taskId 按 mode 切 — 单件 garment_detection, 整套 / 批量 batch_garment_detection。
    // 切回单件 mode 之后恢复, 避免 "整套识别" 通知残留。
    const nativeTaskId: NativeProgressTaskId =
      mode === "item" ? "garment_detection" : "batch_garment_detection";
    tagProgress.setNotificationTaskId(nativeTaskId);
    tagProgress.start();
    clearMessage();
    try {
      // 新链路: 生成 AI 识别图 (2400px q=0.90 自适应降级) 给 AI, 原图保留供裁切
      const originalFile = await dataUrlToFile(originalDataUrl, fileName);
      const aiRequestDataUrl = await fileToAiRequestDataUrl(originalFile).catch(() => originalDataUrl);

      if (mode === "outfit") {
        const locationId = outfitCaptureLocationId || locations[0]?.id || "home";
        const candidates = await recognizeImageCandidatesFromDataUrl(aiRequestDataUrl, originalDataUrl, fileName, locationId, "outfit");
        candidates.forEach((d) => { d.batchGroupId = 0; });
        setOutfitCaptureDrafts(candidates);
        setOutfitCaptureGroups([candidates]);
        setOutfitCaptureStatuses(["pending"]);
        setOutfitCaptureNames([generateLocalOutfitName(candidates)]);
        setOutfitCaptureReviewIndex(0);
	        tagProgress.complete(true);
        showMessage(`已识别 1 套穿搭候选，共 ${candidates.length} 件单品，请点击图片堆叠确认`);
        return;
      }
    } catch (error) {
      tagProgress.fail(getErrorMessage(error));
      showMessage(getErrorMessage(error), "error");
    } finally {
      setIsRecognizing(false);
    }
  }

  async function recognizeImageCandidatesFromDataUrl(
    aiRequestDataUrl: string,
    originalDataUrl: string,
    fileName: string,
    locationId: string,
    source: WardrobeDraft["captureSource"],
  ) {
    const useAi = hasDeviceMiniMaxKey(miniMaxSettings);
    const candidates = useAi
      ? await withKeepAwake(() => detectGarmentsOnDevice(aiRequestDataUrl, fileName, miniMaxSettings))
      : [{ id: "fallback-1", tag: fallbackTagResult(fileName), imageDataUrl: originalDataUrl, sourceImageDataUrl: originalDataUrl }];
    return Promise.all(candidates.map(async (candidate, index) => {
      // 新链路: AI 返回 cropBox → 自动外扩 10% (避免裁掉衣物) → 从原图高清裁切
      let draft: WardrobeDraft;
      if (candidate.cropBox) {
        const expandedBox = expandAiCropBox(candidate.cropBox, 0.10);
        const croppedHighRes = await cropFromOriginal(originalDataUrl, expandedBox).catch(() => candidate.imageDataUrl);
        draft = tagResultToDraft(candidate.tag, croppedHighRes, originalDataUrl, locationId, source, `${fileName}-${index}`);
        draft.cropBox = expandedBox;  // 保存外扩后的 box (二次裁切基于此)
      } else {
        draft = tagResultToDraft(candidate.tag, candidate.imageDataUrl, originalDataUrl, locationId, source, `${fileName}-${index}`);
        draft.cropBox = undefined;
      }
      return { ...draft, similarMatches: findSimilarWardrobeItems(draft, items) };
    }));
  }

	  function updateOutfitCaptureDraft(index: number, patch: Partial<WardrobeDraft>) { setOutfitCaptureDrafts((c) => c.map((d, i) => (i === index ? { ...d, ...patch } : d))); }

	  async function saveOutfitCaptureDrafts() { if (outfitCaptureDrafts.length === 0) return; const now = new Date().toISOString(); const selectedDrafts = outfitCaptureDrafts.filter((d) => d.selected !== false); if (selectedDrafts.length === 0) { showMessage("请至少选择 1 件要录入的衣物", "info"); return; } const db = getWardrobeDb(); const draftItemIds: number[] = []; let addedCount = 0; for (const sd of selectedDrafts) { if (sd.useExistingItemId) { draftItemIds.push(sd.useExistingItemId); continue; } const id = await db.items.add(outfitCaptureDraftToWardrobeItem(sd, now)); draftItemIds.push(id); addedCount += 1; } if (captureMode === "outfit" && outfitCaptureSaveAsOutfit && draftItemIds.length > 0 && outfitCaptureGroups.length > 0) { const og = new Map<number, number[]>(); for (let di = 0; di < selectedDrafts.length; di++) { const d = selectedDrafts[di]; const gid = d.batchGroupId ?? 0; if (!og.has(gid)) og.set(gid, []); og.get(gid)!.push(draftItemIds[di]); } let gi = 0; for (const gids of og.values()) { if (gids.length > 0) { const name = gi < outfitCaptureNames.length ? outfitCaptureNames[gi] : undefined; await db.outfits.put(createSavedOutfit(gids.filter((id) => id > 0), selectedDrafts, "capture", now, name)); } gi++; } } await refreshState(); setOutfitCaptureDrafts([]); showMessage(captureMode === "outfit" ? `已保存套装，新增 ${addedCount} 件衣物` : `已保存 ${selectedDrafts.length} 件衣物，新增 ${addedCount} 件`); }

  // v0.9.7: 录入当前这一件 (入库 + 删除 drafts 中这一项 + 跳下一件 / 关闭详情)
  async function saveCurrentOutfitCaptureDraft(index: number, nextReviewIndex?: number) {
    if (index < 0 || index >= outfitCaptureDrafts.length) return;
    const current = outfitCaptureDrafts[index];
    if (!current) return;
    if (!current.name?.trim()) {
      showMessage("请先填写衣物名称", "info");
      return;
    }
    try {
      const now = new Date().toISOString();
      const db = getWardrobeDb();
      if (current.useExistingItemId) {
        // 关联到现有衣物: 不写入新衣物, 只更新关联 (此处简化, 实际逻辑跟 saveOutfitCaptureDrafts 一样)
        showMessage(`已关联到现有衣物: ${current.name}`);
      } else {
        await db.items.add(outfitCaptureDraftToWardrobeItem(current, now));
        showMessage(`已录入: ${current.name}`);
      }
      // 从 drafts 列表移除这一件
      const newDrafts = outfitCaptureDrafts.filter((_, i) => i !== index);
      setOutfitCaptureDrafts(newDrafts);
      // 跳下一件 (如果当前是最后, 跳到 0). isDetail 由 BatchReviewView 内 useEffect [drafts.length] 检测关闭
      if (newDrafts.length > 0) {
        const nextIndex = typeof nextReviewIndex === "number"
          ? Math.max(0, Math.min(nextReviewIndex, newDrafts.length - 1))
          : index >= newDrafts.length ? 0 : index;
        setOutfitCaptureReviewIndex(nextIndex);
      }
      await refreshState();
    } catch (err) {
      showMessage(getErrorMessage(err), "error");
    }
  }

  function cancelOutfitCapture() { setOutfitCaptureDrafts([]); setOutfitCaptureGroups([]); setOutfitCaptureStatuses([]); setOutfitCaptureNames([]); }

  function resetCaptureTransientState() {
    setOutfitCaptureDrafts([]);
    setOutfitCaptureGroups([]);
    setOutfitCaptureStatuses([]);
    setOutfitCaptureNames([]);
    setCaptureImageQueue([]);
    setCaptureQueueIndex(0);
    setReferenceOutfitTargetItemId(null);
    setCaptureCropJob(null);
    setPendingCreateAction(null);
  }

  async function saveGarmentIntakeDraft(intakeDraft: GarmentIntakeDraft) {
    const now = new Date().toISOString();
    const item = garmentDraftToWardrobeItem(intakeDraft, { now });
    if (!item.imageDataUrl) {
      showMessage("请先选择衣物图片", "info");
      return;
    }
    await getWardrobeDb().items.add(item);
    await refreshState();
    setShowGarmentIntakeFlow(false);
    setPendingViewingItemReturnTarget("wardrobe_home");
    setPendingViewingItemId(null);
    recordDiagnosticEvent("create_single_item_saved", { returnRoute: navigation.createReturnRoute });
    showMessage("已保存到衣橱");
  }

  function isImagePickerCancelError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    return /cancel|cancelled|canceled|user.*back|no image|未选择|取消/i.test(message);
  }

  async function filesToGarmentIntakePickedImages(files: readonly File[], remaining: number): Promise<import("@/lib/garment-intake-multi-image").GarmentIntakePickedImage[]> {
    const picked: import("@/lib/garment-intake-multi-image").GarmentIntakePickedImage[] = [];
    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      try {
        const file = files[i]!;
        const dataUrl = await fileToCompressedDataUrl(file);
        picked.push({ fileName: file.name || `garment-${Date.now()}-${i + 1}.jpg`, source: "album", dataUrl });
      } catch {
        // Skip failed files
      }
    }
    return picked;
  }

  async function pickGarmentIntakeImages(source: import("@/components/garment-intake-flow").GarmentImageSource, remaining: number): Promise<import("@/lib/garment-intake-multi-image").GarmentIntakePickedImage[]> {
    if (remaining <= 0) return [];
    if (source === "camera") {
      try {
        const { Camera: CapacitorCamera, CameraResultType, CameraSource } = await import("@capacitor/camera");
        const photo = await CapacitorCamera.getPhoto({
          source: CameraSource.Camera,
          resultType: CameraResultType.Uri,
          quality: 92,
          correctOrientation: true,
          allowEditing: false,
        });
        if (!photo.webPath) return [];
        const response = await fetch(photo.webPath);
        const blob = await response.blob();
        const mime = blob.type || "image/jpeg";
        const ext = mime.includes("png") ? "png" : "jpg";
        const fileName = `garment-${Date.now()}.${ext}`;
        const dataUrl = await fileToCompressedDataUrl(new File([blob], fileName, { type: mime }));
        return [{ fileName, source: "camera", dataUrl }];
      } catch (error) {
        if (isImagePickerCancelError(error)) return [];
        throw error;
      }
    } else {
      // Album: try Capacitor pickImages first, then fall back to hidden input
      try {
        const { Camera: CapacitorCamera } = await import("@capacitor/camera");
        const result = await CapacitorCamera.pickImages({ quality: 92, limit: remaining });
        const photos = result.photos ?? [];
        if (photos.length === 0) return [];
        const pickedImages: import("@/lib/garment-intake-multi-image").GarmentIntakePickedImage[] = [];
        for (let i = 0; i < Math.min(photos.length, remaining); i++) {
          const photo = photos[i]!;
          if (!photo.webPath) continue;
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          const mime = blob.type || "image/jpeg";
          const ext = mime.includes("png") ? "png" : "jpg";
          const fileName = `garment-${Date.now()}-${i + 1}.${ext}`;
          const dataUrl = await fileToCompressedDataUrl(new File([blob], fileName, { type: mime }));
          pickedImages.push({ fileName, source: "album", dataUrl });
        }
        return pickedImages;
      } catch (error) {
        if (isImagePickerCancelError(error)) return [];
        if (!imageIntake.galleryInputRef.current) return [];
        // Fall back to hidden input - trigger gallery input and wait
        return new Promise((resolve) => {
          let settled = false;
          let timeout: ReturnType<typeof setTimeout> | null = null;
          const finish = (files: File[] | null) => {
            if (settled) return;
            settled = true;
            if (timeout) clearTimeout(timeout);
            pendingGalleryResolverRef.current = null;
            if (!files || files.length === 0) {
              resolve([]);
              return;
            }
            filesToGarmentIntakePickedImages(files, remaining).then(resolve).catch(() => resolve([]));
          };
          pendingGalleryResolverRef.current?.(null);
          // Store resolver for wardrobe-hidden-image-inputs to call
          pendingGalleryResolverRef.current = finish;
          timeout = setTimeout(() => finish(null), 30000);
          // Trigger the hidden gallery input
          try {
            triggerGalleryInput();
          } catch {
            finish(null);
          }
        });
      }
    }
  }

  // v1.1.16-dev commit1 §3.4.1: 单品录入 AI 识别接线。
  // GarmentIntakeFlow.processAllImagesForRecognition 会调 onProcessImage;
  // 这里返回 LocalImageProcessingResult, 实际 AI 识别由 flow 内部 onProcessImage 完成后
  // 通过 buildLocalGarmentDraft 整合 tagResult。Recognize 走单件属性识别
  // (recognizeSingleItemFromDataUrl), 失败时 throw, flow catch 分支用 fallback。
  async function processGarmentIntakeImage(input: { imageDataUrl: string; sourceImageDataUrl?: string; fileName?: string }): Promise<{
    transparentBackgroundStatus?: "ready" | "skipped" | "failed";
    qualityWarnings?: string[];
    thumbnailDataUrl?: string;
    aiTag?: import("@/lib/types").GarmentTagResult;
    aiSourceImageDataUrl?: string;
    aiFallback?: boolean;
  }> {
    const { imageDataUrl, sourceImageDataUrl } = input;
    // v1.1.31 commit2: 真实 fileName（来源于 picked image），禁止固定 "garment.jpg"。
    // fileName 仅用于诊断/请求上下文，绝不直接成为用户可见名称。
    const fileName = input.fileName ?? "garment.jpg";
    // v1.1.31 patch5: 取消无 Key 短路。无 Key 必须走到 recognizeSingleItemFromDataUrl
    // 让其抛 GarmentRecognitionError("not_configured")，flow 内部走 failed draft + blocking
    // issue 路径，绝不返回默认"成功"草稿伪装为可编辑。
    const file = await dataUrlToFile(imageDataUrl, fileName).catch(() => null);
    const aiRequestDataUrl = file ? await fileToAiRequestDataUrl(file).catch(() => imageDataUrl) : imageDataUrl;
    const recognition = await withKeepAwake(() =>
      recognizeSingleItemFromDataUrl(aiRequestDataUrl, sourceImageDataUrl ?? imageDataUrl, fileName, miniMaxSettings),
    );
    return {
      transparentBackgroundStatus: "skipped",
      qualityWarnings: [],
      aiTag: recognition.tag,
      aiSourceImageDataUrl: recognition.sourceImageDataUrl,
    };
  }

  async function saveBatchGarmentIntakeDrafts(drafts: GarmentIntakeDraft[]) {
    if (drafts.length === 0) {
      showMessage("没有可保存的单品", "info");
      return;
    }
    const now = new Date().toISOString();
    const db = getWardrobeDb();
    let saved = 0;
    try {
      await runLoggedDbTransaction("save_batch_garment", () =>
        db.transaction("rw", db.items, async () => {
          for (const draft of drafts) {
            const item = garmentDraftToWardrobeItem(draft, { now });
            if (item.imageDataUrl) {
              await db.items.add(item);
              saved++;
            }
          }
        }),
      );
      await refreshState();
      setShowGarmentIntakeFlow(false);
      setPendingViewingItemReturnTarget("wardrobe_home");
      setPendingViewingItemId(null);
      recordDiagnosticEvent("create_single_item_batch_saved", { count: saved, returnRoute: navigation.createReturnRoute });
      showMessage(`已保存 ${saved} 件单品`);
    } catch (err) {
      showMessage("保存单品失败，请重试", "error");
      throw err;
    }
  }
  async function updateItemStatus(item: WardrobeItem, status: GarmentStatus) { if (!item.id) return; await getWardrobeDb().items.update(item.id, { status, updatedAt: new Date().toISOString() }); await refreshState(); }

  async function generateRecommendations(nextRequest = request) {
    let resolvedRequest = nextRequest;
    const manualWeather: WeatherInsight = {
      weather: resolvedRequest.weather,
      temperatureC: resolvedRequest.temperatureC,
      summary: "已使用你在弹窗中确认的天气和温度",
      source: "confirmed",
      needsConfirmation: false,
    };

    if (!useAiRecommendations) {
      setWeatherInsight(manualWeather);
      setRecommendations(recommendOutfits(items, resolvedRequest, { tryOnProfile }));
      showMessage("已使用你确认的天气和本地规则推荐");
      return;
    }

    if (!hasDeviceMiniMaxKey(miniMaxSettings)) {
      setWeatherInsight(manualWeather);
      setRecommendations(recommendOutfits(items, resolvedRequest, { tryOnProfile }));
      showMessage("未配置 MiniMax Key，已使用你确认的天气和本地规则推荐");
      return;
    }

    setIsRecommending(true);
    recProgress.start();
    clearMessage();
    try {
      const realtimeWeather = await withKeepAwake(() => resolveWeatherInsightOnDevice(resolvedRequest, miniMaxSettings));
      const effectiveWeather = realtimeWeather.source === "forecast" && !realtimeWeather.needsConfirmation ? realtimeWeather : manualWeather;
      setWeatherInsight(effectiveWeather);
      resolvedRequest = { ...resolvedRequest, weather: effectiveWeather.weather, temperatureC: effectiveWeather.temperatureC };
      setRequest(resolvedRequest);
      const next = await withKeepAwake(() => recommendOutfitsOnDevice(items, resolvedRequest, miniMaxSettings, {
        outfits,
        locations,
        tryOnProfile,
        weatherInsight: effectiveWeather,
      }));
      recProgress.complete(true);
      setRecommendations(next.length > 0 ? next : recommendOutfits(items, resolvedRequest, { tryOnProfile }));
      showMessage(next.length > 0 ? (effectiveWeather.source === "forecast" ? "MiniMax 已结合实时天气生成穿搭" : "实时天气未获取，已使用你确认的天气生成穿搭") : "MiniMax 未返回可用搭配，已使用本地规则推荐");
    } catch (error) {
      recProgress.fail(getErrorMessage(error));
      setWeatherInsight(manualWeather);
      const fallbackRequest = { ...resolvedRequest, weather: manualWeather.weather, temperatureC: manualWeather.temperatureC };
      setRecommendations(recommendOutfits(items, fallbackRequest, { tryOnProfile }));
      showMessage(`${getErrorMessage(error)}，已使用你确认的天气和本地规则推荐`);
    } finally {
      setIsRecommending(false);
    }
  }

  async function generateManualOutfitPreview(selectedIds = manualSelectedItemIds, useContext = true, explicitContext?: typeof request) {
    const selectedItems = items.filter((item) => item.id && selectedIds.includes(item.id));
    if (selectedItems.length === 0) { showMessage("请先选择要搭配的衣物", "info"); return; }
    if (!hasDeviceMiniMaxKey(miniMaxSettings)) { showMessage("请先在设置里配置 MiniMax Key", "info"); return; }
    if (usePersonRef && !tryOnProfile.fullBodyImageDataUrl) { showMessage("请先在设置中上传本人全身参考照", "info"); return; }
    const effectiveRequest = explicitContext || request;
    if (useContext && (!effectiveRequest.destination || effectiveRequest.destination === "新餐厅")) { setShowPreviewContextPopup(true); return; }
    setIsPreviewGenerating(true);
    tryonProgress.start();
    clearMessage();
    const previewWeather = useContext ? estimateWeatherInsight(effectiveRequest) : null;
    if (previewWeather) setWeatherInsight(previewWeather);
    const context = useContext ? { ...effectiveRequest, weather: previewWeather!.weather, temperatureC: previewWeather!.temperatureC } : { destination: "", date: "", activity: "casual" as GarmentStyle, stylePreference: "casual" as GarmentStyle, weather: "sunny" as const, temperatureC: 23 };
    // v0.9.22: 始终把 tryOnProfile 传给 generateOutfitPreviewOnDevice, 让文字画像 (版型/身高/体型/...)
    // 即使 usePersonRef=false 也参与 prompt; 设备端只会在 enabled + fullBodyImageDataUrl 时附带照片。
    const profile = tryOnProfile;
    try {
      const preview = await withKeepAwake(() => generateOutfitPreviewOnDevice(selectedItems, context, miniMaxSettings, profile));
      tryonProgress.complete(true);
      setPreviewImageDataUrl(preview);
      showMessage("MiniMax 已生成套装预览图");
    } catch (error) {
      tryonProgress.fail(getErrorMessage(error));
      showMessage(getErrorMessage(error), "error");
    } finally {
      setIsPreviewGenerating(false);
    }
  }

  async function saveManualOutfit(selectedIds = manualSelectedItemIds, options?: { outfitId?: string; name: string }) {
    const selectedItems = items.filter((item) => item.id && selectedIds.includes(item.id));
    const itemIds = selectedItems.map((item) => item.id).filter((id): id is number => typeof id === "number");
    if (itemIds.length === 0) {
      showMessage("请先选择要收藏的衣物", "info");
      return;
    }
    const now = new Date().toISOString();
    const name = options?.name?.trim() || `${request.destination || "手工套装"} · ${itemIds.length} 件`;
    if (options?.outfitId) {
      await getWardrobeDb().outfits.update(options.outfitId, {
        name,
        itemIds,
        ...buildOutfitCoverRefreshPatch(itemIds, selectedItems),
        destination: request.destination,
        activity: request.activity,
        style: request.stylePreference,
        updatedAt: now,
      });
      await refreshState();
      showMessage("已更新收藏套装");
    } else {
      await getWardrobeDb().outfits.put({
        id: `manual-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
        name,
        itemIds,
        coverImageDataUrl: selectedItems[0]?.imageDataUrl,
        previewImageDataUrl,
        destination: request.destination,
        activity: request.activity,
        style: request.stylePreference,
        source: "manual",
        favorite: true,
        createdAt: now,
        updatedAt: now,
      });
      await refreshState();
      showMessage("已收藏当前套装");
    }
  }

	  async function updateBackupOperation(patch: Record<string, unknown>) {
    setBackupOperation((current) => (current ? { ...current, ...patch } as BackupOperationState : current));
    await waitForNextFrame();
  }

  async function exportBackup() {
    if (backupOperation != null) return;
    setBackupOperation({
      phase: "exporting" as const, operation: "export_default" as const,
      title: "正在导出长期备份",
      status: "正在整理本机衣橱数据",
      progress: 8,
    });
    await waitForNextFrame();

    try {
      const appVersion = await getRuntimeAppVersion();
      await updateBackupOperation({ progress: 28, status: "正在生成备份文件" });
      const result = await exportLongTermBackupToDefault({
        items,
        locations,
        outfits,
        wishlistItems,
        outfitPlanEntries,
        outfitCalendarPlans,
        planPackingChecklistItems,
        tryOnProfile,
        appVersion,
      });
      if (result.webFallback) {
        setBackupOperation({
          phase: "success" as const,
          operation: "export_default" as const,
          title: "导出完成",
          status: "已下载浏览器调试备份文件。浏览器不能验证 Android 默认长期备份目录。",
          resultLabel: `文件：${result.timestampFileName}\n图片：${result.imageCount} 张`,
        });
      } else {
        const itemCount = items.length;
        const outfitCount = outfits.length;
        const wishlistCount = wishlistItems.length;
        const imageCount = result.imageCount;
        setBackupOperation({
          phase: "success" as const,
          operation: "export_default" as const,
          title: "导出完成",
          status: "已保存到默认长期备份目录",
          resultLabel:
            `保存位置：Download/衣橱穿搭助手备份\n` +
            `备份文件：${result.timestampFileName}\n` +
            `衣物：${itemCount} 件\n` +
            `套装：${outfitCount} 套\n` +
            `种草：${wishlistCount} 件\n` +
            `图片：${imageCount} 张`,
        });
      }
    } catch (error) {
      const errMsg = getErrorMessage(error);
      if (errMsg.includes("无法写入") || errMsg.includes("Permission")) {
        setBackupOperation({
          phase: "failed" as const,
          operation: "export_default" as const,
          title: "导出失败",
          error: "无法写入默认长期备份目录",
          retryable: true,
        });
      } else {
        setBackupOperation({
          phase: "failed" as const,
          operation: "export_default" as const,
          title: "导出失败",
          error: errMsg,
          retryable: true,
        });
      }
    }
  }

  async function openDefaultBackupFolder() {
    if (backupOperation != null) return;
    setBackupOperation({
      phase: "scanning" as const, operation: "restore_default" as const,
      title: "正在查找长期备份",
      status: "正在读取 Download/衣橱穿搭助手备份",
      progress: 12,
    });
    await waitForNextFrame();

    try {
      const files = await listDefaultLongTermBackups();
      if (files.length === 0) {
        setBackupOperation({
          phase: "success" as const,
          operation: "restore_default" as const,
          title: "未找到长期备份",
          status: "默认长期备份目录中还没有 .wardrobebackup 文件。请先导出长期备份。",
        });
      } else if (files.length === 1) {
        setBackupOperation({
          phase: "backup_list" as const,
          operation: "restore_default" as const,
          files: files,
        });
      } else {
        setBackupOperation({
          phase: "backup_list" as const,
          operation: "restore_default" as const,
          files: files,
        });
      }
    } catch (error) {
      const errMsg = getErrorMessage(error);
      if (errMsg.includes("浏览器无法读取") || !Capacitor.isNativePlatform()) {
        setBackupOperation({
          phase: "failed" as const,
          operation: "restore_default" as const,
          title: "无法读取默认目录",
          error: errMsg,
          retryable: true,
        });
      } else {
        setBackupOperation({
          phase: "failed" as const,
          operation: "restore_default" as const,
          title: "读取失败",
          error: errMsg,
          retryable: true,
        });
      }
    }
  }

  async function saveAsBackup() {
    if (backupOperation != null) return;
    setBackupOperation({
      phase: "exporting" as const, operation: "export_save_as" as const,
      title: "正在导出长期备份",
      status: "正在保存到指定位置",
      progress: 8,
    });
    await waitForNextFrame();

    try {
      const appVersion = await getRuntimeAppVersion();
      await updateBackupOperation({ progress: 28, status: "正在生成备份文件" });
      const result = await exportLongTermBackupSaveAs({
        items,
        locations,
        outfits,
        wishlistItems,
        outfitPlanEntries,
        outfitCalendarPlans,
        planPackingChecklistItems,
        tryOnProfile,
        appVersion,
      });
      if (result.webFallback) {
        setBackupOperation({
          phase: "success" as const,
          operation: "export_save_as" as const,
          title: "导出完成",
          status: "已下载浏览器调试备份文件。浏览器不能验证 Android 默认长期备份目录。",
          resultLabel: `文件：${result.filePath || "浏览器调试下载"}`,
        });
      } else {
        setBackupOperation({
          phase: "success" as const,
          operation: "export_save_as" as const,
          title: "导出完成",
          status: "长期备份已保存",
          resultLabel: `保存位置：${result.filePath || "用户选择的位置"}\n文件：${result.filePath || "用户选择的位置"}`,
        });
      }
    } catch (error) {
      setBackupOperation({
        phase: "failed" as const,
        operation: "export_save_as" as const,
        title: "导出失败",
        error: getErrorMessage(error),
        retryable: true,
      });
    }
  }

  async function pickBackupFile() {
    if (backupOperation != null) return;
    setBackupOperation({
      phase: "reading" as const,
      operation: "restore_picker" as const,
      title: "正在读取长期备份",
      status: "正在等待选择备份文件",
      progress: 12,
    });
    await waitForNextFrame();
    try {
      const { backup, fileName } = await restorePickedLongTermBackup();
      await restoreLongTermBackupData(backup, fileName, "restore_picker");
    } catch (error) {
      const errMsg = getErrorMessage(error);
      setBackupOperation({
        phase: "failed" as const,
        operation: "restore_picker" as const,
        title: errMsg.includes(".wardrobebackup") ? "文件类型不正确" : "读取失败",
        error: errMsg.includes(".wardrobebackup") ? "请选择 .wardrobebackup 长期备份文件。" : errMsg,
        retryable: true,
      });
    }
  }

  async function pickLtbFileFromList(file: LongTermBackupFileEntry) {
    if (backupOperation?.phase !== "backup_list") return;
    setBackupOperation({
      phase: "reading" as const, operation: "restore_default" as const,
      title: "正在读取长期备份",
      status: `正在解析 ${file.name}`,
      progress: 45,
    });
    await waitForNextFrame();
    try {
      const { backup, fileName } = await restoreDefaultLongTermBackup(file.name);
      await restoreLongTermBackupData(backup, fileName);
    } catch (error) {
      const errMsg = getErrorMessage(error);
      setBackupOperation({
        phase: "failed" as const, operation: "restore_default" as const,
        title: "读取失败",
        error: errMsg,
        retryable: true,
      });
    }
  }

  async function restoreLongTermBackupData(backup: WardrobeBackup, fileName: string, operation: "restore_default" | "restore_picker" = "restore_default") {
    try {
      const validatedPreview = validateLatestBackupReferences(backup);
      const preview: BackupRestorePreview = {
        ...validatedPreview,
        fileName: fileName || "衣橱穿搭助手-未知时间.wardrobebackup",
        appVersion: validatedPreview.appVersion || "",
      };
      pendingRestoreRef.current = { backup, preview, operation };
      setBackupOperation({
        phase: "awaiting_confirmation" as const, operation,
        preview,
      });
      await waitForNextFrame();
    } catch (error) {
      setBackupOperation({
        phase: "failed" as const,
        operation,
        title: "引用校验失败",
        error: getErrorMessage(error),
        retryable: true,
      });
    }
  }

  async function confirmRestore() {
    const ref = pendingRestoreRef.current;
    if (!ref) return;
    const { backup, preview, operation } = ref;
    setBackupOperation({
      phase: "restoring" as const, operation,
      title: `正在恢复 ${preview.fileName}`,
      status: "正在写入数据库...",
      progress: 75,
    });
    await waitForNextFrame();
    try {
      await applyLatestWardrobeBackup(backup);
      setBackupOperation({
        phase: "success" as const, operation,
        title: "恢复完成",
        status: `已恢复 ${preview.itemCount} 件衣物、${preview.outfitCount} 套套装`,
        resultLabel: `文件：${preview.fileName}\n衣物：${preview.itemCount} 件\n套装：${preview.outfitCount} 套\n种草：${preview.wishlistCount} 件\n计划：${preview.planCount} 条\n旅行计划：${preview.travelPlanCount} 条\n打包清单：${preview.packingCount} 项\n图片：${preview.imageCount} 张`,
      });
      pendingRestoreRef.current = null;
      await refreshState();
    } catch (error) {
      const errMsg = getErrorMessage(error);
      setBackupOperation({
        phase: "failed" as const, operation,
        title: "数据库写入失败",
        error: errMsg,
        retryable: true,
      });
    }
  }

  async function saveSettings(nextSettings: DeviceMiniMaxSettings) { const normalizedSettings = { ...nextSettings, model: "MiniMax-M3" }; saveMiniMaxSettings(normalizedSettings); setMiniMaxSettings(normalizedSettings); if (!hasDeviceMiniMaxKey(normalizedSettings)) { showMessage("MiniMax 设置已保存在本机"); return; } showMessage("正在验证 MiniMax Key..."); const result = await withKeepAwake(() => validateMiniMaxKey(normalizedSettings)); if (result.valid) setShowKeyBanner(false); showMessage(result.message); }

	  async function seedDemoItems() {
    const now = new Date().toISOString();
    // v0.9.33-dev: 给每件示例衣物预填 1 张 demo 参考穿搭图, 让瀑布流 + 详情页立刻多图,
    // 用户能验证 v0.9.32-dev 横滑手感。预填的数据是"搭配卡" SVG(主色 + "参考图 N"水印),
    // 用户可以长按详情页里的 ref 卡片删除 / 重新裁切, 或者点"添加"加自己的真实参考图。
    const baseItems: WardrobeItem[] = [
      createDemoItem("白色短衬衫", "tops", ["白"], [], ["spring", "summer"], ["commute", "dinner", "elegant"], 4, 2, "home", "#f8fafc", "#355c7d", now),
      createDemoItem("牛仔半裙", "skirts", ["牛仔蓝"], [], ["spring", "summer", "autumn"], ["casual", "dinner"], 2, 2, "home", "#dbeafe", "#1d4ed8", now),
      createDemoItem("卡其风衣", "tops", ["米"], [], ["spring", "autumn"], ["commute", "elegant"], 4, 4, "home", "#f5e8d3", "#b97155", now),
      createDemoItem("黑色乐福鞋", "shoes", ["黑"], [], ["all"], ["commute", "dinner"], 4, 2, "home", "#1f2937", "#f8fafc", now),
      createDemoItem("草绿色托特包", "bags", ["绿"], [], ["spring", "summer", "autumn"], ["casual", "vacation"], 2, 1, "home", "#d9f99d", "#5f7058", now),
    ];
    const demoItems: WardrobeItem[] = baseItems.map((item, idx) => ({
      ...item,
      referenceOutfitImages: [
        {
          id: `ref-demo-${idx}-${now}`,
          imageDataUrl: demoReferenceSvg(item.name, getPrimaryColor(item.colors) || "#475569", idx + 1),
          sourceImageDataUrl: demoReferenceSvg(item.name, getPrimaryColor(item.colors) || "#475569", idx + 1),
          createdAt: now,
          updatedAt: now,
        },
      ],
    }));
    const db = getWardrobeDb();
    await runLoggedDbTransaction("seed_demo_items", () =>
      db.transaction("rw", db.items, db.outfits, async () => {
        const itemIds = (await db.items.bulkAdd(demoItems, { allKeys: true })).filter(
          (id): id is number => typeof id === "number",
        );
        if (itemIds.length > 0) {
          await db.outfits.put(createDemoOutfit(itemIds, now));
        }
      }),
    );
    await refreshState();
    showMessage("已加入示例衣物和 1 套示例套装（含灵感图）");
  }

  const hasKey = hasDeviceMiniMaxKey(miniMaxSettings);
  const stats = useMemo(() => {
    const activeCount = items.filter((item) => item.status === "active").length;
    const needReviewCount = items.filter((item) => item.needsReview).length;
    const locationCount = locations.length;
    return { activeCount, needReviewCount, locationCount };
  }, [items, locations]);
  // 首页衣物列表：基于 wardrobeScope + homeCategoryFilter + 搜索词
  // （搜索词 query 只在搜索页生效；首页不基于 query 过滤，避免与搜索串味）
  const homeFilteredItems = useMemo(() => {
    return items.filter((item) => {
      const ml = wardrobeScope === "all" || item.locationId === wardrobeScope;
      const mc = homeCategoryFilter === "all" || item.category === homeCategoryFilter;
      return ml && mc;
    });
  }, [homeCategoryFilter, items, wardrobeScope]);
  const locationNameById = useMemo(() => {
    return locations.reduce<Record<string, string>>((r, l) => { r[l.id] = l.name; return r; }, {});
  }, [locations]);
  // v0.9.38-dev P0 §6: hideMobileNav 补全 (md 模板)
  // - outfitCaptureDetailActive / wardrobeSubPageActive: 已有 (BatchDetail / WardrobeView 子页面)
  //   - wardrobeSubPageActive 已包含 viewingItem / editingItem / viewingItemCropJob 三态
  //     (WardrobeView 内部 useEffect line 1690 显式声明), 衣物详情页裁切不需重复加
  // - expandedImage: 大图全屏 lightbox
  // - captureCropJob: 录入裁切器 (全屏 portal)
  // - captureImageQueue.length > 0: 多图预览页 (v0.9.37-dev 加)
  // 其他 sub-view cropJob (ShoppingAdvisorView / SettingsView / OutfitSaveView) 留
  // v0.9.39-dev 统一加 onSubPageChange prop, 本轮范围控制。
  // v1.1.20-dev (方案 C): showGarmentIntakeFlow 改为 isIntakeRouteName(route.name), 与 route 状态同步。
  const hideMobileNav =
    outfitCaptureDetailActive ||
    wardrobeSubPageActive ||
    outfitSubPageActive ||
    shoppingSubPageActive ||
    route.name === "intake_single_item" ||
    showImageSourceSheet ||
    !!expandedImage ||
    !!captureCropJob ||
    captureImageQueue.length > 0;

  // v0.9.46-dev: global create button visibility
  // v1.1.20-dev (方案 C): 改为基于 route 派生 — activeView 独立 state 已删除。
  const shouldShowGlobalCreate =
    !hideMobileNav &&
    route.name !== "settings_home" &&
    !isIntakeRouteName(route.name) &&
    !outfitSubPageActive &&
    !backupOperation &&
    !showExitDialog &&
    !showCreateSheet;

  // v1.1.20-dev (方案 C): create_outfit 现在在 handleCreateAction 同步调用 setRoute({name: "intake_outfit"}),
  // 不再需要等 view 切到 recommend 才触发 createTrigger。但 OutfitListView 的 createTrigger
  // 仍需要触发一次 — 保留这个 useEffect,去掉 activeView gate,只要 pendingCreateAction 设置就立即触发。
  useEffect(() => {
    if (!pendingCreateAction) return;
    if (pendingCreateAction === "create_outfit") {
      setCreateOutfitTrigger((n) => n + 1);
      setPendingCreateAction(null);
      return;
    }
  }, [pendingCreateAction]);

  type CreateActionType = "add_single_item" | "create_outfit" | "add_wishlist_item";
  // P0 收口: 全局加号菜单的衣橱单品 / 种草正式录入不再走 openImageSourceSheet + 多图队列。
  // add_single_item 与 add_wishlist_item 都走 GarmentIntakeFlow（wishlist 模式靠 flowKind="wishlist" 区分）;
  // create_outfit 仍然使用 pendingCreateAction 等待 view 切换 (不属于本次收口范围)。
  // v1.1.20-dev (方案 C): switchView("capture") / switchView("recommend") / switchView("shopping")
  //   改为 setRoute({name: "intake_*", returnTo: route.name})。Bug 1 根因之一 — 旧版让
  //   activeView 切到非原 tab, closeCreateFlow 时 useEffect 同值 bail out → activeView 卡住。
  function startGarmentIntakeFlow() {
    setShowCreateSheet(false);
    setCaptureImageQueue([]);
    setCaptureQueueIndex(0);
    setShowImageSourceSheet(false);
    setImageIntakePurpose(null);
    setPendingCreateAction(null);
    rememberCreateReturnRoute();
    recordDiagnosticEvent("create_single_item_started", { activeView: activeViewForCreateActions, route });
    navigation.openRoute({ name: "intake_single_item", returnTo: route.name });
    setShowGarmentIntakeFlow(true);
  }
  function handleCreateAction(type: CreateActionType) {
    setShowCreateSheet(false);
    recordDiagnosticEvent("create_action_selected", { type, activeView: activeViewForCreateActions, route });
    switch (type) {
      case "add_single_item":
        startGarmentIntakeFlow();
        break;
      case "create_outfit":
        rememberCreateReturnRoute();
        recordDiagnosticEvent("create_outfit_started", { activeView: activeViewForCreateActions, route });
        setPendingCreateAction("create_outfit");
        setCaptureMode("outfit");
        navigation.openRoute({ name: "intake_outfit", returnTo: route.name });
        // pendingCreateAction 会在 useEffect (line 1670) 里触发 createOutfitTrigger, OutfitListView 看到 trigger 打开 intake subPage。
        break;
      case "add_wishlist_item":
        setCaptureImageQueue([]);
        setCaptureQueueIndex(0);
        setShowImageSourceSheet(false);
        setImageIntakePurpose(null);
        setPendingCreateAction(null);
        rememberCreateReturnRoute();
        recordDiagnosticEvent("create_wishlist_item_started", { activeView: activeViewForCreateActions, route });
        navigation.openRoute({ name: "intake_wishlist", returnTo: route.name });
        setCreateWishlistTrigger((n) => n + 1);
        break;
    }
  }

  if (!isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="surface rounded-lg px-5 py-4 text-sm text-ink">正在打开衣橱...</div>
      </main>
    );
  }

  return (
    <>
    <main className={`min-h-screen text-ink lg:pb-10 ${hideMobileNav ? "pb-8" : "pb-28"}`}>
      <div className="safe-top" />
      <div className="mx-auto grid max-w-6xl gap-5 px-4 pt-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="surface sticky top-4 rounded-lg p-3">
            <nav className="grid gap-1">
              {viewItems.map((view) => (
                <NavButton key={view.key} view={view} active={navigation.mainTab === view.key} onClick={() => {
                  const routeBefore = navigation.route;
                  const fromMainTab = navigation.mainTab;
                  recordDiagnosticEvent("nav_clicked", {
                    surface: "desktop",
                    fromMainTab,
                    toMainTab: view.key,
                    routeBefore,
                    routeAfter: { name: view.key === "wardrobe" ? "wardrobe_home" : view.key === "recommend" ? "outfit_home" : view.key === "shopping" ? "wishlist_home" : "settings_home" },
                  });
                  navigation.resetToMainTab(view.key as "wardrobe" | "recommend" | "shopping" | "settings");
                }} />
              ))}
            </nav>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <StatBox label="可穿" value={stats.activeCount} />
              <StatBox label="地点" value={stats.locationCount} />
              <StatBox label="待确认" value={stats.needReviewCount} />
            </div>
          </div>
        </aside>

        <section className="min-w-0">

          {!hasKey && showKeyBanner && !hideMobileNav ? (
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-clay/20 bg-clay/6 px-4 py-3 text-sm">
              <WandSparkles size={18} className="shrink-0 text-clay" />
              <span className="min-w-0 flex-1 text-ink/80">
                尚未配置 MiniMax Key，AI 识别和推荐功能暂不可用。
                <button type="button" onClick={() => { navigation.openRoute({ name: "settings_home" }); setShowKeyBanner(false); }} className="ml-2 font-semibold text-clay underline">前往设置</button>
              </span>
              <button type="button" className="shrink-0 text-ink/40" onClick={() => setShowKeyBanner(false)}>×</button>
            </div>
          ) : null}

<AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={route.name}
              className="min-w-0 transform-gpu"
              initial={{ opacity: 0.92, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.08, ease: ease.app } }}
              transition={{ duration: 0.14, ease: ease.app }}
              // v1.1.20-dev (方案 C): motion key 改用 route.name — view 现在完全从 route 派生。
              // onAnimationComplete 逻辑保留 subagent I-3 transition 字段检测 + race 防御。
              onAnimationComplete={(definition) => {
                const isEnter = typeof definition === "object"
                  && definition !== null
                  && !("transition" in (definition as Record<string, unknown>));
                if (isEnter) {
                  if (pendingRestoreViewRef.current !== route.name) return;
                  const targetView = route.name;
                  const targetScrollY = viewScrollPositionsRef.current[targetView] ?? 0;
                  isRestoringScrollRef.current = true;
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      if (pendingRestoreViewRef.current === targetView) {
                        window.scrollTo({ top: targetScrollY, left: 0, behavior: "instant" as ScrollBehavior });
                      }
                      pendingRestoreViewRef.current = null;
                      requestAnimationFrame(() => {
                        isRestoringScrollRef.current = false;
                      });
                    });
                  });
                } else {
                  if (document.body.style.position !== "fixed") {
                    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
                  }
                }
              }}
            >
          {route.name === "wardrobe_home" || route.name === "garment_detail" ? (
            <WardrobeView
              items={homeFilteredItems} allItems={items} locations={locations} locationNameById={locationNameById}
              wardrobeScope={wardrobeScope} setWardrobeScope={setWardrobeScope}
              homeCategoryFilter={homeCategoryFilter} setHomeCategoryFilter={setHomeCategoryFilter}
              query={query} setQuery={setQuery}
              onStartGarmentIntake={startGarmentIntakeFlow} onSeed={seedDemoItems}
              onStatusChange={updateItemStatus}
              onDeleteItems={async (ids) => {
                const db = getWardrobeDb();
                await deleteItemsWithCascade({ itemIds: ids, source: "manual_delete" });
                await refreshState();
              }}
              outfits={outfits} wishlistItems={wishlistItems} setOutfits={setOutfits} setWishlistItems={setWishlistItems} miniMaxSettings={miniMaxSettings}
              setItems={setItems}
              onMessage={showMessage}
              onExpandImage={lightbox.openExpandedImage}
              onSubPageChange={setWardrobeSubPageActive}
              activeGarmentRoute={route.name === "garment_detail" ? route : undefined}
              pendingViewingItemId={pendingViewingItemId}
              pendingViewingItemReturnTarget={pendingViewingItemReturnTarget}
              onPendingViewingItemConsumed={() => {
                setPendingViewingItemId(null);
                setPendingViewingItemReturnTarget("wardrobe_home");
              }}
              onReturnToWishlistOwned={() => {
                setWishlistInitialSubPage("purchased");
                navigation.openRoute({ name: "wishlist_purchased" });
              }}
              // v1.1.20-dev (Bug 2 修复): 衣物详情关闭时跳回原 route。
              onReturnToRoute={(route) => navigation.openRoute(route)}
            />
          ) : null}

           {route.name === "intake_single_item" ? (
 showGarmentIntakeFlow ? (
              <GarmentIntakeFlow
                locations={locations}
                defaultLocationId={locations[0]?.id ?? "home"}
                onPickImages={pickGarmentIntakeImages}
                // v1.1.16-dev commit1 §3.4.1: 接通 AI 主链
                // 裁切确认后 GarmentIntakeFlow 会调 onProcessImage,
                // 这里调 MiniMax 单件属性识别, 失败 throw 由 flow catch 处理。
                onProcessImage={processGarmentIntakeImage}
                onSaveBatch={async (drafts) => {
                  await saveBatchGarmentIntakeDrafts(drafts);
                  await refreshState();
                  closeCreateFlow();
                }}
                onExit={() => {
                  setShowGarmentIntakeFlow(false);
                  closeCreateFlow();
                }}
              />
            ) :
 captureImageQueue.length >0 ? null : (
 captureMode === "outfit" && outfitCaptureGroups.length >0 ? (
 <BatchOutfitGroupsView
                groups={outfitCaptureGroups} statuses={outfitCaptureStatuses}
                names={outfitCaptureNames} setNames={setOutfitCaptureNames}
                saveAsOutfitDefault={outfitCaptureSaveAsOutfit}
                onDetailChange={setOutfitCaptureDetailActive}
                onExpandImage={lightbox.openExpandedImage}
                onSaveGroup={async (groupIndex, editedGroup, saveAsOutfit) => {
                  if (outfitCaptureStatuses[groupIndex] === "confirmed") return false;
                  const g = editedGroup ?? outfitCaptureGroups[groupIndex]; if (!g) return false;
                  const selectedDrafts = g.filter((d) => d.selected !== false);
                  if (selectedDrafts.length === 0) { showMessage("请至少选择 1 件要录入的单品", "info"); return false; }
                  const now = new Date().toISOString(); const db = getWardrobeDb(); const ids: number[] = [];
                  let addedCount = 0;
                  for (const d of selectedDrafts) {
                    if (d.useExistingItemId) { ids.push(d.useExistingItemId); continue; }
                    ids.push(await db.items.add(outfitCaptureDraftToWardrobeItem(d, now)));
                    addedCount += 1;
                  }
                  const outfitName = outfitCaptureNames[groupIndex] || undefined;
                  if (saveAsOutfit) await db.outfits.put(createSavedOutfit(ids.filter((id) => id > 0), selectedDrafts, "capture", now, outfitName));
                  await refreshState();
                  setOutfitCaptureGroups((groups) => groups.map((group, i) => i === groupIndex ? g : group));
                  setOutfitCaptureDrafts((drafts) => drafts.map((draft) => draft.batchGroupId === groupIndex ? (g.find((next) => next.clientId === draft.clientId) ?? draft) : draft));
                  setOutfitCaptureStatuses((s) => s.map((st, i) => i === groupIndex ? "confirmed" as const : st));
                  showMessage(saveAsOutfit ? `已保存此套，新增 ${addedCount} 件衣物` : `已录入 ${selectedDrafts.length} 件衣物，未加入套装收藏`);
                  return true;
                }}
                onCancelGroup={(groupIndex) => { setOutfitCaptureStatuses((s) => s.map((st, i) => i === groupIndex ? "cancelled" as const : st)); }}
	                onCancelAll={() => { setOutfitCaptureGroups([]); setOutfitCaptureStatuses([]); setOutfitCaptureNames([]); setOutfitCaptureDrafts([]); }}
              />
            ) : null
          )
          ) : null}

          {/* v1.1.20-dev (方案 C): recommend tab 包含 outfit_home / outfit_detail / outfit_calendar / intake_outfit 四种 route。 */}
          {route.name === "outfit_home" || route.name === "outfit_detail" || route.name === "outfit_calendar" || route.name === "intake_outfit" ? (
            <OutfitListView
              outfits={outfits}
              items={items}
              locations={locations}
              outfitPlanEntries={outfitPlanEntries}
              outfitCalendarPlans={outfitCalendarPlans}
              planPackingChecklistItems={planPackingChecklistItems}
              onPlanDataChange={refreshState}
              onRefresh={refreshState}
              onMessage={showMessage}
              onExpandImage={lightbox.openExpandedImage}
              onSwitchToCapture={() => {
                // v1.1.20-dev (方案 C): 切到 intake_single_item route。
                rememberCreateReturnRoute();
                navigation.openRoute({ name: "intake_single_item", returnTo: route.name });
                setShowGarmentIntakeFlow(true);
              }}
              onSubPageChange={setOutfitSubPageActive}
              onSubPageKeyChange={setOutfitSubPageKey}
              activeOutfitRoute={route.name === "outfit_detail" ? route : undefined}
              onCloseOutfitDetail={() => navigation.goBack()}
              onCreateClosed={closeCreateFlow}
              createTrigger={createOutfitTrigger}
              onCreateTriggerConsumed={() => setCreateOutfitTrigger(0)}
              createPlanTrigger={createOutfitPlanTrigger}
              onCreatePlanTriggerConsumed={() => setCreateOutfitPlanTrigger(0)}
            />
          ) : null}

          {/* v1.1.20-dev (方案 C): shopping tab 包含 wishlist_* / intake_wishlist。 */}
          {route.name === "wishlist_home" || route.name === "wishlist_purchased" || route.name === "wishlist_rejected" || route.name === "wishlist_archived" || route.name === "intake_wishlist" ? (
            <WishlistView20
              wishlistItems={wishlistItems}
              setWishlistItems={setWishlistItems}
              items={items}
              locations={locations}
              outfits={outfits}
              settings={miniMaxSettings}
              onMessage={showMessage}
              onExpandImage={lightbox.openExpandedImage}
              createTrigger={createWishlistTrigger}
              initialSubPage={wishlistInitialSubPage}
              onInitialSubPageConsumed={() => setCreateWishlistTrigger(0)}
              onCreateTriggerConsumed={() => setCreateWishlistTrigger(0)}
              onCreateClosed={closeCreateFlow}
              onPickIntakeImages={pickGarmentIntakeImages}
              onProcessIntakeImage={processGarmentIntakeImage}
              onSubPageChange={setShoppingSubPageActive}
              onNavigateToItem={async (itemId) => {
                await refreshState();
                setPendingViewingItemReturnTarget("wishlist_owned");
                setPendingViewingItemId(itemId);
                navigation.openRoute({ name: "wardrobe_home" });
              }}
              onWishlistConvertedToWardrobe={async (newItemId) => {
                await refreshState();
                setPendingViewingItemReturnTarget("wardrobe_home");
                setPendingViewingItemId(newItemId);
                navigation.openRoute({ name: "wardrobe_home" });
              }}
              onDataChanged={refreshState}
            />
          ) : null}

          {route.name === "settings_home" ? (
	            <SettingsView
	              items={items} locations={locations} outfits={outfits} wishlistItems={wishlistItems} activeView={activeViewForCreateActions} route={route}
	              miniMaxSettings={miniMaxSettings} onSaveMiniMaxSettings={saveSettings}
	              onExport={exportBackup} onOpenBackupFolder={openDefaultBackupFolder} onSaveAs={saveAsBackup} onPickFile={pickBackupFile}
	              isBackupBusy={Boolean(backupOperation != null)}
	              onAddWardrobe={async (name, note) => { const now = new Date().toISOString(); await getWardrobeDb().locations.put({ id: `custom-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`, name, note, sortOrder: locations.length + 1, createdAt: now, updatedAt: now }); await refreshState(); }}
              onUpdateWardrobe={async (id, name, note) => { const db = getWardrobeDb(); await db.locations.update(id, { name, note, updatedAt: new Date().toISOString() }); await refreshState(); }}
              onDeleteWardrobe={async (id, action) => {
                const db = getWardrobeDb();
                if (action.mode === "migrate") {
                  await runLoggedDbTransaction("delete_wardrobe_migrate", () =>
                    db.transaction("rw", db.items, db.locations, async () => {
                      const now = new Date().toISOString();
                      const movingItems = await db.items.where("locationId").equals(id).toArray();
                      for (const item of movingItems) {
                        if (typeof item.id === "number") await db.items.update(item.id, { locationId: action.targetLocationId, updatedAt: now });
                      }
                      await db.locations.delete(id);
                    }),
                  );
                } else {
                  const itemIds = (await db.items.where("locationId").equals(id).toArray())
                    .map((item) => item.id)
                    .filter((itemId): itemId is number => typeof itemId === "number");
                  await deleteItemsWithCascade({ itemIds, source: "manual_delete" });
                  await db.locations.delete(id);
                }
                await refreshState();
              }}
              tryOnProfile={tryOnProfile} onSaveTryOnProfile={async (profile) => { await saveTryOnProfile(profile); setTryOnProfile(profile); showMessage("穿衣画像已保存"); }}
              onClearAllData={async () => {
                const db = getWardrobeDb();
                // v0.9.24-dev (subagent I-1 修复): Dexie 4 transaction 在构造时对 undefined
                // table 抛 TypeError (verified in node_modules/dexie/dist/dexie.js:6169-6174),
                // 必须在构造前 filter Boolean 过滤表清单。否则 db.tryOnProfile 或 db.outfits
                // 是 undefined 时, 整个 transaction 在 .transaction() 调用点就崩, 表内的 if-guard
                // 永远走不到 —— 是死代码。
                // 同款防御从 v0.9.9 就存在 (importBackup line 873 附近), Dexie schema 不可降级,
                // 生产环境实际不可达, 属于理论 bug; 本次顺手把注释 + 防御修对。
                // 不用 Table<any, any>[] 数组避免触发 @typescript-eslint/no-explicit-any,
                // 改用 Dexie transaction 接受可变参数的签名展开, 配合条件 if 判断省略 undefined 表。
                await runLoggedDbTransaction("clear_all_data", () =>
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (db.transaction as any)("rw", ...[db.items, db.locations, db.outfits, db.wishlistItems, db.tryOnProfile, db.outfitPlanEntries, db.outfitCalendarPlans, db.planPackingChecklistItems].filter(Boolean), async () => {
                    await db.items.clear();
                    await db.locations.clear();
                    if (db.outfits) await db.outfits.clear();
                    if (db.wishlistItems) await db.wishlistItems.clear();
                    if (db.outfitPlanEntries) await db.outfitPlanEntries.clear();
                    if (db.outfitCalendarPlans) await db.outfitCalendarPlans.clear();
                    if (db.planPackingChecklistItems) await db.planPackingChecklistItems.clear();
                    if (db.tryOnProfile) await db.tryOnProfile.clear();
                  }),
                );
                await refreshState();
                const fresh = await readTryOnProfile();
                setTryOnProfile(fresh);
                showMessage("已清空全部数据");
              }}
              isClearingAll={isClearingAll}
              isClearingAllRef={isClearingAllRef}
              setIsClearingAll={setIsClearingAll}
              onMessage={showMessage} onExpandImage={lightbox.openExpandedImage}
              onRefreshState={refreshState}
            />
          ) : null}
          </motion.div>
          </AnimatePresence>
        </section>
      </div>

      <MotionSheet open={showPreviewContextPopup} onClose={() => setShowPreviewContextPopup(false)}>
        <h3 className="text-base font-semibold mb-3">生成穿着预览</h3>
        <p className="text-xs text-ink/60 mb-3">请补充目的地和场景信息，以生成匹配的背景。</p>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium">目的地
            <input value={previewCtxDestination} onChange={(e) => setPreviewCtxDestination(e.target.value)} className="h-10 rounded-lg border border-ink/10 bg-white px-3 text-sm outline-none focus:border-denim" placeholder="例如 杭州西湖" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-sm font-medium">活动
              <select value={previewCtxActivity} onChange={(e) => setPreviewCtxActivity(e.target.value as GarmentStyle)} className="h-10 rounded-lg border border-ink/10 bg-white px-2 text-sm">
                {styleOptions.map((s) => (<option key={s} value={s}>{STYLE_LABELS[s]}</option>))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">风格
              <select value={previewCtxStyle} onChange={(e) => setPreviewCtxStyle(e.target.value as GarmentStyle)} className="h-10 rounded-lg border border-ink/10 bg-white px-2 text-sm">
                {styleOptions.map((s) => (<option key={s} value={s}>{STYLE_LABELS[s]}</option>))}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium">日期
            <input type="date" value={previewCtxDate} onChange={(e) => setPreviewCtxDate(e.target.value)} className="h-10 rounded-lg border border-ink/10 bg-white px-3 text-sm" />
          </label>
          <button type="button" onClick={() => { setShowPreviewContextPopup(false); const nextReq = { ...request, destination: previewCtxDestination || "日常出门", activity: previewCtxActivity, stylePreference: previewCtxStyle, date: previewCtxDate }; setRequest(nextReq); generateManualOutfitPreview(manualSelectedItemIds, true, nextReq); }} className="w-full h-11 rounded-lg bg-moss text-sm font-semibold text-white">确认生成穿着预览</button>
          <button type="button" onClick={() => { setShowPreviewContextPopup(false); generateManualOutfitPreview(manualSelectedItemIds, false); }} className="w-full text-xs text-ink/50 underline">生成无背景穿搭示意图</button>
        </div>
      </MotionSheet>

	      {captureCropJob && (
	        <ImageCropEditor
	          source={captureCropJob.dataUrl}
	          initialCropBox={captureCropJob.startBox}
	          aspectRatio="free"
	          onCancel={() => setCaptureCropJob(null)}
	          onError={(error) => showMessage(error, "error")}
	          onConfirm={async (croppedDataUrl, newBox) => {
	            const job = captureCropJob;
	            if (!job) return;
	            setCaptureCropJob(null);
	            await waitForNextFrame();
	            if (job.onConfirm) {
	              job.onConfirm(croppedDataUrl, newBox);
	              return;
	            }
	            await processSingleCaptureImage(croppedDataUrl, job.fileName, job.mode);
	          }}
	        />
	      )}

	      <BackupProgressSheet
	        state={backupOperation}
	        onClose={() => setBackupOperation(null)}
	        onPickLtbFile={pickLtbFileFromList}
	        onConfirmRestore={confirmRestore}
	      />

        {/* v1.0: 全局浮动 — Plus居中 + active反馈 + 按钮 */}
        {shouldShowGlobalCreate ? (
          <button
            type="button"
            onClick={() => setShowCreateSheet(true)}
            className="fixed right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-denim p-0 leading-none text-white shadow-lg transition-transform active:scale-95 lg:hidden" style={{ bottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
            aria-label="新建"
          >
            <Plus size={24} strokeWidth={2.2} className="block" aria-hidden="true" />
          </button>
        ) : null}

        <MotionSheet open={showCreateSheet} onClose={() => {
          setShowCreateSheet(false);
          setPendingCreateAction(null);
        }}>
          <div className="px-4 pb-4">
            <h3 className="text-lg font-semibold mb-4">新建</h3>
            {createActionsForView(activeViewForCreateActions).map((action) => {
              const highlighted = action.type === preferredCreateActionByView[activeViewForCreateActions];
              return (
                <motion.button
                  key={action.type}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleCreateAction(action.type)}
                  className={[
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                    highlighted ? "bg-denim/8 ring-1 ring-denim/15" : "active:bg-denim/8 focus-visible:bg-denim/8",
                  ].join(" ")}
                >
                  <span className={[
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full",
                    highlighted ? "bg-denim text-white" : "bg-mist text-ink",
                  ].join(" ")}
                  >
                    {action.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={["text-sm font-semibold", highlighted ? "text-denim" : "text-ink"].join(" ")}>{action.title}</div>
                    <div className="text-xs text-ink/50">{action.description}</div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </MotionSheet>

      <WardrobeImageSourceSheet
        open={imageIntake.showImageSourceSheet}
        title="添加图片"
        onClose={imageIntake.closeImageSourceSheet}
        onCameraClick={imageIntake.triggerCameraInput}
        onGalleryClick={imageIntake.triggerGalleryInput}
      />

	      {!hideMobileNav ? <nav className={`safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-[#fbfbf8]/94 ${outfitCaptureDetailActive ? "px-1 py-0.5" : "px-2 pt-2"} backdrop-blur-xl lg:hidden`}>
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          {viewItems.map((view) => (<MobileNavButton key={view.key} view={view} active={navigation.mainTab === view.key} onClick={() => {
            const routeBefore = navigation.route;
            const fromMainTab = navigation.mainTab;
            recordDiagnosticEvent("nav_clicked", {
              surface: "mobile",
              fromMainTab,
              toMainTab: view.key,
              routeBefore,
              routeAfter: { name: view.key === "wardrobe" ? "wardrobe_home" : view.key === "recommend" ? "outfit_home" : view.key === "shopping" ? "wishlist_home" : "settings_home" },
            });
            navigation.resetToMainTab(view.key as "wardrobe" | "recommend" | "shopping" | "settings");
          }} compact={outfitCaptureDetailActive} />))}
        </div>
      </nav> : null}
      <MotionImageLightbox open={!!expandedImage} src={expandedImage?.src ?? ""} alt={expandedImage?.alt ?? ""} onClose={lightbox.closeExpandedImage} />

      <WardrobeHiddenImageInputs
        fileInputRef={imageIntake.fileInputRef}
        galleryInputRef={imageIntake.galleryInputRef}
        onCameraInputChange={(e) => imageIntake.handleCameraCapture(e.target.files?.[0])}
        onGalleryInputChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          if (pendingGalleryResolverRef.current) {
            pendingGalleryResolverRef.current(files);
            e.currentTarget.value = "";
            return;
          }
          void imageIntake.handleGallerySelect(e.target.files);
        }}
      />
      <MotionSheet open={showExitDialog} onClose={() => setShowExitDialog(false)} panelClassName="text-center">
        <p className="text-base font-semibold mb-1">是否退出应用？</p>
        <p className="text-xs text-ink/50 mb-4">退出应用后将丢失所有未保存内容</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setShowExitDialog(false)} className="h-10 rounded-lg border border-ink/10 text-sm">取消</button>
          <button type="button" onClick={() => { try { App.exitApp(); } catch { window.close(); } }} className="h-10 rounded-lg bg-red-600 text-sm font-semibold text-white">退出</button>
        </div>
      </MotionSheet>

      {/* v0.9.25-dev + v1.1 review fix: 全局浮动 Toast — 固定在视口底部导航上方, 不参与文档流,
          不挤压页面内容, 不遮挡顶部 header 与主操作按钮。
          渲染到 document.body 避免父级 transform / overflow 影响 fixed 定位。
          z-[75]: 高于 MotionSheet z-50 (弹窗内错误提示可见) / 高于 5 tab nav z-30 /
                 高于 MotionPopoverMenu z-70 (分类筛选 popover, subagent I-1 避免同 z),
                 低于 MotionImageLightbox z-80 (modal 视觉一致) / 低于 moreCats z-[100]。
          pointer-events-none 外层 + pointer-events-auto 内层: 不阻挡底层点击,
                 仅 toast 自身可交互 (44px 关闭按钮)。
          placement="bottom": MotionToast 内置 slideUp 变体。
          外层 div 用 style={{ bottom }} 把 toast 抬到底导航上方 (env(safe-area-inset-bottom) + 5.25rem)。 */}
      {typeof document !== "undefined" && createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 z-[75] px-4"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 5.25rem)" }}
        >
          <MotionToast
            visible={!!message && !expandedImage && !captureCropJob}
            type={messageType}
            placement="bottom"
          >
          <div
            className={`pointer-events-auto mx-auto flex max-w-md items-center gap-2.5 overflow-hidden rounded-2xl border border-ink/10 bg-white/95 px-3 py-2.5 text-sm text-ink shadow-lg backdrop-blur-md ${messageType === "error" ? "border-l-[3px] border-l-red-400" : messageType === "info" ? "border-l-[3px] border-l-denim" : "border-l-[3px] border-l-moss"}`}
          >
            {messageType === "error" ? (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-50 text-red-500">
                <span className="text-base font-bold leading-none">!</span>
              </span>
            ) : messageType === "info" ? (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-denim/10 text-denim">
                <span className="text-sm font-semibold leading-none">i</span>
              </span>
            ) : (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-moss/12 text-moss">
                <Check size={14} strokeWidth={2.6} />
              </span>
            )}
            <span className="min-w-0 flex-1 leading-snug">{message}</span>
            <button
              type="button"
              title="关闭提示"
              aria-label="关闭提示"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink/45 transition-colors active:bg-ink/5 hover:text-ink/70"
              onClick={clearMessage}
            >
              ×
            </button>
          </div>
          </MotionToast>
        </div>,
        document.body
      )}
    </main>
      {/* P0 收口: 单品与种草正式录入只允许走 GarmentIntakeFlow（衣橱用 flowKind="garment"，种草用 flowKind="wishlist"）。
          SelectedImagesReview 仅允许服务灵感图添加 (imageIntakePurpose === "reference")。 */}
      {captureImageQueue.length > 0 && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#fbfbf8]">
          <WardrobeSelectedImagesReviewPortal
            images={captureImageQueue}
            currentIndex={captureQueueIndex}
            onCurrentIndexChange={setCaptureQueueIndex}
            processing={isRecognizing}
            progress={{
              label: tagProgress.label,
              stage: tagProgress.stage,
              percent: tagProgress.percent,
              visible: tagProgress.visible,
            }}
            onCropCurrent={() => {
              if (isRecognizing) return;
              const item = captureImageQueue[captureQueueIndex];
              if (!item) return;
              setCaptureCropJob({
                dataUrl: item.originalDataUrl,
                fileName: item.fileName,
                mode: captureMode,
                purpose: imageIntakePurpose,
                startBox: item.cropBox,
                onConfirm: async (newImageDataUrl, newBox) => {
                  const thumb = await generateThumbnailSafe(newImageDataUrl);
                  setCaptureImageQueue((prev) => prev.map((it, i) =>
                    i === captureQueueIndex
                      ? {
                          ...it,
                          imageDataUrl: newImageDataUrl,
                          cropBox: newBox,
                          cropped: true,
                          ...(thumb.thumbnailDataUrl ? { thumbnailDataUrl: thumb.thumbnailDataUrl } : {}),
                          ...(thumb.thumbnailVersion !== undefined ? { thumbnailVersion: thumb.thumbnailVersion } : {}),
                          ...(thumb.thumbnailUpdatedAt ? { thumbnailUpdatedAt: thumb.thumbnailUpdatedAt } : {}),
                          ...(thumb.thumbnailStatus === "failed" ? { thumbnailStatus: "failed" as const } : {}),
                        }
                      : it
                  ));
                  setCaptureCropJob(null);
                },
              });
            }}
            cropping={Boolean(captureCropJob)}
            onDelete={(clientId) => {
              if (isRecognizing) return;
              setCaptureImageQueue((prev) => {
                const next = prev.filter((it) => it.clientId !== clientId);
                const removedIndex = prev.findIndex((it) => it.clientId === clientId);
                if (next.length === 0) {
                  setCaptureQueueIndex(0);
                } else {
                  const safeRemoved = removedIndex >= 0 ? removedIndex : prev.length - 1;
                  setCaptureQueueIndex(Math.min(safeRemoved, next.length - 1));
                }
                return next;
              });
            }}
            onCancel={() => {
              if (isRecognizing) return;
              setCaptureImageQueue([]);
              setCaptureQueueIndex(0);
              setReferenceOutfitTargetItemId(null);
            }}
            onConfirm={async () => {
              if (imageIntakePurpose === "reference") {
                const targetId = referenceOutfitTargetItemId;
                if (targetId == null) {
                  showMessage("未指定目标衣物，灵感图未保存", "error");
                  setCaptureImageQueue([]);
                  return;
                }
                const now = new Date().toISOString();
                const refs = (await Promise.all(captureImageQueue.map(async (item) => {
                  const thumb = await generateThumbnailSafe(item.imageDataUrl);
                  return {
                    id: `${item.clientId}-${Math.random().toString(36).slice(2, 8)}`,
                    imageDataUrl: item.imageDataUrl,
                    sourceImageDataUrl: item.originalDataUrl,
                    cropBox: item.cropBox,
                    createdAt: now,
                    updatedAt: now,
                    ...(thumb.thumbnailDataUrl ? { thumbnailDataUrl: thumb.thumbnailDataUrl } : {}),
                    ...(thumb.thumbnailVersion !== undefined ? { thumbnailVersion: thumb.thumbnailVersion } : {}),
                    ...(thumb.thumbnailUpdatedAt ? { thumbnailUpdatedAt: thumb.thumbnailUpdatedAt } : {}),
                    ...(thumb.thumbnailStatus ? { thumbnailStatus: thumb.thumbnailStatus } : {}),
                  };
                })));
                const db = getWardrobeDb();
                await runLoggedDbTransaction("save_reference_outfit_images", () =>
                  db.transaction("rw", db.items, async () => {
                    const item = await db.items.get(targetId);
                    if (!item) throw new Error("目标衣物不存在");
                    const existing = Array.isArray(item.referenceOutfitImages) ? item.referenceOutfitImages : [];
                    const updated = [...existing, ...refs];
                    await db.items.update(targetId, {
                      referenceOutfitImages: updated,
                      updatedAt: now,
                    });
                    patchItemInItemsState(targetId, { referenceOutfitImages: updated, updatedAt: now });
                  }),
                );
                await refreshState();
                setCaptureImageQueue([]);
                setReferenceOutfitTargetItemId(null);
                showMessage(`已添加 ${refs.length} 张灵感图`);
                return;
              }
            }}
            confirmText={imageIntakePurpose === "reference" ? "添加" : "继续识别"}
            title={`已选择 ${captureImageQueue.length} 张`}
            maxCount={9}
            mode={captureQueueMode}
          />
        </div>,
        document.body
      )}

  </>);
}

const SEARCH_HISTORY_KEY = "wardrobe-search-history";
const MAX_HISTORY = 10;

function loadSearchHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]") as string[]; }
  catch { return []; }
}

function saveSearchHistory(history: string[]) {
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

function centerElementHorizontally(container: HTMLDivElement | null, target: HTMLElement | null) {
  if (!container || !target) return;
  const left = target.offsetLeft - Math.max(0, (container.clientWidth - target.clientWidth) / 2);
  container.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
}

// v1.1.20-dev: WardrobeView props 类型独立成 interface (TS parser 对 destructure + inline
// object type annotation 在 body `{` 处有歧义,无法稳定解析)。原 v1.1.18 之前的代码也用
// 同名 interface 风格,这里还原。
interface WardrobeViewProps {
  items: WardrobeItem[]; allItems: WardrobeItem[]; locations: ClosetLocation[];
  locationNameById: Record<string, string>;
  wardrobeScope: WardrobeScope; setWardrobeScope: (v: WardrobeScope) => void;
  homeCategoryFilter: GarmentCategory | "all"; setHomeCategoryFilter: (v: GarmentCategory | "all") => void;
  query: string; setQuery: (v: string) => void;
  onStartGarmentIntake: () => void; onSeed: () => void;
  onStatusChange: (item: WardrobeItem, status: GarmentStatus) => Promise<void>;
  onDeleteItems: (ids: number[]) => Promise<void>;
  outfits: SavedOutfit[];
  wishlistItems: WishlistItem[];
  /** v0.9.33-dev: 详情页 saved_outfit 派生图裁切 (subagent critical finding #1 修法) 需要更新 outfits 表,
   *  透传 setOutfits 到详情页 onConfirm 让 Dexie 写完后同步本地 state。 */
  setOutfits: React.Dispatch<React.SetStateAction<SavedOutfit[]>>;
  setWishlistItems: React.Dispatch<React.SetStateAction<WishlistItem[]>>;
  setItems: React.Dispatch<React.SetStateAction<WardrobeItem[]>>;
  miniMaxSettings: DeviceMiniMaxSettings;
  onMessage: (msg: string, type?: "success" | "error" | "info") => void;
  onExpandImage: (image: { src: string; alt: string }) => void;
  onSubPageChange?: (active: boolean) => void;
  activeGarmentRoute?: Extract<AppRoute, { name: "garment_detail" }>;
  /** Subagent D: 待打开的衣物详情 ID（种草转换后触发） */
  pendingViewingItemId?: number | null;
  pendingViewingItemReturnTarget?: "wardrobe_home" | "wishlist_owned";
  onPendingViewingItemConsumed?: () => void;
  onReturnToWishlistOwned?: () => void;
  // v1.1.20-dev (Bug 2 修复): WardrobeView 关闭衣物详情时调此回调跳回原 route。
  // wardrobe-app 接收后调 navigation.openRoute,支持从任意来源 (outfit_detail / outfit_calendar /
  // wishlist_purchased 等) 进入衣物详情时准确返回。
  onReturnToRoute?: (route: AppRoute) => void;
}

function WardrobeView(props: WardrobeViewProps) {
  const {
    items, allItems, locations, locationNameById, wardrobeScope, setWardrobeScope,
    homeCategoryFilter, setHomeCategoryFilter,
    query, setQuery, onStartGarmentIntake, onSeed, onStatusChange, onDeleteItems,
    outfits, wishlistItems, setOutfits, setWishlistItems, setItems, miniMaxSettings, onMessage, onExpandImage, onSubPageChange,
    activeGarmentRoute,
    pendingViewingItemId, pendingViewingItemReturnTarget, onPendingViewingItemConsumed, onReturnToWishlistOwned,
    onReturnToRoute,
  } = props;
  const [isSearchOpen, setIsSearchOpen] = useState(false);
 const [showWearStatistics, setShowWearStatistics] = useState(false);
 const [searchHistory, setSearchHistory] = useState<string[]>(() => loadSearchHistory());
 // v0.9.32-dev:瀑布流卡片当前显示图索引(只用于有参考穿搭图的卡片)。itemId → index。
 // 不写入 Dexie,只是 UI state。
 const [waterfallImageIndex, setWaterfallImageIndex] = useState<Record<string, number>>({});
 const patchItemInLocalState = useCallback((itemId: number, patch: Partial<WardrobeItem>) => {
 setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
 setViewingItem((current) => (current?.id === itemId ? { ...current, ...patch } : current));
 }, [setItems]);

 const syncEditedItemReferences = useCallback(async (updatedItem: WardrobeItem, now: string) => {
   if (typeof updatedItem.id !== "number") return;
   const itemId = updatedItem.id;
   const nextItems = allItems.map((item) => (item.id === itemId ? updatedItem : item));
   const relatedOutfits = outfits.filter((outfit) => outfit.itemIds.includes(itemId));
   const relatedWishlistItems = wishlistItems.filter((item) => item.convertedItemId === itemId);
   const db = getWardrobeDb();

   for (const outfit of relatedOutfits) {
     const patch = buildSyncedOutfitPatch(outfit, nextItems, now);
     await db.outfits.update(outfit.id, patch);
     setOutfits((prev) => prev.map((entry) => (entry.id === outfit.id ? { ...entry, ...patch } : entry)));
   }

   for (const wishlistItem of relatedWishlistItems) {
     const patch = buildSyncedPurchasedWishlistPatch(updatedItem, now);
     await db.wishlistItems.update(wishlistItem.id, patch);
     setWishlistItems((prev) => prev.map((entry) => (entry.id === wishlistItem.id ? { ...entry, ...patch } : entry)));
   }
 }, [allItems, outfits, wishlistItems, setOutfits, setWishlistItems]);
  // 顶部衣橱切换浮层是否展开
  const [scopePopoverOpen, setScopePopoverOpen] = useState(false);
  const scopeTriggerRef = useRef<HTMLButtonElement>(null);
  const scopePopoverRef = useRef<HTMLDivElement>(null);
  // 首页分类 chip 行的"更多"是否展开（当前所有分类数量少时也可能不用）
  const [moreCatsOpen, setMoreCatsOpen] = useState(false);
  const moreCatsRef = useRef<HTMLDivElement>(null);
  // 搜索页本地筛选状态（不与首页联动；搜索结果也用 allItems，不受 wardrobeScope 影响）
  const [searchLocationFilter, setSearchLocationFilter] = useState("all");
  const [searchCategoryFilter, setSearchCategoryFilter] = useState<GarmentCategory | "all">("all");
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<WardrobeItem | WardrobeItem[] | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [viewingItem, setViewingItem] = useState<WardrobeItem | null>(null);
  // v1.1.20-dev (Bug 2 修复): garmentDetailReturnTarget 扩展为完整 AppRoute,
  // 支持从 outfit_detail / outfit_calendar / wishlist_* 等任意来源打开衣物详情后
  // 关闭时准确回到原页面。旧版只有 wardrobe_home / wishlist_owned 两个枚举,其他场景全部
  // 落到 wardrobe 首页 — 这是用户报"前一个页面"无法返回的根因。
  const [garmentDetailReturnTarget, setGarmentDetailReturnTarget] = useState<AppRoute>({ name: "wardrobe_home" });
  // v0.9.52-dev: 离开详情页返回衣橱、切换筛选或页面重新进入时重置瀑布流卡片横滑索引
  useEffect(() => {
    setWaterfallImageIndex({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingItem, wardrobeScope, homeCategoryFilter, query]);
  // Subagent D: 待打开的衣物详情 ID（种草转换后触发）
  useEffect(() => {
    if (pendingViewingItemId == null) return;
    const item = items.find((i) => i.id === pendingViewingItemId);
    if (item) {
      // v1.1.6 followup Commit 1: 统一通过 openWardrobeItemDetail 打开, 与普通入口保持一致
      // v1.1.20-dev (Bug 2): pendingViewingItemReturnTarget 兼容 wardrobe_home / wishlist_owned
      // 两种字符串,其他来源 (outfit_detail / outfit_calendar 等) 由 wardrobe-app 通过
      // onReturnToRoute / 直接 openWardrobeItemDetail 传入完整 AppRoute。
      const targetRoute: AppRoute = pendingViewingItemReturnTarget === "wishlist_owned"
        ? { name: "wishlist_purchased" }
        : { name: "wardrobe_home" };
      openWardrobeItemDetail(item, targetRoute);
      onPendingViewingItemConsumed?.();
      // v1.1.20-dev commit2 (P1 诊断): pending_viewing_item_consumed
      // 种草转换 → 衣物详情 链路打点 — 复现"种草转换后为什么没跳详情 / 跳错详情"必备。
      recordDiagnosticEvent("pending_viewing_item_consumed", {
        itemId: item.id,
        returnTarget: pendingViewingItemReturnTarget ?? "wardrobe_home",
        resolvedReturnRoute: targetRoute,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingViewingItemId, pendingViewingItemReturnTarget, items, onPendingViewingItemConsumed]);

  // v1.1.6 followup Commit 1: 统一打开衣物详情, 保证返回来源在所有入口一致。
  // 顺序: setGarmentDetailReturnTarget → setViewingItem → 上报父级 subPage active。
  // onSubPageChange(true) 由 wardrobeSubPageActive useEffect 在 viewingItem 变化时
  // 自动调用 (line ~2520), 此处不重复调用避免双写。
  // v1.1.20-dev (Bug 2 修复): 第二参数升级为完整 AppRoute, 支持任意来源页面返回。
  // v1.1.20-dev commit2 (P0 诊断): garment_detail_opened
  // Bug 2 复现必备 — 确认衣物详情打开时的 returnTarget 是什么。
  function openWardrobeItemDetail(item: WardrobeItem, returnTarget: AppRoute): void {
    recordDiagnosticEvent("garment_detail_opened", {
      itemId: item.id,
      itemName: item.name,
      returnRoute: returnTarget,
    });
    setGarmentDetailReturnTarget(returnTarget);
    setViewingItem(item);
  }

  useEffect(() => {
    if (!activeGarmentRoute) return;
    const item = allItems.find((entry) => entry.id === activeGarmentRoute.itemId)
      ?? items.find((entry) => entry.id === activeGarmentRoute.itemId);
    if (!item) return;
    const returnTarget = getBackRoute(activeGarmentRoute);
    if (viewingItem?.id === item.id && JSON.stringify(garmentDetailReturnTarget) === JSON.stringify(returnTarget)) return;
    openWardrobeItemDetail(item, returnTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeGarmentRoute?.itemId,
    activeGarmentRoute?.returnTo,
    activeGarmentRoute?.initialTab,
    activeGarmentRoute?.returnRoute,
    allItems,
    items,
  ]);
  // v0.9.12: 详情页不再触发 5 tab 缩窄 (避免图标消失); 详情页内 hasSubPageRef 已经包含 viewingItem, 退出提示逻辑仍然正确
  const [editingItem, setEditingItem] = useState(false);
  const [editDraft, setEditDraft] = useState<WardrobeDraft | null>(null);
  const [editInitialSnapshot, setEditInitialSnapshot] = useState<EditSnapshot | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [isEditRecognizing, setIsEditRecognizing] = useState(false);
  const [viewingItemCropJob, setViewingItemCropJob] = useState<{
    dataUrl: string;
    startBox?: WardrobeItem["cropBox"];
    target: "detail" | "edit";
    refId?: string;
    /** v0.9.33-dev: entry 来源标记, 用于 onConfirm 决定写到 items.imageDataUrl 还是 outfits.previewImageDataUrl。
     * - "main" (默认) / undefined → 写到当前 viewingItem 的 imageDataUrl
     * - "reference_outfit" → 由 refId 路径处理, 不会到这里
     * - "saved_outfit" → 写到对应 outfitId 的 preview/cover
     */
    source?: import("@/lib/garment-image-source").GarmentImageSource;
    /** v0.9.33-dev: source === "saved_outfit" 时, 目标 outfit id */
    outfitId?: string;
    /** v1.1.16-dev commit1 §3.4.6: cropBox 坐标所属图片源标记。
     * - "current" (默认) → cropBox 坐标对应 imageDataUrl（当前主图）
     * - "original" → cropBox 坐标对应 sourceImageDataUrl（原始整图）
     * 仅 target==="edit" 时生效, 用于区分坐标基准。
     */
    sourceKind?: "current" | "original";
  } | null>(null);
 const [showEditExitDialog, setShowEditExitDialog] = useState(false);
 // v0.9.32-dev:详情页 / 编辑页 多图查看当前索引 + 参考穿搭图添加入口
 const [viewingImageIndex, setViewingImageIndex] = useState(0);
 const referenceOutfitGalleryInputRef = useRef<HTMLInputElement>(null);
 const [viewingRefDeleteConfirm, setViewingRefDeleteConfirm] = useState<{ id: string } | null>(null);
 // v0.9.47-dev 详情页 3.0: 灵感图查看与编辑说明
 const [viewingRefImage, setViewingRefImage] = useState<ReferenceOutfitImage | null>(null);
 const [editingRefCaption, setEditingRefCaption] = useState<ReferenceOutfitImage | null>(null);
 const [refCaptionDraft, setRefCaptionDraft] = useState("");
 // v0.9.32-dev: 详情页衣物图片组派生(主图+手动参考+SavedOutfit 派生,统一去重)。
 // 瀑布流卡片和详情页都基于这个派生结果渲染。
 // 索引 0 永远是衣物主图,索引 1..N 是 extraImages(手动参考+套装图)。
 const viewingImageEntries = useMemo(
 () => (viewingItem ? deriveGarmentImageList(viewingItem, outfits) : []),
 [viewingItem, outfits],
 );
  // v0.9.45-dev 详情页 2.0: AI 建议生成状态机
  // "idle" | "loading" | "success" | "error" | "no_key"
  const [aiAdviceState, setAiAdviceState] = useState<"idle" | "loading" | "success" | "error" | "no_key">("idle");
  const aiAdviceRunIdRef = useRef(0);

  // v0.9.45-dev 详情页 2.0: 穿着摘要 (基于 viewingItem.wornDates + todayKey)
  const todayKey = useLocalDateKey();
  const wearSummary = useMemo(() => getWearSummary(viewingItem?.wornDates, todayKey), [viewingItem?.wornDates, todayKey]);

  // v0.9.47-dev 详情页 3.0: 搭配推荐单品 (规则算法, 不调 AI)
  const pairingItems = useMemo(
    () => viewingItem ? getRecommendedPairingItemsForItem(viewingItem, items, outfits) : [],
    [viewingItem, items, outfits],
  );

  // v0.9.45-dev 详情页 2.0: 标记今天穿了 toggle
  const handleWearToggle = useCallback(async () => {
    if (!viewingItem || typeof viewingItem.id !== "number") return;
    const nextDates = toggleTodayWornDate(viewingItem.wornDates, todayKey);
    const now = new Date().toISOString();
    await getWardrobeDb().items.update(viewingItem.id, { wornDates: nextDates, updatedAt: now });
    patchItemInLocalState(viewingItem.id, { wornDates: nextDates, updatedAt: now });
    const summary = getWearSummary(nextDates, todayKey);
    onMessage(summary.hasToday ? "已记录今天穿着" : "已取消今天穿着记录", "success");
  }, [viewingItem, patchItemInLocalState, onMessage, todayKey]);

  // v0.9.45-dev 详情页 2.0: 生成/刷新 AI 建议
  const handleGenerateAdvice = useCallback(async () => {
    if (!viewingItem || typeof viewingItem.id !== "number") return;
    if (!hasDeviceMiniMaxKey(miniMaxSettings)) {
      setAiAdviceState("no_key");
      return;
    }
    const runId = ++aiAdviceRunIdRef.current;
    setAiAdviceState("loading");
    try {
      const advice = await generateGarmentStyleAdviceOnDevice(viewingItem, miniMaxSettings);
      if (runId !== aiAdviceRunIdRef.current) return;
      const now = new Date().toISOString();
      await getWardrobeDb().items.update(viewingItem.id, { aiStyleAdvice: advice, updatedAt: now });
      patchItemInLocalState(viewingItem.id, { aiStyleAdvice: advice, updatedAt: now });
      setAiAdviceState("success");
      onMessage("AI 建议已生成", "success");
    } catch (error) {
      if (runId !== aiAdviceRunIdRef.current) return;
      setAiAdviceState("error");
      onMessage(getErrorMessage(error), "error");
    }
  }, [viewingItem, miniMaxSettings, patchItemInLocalState, onMessage]);

  // v0.9.47-dev 详情页 3.0: 移动衣物
  const handleMoveItem = useCallback(async (locationId: string) => {
    if (!viewingItem || typeof viewingItem.id !== "number") return;
    const now = new Date().toISOString();
    const patch: Partial<WardrobeItem> = { locationId, updatedAt: now };
    await getWardrobeDb().items.update(viewingItem.id, patch);
    await syncEditedItemReferences({ ...viewingItem, ...patch }, now);
    patchItemInLocalState(viewingItem.id, patch);
    const locName = locations.find((l) => l.id === locationId)?.name ?? locationId;
    onMessage(`已移动到 ${locName}`, "success");
  }, [viewingItem, locations, syncEditedItemReferences, patchItemInLocalState, onMessage]);
  const [diagnosis, setDiagnosis] = useState<WardrobeDiagnosis | null>(null);
  // AI 衣橱诊断卡片状态机 (v0.9.19: 统一为 6 态, 卡片内自管 loading/error, 不再走顶部独立进度条):
  //   "hidden"           - 卡片隐藏；顶部入口负责唤起
  //   "collapsed"        - 卡片显示，详情收起
  //   "expanded"         - 卡片显示，详情展开
  //   "loading"          - 正在生成诊断（卡片内显示文案，按钮禁用）
  //   "error_no_cache"   - 首次诊断失败，无旧结果
  //   "error_with_cache" - 重新生成失败，但保留旧结果
  // 收起/展开/重新生成/关闭/失败兜底 各自走显式 setDiagnosisState 转换, 互不串味。
  type DiagnosisState = "hidden" | "collapsed" | "expanded" | "loading" | "error_no_cache" | "error_with_cache";
  const [diagnosisState, setDiagnosisState] = useState<DiagnosisState>("hidden");
  const isDiagnosing = diagnosisState === "loading";
  const diagnosisVisible = diagnosisState !== "hidden";
  const diagnosisError = diagnosisState === "error_no_cache" || diagnosisState === "error_with_cache";
  // 诊断是否包含可展示的细节（issues 数组或购买方向）。都为空时 collapsed 不显示"查看详情"按钮，expanded 也只显示"无细节"占位。
  const hasDiagnosisDetails = !!diagnosis && (
    diagnosis.duplicates.length > 0
    || diagnosis.gaps.length > 0
    || diagnosis.idleItems.length > 0
    || diagnosis.reusableOutfits.length > 0
    || diagnosis.purchaseSuggestions.length > 0
  );

  // v0.9.20 (subagent I-1 + I-2 修复):
  // 每次 runDiagnosis 入口递增 runIdRef.current, await 完成后用闭包捕获的 myRunId 与 ref 当前值比对：
  //   - 不等 → 该次请求已被用户主动关闭 / 重新发起的新 run 覆盖, 不写回 setDiagnosis / setDiagnosisState
  //   - 相等 → 当前 run 仍有效, 正常写回
  // 关闭按钮 (X) onClick 也会递增 runIdRef.current, 让 in-flight 请求的 setState 失效,
  // 避免"loading 期间点 X 关闭 → 15s 后 API 响应回来卡片又跳出来"。
  // useRef 同步读写, 不会被 React 18 自动 batching 合并, 比 state 闭包更可靠。
  const diagnosisRunIdRef = useRef(0);
  // v0.9.20-dev-i2fix: 同步 in-flight 锁。useRef 同步读写不会被 React 18 自动 batching
  // 合并，配合 runDiagnosis 入口的 if (isDiagnosisRunningRef.current) return; 拒绝同帧双触发。
  // 与 diagnosisRunIdRef 互补：runId 锁防"close 期间 API 响应回跳"（I-1，24fb5c4 已修），
  // isRunning 锁防"两次 API 同时 in-flight 浪费 M3 费用"（I-2，本 commit 彻底修）。
  const isDiagnosisRunningRef = useRef(false);
  const closeDiagnosis = useCallback(() => {
    diagnosisRunIdRef.current += 1; // 失效 in-flight 请求
    setDiagnosisState("hidden");
  }, []);

  const cancelMultiSelect = useCallback(() => {
    setMultiSelectMode(false);
    setSelectedItemIds(new Set());
  }, []);

  useEffect(() => {
    hasSubPageRef.current = !!(showWearStatistics || isSearchOpen || viewingItem || editingItem || viewingItemCropJob || showEditExitDialog || multiSelectMode || deleteConfirm);
  }, [showWearStatistics, isSearchOpen, viewingItem, editingItem, viewingItemCropJob, showEditExitDialog, multiSelectMode, deleteConfirm]);

  useEffect(() => {
    onSubPageChange?.(!!(showWearStatistics || viewingItem || editingItem || viewingItemCropJob));
  }, [showWearStatistics, editingItem, onSubPageChange, viewingItem, viewingItemCropJob]);

  // v1.1.20-dev commit2 (P1 诊断): wardrobe_subpage_changed
  // 衣橱内的所有子页面状态切换都打点 — 搜索 / 统计 / 详情 / 编辑 / 裁切 / 多选。
  // 用 ref 记上次 active 状态避免重复打点 (onSubPageChange 自身会 bail-out)。
  const wardrobeSubPageName =
    isSearchOpen ? "search" :
    showWearStatistics ? "wearStatistics" :
    multiSelectMode ? "multiSelect" :
    viewingItemCropJob ? "crop" :
    editingItem ? "edit" :
    viewingItem ? "detail" :
    null;
  const lastSubPageNameRef = useRef<string | null>(null);
  useEffect(() => {
    const next = wardrobeSubPageName;
    if (next === lastSubPageNameRef.current) return;
    recordDiagnosticEvent("wardrobe_subpage_changed", { subPage: next });
    lastSubPageNameRef.current = next;
  }, [wardrobeSubPageName]);

  // v1.1.20-dev commit2 (P1 诊断): edit_session_started / closed
  // 编辑页进入 / 退出打点 (区别于已有 edit_recrop_started / edit_recrop_confirmed,
  // 那两个只覆盖重新裁切路径)。复现"为什么编辑页面卡住 / 退出没生效"必备。
  const wasEditingRef = useRef(false);
  useEffect(() => {
    if (editingItem === wasEditingRef.current) return;
    wasEditingRef.current = editingItem;
    recordDiagnosticEvent(editingItem ? "edit_session_started" : "edit_session_closed", {
      itemId: editingItem ? viewingItem?.id : undefined,
    });
  }, [editingItem, viewingItem?.id]);

  // v1.1.20-dev commit2 (P1 诊断): viewing_item_crop_started / cancelled
  // 覆盖所有裁切路径 (详情页 / 编辑页 / sourceKind original vs current)。
  // 已有 edit_recrop_started 只覆盖编辑页一种路径, 这里补全详情页。
  const lastCropTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!viewingItemCropJob) {
      if (lastCropTargetRef.current) {
        recordDiagnosticEvent("viewing_item_crop_cancelled", { previousTarget: lastCropTargetRef.current });
        lastCropTargetRef.current = null;
      }
      return;
    }
    const target = viewingItemCropJob.target;
    if (lastCropTargetRef.current === target) return;
    lastCropTargetRef.current = target;
    recordDiagnosticEvent("viewing_item_crop_started", {
      target,
      sourceKind: viewingItemCropJob.sourceKind ?? "current",
      hasStartBox: Boolean(viewingItemCropJob.startBox),
    });
  }, [viewingItemCropJob]);

  useEffect(() => () => onSubPageChange?.(false), [onSubPageChange]);

  // v0.9.29-dev: 修依赖粒度 — 之前依赖整个 editDraft 对象, 任何字段变化 (包括 notes 增删
  //  一字) 都会触发 useEffect 重跑 + scrollIntoView 把主色/配色 chip 拉到可视区,
  //  推出 textarea 录屏 52510.mp4 复现的 "删除时页面跳到穿搭属性/颜色信息/风格标签" 根因。
  // 修法: 依赖具体颜色字段, 避免 notes 改动触发滚动
  //  notes 变化时这两个数组的 reference 不变, useEffect 不重跑, scrollIntoView 不触发。
  const editPrimaryColorsKey = editDraft ? getPrimaryColors(editDraft.colors).join("|") : "";
  const editAccentColorsKey = editDraft ? getAccentColors(editDraft.colors).join("|") : "";
  useEffect(() => {
    if (!editDraft) return;
    if (editPrimaryColorsKey && editPrimaryColorRef.current) {
      const first = editPrimaryColorRef.current.querySelector("[data-active=true]") as HTMLElement | null;
      if (first) first.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- v0.9.29-dev: 故意只依赖颜色 key, 避免 notes 改动触发滚动
  }, [editPrimaryColorsKey]);

  useEffect(() => {
    if (!editDraft) return;
    if (editAccentColorsKey && editSecondaryColorRef.current) {
      const first = editSecondaryColorRef.current.querySelector("[data-active=true]") as HTMLElement | null;
      if (first) first.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- v0.9.29-dev: 故意只依赖颜色 key, 避免 notes 改动触发滚动
  }, [editAccentColorsKey]);

  useEffect(() => {
    if (viewingItem) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [viewingItem]);

  useEffect(() => {
    if (editingItem) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [editingItem]);

  useEffect(() => { if (!isSearchOpen) return; window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); const cleanup = () => { setIsSearchOpen(false); setQuery(""); setSearchLocationFilter("all"); setSearchCategoryFilter("all"); };
    let removed = false; let h: { remove: () => void } | null = null;
    App.addListener("backButton", () => { if (!removed) { removed = true; cleanup(); } }).then((x) => { if (!removed) h = x; });
    return () => { removed = true; h?.remove(); };
  }, [isSearchOpen, setQuery]); // setters are stable; search-local filter 状态只用于搜索页内

  useEffect(() => {
    if (!showWearStatistics) return;
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    let removed = false; let h: { remove: () => void } | null = null;
    App.addListener("backButton", () => { if (!removed) { removed = true; setShowWearStatistics(false); } }).then((x) => { if (!removed) h = x; });
    return () => { removed = true; h?.remove(); };
  }, [showWearStatistics]);

  useEffect(() => {
    if (!multiSelectMode) return;
    let removed = false; let h: { remove: () => void } | null = null;
    App.addListener("backButton", () => {
      if (removed) return;
      if (deleteConfirm) {
        if (deleteSubmitting) {
          onMessage("正在删除，请稍候", "info");
          return;
        }
        setDeleteConfirm(null);
        return;
      }
      cancelMultiSelect();
    }).then((x) => { if (!removed) h = x; });
    return () => { removed = true; h?.remove(); };
  }, [multiSelectMode, deleteConfirm, deleteSubmitting, cancelMultiSelect, onMessage]);

  // 顶部衣橱切换浮层：点击浮层外部关闭（trigger / popover 自身不关）
  useEffect(() => {
    if (!scopePopoverOpen) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (scopeTriggerRef.current?.contains(target)) return;
      if (scopePopoverRef.current?.contains(target)) return;
      setScopePopoverOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [scopePopoverOpen]);

  // "更多分类" popover：使用 portal + fixed 定位，规避 chip 行 overflow-x-auto 父级
  // 自动把 overflow-y 也强制为 auto 导致的 popover 裁剪问题。
  const [moreCatsPos, setMoreCatsPos] = useState<{ top: number; right: number; triggerWidth: number } | null>(null);
  const moreCatsTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!moreCatsOpen) { setMoreCatsPos(null); return; }
    function update() {
      const trigger = moreCatsTriggerRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      setMoreCatsPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right), triggerWidth: r.width });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [moreCatsOpen]);
  // "更多分类" popover：点击外部关闭（trigger / 浮层自身不关）
  useEffect(() => {
    if (!moreCatsOpen) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (moreCatsTriggerRef.current?.contains(target)) return;
      if (moreCatsRef.current?.contains(target)) return;
      setMoreCatsOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [moreCatsOpen]);

  // ---- 首页顶部用到的派生数据 ----
  const isAllScope = wardrobeScope === "all";
  // 当前 scope 下的衣物（不含 homeCategoryFilter），用于顶部按钮件数 + 统计行
  const scopeItems = useMemo(
    () => (isAllScope ? allItems : allItems.filter((it) => it.locationId === wardrobeScope)),
    [allItems, isAllScope, wardrobeScope],
  );
  const scopeActiveCount = useMemo(() => scopeItems.filter((it) => it.status === "active").length, [scopeItems]);
  // 顶部衣橱按钮第一行 / 浮层选项文案
  const scopeLabel = isAllScope ? "全部衣橱" : (locationNameById[wardrobeScope] ?? "已选衣橱");
  // 衣橱数：只在 "all" 时有意义；具体衣橱 scope 下隐藏该段
  const locationCount = locations.length;
  // 浮层可选项（动态生成，不要写死只有三个衣橱）
  const scopeOptions = useMemo(() => {
    const allCount = allItems.length;
    const allOpt = { id: "all" as WardrobeScope, name: "全部衣橱", note: "包含所有衣物", count: allCount };
    const sorted = [...locations].sort((a, b) => a.sortOrder - b.sortOrder);
    const locOpts = sorted.map((l) => ({
      id: l.id as WardrobeScope,
      name: l.name,
      note: l.note?.trim() ? l.note : "",
      count: allItems.filter((it) => it.locationId === l.id).length,
    }));
    return [allOpt, ...locOpts];
  }, [allItems, locations]);

  // 派生：当前 scope（当前衣橱或"全部衣橱"）下，每个分类的衣物数量。
  // 必须基于 scopeItems（已按 wardrobeScope 过滤、未按 homeCategoryFilter 过滤），
  // 与首页"全部"列表展示范围保持一致；不读 allItems，否则会把其他衣橱的分类带进来。
  const categoryCounts = useMemo(() => {
    const map = new Map<GarmentCategory, number>();
    for (const item of scopeItems) {
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
    }
    return map;
  }, [scopeItems]);

  // 分类 chip 行：动态来源于当前 scope 下实际存在（count > 0）的分类 + CATEGORY_LABELS 字典中文名。
  // - 分类名仍走 CATEGORY_LABELS（系统字典），不写死
  // - count = 0 的分类不展示（避免出现"连衣裙 0"这种空 chip）
  // - 排序：count 降序，count 相同时按 CATEGORY_LABELS key 的系统顺序稳定排序
  //   （categoryOptions = Object.keys(CATEGORY_LABELS) 保留系统顺序）
  const availableHomeCategories = useMemo(() => {
    return categoryOptions
      .map((c) => ({ id: c, label: CATEGORY_LABELS[c], count: categoryCounts.get(c) ?? 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return categoryOptions.indexOf(a.id) - categoryOptions.indexOf(b.id);
      });
  }, [categoryCounts]);

  // 横向 chip 默认展示前 N 个 + 一个"更多"按钮；点"更多"在浮层里展示剩余
  // （不切换 chip 行的可见集合，避免浮层内容跟按钮一起消失）
  const PRIMARY_CAT_VISIBLE = 5;
  const visibleCats = useMemo(() => availableHomeCategories.slice(0, PRIMARY_CAT_VISIBLE), [availableHomeCategories]);
  const hiddenCats = useMemo(() => availableHomeCategories.slice(PRIMARY_CAT_VISIBLE), [availableHomeCategories]);
  // 当前选中的"更多"分类（用于"更多"按钮选中态可视化, subagent important 1）
  const hiddenSelectedCat = useMemo(
    () => hiddenCats.find((c) => c.id === homeCategoryFilter),
    [hiddenCats, homeCategoryFilter],
  );

  // 兜底：当 homeCategoryFilter 选中的分类在当前 scope 中已不存在时
  // （切换衣橱、删除/移动最后一件该分类衣物等），自动重置为 "all"，
  // 避免出现"选中状态不可见 / 列表空白但没有任何解释"的死局。
  //
  // 用 useLayoutEffect 而非 useEffect：useLayoutEffect 在 DOM commit 后、
  // 浏览器 paint 前同步执行，reset 后 React 同步重新 commit，浏览器首次
  // paint 时看到的就是"已 reset 到 all"的状态，**消除 I1-I3 1-frame 闪**。
  // （与 v0.9.13 line 3542 useLayoutEffect 越界兜底同模式）
  useLayoutEffect(() => {
    if (homeCategoryFilter === "all") return;
    if (!availableHomeCategories.some((c) => c.id === homeCategoryFilter)) {
      setHomeCategoryFilter("all");
    }
  }, [availableHomeCategories, homeCategoryFilter, setHomeCategoryFilter]);
  const editCurrentSnapshot = useMemo(() => (editDraft ? editSnapshotFromDraft(editDraft) : null), [editDraft]);
  const hasEditChanges = useMemo(
    () => Boolean(editDraft && editInitialSnapshot && editCurrentSnapshot && !snapshotsEqual(editInitialSnapshot, editCurrentSnapshot)),
    [editCurrentSnapshot, editDraft, editInitialSnapshot],
  );

  const editBackRef = useRef<{ remove: () => void } | null>(null);
  const detailBackRef = useRef<{ remove: () => void } | null>(null);
  const editPrimaryColorRef = useRef<HTMLDivElement>(null);
  const editSecondaryColorRef = useRef<HTMLDivElement>(null);

  function openEditForViewingItem() {
    if (!viewingItem) return;
    const nextDraft = normalizeDraftForEdit(viewingItem);
    setEditDraft(nextDraft);
    setEditInitialSnapshot(editSnapshotFromDraft(nextDraft));
    setShowEditExitDialog(false);
    setEditingItem(true);
  }

  const closeEditWithoutPrompt = useCallback(() => {
    setShowEditExitDialog(false);
    setEditingItem(false);
    setEditDraft(null);
    setEditInitialSnapshot(null);
    setIsEditSaving(false);
    setIsEditRecognizing(false);
  }, []);

  const requestExitEdit = useCallback(() => {
    if (viewingItemCropJob) {
      setViewingItemCropJob(null);
      return;
    }
    if (hasEditChanges) {
      setShowEditExitDialog(true);
      return;
    }
    closeEditWithoutPrompt();
  }, [closeEditWithoutPrompt, hasEditChanges, viewingItemCropJob]);

  function setEditMainColor(color: string) {
    setEditDraft((current) => {
      if (!current) return current;
      const currentColors = normalizeColorFields(current);
      const mode: ColorMode = current.colors.mode;
      if (mode === "multicolor") {
        return { ...current, colors: buildColorInfo("multicolor", uniqueTrimmed([color, ...currentColors.primaryColors]).slice(0, 5)) };
      }
      return { ...current, colors: buildColorInfo(mode, [color], currentColors.accentColors.filter((item) => item !== color)) };
    });
  }

  function setEditAccentColors(colors: string[]) {
    setEditDraft((current) => {
      if (!current) return current;
      const currentColors = normalizeColorFields(current);
      const main = currentColors.mainColor || currentColors.primaryColors[0] || "";
      return { ...current, colors: buildColorInfo("main_with_accent", main ? [main] : [], colors.filter((color) => color !== main).slice(0, 5)) };
    });
  }

  function setEditPrimaryColors(colors: string[]) {
    setEditDraft((current) => {
      if (!current) return current;
      return { ...current, colors: buildColorInfo("multicolor", colors.slice(0, 5)) };
    });
  }

  async function recognizeEditDraftAgain() {
    if (!editDraft) return;
    if (!hasDeviceMiniMaxKey(miniMaxSettings)) {
      onMessage("请先在设置里配置 MiniMax Key", "info");
      return;
    }
    const source = editDraft.imageDataUrl || editDraft.sourceImageDataUrl;
    if (!source) {
      onMessage("当前衣物没有可识别的图片", "info");
      return;
    }
    if (isEditRecognizing) return;
    setIsEditRecognizing(true);
    try {
      const file = await dataUrlToFile(source, `${editDraft.name || "garment"}.jpg`).catch(() => null);
      const aiRequestDataUrl = file ? await fileToAiRequestDataUrl(file).catch(() => source) : source;
      const recognition = await withKeepAwake(() =>
        recognizeSingleItemFromDataUrl(aiRequestDataUrl, source, editDraft.name || "garment.jpg", miniMaxSettings),
      );
      const tag = recognition.tag;
      const patch = buildWardrobeEditRecognitionPatch(tag, {
        currentNotes: editDraft.notes,
      });
      setEditDraft((current) =>
        current
          ? {
              ...current,
              category: patch.category,
              subcategory: patch.subcategory ?? current.subcategory,
              colors: patch.colors,
              seasons: patch.seasons,
              styles: patch.styles,
              temperatureRange: patch.temperatureRange ?? current.temperatureRange,
              formality: patch.formality,
              warmth: patch.warmth,
              material: patch.material ?? current.material,
              fitGender: patch.fitGender ?? current.fitGender,
              fitNotes: patch.fitNotes ?? current.fitNotes,
              aiConfidence: patch.aiConfidence,
              needsReview: patch.needsReview,
              ...(patch.name != null ? { name: patch.name } : {}),
              ...(patch.notes != null ? { notes: patch.notes } : {}),
            }
          : current,
      );
      onMessage("已重新识别，请确认后保存", "success");
    } catch (error) {
      onMessage(getErrorMessage(error), "error");
    } finally {
      setIsEditRecognizing(false);
    }
  }

  async function saveEditedItem() {
    if (!editDraft || !viewingItem?.id || isEditSaving) return;
    if (!editDraft.name.trim()) {
      onMessage("请先填写衣物名称", "info");
      return;
    }
    setIsEditSaving(true);
    try {
      const now = new Date().toISOString();
      const patch: Partial<WardrobeItem> = {
        name: editDraft.name.trim(),
        imageDataUrl: editDraft.imageDataUrl,
        sourceImageDataUrl: editDraft.sourceImageDataUrl,
        cropBox: editDraft.cropBox,
        category: editDraft.category,
        subcategory: editDraft.subcategory,
        colors: editDraft.colors,
        seasons: editDraft.seasons.length > 0 ? editDraft.seasons : ["all"],
        styles: editDraft.styles.length > 0 ? editDraft.styles : ["casual"],
        formality: editDraft.formality,
        warmth: editDraft.warmth,
        temperatureRange: editDraft.temperatureRange,
        material: editDraft.material,
        fitGender: editDraft.fitGender,
        fitNotes: editDraft.fitNotes?.trim() || undefined,
        price: editDraft.price,
        productUrl: editDraft.productUrl,
        purchaseDate: editDraft.purchaseDate,
        locationId: editDraft.locationId,
        status: editDraft.status,
        notes: editDraft.notes?.trim() || undefined,
        aiConfidence: editDraft.aiConfidence,
        needsReview: editDraft.needsReview,
        updatedAt: now,
      };
      await getWardrobeDb().items.update(viewingItem.id, patch);
      const updatedItem: WardrobeItem = { ...viewingItem, ...editDraft, ...patch, id: viewingItem.id };
      await syncEditedItemReferences(updatedItem, now);
      setViewingItem(updatedItem);
      setEditInitialSnapshot(editSnapshotFromDraft(normalizeDraftForEdit(updatedItem)));
      setEditingItem(false);
      setEditDraft(null);
      await onStatusChange(viewingItem, editDraft.status);
      onMessage("衣物信息已保存", "success");
    } catch (error) {
      onMessage(getErrorMessage(error), "error");
    } finally {
      setIsEditSaving(false);
    }
  }

  useEffect(() => {
    if (!editingItem) {
      editBackRef.current?.remove();
      editBackRef.current = null;
      return;
    }
    let removed = false;
    App.addListener("backButton", () => {
      if (removed) return;
      requestExitEdit();
    }).then((h) => {
      if (removed) {
        h.remove();
        return;
      }
      editBackRef.current = h;
    });
    return () => {
      removed = true;
      editBackRef.current?.remove();
      editBackRef.current = null;
    };
  }, [editingItem, requestExitEdit]);

  // v1.1.20-dev (Bug 2 修复): closeViewingItemByReturnTarget 现在用完整 AppRoute 作为 returnTarget,
  // 支持从 wardrobe_home / outfit_home / outfit_detail / outfit_calendar / wishlist_* / settings_home
  // 等任意来源打开的衣物详情关闭时回到原页面。
  // 通过 onReturnToRoute 回调通知 wardrobe-app 切换 route — wardrobe-app 内调 navigation.openRoute。
  // v1.1.20-dev commit2 (P0 诊断): garment_detail_closed
  // Bug 2 复现必备 — 确认关闭衣物详情时跳回了哪个 route, 走了哪条回调路径。
  const closeViewingItemByReturnTarget = useCallback(() => {
    const viewingId = viewingItem?.id;
    setViewingItem(null);
    closeEditWithoutPrompt();
    setViewingImageIndex(0);
    const target = garmentDetailReturnTarget;
    // 重置 returnTarget 为默认值,防止下次开新详情时残留上次的来源。
    setGarmentDetailReturnTarget({ name: "wardrobe_home" });
    const viaWishlistCallback = target.name === "wishlist_purchased";
    if (viaWishlistCallback) {
      onReturnToWishlistOwned?.();
    } else {
      // 其他来源:通过 onReturnToRoute 回调跳回原 route。
      onReturnToRoute?.(target);
    }
    recordDiagnosticEvent("garment_detail_closed", {
      itemId: viewingId,
      returnedToRoute: target,
      viaWishlistCallback,
    });
  }, [closeEditWithoutPrompt, garmentDetailReturnTarget, onReturnToWishlistOwned, onReturnToRoute, viewingItem?.id]);

  useEffect(() => {
    if (!viewingItem || editingItem || isSearchOpen) {
      detailBackRef.current?.remove();
      detailBackRef.current = null;
      return;
    }
    let removed = false;
    App.addListener("backButton", () => {
      if (removed) return;
      if (viewingItemCropJob) {
        setViewingItemCropJob(null);
        return;
      }
      closeViewingItemByReturnTarget();
    }).then((h) => {
      if (removed) {
        h.remove();
        return;
      }
      detailBackRef.current = h;
    });
    return () => {
      removed = true;
      detailBackRef.current?.remove();
      detailBackRef.current = null;
    };
  }, [viewingItem, editingItem, isSearchOpen, viewingItemCropJob, closeViewingItemByReturnTarget]);

  function applySearch(q: string, cat?: GarmentCategory | "all", loc?: string) {
    setQuery(q);
    if (cat !== undefined) setSearchCategoryFilter(cat);
    if (loc !== undefined) setSearchLocationFilter(loc);
    const next = [q, ...searchHistory.filter((h) => h !== q)].slice(0, MAX_HISTORY);
    setSearchHistory(next); saveSearchHistory(next);
  }

  function closeSearch() {
    // 取消搜索 = 放弃当前搜索上下文, 一并清空 query 和搜索页本地筛选
    // (与 Android 硬件返回键的 cleanup 行为保持一致)
    setIsSearchOpen(false);
    setQuery("");
    setSearchLocationFilter("all");
    setSearchCategoryFilter("all");
  }

  async function confirmDeleteItem(target: WardrobeItem | WardrobeItem[]) {
    setDeleteError(null);
    setDeleteConfirm(target);
  }

  async function executeDelete() {
    if (!deleteConfirm) return;
    const targets = Array.isArray(deleteConfirm) ? deleteConfirm : [deleteConfirm];
    const ids = targets.map((i) => i.id).filter((id): id is number => typeof id === "number");
    if (ids.length === 0) { setDeleteConfirm(null); return; }
    setDeleteSubmitting(true);
    setDeleteError(null);
    recordDiagnosticEvent("delete_items_started", { mode: Array.isArray(deleteConfirm) ? "bulk" : "single", ids });
    try {
      await onDeleteItems(ids);
      recordDiagnosticEvent("delete_items_succeeded", { ids });
      setDeleteConfirm(null);
      setMultiSelectMode(false);
      setSelectedItemIds(new Set());
    } catch (error) {
      recordDiagnosticEvent("delete_items_failed", { ids, error: error instanceof Error ? error.message : String(error) });
      setDeleteError(error instanceof Error ? error.message : "删除失败，请重试");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function handleDetailDelete(itemId: number): Promise<void> {
    recordDiagnosticEvent("delete_item_detail_started", { itemId });
    try {
      await onDeleteItems([itemId]);
      recordDiagnosticEvent("delete_item_detail_succeeded", { itemId });
      setViewingItem(null);
      onMessage("已删除", "success");
    } catch (error) {
      recordDiagnosticEvent("delete_item_detail_failed", { itemId, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  function toggleMultiSelect(item: WardrobeItem) {
    if (!multiSelectMode) { setMultiSelectMode(true); if (item.id) setSelectedItemIds(new Set([item.id])); return; }
    setSelectedItemIds((prev) => { const next = new Set(prev); if (item.id) { if (next.has(item.id)) next.delete(item.id); else next.add(item.id); } if (next.size === 0) setMultiSelectMode(false); return next; });
  }

  // v0.9.27-dev: AI 衣橱诊断进度同步到 Android 系统通知栏。
  //  - "loading"  → startProgressNotification (持续 1-15s, 显示"分析衣橱数据")
  //  - "collapsed" / "expanded" (从 loading 过渡) → completeProgressNotification (1.5s 自动消失)
  //  - "error_no_cache" / "error_with_cache"  → failProgressNotification (2.5s 自动消失)
  //  - "hidden"  → dismissProgressNotification
  //
  // v0.9.27-dev subagent I-3 修复: 之前"collapsed" / "expanded" 都触发 complete,
  // 用户展开/重开缓存诊断都会再弹"已完成"通知。现在用 lastNotifiedDiagnosisState
  // ref 记上次同步过的状态, 只在"loading → collapsed/expanded"这一次过渡触发
  // complete, "hidden → collapsed" 缓存重开不再重复弹通知。
  const lastNotifiedDiagnosisStateRef = useRef<DiagnosisState | null>(null);
  useEffect(() => {
    if (!isNativeProgressNotificationSupported()) return;
    const taskId: NativeProgressTaskId = "wardrobe_diagnosis";
    const prev = lastNotifiedDiagnosisStateRef.current;
    lastNotifiedDiagnosisStateRef.current = diagnosisState;

    if (diagnosisState === "loading") {
      void ensureProgressNotificationPermission();
      void startProgressNotification({
        taskId,
        title: "AI 衣橱诊断",
        text: "正在分析衣橱数据",
        percent: 30,
        ongoing: true,
      });
      resetThrottle(taskId);
    } else if (
      (diagnosisState === "collapsed" || diagnosisState === "expanded")
      && prev === "loading"
    ) {
      // 只在"loading → collapsed/expanded"这一次 API 完成的过渡触发 complete
      void completeProgressNotification(taskId, "AI 衣橱诊断", "诊断已生成");
      resetThrottle(taskId);
    } else if (diagnosisState === "error_no_cache" || diagnosisState === "error_with_cache") {
      void failProgressNotification(taskId, "AI 衣橱诊断", "诊断失败");
      resetThrottle(taskId);
    } else if (diagnosisState === "hidden" && prev !== null && prev !== "hidden") {
      // 只在"非 hidden → hidden"过渡 (用户主动关闭) 触发 dismiss。
      // 初始 mount 时的 default "hidden" 不主动 dismiss (没有通知, no-op 浪费一次跨桥)。
      void dismissProgressNotification(taskId);
      resetThrottle(taskId);
    }
  }, [diagnosisState]);

  async function runDiagnosis() {
    // v0.9.20-dev-i2fix: 同步 in-flight 锁（I-2 彻底修）。
    // useRef 同步读写不会被 React 18 自动 batching 合并，即使两次 click 在同帧被 batched，
    // 第二次 click 入口时 isDiagnosisRunningRef.current 已经是 true（第一次 click 同步置 true），
    // 立即 return 不发起第二次 API。
    // 24fb5c4 的诊断（"I-2 同帧双触发未完全修"）就是缺这一锁。
    if (isDiagnosisRunningRef.current) return;
    if (diagnosisState === "loading") return; // 保留 state 闭包检查作为双保险
    if (!hasDeviceMiniMaxKey(miniMaxSettings)) {
      onMessage("请先在设置里配置 MiniMax Key", "info");
      return;
    }
    if (allItems.length < 2) {
      onMessage("衣物太少，先录入几件常穿单品后再诊断", "info");
      return;
    }
    // 24fb5c4: 用 useRef 同步锁替代 state 闭包检查, 一次性解决:
    //   - I-1 close-during-loading 竞态: 用户点 X → closeDiagnosis 递增 runIdRef, in-flight 请求 await 返回时 capturedRunId 已失效, 不写回 setState
    //   I-2 由本 commit 的 isDiagnosisRunningRef 在入口处直接拒绝二次进入彻底修。
    const myRunId = ++diagnosisRunIdRef.current;
    // 记录"重新生成前是否有旧结果"，失败时用来决定 error 态是带缓存还是不带缓存。
    const hadPreviousDiagnosis = !!diagnosis;
    setDiagnosisState("loading");
    isDiagnosisRunningRef.current = true; // 入口同步加锁（setDiagnosisState 触发的是异步 render 提交，加锁必须同步）
    try {
      const next = await withKeepAwake(() =>
        diagnoseWardrobeOnDevice(allItems, outfits, locations, miniMaxSettings),
      );
      if (myRunId !== diagnosisRunIdRef.current) return; // run 已被关闭 / 覆盖, 丢弃结果
      setDiagnosis(next);
      setDiagnosisState("collapsed"); // 重新生成完成后默认回到收起状态
      onMessage("衣橱诊断已生成");
    } catch (error) {
      if (myRunId !== diagnosisRunIdRef.current) return; // run 已被关闭 / 覆盖, 丢弃错误
      // 错误详情只进 console / Logcat，**不**通过 error.message / onMessage 暴露给 UI（卡片错误态用用户可理解文案）
      if (typeof console !== "undefined") {
        console.error("[AI 衣橱诊断] 生成失败:", {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          hadPreviousDiagnosis,
          itemsCount: allItems.length,
        });
      }
      // 失败时根据是否有旧结果决定 error 态：
      //  - 有旧结果：error_with_cache（保留旧结果，"刷新失败"）
      //  - 无旧结果：error_no_cache（不显示旧结果，"诊断生成失败"）
      if (hadPreviousDiagnosis) {
        setDiagnosisState("error_with_cache");
        onMessage("刷新失败，已保留上次诊断结果", "info");
      } else {
        setDiagnosisState("error_no_cache");
      }
    } finally {
      isDiagnosisRunningRef.current = false; // 同步释放锁，确保下次 / 失败 / 异常路径都能正常发起新 run
    }
  }

  // 顶部 AI 衣橱诊断入口：主要负责打开 / 唤起诊断卡片。
  // - hidden + 有旧结果：直接 collapsed（不重新生成）
  // - hidden + 无结果：loading + runDiagnosis
  // - error_no_cache：loading（重新生成）
  // - error_with_cache：collapsed（展示旧结果）
  // - collapsed / expanded / loading：入口 disabled 避免误触
  function handleTopDiagnosisClick() {
    if (diagnosisState === "loading") return;
    if (diagnosisState === "hidden" || diagnosisState === "error_no_cache" || diagnosisState === "error_with_cache") {
      const hasCachedResult = !!diagnosis;
      if (diagnosisState === "error_with_cache" || (diagnosisState === "hidden" && hasCachedResult)) {
        setDiagnosisState("collapsed");
      } else {
        void runDiagnosis();
      }
    }
  }


  if (viewingItem) {
    return (
      <AnimatedPage className="grid gap-4">
        {!editingItem ? (
          <>
            <GarmentDetail30
              item={viewingItem}
              allItems={items}
              outfits={outfits}
              locations={locations}
              wearSummary={wearSummary}
              aiStyleAdvice={viewingItem.aiStyleAdvice}
              aiAdviceState={aiAdviceState}
              hasMiniMaxKey={hasDeviceMiniMaxKey(miniMaxSettings)}
              pairingItems={pairingItems}
              imageEntries={viewingImageEntries}
              currentImageIndex={viewingImageIndex}
              onCurrentImageIndexChange={setViewingImageIndex}
              initialTab={activeGarmentRoute?.initialTab}
              onBack={closeViewingItemByReturnTarget}
              onWearToggle={handleWearToggle}
              onEdit={openEditForViewingItem}
              onDelete={viewingItem.id != null ? () => handleDetailDelete(viewingItem.id as number) : async () => {}}
              onMoveItem={handleMoveItem}
              onAddReferenceImage={() => referenceOutfitGalleryInputRef.current?.click()}
              onViewReferenceImage={(ref) => setViewingRefImage(ref)}
              onEditReferenceCaption={(ref) => { setEditingRefCaption(ref); setRefCaptionDraft(ref.caption || ""); }}
              onDeleteReferenceImage={(ref) => setViewingRefDeleteConfirm({ id: ref.id })}
              onGenerateAdvice={handleGenerateAdvice}
              onGoSettings={() => onMessage("请前往设置页配置 MiniMax Key", "info")}
              onViewOutfit={(outfitId) => {
                if (viewingItem.id == null) return;
                const currentDetailRoute: AppRoute = {
                  name: "garment_detail",
                  itemId: viewingItem.id,
                  returnTo: garmentDetailReturnTarget.name,
                  initialTab: "pairing",
                };
                setViewingItem(null);
                closeEditWithoutPrompt();
                onReturnToRoute?.({
                  name: "outfit_detail",
                  outfitId,
                  returnTo: currentDetailRoute.returnTo,
                  returnRoute: currentDetailRoute,
                });
              }}
              onExpandImage={onExpandImage}
              onCropAt={(idx) => {
                const entry = viewingImageEntries[idx];
                if (!entry) return;
                if (entry.source === "main") {
                  const src = viewingItem.sourceImageDataUrl || viewingItem.imageDataUrl;
                  if (src) setViewingItemCropJob({ dataUrl: src, startBox: viewingItem.cropBox, target: "detail" });
                } else {
                  setViewingItemCropJob({
                    dataUrl: entry.sourceImageDataUrl || entry.imageDataUrl,
                    startBox: entry.cropBox,
                    target: "detail",
                    refId: entry.refId,
                    source: entry.source,
                    outfitId: entry.outfitId,
                  });
                }
              }}
            />
            {/* v0.9.45-dev: 参考穿搭图添加 hidden input */}
            <input
              ref={referenceOutfitGalleryInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
              multiple
              className="hidden"
              onChange={async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0 || typeof viewingItem.id !== "number") {
                  if (referenceOutfitGalleryInputRef.current) referenceOutfitGalleryInputRef.current.value = "";
                  return;
                }
                const targetId = viewingItem.id;
                const now = new Date().toISOString();
                const refs: ReferenceOutfitImage[] = [];
                const fileArr = Array.from(files);
                const heicTotal = fileArr.filter(isHeicFile).length;
                let heicSeen = 0;
                let failedHeic = 0;
                for (let i = 0; i < fileArr.length; i++) {
                  const file = fileArr[i]!;
                  const currentIsHeic = isHeicFile(file);
                  if (currentIsHeic) {
                    heicSeen += 1;
                    onMessage(heicTotal > 1 ? `正在转换 HEIC 图片 ${heicSeen}/${heicTotal}...` : "正在转换 HEIC 图片...", "info");
                  }
                  try {
                    const originalDataUrl = await fileToOriginalDataUrl(file);
                    refs.push({
                      id: `ref-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
                      imageDataUrl: originalDataUrl,
                      sourceImageDataUrl: originalDataUrl,
                      createdAt: now,
                      updatedAt: now,
                    });
                  } catch (error) {
                    if (currentIsHeic) failedHeic += 1;
                    if (typeof console !== "undefined") console.warn("[viewingRef] 读取失败:", error);
                  }
                }
                if (refs.length === 0) {
                  if (referenceOutfitGalleryInputRef.current) referenceOutfitGalleryInputRef.current.value = "";
                  onMessage(failedHeic > 0 ? "HEIC 转码失败，建议在系统相机设置中改成 JPEG/最兼容后重试" : "图片读取失败，请重试", "error");
                  return;
                }
                const existing = Array.isArray(viewingItem.referenceOutfitImages) ? viewingItem.referenceOutfitImages : [];
                const updated = [...existing, ...refs];
                await getWardrobeDb().items.update(targetId, {
                  referenceOutfitImages: updated,
                  updatedAt: now,
                });
                patchItemInLocalState(targetId, { referenceOutfitImages: updated, updatedAt: now });
                setViewingImageIndex(existing.length + 1);
                if (referenceOutfitGalleryInputRef.current) referenceOutfitGalleryInputRef.current.value = "";
                onMessage(failedHeic > 0 ? `已添加 ${refs.length} 张灵感图，部分 HEIC 图片转换失败` : `已添加 ${refs.length} 张灵感图`, failedHeic > 0 ? "info" : "success");
              }}
            />
            {/* v0.9.32-dev: 删除参考图确认弹窗 */}
            <MotionSheet open={!!viewingRefDeleteConfirm} onClose={() => setViewingRefDeleteConfirm(null)} panelClassName="!max-w-xs text-center">
              <p className="text-base font-semibold mb-1">删除这张灵感图？</p>
              <p className="text-xs text-ink/60 mb-4">该操作不可恢复。</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setViewingRefDeleteConfirm(null)} className="h-10 rounded-lg border border-ink/10 text-sm">取消</button>
                <button
                  type="button"
                  onClick={async () => {
                    const target = viewingRefDeleteConfirm;
                    if (!target || typeof viewingItem.id !== "number") {
                      setViewingRefDeleteConfirm(null);
                      return;
                    }
                    const now2 = new Date().toISOString();
                    const remaining = (viewingItem.referenceOutfitImages ?? []).filter((r) => r.id !== target.id);
                    await getWardrobeDb().items.update(viewingItem.id, {
                      referenceOutfitImages: remaining,
                      updatedAt: now2,
                    });
                    patchItemInLocalState(viewingItem.id, { referenceOutfitImages: remaining, updatedAt: now2 });
                    setViewingRefDeleteConfirm(null);
                    setViewingImageIndex((current) => Math.max(0, Math.min(current, remaining.length)));
                    onMessage("已删除灵感图", "success");
                  }}
                  className="h-10 rounded-lg bg-red-600 text-sm font-semibold text-white"
                >确认删除</button>
              </div>
            </MotionSheet>
            {/* v0.9.47-dev 详情页 3.0: 灵感图查看 */}
            {viewingRefImage && (
              <MotionImageLightbox
                open={!!viewingRefImage}
                src={viewingRefImage.imageDataUrl}
                alt={viewingRefImage.caption || "灵感图"}
                onClose={() => setViewingRefImage(null)}
              />
            )}
            {/* v0.9.47-dev 详情页 3.0: 编辑灵感图说明 */}
            {editingRefCaption && (
              <MotionSheet open={!!editingRefCaption} onClose={() => setEditingRefCaption(null)} panelClassName="!max-w-sm">
                <div className="p-4">
                  <h3 className="text-base font-semibold mb-3">编辑说明</h3>
                  <textarea
                    className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm resize-none"
                    rows={3}
                    value={refCaptionDraft}
                    onChange={(e) => setRefCaptionDraft(e.target.value)}
                    placeholder="添加一段说明..."
                    maxLength={100}
                  />
                  <p className="text-[10px] text-ink/30 mt-1">{refCaptionDraft.length}/100</p>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button type="button" onClick={() => setEditingRefCaption(null)} className="h-10 rounded-xl border border-ink/10 text-sm">取消</button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (typeof viewingItem.id !== "number" || !editingRefCaption) return;
                        const caption = refCaptionDraft.trim() || undefined;
                        const now = new Date().toISOString();
                        const updatedRefs = (viewingItem.referenceOutfitImages ?? []).map((r) =>
                          r.id === editingRefCaption.id ? { ...r, caption, updatedAt: now } : r
                        );
                        await getWardrobeDb().items.update(viewingItem.id, {
                          referenceOutfitImages: updatedRefs,
                          updatedAt: now,
                        });
                        patchItemInLocalState(viewingItem.id, { referenceOutfitImages: updatedRefs, updatedAt: now });
                        setEditingRefCaption(null);
                        onMessage(caption ? "已更新说明" : "已清除说明", "success");
                      }}
                      className="h-10 rounded-xl bg-denim text-sm font-semibold text-white"
                    >保存</button>
                  </div>
                </div>
              </MotionSheet>
            )}
          </>
        ) : null}

        {editingItem && editDraft ? (
          <WardrobeEditPage
            draft={editDraft}
            locations={locations}
            isSaving={isEditSaving}
            isRecognizing={isEditRecognizing}
            hasChanges={hasEditChanges}
            onBack={requestExitEdit}
            onSave={saveEditedItem}
            onRecognize={recognizeEditDraftAgain}
            onCrop={(editDraft.sourceImageDataUrl || editDraft.imageDataUrl) ? () => {
              const sourceKind: "original" | "current" = editDraft.sourceImageDataUrl ? "original" : "current";
              const src = editDraft.sourceImageDataUrl || editDraft.imageDataUrl;
              if (src) {
                recordDiagnosticEvent("edit_recrop_started", {
                  itemId: viewingItem?.id,
                  sourceKind,
                  hasOriginal: Boolean(editDraft.sourceImageDataUrl),
                  hasCurrent: Boolean(editDraft.imageDataUrl),
                  hasCropBox: Boolean(editDraft.cropBox),
                });
                setViewingItemCropJob({ dataUrl: src, startBox: editDraft.cropBox, target: "edit", sourceKind });
              }
            } : undefined}
            onPatch={(patch) => setEditDraft((current) => current ? { ...current, ...patch } : current)}
            onSetMainColor={setEditMainColor}
            onSetAccentColors={setEditAccentColors}
            onSetPrimaryColors={setEditPrimaryColors}
            primaryColorRef={editPrimaryColorRef}
            secondaryColorRef={editSecondaryColorRef}
            onLimit={(message) => onMessage(message, "info")}
          />
        ) : null}

        <MotionSheet open={showEditExitDialog} onClose={() => setShowEditExitDialog(false)} panelClassName="!max-w-xs text-center">
          <p className="text-base font-semibold mb-1">是否退出编辑？</p>
          <p className="text-xs text-ink/50 mb-4">将会丢失未保存的内容</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setShowEditExitDialog(false)} className="h-10 rounded-lg border border-ink/10 text-sm">取消退出</button>
            <button type="button" onClick={closeEditWithoutPrompt} className="h-10 rounded-lg bg-red-600 text-sm font-semibold text-white">确认退出</button>
          </div>
        </MotionSheet>
        {/* v0.9.9: 衣物详情页长按 1 秒裁切 (放在 viewingItem AnimatedPage 内部) */}
        {viewingItemCropJob ? (
          <ImageCropEditor
            source={viewingItemCropJob.dataUrl}
            initialCropBox={viewingItemCropJob.startBox}
            aspectRatio="free"
            onCancel={() => setViewingItemCropJob(null)}
            onConfirm={async (newImageDataUrl, cropBox) => {
              if (!newImageDataUrl) {
                setViewingItemCropJob(null);
                return;
              }
              if (viewingItemCropJob.target === "edit") {
                // v0.9.43-dev 批次 2: 编辑页主图裁切后同步更新缩略图。
                // v1.1.16-dev commit1 §3.4.5 + §3.4.6: 根据 sourceKind 区分写入语义。
                const thumb = await generateThumbnailSafe(newImageDataUrl);
                recordDiagnosticEvent("edit_recrop_confirmed", { sourceKind: viewingItemCropJob.sourceKind ?? "current", hasCropBox: Boolean(cropBox) });
                setEditDraft((current) => current ? ({
                  ...current,
                  imageDataUrl: newImageDataUrl,
                  sourceImageDataUrl: current.sourceImageDataUrl || viewingItemCropJob.dataUrl,
                  cropBox,
                  ...(thumb.thumbnailDataUrl ? { thumbnailDataUrl: thumb.thumbnailDataUrl } : {}),
                  ...(thumb.thumbnailVersion !== undefined ? { thumbnailVersion: thumb.thumbnailVersion } : {}),
                  ...(thumb.thumbnailUpdatedAt ? { thumbnailUpdatedAt: thumb.thumbnailUpdatedAt } : {}),
                  ...(thumb.thumbnailStatus ? { thumbnailStatus: thumb.thumbnailStatus } : {}),
                }) : current);
                setViewingItemCropJob(null);
                onMessage("裁切已更新，请保存衣物", "success");
                return;
              }
   // v0.9.32-dev: 参考穿搭图裁切 (target="detail" + refId)
   if (viewingItemCropJob.refId && typeof viewingItem.id === "number") {
   const refId = viewingItemCropJob.refId;
   const now = new Date().toISOString();
   // v0.9.43-dev 批次 2: 参考图裁切后同步更新缩略图。
   // 失败时保留旧 thumbnail 字段 (只标 status="failed"), 详情页 fallback 到 imageDataUrl (批次 2 §5 纪律)。
   const thumb = await generateThumbnailSafe(newImageDataUrl);
   const updatedRefs = (viewingItem.referenceOutfitImages ?? []).map((r) => r.id === refId
   ? {
   ...r,
   imageDataUrl: newImageDataUrl,
   cropBox,
   updatedAt: now,
   ...(thumb.thumbnailDataUrl ? { thumbnailDataUrl: thumb.thumbnailDataUrl } : {}),
   ...(thumb.thumbnailVersion !== undefined ? { thumbnailVersion: thumb.thumbnailVersion } : {}),
   ...(thumb.thumbnailUpdatedAt ? { thumbnailUpdatedAt: thumb.thumbnailUpdatedAt } : {}),
   ...(thumb.thumbnailStatus ? { thumbnailStatus: thumb.thumbnailStatus } : (r.thumbnailDataUrl ? {} : {})),
   }
   : r);
   await getWardrobeDb().items.update(viewingItem.id, {
   referenceOutfitImages: updatedRefs,
   updatedAt: now,
   });
   patchItemInLocalState(viewingItem.id, { referenceOutfitImages: updatedRefs, updatedAt: now });
   setViewingItemCropJob(null);
   onMessage("灵感图裁切完成", "success");
   return;
   }
  // v0.9.33-dev: SavedOutfit 派生图裁切 (CRITICAL FIX — 修 v0.9.32-dev subagent finding #1)
  // 场景: 详情页横滑到 saved_outfit 派生图(idx>=1, source=saved_outfit)→ 长按"重新裁切" → 之前
  //   onConfirm fallback 会把结果写到 viewingItem.imageDataUrl,覆写当前衣物主图,且不可恢复。
  // 修法: 按 source 分流到对应 outfit 的 previewImageDataUrl,不污染当前衣物。
  if (
    viewingItemCropJob.outfitId
    && viewingItemCropJob.source === "saved_outfit"
  ) {
    const targetOutfitId = viewingItemCropJob.outfitId;
    const patch = { previewImageDataUrl: newImageDataUrl, updatedAt: new Date().toISOString() };
    try {
      await getWardrobeDb().outfits.update(targetOutfitId, patch);
      setOutfits((prev) => prev.map((o) => o.id === targetOutfitId ? { ...o, ...patch } : o));
      setViewingItemCropJob(null);
      onMessage("套装预览图已更新", "success");
    } catch (error) {
      setViewingItemCropJob(null);
      onMessage(getErrorMessage(error), "error");
    }
    return;
  }
 if (typeof viewingItem.id !== "number") {
 setViewingItemCropJob(null);
 return;
 }
 const now = new Date().toISOString();
 const patch: Partial<WardrobeItem> = {
 imageDataUrl: newImageDataUrl,
 sourceImageDataUrl: viewingItem.sourceImageDataUrl || viewingItemCropJob.dataUrl,
 cropBox,
 updatedAt: now,
 };
 await getWardrobeDb().items.update(viewingItem.id, {
 ...patch,
 });
 const updatedItem = { ...viewingItem, ...patch, id: viewingItem.id };
 await syncEditedItemReferences(updatedItem, now);
 patchItemInLocalState(viewingItem.id, patch);
 setViewingItemCropJob(null);
 onMessage("裁切完成", "success");
            }}
            onError={(msg) => onMessage(msg, "error")}
          />
        ) : null}
      </AnimatedPage>
    );
  }

  if (isSearchOpen) {
    // 全局搜索：基于 allItems（不受 wardrobeScope / homeCategoryFilter / 首页分类筛选影响）
    const searchResults = allItems.filter((it) => {
      const allColors = getAllColors(it.colors);
      const mq = !query || it.name.toLowerCase().includes(query.toLowerCase()) || allColors.some((c) => c.includes(query));
      const ml = searchLocationFilter === "all" || it.locationId === searchLocationFilter;
      const mc = searchCategoryFilter === "all" || it.category === searchCategoryFilter;
      return mq && ml && mc;
    });
    return (
      <AnimatedPage className="grid gap-4">
        {/* 顶部：搜索输入 + 取消按钮 */}
        <div className="flex items-center gap-2">
          <label className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/42" size={16} aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) applySearch(query.trim()); }}
              placeholder="搜索衣服名称、颜色"
              aria-label="搜索衣物"
              className="h-12 w-full rounded-lg border border-ink/10 bg-white pl-9 pr-3 text-sm outline-none focus:border-denim"
            />
          </label>
          <button
            type="button"
            onClick={closeSearch}
            aria-label="取消搜索"
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg px-3 text-sm font-semibold text-denim active:bg-denim/8"
          >取消</button>
        </div>

        {/* 提示：搜索范围始终是全部衣橱 */}
        <div className="text-[11px] text-ink/55 px-1">
          搜索全部 <span className="font-semibold text-ink/80">{allItems.length}</span> 件衣物
          <span className="mx-1.5 text-ink/30">·</span>
          范围：全部衣橱
        </div>

        {/* 搜索页本地筛选（不与首页 chip 行联动） */}
        <div className="surface rounded-lg p-3">
          <div className="flex gap-2">
            <select
              value={searchLocationFilter}
              onChange={(e) => setSearchLocationFilter(e.target.value)}
              aria-label="按衣橱筛选"
              className="h-10 flex-1 min-w-0 rounded-lg border border-ink/10 bg-white px-3 text-xs"
            ><option value="all">全部衣橱</option>{locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}</select>
            <select
              value={searchCategoryFilter}
              onChange={(e) => setSearchCategoryFilter(e.target.value as GarmentCategory | "all")}
              aria-label="按分类筛选"
              className="h-10 flex-1 min-w-0 rounded-lg border border-ink/10 bg-white px-3 text-xs"
            ><option value="all">全部类别</option>{categoryOptions.map((c) => (<option key={c} value={c}>{CATEGORY_LABELS[c]}</option>))}</select>
            <button
              type="button"
              onClick={() => { if (query.trim()) applySearch(query.trim()); }}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-denim px-4 text-sm font-semibold text-white"
            ><Search size={15} aria-hidden="true" />搜索</button>
          </div>
          {searchHistory.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs text-ink/40 mb-2">最近搜索</p>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                {searchHistory.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => { setQuery(h); applySearch(h); }}
                    className="shrink-0 inline-flex h-8 items-center gap-1 rounded-full border border-ink/10 bg-white px-3 text-xs text-ink/60 hover:border-denim"
                  >{h}</button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* 搜索结果：基于 searchResults 渲染，subtitle 始终带衣橱来源 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {searchResults.map((item) => (
            <article key={item.id ?? item.name} className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-sm">
              <div className="aspect-[4/5] bg-mist">
                <GarmentImage src={item.imageDataUrl || undefined} alt={item.name} fallbackSize={32} />
              </div>
              <div className="grid gap-2 p-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{item.name}</h3>
                  <p className="truncate text-xs text-ink/54">
                    {CATEGORY_LABELS[item.category]} · {locationNameById[item.locationId] ?? item.locationId}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {getAllColors(item.colors).slice(0, 3).map((color) => (
                    <span key={color} className="rounded-md bg-mist px-2 py-1 text-[11px] text-ink/66">{color}</span>
                  ))}
                  <span className="rounded-md bg-denim/10 px-2 py-1 text-[11px] text-denim">{STATUS_LABELS[item.status]}</span>
                </div>
                <div>
                  <select
                    title="状态"
                    value={item.status}
                    onChange={(e) => onStatusChange(item, e.target.value as GarmentStatus)}
                    className="h-9 w-full min-w-0 rounded-lg border border-ink/10 bg-white px-2 text-xs"
                  >
                    {statusOptions.map((s) => (<option key={s} value={s}>{STATUS_LABELS[s]}</option>))}
                  </select>
                </div>
              </div>
            </article>
          ))}
        </div>
        {searchResults.length === 0 ? (
          <div className="surface rounded-lg p-6 text-center">
            <p className="text-sm text-ink/50">{query ? "没有匹配的衣物" : "输入衣物名称或颜色开始搜索"}</p>
          </div>
        ) : null}
      </AnimatedPage>
    );
  }

  if (showWearStatistics) {
    return (
      <WearStatisticsView
        items={allItems}
        outfits={outfits}
        wishlistItems={wishlistItems}
        onBack={() => setShowWearStatistics(false)}
      />
    );
  }

  return (
    <div className="grid gap-4">
      {/* ---- 首页顶部操作行：衣橱切换(flex:1) + 搜索/统计/AI诊断(方形) ---- */}
      <div className="flex items-stretch gap-2.5">
        {/* 衣橱切换按钮：占据剩余空间 */}
        <div className="relative flex-1 min-w-0">
          <button
            ref={scopeTriggerRef}
            type="button"
            onClick={() => setScopePopoverOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={scopePopoverOpen}
            aria-label="切换衣橱浏览范围"
            title="切换衣橱浏览范围"
            className="surface w-full h-14 rounded-lg px-3 text-left transition-colors"
          >
            <div className="flex h-full items-center gap-2">
              <Shirt className="shrink-0 text-ink/55" size={18} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate text-sm font-semibold text-ink">{scopeLabel}</span>
                  <ChevronDown
                    size={14}
                    className={`shrink-0 text-ink/45 transition-transform ${scopePopoverOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </div>
                <p className="truncate text-[11px] text-ink/50 mt-0.5">{scopeItems.length}件</p>
              </div>
            </div>
          </button>

          {/* 衣橱切换浮层：只负责切换浏览范围，不放"新建衣橱/管理衣橱"入口 */}
          <AnimatePresence>
            {scopePopoverOpen ? (
              <motion.div
                ref={scopePopoverRef}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: ease.app }}
                role="listbox"
                aria-label="选择衣橱浏览范围"
                className="absolute top-full left-0 right-0 mt-2 z-50 overflow-hidden rounded-lg border border-ink/10 bg-white shadow-lg"
              >
                <div className="max-h-[60vh] overflow-y-auto">
                  {scopeOptions.map((opt) => {
                    const selected = opt.id === wardrobeScope;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => { setWardrobeScope(opt.id); setScopePopoverOpen(false); }}
                        className={`min-h-[44px] w-full flex items-center gap-3 border-b border-ink/5 px-3 py-2 text-left last:border-b-0 transition-colors ${
                          selected ? "bg-denim/8" : "hover:bg-mist/60 active:bg-mist"
                        }`}
                      >
                        <Archive
                          size={15}
                          aria-hidden="true"
                          className={`shrink-0 ${selected ? "text-denim" : "text-ink/40"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-semibold ${selected ? "text-denim" : "text-ink"}`}>
                            {opt.name}
                          </p>
                          {opt.note ? (
                            <p className="truncate text-[11px] text-ink/50 mt-0.5">{opt.note}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-[11px] text-ink/55">{opt.count}件</span>
                          {selected ? <Check size={15} className="text-denim" aria-hidden="true" /> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* 搜索按钮：固定方形（不受 wardrobeScope 影响，点击进入全局搜索） */}
        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          aria-label="搜索衣物"
          title="搜索衣物"
          className="surface grid h-14 w-14 shrink-0 place-items-center rounded-lg text-ink/65 active:bg-mist transition-colors"
        >
          <Search size={20} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => setShowWearStatistics(true)}
          aria-label="查看穿着统计"
          title="穿着统计"
          className="surface grid h-14 w-14 shrink-0 place-items-center rounded-lg text-ink/65 active:bg-mist transition-colors"
        >
          <BarChart3 size={20} aria-hidden="true" />
        </button>

        {/* AI衣橱诊断入口：固定方形；moss=卡片已展开, clay=其他（隐藏/loading/error）
            错误态刻意保持 clay 棕橙（不变成错误色），保持视觉一致性 */}
        <button
          type="button"
          onClick={handleTopDiagnosisClick}
          disabled={diagnosisState === "loading" || diagnosisState === "collapsed" || diagnosisState === "expanded"}
          title={
            diagnosisState === "loading"
              ? "AI 衣橱诊断生成中"
              : diagnosisState === "hidden"
                ? (diagnosis ? "打开 AI 衣橱诊断" : "开始 AI 衣橱诊断")
                : diagnosisState === "error_no_cache"
                  ? "重新生成 AI 衣橱诊断"
                  : diagnosisState === "error_with_cache"
                    ? "查看上次诊断结果"
                    : "AI 衣橱诊断已打开"
          }
          aria-label={
            diagnosisState === "loading"
              ? "AI 衣橱诊断生成中"
              : diagnosisState === "hidden"
                ? (diagnosis ? "打开 AI 衣橱诊断" : "开始 AI 衣橱诊断")
                : diagnosisState === "error_no_cache"
                  ? "重新生成 AI 衣橱诊断"
                  : diagnosisState === "error_with_cache"
                    ? "查看上次诊断结果"
                    : "AI 衣橱诊断已打开"
          }
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-lg text-white shadow-sm disabled:opacity-60 transition-colors ${
            diagnosisState === "collapsed" || diagnosisState === "expanded"
              ? "bg-moss"
              : "bg-clay"
          }`}
        >
          <WandSparkles
            size={20}
            aria-hidden="true"
            className={isDiagnosing ? "animate-pulse" : undefined}
          />
        </button>
      </div>

      {/* 统计行：基于当前 wardrobeScope 动态计算；分类名称不写死 */}
      <div className="px-1 text-[11px] text-ink/55">
        <span>全部 <span className="font-semibold text-ink/80">{scopeItems.length}</span></span>
        <span className="mx-1.5 text-ink/30">·</span>
        <span>可穿 <span className="font-semibold text-ink/80">{scopeActiveCount}</span></span>
        {isAllScope ? (
          <>
            <span className="mx-1.5 text-ink/30">·</span>
            <span>衣橱 <span className="font-semibold text-ink/80">{locationCount}</span></span>
          </>
        ) : null}
      </div>

      {/* 分类筛选 chip 行：动态来源于当前 scope（当前衣橱或"全部衣橱"）下实际存在的分类 + CATEGORY_LABELS 字典中文名。
          - "全部 N"：N = scopeItems.length（当前衣橱下衣物总数，含 active + 非 active）
          - 其他 chip：{分类中文名} {该分类在当前衣橱下的数量}，count > 0 才展示
          - 排序：count 降序；count 相同时按 CATEGORY_LABELS key 的系统顺序稳定排序
      */}
      <div className="relative -mx-4 px-4">
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
          <button
            type="button"
            onClick={() => setHomeCategoryFilter("all")}
            className={`shrink-0 inline-flex h-8 items-center rounded-full px-3 text-xs font-medium transition-colors ${
              homeCategoryFilter === "all"
                ? "bg-denim text-white shadow-sm"
                : "bg-mist text-ink/65 active:bg-ink/10"
            }`}
          >全部 {scopeItems.length}</button>
          {/* 隐藏分类选中时, 在可见 chip 行最前显示一个"可移除"指示 chip
              (subagent important 1: 关掉"更多"浮层后用户能从 chip 行看出当前筛了啥) */}
          {hiddenSelectedCat ? (
            <button
              type="button"
              onClick={() => setHomeCategoryFilter("all")}
              aria-label={`已筛选 ${hiddenSelectedCat.label} ${hiddenSelectedCat.count}，点此清除`}
              className="shrink-0 inline-flex h-8 items-center gap-1 rounded-full bg-denim/10 pl-3 pr-2 text-xs font-medium text-denim"
            >
              <Check size={12} aria-hidden="true" />
              {hiddenSelectedCat.label} {hiddenSelectedCat.count}
              <span className="grid h-5 w-5 place-items-center rounded-full bg-denim/20 text-denim" aria-hidden="true">×</span>
            </button>
          ) : null}
          {visibleCats.map((c) => {
            const active = homeCategoryFilter === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setHomeCategoryFilter(c.id)}
                className={`shrink-0 inline-flex h-8 items-center rounded-full px-3 text-xs font-medium transition-colors ${
                  active
                    ? "bg-denim text-white shadow-sm"
                    : "border border-ink/10 bg-white text-ink/65 active:bg-mist"
                }`}
              >{c.label} {c.count}</button>
            );
          })}
          {hiddenCats.length > 0 || moreCatsOpen ? (
            <div className="relative shrink-0" ref={moreCatsRef}>
              <button
                ref={moreCatsTriggerRef}
                type="button"
                onClick={() => setMoreCatsOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={moreCatsOpen}
                aria-label={hiddenSelectedCat ? `更多分类（当前选中：${hiddenSelectedCat.label} ${hiddenSelectedCat.count}）` : "更多分类"}
                title={hiddenSelectedCat ? `当前选中：${hiddenSelectedCat.label} ${hiddenSelectedCat.count}` : undefined}
                className={`inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors ${
                  moreCatsOpen || hiddenSelectedCat
                    ? "bg-denim/10 text-denim"
                    : "border border-ink/10 bg-white text-ink/65 active:bg-mist"
                }`}
              >{hiddenSelectedCat ? `更多 · ${hiddenSelectedCat.label} ${hiddenSelectedCat.count}` : "更多"} <ChevronRight size={12} aria-hidden="true" /></button>
              {/* Popover 通过 portal 渲染到 body, 规避父级 overflow-x-auto 隐式 overflow-y:auto 带来的裁剪 */}
              {moreCatsOpen && moreCatsPos && typeof document !== "undefined" ? createPortal(
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15, ease: ease.app }}
                  role="menu"
                  style={{ position: "fixed", top: moreCatsPos.top, right: moreCatsPos.right, minWidth: moreCatsPos.triggerWidth }}
                  className="z-[100] grid grid-cols-3 gap-1.5 rounded-lg border border-ink/10 bg-white p-2 shadow-lg"
                >
                  {hiddenCats.map((c) => {
                    const active = homeCategoryFilter === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setHomeCategoryFilter(c.id); setMoreCatsOpen(false); }}
                        className={`inline-flex h-11 items-center justify-center rounded-full px-2 text-[11px] font-medium transition-colors ${
                          active ? "bg-denim text-white" : "bg-mist text-ink/70 active:bg-ink/10"
                        }`}
                      >{c.label} {c.count}</button>
                    );
                  })}
                </motion.div>,
                document.body,
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* AI 衣橱诊断卡片（v0.9.19: 6 态自管；删除首页顶部独立进度条，避免与卡片 loading 重复） */}

      {diagnosisVisible ? (
        <section className="surface rounded-lg p-3" aria-busy={isDiagnosing || undefined}>
          {/* 标题行：标题 + 重新生成/生成中 + 关闭按钮（卡片级操作）
              loading 时按钮文案 "生成中" + spin 图标 + 禁用；error 时按钮变 "重新生成" 可点 */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles size={15} className="shrink-0 text-clay" aria-hidden="true" />
              <h2 className="truncate text-sm font-semibold">AI衣橱诊断</h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={runDiagnosis}
                disabled={isDiagnosing}
                title={isDiagnosing ? "正在重新生成 AI 衣橱诊断" : "重新生成 AI 衣橱诊断"}
                aria-label="重新生成 AI 衣橱诊断"
                className="inline-flex h-10 items-center gap-1 rounded-lg border border-ink/10 bg-white px-3 text-xs font-semibold text-ink/65 active:bg-mist disabled:opacity-60 transition-colors"
              >
                <RefreshCw
                  size={14}
                  aria-hidden="true"
                  className={isDiagnosing ? "animate-spin" : undefined}
                />
                {isDiagnosing ? "生成中" : "重新生成"}
              </button>
              <button
                type="button"
                onClick={closeDiagnosis}
                title="关闭 AI 衣橱诊断"
                aria-label="关闭 AI 衣橱诊断"
                className="grid h-10 w-10 place-items-center rounded-lg text-ink/55 active:bg-mist transition-colors"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* loading 态卡片正文：用户可理解文案 + 旋转图标；不展示 99% 这种确定百分比。
              首次 loading 时无 diagnosis 显示"正在分析衣橱数据"；
              重新生成有旧结果时显示"正在整理新的诊断结果（保留上一次结果）" */}
          {diagnosisState === "loading" ? (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-denim/5 px-3 py-2.5">
              <Loader2
                size={14}
                className="mt-0.5 shrink-0 animate-spin text-denim"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-ink/75">
                  {diagnosis ? "正在整理新的诊断结果" : "正在分析衣橱数据"}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink/55">
                  {diagnosis
                    ? "保留上一次的诊断结果，新结果生成后会替换。"
                    : "AI 正在总结你的衣橱，过程大约需要十几秒。"}
                </p>
              </div>
            </div>
          ) : null}

          {/* error 态卡片正文：用户可理解文案 + 重新生成按钮 + 关闭按钮（关闭按钮在标题行）
              - error_with_cache: 保留旧结果
              - error_no_cache: 不显示旧结果（diagnosis 为 null） */}
          {diagnosisError ? (
            <div className="mt-3 rounded-md border border-clay/20 bg-clay/5 px-3 py-2.5">
              <p className="text-xs font-semibold text-clay">
                {diagnosisState === "error_with_cache"
                  ? "刷新失败，已保留上次诊断结果"
                  : "诊断生成失败"}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink/60">
                {diagnosisState === "error_with_cache"
                  ? "网络或服务暂时不可达，你仍可继续浏览下方衣物列表和分类。"
                  : "AI 没能正确整理这次结果，请稍后重试。"}
              </p>
              <button
                type="button"
                onClick={runDiagnosis}
                className="mt-2.5 inline-flex h-9 items-center gap-1 rounded-lg border border-ink/10 bg-white px-3 text-xs font-semibold text-ink/75 active:bg-mist transition-colors"
                aria-label="重新生成 AI 衣橱诊断"
              >
                <RefreshCw size={13} aria-hidden="true" />
                重新生成
              </button>
            </div>
          ) : null}

          {/* 摘要 + 统计标签：error_with_cache 仍展示旧内容；loading 不展示（避免和上方 loading 文字冲突）；error_no_cache 无 diagnosis 不展示 */}
          {diagnosis && diagnosisState !== "loading" && diagnosisState !== "error_no_cache" ? (
            <>
              <p className="mt-1.5 text-xs leading-relaxed text-ink/58">{diagnosis.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-ink/60">
                <span className="rounded-md bg-mist px-2 py-1">重复 {diagnosis.duplicates.length}</span>
                <span className="rounded-md bg-mist px-2 py-1">缺口 {diagnosis.gaps.length}</span>
                <span className="rounded-md bg-mist px-2 py-1">闲置 {diagnosis.idleItems.length}</span>
                <span className="rounded-md bg-mist px-2 py-1">套装 {diagnosis.reusableOutfits.length}</span>
              </div>
            </>
          ) : null}

          {/* collapsed 状态：摘要/统计下方居中"查看详情" */}
          {diagnosis && diagnosisState === "collapsed" && hasDiagnosisDetails ? (
            <button
              type="button"
              onClick={() => setDiagnosisState("expanded")}
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-ink/10 bg-white text-xs font-semibold text-ink/65 active:bg-mist transition-colors"
              aria-label="查看 AI 衣橱诊断详情"
            >
              查看详情
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          ) : null}

          {/* expanded 状态：详情区 + 底部"收起" */}
          {diagnosis && diagnosisState === "expanded" ? (
            <MotionAccordion expanded={true}>
              <div className="mt-4 grid gap-3 border-t border-ink/10 pt-3">
                {hasDiagnosisDetails ? (
                  <>
                    <DiagnosisIssueGroup title="重复较多" issues={diagnosis.duplicates} />
                    <DiagnosisIssueGroup title="缺少单品" issues={diagnosis.gaps} />
                    <DiagnosisIssueGroup title="很久没穿" issues={diagnosis.idleItems} />
                    <DiagnosisIssueGroup title="可复用套装" issues={diagnosis.reusableOutfits} />
                    {diagnosis.purchaseSuggestions.length > 0 ? (
                      <div className="rounded-lg bg-white p-3">
                        <p className="text-xs font-semibold text-ink/70">购买方向</p>
                        <div className="mt-2 grid gap-1 text-xs text-ink/58">
                          {diagnosis.purchaseSuggestions.slice(0, 5).map((suggestion) => <p key={suggestion}>· {suggestion}</p>)}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-ink/55">本次诊断没有可展示的细节。</p>
                )}
              </div>
              {/* 底部"收起"：和最后一个诊断卡片之间保留合理间距 */}
              <button
                type="button"
                onClick={() => setDiagnosisState("collapsed")}
                className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-ink/10 bg-white text-xs font-semibold text-ink/65 active:bg-mist transition-colors"
                aria-label="收起 AI 衣橱诊断详情"
              >
                收起
                <ChevronUp size={14} aria-hidden="true" />
              </button>
            </MotionAccordion>
          ) : null}
        </section>
      ) : null}

      {allItems.length === 0 ? (
        <div className="surface rounded-lg p-6"><div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><h2 className="text-xl font-semibold">还没有衣服</h2><p className="mt-1 text-sm text-ink/60">先录入几件常穿单品，推荐会立即可用。</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={onStartGarmentIntake} className="inline-flex h-11 items-center gap-2 rounded-lg bg-denim px-4 text-sm font-semibold text-white"><Camera size={17} />录入第一件</button><button type="button" onClick={onSeed} className="inline-flex h-11 items-center gap-2 rounded-lg border border-ink/10 bg-white px-4 text-sm font-semibold"><GalleryVerticalEnd size={17} />示例衣橱</button></div></div></div>
      ) : null}

 <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
{items.map((item) => {
// v0.9.32-dev:卡片图片列表(主图 + 手动参考 + SavedOutfit 派生,统一去重)。
// 派生逻辑抽到 deriveGarmentImageList,与详情页共享。
const cardEntries = deriveGarmentImageList(item, outfits);
const hasMultiple = cardEntries.length >1;
const itemKey = String(item.id ?? item.name ?? "");
const currentIdx = waterfallImageIndex[itemKey] ??0;
const isItemSelected = !!(multiSelectMode && item.id && selectedItemIds.has(item.id));
const categoryColorLine = formatGarmentCategoryColorLine(item);
return (
<MotionCard
  key={item.id ?? item.name}
  selected={isItemSelected}
  disableTap={multiSelectMode}
  className="relative flex h-[304px] flex-col overflow-hidden rounded-2xl border border-ink/8 bg-white text-left shadow-soft"
  onClick={() => { if (multiSelectMode) { toggleMultiSelect(item); } else { openWardrobeItemDetail(item, { name: "wardrobe_home" }); } }}
  onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); toggleMultiSelect(item); }}
  >
  <div className="relative h-[210px] overflow-hidden bg-mist">
  <WaterfallCardImage
  item={item}
  cardEntries={cardEntries}
  currentIdx={currentIdx}
  hasMultiple={hasMultiple}
  isSelected={isItemSelected}
  allItems={allItems}
  outfits={outfits}
  onSwipe={(next) => {
  if (!hasMultiple) return;
  setWaterfallImageIndex((prev) => ({ ...prev, [itemKey]: next }));
  }}
  onClick={() => { if (multiSelectMode) { toggleMultiSelect(item); } else { openWardrobeItemDetail(item, { name: "wardrobe_home" }); } }}
  />
  </div>
  <div className="flex h-[94px] shrink-0 flex-col gap-1 overflow-hidden p-3">
  <p className="truncate text-sm font-semibold text-ink">{item.name?.trim() || "未命名单品"}</p>
  <p className="inline-flex min-w-0 items-center gap-1 overflow-hidden truncate text-xs text-ink/54">
  <span className="shrink-0">{categoryColorLine.categoryLabel}</span>
  {categoryColorLine.colors.length > 0 ? <span className="shrink-0 text-ink/32">·</span> : null}
  <GarmentColorInline colors={categoryColorLine.colors} />
  </p>
  <p className="truncate text-xs text-ink/38">{formatGarmentWearLine(item)}</p>
  </div>
              </MotionCard>
              );
              })}
              </div>

      {multiSelectMode && selectedItemIds.size > 0 ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-[#fbfbf8]/98 px-4 py-3 backdrop-blur-xl">
          <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
            <button type="button" onClick={cancelMultiSelect} className="inline-flex h-12 items-center justify-center rounded-lg border border-ink/10 bg-white text-sm font-semibold text-ink/70">取消</button>
            <button type="button" onClick={() => confirmDeleteItem(allItems.filter((i) => i.id && selectedItemIds.has(i.id)))} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-red-600 text-sm font-semibold text-white"><Trash2 size={16} />批量删除 {selectedItemIds.size} 件</button>
          </div>
        </div>
      ) : null}

      <MotionSheet open={!!deleteConfirm} onClose={() => { if (!deleteSubmitting) setDeleteConfirm(null); }} panelClassName="!max-w-xs">
        <p className="text-sm font-semibold mb-2">确认删除</p>
        <p className="text-xs text-ink/60 mb-4">{deleteConfirm ? (Array.isArray(deleteConfirm) ? `将删除 ${deleteConfirm.length} 件衣物，不可恢复。` : `将删除「${deleteConfirm.name}」，不可恢复。`) : ""}</p>
        {deleteError ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            删除失败：{deleteError}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setDeleteConfirm(null)} disabled={deleteSubmitting} className="h-10 rounded-lg border border-ink/10 text-sm disabled:opacity-45">取消</button><button type="button" onClick={executeDelete} disabled={deleteSubmitting} className="h-10 rounded-lg bg-red-600 text-sm font-semibold text-white disabled:opacity-60">{deleteSubmitting ? "删除中..." : "确认删除"}</button></div>
      </MotionSheet>
    </div>
  );
}

function DiagnosisIssueGroup({ title, issues }: { title: string; issues: WardrobeDiagnosis["duplicates"] }) {
  if (issues.length === 0) return null;
  return (
    <div className="rounded-lg bg-white p-3">
      <p className="text-xs font-semibold text-ink/70">{title}</p>
      <div className="mt-2 grid gap-2">
        {issues.slice(0, 4).map((issue) => (
          <div key={issue.id} className="rounded-lg border border-ink/8 bg-mist/60 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-xs font-semibold">{issue.title}</p>
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${issue.severity === "high" ? "bg-red-50 text-red-500" : issue.severity === "medium" ? "bg-clay/10 text-clay" : "bg-denim/10 text-denim"}`}>
                {issue.severity === "high" ? "高" : issue.severity === "medium" ? "中" : "低"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink/56">{issue.summary}</p>
            {issue.action ? <p className="mt-1 text-[11px] text-moss">{issue.action}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}


function DetailChip({
  children,
  tone = "mist",
  onClick,
}: {
  children: React.ReactNode;
  tone?: "mist" | "denim";
  onClick?: () => void;
}) {
  const content = (
    <span className="block max-w-[7.25rem] truncate">{children}</span>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex min-h-8 max-w-full items-center rounded-lg bg-mist px-3 text-xs font-semibold text-ink/70 active:bg-ink/10"
      >
        {content}
      </button>
    );
  }
  return (
    <span className={`inline-flex min-h-8 max-w-full items-center rounded-lg px-3 text-xs font-semibold ${tone === "denim" ? "bg-denim text-white" : "bg-mist text-ink/70"}`}>
      {content}
    </span>
  );
}

function ReadOnlyMeter({ label, value }: { label: string; value: number }) {
  const clamped = clampNumber(value, 1, 5);
  const percent = ((clamped - 1) / 4) * 100;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-ink/65">{label}</span>
        <span className="shrink-0 text-ink/50">{clamped}/5</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-mist" aria-hidden="true">
        <div className="h-full rounded-full bg-denim" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function DetailInfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-mist/70 px-2.5 py-2">
      <p className="truncate text-[11px] text-ink/45">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-ink/78">{value}</p>
    </div>
  );
}

function WardrobeEditPage({
  draft,
  locations,
  isSaving,
  isRecognizing,
  hasChanges,
  onBack,
  onSave,
  onRecognize,
  onCrop,
  onPatch,
  onSetMainColor,
  onSetAccentColors,
  onSetPrimaryColors,
  primaryColorRef,
  secondaryColorRef,
  onLimit,
}: {
  draft: WardrobeDraft;
  locations: ClosetLocation[];
  isSaving: boolean;
  isRecognizing: boolean;
  hasChanges: boolean;
  onBack: () => void;
  onSave: () => void;
  onRecognize: () => void;
  onCrop?: () => void;
  onPatch: (patch: Partial<WardrobeDraft>) => void;
  onSetMainColor: (color: string) => void;
  onSetAccentColors: (colors: string[]) => void;
  onSetPrimaryColors?: (colors: string[]) => void;
  primaryColorRef: React.RefObject<HTMLDivElement | null>;
  secondaryColorRef: React.RefObject<HTMLDivElement | null>;
  onLimit: (message: string) => void;
}) {
  const canSave = Boolean(draft.name.trim()) && hasChanges && !isSaving && !isRecognizing;

  // v0.9.28-dev: 顶部+底部普通保存按钮共用同一 onSave 句柄 + isSaving/canSave 状态
  // (顶部按钮 = header 内, 底部按钮 = 备注 textarea 下方 in-flow; 都**不**用 fixed,
  //  避免与 Android WebView + 中文 IME 冲突, 也不被 AnimatedPage 的 transform
  //  containing block 干扰 — slideRight 变体 x:40 → translateX(40px) 会让内部 fixed
  //  元素相对 motion.div 定位而非 viewport, v0.9.21-dev/v0.9.26-dev 的"隐藏 fixed save
  //  bar"逻辑都没能解决这个根因)。
  // 顶部按钮始终可见 (header 一部分), 底部按钮在备注下方 (form 末尾),
  //  顶部按钮在窄屏小屏 (iPhone SE) 也可点; 底部按钮在大屏 / 滚到底部时更顺手。
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // v0.9.29-dev: 删除时滚动冻结 (录屏 52510.mp4 反馈: v0.9.28-dev 修了正常输入场景,
  //  但**删除** (Backspace/Delete) 时浏览器 scroll-anchoring + globals.css 的
  //  `scroll-behavior: smooth` 把页面锚到上方的 chip / slider 区域, 把备注 textarea
  //  推出可视区。修法: onKeyDown 识别删除键时记录当前 window.scrollY,
  //  onChange (delete 触发的 state 更新) 后 rAF 恢复 — 这是**删除专用**的安全网,
  //  正常输入时 lastScrollYBeforeDelete 为 null, rAF 短路, 不影响打字体验。
  const lastScrollYBeforeDelete = useRef<number | null>(null);

  // v0.9.29-dev: 关闭 html 节点的 scroll-anchoring。**关键**: scroll-anchor 必须在
  //  scrollable ancestor (本项目是 document.documentElement) 上设置, 设在子节点
  //  (如 edit page 自己的根 div) 无效。useEffect 在编辑页 mount 时关闭, unmount
  //  恢复, 不影响其他页面的默认 scroll-anchoring 行为。
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const prev = html.style.overflowAnchor;
    html.style.overflowAnchor = "none";
    return () => {
      html.style.overflowAnchor = prev;
    };
  }, []);

  const handleNotesKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // v0.9.29-dev subagent I-1: 中文拼音修正时按 Backspace 不应该触发滚动冻结
    // (composition 期间按 Backspace 是修拼音, 不是真删除; 设了 lastScrollY 会让
    // 后续 onChange rAF 把页面滚回, 反而干扰 IME 行为)
    // React 的 KeyboardEvent 类型未暴露 isComposing, 通过 nativeEvent 取
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Backspace" || e.key === "Delete") {
      lastScrollYBeforeDelete.current = window.scrollY;
    }
  };

  // v0.9.28-dev: 备注 textarea focus 时做一次轻量滚动 (150ms 后)
  // v0.9.29-dev: block: "center" → "nearest" (不主动滚到中部, 仅在不可见时
  //  最小幅度带回, 避免删除后再次 focus 触发额外滚动)
  const handleNotesFocus = () => {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      notesRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 150);
  };

  return (
    // v0.9.29-dev: 真正关闭 scroll-anchoring 的代码在 useEffect 里设
    // document.documentElement.style.overflowAnchor = "none" (见上方 hook 块)。
    // 之前这里尝试用 `overflow-anchor-[none]` Tailwind class + 内联 style, 但
    // 子节点 div 不是 scroll container (项目 root scrollable 是 html), 写在
    // 这里是死代码; 删掉以免未来维护者误以为 inline style 在生效 (subagent I-3)
    <div className="grid gap-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div className="flex items-center gap-3 px-1">
        <button
          type="button"
          onClick={onBack}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-mist text-ink hover:bg-ink/10 transition-colors"
          aria-label="退出编辑"
        >
          <ChevronLeft size={17} aria-hidden="true" />
        </button>
        <span className="text-sm font-semibold text-ink/70">编辑衣物</span>
        {/* v0.9.28-dev: 顶部保存按钮 (与底部 in-flow 按钮走同一 onSave + isSaving + canSave) */}
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-lg bg-denim px-4 text-sm font-semibold text-white shadow-sm disabled:bg-ink/18 disabled:text-ink/42"
        >
          {isSaving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <SaveAll size={15} aria-hidden="true" />}
          {isSaving ? "保存中" : hasChanges ? "保存" : "暂无修改"}
        </button>
      </div>

      <ItemSectionCard className="p-3">
        <div className="flex items-center gap-3">
          <div className="aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-xl bg-mist" aria-label="衣物图片预览">
            <GarmentImage src={draft.imageDataUrl || draft.sourceImageDataUrl || undefined} alt={draft.name || "衣物图片"} fallbackSize={34} imageClassName="bg-transparent" />
          </div>
          <div className="grid min-w-0 flex-1 gap-2">
            <button
              type="button"
              onClick={onCrop}
              disabled={!onCrop}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-ink/10 bg-white px-3 text-sm font-semibold text-ink/70 disabled:opacity-45"
            >
              <Crop size={15} aria-hidden="true" />
              重新裁切
            </button>
            <button
              type="button"
              onClick={onRecognize}
              disabled={isRecognizing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-denim px-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isRecognizing ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
              {isRecognizing ? "识别中" : "重新识别"}
            </button>
          </div>
        </div>
      </ItemSectionCard>

      <ItemSectionCard title="基础信息" bodyClassName="grid gap-3" className="item-edit-section">
          <ItemField label="名称" required>
            <input
              value={draft.name}
              onChange={(e) => onPatch({ name: e.target.value })}
              className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
              placeholder="例如 阔腿牛仔裤"
            />
          </ItemField>
          <CategorySubcategoryPicker
            category={draft.category}
            subcategory={draft.subcategory}
            onCategoryChange={(category) => onPatch({ category, subcategory: undefined })}
            onSubcategoryChange={(subcategory) => onPatch({ subcategory })}
            categoryLabel="分类"
            className="col-span-full"
          />
          <WardrobeExtras
            mode="edit"
            draft={{ locationId: draft.locationId, status: draft.status, purchaseDate: draft.purchaseDate }}
            locations={locations}
            onPatch={(patch) => onPatch(patch)}
          />
          <ItemField label="价格">
            <input
              value={draft.price != null ? String(draft.price) : ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === "") { onPatch({ price: undefined }); return; }
                const n = Number(v);
                if (Number.isNaN(n)) return;
                onPatch({ price: n });
              }}
              className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
              placeholder="例如 299"
              inputMode="decimal"
            />
          </ItemField>
          <ItemField label="商品链接">
            <input
              value={draft.productUrl ?? ""}
              onChange={(e) => onPatch({ productUrl: e.target.value || undefined })}
              className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
              placeholder="例如 https://item.taobao.com/..."
              inputMode="url"
            />
          </ItemField>
      </ItemSectionCard>

      <ItemSectionCard title="颜色" className="item-edit-section">
          <ItemColorFields
            mode="edit"
            colors={draft.colors}
            onChange={(colors) => onPatch({ colors })}
          />
      </ItemSectionCard>

      <ItemSectionCard title="穿着属性" bodyClassName="grid gap-4" className="item-edit-section">
          <SelectableChipGroup
            title="季节（最多 4 个）"
            options={seasonOptions}
            labels={SEASON_LABELS}
            values={draft.seasons}
            onChange={(values) => onPatch({ seasons: values as Season[] })}
            maxSelected={4}
            selectedFirst
            onLimit={onLimit}
          />
          <SelectableChipGroup
            title="风格（最多 5 个）"
            options={styleOptions}
            labels={STYLE_LABELS}
            values={draft.styles}
            onChange={(values) => onPatch({ styles: values as GarmentStyle[] })}
            maxSelected={5}
            selectedFirst
            onLimit={onLimit}
          />
          <TemperatureRangeSlider
            value={draft.temperatureRange}
            onChange={(tr) => onPatch({ temperatureRange: tr })}
          />
          <SelectableChipGroup
            title="版型倾向"
            options={["menswear", "womenswear", "unisex", "unknown"] as GarmentFitGender[]}
            labels={{ menswear: "男装", womenswear: "女装", unisex: "中性", unknown: "未判断" }}
            values={draft.fitGender ? [draft.fitGender] : []}
            onChange={(values) => onPatch({ fitGender: (values[0] ?? "unknown") as GarmentFitGender })}
            mode="single"
            maxSelected={1}
            selectedFirst
          />
          <RangeField label="正式度" value={draft.formality ?? 3} onChange={(formality) => onPatch({ formality })} />
          <RangeField label="保暖度" value={draft.warmth ?? 3} onChange={(warmth) => onPatch({ warmth })} />
          <ItemField label="材质">
            <input
              value={draft.material ?? ""}
              onChange={(e) => onPatch({ material: e.target.value || undefined })}
              className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
              placeholder="例如 纯棉、羊毛混纺"
            />
          </ItemField>
          <ItemField label="版型说明" counter={`${(draft.fitNotes ?? "").length}/${FIT_NOTES_MAX_LEN}`}>
            <textarea
              value={draft.fitNotes ?? ""}
              onChange={(e) => {
                const v = e.target.value.slice(0, FIT_NOTES_MAX_LEN);
                onPatch({ fitNotes: v });
              }}
              maxLength={FIT_NOTES_MAX_LEN}
              rows={2}
              className="resize-none rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-denim"
              placeholder={`最多 ${FIT_NOTES_MAX_LEN} 字，例如「宽松男款衬衫，肩线下落」`}
            />
          </ItemField>
      </ItemSectionCard>

      <ItemSectionCard title="备注" className="item-edit-section">
        <label className="grid gap-1 text-sm font-medium">
          <textarea
            ref={notesRef}
            value={draft.notes ?? ""}
            onChange={(e) => {
              onPatch({ notes: e.target.value });
              // v0.9.29-dev: 退格 / 删除触发的 onChange 主动恢复滚动位置,
              // 抵消 globals.css `scroll-behavior: smooth` + 浏览器 scroll-anchoring
              // 在 React state 更新 + 布局重排时把页面锚到上方的副作用
              // (录屏 52510.mp4 复现: 删字后页面跳到穿搭属性/颜色信息/风格标签区域)。
              // 正常输入时 lastScrollYBeforeDelete 为 null, 此分支短路, 不影响打字。
              // v0.9.29-dev subagent I-2: 显式 behavior: "instant", 不受 globals.css
              // 全局 `scroll-behavior: smooth` 影响 (默认走 smooth 体感差, 应该单帧
              // 跳回, 不应该动画回去)
              const savedY = lastScrollYBeforeDelete.current;
              if (savedY !== null) {
                requestAnimationFrame(() => {
                  if (Math.abs(window.scrollY - savedY) > 1) {
                    window.scrollTo({ top: savedY, behavior: "instant" as ScrollBehavior });
                  }
                  lastScrollYBeforeDelete.current = null;
                });
              }
            }}
            onFocus={handleNotesFocus}
            onKeyDown={handleNotesKeyDown}
            rows={3}
            maxLength={100}
            // v0.9.29-dev: min-h-[78px] 锁 textarea 高度 (~3 行 line-height),
            // 删除文字不会让 textarea 高度收缩, 避免 layout reflow 触发
            // scroll-anchoring 上跳
            className="min-h-[78px] resize-none rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-denim"
            placeholder="版型、搭配限制、适合场景"
          />
          <span className="justify-self-end text-[11px] text-ink/40">{(draft.notes ?? "").length}/100</span>
        </label>
      </ItemSectionCard>

      {/* v0.9.28-dev: 底部 in-flow 保存按钮 (与顶部 header 按钮共用 onSave + isSaving + canSave)。
          移除 fixed save bar (录屏 52479.mp4 复现: v0.9.21-dev/v0.9.26-dev 的"fixed 条件隐藏"
          逻辑在 Android WebView + AnimatedPage transform-gpu containing block 干扰下不稳定,
          蓝色保存按钮仍 fixed 悬浮在键盘上方)。in-flow 按钮:
          - 不会被 transform 干扰 (不依赖 fixed/sticky 定位)
          - 不会被键盘遮挡 (键盘上方, 普通流式元素, 浏览器自动 scrollIntoView 把表单底
            推到键盘上方即可见, 或用户主动滚到底部)
          - 不会被 keyboard 状态切换影响 (不依赖 isKeyboardOpen) */}
      <div className="grid gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-denim text-base font-semibold text-white shadow-sm disabled:bg-ink/18 disabled:text-ink/42"
        >
          {isSaving ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <SaveAll size={18} aria-hidden="true" />}
          {isSaving ? "保存中" : hasChanges ? "保存" : "暂无修改"}
        </button>
        <p className="text-center text-[11px] text-ink/45">
          编辑未保存时点返回会弹确认；保存成功直接返回详情页
        </p>
      </div>
    </div>
  );
}


type BatchOutfitGroupStatus = "pending" | "confirmed" | "cancelled";

function BatchOutfitGroupsView({
  groups,
  statuses,
  names,
  setNames,
  saveAsOutfitDefault,
  onSaveGroup,
  onCancelGroup,
  onCancelAll,
  onDetailChange,
  onExpandImage,
}: {
  groups: WardrobeDraft[][];
  statuses: BatchOutfitGroupStatus[];
  names: string[];
  setNames: React.Dispatch<React.SetStateAction<string[]>>;
  saveAsOutfitDefault: boolean;
  onSaveGroup: (groupIndex: number, editedGroup: WardrobeDraft[] | undefined, saveAsOutfit: boolean) => Promise<boolean>;
  onCancelGroup: (groupIndex: number) => void;
  onCancelAll: () => void;
  // v0.9.11: 组内详情态通知父级 (5 tab 缩窄 + 浮动条 z-40 避让)
  onDetailChange?: (isOpen: boolean) => void;
  onExpandImage: (image: { src: string; alt: string }) => void;
}) {
  const [reviewGroupIndex, setReviewGroupIndex] = useState<number | null>(null);

  useEffect(() => { hasSubPageRef.current = true; return () => { hasSubPageRef.current = false; }; }, []);
  const [reviewDraftIndex, setReviewDraftIndex] = useState(0);
  const [localDrafts, setLocalDrafts] = useState<WardrobeDraft[]>([]);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [editingOutfitName, setEditingOutfitName] = useState(false);
  const [outfitNameDraft, setOutfitNameDraft] = useState("");
  const [saveCurrentOutfit, setSaveCurrentOutfit] = useState(saveAsOutfitDefault);
  const [showOutfitAdjust, setShowOutfitAdjust] = useState(false);
  const [outfitCropJob, setOutfitCropJob] = useState<{ dataUrl: string; startBox?: WardrobeDraft["cropBox"]; onConfirm: (newImageDataUrl: string, newBox: NormalizedCropBox) => void } | null>(null);
  const bogvPrimaryRef = useRef<HTMLDivElement>(null);
  const bogvSecondaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reviewGroupIndex === null) return;
    let removed = false;
    let handle: { remove: () => void } | null = null;
	    App.addListener("backButton", () => {
	      if (removed) return;
	      if (outfitCropJob) { setOutfitCropJob(null); return; }
	      if (editingOutfitName) { setEditingOutfitName(false); setOutfitNameDraft(""); return; }
	      setReviewGroupIndex(null);
	    }).then((h) => { if (!removed) handle = h; });
	    return () => { removed = true; handle?.remove(); };
	  }, [reviewGroupIndex, editingOutfitName, outfitCropJob]);

  useEffect(() => {
    if (reviewGroupIndex !== null) return;
    let removed = false;
    let handle: { remove: () => void } | null = null;
    App.addListener("backButton", () => {
      if (removed) return;
      if (showFinishConfirm) { setShowFinishConfirm(false); return; }
      onCancelAll();
    }).then((h) => { if (!removed) handle = h; });
    return () => { removed = true; handle?.remove(); };
  }, [reviewGroupIndex, showFinishConfirm, onCancelAll]);

  function openGroup(index: number) {
    if (statuses[index] === "confirmed") return;
    setReviewGroupIndex(index);
    setReviewDraftIndex(0);
    setLocalDrafts(groups[index].map((d) => ({ ...d })));
    setEditingOutfitName(false);
    setOutfitNameDraft(names[index] || "");
    setSaveCurrentOutfit(saveAsOutfitDefault);
    setShowOutfitAdjust(false);
    setOutfitCropJob(null);
  }

  function switchReviewDraft(nextIndex: number) {
    const next = Math.max(0, Math.min(localDrafts.length - 1, nextIndex));
    if (next === reviewDraftIndex) return;
    setOutfitCropJob(null);
    setShowOutfitAdjust(false);
    const scrollY = window.scrollY;
    const restoreScroll = () => window.scrollTo({ top: scrollY, behavior: "instant" as ScrollBehavior });
    setReviewDraftIndex(next);
    window.requestAnimationFrame(() => { restoreScroll(); window.requestAnimationFrame(restoreScroll); });
    window.setTimeout(restoreScroll, 80);
  }

  useEffect(() => {
    if (reviewGroupIndex !== null) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [reviewGroupIndex]);

  const inReview = reviewGroupIndex !== null && localDrafts.length > 0;
  const currentDraft = inReview ? (localDrafts[reviewDraftIndex] ?? localDrafts[0]) : null;
  const selectedDraftCount = localDrafts.filter((d) => d.selected !== false).length;
  const currentDraftPrimaryColors = currentDraft ? getPrimaryColors(currentDraft.colors) : [];
  const currentDraftAccentColors = currentDraft ? getAccentColors(currentDraft.colors) : [];

  // eslint-disable-next-line react-hooks/exhaustive-deps -- currentDraft derived from reviewGroupIndex/reviewDraftIndex
  useEffect(() => {
    if (!currentDraft || reviewGroupIndex === null) return;
    if (currentDraftPrimaryColors.length > 0 && bogvPrimaryRef.current) {
      const first = bogvPrimaryRef.current.querySelector("[data-active=true]") as HTMLElement | null;
      centerElementHorizontally(bogvPrimaryRef.current, first);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- currentDraft derived from reviewGroupIndex/reviewDraftIndex
  }, [reviewGroupIndex, reviewDraftIndex]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- currentDraft derived from reviewGroupIndex/reviewDraftIndex
  useEffect(() => {
    if (!currentDraft || reviewGroupIndex === null) return;
    if (currentDraftAccentColors.length > 0 && bogvSecondaryRef.current) {
      const first = bogvSecondaryRef.current.querySelector("[data-active=true]") as HTMLElement | null;
      centerElementHorizontally(bogvSecondaryRef.current, first);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- currentDraft derived from reviewGroupIndex/reviewDraftIndex
  }, [reviewGroupIndex, reviewDraftIndex]);

  // v0.9.11: inReview 变化通知父级, 让 5 tab 在组内详情页缩窄 (与 BatchReviewView isDetail 行为一致)
  useEffect(() => { onDetailChange?.(inReview); }, [inReview, onDetailChange]);
  useEffect(() => () => { onDetailChange?.(false); }, [onDetailChange]);
  useEffect(() => {
    if (reviewGroupIndex === null && outfitCropJob) setOutfitCropJob(null);
  }, [reviewGroupIndex, outfitCropJob]);

  if (inReview && currentDraft) {
    return (
      <div className="grid gap-4">
        {/* v0.9.11 重做: 沉浸式详情壳 + 套装名称 + 两个开关 + 浮动操作条 (z-40 避开 5 tab 导航 z-30) + onDetailChange 让 5 tab 缩窄 */}
        <GarmentImmersiveDetail
          item={{
            name: currentDraft.name || "候选衣物",
            imageDataUrl: currentDraft.imageDataUrl,
            sourceImageDataUrl: currentDraft.sourceImageDataUrl,
            categoryLabel: CATEGORY_LABELS[currentDraft.category],
            seasonLabels: currentDraft.seasons.map((s) => SEASON_LABELS[s]),
            statusLabel: STATUS_LABELS[currentDraft.status],
            primaryColors: currentDraftPrimaryColors,
            secondaryColors: currentDraftAccentColors,
            confidenceLabel: currentDraft.aiConfidence !== undefined ? `识别置信度 ${Math.round(currentDraft.aiConfidence * 100)}%` : undefined,
            needsReview: currentDraft.needsReview,
            notes: currentDraft.notes,
          }}
          counterText={`第 ${reviewGroupIndex! + 1} 套 · ${reviewDraftIndex + 1} / ${localDrafts.length} 件`}
          onBack={() => {
            if (outfitCropJob) {
              setOutfitCropJob(null);
              return;
            }
            setReviewGroupIndex(null);
          }}
          onOpenImage={() => onExpandImage({ src: currentDraft.sourceImageDataUrl || currentDraft.imageDataUrl, alt: currentDraft.name || "候选衣物" })}
          onCrop={currentDraft.sourceImageDataUrl ? () => {
            setOutfitCropJob({
              dataUrl: currentDraft.sourceImageDataUrl!,
              startBox: currentDraft.cropBox,
              onConfirm: (newImageDataUrl, newBox) => {
                setLocalDrafts((prev) => prev.map((draft, i) => i === reviewDraftIndex ? { ...draft, imageDataUrl: newImageDataUrl, cropBox: newBox } : draft));
                setOutfitCropJob(null);
              },
            });
          } : undefined}
          topActions={
            <button
              type="button"
              disabled={statuses[reviewGroupIndex!] === "confirmed"}
              onClick={() => { setOutfitCropJob(null); onCancelGroup(reviewGroupIndex!); setReviewGroupIndex(null); }}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-ink/10 bg-white px-2.5 text-xs font-medium text-ink/65 disabled:opacity-40"
            >
              取消此套
            </button>
          }
          detailEditor={
            <div className="grid gap-3">
              {/* 套装名称编辑 (在 metadata 面板下方, 不在主 metadata 行) */}
              <div className="grid gap-1.5">
                <span className="text-[11px] font-medium text-ink/55">套装名称</span>
                {editingOutfitName ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={outfitNameDraft}
                      onChange={(e) => setOutfitNameDraft(e.target.value)}
                      autoFocus
                      className="flex-1 h-10 rounded-lg border border-ink/10 bg-white px-3 text-sm font-semibold outline-none focus:border-denim"
                      placeholder="输入套装名称"
                    />
                    <button
                      type="button"
                      onClick={() => { setNames((prev) => { const n = [...prev]; n[reviewGroupIndex!] = outfitNameDraft.trim() || n[reviewGroupIndex!]; return n; }); setEditingOutfitName(false); }}
                      className="inline-flex h-10 items-center gap-1 rounded-lg bg-clay px-3 text-sm font-semibold text-white"
                    >
                      <Check size={16} />
                      确认
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm font-semibold">{names[reviewGroupIndex!] || `第 ${reviewGroupIndex! + 1} 套`}</span>
                    <button
                      type="button"
                      onClick={() => { setOutfitNameDraft(names[reviewGroupIndex!] || ""); setEditingOutfitName(true); }}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-ink/10 bg-white px-3 text-xs font-semibold"
                    >
                      编辑名称
                    </button>
                  </div>
                )}
              </div>

              {/* 两个开关 */}
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex min-h-10 items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={currentDraft.selected !== false}
                    onChange={(event) => setLocalDrafts((prev) => prev.map((d, i) => i === reviewDraftIndex ? { ...d, selected: event.target.checked } : d))}
                    className="h-4 w-4 accent-denim"
                  />
                  录入这件
                </label>
                <label className="flex min-h-10 items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={saveCurrentOutfit}
                    onChange={(event) => setSaveCurrentOutfit(event.target.checked)}
                    className="h-4 w-4 accent-denim"
                  />
                  加入套装收藏
                </label>
              </div>

              {/* 折叠属性编辑 */}
              <details
                open={showOutfitAdjust}
                onToggle={(event) => setShowOutfitAdjust((event.currentTarget as HTMLDetailsElement).open)}
                className="rounded-lg overflow-hidden"
              >
                <summary className="cursor-pointer select-none py-2 flex items-center justify-between text-sm font-semibold">
                  <span>调整属性</span>
                  <span className="text-ink/40 text-xs">{showOutfitAdjust ? "收起" : "展开"}</span>
                </summary>
                <div className="border-t border-ink/10 pt-3 grid gap-4">
                  <label className="grid gap-1 text-sm font-medium">名称
                    <input value={currentDraft.name} onChange={(e) => setLocalDrafts((prev) => prev.map((d, i) => i === reviewDraftIndex ? { ...d, name: e.target.value } : d))} className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim" />
                  </label>
                  <label className="grid gap-1 text-sm font-medium">类别
                    <select value={currentDraft.category} onChange={(e) => setLocalDrafts((prev) => prev.map((d, i) => i === reviewDraftIndex ? { ...d, category: e.target.value as GarmentCategory } : d))} className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim">
                      {categoryOptions.map((c) => (<option key={c} value={c}>{CATEGORY_LABELS[c]}</option>))}
                    </select>
                  </label>
                  <ChipGroup title="主色" options={[...COLOR_OPTIONS]} values={currentDraftPrimaryColors} onChange={(v) => setLocalDrafts((prev) => prev.map((d, i) => i === reviewDraftIndex ? { ...d, colors: colorInfoFromChipGroups(v, getAccentColors(d.colors)) } : d))} scrollRef={bogvPrimaryRef} />
                  <ChipGroup title="配色" options={[...COLOR_OPTIONS]} values={currentDraftAccentColors} onChange={(v) => setLocalDrafts((prev) => prev.map((d, i) => i === reviewDraftIndex ? { ...d, colors: colorInfoFromChipGroups(getPrimaryColors(d.colors), v) } : d))} scrollRef={bogvSecondaryRef} />
                  <ChipGroup title="季节" options={seasonOptions} labels={SEASON_LABELS} values={currentDraft.seasons} onChange={(v) => setLocalDrafts((prev) => prev.map((d, i) => i === reviewDraftIndex ? { ...d, seasons: v } : d))} />
                  <ChipGroup title="风格" options={styleOptions} labels={STYLE_LABELS} values={currentDraft.styles} onChange={(v) => setLocalDrafts((prev) => prev.map((d, i) => i === reviewDraftIndex ? { ...d, styles: v } : d))} />
                  <SelectableChipGroup
                    title="版型倾向"
                    options={["menswear", "womenswear", "unisex", "unknown"] as GarmentFitGender[]}
                    labels={{ menswear: "男装", womenswear: "女装", unisex: "中性", unknown: "未判断" }}
                    values={currentDraft.fitGender ? [currentDraft.fitGender] : []}
                    onChange={(v) => setLocalDrafts((prev) => prev.map((d, i) => i === reviewDraftIndex ? { ...d, fitGender: v[0] ?? "unknown" } : d))}
                    mode="single"
                    maxSelected={1}
                    selectedFirst
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <RangeField label="正式度" value={currentDraft.formality ?? 3} onChange={(v) => setLocalDrafts((prev) => prev.map((d, i) => i === reviewDraftIndex ? { ...d, formality: v } : d))} />
                    <RangeField label="保暖度" value={currentDraft.warmth ?? 3} onChange={(v) => setLocalDrafts((prev) => prev.map((d, i) => i === reviewDraftIndex ? { ...d, warmth: v } : d))} />
                  </div>
                  <label className="grid gap-1 text-sm font-medium">备注
                    <textarea value={currentDraft.notes ?? ""} onChange={(e) => setLocalDrafts((prev) => prev.map((d, i) => i === reviewDraftIndex ? { ...d, notes: e.target.value } : d))} rows={2} className="resize-none rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-denim" />
                  </label>
                </div>
              </details>
            </div>
          }
        />

        {/* 底部浮动操作条 - z-40 避开 5 tab 导航 z-30; pb-safe 避开 iPhone home indicator */}
        <div className="fixed bottom-20 left-0 right-0 z-40 px-3 pb-[env(safe-area-inset-bottom)] pointer-events-none">
          <div className="mx-auto max-w-md bg-white border border-ink/10 rounded-2xl shadow-lg p-1.5 flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              onClick={() => reviewDraftIndex > 0 && switchReviewDraft(reviewDraftIndex - 1)}
              disabled={reviewDraftIndex === 0}
              aria-label="上一件"
              className="grid h-10 w-10 place-items-center rounded-full bg-mist text-ink disabled:opacity-30 hover:bg-ink/10 transition-colors"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <span className="text-xs font-medium text-ink/60 tabular-nums px-1">
              <b className="text-ink">{reviewDraftIndex + 1}</b> / {localDrafts.length}
            </span>
            <button
              type="button"
              onClick={() => reviewDraftIndex < localDrafts.length - 1 && switchReviewDraft(reviewDraftIndex + 1)}
              disabled={reviewDraftIndex >= localDrafts.length - 1}
              aria-label="下一件"
              className="grid h-10 w-10 place-items-center rounded-full bg-mist text-ink disabled:opacity-30 hover:bg-ink/10 transition-colors"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <div className="flex-1" />
            <button
              type="button"
              disabled={statuses[reviewGroupIndex!] === "confirmed" || selectedDraftCount === 0}
              onClick={async () => { const saved = await onSaveGroup(reviewGroupIndex!, localDrafts, saveCurrentOutfit); if (saved) { setOutfitCropJob(null); setReviewGroupIndex(null); } }}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-clay px-4 text-sm font-semibold text-white active:scale-95 transition-transform disabled:opacity-40"
            >
              <SaveAll size={15} />
              {statuses[reviewGroupIndex!] === "confirmed" ? "已录入" : `确认录入 ${selectedDraftCount} 件`}
            </button>
          </div>
        </div>
        <div className="h-20" /> {/* 占位: 避开底部浮动条 + 底栏 */}

        {outfitCropJob ? (
          <ImageCropEditor
            source={outfitCropJob.dataUrl}
            initialCropBox={outfitCropJob.startBox}
            aspectRatio="free"
            onCancel={() => setOutfitCropJob(null)}
            onConfirm={(newImageDataUrl, newBox) => {
              outfitCropJob.onConfirm(newImageDataUrl, newBox);
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="surface rounded-lg p-3 flex items-center gap-3 flex-wrap">
        <Layers size={20} className="text-denim" />
        <span className="text-sm font-semibold">已确认 {statuses.filter((s) => s === "confirmed").length}/{groups.length} 套穿搭</span>
        <span className="text-xs text-ink/50">点击图片堆叠确认每套穿搭</span>
        <div className="flex-1" />
        <button type="button" onClick={() => { const unconfirmed = statuses.filter((s) => s !== "confirmed" && s !== "cancelled").length; if (unconfirmed > 0) { setShowFinishConfirm(true); } else { onCancelAll(); }}} className="inline-flex h-9 items-center gap-2 rounded-lg bg-moss px-3 text-sm font-semibold text-white">
          <Check size={15} />确认完成
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {groups.map((group, index) => {
          const status = statuses[index] ?? "pending";
          return (
            <button key={index} type="button" onClick={() => status !== "cancelled" && openGroup(index)} disabled={status === "cancelled"}
              className={`overflow-hidden rounded-lg border bg-white shadow-sm transition-all text-left ${status === "confirmed" ? "border-moss/50 opacity-80" : status === "cancelled" ? "border-ink/10 opacity-40" : "border-ink/10 hover:border-denim"}`}>
              <div className="relative">
                <div className="aspect-[4/5] bg-mist grid grid-cols-2 grid-rows-2 gap-px p-px">
                  {group.slice(0, 4).map((d, di) => (
                    <div key={di} className="overflow-hidden bg-mist">
                      <GarmentImage src={d.imageDataUrl || undefined} alt={d.name} fallbackSize={14} />
                    </div>
                  ))}
                  {group.length > 4 ? <div className="absolute right-1.5 bottom-1.5 rounded-full bg-ink/70 px-1.5 py-0.5 text-[10px] text-white font-medium">+{group.length - 4}</div> : null}
                </div>
              </div>
              <div className="p-2">
                <p className="truncate text-xs font-semibold">{names[index] ? `第 ${index + 1} 套 · ${names[index]}` : `第 ${index + 1} 套`}</p>
                <p className="truncate text-[11px]">{group.length} 件单品</p>
                <span className={`inline-block mt-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${status === "confirmed" ? "bg-moss/10 text-moss" : status === "cancelled" ? "bg-ink/10 text-ink/40" : "bg-clay/10 text-clay"}`}>
                  {status === "confirmed" ? "已录入" : status === "cancelled" ? "已取消" : "待确认"}
                </span>
              </div>
            </button>
          );
        })}

      </div>

      <MotionSheet open={showFinishConfirm} onClose={() => setShowFinishConfirm(false)} panelClassName="!max-w-xs text-center">
        <p className="text-base font-semibold mb-1">是否确认退出？</p>
        <p className="text-xs text-ink/50 mb-4">未确认的套装将会取消录入</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setShowFinishConfirm(false)} className="h-10 rounded-lg border border-ink/10 text-sm">取消退出</button>
          <button type="button" onClick={() => { setShowFinishConfirm(false); onCancelAll(); }} className="h-10 rounded-lg bg-red-600 text-sm font-semibold text-white">确认退出</button>
        </div>
      </MotionSheet>
    </div>
  );
}

function RecommendationView({
  items,
  outfits,
  request,
  setRequest,
  locations,
  recommendations,
  locationNameById,
  useAiRecommendations,
  setUseAiRecommendations,
  isRecommending,
  recProgress,
  selectedItemIds,
  setSelectedItemIds,
  previewImageDataUrl,
  isPreviewGenerating,
  tryonProgress,
  weatherInsight,
  onGenerate,
  onGeneratePreview,
  onSaveManualOutfit,
  onExpandImage,
  onRefreshState,
  editingOutfitId,
  setEditingOutfitId,
  onMessage,
  tryOnProfile,
  usePersonRef,
  setUsePersonRef,
}: {
  items: WardrobeItem[];
  outfits: SavedOutfit[];
  request: OutfitRequest;
  setRequest: React.Dispatch<React.SetStateAction<OutfitRequest>>;
  locations: ClosetLocation[];
  recommendations: OutfitRecommendation[];
  locationNameById: Record<string, string>;
  useAiRecommendations: boolean;
  setUseAiRecommendations: (value: boolean) => void;
  isRecommending: boolean;
  recProgress: { visible: boolean; percent: number; stage: string; label: string };
  selectedItemIds: number[];
  setSelectedItemIds: (ids: number[]) => void;
  editingOutfitId: string | null;
  setEditingOutfitId: (id: string | null) => void;
  previewImageDataUrl: string;
  isPreviewGenerating: boolean;
  tryonProgress: { visible: boolean; percent: number; stage: string; label: string };
  weatherInsight: WeatherInsight | null;
  onGenerate: (request: OutfitRequest) => void;
  onGeneratePreview: (selectedIds?: number[]) => void;
  onSaveManualOutfit: (selectedIds?: number[], options?: { outfitId?: string; name: string }) => void;
  onExpandImage: (image: { src: string; alt: string }) => void;
  onRefreshState: () => Promise<void>;
  onMessage: (msg: string) => void;
  tryOnProfile?: TryOnProfile;
  usePersonRef: boolean;
  setUsePersonRef: (v: boolean) => void;
}) {
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [customActivity, setCustomActivity] = useState("");
  const [customStyle, setCustomStyle] = useState("");
  const [showCustomActivity, setShowCustomActivity] = useState(false);
  const [showCustomStyle, setShowCustomStyle] = useState(false);
  const [activityCounts, setActivityCounts] = useState<Record<string, number>>(() => loadChoiceCounts("wardrobe-activity-counts"));
  const [styleCounts, setStyleCounts] = useState<Record<string, number>>(() => loadChoiceCounts("wardrobe-style-counts"));
  const [outfitExpandedCategory, setOutfitExpandedCategory] = useState<GarmentCategory | null>(null);
  const [outfitVisibleCounts, setOutfitVisibleCounts] = useState<Record<string, number>>({});
  const [outfitAllCategory, setOutfitAllCategory] = useState<GarmentCategory | null>(null);

  const [outfitAllFilter, setOutfitAllFilter] = useState("all");
  const [outfitAllQuery, setOutfitAllQuery] = useState("");

  const [viewingSavedOutfitId, setViewingSavedOutfitId] = useState<string | null>(null);
  const [editingSavedOutfitName, setEditingSavedOutfitName] = useState(false);
  const [savedOutfitNameDraft, setSavedOutfitNameDraft] = useState("");
  const [outfitDisplayName, setOutfitDisplayName] = useState("");
  const [viewingOutfitItem, setViewingOutfitItem] = useState<WardrobeItem | null>(null);
  const [showOutfitSaveDialog, setShowOutfitSaveDialog] = useState(false);
  const [outfitSaveNameDraft, setOutfitSaveNameDraft] = useState("");
  const [isGeneratingOutfitName, setIsGeneratingOutfitName] = useState(false);
  const [isGeneratingSavedOutfitName, setIsGeneratingSavedOutfitName] = useState(false);
  const [savedOutfitMenuId, setSavedOutfitMenuId] = useState<string | null>(null);
  // v0.9.42-dev C-1: 套装卡片三点菜单 anchor ref Map (同 cardMenuAnchorRefs 模式)
  const outfitMenuAnchorRefs = useRef(new Map<string, React.MutableRefObject<HTMLButtonElement | null>>());
  const getOutfitMenuAnchorRef = (outfitId: string): React.MutableRefObject<HTMLButtonElement | null> => {
    let ref = outfitMenuAnchorRefs.current.get(outfitId);
    if (!ref) {
      ref = { current: null };
      outfitMenuAnchorRefs.current.set(outfitId, ref);
    }
    return ref;
  };

  useEffect(() => {
    if (!isAiModalOpen && !outfitAllCategory && !viewingSavedOutfitId && !showOutfitSaveDialog) return;
    hasSubPageRef.current = true;
    let removed = false;
    let handle: { remove: () => void } | null = null;
    App.addListener("backButton", () => {
      if (removed) return;
      if (showOutfitSaveDialog) { setShowOutfitSaveDialog(false); return; }
      if (viewingOutfitItem) { setViewingOutfitItem(null); return; }
      if (editingSavedOutfitName) { setEditingSavedOutfitName(false); setSavedOutfitNameDraft(""); return; }
      if (outfitAllCategory) { setOutfitAllCategory(null); return; }
      if (viewingSavedOutfitId) { setViewingSavedOutfitId(null); return; }
      if (isAiModalOpen) { setIsAiModalOpen(false); return; }
    }).then((h) => { if (!removed) handle = h; });
    return () => { removed = true; handle?.remove(); hasSubPageRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAiModalOpen, outfitAllCategory, viewingSavedOutfitId, viewingOutfitItem, editingSavedOutfitName, showOutfitSaveDialog]);

  useEffect(() => {
    if (viewingSavedOutfitId) {
      const o = outfits.find((x) => x.id === viewingSavedOutfitId);
      if (o) setOutfitDisplayName(o.name);
    }
  }, [outfits, viewingSavedOutfitId]);
  const selectedItems = items.filter((item) => item.id && selectedItemIds.includes(item.id));
  const activeItems = items.filter((item) => item.status === "active");
  const groupedItems = categoryOptions
    .map((category) => ({
      category,
      items: activeItems.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length > 0);
  const activityChoices = sortedChoiceOptions(activityCounts);
  const styleChoices = sortedChoiceOptions(styleCounts);

  function updateSelected(id: number) {
    setSelectedItemIds(toggle(selectedItemIds, id));
  }

  function submitAiRecommendation() {
    const activity = request.activity === "__custom__" ? customActivity.trim() : (customActivity.trim() || request.activity);
    const stylePreference = request.stylePreference === "__custom__" ? customStyle.trim() : (customStyle.trim() || request.stylePreference);
    const nextRequest = {
      ...request,
      activity: activity || "casual",
      stylePreference: stylePreference || "casual",
      availableLocationIds: request.availableLocationIds.length > 0 ? request.availableLocationIds : locations.map((location) => location.id),
    };
    const nextActivityCounts = bumpChoiceCount(activityCounts, nextRequest.activity);
    const nextStyleCounts = bumpChoiceCount(styleCounts, nextRequest.stylePreference);
    setActivityCounts(nextActivityCounts);
    setStyleCounts(nextStyleCounts);
    saveChoiceCounts("wardrobe-activity-counts", nextActivityCounts);
    saveChoiceCounts("wardrobe-style-counts", nextStyleCounts);
    setShowCustomActivity(false);
    setShowCustomStyle(false);
    setCustomActivity("");
    setCustomStyle("");
    setRequest(nextRequest);
    setIsAiModalOpen(false);
    onGenerate(nextRequest);
  }

  function confirmCustomActivity() {
    const value = customActivity.trim();
    if (!value) return;
    const nextCounts = bumpChoiceCount(activityCounts, value);
    setActivityCounts(nextCounts);
    saveChoiceCounts("wardrobe-activity-counts", nextCounts);
    setRequest((current) => ({ ...current, activity: value }));
    setShowCustomActivity(false);
    setCustomActivity("");
  }

  function confirmCustomStyle() {
    const value = customStyle.trim();
    if (!value) return;
    const nextCounts = bumpChoiceCount(styleCounts, value);
    setStyleCounts(nextCounts);
    saveChoiceCounts("wardrobe-style-counts", nextCounts);
    setRequest((current) => ({ ...current, stylePreference: value }));
    setShowCustomStyle(false);
    setCustomStyle("");
  }

  function applyRecommendation(recommendation: OutfitRecommendation) {
    blurActiveElement();
    setSelectedItemIds(recommendation.slots.map((slot) => slot.item.id).filter((id): id is number => typeof id === "number"));
    setIsAiModalOpen(false);
    window.requestAnimationFrame(() => blurActiveElement());
    window.setTimeout(() => blurActiveElement(), 80);
  }

  const itemIdSet = new Set(items.filter((i) => i.id != null).map((i) => i.id as number));
  const displayOutfits = outfits.map((o) => ({ ...o, itemIds: o.itemIds.filter((id) => itemIdSet.has(id)) })).filter((o) => o.itemIds.length > 0);
  const viewingOutfit = viewingSavedOutfitId ? displayOutfits.find((o) => o.id === viewingSavedOutfitId) : null;
  const viewingOutfitItems = viewingOutfit ? items.filter((item) => item.id && viewingOutfit.itemIds.includes(item.id)) : [];

  async function generateSavedOutfitName() {
    if (!viewingOutfit || viewingOutfitItems.length === 0) return;
    setIsGeneratingSavedOutfitName(true);
    try {
      const ms = loadMiniMaxSettings();
      const name = await withKeepAwake(() => generateOutfitNameOnDevice(
        viewingOutfitItems.map((item) => ({
          name: item.name,
          category: item.category,
          colors: item.colors,
          styles: item.styles,
        })),
        {
          destination: viewingOutfit.destination,
          activity: viewingOutfit.activity,
          stylePreference: viewingOutfit.style,
        },
        ms,
      ));
      setSavedOutfitNameDraft(name);
    } catch {
      onMessage("AI 名称生成失败，请手动输入");
    } finally {
      setIsGeneratingSavedOutfitName(false);
    }
  }

  async function saveSavedOutfitName() {
    if (!viewingOutfit) return;
    const name = savedOutfitNameDraft.trim() || viewingOutfit.name;
    await getWardrobeDb().outfits.update(viewingOutfit.id, { name, updatedAt: new Date().toISOString() });
    setOutfitDisplayName(name);
    await onRefreshState();
    setEditingSavedOutfitName(false);
    onMessage("套装名称已更新");
  }

  async function removeSavedOutfit(outfitId: string) {
    await getWardrobeDb().outfits.delete(outfitId);
    if (viewingSavedOutfitId === outfitId) {
      setViewingSavedOutfitId(null);
      setViewingOutfitItem(null);
    }
    setSavedOutfitMenuId(null);
    await onRefreshState();
    onMessage("已取消收藏套装");
  }

  if (viewingSavedOutfitId && viewingOutfit) {
    return (
      <AnimatedPage className="grid gap-4">
        <div className="surface rounded-lg p-3 flex min-w-0 items-center gap-2 overflow-hidden">
          <button type="button" onClick={() => { setViewingSavedOutfitId(null); setViewingOutfitItem(null); }} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink/10 bg-white" aria-label="返回套装" title="返回套装">
            <ChevronLeft size={17} />
          </button>
          {editingSavedOutfitName ? (
            <>
              <input value={savedOutfitNameDraft} onChange={(e) => setSavedOutfitNameDraft(e.target.value)} autoFocus className="flex-1 min-w-0 h-10 rounded-lg border border-ink/10 bg-white px-3 text-base font-semibold outline-none focus:border-denim" placeholder="输入套装名称" />
              {(() => { const ms = loadMiniMaxSettings(); return hasDeviceMiniMaxKey(ms); })() ? (
                <button type="button" title="AI生成套装名称" aria-label="AI生成套装名称" disabled={isGeneratingSavedOutfitName} onClick={generateSavedOutfitName} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-ink/10 bg-white disabled:opacity-55">
                  <WandSparkles size={16} className={isGeneratingSavedOutfitName ? "animate-pulse text-denim" : "text-ink/60"} />
                </button>
              ) : null}
              <button type="button" onClick={saveSavedOutfitName} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-clay text-white" aria-label="确认保存套装名称" title="确认保存套装名称"><Check size={17} /></button>
            </>
          ) : (
            <>
              <span className="flex-1 min-w-0 text-sm font-semibold truncate">{outfitDisplayName || viewingOutfit.name}</span>
              <button type="button" onClick={() => { setSavedOutfitNameDraft(outfitDisplayName || viewingOutfit.name); setEditingSavedOutfitName(true); }} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-ink/10 bg-white px-3 text-sm">编辑名称</button>
            </>
          )}
        </div>

        <div className="surface rounded-lg p-3">
          <button type="button" onClick={() => {
            setSelectedItemIds(viewingOutfitItems.map((item) => item.id).filter((id): id is number => typeof id === "number"));
            setEditingOutfitId(viewingOutfit.id);
            setViewingSavedOutfitId(null);
          }} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-denim text-sm font-semibold text-white">
            <Sparkles size={16} />应用套装
          </button>
        </div>

        {viewingOutfitItem ? (
          <AnimatedPage className="grid gap-4">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setViewingOutfitItem(null)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-ink/10 bg-white px-3 text-sm">
                <ChevronLeft size={16} />返回套装详情
              </button>
              <span className="text-sm text-ink/60">衣物详情</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="surface rounded-lg p-3">
                <div className="aspect-[4/5] overflow-hidden rounded-lg bg-white">
                  <GarmentImage src={viewingOutfitItem.imageDataUrl || undefined} alt={viewingOutfitItem.name} fallbackSize={48} />
                </div>
              </div>
              <div className="surface rounded-lg p-4">
                <div className="grid gap-3">
                  <div><span className="text-xs text-ink/40">名称</span><p className="text-base font-semibold">{viewingOutfitItem.name}</p></div>
                  <div><span className="text-xs text-ink/40">类别</span><p className="text-sm">{CATEGORY_LABELS[viewingOutfitItem.category]}</p></div>
                  <div><span className="text-xs text-ink/40">主色</span><div className="flex flex-wrap gap-1 mt-1">{getPrimaryColors(viewingOutfitItem.colors).map((c) => (<span key={c} className="rounded-md bg-mist px-2 py-1 text-xs">{c}</span>))}</div></div>
                  <div><span className="text-xs text-ink/40">配色</span><div className="flex flex-wrap gap-1 mt-1">{getAccentColors(viewingOutfitItem.colors).map((c) => (<span key={c} className="rounded-md bg-mist px-2 py-1 text-xs">{c}</span>))}</div></div>
                  <div><span className="text-xs text-ink/40">季节</span><div className="flex flex-wrap gap-1 mt-1">{viewingOutfitItem.seasons.map((s) => (<span key={s} className="rounded-md bg-mist px-2 py-1 text-xs">{SEASON_LABELS[s]}</span>))}</div></div>
                  <div><span className="text-xs text-ink/40">风格</span><div className="flex flex-wrap gap-1 mt-1">{viewingOutfitItem.styles.map((s) => (<span key={s} className="rounded-md bg-mist px-2 py-1 text-xs">{STYLE_LABELS[s]}</span>))}</div></div>
                  <div className="grid grid-cols-2 gap-2"><div><span className="text-xs text-ink/40">正式度</span><p className="text-sm">{viewingOutfitItem.formality}/5</p></div><div><span className="text-xs text-ink/40">保暖度</span><p className="text-sm">{viewingOutfitItem.warmth}/5</p></div></div>
                  {viewingOutfitItem.fitGender && viewingOutfitItem.fitGender !== "unknown" ? (
                    <div>
                      <span className="text-xs text-ink/40">版型倾向</span>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-denim/10 px-2 py-1 text-xs font-semibold text-denim">{{ menswear: "男装", womenswear: "女装", unisex: "中性" }[viewingOutfitItem.fitGender]}</span>
                        {viewingOutfitItem.fitNotes ? <span className="text-[11px] text-ink/50 truncate">· {viewingOutfitItem.fitNotes}</span> : null}
                      </div>
                    </div>
                  ) : null}
                  <div><span className="text-xs text-ink/40">状态</span><p className="text-sm">{STATUS_LABELS[viewingOutfitItem.status]}</p></div>
                  <div><span className="text-xs text-ink/40">位置</span><p className="text-sm">{locationNameById[viewingOutfitItem.locationId] ?? viewingOutfitItem.locationId}</p></div>
                  {viewingOutfitItem.notes ? (<div><span className="text-xs text-ink/40">备注</span><p className="text-sm">{viewingOutfitItem.notes}</p></div>) : null}
                </div>
              </div>
            </div>
          </AnimatedPage>
        ) : (
          <div className="grid gap-2">
            {viewingOutfitItems.length === 0 ? (
              <div className="surface rounded-lg p-4 text-center"><p className="text-sm text-ink/50">该套装内的衣物已全部删除</p></div>
            ) : null}
            {viewingOutfitItems.map((item) => (
              <button key={item.id} type="button" onClick={() => setViewingOutfitItem(item)} className="surface rounded-lg p-3 flex items-center gap-3 w-full text-left hover:border-denim/30">
                <div className="w-16 h-20 shrink-0 overflow-hidden rounded-lg bg-white border border-ink/10">
                  <GarmentImage src={item.imageDataUrl || undefined} alt={item.name} fallbackSize={20} />
                </div>
                <div className="min-w-0 flex-1 grid gap-1.5">
                  <p className="text-sm font-semibold truncate">{item.name}</p>
                  <p className="text-xs text-ink/50">{CATEGORY_LABELS[item.category]} · {locationNameById[item.locationId] ?? item.locationId}</p>
                  <div className="flex flex-wrap gap-1">
                    {getPrimaryColors(item.colors).map((c) => (<span key={c} className="rounded-md bg-mist px-1.5 py-0.5 text-[10px] text-ink/60">{c}</span>))}
                    {getAccentColors(item.colors).map((c) => (<span key={c} className="rounded-md bg-mist px-1.5 py-0.5 text-[10px] text-ink/40">{c}</span>))}
                    <span className="rounded-md bg-denim/8 px-1.5 py-0.5 text-[10px] text-denim">{STATUS_LABELS[item.status]}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {item.seasons.map((s) => (<span key={s} className="text-[10px] text-ink/40">{SEASON_LABELS[s]}</span>))}
                    <span className="text-[10px] text-ink/30">·</span>
                    {item.styles.map((s) => (<span key={s} className="text-[10px] text-ink/40">{STYLE_LABELS[s]}</span>))}
                  </div>
                </div>
                <ChevronRight size={16} className="shrink-0 text-ink/30" />
              </button>
            ))}
          </div>
        )}
      </AnimatedPage>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <div className="grid gap-4 min-w-0">
        <section className="surface rounded-lg p-4 overflow-hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">套装搭配</h2>
              <p className="text-xs text-ink/54">手动选择衣物，也可以让 MiniMax 生成推荐</p>
            </div>
            <button
              type="button"
              onClick={() => { setIsAiModalOpen(true); setShowOutfitSaveDialog(false); }}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-denim px-3 text-sm font-semibold text-white"
            >
              <Sparkles size={16} aria-hidden="true" />
              AI搭配推荐
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {groupedItems.length === 0 ? (
              <div className="rounded-lg border border-ink/10 bg-white p-5 text-sm text-ink/55">先录入衣物后再搭配套装</div>
            ) : null}
            {groupedItems.map((group) => {
              const SINGLE_LIMIT = (group.category === "hats" || group.category === "one_piece" || group.category === "shoes");
              const selectedCount = group.items.filter((i) => i.id && selectedItemIds.includes(i.id)).length;
              const isExpanded = outfitExpandedCategory === group.category;
              const visibleCount = outfitVisibleCounts[group.category] ?? 10;
              return (
                <div key={group.category} className="rounded-lg border border-ink/10 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOutfitExpandedCategory(isExpanded ? null : group.category)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                  >
                    <span className={`text-sm font-semibold ${selectedCount > 0 ? "text-moss" : "text-ink/70"}`}>
                      {CATEGORY_LABELS[group.category]}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-ink/45">{group.items.length} 件</span>
                      {selectedCount > 0 ? (
                        <span className="flex items-center gap-1 text-xs text-moss font-medium">
                          <Check size={14} aria-hidden="true" />已选
                        </span>
                      ) : (
                        <span className="text-xs text-ink/40">待选择</span>
                      )}
                    </span>
                  </button>
                  <MotionAccordion expanded={!!isExpanded} animateHeight={false}>
                    <div className="border-t border-ink/10 px-4 py-3">
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                        {group.items.slice(0, visibleCount).map((item) => {
                          const selected = Boolean(item.id && selectedItemIds.includes(item.id));
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                if (item.id) {
                                  if (SINGLE_LIMIT && !selected && selectedCount >= 1) return;
                                  updateSelected(item.id);
                                }
                              }}
                              className={`overflow-hidden rounded-lg border bg-white text-left ${selected ? "border-moss ring-1 ring-moss/30" : "border-ink/10"}`}
                            >
                              <div className="aspect-square bg-mist relative">
                                {item.imageDataUrl ? (
                                  <GarmentImage src={item.imageDataUrl} alt={item.name} />
                                ) : <div className="grid h-full place-items-center text-ink/30"><Shirt size={16} /></div>}
                                {selected ? (
                                  <div className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-moss text-white">
                                    <Check size={11} aria-hidden="true" />
                                  </div>
                                ) : null}
                              </div>
                              <p className="truncate p-1.5 text-[11px] font-medium">{item.name}</p>
                            </button>
                          );
                        })}
                      </div>
                      {visibleCount < group.items.length ? (
                        <button
                          type="button"
                          onClick={() => setOutfitVisibleCounts((prev) => ({ ...prev, [group.category]: (prev[group.category] ?? 10) + 10 }))}
                          className="mt-3 w-full h-9 rounded-lg border border-ink/10 text-xs text-ink/60 hover:bg-mist"
                        >
                          加载更多
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => { setOutfitAllCategory(group.category); setOutfitAllFilter("all"); setOutfitAllQuery(""); }}
                        className="mt-2 w-full h-9 rounded-lg border border-ink/10 text-xs text-denim font-medium hover:bg-denim/5"
                      >
                        查看全部衣物
                      </button>
                    </div>
                  </MotionAccordion>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-ink/10">
            <button
              type="button"
              onClick={() => {
                if (selectedItems.length === 0) return;
                const defaultName = editingOutfitId ? (outfits.find((o) => o.id === editingOutfitId)?.name || "") : `${request.destination || "手工套装"} · ${selectedItems.length} 件`;
                setOutfitSaveNameDraft(defaultName);
                setShowOutfitSaveDialog(true); setIsAiModalOpen(false);
              }}
              disabled={selectedItems.length === 0}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-ink/10 bg-white text-sm font-semibold disabled:opacity-55"
            >
              <SaveAll size={16} aria-hidden="true" />
              {editingOutfitId ? "保存当前套装" : "收藏当前套装"}
            </button>
          </div>
        </section>

        <section className="surface rounded-lg p-4 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">AI试穿预览</h2>
            <div className="flex items-center gap-2">
              {tryOnProfile ? (
                <label className="flex items-center gap-1.5 text-[11px] text-ink/50 cursor-pointer">
                  <input type="checkbox" checked={usePersonRef} onChange={(e) => setUsePersonRef(e.target.checked)} className="h-3.5 w-3.5 accent-denim" />
                  本人参考
                </label>
              ) : null}
              <span className="text-xs text-ink/45">{selectedItems.length} 件</span>
            </div>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto hide-scrollbar">
            {selectedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onExpandImage({ src: item.imageDataUrl, alt: item.name })}
                className="w-20 shrink-0 overflow-hidden rounded-lg border border-ink/10 bg-white text-left"
              >
                <div className="aspect-square bg-mist">
                  {item.imageDataUrl ? (
                    <GarmentImage src={item.imageDataUrl} alt={item.name} />
                  ) : null}
                </div>
                <p className="truncate p-1.5 text-[11px] font-medium">{item.name}</p>
              </button>
            ))}
            {selectedItems.length === 0 ? <p className="text-sm text-ink/48">还没有选择衣物</p> : null}
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => onGeneratePreview(selectedItemIds)}
              disabled={isPreviewGenerating || selectedItems.length === 0}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-moss text-sm font-semibold text-white disabled:opacity-55"
            >
              <WandSparkles size={16} className={isPreviewGenerating ? "animate-pulse" : undefined} aria-hidden="true" />
              {isPreviewGenerating ? "生成中" : "生成穿着预览"}
            </button>
          </div>
          {previewImageDataUrl ? (
            <motion.button
              type="button"
              onClick={() => onExpandImage({ src: previewImageDataUrl, alt: "穿着预览" })}
              className="mt-3 block aspect-square w-full overflow-hidden rounded-lg bg-white"
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: duration.normal }}
            >
              <GarmentImage src={previewImageDataUrl} alt="穿着预览" />
            </motion.button>
          ) : isPreviewGenerating ? (
            <MotionShimmer className="mt-3 aspect-square w-full rounded-lg" />
          ) : null}
          <AiTaskProgressCard
            label={tryonProgress.label}
            stage={tryonProgress.stage}
            progress={tryonProgress.percent}
            visible={tryonProgress.visible}
          />
        </section>

        {displayOutfits.length > 0 ? (
          <section className="surface rounded-lg p-4 overflow-hidden">
            <h2 className="text-base font-semibold">已收藏套装</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {displayOutfits.slice(0, 6).map((outfit) => {
                // v0.9.42-dev C-1: 套装卡片三点菜单 anchor ref, 传给 MotionPopoverMenu 算 portal 位置
                const outfitMenuAnchorRef = getOutfitMenuAnchorRef(outfit.id);
                // v0.9.44-dev 问题 1: 菜单打开时给当前卡片加弱高亮
                const isOutfitMenuOpen = savedOutfitMenuId === outfit.id;
                return (
                <article key={outfit.id} className={`rounded-lg border bg-white p-2 text-left hover:border-denim/30 transition-shadow ${isOutfitMenuOpen ? "border-ink/25 ring-1 ring-ink/15 bg-mist/40" : "border-ink/10"}`}>
                  <button type="button" onClick={() => { setViewingSavedOutfitId(outfit.id); setViewingOutfitItem(null); }} className="block w-full text-left">
                    <div className="aspect-square overflow-hidden rounded-md bg-mist">
                      <OutfitCover outfit={outfit} items={items} size="card" className="h-full w-full" />
                    </div>
                  </button>
                  <div className="mt-2 flex items-start gap-1">
                    <button type="button" onClick={() => { setViewingSavedOutfitId(outfit.id); setViewingOutfitItem(null); }} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-xs font-semibold">{outfit.name}</p>
                      <p className="truncate text-[11px] text-ink/45">{outfit.itemIds.length} 件</p>
                    </button>
                    <div className="relative shrink-0">
                      <motion.button
                        ref={(el: HTMLButtonElement | null) => { outfitMenuAnchorRef.current = el; }}
                        type="button"
                        aria-label="打开套装操作菜单"
                        onClick={(event: React.MouseEvent) => { event.stopPropagation(); setSavedOutfitMenuId((current) => current === outfit.id ? null : outfit.id); }}
                        className="grid h-11 w-11 place-items-center rounded-md text-ink/40 hover:bg-ink/5"
                        whileTap={{ scale: 0.9 }}
                        transition={spring.snappy}
                      >
                        <MoreHorizontal size={15} />
                      </motion.button>
                      <MotionPopoverMenu visible={savedOutfitMenuId === outfit.id} onClose={() => setSavedOutfitMenuId(null)} anchorRef={outfitMenuAnchorRef}>
                        <button type="button" onClick={() => removeSavedOutfit(outfit.id)} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50">取消收藏</button>
                      </MotionPopoverMenu>
                    </div>
                  </div>
                </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      <div className="grid gap-3 min-w-0">
        {weatherInsight ? (
          <div className="rounded-lg border border-denim/12 bg-white p-3 text-xs text-ink/60">
            天气参考：{weatherInsight.summary}，约 {weatherInsight.temperatureC}度
            <span className="ml-2 rounded-md bg-mist px-1.5 py-0.5 text-[10px] text-ink/45">
              {weatherInsight.source === "forecast" ? "实时" : weatherInsight.source === "confirmed" ? "手动确认" : "待确认"}
            </span>
          </div>
        ) : null}

        {recommendations.length === 0 ? (
          isRecommending ? (
            <div className="surface rounded-lg p-3">
              <AiTaskProgressCard
                label={recProgress.label}
                stage={recProgress.stage}
                progress={recProgress.percent}
                visible
              />
            </div>
          ) : (
            <div className="surface rounded-lg p-6">
              <h2 className="text-xl font-semibold">等待推荐</h2>
              <p className="mt-1 text-sm text-ink/60">点击“AI搭配推荐”填写目的地、日期、活动和风格后生成。</p>
            </div>
          )
        ) : null}
        {recommendations.map((recommendation, ri) => (
          <motion.article
            key={recommendation.id}
            className="rounded-lg border border-ink/10 bg-white p-4 shadow-sm"
            variants={staggerReveal}
            initial="initial"
            animate="in"
            transition={{ duration: duration.normal, delay: Math.min(ri * 0.05, 0.3) }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{recommendation.title}</h2>
                <p className="mt-1 text-xs text-ink/54">
                  评分 {recommendation.score}{recommendation.confidence !== undefined ? ` · 置信度 ${Math.round(recommendation.confidence * 100)}%` : ""}
                </p>
              </div>
              <button type="button" onPointerDown={() => blurActiveElement()} onClick={() => applyRecommendation(recommendation)} className="rounded-lg bg-denim/10 px-2.5 py-1 text-xs font-semibold text-denim">
                采用这套
              </button>
            </div>

            {recommendation.sceneFit ? (
              <p className="mt-3 rounded-lg bg-denim/6 px-3 py-2 text-xs leading-relaxed text-denim">{recommendation.sceneFit}</p>
            ) : null}

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {recommendation.slots.map((slot) => (
                <button
                  type="button"
                  key={`${recommendation.id}-${slot.role}-${slot.item.id}`}
                  onClick={() => onExpandImage({ src: slot.item.imageDataUrl, alt: slot.item.name })}
                  className="rounded-lg bg-mist p-2 text-left"
                >
                  <div className="aspect-square overflow-hidden rounded-md bg-white">
                    {slot.item.imageDataUrl ? (
                      <GarmentImage src={slot.item.imageDataUrl} alt={slot.item.name} />
                    ) : null}
                  </div>
                  <p className="mt-2 truncate text-xs font-semibold">{slot.role}</p>
                  <p className="truncate text-xs text-ink/58">{slot.item.name}</p>
                  {slot.why ? <p className="line-clamp-2 text-[11px] text-ink/42">{slot.why}</p> : null}
                  <p className="truncate text-[11px] text-ink/45">{locationNameById[slot.item.locationId] ?? slot.item.locationId}</p>
                </button>
              ))}
            </div>

            <div className="mt-3 grid gap-2 text-xs text-ink/64">
              {recommendation.reasons.map((reason) => (
                <p key={reason}>· {reason}</p>
              ))}
              {recommendation.missingItems.map((missing) => (
                <p key={missing} className="text-clay">· {missing}</p>
              ))}
              {recommendation.packingReminders.map((reminder) => (
                <p key={reminder} className="text-denim">· {reminder}</p>
              ))}
              {(recommendation.stylingTips ?? []).map((tip) => (
                <p key={tip} className="text-moss">· {tip}</p>
              ))}
              {(recommendation.reuseOutfitIds ?? []).length > 0 ? (
                <p className="text-ink/45">· 可复用：{(recommendation.reuseOutfitIds ?? []).map((id) => displayOutfits.find((outfit) => outfit.id === id)?.name).filter(Boolean).join("、") || "已有收藏套装"}</p>
              ) : null}
              {(recommendation.avoidItems ?? []).slice(0, 3).map((avoid) => {
                const avoided = items.find((item) => item.id === avoid.itemId);
                return <p key={`${avoid.itemId}-${avoid.reason}`} className="text-clay">· 不建议 {avoided?.name ?? "某件衣物"}：{avoid.reason}</p>;
              })}
            </div>
          </motion.article>
        ))}
      </div>

      <MotionSheet open={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} panelClassName="!max-w-lg">
        <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">AI搭配推荐</h2>
              <button type="button" onClick={() => setIsAiModalOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg border border-ink/10 bg-white">
                ×
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm font-medium">
                目的地
                <input
                  value={request.destination}
                  onChange={(event) => setRequest((current) => ({ ...current, destination: event.target.value }))}
                  className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
                  placeholder="例如 成都旅行 / 新餐厅"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                日期
                <input
                  type="date"
                  value={request.date}
                  onChange={(event) => setRequest((current) => ({ ...current, date: event.target.value }))}
                  className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">
                  天气确认
                  <select
                    value={request.weather}
                    onChange={(event) => setRequest((current) => ({ ...current, weather: event.target.value as OutfitRequest["weather"] }))}
                    className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
                  >
                    <option value="sunny">晴</option>
                    <option value="cloudy">多云</option>
                    <option value="rainy">雨</option>
                    <option value="windy">风大</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  温度 °C
                  <input
                    type="number"
                    value={request.temperatureC}
                    onChange={(event) => setRequest((current) => ({ ...current, temperatureC: Number(event.target.value) || 23 }))}
                    className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
                  />
                </label>
              </div>
              <p className="rounded-lg bg-denim/6 px-3 py-2 text-xs leading-relaxed text-ink/54">
                开启 AI 时会优先获取实时天气；获取失败时使用这里手动确认的天气和温度。
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">
                  活动
                  <select
                    value={request.activity}
                    onChange={(event) => { const v = event.target.value; if (v === "__custom__") { setShowCustomActivity(true); setRequest((c) => ({ ...c, activity: v })); } else { setShowCustomActivity(false); setRequest((c) => ({ ...c, activity: v })); } }}
                    className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
                  >
                    {activityChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>{choice.label}</option>
                    ))}
                    <option value="__custom__">新增自定义活动</option>
                  </select>
                  {request.activity === "__custom__" || showCustomActivity ? (
                    <div className="flex gap-2 mt-2">
                      <input value={customActivity} onChange={(e) => setCustomActivity(e.target.value)} placeholder="输入自定义活动" className="flex-1 h-9 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim" />
                      <button type="button" onClick={confirmCustomActivity} className="h-9 px-3 rounded-lg bg-denim text-xs font-semibold text-white">确认</button>
                    </div>
                  ) : null}
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  风格
                  <select
                    value={request.stylePreference}
                    onChange={(event) => { const v = event.target.value; if (v === "__custom__") { setShowCustomStyle(true); setRequest((c) => ({ ...c, stylePreference: v })); } else { setShowCustomStyle(false); setRequest((c) => ({ ...c, stylePreference: v })); } }}
                    className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
                  >
                    {styleChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>{choice.label}</option>
                    ))}
                    <option value="__custom__">新增自定义风格</option>
                  </select>
                  {request.stylePreference === "__custom__" || showCustomStyle ? (
                    <div className="flex gap-2 mt-2">
                      <input value={customStyle} onChange={(e) => setCustomStyle(e.target.value)} placeholder="输入自定义风格" className="flex-1 h-9 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim" />
                      <button type="button" onClick={confirmCustomStyle} className="h-9 px-3 rounded-lg bg-denim text-xs font-semibold text-white">确认</button>
                    </div>
                  ) : null}
                </label>
              </div>
              <div className="grid gap-2">
                <span className="text-sm font-medium">可用衣橱</span>
                {locations.map((location) => (
                  <label key={location.id} className="flex min-h-10 items-center gap-3 rounded-lg border border-ink/10 bg-white px-3 text-sm">
                    <input
                      type="checkbox"
                      checked={request.availableLocationIds.includes(location.id)}
                      onChange={() =>
                        setRequest((current) => ({
                          ...current,
                          availableLocationIds: toggle(current.availableLocationIds, location.id),
                        }))
                      }
                      className="h-4 w-4 accent-denim"
                    />
                    {location.name}
                  </label>
                ))}
              </div>
              <label className="flex min-h-10 items-center gap-3 rounded-lg border border-ink/10 bg-white px-3 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={useAiRecommendations}
                  onChange={(event) => setUseAiRecommendations(event.target.checked)}
                  className="h-4 w-4 accent-denim"
                />
                优先大模型推荐
              </label>
              <button
                type="button"
                onClick={submitAiRecommendation}
                disabled={isRecommending}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-denim text-sm font-semibold text-white disabled:opacity-65"
              >
                <Sparkles size={17} className={isRecommending ? "animate-pulse" : undefined} aria-hidden="true" />
                {isRecommending ? "生成中" : "生成推荐"}
              </button>
            </div>
      </MotionSheet>

      <MotionSheet open={!!outfitAllCategory} onClose={() => setOutfitAllCategory(null)} panelClassName="!max-w-lg">
        <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-base font-semibold">{outfitAllCategory ? CATEGORY_LABELS[outfitAllCategory] : ""}</h3>
              <button type="button" onClick={() => setOutfitAllCategory(null)} className="grid h-11 w-11 place-items-center rounded-lg border border-ink/10 bg-white">×</button>
            </div>
            <div className="flex gap-2 mb-3">
              <select value={outfitAllFilter} onChange={(e) => setOutfitAllFilter(e.target.value)} className="h-9 rounded-lg border border-ink/10 bg-white px-2 text-xs">
                <option value="all">全部地点</option>
                {locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </select>
              <input value={outfitAllQuery} onChange={(e) => setOutfitAllQuery(e.target.value)} placeholder="搜索名称、颜色、备注等" className="h-9 flex-1 rounded-lg border border-ink/10 bg-white px-3 text-xs outline-none focus:border-denim" />
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {activeItems.filter((item) => {
                if (item.category !== outfitAllCategory) return false;
                if (outfitAllFilter !== "all" && item.locationId !== outfitAllFilter) return false;
                if (outfitAllQuery) {
                  const haystack = [item.name, ...getAllColors(item.colors), item.notes||"", ...item.seasons, ...item.styles].join(" ").toLowerCase();
                  if (!haystack.includes(outfitAllQuery.toLowerCase())) return false;
                }
                return true;
              }).map((item) => {
                const selected = Boolean(item.id && selectedItemIds.includes(item.id));
                const SINGLE_LIMIT = (outfitAllCategory === "hats" || outfitAllCategory === "one_piece" || outfitAllCategory === "shoes");
                const selCount = activeItems.filter((i) => i.category === outfitAllCategory && i.id && selectedItemIds.includes(i.id)).length;
                return (
                  <button key={item.id} type="button" onClick={() => { if (item.id) { if (SINGLE_LIMIT && !selected && selCount >= 1) return; updateSelected(item.id); } }} className={`overflow-hidden rounded-lg border bg-white text-left ${selected ? "border-moss ring-1 ring-moss/30" : "border-ink/10"}`}>
                    <div className="aspect-square bg-mist relative">
                      {item.imageDataUrl ? (
                        <GarmentImage src={item.imageDataUrl} alt={item.name} />
                      ) : <div className="grid h-full place-items-center text-ink/30"><Shirt size={16} /></div>}
                      {selected ? (<div className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-moss text-white"><Check size={11} /></div>) : null}
                    </div>
                    <p className="truncate p-1.5 text-[11px] font-medium">{item.name}</p>
                  </button>
                );
              })}
            </div>
      </MotionSheet>

      <MotionSheet open={showOutfitSaveDialog} onClose={() => setShowOutfitSaveDialog(false)} panelClassName="!max-w-sm">
        <h3 className="text-base font-semibold mb-3">{editingOutfitId ? "保存当前套装" : "收藏当前套装"}</h3>
            <label className="grid gap-1 text-sm font-medium">
              套装名称
              <div className="flex gap-2">
                <input value={outfitSaveNameDraft} onChange={(e) => setOutfitSaveNameDraft(e.target.value)} className="flex-1 h-10 rounded-lg border border-ink/10 bg-white px-3 text-sm outline-none focus:border-denim" placeholder="输入套装名称" autoFocus />
                {(() => { const ms = loadMiniMaxSettings(); return hasDeviceMiniMaxKey(ms); })() ? (
                  <button type="button" onClick={async () => {
                    if (selectedItems.length === 0) return;
                    setIsGeneratingOutfitName(true);
                    try {
                      const ms = loadMiniMaxSettings();
                      const name = await withKeepAwake(() => generateOutfitNameOnDevice(
                        selectedItems.map((item) => ({ name: item.name, category: item.category, colors: item.colors, styles: item.styles })),
                        { destination: request.destination, activity: typeof request.activity === 'string' ? request.activity : "", stylePreference: typeof request.stylePreference === 'string' ? request.stylePreference : "" },
                        ms
                      ));
                      setOutfitSaveNameDraft(name);
                    } catch {
                      onMessage("AI 名称生成失败，请手动输入");
                    } finally {
                      setIsGeneratingOutfitName(false);
                    }
                  }} disabled={isGeneratingOutfitName} className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg border border-ink/10 bg-white px-3 text-sm font-medium disabled:opacity-55">
                    {isGeneratingOutfitName ? <><WandSparkles size={15} className="animate-pulse" />生成中</> : <><WandSparkles size={15} />AI名称</>}
                  </button>
                ) : null}
              </div>
            </label>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setShowOutfitSaveDialog(false)} className="h-10 rounded-lg border border-ink/10 text-sm">取消</button>
              <button type="button" onClick={() => {
                const name = outfitSaveNameDraft.trim() || `${request.destination || "手工套装"} · ${selectedItems.length} 件`;
                onSaveManualOutfit(selectedItemIds, { outfitId: editingOutfitId || undefined, name });
                setShowOutfitSaveDialog(false);
              }} className="h-10 rounded-lg bg-clay text-sm font-semibold text-white">确认保存</button>
            </div>
      </MotionSheet>

    </div>
  );
}

function ShoppingAdvisorView({
  items,
  outfits,
  locations,
  miniMaxSettings,
  tryOnProfile,
  onMessage,
  onExpandImage,
  onCapturePurchased,
  onUseForOutfit,
}: {
  items: WardrobeItem[];
  outfits: SavedOutfit[];
  locations: ClosetLocation[];
  miniMaxSettings: DeviceMiniMaxSettings;
  tryOnProfile: TryOnProfile;
  onMessage: (msg: string, type?: "success" | "error" | "info") => void;
  onExpandImage: (image: { src: string; alt: string }) => void;
  onCapturePurchased: () => void;
  onUseForOutfit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropJob, setCropJob] = useState<{ dataUrl: string; fileName: string } | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [userHint, setUserHint] = useState("");
  const [targetScene, setTargetScene] = useState("");
  const [analysis, setAnalysis] = useState<ShoppingImageAnalysis | null>(null);
  const [selectedTempIds, setSelectedTempIds] = useState<string[]>([]);
  const [assessment, setAssessment] = useState<ShoppingAssessment | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAssessing, setIsAssessing] = useState(false);
  const wishlistQueueProgress = useSoftAiProgress("shopping_image_analysis", { label: "AI 分析购物图片" });
  const assessProgress = useSoftAiProgress("shopping_assessment", { label: "AI 评估是否值得买" });

  useEffect(() => {
    if (!analysis && !assessment) return;
    hasSubPageRef.current = true;
    let removed = false;
    let handle: { remove: () => void } | null = null;
    App.addListener("backButton", () => {
      if (removed) return;
      if (assessment) { setAssessment(null); return; }
      if (analysis) { setAnalysis(null); setSelectedTempIds([]); return; }
    }).then((h) => { if (!removed) handle = h; });
    return () => { removed = true; handle?.remove(); hasSubPageRef.current = false; };
  }, [analysis, assessment]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!hasDeviceMiniMaxKey(miniMaxSettings)) {
      onMessage("请先在设置里配置 MiniMax Key", "info");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    try {
      if (isHeicFile(file)) onMessage("正在转换 HEIC 图片...", "info");
      const dataUrl = await fileToOriginalDataUrl(file);
      setCropJob({ dataUrl, fileName: file.name });
    } catch (error) {
      onMessage(getErrorMessage(error), "error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function analyzeCroppedImage(dataUrl: string) {
    setIsAnalyzing(true);
    setAssessment(null);
    setAnalysis(null);
    setSelectedTempIds([]);
    wishlistQueueProgress.start();
    try {
      setImageDataUrl(dataUrl);
      // dataUrl 是从原图裁切出的 (ImageCropEditor 内部调 cropFromOriginal), 走 v0.8.14 新链路,
      // 但 analyzeShoppingImageOnDevice 直传 MiniMax 需要 2400px 压缩图, 这里再自适应降级
      const croppedFile = await dataUrlToFile(dataUrl, "shopping-cropped.jpg").catch(() => null);
      const aiRequestDataUrl = croppedFile
        ? await fileToAiRequestDataUrl(croppedFile).catch(() => dataUrl)
        : dataUrl;
      const next = await withKeepAwake(() =>
        analyzeShoppingImageOnDevice(aiRequestDataUrl, miniMaxSettings, userHint),
      );
      wishlistQueueProgress.complete(true);
      setAnalysis(next);
      setSelectedTempIds(next.requiresUserSelection ? [] : next.candidates.slice(0, 1).map((candidate) => candidate.tempId));
      onMessage(next.requiresUserSelection ? "已识别候选，请选择要评估的单品" : "已识别单品，可以开始评估");
    } catch (error) {
      wishlistQueueProgress.fail(getErrorMessage(error));
      onMessage(getErrorMessage(error), "error");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function runAssessment() {
    if (!analysis) return;
    if (!hasDeviceMiniMaxKey(miniMaxSettings)) {
      onMessage("请先在设置里配置 MiniMax Key", "info");
      return;
    }
    const selected = analysis.candidates.filter((candidate) => selectedTempIds.includes(candidate.tempId));
    if (selected.length === 0) {
      onMessage("请先选择要评估的单品", "info");
      return;
    }
    setIsAssessing(true);
    assessProgress.start();
    try {
      const fn = selected.length > 1 ? assessShoppingOutfitOnDevice : assessShoppingItemOnDevice;
      const next = await withKeepAwake(() =>
        fn(selected, items, { targetScene, outfits, locations, tryOnProfile }, miniMaxSettings),
      );
      assessProgress.complete(true);
      setAssessment(next);
      onMessage("买前评估已生成");
    } catch (error) {
      assessProgress.fail(getErrorMessage(error));
      onMessage(getErrorMessage(error), "error");
    } finally {
      setIsAssessing(false);
    }
  }

  function toggleCandidate(tempId: string) {
    setSelectedTempIds((current) => toggle(current, tempId));
  }

  const selectedCandidates = analysis?.candidates.filter((candidate) => selectedTempIds.includes(candidate.tempId)) ?? [];

  return (
    <div className="grid gap-4">
      <section className="surface rounded-lg p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShoppingBag size={20} className="text-clay" aria-hidden="true" />
              <h2 className="text-lg font-semibold">买前评估</h2>
            </div>
            <p className="mt-1 text-sm text-ink/58">淘宝图、商品截图或线下试穿自拍，先判断重复度和适用场景。</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            目标场景
            <input
              value={targetScene}
              onChange={(event) => setTargetScene(event.target.value)}
              className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
              placeholder="例如 公司年会 / 周末去酒吧 / 三亚旅行"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            图片说明 <span className="font-normal text-ink/40">（选填）</span>
            <input
              value={userHint}
              onChange={(event) => setUserHint(event.target.value)}
              className="h-10 rounded-lg border border-ink/10 bg-white px-3 text-sm outline-none focus:border-denim"
              placeholder="例如 淘宝截图，只想看外套"
            />
          </label>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isAnalyzing}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-denim text-sm font-semibold text-white disabled:opacity-65"
          >
            <Upload size={17} />
            {isAnalyzing ? "分析图片中" : "上传图片评估"}
          </button>
        </div>
      </section>

      <AnimatePresence initial={false}>
        {imageDataUrl ? (
          <motion.section
            key="preview"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: ease.app }}
            className="surface rounded-lg p-3"
          >
            <button type="button" onClick={() => onExpandImage({ src: imageDataUrl, alt: "买前评估图片" })} className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-white">
              <GarmentImage src={imageDataUrl} alt="买前评估图片" />
            </button>
            {analysis ? (
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-ink/58">
                <span className="rounded-md bg-mist px-2 py-1">{analysis.sourceSummary}</span>
                <span className="rounded-md bg-denim/10 px-2 py-1 text-denim">{analysis.requiresUserSelection ? "需要选择单品" : "单品图"}</span>
              </div>
            ) : null}
          </motion.section>
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        {isAnalyzing ? (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: ease.app }}
          >
            <AiTaskProgressCard
              label={wishlistQueueProgress.label}
              stage={wishlistQueueProgress.stage}
              progress={wishlistQueueProgress.percent}
              visible={wishlistQueueProgress.visible}
            />
          </motion.div>
        ) : null}

        {analysis && !isAssessing && !assessment ? (
          <motion.section
            key="analysis"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: ease.app }}
            className="surface rounded-lg p-4"
          >
            <h3 className="text-base font-semibold">选择要评估的单品</h3>
            <p className="mt-1 text-xs text-ink/50">套装或截图不会自动入库，请勾选真正想买或想评估的单品。</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {analysis.candidates.map((candidate) => {
                const selected = selectedTempIds.includes(candidate.tempId);
                return (
                  <button
                    key={candidate.tempId}
                    type="button"
                    onClick={() => toggleCandidate(candidate.tempId)}
                    className={`overflow-hidden rounded-lg border bg-white text-left ${selected ? "border-moss ring-1 ring-moss/40" : "border-ink/10"}`}
                  >
                    <div className="relative aspect-square bg-mist">
                      <GarmentImage src={candidate.imageDataUrl || imageDataUrl} alt={candidate.name} fallbackSize={20} />
                      {selected ? <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-moss text-white"><Check size={13} /></span> : null}
                    </div>
                    <div className="grid gap-1 p-2">
                      <p className="truncate text-xs font-semibold">{candidate.name}</p>
                      <p className="truncate text-[11px] text-ink/50">{CATEGORY_LABELS[candidate.category]} · {getAllColors(candidate.colors).join("、") || "颜色待确认"}</p>
                      <p className="text-[10px] text-ink/38">置信度 {Math.round(candidate.confidence * 100)}%</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {analysis.warnings.length > 0 ? (
              <div className="mt-3 grid gap-1 text-xs text-clay">
                {analysis.warnings.map((warning) => <p key={warning}>· {warning}</p>)}
              </div>
            ) : null}
            <button
              type="button"
              onClick={runAssessment}
              disabled={isAssessing || selectedCandidates.length === 0}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-clay text-sm font-semibold text-white disabled:opacity-60"
            >
              <WandSparkles size={16} className={isAssessing ? "animate-pulse" : undefined} />
              {isAssessing ? "评估中" : `评估 ${selectedCandidates.length} 件`}
            </button>
          </motion.section>
        ) : null}

        {isAssessing ? (
          <motion.div
            key="assessing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: ease.app }}
          >
            <AiTaskProgressCard
              label={assessProgress.label}
              stage={assessProgress.stage}
              progress={assessProgress.percent}
              visible={assessProgress.visible}
            />
          </motion.div>
        ) : null}

        {assessment ? (
          <motion.div
            key="assessment"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: ease.app }}
          >
            <ShoppingAssessmentResult
              assessment={assessment}
              candidates={selectedCandidates}
              items={items}
              onCapturePurchased={onCapturePurchased}
              onUseForOutfit={onUseForOutfit}
              onMessage={onMessage}
              onResetSelection={() => { setAssessment(null); setSelectedTempIds([]); }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {cropJob && (
        <ImageCropEditor
          source={cropJob.dataUrl}
          aspectRatio="free"
          onCancel={() => setCropJob(null)}
          onError={(error) => onMessage(error, "error")}
          onConfirm={async (croppedDataUrl) => {
            setCropJob(null);
            await analyzeCroppedImage(croppedDataUrl);
          }}
        />
      )}
    </div>
  );
}

function ShoppingAssessmentResult({
  assessment,
  candidates,
  items,
  onCapturePurchased,
  onUseForOutfit,
  onMessage,
  onResetSelection,
}: {
  assessment: ShoppingAssessment;
  candidates: ShoppingAssessmentCandidate[];
  items: WardrobeItem[];
  onCapturePurchased: () => void;
  onUseForOutfit: () => void;
  onMessage: (msg: string, type?: "success" | "error" | "info") => void;
  onResetSelection: () => void;
}) {
  const conclusionTone =
    assessment.conclusion === "值得买" ? "bg-moss text-white" :
    assessment.conclusion === "不建议买" ? "bg-red-600 text-white" :
    "bg-clay text-white";
  return (
    <section className="surface rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`inline-flex rounded-lg px-3 py-1 text-sm font-semibold ${conclusionTone}`}>{assessment.conclusion}</span>
          <h3 className="mt-3 text-lg font-semibold">{assessment.summary}</h3>
          <p className="mt-1 text-xs text-ink/50">综合评分 {assessment.overallScore}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <ResultBlock title="购买理由" items={assessment.purchaseReasoning} />
        <div className="rounded-lg bg-white p-3">
          <p className="text-xs font-semibold text-ink/70">重复度</p>
          <p className="mt-1 text-sm text-ink/60">{assessment.duplicateAssessment.summary}</p>
          {assessment.duplicateAssessment.similarItems.length > 0 ? (
            <div className="mt-2 grid gap-2">
              {assessment.duplicateAssessment.similarItems.slice(0, 4).map((similar) => {
                const item = items.find((wardrobeItem) => wardrobeItem.id === similar.itemId);
                return (
                  <div key={`${similar.candidateTempId}-${similar.itemId}`} className="flex items-center gap-2 rounded-lg bg-mist p-2">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-white">
                      <GarmentImage src={item?.imageDataUrl || undefined} alt={item?.name || "相似款"} fallbackSize={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{item?.name || "衣橱相似款"}</p>
                      <p className="line-clamp-2 text-[11px] text-ink/50">{similar.reason}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        {assessment.candidateAssessments.length > 0 ? (
          <div className="rounded-lg bg-white p-3">
            <p className="text-xs font-semibold text-ink/70">单品判断</p>
            <div className="mt-2 grid gap-2">
              {assessment.candidateAssessments.map((candidateAssessment) => {
                const candidate = candidates.find((item) => item.tempId === candidateAssessment.tempId);
                return (
                  <div key={candidateAssessment.tempId} className="rounded-lg border border-ink/8 bg-mist/60 p-2">
                    <p className="text-xs font-semibold">{candidate?.name || "候选单品"} · {candidateAssessment.singleConclusion}</p>
                    {candidateAssessment.wardrobeGapFit ? <p className="mt-1 text-[11px] text-ink/55">{candidateAssessment.wardrobeGapFit}</p> : null}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {candidateAssessment.risks.slice(0, 3).map((risk) => <span key={risk} className="rounded-md bg-clay/10 px-1.5 py-0.5 text-[10px] text-clay">{risk}</span>)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        {assessment.outfitCompatibility.applies ? (
          <div className="rounded-lg bg-white p-3">
            <p className="text-xs font-semibold text-ink/70">整套适配</p>
            <p className="mt-1 text-sm text-ink/60">{assessment.outfitCompatibility.summary}</p>
          </div>
        ) : null}
        {assessment.recommendedOutfits.length > 0 ? (
          <div className="rounded-lg bg-white p-3">
            <p className="text-xs font-semibold text-ink/70">可搭配方案</p>
            <div className="mt-2 grid gap-2">
              {assessment.recommendedOutfits.map((outfit) => (
                <div key={outfit.title} className="rounded-lg bg-mist p-2">
                  <p className="text-xs font-semibold">{outfit.title}</p>
                  <p className="text-[11px] text-ink/50">{outfit.scene}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {outfit.slots.slice(0, 6).map((slot, index) => {
                      const wardrobe = slot.itemId ? items.find((item) => item.id === slot.itemId) : null;
                      const candidate = slot.tempId ? candidates.find((item) => item.tempId === slot.tempId) : null;
                      return <span key={`${slot.role}-${index}`} className="rounded-md bg-white px-1.5 py-0.5 text-[10px] text-ink/60">{slot.role}：{candidate?.name || wardrobe?.name || "待补充"}</span>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="rounded-lg bg-white p-3">
          <p className="text-xs font-semibold text-ink/70">目标场景判断</p>
          <p className="mt-1 text-sm text-ink/60">{assessment.targetSceneAssessment.reason || "未输入具体目标场景"}</p>
          {assessment.targetSceneAssessment.adjustments.length > 0 ? (
            <div className="mt-2 grid gap-1 text-xs text-denim">
              {assessment.targetSceneAssessment.adjustments.map((adjustment) => <p key={adjustment}>· {adjustment}</p>)}
            </div>
          ) : null}
        </div>
        <ResultBlock title="风险提醒" items={assessment.risks} tone="clay" />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={() => onMessage("已加入本次待购清单（临时展示，不写入正式衣橱）")} className="h-10 rounded-lg border border-ink/10 bg-white text-sm font-semibold">加入待购清单</button>
        <button type="button" onClick={onUseForOutfit} className="h-10 rounded-lg border border-denim/20 bg-denim/10 text-sm font-semibold text-denim">用这件生成搭配</button>
        <button type="button" onClick={onCapturePurchased} className="h-10 rounded-lg bg-denim text-sm font-semibold text-white">确认购买后录入衣橱</button>
        <button type="button" onClick={onResetSelection} className="h-10 rounded-lg border border-ink/10 bg-white text-sm font-semibold sm:col-span-3">重新选择单品</button>
      </div>
    </section>
  );
}

function ResultBlock({ title, items, tone = "ink" }: { title: string; items: string[]; tone?: "ink" | "clay" }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg bg-white p-3">
      <p className="text-xs font-semibold text-ink/70">{title}</p>
      <div className={`mt-2 grid gap-1 text-xs ${tone === "clay" ? "text-clay" : "text-ink/58"}`}>
        {items.slice(0, 6).map((item) => <p key={item}>· {item}</p>)}
      </div>
    </div>
  );
}

function BackupProgressSheet({
  state,
  onClose,
  onPickLtbFile,
  onConfirmRestore,
}: {
  state: BackupOperationState | null;
  onClose: () => void;
  onPickLtbFile?: (file: LongTermBackupFileEntry) => void;
  onConfirmRestore?: () => void;
}) {
  if (!state) return null;

  const isBusy = state.phase === "exporting" || state.phase === "scanning" || state.phase === "reading" || state.phase === "restoring";
  const isDone = state.phase === "success" || state.phase === "failed";
  const canClose = isDone || state.phase === "backup_list" || state.phase === "awaiting_confirmation";

  const title =
    state.phase === "awaiting_confirmation" ? "确认恢复长期备份" :
    state.phase === "backup_list" ? "选择长期备份" :
    state.phase === "success" ? state.title :
    state.phase === "failed" ? state.title :
    state.title;

  const errorMsg = state.phase === "failed" ? state.error : undefined;
  const showProgress = isBusy || isDone;
  const statusText =
    state.phase === "failed" ? state.error :
    state.phase === "awaiting_confirmation" ? "恢复会覆盖当前衣橱数据，确认继续？" :
    state.phase === "backup_list" ? "点击一个备份文件继续" :
    state.status;

  const progress = isBusy ? state.progress : (isDone ? 100 : 0);
  const completed = isDone;
  const resultLabel = state.phase === "success" ? state.resultLabel : undefined;
  const preview = state.phase === "awaiting_confirmation" ? state.preview : undefined;
  const files = state.phase === "backup_list" ? state.files : [];

  return (
    <MotionSheet open={!!state} onClose={() => { if (canClose) onClose(); }} panelClassName="sm:max-w-md">
      <div className="grid gap-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg ${errorMsg ? "bg-red-50 text-red-500" : completed ? "bg-denim/10 text-denim" : "bg-clay/10 text-clay"}`}>
            {errorMsg ? <Trash2 size={18} aria-hidden="true" /> : completed ? <Check size={18} aria-hidden="true" /> : state.phase === "backup_list" ? <FileJson size={18} aria-hidden="true" /> : <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold">{title}</h3>
            {statusText ? (
              <p className={`mt-1 text-sm leading-relaxed ${errorMsg ? "text-red-500" : "text-ink/60"}`}>{statusText}</p>
            ) : null}
          </div>
        </div>

        {showProgress ? (
          <div className="grid gap-2">
            <div className="h-2.5 overflow-hidden rounded-full bg-mist">
              <div
                className={`h-full rounded-full transition-all duration-300 ${errorMsg ? "bg-red-400" : "bg-denim"}`}
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-ink/45">
              <span>{completed ? (errorMsg ? "失败" : "完成") : "处理中"}</span>
              <span>{Math.round(Math.max(0, Math.min(100, progress)))}%</span>
            </div>
          </div>
        ) : null}

        {resultLabel ? (
          <div className="rounded-lg border border-ink/10 bg-white p-3">
            <p className="text-xs font-semibold text-ink/50">结果</p>
            <p className="mt-1 break-all whitespace-pre-line text-sm font-medium text-ink/75">{resultLabel}</p>
          </div>
        ) : null}

        {state.phase === "backup_list" && files.length > 0 ? (
          <div className="grid gap-2">
            {files.map((file) => (
              <button
                key={file.name}
                type="button"
                onClick={() => onPickLtbFile?.(file)}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-ink/10 bg-white px-3 py-2 text-left hover:border-denim/30"
              >
                <FileJson size={18} className="shrink-0 text-denim" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-normal break-all text-sm font-semibold">{file.name}{file.isLatest ? "（最新）" : ""}</span>
                  <span className="mt-0.5 block text-xs text-ink/45">{(file.size / 1024).toFixed(1)} KB · {new Date(file.mtime).toLocaleString("zh-CN")}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-ink/35" aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}

        {preview ? (
          <div className="rounded-lg border border-ink/10 bg-white p-3 text-sm text-ink/70">
            <p className="text-xs font-semibold text-ink/50">即将恢复</p>
            <p className="mt-1 break-all text-sm font-semibold text-ink/80">{preview.fileName}</p>
            <p className="mt-1 text-xs text-ink/55">导出时间：{preview.exportedAt ? new Date(preview.exportedAt).toLocaleString("zh-CN") : "未知"}</p>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-ink/60">
              <span>衣物：{preview.itemCount} 件</span>
              <span>套装：{preview.outfitCount} 套</span>
              <span>种草：{preview.wishlistCount} 件</span>
              <span>计划：{preview.planCount} 条</span>
              <span>旅行计划：{preview.travelPlanCount} 条</span>
              <span>打包清单：{preview.packingCount} 项</span>
              <span>图片：{preview.imageCount} 张</span>
            </div>
          </div>
        ) : null}

        {canClose ? (
          <div className="grid gap-2">
            {state.phase === "awaiting_confirmation" ? (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={onClose} className="h-10 rounded-lg border border-ink/10 bg-white text-sm font-semibold">
                  取消
                </button>
                <button type="button" onClick={onConfirmRestore} className="h-10 rounded-lg bg-denim text-sm font-semibold text-white">
                  确认恢复
                </button>
              </div>
            ) : state.phase === "backup_list" ? (
              <button type="button" onClick={onClose} className="h-10 rounded-lg bg-denim text-sm font-semibold text-white">
                关闭
              </button>
            ) : (
              <button type="button" onClick={onClose} className="h-10 rounded-lg bg-denim text-sm font-semibold text-white">
                {state.phase === "success" ? "完成" : "关闭"}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </MotionSheet>
  );
}

type SettingSubPage = null | "profile" | "photos" | "minimax" | "wardrobes";

const FIT_GENDER_LABELS: Record<FitGender, string> = {
  menswear: "男装版型",
  womenswear: "女装版型",
  unisex: "中性风格",
  unspecified: "不限定",
};

const FIT_GENDER_OPTIONS: FitGender[] = ["menswear", "womenswear", "unisex", "unspecified"];

const BODY_TYPE_LABELS: Record<NonNullable<TryOnProfile["bodyType"]>, string> = {
  slim: "偏瘦",
  balanced: "匀称",
  curvy: "曲线感",
  plus: "丰满",
  custom: "自定义",
};

const SHOULDER_LABELS: Record<NonNullable<TryOnProfile["shoulderWidth"]>, string> = {
  narrow: "偏窄",
  normal: "正常",
  wide: "偏宽",
};

const LEG_RATIO_LABELS: Record<NonNullable<TryOnProfile["legRatio"]>, string> = {
  short: "偏短",
  normal: "正常",
  long: "偏长",
};

function tryOnProfileCompleteness(profile: TryOnProfile): number {
  // 用于在摘要卡判定"画像是否很少"。返回 0-1 占比。
  const fields: Array<unknown> = [
    profile.fitGender && profile.fitGender !== "unspecified" ? profile.fitGender : null,
    profile.heightCm,
    profile.bodyType,
    profile.shoulderWidth,
    profile.legRatio,
    profile.hairDescription,
    profile.skinToneDescription,
    profile.styleNote,
  ];
  const filled = fields.filter((f) => f != null && (typeof f !== "string" || f.trim().length > 0)).length;
  return filled / fields.length;
}

function profileSummaryChips(profile: TryOnProfile): { label: string; value: string }[] {
  const chips: { label: string; value: string }[] = [];
  if (profile.fitGender && profile.fitGender !== "unspecified") {
    chips.push({ label: "版型倾向", value: FIT_GENDER_LABELS[profile.fitGender] });
  }
  if (profile.heightCm) chips.push({ label: "身高", value: `${profile.heightCm} cm` });
  if (profile.bodyType) {
    chips.push({ label: "体型", value: profile.bodyType === "custom" ? (profile.bodyTypeCustom?.trim() || "自定义") : BODY_TYPE_LABELS[profile.bodyType] });
  }
  if (profile.shoulderWidth) chips.push({ label: "肩宽", value: SHOULDER_LABELS[profile.shoulderWidth] });
  if (profile.legRatio) chips.push({ label: "腿长比例", value: LEG_RATIO_LABELS[profile.legRatio] });
  if (profile.hairDescription?.trim()) chips.push({ label: "发型", value: profile.hairDescription.trim() });
  if (profile.skinToneDescription?.trim()) chips.push({ label: "肤色", value: profile.skinToneDescription.trim() });
  if (profile.styleNote?.trim()) chips.push({ label: "其他备注", value: profile.styleNote.trim() });
  return chips;
}

function tryOnPhotosCount(profile: TryOnProfile): number {
  return [profile.fullBodyImageDataUrl, profile.faceImageDataUrl].filter(Boolean).length;
}

/**
 * v0.9.30-dev: 内部 SettingsSwitch — 修复 v0.9.29-dev 之前两处 inline 开关
 * (SettingsView "AI 试穿参考照片" 摘要卡 + PhotosDetailPage "使用参考照生成试穿图")
 * 的 thumb 位置 bug。
 *
 * 原 bug 根因：
 *   原代码用 `<button class="relative h-6 w-11 ..."><span class="absolute top-0.5
 *   h-5 w-5 ... translate-x-0.5" /></button>`。
 *   浏览器对 `<button>` 的默认 `text-align: center`，导致内联 span 在 button 内的
 *   "static position"（即 `position: absolute; left: auto; right: auto` 时的回退
 *   锚点）落在 button 内容区**中心**而非左侧 —— 关闭态 thumb 实际渲染在 button
 *   右半部分，translate-x-5 (on) 时直接飞出右侧轨道（实测 thumb 右边超过 button
 *   右边 18px, 完全溢出, 视觉上像 "继续向右飞"）。
 *
 * 修法：
 *   thumb 加显式 `left-0.5` 锚定到 button 左侧边距，translate-x-{0,5} 控制开/关
 *   滑动。off=translate-x-0 (thumb 在最左), on=translate-x-5 (thumb 滑到最右, 不溢出)。
 *   保留 h-6 w-11 现有视觉尺寸，不扩大改动范围（user prompt 明确 "不要扩大改动范围"）。
 *   44px 触控目标 (h-11) 在 SettingsView / PhotosDetailPage 的卡片里通过父级
 *   `flex items-start justify-between` + 子卡片已有 `py-3.5` padding 已经间接
 *   提供, 不需要再扩 button 尺寸。
 */
function SettingsSwitch({
  checked,
  onChange,
  ariaLabel,
  className = "",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 rounded-full transition-colors ${
        checked ? "bg-denim" : "bg-ink/20"
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function SettingsView({
  items,
  locations,
  outfits,
  wishlistItems,
  activeView,
  route,
	  miniMaxSettings,
	  onSaveMiniMaxSettings,
	  onExport,
	  onOpenBackupFolder,
	  onSaveAs,
	  onPickFile,
	  isBackupBusy,
	  onAddWardrobe,
  onUpdateWardrobe,
  onDeleteWardrobe,
  tryOnProfile,
  onSaveTryOnProfile,
  onClearAllData,
  isClearingAll,
  isClearingAllRef,
  setIsClearingAll,
  onMessage,
  onExpandImage,
  onRefreshState,
}: {
  items: WardrobeItem[];
  locations: ClosetLocation[];
  outfits: SavedOutfit[];
  wishlistItems: WishlistItem[];
  activeView: ViewKey;
  route: AppRoute;
	  miniMaxSettings: DeviceMiniMaxSettings;
	  onSaveMiniMaxSettings: (settings: DeviceMiniMaxSettings) => void;
	  onExport: () => void;
	  onOpenBackupFolder: () => void;
	  onSaveAs: () => void;
	  onPickFile: () => void;
	  isBackupBusy: boolean;
	  onAddWardrobe: (name: string, note: string) => Promise<void>;
  onUpdateWardrobe: (id: string, name: string, note: string) => Promise<void>;
  onDeleteWardrobe: (id: string, action: { mode: "migrate"; targetLocationId: string } | { mode: "delete_items" }) => Promise<void>;
  tryOnProfile: TryOnProfile;
  onSaveTryOnProfile: (profile: TryOnProfile) => Promise<void>;
  onClearAllData: () => Promise<void>;
  // v0.9.24-dev (subagent I-2/I-3 修复): onClearAllData 状态 lift 到 WardrobeApp 级,
  // isClearingAll 驱动 UI disabled + spinner, isClearingAllRef 供 click handler
  // 和 SettingsView 自身 backButton handler 同步守卫 (避免 React state 闭包过期值双触发 race)。
  isClearingAll: boolean;
  isClearingAllRef: React.MutableRefObject<boolean>;
  setIsClearingAll: (v: boolean) => void;
  onMessage?: (msg: string) => void;
  onExpandImage?: (img: { src: string; alt: string }) => void;
  /** v0.9.44-dev 问题 2: 让 backfill 写回后能触发父级 refreshState 重读 Dexie, 更新 items prop */
  onRefreshState?: () => Promise<void> | void;
}) {
  // v0.9.22: SettingsView 内部子页面路由 (null = 首页, "profile" / "photos" / "minimax" / "wardrobes" = 子页)
  const [subPage, setSubPage] = useState<SettingSubPage>(null);
  const [showAddWardrobe, setShowAddWardrobe] = useState(false);
  const [editWardrobeTarget, setEditWardrobeTarget] = useState<ClosetLocation | null>(null);
  const [deleteWardrobeTarget, setDeleteWardrobeTarget] = useState<ClosetLocation | null>(null);
  const [deleteWardrobeTargetLocationId, setDeleteWardrobeTargetLocationId] = useState("");
  const [showDeleteWardrobeHardConfirm, setShowDeleteWardrobeHardConfirm] = useState(false);
  const [wardrobeFormName, setWardrobeFormName] = useState("");
  const [wardrobeFormNote, setWardrobeFormNote] = useState("");
  const [wardrobeListExpanded, setWardrobeListExpanded] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [isDiagnosticExporting, setIsDiagnosticExporting] = useState(false);
  // v0.9.43-dev 批次 4: 图片缓存优化
  // - thumbnailStats: 仅看字段, 不解码图片, 不写库 (批次 4 §2)
  // - backfillState: subscribe backfill 单例
  // - refreshTick: items 变化时 invalidate useMemo
  const [backfillState, setBackfillState] = useState(() => backfill.getState());
  const [refreshTick, setRefreshTick] = useState(0);
  const [showBackfillFailureSheet, setShowBackfillFailureSheet] = useState(false);
  // v0.9.44-dev 问题 2: subscribe backfill state, 每次 processed/failed/status 变化
  // 都触发父级 refreshState 重读 Dexie → items prop 更新 → thumbnailStats 重算。
  // 用 ref 跟踪上一次 processed 值, 避免对 currentJob 变化等无关字段重复 refresh。
  const lastRefreshedProcessedRef = useRef(0);
  const lastRefreshedStatusRef = useRef<string>(backfillState.status);
  useEffect(() => {
    const unsub = backfill.subscribe((s) => {
      setBackfillState(s);
      // 1) 每完成 1 张 → refresh (processed 加 1 即触发); 2) 状态从 running → done/idle → refresh 一次兜底
      const processedChanged = s.processed !== lastRefreshedProcessedRef.current;
      const statusSettled = (s.status === "done" || s.status === "idle")
        && lastRefreshedStatusRef.current !== s.status;
      if (processedChanged || statusSettled) {
        lastRefreshedProcessedRef.current = s.processed;
        lastRefreshedStatusRef.current = s.status;
        // 微任务级 refresh (避免和当前 subscribe notify 同一个 tick 竞争)
        Promise.resolve().then(() => {
          // 父级 refreshState 可能不存在 (向后兼容), 也可能是 async
          const result = onRefreshState?.();
          if (result && typeof (result as Promise<void>).catch === "function") {
            (result as Promise<void>).catch(() => { /* 忽略 refresh 失败 */ });
          }
          // 同时 invalidate 本组件 useMemo (兜底 - 父级 items 已变就重算)
          setRefreshTick((n) => n + 1);
        });
      }
    });
    return unsub;
  }, [onRefreshState]);
  const thumbnailStats = useMemo(
    () => countMissingThumbnails(items),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshTick 强制 invalidate
    [items, refreshTick],
  );
  const totalMissing = thumbnailStats.mainMissing + thumbnailStats.referenceMissing;
  async function handleExportDiagnosticLog() {
    if (isDiagnosticExporting) return;
    setIsDiagnosticExporting(true);
    recordDiagnosticEvent("diagnostic_export_started", { activeView, route });
    try {
      const result = await exportWardrobeDiagnosticLog({
        activeView,
        route,
        items,
        locations,
        outfits,
        wishlistItems,
        backfillState,
        miniMaxSettings,
      });
      recordDiagnosticEvent("diagnostic_export_succeeded", { mode: result.mode, path: result.path });
      onMessage?.(result.mode === "native"
        ? `诊断日志已保存到 ${result.directoryLabel}/${result.fileName}`
        : "诊断日志已下载");
    } catch (error) {
      recordDiagnosticEvent("diagnostic_export_failed", { error: error instanceof Error ? error.message : String(error) });
      onMessage?.(`导出诊断日志失败: ${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsDiagnosticExporting(false);
    }
  }
  // v0.9.24-dev: onClearAllData loading 态从 WardrobeApp 注入 (subagent I-2/I-3)。
  // isClearingAllRef 提供同步锁 (click handler + 父级 backButton handler 都用 ref 读最新值),
  // isClearingAll 状态驱动 UI disabled + spinner 渲染。lift 到父级是为了让父级 line 297
  // backButton handler 也能在清空中屏蔽 Android 返回键, 否则会同时弹"退出 App?"对话框。

  useEffect(() => {
    if (editWardrobeTarget) {
      setWardrobeFormName(editWardrobeTarget.name);
      setWardrobeFormNote(editWardrobeTarget.note || "");
    }
  }, [editWardrobeTarget]);

  // 子页打开时通知 hasSubPageRef (Android 返回键先返回子页, 不退出 App)
  // v0.9.23-dev: 删 cleanup 函数。
  //   - 旧代码 cleanup 在 subPage 切换瞬间 (A→B) 会先把 ref 置 false, 再由新 effect 主体置 true,
  //     中间一次同步序列 (微任务级, 非用户可感知 paint frame) 出现 ref=false 窗口。
  //   - 父级 backButton handler (line 297) 监听的是 Capacitor App.addListener("backButton") 原生事件,
  //     由 Android 系统在用户按键时异步派发, 不会在 React effect 微任务内被同步触发, 实际误触风险理论性。
  //   - 旧 cleanup 对 subPage 状态变化的最终效果 = 主体单次赋值, 删除是简化。
  //   - SettingsView 卸载时 (activeView 切回 home 等) 若 subPage 非 null, 新代码不重置 ref。
  //     卸载兜底: line 1084 useEffect 依赖 isSearchOpen / viewingItem / editingItem / 等状态,
  //     下次任意一个变化时会重算并重置 hasSubPageRef; 此外 home view 的初始 render 也会跑该 effect
  //     把 ref 置 false。所以卸载→home 的 ref 状态由 line 1084 useEffect 兜底, 不会 leak。
  useEffect(() => {
    hasSubPageRef.current = subPage !== null;
  }, [subPage]);

  useEffect(() => {
    if (subPage !== null) return;
    let removed = false;
    let handle: { remove: () => void } | null = null;
    App.addListener("backButton", () => {
      if (removed) return;
      // v0.9.24-dev (subagent I-3 修复): 用 ref 而非 state 做守卫, 同步拿最新值;
      // 父级 line 297 backButton handler 也读这个 ref, 两层 handler 不会同时跑
      // (虽然 Capacitor App.addListener 多 listener 都派发, 但父级 line 297 已经
      // 先于 SettingsView 的 handler 跑并 setShowExitDialog, 这里若再返回会与父级冲突)。
      // isClearingAllRef 是 props 传入的同步锁, 不放在 deps 里 (ref 引用稳定, 不会触发 effect 重跑)。
      if (isClearingAllRef.current) return;
      if (showClearAllConfirm) { setShowClearAllConfirm(false); return; }
      if (showDeleteWardrobeHardConfirm) { setShowDeleteWardrobeHardConfirm(false); return; }
      if (deleteWardrobeTarget) { setDeleteWardrobeTarget(null); return; }
      if (editWardrobeTarget) { setEditWardrobeTarget(null); return; }
      if (showAddWardrobe) { setShowAddWardrobe(false); return; }
      if (wardrobeListExpanded) { setWardrobeListExpanded(false); return; }
      // 否则交回父级 (退到上一层或弹退出对话框)
    }).then((h) => { if (!removed) handle = h; });
    return () => { removed = true; handle?.remove(); };
  }, [subPage, showAddWardrobe, editWardrobeTarget, deleteWardrobeTarget, showDeleteWardrobeHardConfirm, showClearAllConfirm, wardrobeListExpanded, isClearingAllRef]);

  // ---------- 子页面: 穿衣画像详情 ----------
  if (subPage === "profile") {
    return (
      <ProfileDetailPage
        tryOnProfile={tryOnProfile}
        onSave={async (profile) => { await onSaveTryOnProfile(profile); onMessage?.("穿衣画像已保存"); }}
        onBack={() => setSubPage(null)}
        onMessage={onMessage}
      />
    );
  }

  // ---------- 子页面: AI 试穿参考照片详情 ----------
  if (subPage === "photos") {
    return (
      <PhotosDetailPage
        tryOnProfile={tryOnProfile}
        onSave={async (profile) => { await onSaveTryOnProfile(profile); onMessage?.("AI 试穿参考照片已保存"); }}
        onBack={() => setSubPage(null)}
        onMessage={onMessage}
        onExpandImage={onExpandImage}
      />
    );
  }

  // ---------- 子页面: MiniMax 配置详情 ----------
  if (subPage === "minimax") {
    return (
      <MiniMaxDetailPage
        settings={miniMaxSettings}
        onSave={(s) => { onSaveMiniMaxSettings(s); setSubPage(null); }}
        onBack={() => setSubPage(null)}
        onMessage={onMessage}
      />
    );
  }

  // ---------- 子页面: 全部衣橱管理 ----------
  if (subPage === "wardrobes") {
    return (
      <WardrobeListPage
        items={items}
        locations={locations}
        onBack={() => setSubPage(null)}
        onAdd={() => setShowAddWardrobe(true)}
        onEdit={(loc) => setEditWardrobeTarget(loc)}
      />
    );
  }

  // ---------- 首页摘要视图 ----------
  const locationCounts = new Map<string, number>();
  for (const item of items) locationCounts.set(item.locationId, (locationCounts.get(item.locationId) ?? 0) + 1);
  const sortedLocations = [...locations].sort((a, b) => a.sortOrder - b.sortOrder);
  const visibleLocations = wardrobeListExpanded ? sortedLocations : sortedLocations.slice(0, 3);
  const hasMoreLocations = sortedLocations.length > 3;
  const deleteMigrationCandidates = deleteWardrobeTarget
    ? sortedLocations.filter((location) => location.id !== deleteWardrobeTarget.id)
    : [];
  const deleteWardrobeItemCount = deleteWardrobeTarget
    ? items.filter((item) => item.locationId === deleteWardrobeTarget.id).length
    : 0;
  function openDeleteWardrobeSheet(location: ClosetLocation | null) {
    if (!location) return;
    const candidates = sortedLocations.filter((item) => item.id !== location.id);
    setShowDeleteWardrobeHardConfirm(false);
    setDeleteWardrobeTargetLocationId(candidates[0]?.id ?? "");
    setDeleteWardrobeTarget(location);
  }
  const profileChips = profileSummaryChips(tryOnProfile);
  const profileIsLight = tryOnProfileCompleteness(tryOnProfile) < 0.4;
  const photosCount = tryOnPhotosCount(tryOnProfile);
  const hasMiniMaxKey = miniMaxSettings.apiKey.trim().length > 0;

  return (
    <div className="grid gap-3.5">
      {/* Header - 与 AppSubPageTopBar / 衣橱首页按钮行 / 套装/种草首页 header 一致 h-14 (56px) */}
      <h1 className="flex h-14 items-center px-4 pt-2 text-xl font-bold tracking-tight">设置</h1>

      {/* 1. 衣橱设置 (紧凑列表行, 超过 3 个折叠) */}
      <article className="surface rounded-lg px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">衣橱设置</h2>
            <p className="mt-0.5 text-xs text-ink/55">管理衣物存放位置</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddWardrobe(true)}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-denim px-3 text-sm font-semibold text-white"
          >
            <Plus size={15} aria-hidden="true" />
            添加衣橱
          </button>
        </div>
        <div className="mt-3 grid gap-1.5">
          {visibleLocations.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink/45">还没有衣橱位置，点击右上添加</p>
          ) : (
            visibleLocations.map((location) => (
              <WardrobeRow
                key={location.id}
                location={location}
                count={locationCounts.get(location.id) ?? 0}
                isDefault={location.id === "home"}
                onClick={() => setEditWardrobeTarget(location)}
              />
            ))
          )}
        </div>
        {hasMoreLocations ? (
          <button
            type="button"
            onClick={() => setWardrobeListExpanded((v) => !v)}
            className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1 text-xs text-ink/55 active:text-denim"
          >
            {wardrobeListExpanded ? "收起" : `查看全部衣橱（${sortedLocations.length}）`}
            <ChevronRight
              size={12}
              aria-hidden="true"
              className={`transition-transform ${wardrobeListExpanded ? "-rotate-90" : "rotate-90"}`}
            />
          </button>
        ) : null}
      </article>

      {/* 1.5 v0.9.43-dev 批次 4: 图片缓存优化 */}
      <article className="surface rounded-lg px-4 py-3.5" aria-label="图片缓存优化">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">优化图片缓存</h2>
            <p className="mt-0.5 text-xs text-ink/55">
              {totalMissing > 0
                ? `当前待优化：${totalMissing} 张`
                : "所有图片已生成缓存"}
            </p>
            <p className="mt-0.5 text-[11px] text-ink/45">
              为已录入衣物生成缩略图，提升首页和横滑流畅度
            </p>
          </div>
        </div>
        {backfillState.status === "running" || backfillState.status === "paused" ? (
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-ink/65">
              正在优化 {backfillState.processed} / {backfillState.total}
              {backfillState.failed > 0 ? ` · 失败 ${backfillState.failed}` : ""}
            </p>
            <div className="flex items-center gap-1.5">
              {backfillState.status === "running" ? (
                <button
                  type="button"
                  onClick={() => backfill.pause()}
                  className="inline-flex h-8 items-center rounded-lg border border-ink/10 px-2.5 text-xs text-ink/65 active:bg-mist"
                >
                  暂停
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => backfill.resume()}
                  className="inline-flex h-8 items-center rounded-lg border border-ink/10 px-2.5 text-xs text-ink/65 active:bg-mist"
                >
                  继续
                </button>
              )}
              <button
                type="button"
                onClick={() => backfill.cancel()}
                className="inline-flex h-8 items-center rounded-lg border border-ink/10 px-2.5 text-xs text-ink/65 active:bg-mist"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-ink/45">
                {backfillState.status === "done"
                  ? `已完成${backfillState.failed > 0 ? `, 失败 ${backfillState.failed}` : ""}`
                  : "首页瀑布流会优先用缩略图，老衣物也能享受"}
              </p>
              <div className="flex items-center gap-1.5">
                {backfillState.failed > 0 ? (
                  <button
                    type="button"
                    data-testid="backfill-retry-failed"
                    onClick={() => backfill.retryFailed(items)}
                    className="inline-flex h-9 items-center rounded-lg border border-denim/20 bg-white px-3 text-xs font-semibold text-denim active:bg-mist"
                  >
                    重试失败项
                  </button>
                ) : null}
                <button
                  type="button"
                  data-testid="backfill-start-or-recheck"
                  disabled={backfillState.status === "cancelling"}
                  onClick={() => {
                    if (backfillState.status === "done") backfill.reset();
                    backfill.startBackfillAll(items);
                    // 启动后实时进度由 subscribe → onRefreshState 驱动 (问题 2)
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-denim px-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {backfillState.status === "cancelling"
                    ? "正在取消..."
                    : backfillState.status === "done" && backfillState.failed === 0
                      ? "重新检查"
                      : totalMissing > 0
                        ? "开始优化"
                        : "重新检查"}
                </button>
              </div>
            </div>
            {backfillState.failed > 0 ? (
              <div className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2.5 text-xs leading-relaxed" data-testid="backfill-failure-summary">
                <p className="font-semibold text-red-700">
                  失败 {backfillState.failed} 条
                </p>
                <ul className="mt-1.5 space-y-1 text-ink/80">
                  {backfillState.failedItems.slice(0, 3).map((f) => (
                    <li key={f.key} className="flex items-start gap-1.5">
                      <span className="text-ink/40">·</span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-ink/85">{f.name}</span>
                        <span className="mx-1 text-ink/30">·</span>
                        <span className="text-ink/60">
                          {f.kind === "main" ? "主图" : "灵感图"}
                        </span>
                        <span className="mx-1 text-ink/30">·</span>
                        <span className="text-ink/70">{f.errorMessage}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {backfillState.failedItems.length > 3 ? (
                  <button
                    type="button"
                    data-testid="backfill-failure-open-all"
                    onClick={() => setShowBackfillFailureSheet(true)}
                    className="mt-2 text-left text-xs font-semibold text-denim"
                  >
                    查看全部失败记录（共 {backfillState.failedItems.length} 条）
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </article>

      <MotionSheet
        open={showBackfillFailureSheet}
        onClose={() => setShowBackfillFailureSheet(false)}
      >
        <div className="grid max-h-[72dvh] gap-3 overflow-y-auto pb-4" data-testid="backfill-failure-sheet">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">缩略图失败记录</h2>
            <button
              type="button"
              onClick={() => setShowBackfillFailureSheet(false)}
              className="grid h-9 w-9 place-items-center rounded-lg text-ink/55 active:bg-mist"
              aria-label="关闭失败记录"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="text-xs leading-relaxed text-ink/55">
            共 {backfillState.failedItems.length} 条失败。源图无法解码时，请重新选择图片。
          </p>
          {backfillState.failedItems.map((failed) => {
            const item = items.find((candidate) => candidate.id === failed.id);
            const decodeHint = /decode|decoded|解码/i.test(failed.errorMessage);
            return (
              <div key={failed.key} className="rounded-lg border border-ink/10 bg-white px-3 py-3 text-xs">
                <p className="font-semibold text-ink">{failed.name}</p>
                <p className="mt-1 text-ink/55">{failed.kind === "main" ? "主图" : "灵感图"} · {failed.errorMessage}</p>
                {decodeHint ? (
                  <p className="mt-1 rounded-md bg-clay/8 px-2 py-1.5 text-clay">源图无法解码，请进入衣物详情重新选择图片。</p>
                ) : null}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (item?.imageDataUrl) onExpandImage?.({ src: item.imageDataUrl, alt: item.name });
                      onMessage?.("请进入衣物详情重新选择图片");
                    }}
                    className="h-9 rounded-lg border border-ink/10 bg-white font-semibold text-ink/70"
                  >
                    查看衣物
                  </button>
                  <button
                    type="button"
                    onClick={() => backfill.retryFailedKey(items, failed.key)}
                    className="h-9 rounded-lg border border-denim/20 bg-denim/8 font-semibold text-denim"
                  >
                    重试此项
                  </button>
                </div>
              </div>
            );
          })}
          {backfillState.failedItems.length === 0 ? (
            <p className="rounded-lg bg-mist px-3 py-4 text-center text-xs text-ink/45">暂无失败记录</p>
          ) : null}
          <button
            type="button"
            onClick={() => backfill.retryFailed(items)}
            className="sticky bottom-0 h-11 rounded-lg bg-denim text-sm font-semibold text-white"
          >
            重试全部失败项
          </button>
        </div>
      </MotionSheet>

      {/* 2. 我的穿衣画像摘要卡 */}
      <article className="surface rounded-lg px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">我的穿衣画像</h2>
            <p className="mt-0.5 text-xs text-ink/55">用于推荐、买前评估和 AI 试穿</p>
          </div>
          <button
            type="button"
            onClick={() => setSubPage("profile")}
            className="inline-flex h-8 shrink-0 items-center gap-1 text-xs font-semibold text-denim"
          >
            编辑画像 <ChevronRight size={12} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3">
          {profileIsLight ? (
            <p className="rounded-lg bg-mist px-3 py-3 text-xs leading-relaxed text-ink/55">
              还未完善画像，补充后 AI 推荐和试穿会更贴合你。
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {profileChips.map((chip, i) => (
                <span
                  key={i}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-ink/10 bg-white px-2.5 text-[11px]"
                >
                  <span className="text-ink/45">{chip.label}：</span>
                  <span className="font-semibold text-ink/80">{chip.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </article>

      {/* 3. AI 试穿参考照片摘要卡 */}
      <article className="surface rounded-lg px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">AI 试穿参考照片</h2>
            <p className="mt-0.5 text-xs text-ink/55">照片仅在生成试穿图时使用</p>
          </div>
          <SettingsSwitch
            checked={tryOnProfile.enabled}
            onChange={async (next) => {
              const updated: TryOnProfile = { ...tryOnProfile, enabled: next, updatedAt: new Date().toISOString() };
              await onSaveTryOnProfile(updated);
              onMessage?.(next ? "已启用参考照生成试穿图" : "已关闭参考照，试穿时将不发送照片");
            }}
            ariaLabel={tryOnProfile.enabled ? "关闭参考照" : "启用参考照"}
            className="h-6 w-11"
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {!tryOnProfile.enabled ? (
              <span className="text-xs text-ink/55">未启用参考照 · 关闭后不会发送照片给 MiniMax，AI 仍可使用穿衣画像。</span>
            ) : photosCount === 0 ? (
              <span className="text-xs text-clay">请添加全身参考照</span>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 text-xs font-semibold text-ink/80">已配置 {photosCount} 张照片</span>
                <div className="flex items-center gap-1.5">
                  {tryOnProfile.fullBodyImageDataUrl ? (
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-ink/10 bg-mist">
                      <GarmentImage src={tryOnProfile.fullBodyImageDataUrl} alt="全身照" />
                    </div>
                  ) : null}
                  {tryOnProfile.faceImageDataUrl ? (
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-ink/10 bg-mist">
                      <GarmentImage src={tryOnProfile.faceImageDataUrl} alt="脸部照" />
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSubPage("photos")}
            className="inline-flex h-8 shrink-0 items-center gap-1 text-xs font-semibold text-ink/55 active:text-denim"
            aria-label="查看或管理参考照片"
          >
            查看 <ChevronRight size={12} aria-hidden="true" />
          </button>
        </div>
      </article>

      {/* 4. MiniMax 设置摘要卡 */}
      <article className="surface rounded-lg px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">MiniMax 设置</h2>
            <p className="mt-0.5 text-xs text-ink/55">配置后启用 AI 识别和试穿功能</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          {hasMiniMaxKey ? (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-moss" aria-hidden="true" />
                <span className="text-xs font-semibold text-ink/80">已配置 · {miniMaxSettings.model}</span>
              </div>
              <p className="mt-1 truncate text-[11px] text-ink/45">API Host: {miniMaxSettings.apiHost}</p>
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <KeyRound size={13} className="text-clay" aria-hidden="true" />
                <span className="text-xs font-semibold text-ink/80">未配置</span>
              </div>
              <p className="mt-1 text-[11px] text-ink/55">配置 MiniMax Key 以启用 AI 识别、推荐和试穿功能</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSubPage("minimax")}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-ink/10 bg-white px-3 text-xs font-semibold active:scale-95 transition-transform"
          >
            {hasMiniMaxKey ? "修改配置" : "配置 Key"} <ChevronRight size={12} aria-hidden="true" />
          </button>
        </div>
      </article>

      {/* 5. 数据备份与恢复 */}
      <article className="surface rounded-lg px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">数据备份与恢复</h2>
            <p className="mt-0.5 text-xs text-ink/55">用于卸载、重装、换机前保留全部衣橱数据和图片。</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2">
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3.5 text-left active:bg-mist"
            disabled={isBackupBusy}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-denim/10 text-denim">
              <Download size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">导出到默认长期备份目录</span>
              <span className="mt-0.5 block text-[11px] text-ink/50">保存到 Download/衣橱穿搭助手备份，卸载应用后仍保留</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenBackupFolder}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3.5 text-left active:bg-mist"
            disabled={isBackupBusy}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-denim/10 text-denim">
              <Upload size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">从默认长期备份恢复</span>
              <span className="mt-0.5 block text-[11px] text-ink/50">读取 Download/衣橱穿搭助手备份 下的时间戳备份，按修改时间倒序</span>
            </span>
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onSaveAs}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-ink/10 bg-white px-3 text-xs font-semibold text-ink active:bg-mist"
            disabled={isBackupBusy}
          >
            另存为...
          </button>
          <button
            type="button"
            onClick={onPickFile}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-ink/10 bg-white px-3 text-xs font-semibold text-ink active:bg-mist"
            disabled={isBackupBusy}
          >
            从其他位置选择备份...
          </button>
        </div>
                <button
          type="button"
          onClick={() => setShowClearAllConfirm(true)}
          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-500 active:bg-red-100"
          disabled={isBackupBusy || isClearingAll}
        >
          <Trash2 size={14} aria-hidden="true" />
          清空数据
        </button>
      </article>

      <article className="surface rounded-lg px-4 py-3.5" aria-label="诊断日志">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">诊断日志</h2>
            <p className="mt-0.5 text-xs text-ink/55">导出最近操作、图片优化、色卡、裁切和删除诊断信息</p>
            <p className="mt-0.5 text-[11px] text-ink/45">不包含原始图片和 MiniMax Key</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExportDiagnosticLog}
          disabled={isDiagnosticExporting}
          className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-ink/10 bg-white px-3 text-sm font-semibold text-ink/75 active:bg-mist disabled:opacity-55"
        >
          {isDiagnosticExporting ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ScrollText size={15} aria-hidden="true" />}
          {isDiagnosticExporting ? "正在导出..." : "导出诊断日志"}
        </button>
      </article>

      {/* 衣橱增删改弹窗 (首页和子页共用) */}
      <MotionSheet open={showAddWardrobe} onClose={() => setShowAddWardrobe(false)} panelClassName="!max-w-sm">
        <h3 className="mb-3 text-base font-semibold">添加衣橱</h3>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            衣橱名称 <span className="text-red-500">*</span>
            <input value={wardrobeFormName} onChange={(e) => setWardrobeFormName(e.target.value)} className="h-10 rounded-lg border border-ink/10 bg-white px-3 text-sm outline-none focus:border-denim" placeholder="例如 办公室抽屉" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            衣橱简介
            <input value={wardrobeFormNote} onChange={(e) => setWardrobeFormNote(e.target.value)} className="h-10 rounded-lg border border-ink/10 bg-white px-3 text-sm outline-none focus:border-denim" placeholder="选填" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setShowAddWardrobe(false)} className="h-10 rounded-lg border border-ink/10 text-sm">取消</button>
            <button
              type="button"
              onClick={() => { if (wardrobeFormName.trim()) { void onAddWardrobe(wardrobeFormName.trim(), wardrobeFormNote.trim()); setShowAddWardrobe(false); setWardrobeFormName(""); setWardrobeFormNote(""); } }}
              className="h-10 rounded-lg bg-denim text-sm font-semibold text-white"
            >确认添加</button>
          </div>
        </div>
      </MotionSheet>

      <MotionSheet open={!!editWardrobeTarget} onClose={() => setEditWardrobeTarget(null)} panelClassName="!max-w-sm">
        <h3 className="mb-3 text-base font-semibold">编辑衣橱</h3>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            衣橱名称 <span className="text-red-500">*</span>
            <input value={wardrobeFormName} onChange={(e) => setWardrobeFormName(e.target.value)} className="h-10 rounded-lg border border-ink/10 bg-white px-3 text-sm outline-none focus:border-denim" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            衣橱简介
            <input value={wardrobeFormNote} onChange={(e) => setWardrobeFormNote(e.target.value)} className="h-10 rounded-lg border border-ink/10 bg-white px-3 text-sm outline-none focus:border-denim" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setEditWardrobeTarget(null)} className="h-10 rounded-lg border border-ink/10 text-sm">取消</button>
            <button
              type="button"
              onClick={() => { if (wardrobeFormName.trim() && editWardrobeTarget) { void onUpdateWardrobe(editWardrobeTarget.id, wardrobeFormName.trim(), wardrobeFormNote.trim()); setEditWardrobeTarget(null); } }}
              className="h-10 rounded-lg bg-denim text-sm font-semibold text-white"
            >保存</button>
          </div>
          <button type="button" onClick={() => { openDeleteWardrobeSheet(editWardrobeTarget); setEditWardrobeTarget(null); }} className="h-9 w-full text-sm text-red-500">删除此衣橱</button>
        </div>
      </MotionSheet>

      <MotionSheet open={!!deleteWardrobeTarget} onClose={() => setDeleteWardrobeTarget(null)} panelClassName="!max-w-sm">
        <p className="mb-2 text-sm font-semibold">删除衣橱「{deleteWardrobeTarget?.name ?? ""}」？</p>
        <p className="mb-4 text-xs text-ink/60">这个衣橱中有 {deleteWardrobeItemCount} 件衣物。你可以先迁移到其他衣橱；如果不迁移，确认删除会同时删除这些衣物并清理相关套装和计划记录。</p>
        <div className="mb-4 grid gap-3">
          <label className="grid gap-1 text-xs font-medium text-ink/60">
            迁移到
            <select
              value={deleteWardrobeTargetLocationId || deleteMigrationCandidates[0]?.id || ""}
              onChange={(event) => setDeleteWardrobeTargetLocationId(event.target.value)}
              disabled={deleteMigrationCandidates.length === 0}
              className="h-10 rounded-lg border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-denim disabled:bg-mist disabled:text-ink/35"
            >
              {deleteMigrationCandidates.length > 0 ? (
                deleteMigrationCandidates.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))
              ) : (
                <option value="">没有其他衣橱可迁移</option>
              )}
            </select>
          </label>
        </div>
        <div className="grid gap-2">
          <button
            type="button"
            disabled={!deleteWardrobeTargetLocationId}
            onClick={() => {
              if (!deleteWardrobeTarget || !deleteWardrobeTargetLocationId) return;
              void onDeleteWardrobe(deleteWardrobeTarget.id, { mode: "migrate", targetLocationId: deleteWardrobeTargetLocationId });
              setDeleteWardrobeTarget(null);
            }}
            className="h-10 rounded-lg bg-denim text-sm font-semibold text-white disabled:bg-ink/15 disabled:text-ink/40"
          >确认迁移</button>
          <button
            type="button"
            onClick={() => {
              if (!deleteWardrobeTarget) return;
              setShowDeleteWardrobeHardConfirm(true);
            }}
            className="h-10 rounded-lg bg-red-600 text-sm font-semibold text-white"
          >确认删除</button>
          <button type="button" onClick={() => setDeleteWardrobeTarget(null)} className="h-10 rounded-lg border border-ink/10 text-sm">取消</button>
        </div>
      </MotionSheet>

      <MotionSheet open={showDeleteWardrobeHardConfirm && !!deleteWardrobeTarget} onClose={() => setShowDeleteWardrobeHardConfirm(false)} panelClassName="!max-w-xs">
        <p className="mb-2 text-sm font-semibold text-red-500">确认删除衣物？</p>
        <p className="mb-4 text-xs leading-relaxed text-ink/60">
          将删除衣橱「{deleteWardrobeTarget?.name ?? ""}」和其中 {deleteWardrobeItemCount} 件衣物，并清理关联套装、日程和自动行李清单。此操作不可恢复。
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setShowDeleteWardrobeHardConfirm(false)}
            className="h-10 rounded-lg border border-ink/10 text-sm"
          >取消</button>
          <button
            type="button"
            onClick={() => {
              if (!deleteWardrobeTarget) return;
              void onDeleteWardrobe(deleteWardrobeTarget.id, { mode: "delete_items" });
              setShowDeleteWardrobeHardConfirm(false);
              setDeleteWardrobeTarget(null);
            }}
            className="h-10 rounded-lg bg-red-600 text-sm font-semibold text-white"
          >确认删除</button>
        </div>
      </MotionSheet>

      <MotionSheet open={showClearAllConfirm} onClose={() => { if (!isClearingAll) setShowClearAllConfirm(false); }} panelClassName="!max-w-sm">
        <p className="mb-2 text-sm font-semibold text-red-500">清空全部数据？</p>
        <p className="mb-4 text-xs text-ink/60 leading-relaxed">
          将清空所有衣物、衣橱位置、收藏套装和试穿参考照片。建议先在「导出备份」保存一份 JSON，再执行清空。
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setShowClearAllConfirm(false)}
            disabled={isClearingAll}
            className="h-10 rounded-lg border border-ink/10 text-sm disabled:opacity-55"
          >取消</button>
          <button
            type="button"
            disabled={isClearingAll}
            onClick={async () => {
              // v0.9.24-dev (subagent I-2 修复): 用 ref 同步锁, 避免 React state 闭包过期
              // 引起同帧双触发 race。两个 click 在同一 microtask 内打到 button 时, 第一个
              // click setIsClearingAll(true) 后 state 还未提交, 第二个 click 仍读到旧闭包
              // isClearingAll=false → 通过 → 跑两个并发 onClearAllData。ref 是同步写入的。
              if (isClearingAllRef.current) return;
              isClearingAllRef.current = true;
              setIsClearingAll(true);
              try {
                await onClearAllData();
              } catch (e) {
                onMessage?.(`清空失败: ${e instanceof Error ? e.message : "未知错误"}`);
              } finally {
                isClearingAllRef.current = false;
                setIsClearingAll(false);
                setShowClearAllConfirm(false);
              }
            }}
            className="h-10 rounded-lg bg-red-600 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-65"
          >
            {isClearingAll ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
            {isClearingAll ? "清空中..." : "确认清空"}
          </button>
        </div>
      </MotionSheet>
    </div>
  );
}

// ---------- 衣橱紧凑行 ----------
function WardrobeRow({
  location,
  count,
  isDefault,
  onClick,
}: {
  location: ClosetLocation;
  count: number;
  isDefault: boolean;
  onClick: () => void;
}) {
  const Icon = isDefault ? Shirt : location.id === "office" || /办公室|office|工位|公司/.test(location.name) ? Briefcase : Shirt;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[60px] w-full items-center gap-3 rounded-lg border border-ink/10 bg-white px-3 text-left active:scale-[0.99] transition-transform"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-mist text-ink/65">
        <Icon size={17} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{location.name}</p>
          {isDefault ? (
            <span className="rounded-full bg-denim/10 px-1.5 py-0.5 text-[9px] font-semibold text-denim">当前</span>
          ) : null}
        </div>
        <p className="truncate text-[11px] text-ink/50">{location.note || "暂无简介"}</p>
      </div>
      <div className="shrink-0 text-right">
        <span className="text-sm font-semibold tabular-nums">{count}</span>
        <span className="ml-0.5 text-[10px] text-ink/45">件</span>
      </div>
      <ChevronRight size={14} className="shrink-0 text-ink/30" aria-hidden="true" />
    </button>
  );
}

// ---------- 紧凑备份按钮 ----------
function CompactBackupButton({
  icon,
  label,
  onClick,
  disabled,
  primary = false,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const className = primary
    ? "bg-denim text-white"
    : danger
      ? "bg-white text-red-500 border border-red-200"
      : "bg-white text-ink/75 border border-ink/10";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-[68px] w-full flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold disabled:opacity-55 active:scale-95 transition-transform ${className}`}
    >
      {icon}
      <span className="leading-none">{label}</span>
    </button>
  );
}

// ---------- 子页面: 我的穿衣画像详情 ----------
function ProfileDetailPage({
  tryOnProfile,
  onSave,
  onBack,
  onMessage,
}: {
  tryOnProfile: TryOnProfile;
  onSave: (profile: TryOnProfile) => Promise<void> | void;
  onBack: () => void;
  onMessage?: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<TryOnProfile>(() => ({ ...tryOnProfile, fitGender: tryOnProfile.fitGender ?? "unspecified" }));
  const [editingField, setEditingField] = useState<null | "height" | "bodyType" | "shoulder" | "legRatio" | "hair" | "skin" | "note">(null);

  useEffect(() => {
    setDraft({
      ...tryOnProfile,
      fitGender: tryOnProfile.fitGender ?? "unspecified",
    });
  }, [tryOnProfile]);

  // v0.9.24-dev: Android WebView 软键盘检测 (沿用 v0.9.21-dev WardrobeEditPage 模式)。
  // 键盘弹起时 (diff > 150) 临时隐藏顶部"保存"按钮, 强制用户先完成/取消 sheet 内的输入,
  // 避免 sheet 内 textarea 的 draft 改动被顶层"保存"误存到 tryOnProfile (此时 ProfileFieldSheet
  // 还在开, 用户尚未点完成/清除, 顶层 保存 会跳过 sheet 直接拿 draft 当前值存, 看似 OK 但
  // 实际上用户预期的"编辑→完成→保存"两段式被压成一段, 视觉上也有"键盘遮挡 / 半透明"问题)。
  // 不需要 saving 状态保护: isKeyboardOpen 仅由 visualViewport.resize 触发, 不与 handleSave 互相调用, 不会循环。
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const evaluate = () => {
      const diff = window.innerHeight - vv.height;
      setIsKeyboardOpen(diff > 150);
    };
    vv.addEventListener("resize", evaluate);
    evaluate();
    return () => vv.removeEventListener("resize", evaluate);
  }, []);

  useEffect(() => {
    let removed = false;
    let handle: { remove: () => void } | null = null;
    App.addListener("backButton", () => {
      if (removed) return;
      if (editingField) { setEditingField(null); return; }
      onBack();
    }).then((h) => { if (!removed) handle = h; });
    return () => { removed = true; handle?.remove(); };
  }, [editingField, onBack]);

  const dirty = JSON.stringify({ ...draft, updatedAt: "" }) !== JSON.stringify({ ...tryOnProfile, fitGender: tryOnProfile.fitGender ?? "unspecified", updatedAt: "" });

  async function handleSave() {
    await onSave({ ...draft, updatedAt: new Date().toISOString() });
    onMessage?.("穿衣画像已保存");
  }

  function setFitGender(value: FitGender) {
    setDraft((p) => ({ ...p, fitGender: value }));
  }

  return (
    <div className="grid gap-4 pb-2">
      <div className="flex items-center justify-between gap-3 px-1 pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="grid h-10 w-10 place-items-center rounded-full bg-mist active:scale-95 transition-transform"
            aria-label="返回设置"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <h1 className="text-lg font-semibold">穿衣画像</h1>
        </div>
        {/* v0.9.24-dev: 键盘打开时隐藏顶部"保存"按钮, 沿用 v0.9.21-dev WardrobeEditPage 的
            isKeyboardOpen 条件渲染。键盘收起后保存按钮自动恢复, dirty 状态保留。 */}
        {!isKeyboardOpen ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-denim px-3 text-sm font-semibold text-white disabled:bg-ink/15 disabled:text-ink/40"
          >
            <SaveAll size={14} aria-hidden="true" />保存
          </button>
        ) : null}
      </div>

      {/* 版型倾向 segmented chips */}
      <article className="surface rounded-lg px-4 py-3.5">
        <h2 className="text-sm font-semibold">版型倾向</h2>
        <p className="mt-0.5 text-[11px] text-ink/55">用于 AI 推荐、买前评估和试穿姿态参考，不限制你录入或购买任何衣物。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {FIT_GENDER_OPTIONS.map((opt) => {
            const active = draft.fitGender === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setFitGender(opt)}
                className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold transition-colors ${active ? "bg-denim text-white" : "border border-ink/10 bg-white text-ink/70 active:scale-95"}`}
              >
                {FIT_GENDER_LABELS[opt]}
              </button>
            );
          })}
        </div>
      </article>

      {/* 画像字段紧凑列表行 */}
      <article className="surface rounded-lg overflow-hidden">
        <ProfileFieldRow
          icon={<User size={16} className="text-denim" aria-hidden="true" />}
          label="身高"
          value={draft.heightCm ? `${draft.heightCm} cm` : "未设置"}
          onClick={() => setEditingField("height")}
        />
        <ProfileFieldRow
          icon={<User size={16} className="text-denim" aria-hidden="true" />}
          label="体型"
          value={draft.bodyType ? (draft.bodyType === "custom" ? (draft.bodyTypeCustom?.trim() || "自定义") : BODY_TYPE_LABELS[draft.bodyType]) : "未设置"}
          onClick={() => setEditingField("bodyType")}
        />
        <ProfileFieldRow
          icon={<User size={16} className="text-denim" aria-hidden="true" />}
          label="肩宽"
          value={draft.shoulderWidth ? SHOULDER_LABELS[draft.shoulderWidth] : "未设置"}
          onClick={() => setEditingField("shoulder")}
        />
        <ProfileFieldRow
          icon={<User size={16} className="text-denim" aria-hidden="true" />}
          label="腿长比例"
          value={draft.legRatio ? LEG_RATIO_LABELS[draft.legRatio] : "未设置"}
          onClick={() => setEditingField("legRatio")}
        />
        <ProfileFieldRow
          icon={<User size={16} className="text-denim" aria-hidden="true" />}
          label="发型 / 发色"
          value={draft.hairDescription?.trim() || "无"}
          onClick={() => setEditingField("hair")}
        />
        <ProfileFieldRow
          icon={<User size={16} className="text-denim" aria-hidden="true" />}
          label="肤色 / 妆容偏好"
          value={draft.skinToneDescription?.trim() || "无"}
          onClick={() => setEditingField("skin")}
        />
        <ProfileFieldRow
          icon={<ScrollText size={16} className="text-denim" aria-hidden="true" />}
          label="其他备注"
          value={draft.styleNote?.trim() || "无"}
          onClick={() => setEditingField("note")}
          isLast
        />
      </article>

      <p className="px-1 text-[11px] leading-relaxed text-ink/45">
        这些信息只保存在本机，用于推荐、买前评估和 AI 试穿。可随时修改以获得更准确的效果。
      </p>

      {/* 字段编辑弹窗 */}
      <ProfileFieldSheet
        field="height"
        open={editingField === "height"}
        title="身高"
        onClose={() => setEditingField(null)}
      >
        <label className="grid gap-1 text-sm font-medium">
          身高 (cm)
          <input
            type="number"
            inputMode="numeric"
            value={draft.heightCm ?? ""}
            onChange={(e) => setDraft((p) => ({ ...p, heightCm: e.target.value ? Number(e.target.value) : undefined }))}
            className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
            placeholder="例如 165"
            autoFocus
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setEditingField(null)} className="h-10 rounded-lg border border-ink/10 text-sm">完成</button>
          <button
            type="button"
            onClick={() => { setDraft((p) => ({ ...p, heightCm: undefined })); setEditingField(null); }}
            className="h-10 rounded-lg text-sm text-ink/55"
          >清除</button>
        </div>
      </ProfileFieldSheet>

      <ProfileFieldSheet
        field="bodyType"
        open={editingField === "bodyType"}
        title="体型"
        onClose={() => setEditingField(null)}
      >
        <div className="grid gap-2">
          {(["slim", "balanced", "curvy", "plus", "custom"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setDraft((p) => ({ ...p, bodyType: opt }))}
              className={`flex h-11 items-center justify-between rounded-lg border px-3 text-sm ${draft.bodyType === opt ? "border-denim bg-denim/5 text-denim font-semibold" : "border-ink/10 bg-white"}`}
            >
              <span>{BODY_TYPE_LABELS[opt]}</span>
              {draft.bodyType === opt ? <Check size={15} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
        {draft.bodyType === "custom" ? (
          <label className="mt-2 grid gap-1 text-sm font-medium">
            自定义描述
            <input
              value={draft.bodyTypeCustom ?? ""}
              onChange={(e) => setDraft((p) => ({ ...p, bodyTypeCustom: e.target.value }))}
              className="h-10 rounded-lg border border-ink/10 bg-white px-3 text-sm outline-none focus:border-denim"
              placeholder="例如 微胖梨形"
            />
          </label>
        ) : null}
        <button type="button" onClick={() => setEditingField(null)} className="h-10 w-full rounded-lg bg-denim text-sm font-semibold text-white">完成</button>
      </ProfileFieldSheet>

      <ProfileFieldSheet
        field="shoulder"
        open={editingField === "shoulder"}
        title="肩宽"
        onClose={() => setEditingField(null)}
      >
        <div className="grid gap-2">
          {(["narrow", "normal", "wide"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { setDraft((p) => ({ ...p, shoulderWidth: opt })); setEditingField(null); }}
              className={`flex h-11 items-center justify-between rounded-lg border px-3 text-sm ${draft.shoulderWidth === opt ? "border-denim bg-denim/5 text-denim font-semibold" : "border-ink/10 bg-white"}`}
            >
              <span>{SHOULDER_LABELS[opt]}</span>
              {draft.shoulderWidth === opt ? <Check size={15} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </ProfileFieldSheet>

      <ProfileFieldSheet
        field="legRatio"
        open={editingField === "legRatio"}
        title="腿长比例"
        onClose={() => setEditingField(null)}
      >
        <div className="grid gap-2">
          {(["short", "normal", "long"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { setDraft((p) => ({ ...p, legRatio: opt })); setEditingField(null); }}
              className={`flex h-11 items-center justify-between rounded-lg border px-3 text-sm ${draft.legRatio === opt ? "border-denim bg-denim/5 text-denim font-semibold" : "border-ink/10 bg-white"}`}
            >
              <span>{LEG_RATIO_LABELS[opt]}</span>
              {draft.legRatio === opt ? <Check size={15} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </ProfileFieldSheet>

      <ProfileFieldSheet
        field="hair"
        open={editingField === "hair"}
        title="发型 / 发色"
        onClose={() => setEditingField(null)}
      >
        <label className="grid gap-1 text-sm font-medium">
          发型 / 发色
          <input
            value={draft.hairDescription ?? ""}
            onChange={(e) => setDraft((p) => ({ ...p, hairDescription: e.target.value }))}
            className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
            placeholder="例如 黑色长发、棕色短发"
            autoFocus
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setEditingField(null)} className="h-10 rounded-lg border border-ink/10 text-sm">完成</button>
          <button type="button" onClick={() => { setDraft((p) => ({ ...p, hairDescription: undefined })); setEditingField(null); }} className="h-10 rounded-lg text-sm text-ink/55">清除</button>
        </div>
      </ProfileFieldSheet>

      <ProfileFieldSheet
        field="skin"
        open={editingField === "skin"}
        title="肤色 / 妆容偏好"
        onClose={() => setEditingField(null)}
      >
        <label className="grid gap-1 text-sm font-medium">
          肤色 / 妆容偏好
          <input
            value={draft.skinToneDescription ?? ""}
            onChange={(e) => setDraft((p) => ({ ...p, skinToneDescription: e.target.value }))}
            className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
            placeholder="例如 偏白肤色、淡妆"
            autoFocus
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setEditingField(null)} className="h-10 rounded-lg border border-ink/10 text-sm">完成</button>
          <button type="button" onClick={() => { setDraft((p) => ({ ...p, skinToneDescription: undefined })); setEditingField(null); }} className="h-10 rounded-lg text-sm text-ink/55">清除</button>
        </div>
      </ProfileFieldSheet>

      <ProfileFieldSheet
        field="note"
        open={editingField === "note"}
        title="其他备注"
        onClose={() => setEditingField(null)}
      >
        <label className="grid gap-1 text-sm font-medium">
          其他备注
          <textarea
            value={draft.styleNote ?? ""}
            onChange={(e) => setDraft((p) => ({ ...p, styleNote: e.target.value }))}
            rows={3}
            className="resize-none rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-denim"
            placeholder="比如 偏好 oversize / 通勤 / 户外"
            autoFocus
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setEditingField(null)} className="h-10 rounded-lg border border-ink/10 text-sm">完成</button>
          <button type="button" onClick={() => { setDraft((p) => ({ ...p, styleNote: undefined })); setEditingField(null); }} className="h-10 rounded-lg text-sm text-ink/55">清除</button>
        </div>
      </ProfileFieldSheet>
    </div>
  );
}

function ProfileFieldRow({
  icon,
  label,
  value,
  onClick,
  isLast = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick: () => void;
  isLast?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[60px] w-full items-center gap-3 bg-white px-4 text-left active:bg-mist ${isLast ? "" : "border-b border-ink/8"}`}
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-mist text-denim">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate text-[11px] text-ink/55">{value}</p>
      </div>
      <ChevronRight size={14} className="shrink-0 text-ink/30" aria-hidden="true" />
    </button>
  );
}

function ProfileFieldSheet({
  field,
  open,
  title,
  onClose,
  children,
}: {
  field: string;
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <MotionSheet open={open} onClose={onClose} panelClassName="!max-w-sm">
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      <div className="grid gap-3" data-field={field}>{children}</div>
    </MotionSheet>
  );
}

// ---------- 子页面: AI 试穿参考照片详情 ----------
function PhotosDetailPage({
  tryOnProfile,
  onSave,
  onBack,
  onMessage,
  onExpandImage,
}: {
  tryOnProfile: TryOnProfile;
  onSave: (profile: TryOnProfile) => Promise<void> | void;
  onBack: () => void;
  onMessage?: (msg: string) => void;
  onExpandImage?: (img: { src: string; alt: string }) => void;
}) {
  const [draft, setDraft] = useState<TryOnProfile>(tryOnProfile);
  const fullBodyInputRef = useRef<HTMLInputElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);
  const [cropJob, setCropJob] = useState<{ dataUrl: string; target: "fullBody" | "face" } | null>(null);

  useEffect(() => { setDraft(tryOnProfile); }, [tryOnProfile]);

  useEffect(() => {
    let removed = false;
    let handle: { remove: () => void } | null = null;
    App.addListener("backButton", () => {
      if (removed) return;
      if (cropJob) { setCropJob(null); return; }
      // 关闭时如有改动, 自动保存
      if (JSON.stringify(draft) !== JSON.stringify(tryOnProfile)) {
        void onSave({ ...draft, updatedAt: new Date().toISOString() });
        onMessage?.("AI 试穿参考照片已保存");
      }
      onBack();
    }).then((h) => { if (!removed) handle = h; });
    return () => { removed = true; handle?.remove(); };
  }, [cropJob, draft, tryOnProfile, onSave, onBack, onMessage]);

  async function openCrop(file: File | undefined, target: "fullBody" | "face", inputRef: React.RefObject<HTMLInputElement | null>) {
    if (!file) return;
    try {
      if (isHeicFile(file)) onMessage?.("正在转换 HEIC 图片...");
      const dataUrl = await fileToOriginalDataUrl(file);
      setCropJob({ dataUrl, target });
    } catch (error) {
      onMessage?.(getErrorMessage(error));
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleFinish() {
    await onSave({ ...draft, updatedAt: new Date().toISOString() });
    onMessage?.("AI 试穿参考照片已保存");
    onBack();
  }

  async function handleToggle(value: boolean) {
    const next: TryOnProfile = { ...draft, enabled: value, updatedAt: new Date().toISOString() };
    setDraft(next);
    await onSave(next);
    onMessage?.(value ? "已启用参考照" : "已关闭参考照");
  }

  return (
    <div className="grid gap-4 pb-2">
      <div className="flex items-center justify-between gap-3 px-1 pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleFinish}
            className="grid h-10 w-10 place-items-center rounded-full bg-mist active:scale-95 transition-transform"
            aria-label="返回设置"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <h1 className="text-lg font-semibold">AI 试穿参考照片</h1>
        </div>
        <button
          type="button"
          onClick={handleFinish}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-denim px-3 text-sm font-semibold text-white"
        >
          <Check size={14} aria-hidden="true" />完成
        </button>
      </div>

      <article className="surface rounded-lg px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">使用参考照生成试穿图</h2>
            <p className="mt-0.5 text-xs text-ink/55">开启后，仅在生成 AI 试穿图时，将参考照发送给 MiniMax。关闭后，AI 仍会使用上方穿衣画像进行推荐和生成。</p>
          </div>
          <SettingsSwitch
            checked={draft.enabled}
            onChange={handleToggle}
            ariaLabel={draft.enabled ? "关闭参考照" : "启用参考照"}
            className="h-6 w-11"
          />
        </div>
      </article>

      {draft.enabled ? (
        <article className="surface rounded-lg px-4 py-3.5">
          <h2 className="text-base font-semibold">参考照片</h2>
          <p className="mt-0.5 text-xs text-ink/55">全身照和脸部照各 1 张，用于试穿时参考人物姿态与外貌</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <PhotoSlot
              label="全身照"
              required
              src={draft.fullBodyImageDataUrl}
              inUse={Boolean(draft.fullBodyImageDataUrl)}
              onUpload={() => fullBodyInputRef.current?.click()}
              onExpand={() => draft.fullBodyImageDataUrl && onExpandImage?.({ src: draft.fullBodyImageDataUrl, alt: "全身照" })}
              onDelete={() => { if (confirm("确认删除全身参考照？")) setDraft((p) => ({ ...p, fullBodyImageDataUrl: undefined })); }}
            />
            <PhotoSlot
              label="脸部照"
              src={draft.faceImageDataUrl}
              inUse={Boolean(draft.faceImageDataUrl)}
              onUpload={() => faceInputRef.current?.click()}
              onExpand={() => draft.faceImageDataUrl && onExpandImage?.({ src: draft.faceImageDataUrl, alt: "脸部照" })}
              onDelete={() => { if (confirm("确认删除脸部参考照？")) setDraft((p) => ({ ...p, faceImageDataUrl: undefined })); }}
            />
          </div>
          <input ref={fullBodyInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="hidden" onChange={(e) => openCrop(e.target.files?.[0], "fullBody", fullBodyInputRef)} />
          <input ref={faceInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="hidden" onChange={(e) => openCrop(e.target.files?.[0], "face", faceInputRef)} />

          <div className="mt-4">
            <p className="text-[11px] font-semibold text-ink/55">如何拍摄效果更好？</p>
            <ul className="mt-1.5 space-y-1 text-[11px] text-ink/55">
              <li>· 全身照：请保持站直、光线均匀、避免遮挡。</li>
              <li>· 脸部照：正脸、表情自然、妆容轻淡。</li>
            </ul>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-lg bg-mist p-2.5">
            <Shield size={14} className="mt-0.5 shrink-0 text-denim" aria-hidden="true" />
            <p className="text-[11px] leading-relaxed text-ink/65">照片仅在生成 AI 试穿图时发送给 MiniMax，不会用于其他用途或公开展示。</p>
          </div>
        </article>
      ) : (
        <article className="surface rounded-lg px-4 py-3.5">
          <p className="text-sm text-ink/55 leading-relaxed">关闭后，不会使用你的照片。AI 试穿将仅根据穿衣画像生成。</p>
          <p className="mt-2 text-[11px] text-ink/45">开启后可在上方添加全身照和脸部照。</p>
        </article>
      )}

      {cropJob && (
        <ImageCropEditor
          source={cropJob.dataUrl}
          aspectRatio={cropJob.target === "face" ? 1 : 0.75}
          onCancel={() => setCropJob(null)}
          onError={(error) => onMessage?.(error)}
          onConfirm={(croppedDataUrl) => {
            if (cropJob.target === "face") {
              setDraft((p) => ({ ...p, faceImageDataUrl: croppedDataUrl }));
            } else {
              setDraft((p) => ({ ...p, fullBodyImageDataUrl: croppedDataUrl }));
            }
            setCropJob(null);
          }}
        />
      )}
    </div>
  );
}

function PhotoSlot({
  label,
  helper,
  src,
  inUse,
  required,
  disabled,
  onUpload,
  onExpand,
  onDelete,
}: {
  label: string;
  helper?: string;
  src?: string;
  inUse?: boolean;
  required?: boolean;
  disabled?: boolean;
  onUpload: () => void;
  onExpand?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="relative h-[120px] overflow-hidden rounded-lg border border-ink/10 bg-white">
        {src ? (
          <button
            type="button"
            onClick={onExpand}
            className="absolute inset-0 grid place-items-center"
            aria-label="查看大图"
          >
            <GarmentImage src={src} alt={label} />
          </button>
        ) : (
          <button
            type="button"
            onClick={disabled ? undefined : onUpload}
            disabled={disabled}
            className={`absolute inset-0 grid place-items-center text-ink/40 ${disabled ? "cursor-not-allowed" : "hover:text-denim"}`}
            aria-label={label}
          >
            {disabled ? (
              <span className="text-2xl">+</span>
            ) : (
              <Camera size={24} aria-hidden="true" />
            )}
          </button>
        )}
        {src && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white active:scale-95 transition-transform"
            aria-label={`删除${label}`}
          >
            <X size={12} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">
            {label}
            {required ? <span className="ml-0.5 text-red-400">*</span> : null}
          </p>
          {helper ? <p className="truncate text-[10px] text-ink/45">{helper}</p> : null}
        </div>
        {inUse ? (
          <span className="shrink-0 rounded-full bg-moss/10 px-1.5 py-0.5 text-[9px] font-semibold text-moss">使用中</span>
        ) : null}
      </div>
      {src ? (
        <button
          type="button"
          onClick={onUpload}
          className="h-6 w-full rounded-md border border-ink/10 text-[10px] text-ink/65 active:scale-95 transition-transform"
        >更换</button>
      ) : null}
    </div>
  );
}

// ---------- 子页面: MiniMax 配置详情 ----------
function MiniMaxDetailPage({
  settings,
  onSave,
  onBack,
  onMessage,
}: {
  settings: DeviceMiniMaxSettings;
  onSave: (settings: DeviceMiniMaxSettings) => void;
  onBack: () => void;
  onMessage?: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<DeviceMiniMaxSettings>(settings);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => { setDraft(settings); }, [settings]);

  useEffect(() => {
    let removed = false;
    let handle: { remove: () => void } | null = null;
    App.addListener("backButton", () => { if (!removed) onBack(); }).then((h) => { if (!removed) handle = h; });
    return () => { removed = true; handle?.remove(); };
  }, [onBack]);

  const apiKeyDirty = draft.apiKey !== settings.apiKey;
  const apiHostDirty = draft.apiHost !== settings.apiHost;
  const dirty = apiKeyDirty || apiHostDirty;

  function handleSave() {
    onSave(draft);
    onMessage?.("MiniMax 设置已保存");
  }

  return (
    <div className="grid gap-4 pb-2">
      <div className="flex items-center justify-between gap-3 px-1 pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="grid h-10 w-10 place-items-center rounded-full bg-mist active:scale-95 transition-transform"
            aria-label="返回设置"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <h1 className="text-lg font-semibold">配置 MiniMax 密钥</h1>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-denim px-3 text-sm font-semibold text-white disabled:bg-ink/15 disabled:text-ink/40"
        >
          <SaveAll size={14} aria-hidden="true" />保存
        </button>
      </div>

      <article className="surface rounded-lg px-4 py-3.5 grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium">
          API Key
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={draft.apiKey}
              onChange={(e) => setDraft((p) => ({ ...p, apiKey: e.target.value }))}
              className="h-11 w-full rounded-lg border border-ink/10 bg-white px-3 pr-11 text-base outline-none focus:border-denim"
              placeholder="填写 MiniMax Key"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-1 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-md text-ink/55 active:scale-95 transition-transform"
              aria-label={showKey ? "隐藏密钥" : "显示密钥"}
            >
              {showKey ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
        </label>

        <label className="grid gap-1.5 text-sm font-medium">
          API Host
          <input
            value={draft.apiHost}
            onChange={(e) => setDraft((p) => ({ ...p, apiHost: e.target.value }))}
            className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
          />
        </label>

        <div className="grid gap-1.5">
          <span className="text-sm font-medium">模型</span>
          <div className="inline-flex h-11 items-center gap-2 rounded-lg border border-ink/10 bg-mist px-3 text-sm font-semibold text-ink/65">
            <Sparkles size={14} className="text-clay" aria-hidden="true" />
            MiniMax-M3
            <span className="ml-1 text-[10px] font-normal text-ink/45">（当前项目固定）</span>
          </div>
        </div>
      </article>

      <div className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-ink/50">
        <Lock size={13} className="mt-0.5 shrink-0 text-ink/45" aria-hidden="true" />
        <span>密钥仅保存在本机，不会上传至服务器。点击保存时会调用 validateMiniMaxKey 验证有效性，失败会保留输入。</span>
      </div>
    </div>
  );
}

// ---------- 子页面: 全部衣橱管理 ----------
function WardrobeListPage({
  items,
  locations,
  onBack,
  onAdd,
  onEdit,
}: {
  items: WardrobeItem[];
  locations: ClosetLocation[];
  onBack: () => void;
  onAdd: () => void;
  onEdit: (location: ClosetLocation) => void;
}) {
  const locationCounts = new Map<string, number>();
  for (const item of items) locationCounts.set(item.locationId, (locationCounts.get(item.locationId) ?? 0) + 1);
  const sortedLocations = [...locations].sort((a, b) => a.sortOrder - b.sortOrder);

  useEffect(() => {
    let removed = false;
    let handle: { remove: () => void } | null = null;
    App.addListener("backButton", () => { if (!removed) onBack(); }).then((h) => { if (!removed) handle = h; });
    return () => { removed = true; handle?.remove(); };
  }, [onBack]);

  return (
    <div className="grid gap-4 pb-2">
      <div className="flex items-center justify-between gap-3 px-1 pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="grid h-10 w-10 place-items-center rounded-full bg-mist active:scale-95 transition-transform"
            aria-label="返回设置"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <h1 className="text-lg font-semibold">全部衣橱</h1>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-denim px-3 text-sm font-semibold text-white"
        >
          <Plus size={14} aria-hidden="true" />添加衣橱
        </button>
      </div>

      <article className="surface rounded-lg overflow-hidden">
        {sortedLocations.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-ink/45">还没有衣橱位置</p>
        ) : (
          sortedLocations.map((location, idx) => (
            <div key={location.id} className={idx > 0 ? "border-t border-ink/8" : ""}>
              <WardrobeRow
                location={location}
                count={locationCounts.get(location.id) ?? 0}
                isDefault={location.id === "home"}
                onClick={() => onEdit(location)}
              />
            </div>
          ))
        )}
      </article>
    </div>
  );
}

function blurActiveElement() {
  try { (document.activeElement as HTMLElement | null)?.blur?.(); } catch {}
}


function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function NavButton({ view, active, onClick }: { view: (typeof viewItems)[number]; active: boolean; onClick: () => void }) {
  const Icon = view.icon;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold ${
        active ? "bg-denim text-white" : "text-ink/68 hover:bg-ink/5"
      }`}
      whileTap={{ scale: 0.96 }}
      transition={spring.snappy}
    >
      <motion.span
        animate={active ? { scale: 1.08 } : { scale: 1 }}
        transition={spring.snappy}
        style={{ display: "inline-flex" }}
      >
        <Icon size={17} aria-hidden="true" />
      </motion.span>
      {view.label}
    </motion.button>
  );
}

function MobileNavButton({ view, active, onClick, compact }: { view: (typeof viewItems)[number]; active: boolean; onClick: () => void; compact?: boolean }) {
  const Icon = view.icon;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      animate={{
        backgroundColor: active ? "#355c7d" : "rgba(0,0,0,0)",
        color: active ? "#ffffff" : "rgba(0,0,0,0.62)",
      }}
      transition={spring.snappy}
      className={`grid ${compact ? "h-10" : "h-12"} place-content-center justify-items-center gap-0 rounded-lg px-1 text-[11px] font-semibold`}
      whileTap={{ scale: 0.94 }}
    >
      {!compact && (
        <motion.span
          animate={active ? { scale: 1.08 } : { scale: 1 }}
          transition={spring.snappy}
          style={{ display: "inline-flex" }}
        >
          <Icon size={17} aria-hidden="true" />
        </motion.span>
      )}
      <span className={compact ? "leading-none" : "leading-tight"}>{view.label}</span>
    </motion.button>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white p-3 text-center">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-ink/54">{label}</p>
    </div>
  );
}

function sortForSnapshot(values: string[]) {
  return uniqueTrimmed(values).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function colorInfoFromChipGroups(primaryColors: string[], accentColors: string[]): ColorInfo {
  const primary = uniqueTrimmed(primaryColors).slice(0, 5);
  const accent = uniqueTrimmed(accentColors).filter((color) => !primary.includes(color)).slice(0, 5);
  if (primary.length > 1) return buildColorInfo("multicolor", primary);
  if (accent.length > 0) return buildColorInfo("main_with_accent", primary, accent);
  return buildColorInfo("single", primary);
}

function normalizeColorFields(input?: { colors?: ColorInfo } | ColorInfo | null) {
  const colorInfo = input && "mode" in input ? input : input?.colors;
  const safeColors = colorInfo ?? emptyColorInfo();
  const primaryColors = getPrimaryColors(safeColors);
  const accentColors = getAccentColors(safeColors);
  const mainColor = getPrimaryColor(safeColors);
  return {
    colorInfo: safeColors,
    colorMode: safeColors.mode,
    mainColor,
    accentColors,
    primaryColors,
    secondaryColors: accentColors,
  };
}

function normalizeDraftForEdit(item: WardrobeItem): WardrobeDraft {
  return {
    ...item,
    colors: item.colors ?? emptyColorInfo(),
    seasons: item.seasons.length > 0 ? item.seasons : ["all"],
    styles: item.styles.length > 0 ? item.styles : ["casual"],
    notes: item.notes ?? "",
  };
}

function cropBoxSnapshot(box?: GarmentCropBox) {
 if (!box) return "";
 return [box.x, box.y, box.width, box.height].map((value) => Number.isFinite(value) ? value.toFixed(6) : "0").join(",");
}

// v0.9.32-dev round-3:瀑布流卡片图片区(主图 + 参考穿搭图横滑)
// - 没参考图:跟旧版一样,只显示主图,不绑定手势
// - 有参考图:绑定横滑手势 +圆点指示
// - 横向切换成功后,阻止外层 MotionCard 的 onClick触发进详情页
// v0.9.32-dev round-3 关键改动(修上一轮"横滑没反应"bug):
// - touchAction: "pan-y" → "none", 让 JS 完全接管图片区手势, 跨 iOS/Android/微信一致
// - onPointerDown / Move / Up 全程 e.stopPropagation(), 防止外层 MotionCard 拦截手势
// - 累计 dx 算法保留 (movementX 优先, 回退用 clientX 减去基准)
function WaterfallCardImage({
 item,
 cardEntries,
 currentIdx,
 hasMultiple,
 isSelected,
 onSwipe,
 onClick,
 allItems,
 outfits,
}: {
 item: WardrobeItem;
 cardEntries: GarmentImageEntry[];
 currentIdx: number;
 hasMultiple: boolean;
 isSelected: boolean;
 onSwipe: (next: number) => void;
 onClick: () => void;
 allItems: WardrobeItem[];
 outfits: SavedOutfit[];
}) {
  // Build a map of outfit id → SavedOutfit for quick lookup
  const outfitMap = useMemo(() => {
    const map = new Map<string, SavedOutfit>();
    for (const o of outfits) map.set(o.id, o);
    return map;
  }, [outfits]);

  // Build slides from entries, resolving outfit entries to custom slides.
  // Filter out outfit entries whose outfitId can't be resolved.
  const slides: SwipeSlide[] = useMemo(() => {
    const result: SwipeSlide[] = [];
    for (let i = 0; i < cardEntries.length; i++) {
      const entry = cardEntries[i];
      const isMain = i === 0;

      if (entry.renderKind === "outfit") {
        const resolvedOutfit = entry.outfitId ? outfitMap.get(entry.outfitId) : undefined;
        if (!resolvedOutfit) continue; // skip unresolvable outfit entry
        result.push({
          kind: "custom",
          id: `outfit-${entry.outfitId ?? i}`,
          content: (
            <OutfitCover
              outfit={resolvedOutfit}
              items={allItems}
              size="detail"
              className="h-full w-full"
            />
          ),
          badge: "套装",
          badgeClassName: "bg-moss",
          ariaLabel: `相关套装 ${i}`,
        });
      } else {
        const badge = isMain ? "主图" : "灵感";
        result.push({
          kind: "image" as const,
          id: `${entry.source}-${entry.refId ?? entry.outfitId ?? i}`,
          imageDataUrl: entry.cardImageDataUrl,
          thumbnailSrc: entry.cardImageDataUrl,
          displaySrc: entry.displayImageDataUrl,
          sourceSrc: entry.sourceImageDataUrl,
          fallbackImageDataUrl: entry.displayImageDataUrl,
          alt: isMain ? item.name : `穿搭灵感 ${i}`,
          badge,
          badgeClassName: isMain ? "bg-denim" : "bg-clay",
          realIndex: i,
        });
      }
    }
    return result;
  }, [cardEntries, outfitMap, allItems, item.name]);

  const safeIdx = useMemo(() => {
    if (slides.length === 0) return 0;
    return Math.max(0, Math.min(currentIdx, slides.length - 1));
  }, [slides.length, currentIdx]);

  const effectiveHasMultiple = slides.length > 1;

 useEffect(() => {
   if (safeIdx !== currentIdx) onSwipe(safeIdx);
 }, [currentIdx, onSwipe, safeIdx]);

  // Click handler for outfit custom slides: still navigate to item detail
  const handleCustomClick = useCallback(() => onClick(), [onClick]);

 return (
 <div className="relative h-[210px] w-full shrink-0 overflow-hidden bg-mist">
 <SwipeImageCarousel
 slides={slides}
 index={safeIdx}
 onIndexChange={onSwipe}
 onImageClick={() => onClick()}
 onCustomClick={handleCustomClick}
 className="absolute inset-0"
 imageClassName="object-contain"
 showDots={effectiveHasMultiple}
 variant="card"
 ariaLabel="衣物图片组"
 />
 {isSelected ? (
 <span className="absolute top-2 right-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-denim text-white" aria-label="已勾选">
 <Check size={12} />
 </span>
 ) : null}
 </div>
 );
}

function editSnapshotFromDraft(draft: WardrobeDraft): EditSnapshot {
  const colors = normalizeColorFields(draft);
  const tempSnapshot = draft.temperatureRange
    ? `${draft.temperatureRange.minC ?? ""}-${draft.temperatureRange.maxC ?? ""}`
    : "";
  return {
    name: draft.name.trim(),
    category: draft.category,
    subcategory: (draft.subcategory ?? "").trim(),
    colors: JSON.stringify({
      mode: colors.colorMode,
      primary: sortForSnapshot(colors.primaryColors),
      accent: sortForSnapshot(colors.accentColors),
    }),
    seasons: sortForSnapshot(draft.seasons),
    styles: sortForSnapshot(draft.styles),
    formality: clampNumber(draft.formality ?? 3, 1, 5),
    warmth: clampNumber(draft.warmth ?? 3, 1, 5),
    status: draft.status,
    locationId: draft.locationId,
    notes: (draft.notes ?? "").trim(),
    imageDataUrl: draft.imageDataUrl || "",
    sourceImageDataUrl: draft.sourceImageDataUrl || "",
    cropBox: cropBoxSnapshot(draft.cropBox),
    fitGender: draft.fitGender ?? "unknown",
    fitNotes: (draft.fitNotes ?? "").trim(),
    price: draft.price != null ? String(draft.price) : "",
    productUrl: (draft.productUrl ?? "").trim(),
    purchaseDate: draft.purchaseDate ?? "",
    temperatureRange: tempSnapshot,
    material: (draft.material ?? "").trim(),
    aiConfidence: draft.aiConfidence,
    needsReview: draft.needsReview,
  };
}

function snapshotsEqual(a: EditSnapshot | null, b: EditSnapshot | null) {
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function outfitCaptureDraftToWardrobeItem(draft: WardrobeDraft, now: string): WardrobeItem {
  return {
    name: draft.name.trim() || "新衣服",
    imageDataUrl: draft.imageDataUrl,
    sourceImageDataUrl: draft.sourceImageDataUrl,
    cropBox: draft.cropBox,
    category: draft.category,
    subcategory: draft.subcategory,
    colors: draft.colors,
    seasons: draft.seasons.length > 0 ? draft.seasons : ["all"],
    styles: draft.styles.length > 0 ? draft.styles : ["casual"],
    formality: draft.formality,
    warmth: draft.warmth,
    locationId: draft.locationId,
    status: draft.status,
    notes: draft.notes,
    aiConfidence: draft.aiConfidence,
    needsReview: draft.needsReview,
    fitGender: draft.fitGender ?? "unknown",
    fitNotes: draft.fitNotes?.trim() || undefined,
    wornDates: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createSavedOutfit(itemIds: number[], drafts: WardrobeDraft[], source: SavedOutfit["source"], now: string, name?: string): SavedOutfit {
  return {
    id: `${source}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
    name: name?.trim() || `${source === "capture" ? "图片套装" : "收藏套装"} · ${itemIds.length} 件`,
    itemIds,
    coverImageDataUrl: drafts.find((draft) => draft.imageDataUrl)?.imageDataUrl,
    source,
    favorite: true,
    createdAt: now,
    updatedAt: now,
  };
}

const OUTFIT_NAME_FALLBACKS: Record<string, string> = {
  casual: "休闲", sweet: "甜美", elegant: "优雅", commute: "通勤",
  outdoor: "户外", dinner: "吃饭", vacation: "旅行",
};
const OUTFIT_NAME_COLORS: Record<string, string> = {
  黑: "黑色", 白: "白色", 灰: "灰色", 蓝: "蓝色", 牛仔蓝: "牛仔蓝",
  棕: "棕色", 米: "米色", 红: "红色", 粉: "粉色", 绿: "绿色",
  黄: "黄色", 紫: "紫色",
};

function generateLocalOutfitName(drafts: WardrobeDraft[]): string {
  const allStyles = [...new Set(drafts.flatMap((d) => d.styles))];
  const allColors = [...new Set(drafts.flatMap((d) => getAllColors(d.colors)))];
  const styleStr = allStyles.slice(0, 2).map((s) => OUTFIT_NAME_FALLBACKS[s] || s).join("");
  const colorStr = allColors.slice(0, 2).map((c) => OUTFIT_NAME_COLORS[c] || c).join("");
  if (styleStr && colorStr) return `${colorStr}${styleStr}套装`;
  if (styleStr) return `${styleStr}套装`;
  if (colorStr) return `${colorStr}套装`;
  return `${drafts.length}件搭配`;
}

function estimateWeatherInsight(request: Pick<OutfitRequest, "destination" | "date">): WeatherInsight {
  const destination = request.destination || "目的地";
  const month = resolveRequestMonth(request);
  const summerTemperature = estimateDestinationSummerTemperature(destination);
  if ([12, 1, 2].includes(month)) {
    return { weather: "cloudy", temperatureC: 8, summary: `${destination}按冬季典型天气估算，偏冷`, source: "fallback" };
  }
  if ([6, 7, 8].includes(month)) {
    return { weather: "sunny", temperatureC: summerTemperature, summary: `${destination}按夏季典型天气估算，${summerTemperature >= 29 ? "偏热" : "温和"}`, source: "typical" };
  }
  if ([3, 4, 5].includes(month)) {
    return { weather: "cloudy", temperatureC: 22, summary: `${destination}按春季典型天气估算，温和`, source: "fallback" };
  }
  return { weather: "cloudy", temperatureC: 19, summary: `${destination}按秋季典型天气估算，微凉`, source: "fallback" };
}

function estimateDestinationSummerTemperature(destination: string) {
  if (/伊犁|伊宁|那拉提|喀拉峻|昭苏|特克斯|霍城|呼伦贝尔|海拉尔|额尔古纳|锡林郭勒|乌兰布统|阿勒泰|喀纳斯|禾木|赛里木湖|天山|巴音布鲁克|西藏|拉萨|林芝|纳木错|羊湖|青海|青海湖|甘南|川西|稻城|亚丁|四姑娘山|香格里拉/.test(destination)) {
    return 24;
  }
  if (/敦煌|鸣沙山|月牙泉|吐鲁番|火焰山|库木塔格|塔克拉玛干|腾格里|中卫|沙坡头/.test(destination)) {
    return 34;
  }
  if (/三亚|海南|海口|万宁|陵水|亚龙湾|广州|深圳|珠海|香港|澳门/.test(destination)) {
    return 31;
  }
  if (/厦门|鼓浪屿|青岛|舟山|平潭|北海/.test(destination)) {
    return 29;
  }
  return 30;
}

function resolveRequestMonth(request: Pick<OutfitRequest, "destination" | "date">) {
  const destinationMonth = request.destination?.match(/(?:^|[^0-9])([1-9]|1[0-2])\s*月/)?.[1];
  if (destinationMonth) return Number(destinationMonth);
  const dateMonth = Number((request.date || new Date().toISOString().slice(0, 10)).slice(5, 7));
  return Number.isFinite(dateMonth) && dateMonth >= 1 && dateMonth <= 12 ? dateMonth : new Date().getMonth() + 1;
}

function loadChoiceCounts(key: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function saveChoiceCounts(key: string, counts: Record<string, number>) {
  localStorage.setItem(key, JSON.stringify(counts));
}

function bumpChoiceCount(counts: Record<string, number>, value: string) {
  const normalized = value.trim();
  if (!normalized) return counts;
  return {
    ...counts,
    [normalized]: (counts[normalized] ?? 0) + 1,
  };
}

function sortedChoiceOptions(counts: Record<string, number>) {
  const values = Array.from(new Set([...styleOptions, ...Object.keys(counts)]));
  return values
    .map((value) => ({
      value,
      label: STYLE_LABELS[value as GarmentStyle] ?? value,
      count: counts[value] ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-Hans-CN"));
}

function tagResultToDraft(result: GarmentTagResult, imageDataUrl: string, sourceImageDataUrl: string, locationId: string, source: WardrobeDraft["captureSource"], clientSeed: string): WardrobeDraft {
  return {
    clientId: `${Date.now()}-${clientSeed}-${Math.random().toString(36).slice(2, 8)}`,
    selected: true,
    captureSource: source,
    name: result.candidateNames[0] ?? cleanName(clientSeed),
    imageDataUrl, sourceImageDataUrl,
    category: result.category,
    subcategory: result.subcategory,
    colors: result.colors,
    seasons: result.seasons,
    styles: result.styles,
    formality: result.formality,
    warmth: result.warmth,
    locationId,
    status: "active",
    notes: result.notes ?? "",
    needsReview: result.needsReview,
    aiConfidence: result.confidence,
    fitGender: result.fitGender ?? "unknown",
    fitNotes: result.fitNotes?.trim() || undefined,
  };
}

function createEmptyDraft(locationId = "home"): WardrobeDraft {
  return {
    name: "",
    imageDataUrl: "",
    category: "tops",
    colors: emptyColorInfo(),
    seasons: ["all"],
    styles: ["casual"],
    formality: 2,
    warmth: 2,
    locationId,
    status: "active",
    notes: "",
    needsReview: true,
  };
}

function createDefaultRequest(): OutfitRequest {
  return {
    destination: "新餐厅",
    date: new Date().toISOString().slice(0, 10),
    activity: "dinner",
    weather: "sunny",
    temperatureC: 23,
    stylePreference: "elegant",
    availableLocationIds: [],
  };
}

function fallbackTagResult(fileName = "新衣服"): GarmentTagResult {
  return {
    candidateNames: [cleanName(fileName)],
    category: "tops",
    colors: buildColorInfo("single", ["白"]),
    seasons: ["all"],
    styles: ["casual"],
    formality: 2,
    warmth: 2,
    confidence: 0.42,
    needsReview: true,
    notes: "未配置 MiniMax Key，已生成可编辑的默认标签",
    fitGender: "unknown",
  };
}

function cleanName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "新衣服";
}

function createDemoItem(
  name: string,
  category: GarmentCategory,
  primaryColors: string[],
  secondaryColors: string[],
  seasons: Season[],
  styles: GarmentStyle[],
  formality: number,
  warmth: number,
  locationId: string,
  background: string,
  foreground: string,
  now: string,
): WardrobeItem {
  return {
    name,
    imageDataUrl: garmentSvg(name, background, foreground),
    category,
    colors: colorInfoFromChipGroups(primaryColors, secondaryColors),
    seasons,
    styles,
    formality,
    warmth,
    locationId,
    status: "active",
    wornDates: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createDemoOutfit(itemIds: number[], now: string): SavedOutfit {
  const outfitItemIds = itemIds.slice(0, 4);
  const wornDates = [relativeDateKey(10), relativeDateKey(3)];

  return {
    id: `demo-outfit-${Date.now()}`,
    name: "示例通勤套装",
    itemIds: outfitItemIds,
    previewImageDataUrl: demoOutfitCoverSvg(),
    destination: "办公室",
    activity: "通勤",
    style: "轻熟通勤",
    source: "manual",
    favorite: true,
    seasons: ["spring", "autumn"],
    sceneTags: ["通勤", "晚餐"],
    styleTags: ["优雅", "轻熟"],
    pairingTags: ["显高", "轻通勤"],
    temperatureRange: { minC: 14, maxC: 24 },
    notes: "示例套装：用于真机测试套装列表、详情、AI建议、穿着记录和统计页。",
    wornDates,
    aiSuggestion: {
      summary: "这套适合办公室通勤和轻正式晚餐，层次清楚，颜色克制。",
      suitableScenes: ["办公室", "商务休闲晚餐", "春秋通勤"],
      unsuitableScenes: ["雨天长时间步行", "高强度户外活动"],
      strengths: ["衬衫和风衣形成干净层次", "黑色鞋子提高整体正式度"],
      risks: ["托特包颜色偏亮，正式会议前可替换为深色包"],
      replacementSuggestions: [],
      missingItems: ["细腰带", "小件金属首饰"],
      generatedAt: now,
      source: "local",
    },
    createdAt: now,
    updatedAt: now,
  };
}

function garmentSvg(label: string, background: string, foreground: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
      <rect width="800" height="1000" fill="${background}"/>
      <path d="M260 230c58-70 222-70 280 0l112 148-92 86-66-74v360H306V390l-66 74-92-86 112-148Z" fill="${foreground}" opacity="0.92"/>
      <text x="400" y="855" text-anchor="middle" fill="#1d2228" font-family="Arial, sans-serif" font-size="48" font-weight="700">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function demoOutfitCoverSvg() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
      <rect width="800" height="1000" fill="#f8fafc"/>
      <rect x="64" y="88" width="672" height="824" rx="44" fill="#fffdf8" stroke="#d8c7ad" stroke-width="4"/>
      <rect x="126" y="160" width="238" height="278" rx="28" fill="#f8fafc" stroke="#355c7d" stroke-width="8"/>
      <path d="M204 228c34-36 84-36 118 0l46 64-42 38-22-28v96h-82v-96l-22 28-42-38 46-64Z" fill="#355c7d" opacity="0.92"/>
      <rect x="436" y="160" width="238" height="278" rx="28" fill="#dbeafe" stroke="#1d4ed8" stroke-width="8"/>
      <path d="M506 228h100l32 170H474l32-170Z" fill="#1d4ed8" opacity="0.84"/>
      <rect x="126" y="496" width="238" height="278" rx="28" fill="#f5e8d3" stroke="#b97155" stroke-width="8"/>
      <path d="M190 570c42-52 108-52 150 0l42 64-38 34-28-32v108H214V636l-28 32-38-34 42-64Z" fill="#b97155" opacity="0.82"/>
      <rect x="436" y="496" width="238" height="278" rx="28" fill="#111827" stroke="#475569" stroke-width="8"/>
      <path d="M490 676c46-34 106-34 152 0l-22 48H512l-22-48Z" fill="#f8fafc" opacity="0.9"/>
      <text x="400" y="860" text-anchor="middle" fill="#1d2228" font-family="Arial, sans-serif" font-size="48" font-weight="700">示例通勤套装</text>
      <text x="400" y="908" text-anchor="middle" fill="#667085" font-family="Arial, sans-serif" font-size="26">真机测试 · 套装详情 · AI建议</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// v0.9.33-dev: 示例衣物的"参考穿搭图"占位图 (SVG 拼的搭配卡, 主色 + 水印)。
// 用途: seedDemoItems 时给 5 件示例衣物各塞 1 张, 让瀑布流 + 详情页立刻多图,
// 用户能验证 v0.9.32-dev 横滑手感。视觉上跟 garmentSvg 区分: 米白底 + 主色装饰条 + "参考图 N"水印。
function demoReferenceSvg(garmentName: string, accentColor: string, index: number) {
  const safeAccent = /^#[0-9a-fA-F]{3,8}$/.test(accentColor) ? accentColor : "#475569";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
      <rect width="800" height="1000" fill="#fafaf7"/>
      <rect x="60" y="120" width="680" height="540" rx="32" fill="${safeAccent}" opacity="0.18"/>
      <rect x="60" y="120" width="680" height="540" rx="32" fill="none" stroke="${safeAccent}" stroke-width="3" stroke-dasharray="10 8" opacity="0.55"/>
      <circle cx="400" cy="380" r="86" fill="${safeAccent}" opacity="0.75"/>
      <path d="M260 540c40-44 240-44 280 0" fill="none" stroke="${safeAccent}" stroke-width="6" stroke-linecap="round" opacity="0.7"/>
      <text x="400" y="760" text-anchor="middle" fill="#1d2228" font-family="Arial, sans-serif" font-size="44" font-weight="700">灵感图 · ${garmentName}</text>
      <text x="400" y="820" text-anchor="middle" fill="#475569" font-family="Arial, sans-serif" font-size="28" font-weight="500">搭配灵感 ${index}</text>
      <text x="400" y="900" text-anchor="middle" fill="#94a3b8" font-family="Arial, sans-serif" font-size="20">示例 · 可长按详情页删除或添加</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function relativeDateKey(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toggle<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}


function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}

// v1.1.20-dev commit2 (P2 诊断): runLoggedDbTransaction
// 包裹任意 Dexie 事务, 集中记录 started / succeeded / failed 三个事件。
// 复现 Dexie 数据丢失 / 写入冲突 / 单件保存失败类 bug 必备。
// 不改 db.transaction 调用形式, 只在外面加 try/catch + recordDiagnosticEvent。
async function runLoggedDbTransaction(
  purpose: string,
  run: () => Promise<unknown>,
): Promise<unknown> {
  recordDiagnosticEvent("db_transaction_started", { purpose });
  const startedAt = Date.now();
  try {
    const result = await run();
    recordDiagnosticEvent("db_transaction_succeeded", { purpose, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    recordDiagnosticEvent("db_transaction_failed", {
      purpose,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("本地衣橱数据库打开超时")), timeoutMs);
    }),
  ]);
}
