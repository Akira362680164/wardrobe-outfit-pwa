// src/components/wishlist-view-2.0.tsx
// v0.9.49-dev 种草 2.0: 种草首页 + 详情页 + 子页面

import React, { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MotionSheet } from "@/components/motion-common";
import {
  ShoppingBag, Camera, Sparkles, ChevronLeft,
  MoreVertical, X, ImageIcon, Trash2, RotateCcw,
  ArrowLeft, Edit3, ChevronRight, Package,
  AlertCircle, CheckCircle2, HelpCircle, ThumbsUp,
  ThumbsDown, MinusCircle, ChevronDown, Check, Shirt,
  Crop, RefreshCw, Loader2,
} from "lucide-react";

import type {
  WishlistItem, WardrobeItem, SavedOutfit, ClosetLocation,
  WishlistAssessment, WishlistVerdict,
  GarmentFitGender, TemperatureRange, GarmentCategory, WishlistStatus,
} from "@/lib/types";
import {
  CATEGORY_LABELS, SEASON_LABELS, STYLE_LABELS,
  FIT_NOTES_MAX_LEN,
} from "@/lib/types";
import { formatGarmentFitGender, formatSubcategoryLabel } from "@/lib/display-labels";
import type { DeviceMiniMaxSettings } from "@/lib/device-minimax";
import { hasDeviceMiniMaxKey } from "@/lib/device-minimax";
import { buildWishlistEditRecognitionPatch } from "@/lib/item-recognition-patch";
import { getWardrobeDb } from "@/lib/db";

import {
  getWishlistDisplayState, getWishlistDisplayLabel, getWishlistStatusCapsuleColor,
  getWishlistCardSubtitle, isMainWishlistItem, filterMainWishlistItems,
  countPurchasedWishlistItems, countRejectedWishlistItems, countArchivedWishlistItems,
  getMainWishlistFilterCounts,
  type WishlistDisplayState, type WishlistMainFilter,
} from "@/lib/wishlist-display-state";

import {
  assessWishlistItemByRules,
  getRecommendedPairingsForWishlistItem,
  findSimilarWardrobeItemsForWishlistItem,
} from "@/lib/wishlist-assessment";

import { buildFallbackWishlistAssessment } from "@/lib/wishlist-ai-prompt";
import { convertWishlistToWardrobe, undoWishlistPurchaseFromRepo } from "@/lib/data-repo";
import { isWishlistPurchased } from "@/lib/wishlist-conversion";
import { isConvertedWishlistLinkDeleted } from "@/lib/wardrobe-reference-sync";

import { useSoftAiProgress } from "@/lib/use-soft-ai-progress";
import { fileToCompressedDataUrl } from "@/lib/image";
import type { NormalizedCropBox } from "@/lib/image";
import { GarmentIntakeFlow } from "@/components/garment-intake-flow";
import { ImageCropEditor } from "@/components/image-crop-editor";
import { GarmentImage } from "@/components/garment-image";
import { garmentDraftToWishlistItem } from "@/lib/intake-save-adapters";
import type { GarmentIntakeDraft } from "@/lib/intake-draft";
import { generateThumbnailSafe } from "@/lib/thumbnail-runtime";
import { useStableBackHandler } from "@/lib/use-stable-back-handler";
import { AppSubPageTopBar } from "@/components/app-sub-page-top-bar";
import { TemperatureRangeSlider } from "@/components/temperature-range-slider";
import { FitGenderChips } from "@/components/fit-gender-chips";
import { CategorySubcategoryPicker } from "@/components/category-subcategory-picker";
import { CatalogWaterfallCard } from "@/components/catalog-waterfall-card";
import { buildColorInfo, getAccentColors, getPrimaryColor, getPrimaryColors } from "@/lib/color-fields";
import {
  DetailAiCard,
  DetailHeroGallery,
  DetailQuickActions,
  DetailTabs,
  DetailTitleMetaBlock,
  DetailTopBar,
  getDetailSlideLabel,
} from "@/components/detail-shell";
import { NotesBlock } from "@/components/item/notes-block";
import { ItemField } from "@/components/item/field";
import { WishlistExtras } from "@/components/item/wishlist-extras";
import { SeasonStyleChips } from "@/components/item/season-style-chips";
import { FormalityWarmthStepper } from "@/components/item/formality-warmth-stepper";
import { ItemDetailSections } from "@/components/item/detail-sections";
import { ItemSectionCard } from "@/components/item/section-card";
import { ItemColorFields } from "@/components/item/color-fields";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type SubPage =
  | "home"
  | "detail"
  | "intake"
  | "add_edit"
  | "purchased"
  | "rejected"
  | "archived"
  | "convert_confirm";

interface WishlistView20Props {
  wishlistItems: WishlistItem[];
  setWishlistItems: React.Dispatch<React.SetStateAction<WishlistItem[]>>;
  items: WardrobeItem[];
  locations: ClosetLocation[];
  outfits: SavedOutfit[];
  settings: DeviceMiniMaxSettings;
  createTrigger: number;
  initialSubPage?: "purchased" | null;
  onInitialSubPageConsumed?: () => void;
  onCreateTriggerConsumed?: () => void;
  onCreateClosed?: () => void;
  onPickIntakeImages: React.ComponentProps<typeof GarmentIntakeFlow>["onPickImages"];
  onProcessIntakeImage?: React.ComponentProps<typeof GarmentIntakeFlow>["onProcessImage"];
  onMessage: (msg: string, type?: "success" | "error" | "info") => void;
  onExpandImage: (image: { src: string; alt: string }) => void;
  onSubPageChange?: (active: boolean) => void;
  onNavigateToItem?: (itemId: number) => Promise<void>;
  onWishlistConvertedToWardrobe?: (newItemId: number) => Promise<void>;
  onDataChanged?: () => void | Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  StatusCapsule                                                      */
/* ------------------------------------------------------------------ */

function StatusCapsule({ state, className }: { state: WishlistDisplayState; className?: string }) {
  const colors = getWishlistStatusCapsuleColor(state);
  const label = getWishlistDisplayLabel(state);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${colors.bg} ${colors.text} ${className ?? ""}`}>
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  ConfirmationDialog                                                 */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  open, title, message, confirmLabel, confirmClass, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmClass?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-2">{title}</h3>
        <p className="text-sm text-ink/60 mb-4 whitespace-pre-wrap">{message}</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="h-10 rounded-xl border border-ink/10 text-sm">取消</button>
          <button type="button" onClick={onConfirm} className={`h-10 rounded-xl text-sm font-semibold text-white ${confirmClass ?? "bg-denim"}`}>            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function NoticeDialog({
  open, title, message, confirmLabel = "知道了", onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-2">{title}</h3>
        <p className="text-sm text-ink/60 mb-4 whitespace-pre-wrap">{message}</p>
        <button type="button" onClick={onClose} className="h-10 w-full rounded-xl bg-denim text-sm font-semibold text-white">
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function WishlistView20({
  wishlistItems, setWishlistItems, items, locations, outfits, settings,
  createTrigger, initialSubPage, onInitialSubPageConsumed, onCreateTriggerConsumed, onCreateClosed, onMessage, onExpandImage, onSubPageChange, onNavigateToItem,
  onWishlistConvertedToWardrobe,
  onPickIntakeImages,
  onProcessIntakeImage,
  onDataChanged,
}: WishlistView20Props) {
  const [subPage, setSubPage] = useState<SubPage>("home");
  const [selectedItem, setSelectedItem] = useState<WishlistItem | null>(null);
  // v1.1.6 followup Commit 2: 用变量赋值替代早期 return, 让全局 dialogs 能在所有子页生效
  let subPageNode: React.ReactNode = null;
  const [mainFilter, setMainFilter] = useState<WishlistMainFilter>("all");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    onSubPageChange?.(subPage !== "home");
    return () => onSubPageChange?.(false);
  }, [onSubPageChange, subPage]);

  useEffect(() => {
    if (!initialSubPage) return;
    setSubPage(initialSubPage);
    onInitialSubPageConsumed?.();
  }, [initialSubPage, onInitialSubPageConsumed]);

  const closeWishlistIntake = useCallback(() => {
    setSubPage("home");
    setSelectedItem(null);
    setMenuOpen(false);
    onCreateClosed?.();
  }, [onCreateClosed]);

  // Subagent F: 通过快照比较判断表单是否有未保存修改（定义在 handler 之前，以便 handler 引用）
  const checkFormDirty = () => {
    const current = JSON.stringify({
      name: formName, imageDataUrl: formImageDataUrl,
      sourceImageDataUrl: formSourceImageDataUrl,
      cropBox: formCropBox, thumbnailDataUrl: formThumbnailDataUrl,
      category: formCategory,
      subcategory: formSubcategory, colorMode: formColorMode, mainColor: formMainColor,
      primaryColors: formPrimaryColors, accentColors: formAccentColors, seasons: formSeasons,
      styles: formStyles, temperatureRange: formTemperatureRange,
      fitGender: formFitGender, fitNotes: formFitNotes,
      price: formPrice, productUrl: formProductUrl,
      formality: formFormality, warmth: formWarmth, material: formMaterial, notes: formNote,
      status: formStatus,
    });
    return current !== formInitialSnapshotRef.current;
  };

  // Subagent F: Android 返回键处理 — 稳定 handler，只注册一次
  // 注：expandedImage（图片放大层）由父级 wardrobe-app 的 backButton handler 关闭（line ~503），
  // 父级 handler 在 shoppingSubPageActive 时返回但不消费事件，子的 handler 随后执行；
  // 此时 expandedImage 已由父级关闭，子的 handler 不需要重复处理。
  const isSubPage = subPage !== "home";
  useStableBackHandler(() => {
    // 1. 衣橱点选 sheet 关闭
    if (showLocationSheet) { setShowLocationSheet(false); return true; }
    // 2. 各种确认弹窗优先关闭 (子页有弹窗时按返回键只关弹窗)
    //    顺序: 撤销购买 / 删除记录 / 不再考虑 / 放弃修改
    if (showConvertedItemDeletedNotice) { setShowConvertedItemDeletedNotice(false); return true; }
    if (showUndoPurchaseConfirm) { setShowUndoPurchaseConfirm(false); return true; }
    if (showDeleteRecordConfirm) { setShowDeleteRecordConfirm(false); return true; }
    if (showRejectConfirm) { setShowRejectConfirm(false); return true; }
    if (showDiscardConfirm) { setShowDiscardConfirm(false); return true; }
    // 3. 种草录入页直接返回种草首页, 同步关闭外层 create flow 状态
    if (subPage === "intake") {
      closeWishlistIntake();
      return true;
    }
    // 4. add_edit 页面有未保存修改时打开放弃修改确认
    if (subPage === "add_edit" && checkFormDirty()) {
      setShowDiscardConfirm(true);
      return true;
    }
    // 5. add_edit 页面无未保存修改时返回 home
    if (subPage === "add_edit") {
      resetForm();
      setSubPage("home");
      setSelectedItem(null);
      return true;
    }
    // 6. convert_confirm 返回详情页
    if (subPage === "convert_confirm") {
      setSubPage("detail");
      return true;
    }
    // 7. detail 返回 home
    if (subPage === "detail") {
      setSubPage("home");
      setSelectedItem(null);
      setMenuOpen(false);
      return true;
    }
    // 8. purchased、rejected、archived 返回 home
    if (subPage === "purchased" || subPage === "rejected" || subPage === "archived") {
      setSubPage("home");
      setSelectedItem(null);
      return true;
    }
    return false;
  }, isSubPage);

  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [showUndoPurchaseConfirm, setShowUndoPurchaseConfirm] = useState(false);
  const [showDeleteRecordConfirm, setShowDeleteRecordConfirm] = useState(false);
  const [showConvertedItemDeletedNotice, setShowConvertedItemDeletedNotice] = useState(false);
  // Subagent F: 放弃修改确认
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // Subagent F: 表单是否有未保存修改（ref 避免每次输入触发 re-render）
  const formDirtyRef = useRef(false);
  // Subagent F: 表单初始快照，用于精确 dirty 检测（序列化所有字段用于比较）
  const formInitialSnapshotRef = useRef<string>("");
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [assessingId, setAssessingId] = useState<string | null>(null);
  // v0.9.49-dev auto-fix: 防 stale 写入 (b4614c9 I4 同款问题, 本次重新出现)。
  // 用户快速连续点 2 个不同种草单品, 第一次响应晚到时, runId 检查可阻止覆盖第二次的写入。
  const assessmentRunIdRef = useRef(0);
  const [detailTab, setDetailTab] = useState<"assessment" | "pairing" | "record">("assessment");

  // Add/Edit form state
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formImageDataUrl, setFormImageDataUrl] = useState("");
  const [formCategory, setFormCategory] = useState<string>("");
  const [formSubcategory, setFormSubcategory] = useState<string | undefined>(undefined);
  const [formColorMode, setFormColorMode] = useState("");
  const [formPrimaryColors, setFormPrimaryColors] = useState<string[]>([]);
  const [formMainColor, setFormMainColor] = useState("");
  const [formAccentColors, setFormAccentColors] = useState<string[]>([]);
  const [formSeasons, setFormSeasons] = useState<string[]>([]);
  const [formStyles, setFormStyles] = useState<string[]>([]);
  const [formTemperatureRange, setFormTemperatureRange] = useState<TemperatureRange | undefined>(undefined);
  const [formFitGender, setFormFitGender] = useState<GarmentFitGender | undefined>(undefined);
  const [formFitNotes, setFormFitNotes] = useState<string>("");
  const [formPrice, setFormPrice] = useState<string>("");
  const [formProductUrl, setFormProductUrl] = useState<string>("");
  const [formFormality, setFormFormality] = useState("");
  const [formWarmth, setFormWarmth] = useState("");
  const [formMaterial, setFormMaterial] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formStatus, setFormStatus] = useState<WishlistStatus>("interested");
  // v1.1.28 commit: 种草编辑复用衣橱裁切控件, 维护 sourceImageDataUrl / cropBox / thumbnailDataUrl
  const [formSourceImageDataUrl, setFormSourceImageDataUrl] = useState<string>("");
  const [formCropBox, setFormCropBox] = useState<NormalizedCropBox | undefined>(undefined);
  const [formThumbnailDataUrl, setFormThumbnailDataUrl] = useState<string | undefined>(undefined);
  const [wishlistCropJob, setWishlistCropJob] = useState<{
    dataUrl: string;
    startBox?: NormalizedCropBox;
  } | null>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  const aiProgress = useSoftAiProgress("shopping_assessment");

  const fallbackLocationId = locations[0]?.id ?? "home";

  // Subagent D: 衣橱点选状态
  const [selectedLocationId, setSelectedLocationId] = useState<string>(fallbackLocationId);
  const [showLocationSheet, setShowLocationSheet] = useState(false);

  /* ---- rule assessment map ---- */
  const ruleAssessmentMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof assessWishlistItemByRules>>();
    for (const w of wishlistItems) {
      if (!isMainWishlistItem(w)) continue;
      map.set(w.id, assessWishlistItemByRules({
        wishlistItem: w, wardrobeItems: items, outfits, fallbackLocationId,
      }));
    }
    return map;
  }, [wishlistItems, items, outfits, fallbackLocationId]);

  /* ---- computed lists ---- */
  const mainItems = useMemo(
    () => filterMainWishlistItems(wishlistItems, mainFilter),
    [wishlistItems, mainFilter],
  );

  const purchasedItems = useMemo(
    () => wishlistItems.filter((w) => isWishlistPurchased(w)),
    [wishlistItems],
  );

  const rejectedItems = useMemo(
    () => wishlistItems.filter((w) => w.status === "rejected"),
    [wishlistItems],
  );

  const archivedItems = useMemo(
    () => wishlistItems.filter((w) => w.status === "archived" && !isWishlistPurchased(w)),
    [wishlistItems],
  );

  /* ---- handlers ---- */

  const isConvertedLinkDeleted = useCallback(
    (item: WishlistItem) => isConvertedWishlistLinkDeleted(item, items),
    [items],
  );

  const showDeletedConvertedItemNotice = useCallback((item: WishlistItem) => {
    setSelectedItem(item);
    setShowConvertedItemDeletedNotice(true);
  }, []);

  const openConvertedWardrobeItem = useCallback(async (item: WishlistItem) => {
    if (isConvertedLinkDeleted(item)) {
      showDeletedConvertedItemNotice(item);
      return;
    }
    if (item.convertedItemId) await onNavigateToItem?.(item.convertedItemId);
  }, [isConvertedLinkDeleted, onNavigateToItem, showDeletedConvertedItemNotice]);

  const requestUndoPurchase = useCallback((item: WishlistItem) => {
    if (isConvertedLinkDeleted(item)) {
      showDeletedConvertedItemNotice(item);
      return;
    }
    setSelectedItem(item);
    setShowUndoPurchaseConfirm(true);
  }, [isConvertedLinkDeleted, showDeletedConvertedItemNotice]);

  const patchItem = useCallback(async (id: string, patch: Partial<WishlistItem>) => {
    const now = new Date().toISOString();
    const updated = { ...patch, updatedAt: now };
    await getWardrobeDb().wishlistItems.update(id, updated);
    setWishlistItems((prev) => prev.map((w) => w.id === id ? { ...w, ...updated } : w));
  }, [setWishlistItems]);

  const refreshItem = useCallback(async (id: string) => {
    const db = getWardrobeDb();
    const fresh = await db.wishlistItems.get(id);
    if (fresh) setWishlistItems((prev) => prev.map((w) => w.id === id ? fresh : w));
  }, [setWishlistItems]);

  /* ---- add/edit form ---- */

  const resetForm = useCallback(() => {
    setEditId(null); setFormName(""); setFormImageDataUrl("");
    setFormSourceImageDataUrl(""); setFormCropBox(undefined); setFormThumbnailDataUrl(undefined);
    setFormCategory(""); setFormSubcategory(undefined); setFormColorMode("");
    setFormPrimaryColors([]); setFormMainColor(""); setFormAccentColors([]); setFormSeasons([]);
    setFormStyles([]); setFormTemperatureRange(undefined); setFormFitGender(undefined);
    setFormFitNotes(""); setFormPrice(""); setFormProductUrl("");
    setFormFormality(""); setFormWarmth(""); setFormMaterial(""); setFormNote("");
    setFormStatus("interested");
    setWishlistCropJob(null);
    formDirtyRef.current = false;
    formInitialSnapshotRef.current = "";
  }, []);

  const openIntakeFlow = useCallback(() => { setSelectedItem(null); setMenuOpen(false); setSubPage("intake"); }, []);

  useEffect(() => {
    if (createTrigger > 0) {
      openIntakeFlow();
      onCreateTriggerConsumed?.();
    }
  }, [createTrigger, openIntakeFlow, onCreateTriggerConsumed]);

  const openEditForm = useCallback((item: WishlistItem) => {
    setEditId(item.id);
    setFormName(item.name ?? "");
    setFormImageDataUrl(item.imageDataUrl ?? "");
    setFormSourceImageDataUrl(item.sourceImageDataUrl ?? "");
    setFormCropBox(item.cropBox);
    setFormThumbnailDataUrl(item.thumbnailDataUrl);
    setFormCategory(item.category ?? "");
    setFormSubcategory(item.subcategory);
    setFormColorMode(item.colors.mode);
    setFormPrimaryColors(getPrimaryColors(item.colors));
    setFormMainColor(getPrimaryColor(item.colors));
    setFormAccentColors(getAccentColors(item.colors));
    setFormSeasons(item.seasons ?? []);
    setFormStyles(item.styles ?? []);
    setFormTemperatureRange(item.temperatureRange);
    setFormFitGender(item.fitGender);
    setFormFitNotes(item.fitNotes ?? "");
    setFormPrice(item.price != null ? String(item.price) : "");
    setFormProductUrl(item.productUrl ?? "");
    setFormFormality(item.formality != null ? String(item.formality) : "");
    setFormWarmth(item.warmth != null ? String(item.warmth) : "");
    setFormMaterial(item.material ?? "");
    setFormNote(item.notes ?? "");
    setFormStatus(item.status ?? "interested");
    // Subagent F: 捕获表单初始快照，用于精确 dirty 检测
    formInitialSnapshotRef.current = JSON.stringify({
      name: item.name ?? "",
      imageDataUrl: item.imageDataUrl ?? "",
      sourceImageDataUrl: item.sourceImageDataUrl ?? "",
      cropBox: item.cropBox,
      thumbnailDataUrl: item.thumbnailDataUrl,
      category: item.category ?? "",
      subcategory: item.subcategory ?? "",
      colorMode: item.colors.mode,
      primaryColors: getPrimaryColors(item.colors),
      mainColor: getPrimaryColor(item.colors),
      accentColors: getAccentColors(item.colors),
      seasons: item.seasons ?? [],
      styles: item.styles ?? [],
      temperatureRange: item.temperatureRange,
      fitGender: item.fitGender,
      fitNotes: item.fitNotes ?? "",
      price: item.price != null ? String(item.price) : "",
      productUrl: item.productUrl ?? "",
      formality: item.formality != null ? String(item.formality) : "",
      warmth: item.warmth != null ? String(item.warmth) : "",
      material: item.material ?? "",
      notes: item.notes ?? "",
      status: item.status ?? "interested",
    });
    formDirtyRef.current = false;
    setSubPage("add_edit");
  }, []);

  const handleSaveForm = useCallback(async () => {
    if (!formName.trim()) { onMessage("请输入商品名称", "info"); return; }
    const now = new Date().toISOString();
    // 适穿温度：把 min/max 数字（独立 Slider 返回 {minC, maxC}）规整为 Item schema 期待的 TemperatureRange
    const cleanedTempRange: TemperatureRange | undefined = (() => {
      if (!formTemperatureRange) return undefined;
      const hasMin = typeof formTemperatureRange.minC === "number" && Number.isFinite(formTemperatureRange.minC);
      const hasMax = typeof formTemperatureRange.maxC === "number" && Number.isFinite(formTemperatureRange.maxC);
      if (!hasMin && !hasMax) return undefined;
      return {
        ...(hasMin ? { minC: formTemperatureRange.minC as number } : {}),
        ...(hasMax ? { maxC: formTemperatureRange.maxC as number } : {}),
      };
    })();
    const base = {
      name: formName.trim(),
      imageDataUrl: formImageDataUrl,
      sourceImageDataUrl: formSourceImageDataUrl || undefined,
      cropBox: formCropBox,
      thumbnailDataUrl: formThumbnailDataUrl,
      category: (formCategory || "tops") as WishlistItem["category"],
      subcategory: formSubcategory || undefined,
      colors: buildColorInfo((formColorMode || "single") as WishlistItem["colors"]["mode"], formPrimaryColors.length > 0 ? formPrimaryColors : (formMainColor ? [formMainColor] : []), formAccentColors),
      seasons: formSeasons.length > 0 ? (formSeasons as WishlistItem["seasons"]) : [],
      styles: formStyles.length > 0 ? (formStyles as WishlistItem["styles"]) : [],
      temperatureRange: cleanedTempRange,
      fitGender: formFitGender,
      fitNotes: formFitNotes.trim() || undefined,
      price: formPrice.trim() ? parseFloat(formPrice) : undefined,
      productUrl: formProductUrl.trim() || undefined,
      formality: formFormality ? parseInt(formFormality, 10) : undefined,
      warmth: formWarmth ? parseInt(formWarmth, 10) : undefined,
      material: formMaterial.trim() || undefined,
      notes: formNote.trim() || undefined,
      status: formStatus,
      updatedAt: now,
    };

    const db = getWardrobeDb();

    if (editId) {
      await db.wishlistItems.update(editId, base);
      setWishlistItems((prev) => prev.map((w) => w.id === editId ? { ...w, ...base } : w));
      onMessage("已更新种草单品");
    } else {
      const newItem: WishlistItem = {
        ...base,
        id: `wishlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        imageDataUrl: formImageDataUrl || "",
        createdAt: now,
      };
      await db.wishlistItems.put(newItem);
      setWishlistItems((prev) => [newItem, ...prev]);
      onMessage("已添加种草单品");
    }
    setSubPage("home");
    resetForm();
  }, [editId, formName, formImageDataUrl, formSourceImageDataUrl, formCropBox, formThumbnailDataUrl, formCategory, formSubcategory, formColorMode, formPrimaryColors, formMainColor, formAccentColors, formSeasons, formStyles, formTemperatureRange, formFitGender, formFitNotes, formPrice, formProductUrl, formFormality, formWarmth, formMaterial, formNote, formStatus, onMessage, resetForm, setWishlistItems]);

  const handleSaveIntakeDrafts = useCallback(async (drafts: GarmentIntakeDraft[]) => {
    const now = new Date().toISOString();
    const newItems = drafts.map((draft) => garmentDraftToWishlistItem(draft, { now }));
    const db = getWardrobeDb();
    await db.wishlistItems.bulkPut(newItems);
    setWishlistItems((prev) => [...newItems, ...prev]);
    onMessage(newItems.length > 1 ? `已添加 ${newItems.length} 件种草单品` : "已添加种草单品");
    setSubPage("home");
    onCreateClosed?.();
  }, [onMessage, setWishlistItems, onCreateClosed]);

  const handleAddImage = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      // v0.9.49-dev auto-fix: 之前用 FileReader.readAsDataURL 直接读 base64 无压缩,
      // 4MB JPEG → 4MB base64 → Dexie 50MB 配额容易被种草图撑爆。复用 fileToCompressedDataUrl。
      const compressed = await fileToCompressedDataUrl(file);
      setFormImageDataUrl(compressed);
      // v1.1.28 commit: 首次添加图片时同步设置 sourceImageDataUrl（同源）,
      // 清空旧 cropBox / thumbnailDataUrl, 避免继续引用之前单品的裁切/缩略图。
      setFormSourceImageDataUrl(compressed);
      setFormCropBox(undefined);
      setFormThumbnailDataUrl(undefined);
    } catch (e) {
      onMessage("图片处理失败，请重试", "error");
    }
    if (addFileInputRef.current) addFileInputRef.current.value = "";
  }, [onMessage]);

  /* ---- v1.1.28 commit: 重新裁切 —— 复用 ImageCropEditor, 与衣橱编辑页共用同一底层能力 ---- */
  const handleStartCrop = useCallback(() => {
    if (!formImageDataUrl) {
      onMessage("请先添加图片", "info");
      return;
    }
    // sourceImageDataUrl 优先作为原图（裁切器内部从原图裁切）; 缺失则用当前主图。
    const src = formSourceImageDataUrl || formImageDataUrl;
    setWishlistCropJob({ dataUrl: src, startBox: formCropBox });
  }, [formImageDataUrl, formSourceImageDataUrl, formCropBox, onMessage]);

  /* ---- C3: AI re-scan for edit page ---- */
  const [isRescanning, setIsRescanning] = useState(false);

  const handleRescanAI = useCallback(async () => {
    if (!formImageDataUrl) {
      onMessage("请先添加图片", "info");
      return;
    }
    if (!onProcessIntakeImage) {
      onMessage("识别服务不可用", "error");
      return;
    }
    if (!hasDeviceMiniMaxKey(settings)) {
      onMessage("未配置 AI Key，无法重新识别", "info");
      return;
    }
    setIsRescanning(true);
    try {
      aiProgress.start();
      // v1.1.28 commit: 重新识别时用裁切图作为 imageDataUrl, 真实原图作为 sourceImageDataUrl。
      // 若未单独保留原图，回退到 formImageDataUrl（与衣橱编辑页 §3.4.6 同款契约）。
      const rescanImage = formImageDataUrl;
      const rescanSource = formSourceImageDataUrl || formImageDataUrl;
      const result = await onProcessIntakeImage({
        imageDataUrl: rescanImage,
        sourceImageDataUrl: rescanSource,
      });
      const tag = result?.aiTag;
      if (!tag) {
        aiProgress.fail("未识别到商品信息");
        onMessage("未识别到商品信息，请手动填写", "info");
        return;
      }
      const patch = buildWishlistEditRecognitionPatch(tag, {
        currentName: formName,
        currentNotes: formNote,
      });
      if (patch.name != null) setFormName(patch.name);
      setFormCategory(patch.category);
      setFormSubcategory(patch.subcategory);
      const colorInfo = patch.colors;
      setFormColorMode(colorInfo.mode);
      setFormPrimaryColors(getPrimaryColors(colorInfo));
      setFormMainColor(getPrimaryColor(colorInfo));
      setFormAccentColors(getAccentColors(colorInfo));
      setFormTemperatureRange(patch.temperatureRange);
      setFormFitGender(patch.fitGender);
      setFormFitNotes(patch.fitNotes ?? "");
      setFormFormality(String(patch.formality));
      setFormWarmth(String(patch.warmth));
      setFormMaterial(patch.material || "");
      setFormSeasons(patch.seasons);
      setFormStyles(patch.styles);
      if (patch.notes != null) setFormNote(patch.notes);
      aiProgress.complete(true);
      onMessage("已重新识别，请确认后保存", "success");
    } catch (e) {
      aiProgress.fail("识别失败，请重试");
      onMessage("识别失败，请重试", "error");
    } finally {
      setIsRescanning(false);
    }
  }, [formImageDataUrl, formSourceImageDataUrl, formName, formNote, settings, onProcessIntakeImage, aiProgress, onMessage]);

  /* ---- reject / restore ---- */

  const handleReject = useCallback(async () => {
    if (!selectedItem) return;
    await patchItem(selectedItem.id, { status: "rejected" });
    setShowRejectConfirm(false);
    onMessage("已移入不感兴趣");
  }, [selectedItem, patchItem, onMessage]);

  const handleRestore = useCallback(async (item: WishlistItem) => {
    await patchItem(item.id, { status: "interested" });
    onMessage("已恢复到种草");
  }, [patchItem, onMessage]);

  const handleArchive = useCallback(async (item: WishlistItem) => {
    await patchItem(item.id, { status: "archived" });
    onMessage("已归档");
  }, [patchItem, onMessage]);

  const handleRestoreArchived = useCallback(async (item: WishlistItem) => {
    await patchItem(item.id, { status: "interested" });
    onMessage("已恢复到种草");
  }, [patchItem, onMessage]);

  /* ---- convert to wardrobe ---- */

  const openConvertConfirm = useCallback((item: WishlistItem) => {
    setSelectedItem(item);
    setSelectedLocationId(fallbackLocationId);
    setSubPage("convert_confirm");
  }, [fallbackLocationId]);

  const handleConfirmConvert = useCallback(async () => {
    if (!selectedItem) return;
    setConvertingId(selectedItem.id);
    try {
      const newItemId = await convertWishlistToWardrobe({
        wishlistItem: selectedItem, locationId: selectedLocationId,
      });
      await refreshItem(selectedItem.id);
      setSubPage("home");
      setSelectedItem(null);
      setConvertingId(null);
      onMessage("已加入衣橱", "success");
      onWishlistConvertedToWardrobe?.(newItemId);
    } catch (e) {
      setConvertingId(null);
      onMessage("加入衣橱失败，请重试", "error");
    }
  }, [selectedItem, selectedLocationId, refreshItem, onMessage, onWishlistConvertedToWardrobe]);

  /* ---- undo purchase ---- */

  const handleUndoPurchase = useCallback(async () => {
    if (!selectedItem) return;
    if (isConvertedLinkDeleted(selectedItem)) {
      setShowUndoPurchaseConfirm(false);
      showDeletedConvertedItemNotice(selectedItem);
      return;
    }
    try {
      await undoWishlistPurchaseFromRepo({ wishlistItem: selectedItem });
      await refreshItem(selectedItem.id);
      await onDataChanged?.();
      setShowUndoPurchaseConfirm(false);
      setSubPage("home");
      setSelectedItem(null);
      onMessage("已撤销购买，已同步删除衣橱单品");
    } catch (e) {
      onMessage("撤销购买失败", "error");
    }
  }, [selectedItem, isConvertedLinkDeleted, showDeletedConvertedItemNotice, refreshItem, onMessage, onDataChanged]);

  // v1.1.6 followup Commit 2: 全局「放弃修改」回调, 与 showDiscardConfirm 状态联动
  const discardForm = useCallback(() => {
    setShowDiscardConfirm(false);
    resetForm();
    setSubPage("home");
    setSelectedItem(null);
  }, [resetForm]);

  /* ---- AI assessment ---- */

  const handleGenerateAssessment = useCallback(async (wishlistItem: WishlistItem) => {
    const runId = ++assessmentRunIdRef.current;
    setAssessingId(wishlistItem.id);
    aiProgress.start();

    try {
      const ruleAssessment = assessWishlistItemByRules({
        wishlistItem, wardrobeItems: items, outfits, fallbackLocationId,
      });

      let assessment: WishlistAssessment;
      if (hasDeviceMiniMaxKey(settings)) {
        try {
          const { assessWishlistItemOnDevice } = await import("@/lib/device-minimax");
          assessment = await assessWishlistItemOnDevice(
            wishlistItem,
            { ruleAssessment, wardrobeItems: items, outfits },
            settings,
          );
        } catch {
          assessment = buildFallbackWishlistAssessment(ruleAssessment);
          onMessage("AI 评估失败，已生成本地规则评估", "info");
        }
      } else {
        assessment = buildFallbackWishlistAssessment(ruleAssessment);
      }

      // v0.9.49-dev auto-fix: runId 检查防 stale 写入。如果用户在请求中又点了另一个种草单品,
      // 当前 await 完成后 runId !== assessmentRunIdRef.current, 直接 return 不写库。
      if (runId !== assessmentRunIdRef.current) return;

      await getWardrobeDb().wishlistItems.update(wishlistItem.id, {
        aiAssessment: assessment,
        updatedAt: new Date().toISOString(),
      });
      await refreshItem(wishlistItem.id);
      aiProgress.complete(true);
      // 只有最后一次 run 才能清空 assessingId, 否则会过早清空让新 run 的 loading 状态丢失
      if (runId === assessmentRunIdRef.current) setAssessingId(null);
    } catch (e) {
      if (runId !== assessmentRunIdRef.current) return;
      aiProgress.fail("评估失败，请稍后重试");
      if (runId === assessmentRunIdRef.current) setAssessingId(null);
    }
  }, [items, outfits, fallbackLocationId, settings, refreshItem, aiProgress, onMessage]);

  const handleDeleteRecord = useCallback(async (item: WishlistItem) => {
    try {
      await getWardrobeDb().wishlistItems.delete(item.id);
      setWishlistItems((prev) => prev.filter((w) => w.id !== item.id));
      await onDataChanged?.();
      onMessage("已删除记录");
      setSubPage("home");
      setSelectedItem(null);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "删除失败，请重试", "error");
      throw error;
    }
  }, [setWishlistItems, onMessage, onDataChanged]);

  /* ---- view detail ---- */

  const openDetail = useCallback((item: WishlistItem) => {
    if (isConvertedLinkDeleted(item)) {
      showDeletedConvertedItemNotice(item);
      return;
    }
    setSelectedItem(item);
    setDetailTab("assessment");
    setSubPage("detail");
  }, [isConvertedLinkDeleted, showDeletedConvertedItemNotice]);

  /* ---- back navigation ---- */

  const goBack = useCallback(() => {
    if (subPage === "intake") {
      closeWishlistIntake();
      return;
    }
    // Subagent F: add_edit 有未保存修改时弹确认
    if (subPage === "add_edit" && checkFormDirty()) {
      setShowDiscardConfirm(true);
      return;
    }
    if (subPage === "add_edit") {
      resetForm();
    }
    setSubPage("home");
    setSelectedItem(null);
    setMenuOpen(false);
  }, [subPage, resetForm, closeWishlistIntake]);

  /* ================================================================ */
  /*  ADD / EDIT FORM PAGE                                            */
  /* ================================================================ */

  if (subPage === "add_edit") {
    subPageNode = (
      <div className="flex flex-col h-full">
        {/* C3: Top navigation */}
        <div className="flex items-center justify-between px-1 h-14 border-b border-ink/10">
          <button type="button" onClick={goBack}
            className="grid h-11 w-11 place-items-center rounded-full hover:bg-mist/50 active:scale-95 transition-transform">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-base font-semibold">编辑种草</h2>
          <button type="button" onClick={handleSaveForm}
            className="h-9 rounded-lg bg-denim px-4 text-sm font-semibold text-white active:scale-[0.98] transition-transform">
            保存
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* v1.1.28 commit: 种草图片区对齐衣橱编辑页 —— 左侧 3:4 小图, 右侧竖排 重新裁切 / 重新识别 */}
          <div className="mt-3">
            <ItemSectionCard className="p-3">
              <div className="flex items-center gap-3">
                <div className="relative aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-xl bg-mist" aria-label="商品图预览">
                  {formImageDataUrl ? (
                    <>
                      <GarmentImage
                        src={formImageDataUrl}
                        alt={formName || "商品图"}
                        fallbackSize={34}
                        imageClassName="bg-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setFormImageDataUrl("");
                          setFormSourceImageDataUrl("");
                          setFormCropBox(undefined);
                          setFormThumbnailDataUrl(undefined);
                        }}
                        className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white active:scale-95 transition-transform"
                        aria-label="移除图片"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => addFileInputRef.current?.click()}
                      className="grid h-full w-full place-items-center text-ink/40"
                      aria-label="添加图片"
                    >
                      <div className="text-center">
                        <ImageIcon size={28} />
                        <span className="mt-1 block text-[11px]">添加图片</span>
                      </div>
                    </button>
                  )}
                </div>
                <div className="grid min-w-0 flex-1 gap-2">
                  <button
                    type="button"
                    onClick={handleStartCrop}
                    disabled={!formImageDataUrl}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-ink/10 bg-white px-3 text-sm font-semibold text-ink/70 disabled:opacity-45"
                  >
                    <Crop size={15} aria-hidden="true" />
                    重新裁切
                  </button>
                  <button
                    type="button"
                    onClick={handleRescanAI}
                    disabled={isRescanning || !formImageDataUrl}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-denim px-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isRescanning ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
                    {isRescanning ? "识别中" : "重新识别"}
                  </button>
                </div>
              </div>
            </ItemSectionCard>
            <input ref={addFileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => handleAddImage(e.target.files?.[0])} />
          </div>

          {/* C3: Form fields */}
          <div className="py-4 space-y-4 max-w-full min-w-0">
            {/* 基础信息卡片 */}
            <ItemSectionCard title="基础信息" className="item-edit-section" bodyClassName="space-y-3 min-w-0">
                <ItemField label="名称" required className="min-w-0">
                  <input value={formName} onChange={(e) => setFormName(e.target.value)}
                    className="h-11 w-full min-w-0 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
                    placeholder="例如 白色乐福鞋" />
                </ItemField>
                <CategorySubcategoryPicker
                  category={(formCategory || "tops") as GarmentCategory}
                  subcategory={formSubcategory}
                  onCategoryChange={(next) => setFormCategory(next)}
                  onSubcategoryChange={(next) => {
                    // 切大类时强制清空二级（避免「上衣-高跟鞋」矛盾组合）
                    if (next == null || next === "") {
                      setFormSubcategory(undefined);
                    } else {
                      setFormSubcategory(next);
                    }
                  }}
                />
                <WishlistExtras
                  mode="edit"
                  status={formStatus}
                  onPatch={(patch) => setFormStatus(patch.status)}
                />
                <ItemField label="价格" hint="非必填" className="min-w-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    className="h-11 w-full min-w-0 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
                    placeholder="例如 599" />
                </ItemField>
                <ItemField label="商品链接" hint="非必填" className="min-w-0">
                  <input
                    type="url"
                    inputMode="url"
                    value={formProductUrl}
                    onChange={(e) => setFormProductUrl(e.target.value)}
                    className="h-11 w-full min-w-0 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
                    placeholder="https://..." />
                </ItemField>
            </ItemSectionCard>

            {/* 颜色卡片 */}
            <ItemSectionCard title="颜色" className="item-edit-section" bodyClassName="space-y-3 min-w-0">
                <ItemColorFields
                  mode="edit"
                  colors={buildColorInfo(
                    (formColorMode || "single") as WishlistItem["colors"]["mode"],
                    formPrimaryColors.length > 0 ? formPrimaryColors : (formMainColor ? [formMainColor] : []),
                    formAccentColors,
                  )}
                  onChange={(colors) => {
                    setFormColorMode(colors.mode);
                    setFormPrimaryColors(getPrimaryColors(colors));
                    setFormMainColor(getPrimaryColor(colors));
                    setFormAccentColors(getAccentColors(colors));
                  }}
                />
            </ItemSectionCard>

            {/* 穿着属性卡片 */}
            <ItemSectionCard title="穿着属性" className="item-edit-section" bodyClassName="space-y-3 min-w-0">
                <SeasonStyleChips mode="edit" kind="season" values={formSeasons} onChange={setFormSeasons} />
                <SeasonStyleChips mode="edit" kind="style" values={formStyles} onChange={setFormStyles} />
                {/* 适穿温度 - 双端点可拖动滑块（Step 2 拆出 + Step 5+6 接入种草 add_edit） */}
                <div className="min-w-0">
                  <TemperatureRangeSlider
                    value={formTemperatureRange ?? undefined}
                    onChange={(next) => setFormTemperatureRange(next)}
                  />
                </div>
                {/* 适穿版型 4 选 1 chip（Step 5+6 新加，影响 recommendations.ts fitGenderScore 推荐打分） */}
                <FitGenderChips
                  value={formFitGender}
                  onChange={(next) => setFormFitGender(next)}
                />
                {/* 版型说明 带计数（≤80 字，FIT_NOTES_MAX_LEN） */}
                <ItemField label="版型说明" counter={`${formFitNotes.length}/${FIT_NOTES_MAX_LEN}`} className="min-w-0">
                  <textarea
                    value={formFitNotes}
                    onChange={(e) => {
                      // 强制 ≤ FIT_NOTES_MAX_LEN，防止粘贴超出
                      const v = e.target.value.slice(0, FIT_NOTES_MAX_LEN);
                      setFormFitNotes(v);
                    }}
                    maxLength={FIT_NOTES_MAX_LEN}
                    rows={2}
                    className="w-full min-w-0 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm resize-none outline-none focus:border-denim"
                    placeholder={`最多 ${FIT_NOTES_MAX_LEN} 字，例如「宽松男款衬衫，肩线下落」`}
                  />
                </ItemField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormalityWarmthStepper
                    label="正式度"
                    value={formFormality ? parseInt(formFormality, 10) : undefined}
                    onChange={(value) => setFormFormality(String(value))}
                  />
                  <FormalityWarmthStepper
                    label="保暖度"
                    value={formWarmth ? parseInt(formWarmth, 10) : undefined}
                    onChange={(value) => setFormWarmth(String(value))}
                  />
                </div>
                <ItemField label="材质" className="min-w-0">
                  <input value={formMaterial} onChange={(e) => setFormMaterial(e.target.value)}
                    className="h-11 w-full min-w-0 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim" placeholder="例如 皮革 / 棉 / 羊毛" />
                </ItemField>
            </ItemSectionCard>

            <ItemSectionCard title="备注" className="item-edit-section">
                <NotesBlock
                  mode="edit"
                  value={formNote}
                  onChange={setFormNote}
                  rows={2}
                  maxLength={100}
                  placeholder="想买来搭通勤裤和风衣……"
                  counter={`${formNote.length}/100`}
                />
            </ItemSectionCard>
          </div>
        </div>

      </div>
    );
  }

  // v1.1.28 commit: 种草编辑页 ImageCropEditor —— 与衣橱编辑页共用同一组件, 不另写裁切器
  if (wishlistCropJob) {
    subPageNode = (
      <ImageCropEditor
        source={wishlistCropJob.dataUrl}
        initialCropBox={wishlistCropJob.startBox}
        aspectRatio="free"
        onCancel={() => setWishlistCropJob(null)}
        onConfirm={async (newImageDataUrl, cropBox) => {
          if (!newImageDataUrl) {
            setWishlistCropJob(null);
            return;
          }
          // v1.1.28 commit: 裁切确认后同步更新缩略图,
          // 保留 formSourceImageDataUrl (原图), 更新 formImageDataUrl / formCropBox。
          try {
            const thumb = await generateThumbnailSafe(newImageDataUrl);
            setFormImageDataUrl(newImageDataUrl);
            setFormSourceImageDataUrl((current) => current || wishlistCropJob.dataUrl);
            setFormCropBox(cropBox);
            setFormThumbnailDataUrl(thumb.thumbnailDataUrl);
          } catch {
            setFormImageDataUrl(newImageDataUrl);
            setFormSourceImageDataUrl((current) => current || wishlistCropJob.dataUrl);
            setFormCropBox(cropBox);
            setFormThumbnailDataUrl(undefined);
          }
          setWishlistCropJob(null);
          onMessage("裁切已更新，请保存种草", "success");
        }}
      />
    );
  }

  if (subPage === "intake") {
    subPageNode = (
      <GarmentIntakeFlow
        title="添加种草"
        flowKind="wishlist"
        defaultLocationId={locations[0]?.id ?? "home"}
        onPickImages={onPickIntakeImages}
        onProcessImage={onProcessIntakeImage}
        onSaveBatch={handleSaveIntakeDrafts}
        onExit={closeWishlistIntake}
      />
    );
  }

  /* ================================================================ */
  /*  CONVERT CONFIRM PAGE                                             */
  /* ================================================================ */

  if (subPage === "convert_confirm" && selectedItem) {
    const item = selectedItem;
    const selectedLocationName = locations.find((l) => l.id === selectedLocationId)?.name ?? selectedLocationId;

    subPageNode = (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10">
          <button type="button" onClick={() => { setSubPage("detail"); setSelectedItem(item); }} className="inline-flex items-center gap-1 text-sm">
            <ChevronLeft size={18} /> 返回
          </button>
          <h2 className="text-base font-semibold">加入衣橱</h2>
          <div className="w-16" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Main card */}
          <div className="surface rounded-xl p-4">
            <div className="flex gap-3">
              {item.imageDataUrl ? (
                <div className="w-[72px] h-[72px] shrink-0 rounded-lg overflow-hidden bg-mist">
                  <img src={item.imageDataUrl} alt={item.name} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="w-[72px] h-[72px] shrink-0 rounded-lg bg-mist flex items-center justify-center">
                  <ImageIcon size={24} className="text-ink/30" />
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="text-sm font-semibold truncate">{item.name}</div>
                <div className="text-xs text-ink/50 mt-0.5">
                  {[item.category ? CATEGORY_LABELS[item.category] : "", getPrimaryColor(item.colors)].filter(Boolean).join(" · ") || "未设置"}
                </div>
              </div>
            </div>
          </div>

          {/* Location selector */}
          <div className="px-1">
            <div className="text-[13px] text-ink/55 mb-2">加入到</div>
            <button
              type="button"
              onClick={() => setShowLocationSheet(true)}
              className="w-full h-12 rounded-2xl border border-ink/10 bg-white px-4 flex items-center justify-between"
            >
              <span className="text-sm font-medium truncate">{selectedLocationName}</span>
              <ChevronDown size={18} className="text-ink/40 shrink-0" />
            </button>
          </div>

          {/* Hint */}
          <p className="text-xs text-ink/40">加入后会出现在衣橱首页，并保留种草记录归档</p>
        </div>

        {/* Bottom actions */}
        <div className="grid grid-cols-2 gap-3 p-4 border-t border-ink/10">
          <button type="button" onClick={() => { setSubPage("detail"); setSelectedItem(item); }} className="h-11 rounded-xl border border-ink/10 text-sm">取消</button>
          <button type="button" onClick={handleConfirmConvert} disabled={convertingId === item.id}
            className="h-11 rounded-xl bg-denim text-sm font-semibold text-white disabled:opacity-50">
            {convertingId === item.id ? "处理中..." : "确认加入衣橱"}
          </button>
        </div>

        {/* Location selector sheet */}
        <MotionSheet
          open={showLocationSheet}
          onClose={() => setShowLocationSheet(false)}
          panelClassName="!max-w-sm"
        >
          <div className="px-4 py-3 border-b border-ink/10">
            <div className="text-base font-semibold">加入到衣橱</div>
          </div>
          <div className="py-2">
            {locations.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => {
                  setSelectedLocationId(loc.id);
                  setShowLocationSheet(false);
                }}
                className="w-full h-[52px] px-4 flex items-center justify-between hover:bg-mist/50"
              >
                <span className="text-sm">{loc.name}</span>
                {loc.id === selectedLocationId && <Check size={18} className="text-denim" />}
              </button>
            ))}
          </div>
          <div className="p-4 border-t border-ink/10">
            <button
              type="button"
              onClick={() => setShowLocationSheet(false)}
              className="w-full h-11 rounded-xl border border-ink/10 text-sm"
            >
              取消
            </button>
          </div>
        </MotionSheet>
      </div>
    );
  }

  /* ================================================================ */
  /*  LIST SUB-PAGES (purchased / rejected / archived)                 */
  /* ================================================================ */

  if (subPage === "purchased" || subPage === "rejected" || subPage === "archived") {
    const list = subPage === "purchased" ? purchasedItems
      : subPage === "rejected" ? rejectedItems
      : archivedItems;

    const title = subPage === "purchased" ? "已买单品" : subPage === "rejected" ? "不感兴趣" : "已归档";
    const hint = subPage === "purchased" ? `${list.length} 件，可撤销误操作`
      : subPage === "rejected" ? `${list.length} 件，可恢复到种草`
      : `${list.length} 件历史记录`;

    subPageNode = (
      <div className="flex flex-col h-full">
        <div className="flex h-[60px] items-center gap-2 px-4 border-b border-ink/10">
          <button type="button" onClick={goBack} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-ink/70 shadow-soft active:scale-95" aria-label="返回">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-base font-semibold">{title}</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="text-sm text-ink/50 mb-4">{hint}</p>

          {list.length === 0 ? (
            <div className="py-12 text-center text-sm text-ink/40">暂无记录</div>
          ) : (
            <div className="space-y-3">
              {list.map((w) => {
                const state = getWishlistDisplayState(w);
                const convertedLinkDeleted = isConvertedLinkDeleted(w);
                return (
                  <div key={w.id} className="rounded-3xl border border-ink/5 bg-white p-3 shadow-soft">
                    <div className="flex gap-3">
                    {w.imageDataUrl ? (
                      <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl bg-mist">
                        <img src={w.imageDataUrl} alt={w.name} className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-2xl bg-mist text-ink/30">
                        <ImageIcon size={20} />
                      </div>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{w.name}</span>
                        <StatusCapsule state={state} />
                      </div>
                      <div className="text-[11px] text-ink/50 mt-0.5">
                        {subPage === "purchased" && convertedLinkDeleted ? "关联单品已删除" : ""}
                        {subPage === "purchased" && !convertedLinkDeleted && w.convertedAt ? `已加入衣橱 · ${w.convertedAt.slice(0, 10)}` : ""}
                        {subPage === "rejected" ? `${w.updatedAt.slice(0, 10)} 标记` : ""}
                        {subPage === "archived" ? `${w.updatedAt.slice(0, 10)} 归档` : ""}
                      </div>
                    </div>
                    </div>
                      <div className="mt-3 flex gap-2">
                        {subPage === "purchased" && w.convertedItemId && (
                          <>
                            <button type="button" onClick={() => { void openConvertedWardrobeItem(w); }}
                              className="flex-1 rounded-full bg-denim px-3 py-2 text-xs font-semibold text-white">
                              查看衣物
                            </button>
                            <button type="button" onClick={() => requestUndoPurchase(w)}
                              className="flex-1 rounded-full border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600">
                              撤销购买
                            </button>
                          </>
                        )}
                        {subPage === "rejected" && (
                          <>
                            <button type="button" onClick={() => handleRestore(w)}
                              className="flex-1 rounded-full bg-denim px-3 py-2 text-xs font-semibold text-white">
                              恢复种草
                            </button>
                            <button type="button" onClick={() => { setSelectedItem(w); setShowDeleteRecordConfirm(true); }}
                              className="flex-1 rounded-full border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600">
                              删除记录
                            </button>
                          </>
                        )}
                        {subPage === "archived" && (
                          <>
                            <button type="button" onClick={() => handleRestoreArchived(w)}
                              className="rounded-md bg-mist px-2 py-1 text-[11px] font-medium text-ink/60">
                              恢复到种草
                            </button>
                            <button type="button" onClick={() => { setSelectedItem(w); setShowDeleteRecordConfirm(true); }}
                              className="rounded-md bg-red-50 px-2 py-1 text-[11px] font-medium text-red-500">
                              删除记录
                            </button>
                          </>
                        )}
                      </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  DETAIL PAGE                                                      */
  /* ================================================================ */

  if (subPage === "detail" && selectedItem) {
    const item = selectedItem;
    const state = getWishlistDisplayState(item);
    const rule = ruleAssessmentMap.get(item.id)
      ?? assessWishlistItemByRules({ wishlistItem: item, wardrobeItems: items, outfits, fallbackLocationId });
    const assessment = item.aiAssessment;
    const statusLabel = getWishlistDisplayLabel(state);
    const categoryLabel = item.category ? CATEGORY_LABELS[item.category] : "";
    const seasonLabel = (item.seasons ?? []).map((s) => SEASON_LABELS[s] ?? s).join(" / ");
    const styleLabel = (item.styles ?? []).map((s) => STYLE_LABELS[s as keyof typeof STYLE_LABELS] ?? s).join(" / ");
    const subcategoryLabel = item.subcategory ? formatSubcategoryLabel(item.category, item.subcategory) : "";
    const convertedLinkDeleted = isConvertedLinkDeleted(item);
    const quickActions = state === "purchased"
      ? [
          { key: "view", label: convertedLinkDeleted ? "单品已删除" : "查看衣橱单品", icon: <Shirt />, tone: "primary" as const, onClick: () => { void openConvertedWardrobeItem(item); }, disabled: !item.convertedItemId },
          { key: "undo", label: "撤销购买", icon: <RotateCcw />, tone: "danger" as const, onClick: () => requestUndoPurchase(item) },
          { key: "edit", label: "编辑", icon: <Edit3 />, tone: "primary" as const, onClick: () => openEditForm(item) },
        ]
      : state === "rejected" || state === "archived"
        ? [
            { key: "restore", label: "恢复种草", icon: <RotateCcw />, tone: "neutral" as const, onClick: () => { void patchItem(item.id, { status: "interested" }); } },
            { key: "edit", label: "编辑", icon: <Edit3 />, tone: "primary" as const, onClick: () => openEditForm(item) },
          ]
        : [
            { key: "bought", label: "已买", icon: <Check />, tone: "primary" as const, onClick: () => openConvertConfirm(item) },
            { key: "reject", label: "不想买", icon: <X />, tone: "danger" as const, onClick: () => setShowRejectConfirm(true) },
            { key: "edit", label: "编辑", icon: <Edit3 />, tone: "primary" as const, onClick: () => openEditForm(item) },
          ];
    const productSlides = [{
      id: "wishlist-product",
      label: getDetailSlideLabel("wishlist_product"),
      alt: item.name,
      imageDataUrl: item.imageDataUrl,
    }];


    subPageNode = (
      <div className="flex flex-col h-full">
        <DetailTopBar title="" onBack={goBack} onMore={() => setMenuOpen((v) => !v)} />

        {/* three-dot menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90]" onClick={() => setMenuOpen(false)}>
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute right-4 top-[72px] w-44 rounded-xl bg-white shadow-xl border border-ink/10 py-1"
                onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => { setMenuOpen(false); openEditForm(item); }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-mist/50">
                  <Edit3 size={15} /> 编辑种草单品
                </button>
                {item.convertedItemId && (
                  <button type="button" onClick={() => { setMenuOpen(false); requestUndoPurchase(item); }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-mist/50 text-red-500">
                    <RotateCcw size={15} /> 撤销购买
                  </button>
                )}
                <button type="button" onClick={() => { setMenuOpen(false); handleArchive(item); }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-mist/50">
                  <Package size={15} /> 归档
                </button>
                <button type="button" onClick={() => { setMenuOpen(false); setSelectedItem(item); setShowDeleteRecordConfirm(true); }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-mist/50 text-red-500">
                  <Trash2 size={15} /> 删除记录
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto">
          <DetailHeroGallery
            slides={productSlides}
            currentIndex={0}
            onIndexChange={() => undefined}
            onExpandImage={item.imageDataUrl ? onExpandImage : undefined}
            emptyIcon={<ImageIcon size={36} />}
            emptyText="暂无商品图"
          />
          <DetailQuickActions actions={quickActions} layout="grid" />
          <DetailTitleMetaBlock title={item.name} metaParts={[statusLabel, categoryLabel, subcategoryLabel, seasonLabel, styleLabel]} />
          <DetailTabs
            tabs={[
              { key: "assessment", label: "信息" },
              { key: "pairing", label: "搭配" },
              { key: "record", label: "记录" },
            ]}
            activeTab={detailTab}
            onChange={setDetailTab}
          />

          {/* C2: Tab content */}
          <div className="mt-3 pb-8">
            {detailTab === "assessment" && (
              <div className="space-y-4">
                {/* 1. AI买前评估卡片 */}
                <DetailAiCard
                  title="AI买前评估"
                  summary={assessment ? (
                    <div className="grid gap-2">
                      <p className="text-sm font-semibold">
                        {assessment.verdict === "worth_buying" ? "建议买" : assessment.verdict === "not_recommended" ? "不建议" : "再考虑"}
                        {assessment.score != null ? ` · ${assessment.score} / 100` : ""}
                      </p>
                      <p>{assessment.summary}</p>
                      <p className="text-xs text-ink/40">可搭 {rule.matchCount} 件 · 相似 {rule.similarCount} 件</p>
                      {assessment.matchReasons.length > 0 && (
                        <p className="text-[11px] text-moss mt-0.5">{assessment.matchReasons.join(" · ")}</p>
                      )}
                      {assessment.conflictReasons.length > 0 && (
                        <p className="text-[11px] text-amber-600 mt-0.5">{assessment.conflictReasons.join(" · ")}</p>
                      )}
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <p>{rule.summary}</p>
                      <p className="text-xs text-ink/40">可搭 {rule.matchCount} 件 · 相似 {rule.similarCount} 件</p>
                    </div>
                  )}
                  sourceLabel={!hasDeviceMiniMaxKey(settings) && !assessment ? "本地规则来源" : assessment ? "基于 AI 评估" : undefined}
                  generatedAt={assessment?.generatedAt}
                  loading={aiProgress.visible && assessingId === item.id}
                  emptyText="还没有生成买前评估"
                  actionLabel={assessment ? "刷新评估" : "生成评估"}
                  onAction={() => handleGenerateAssessment(item)}
                />

                <ItemDetailSections
                  name={item.name}
                  categoryLabel={item.category ? CATEGORY_LABELS[item.category] : undefined}
                  subcategoryLabel={subcategoryLabel}
                  priceLabel={item.price != null ? `${item.price}` : undefined}
                  productUrl={item.productUrl}
                  basicExtraRows={<WishlistExtras mode="view" status={item.status} />}
                  colors={item.colors}
                  seasonLabel={(item.seasons ?? []).map((s) => SEASON_LABELS[s] ?? s).join(" / ") || undefined}
                  styleLabel={(item.styles ?? []).map((s) => STYLE_LABELS[s as keyof typeof STYLE_LABELS] ?? s).join(" / ") || undefined}
                  temperatureRange={item.temperatureRange}
                  formality={item.formality}
                  warmth={item.warmth}
                  material={item.material}
                  fitGenderLabel={formatGarmentFitGender(item.fitGender)}
                  fitNotes={item.fitNotes}
                  notes={item.notes}
                />
              </div>
            )}

            {detailTab === "pairing" && (
              <div className="space-y-5">
                {/* Recommended pairings */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">可搭配已有单品</h4>
                  {rule.recommendedPairings.length === 0 ? (
                    <div className="py-8 text-center text-sm text-ink/40">
                      还没有明显可搭配单品<br />
                      <span className="text-xs">可以补充分类、颜色、季节等信息后重新评估。</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rule.recommendedPairings.slice(0, 8).map((p) => (
                        <div key={p.item.id} className="flex gap-3 items-center surface rounded-lg p-2">
                          {(p.item.imageDataUrl || p.item.thumbnailDataUrl) ? (
                            <div className="h-12 w-12 shrink-0 rounded-lg overflow-hidden bg-mist">
                              <img src={p.item.thumbnailDataUrl || p.item.imageDataUrl} alt={p.item.name} className="h-full w-full object-cover" />
                            </div>
                          ) : (
                            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-mist text-ink/30">
                              <ImageIcon size={16} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{p.item.name}</div>
                            <div className="text-[11px] text-ink/50">{p.reasons.slice(0, 2).join(" · ")}</div>
                          </div>
                          {p.availabilityHint && (
                            <span className="text-[10px] text-amber-500 shrink-0">{p.availabilityHint}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Similar items */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">相似已有单品</h4>
                  {rule.similarOwnedItems.length === 0 ? (
                    <div className="py-4 text-center text-sm text-ink/40">没有明显相似单品</div>
                  ) : (
                    <div className="space-y-2">
                      {rule.similarOwnedItems.map((m) => (
                        <div key={m.item.id} className="flex gap-3 items-center surface rounded-lg p-2">
                          {(m.item.imageDataUrl || m.item.thumbnailDataUrl) ? (
                            <div className="h-12 w-12 shrink-0 rounded-lg overflow-hidden bg-mist">
                              <img src={m.item.thumbnailDataUrl || m.item.imageDataUrl} alt={m.item.name} className="h-full w-full object-cover" />
                            </div>
                          ) : (
                            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-mist text-ink/30">
                              <ImageIcon size={16} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{m.item.name}</div>
                            <div className="text-[11px] text-ink/50">{m.reasons.slice(0, 2).join(" · ")}</div>
                          </div>
                          <span className="text-xs font-semibold text-ink/40 shrink-0">{m.similarity}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Missing items */}
                {assessment?.missingItems && assessment.missingItems.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-3">缺失搭配对象</h4>
                    <ul className="space-y-1">
                      {assessment.missingItems.map((m, i) => (
                        <li key={i} className="text-sm text-ink/60 flex items-start gap-1.5">
                          <MinusCircle size={14} className="text-ink/30 mt-0.5 shrink-0" />
                          {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {detailTab === "record" && (
              <div className="space-y-3 text-sm">
                <RowItem label="创建时间" value={item.createdAt.slice(0, 10)} />
                <RowItem label="更新时间" value={item.updatedAt.slice(0, 10)} />
                <RowItem label="评估时间" value={item.aiAssessment?.generatedAt?.slice(0, 10) || "未评估"} />
                {item.convertedAt && <RowItem label="加入衣橱时间" value={item.convertedAt.slice(0, 10)} />}
                {item.convertedItemDeletedAt && <RowItem label="衣橱单品" value={`已删除 · ${item.convertedItemDeletedAt.slice(0, 10)}`} />}
                <RowItem label="备注" value={item.notes || "未识别"} />
              </div>
            )}
          </div>
        </div>

      </div>
    );
  }

  /* ================================================================ */
  /*  HOME PAGE                                                        */
  /* ================================================================ */

  const purchasedCount = countPurchasedWishlistItems(wishlistItems);
  const rejectedCount = countRejectedWishlistItems(wishlistItems);
  const archivedCount = countArchivedWishlistItems(wishlistItems);

  const mainStatCounts = (() => {
    let pending = 0, worthBuying = 0, consider = 0, notRecommended = 0;
    for (const w of mainItems) {
      const s = getWishlistDisplayState(w);
      if (s === "pending_assessment") pending++;
      else if (s === "worth_buying") worthBuying++;
      else if (s === "consider") consider++;
      else if (s === "not_recommended") notRecommended++;
    }
    return { pending, worthBuying, consider, notRecommended };
  })();

  // v1.1.16 commit3 §5.4.4: 种草首页页边距已与套装首页一致 (使用 wardrobe-app 父级 pt-3 px-4,
  // 内部 space-y-4 与 outfit-list-view.tsx 布局 token 对齐), 不再需要独立的 wishlistHomeContentClassName。
  // v1.1.6 followup Commit 2: 统一渲染。子页有 subPageNode 时优先渲染, 否则渲染 home,
  // 底部再叠加全局确认弹窗 (覆盖已买单品 / 不感兴趣 / 已归档子页打开弹窗 + 系统返回键)。
  // P0 收口: 把首页 JSX 抽到 homeNode 常量, 统一出口固定为 {subPageNode ?? homeNode},
  // 避免子页分支末尾的 return; 阻断统一出口 (种草详情页打不开即由此引起)。
  // v1.1.16 commit3 §5.4.4: 拉平种草首页与套装首页的页边距 + header + chips 布局,
  // 标题 / 数量 / 右上角菜单按钮 / 筛选条左边界 / 空状态居中与 outfit-list-view.tsx 一致。
  const homeNode: React.ReactNode = (
      <div className="flex flex-col h-full space-y-4">
        {/* Header - 与 AppSubPageTopBar / 衣橱首页顶部按钮行 / 套装首页 header 一致 h-14 (56px) */}
        <div className="flex h-14 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShoppingBag size={20} className="text-clay" />
              <h2 className="text-lg font-semibold text-ink leading-tight">种草</h2>
            </div>
            <p className="mt-0.5 text-xs text-ink/50">
              {mainItems.length} 件
              {mainStatCounts.worthBuying > 0 ? ` · ${mainStatCounts.worthBuying} 件建议买` : ""}
              {mainStatCounts.pending > 0 ? ` · ${mainStatCounts.pending} 件待评估` : ""}
            </p>
          </div>
          <div className="relative flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              data-testid="wishlist-header-menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-mist/50 active:bg-mist"
              aria-label="种草列表菜单"
            >
              <MoreVertical size={18} />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[90]" onClick={() => setMenuOpen(false)}>
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    className="absolute right-4 top-12 w-44 rounded-xl bg-white shadow-xl border border-ink/10 py-1"
                    onClick={(e) => e.stopPropagation()}>
                    <button type="button" disabled={purchasedCount === 0} onClick={() => { setMenuOpen(false); setSubPage("purchased"); }}
                      className="flex items-center justify-between w-full px-4 py-2.5 text-sm hover:bg-mist/50 disabled:opacity-30">
                      已买单品 <span className="text-ink/30 text-xs">{purchasedCount}</span>
                    </button>
                    <button type="button" disabled={rejectedCount === 0} onClick={() => { setMenuOpen(false); setSubPage("rejected"); }}
                      className="flex items-center justify-between w-full px-4 py-2.5 text-sm hover:bg-mist/50 disabled:opacity-30">
                      不感兴趣 <span className="text-ink/30 text-xs">{rejectedCount}</span>
                    </button>
                    <button type="button" disabled={archivedCount === 0} onClick={() => { setMenuOpen(false); setSubPage("archived"); }}
                      className="flex items-center justify-between w-full px-4 py-2.5 text-sm hover:bg-mist/50 disabled:opacity-30">
                      已归档 <span className="text-ink/30 text-xs">{archivedCount}</span>
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Chips - 横向滚动, 与 outfit-list-view.tsx 套装首页 chips 行布局 token 一致:
              -mx-1 flex gap-2 overflow-x-auto px-1 pb-1,
              圆角胶囊 + 当前态高亮, 计数靠 label 同行 (避免和套装不一致)。 */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
          {([
            { key: "all", label: "全部", count: mainItems.length },
            { key: "pending", label: "待评估", count: mainStatCounts.pending },
            { key: "worth_buying", label: "建议买", count: mainStatCounts.worthBuying },
            { key: "consider", label: "再考虑", count: mainStatCounts.consider },
            { key: "not_recommended", label: "不建议", count: mainStatCounts.notRecommended },
          ] as const).map(({ key, label, count }) => (
            <button key={key} type="button" onClick={() => setMainFilter(key)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                mainFilter === key
                  ? "bg-denim/10 text-denim border border-denim/30"
                  : "bg-milk-darker/50 text-ink/60 border border-transparent"
              }`}>
              <span>{label}</span>
              <span className={`text-[11px] ${mainFilter === key ? "text-denim/70" : "text-ink/40"}`}>{count}</span>
            </button>
          ))}
        </div>

        {/* Main list - 与 outfit-list-view.tsx 网格/空状态布局对齐:
              - 网格 grid-cols-2 gap-3, 卡片走 CatalogWaterfallCard (与套装一致);
              - 空状态: 与 outfit-list-view.tsx "还没有保存套装" 居中块一致
                (flex flex-col items-center justify-center py-20 text-center + 图标圆背景 + 双行文案)。
        */}
        <div className="flex-1 overflow-y-auto min-w-0">
          {mainItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-3 rounded-full bg-milk-darker/60 p-4">
                <ShoppingBag size={32} className="text-ink/25" />
              </div>
              <p className="text-sm font-medium text-ink/50">还没有种草单品</p>
              <p className="mt-1 text-xs text-ink/30">用右下角 + 添加第一件种草商品。</p>
              <p className="text-xs text-ink/30">种草商品可记录商品图、链接、价格和评估状态。</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {mainItems.map((w) => {
                const state = getWishlistDisplayState(w);
                const rule = ruleAssessmentMap.get(w.id);
                const subtitle = getWishlistCardSubtitle(w, rule);

                return (
                  <CatalogWaterfallCard
                    key={w.id}
                    onClick={() => openDetail(w)}
                    title={w.name?.trim() || "待确认种草单品"}
                    subtitle={`${getWishlistDisplayLabel(state)} · ${subtitle}`}
                    record={w.price != null ? `¥${w.price}` : "暂无价格"}
                  >
                      {w.imageDataUrl ? (
                        <img src={w.imageDataUrl} alt={w.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-ink/20">
                          <ImageIcon size={36} />
                        </div>
                      )}
                  </CatalogWaterfallCard>
                );
              })}
            </div>
          )}
        </div>
      </div>
  );
  return (
    <>
      {subPageNode ?? homeNode}

      <WishlistGlobalDialogs
        selectedItem={selectedItem}
        showRejectConfirm={showRejectConfirm}
        showUndoPurchaseConfirm={showUndoPurchaseConfirm}
        showDeleteRecordConfirm={showDeleteRecordConfirm}
        showConvertedItemDeletedNotice={showConvertedItemDeletedNotice}
        showDiscardConfirm={showDiscardConfirm}
        onReject={handleReject}
        onUndoPurchase={handleUndoPurchase}
        onDeleteRecord={handleDeleteRecord}
        onDiscard={discardForm}
        onCloseReject={() => setShowRejectConfirm(false)}
        onCloseUndoPurchase={() => setShowUndoPurchaseConfirm(false)}
        onCloseDeleteRecord={() => setShowDeleteRecordConfirm(false)}
        onCloseConvertedItemDeletedNotice={() => setShowConvertedItemDeletedNotice(false)}
        onCloseDiscard={() => setShowDiscardConfirm(false)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  RowItem helper                                                     */
/* ------------------------------------------------------------------ */

function RowItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink/40 shrink-0 w-16">{label}</span>
      <span className="truncate flex-1 min-w-0">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  WishlistGlobalDialogs                                              */
/* ------------------------------------------------------------------ */

// v1.1.6 followup Commit 2: 全局确认弹窗, 放在 WishlistView20 单一 return 底部,
// 跟随 selectedItem 状态, 覆盖 home / add_edit / detail / purchased / rejected /
// archived 任意子页触发, 修复已买单品/不感兴趣/已归档子页打开弹窗无反应 + Android
// 系统返回键不响应问题。
interface WishlistGlobalDialogsProps {
  selectedItem: WishlistItem | null;
  showRejectConfirm: boolean;
  showUndoPurchaseConfirm: boolean;
  showDeleteRecordConfirm: boolean;
  showConvertedItemDeletedNotice: boolean;
  showDiscardConfirm: boolean;
  onReject: () => void;
  onUndoPurchase: () => void;
  onDeleteRecord: (item: WishlistItem) => Promise<void>;
  onDiscard: () => void;
  onCloseReject: () => void;
  onCloseUndoPurchase: () => void;
  onCloseDeleteRecord: () => void;
  onCloseConvertedItemDeletedNotice: () => void;
  onCloseDiscard: () => void;
}

function WishlistGlobalDialogs({
  selectedItem,
  showRejectConfirm,
  showUndoPurchaseConfirm,
  showDeleteRecordConfirm,
  showConvertedItemDeletedNotice,
  showDiscardConfirm,
  onReject,
  onUndoPurchase,
  onDeleteRecord,
  onDiscard,
  onCloseReject,
  onCloseUndoPurchase,
  onCloseDeleteRecord,
  onCloseConvertedItemDeletedNotice,
  onCloseDiscard,
}: WishlistGlobalDialogsProps) {
  return (
    <>
      <ConfirmDialog open={showRejectConfirm}
        title="不再考虑这件商品？"
        message="它会从默认种草列表中移到「不感兴趣」窗口。你之后仍然可以恢复到种草。"
        confirmLabel="确认不买"
        confirmClass="bg-red-500"
        onConfirm={onReject}
        onCancel={onCloseReject} />

      <ConfirmDialog open={showUndoPurchaseConfirm}
        title="撤销购买并恢复到种草？"
        message="这会把种草记录恢复为「想买」，并同步删除当时转入衣橱的对应单品。包含该单品的套装和计划记录会一起清理。"
        confirmLabel="撤销购买"
        confirmClass="bg-red-500"
        onConfirm={onUndoPurchase}
        onCancel={onCloseUndoPurchase} />

      <NoticeDialog
        open={showConvertedItemDeletedNotice}
        title="关联衣橱单品已删除"
        message="这条已买记录对应的衣橱单品已经被删除，不能查看衣物详情，也不能撤销购买恢复到种草清单。"
        onClose={onCloseConvertedItemDeletedNotice}
      />

      <ConfirmDialog open={showDeleteRecordConfirm}
        title="删除这条记录？"
        message="删除后这条种草记录会从列表中移除。"
        confirmLabel="删除记录"
        confirmClass="bg-red-500"
        onConfirm={async () => {
          if (!selectedItem) return;
          await onDeleteRecord(selectedItem);
          onCloseDeleteRecord();
        }}
        onCancel={onCloseDeleteRecord} />

      <ConfirmDialog open={showDiscardConfirm}
        title="放弃已修改的内容？"
        message="你的修改尚未保存，确定要离开吗？"
        confirmLabel="放弃"
        confirmClass="bg-red-500"
        onConfirm={onDiscard}
        onCancel={onCloseDiscard} />
    </>
  );
}
