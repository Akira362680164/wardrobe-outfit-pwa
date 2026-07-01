"use client";

import {
  Camera,
  ChevronLeft,
  ImageIcon,
  Layers,
  MoreHorizontal,
  Pencil,
  Settings,
  Plus,
  RefreshCw,
  Shirt,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ClosetLocation, LocalOutfitRealImageDraft, OutfitAiSuggestion, OutfitCalendarPlan, OutfitCalendarPlanDraft, OutfitCalendarPlanType, OutfitPlanEntry, OutfitRealImage, PlanPackingChecklistItem, SavedOutfit, Season, WardrobeItem } from "@/lib/types";
import { CATEGORY_LABELS, SEASON_LABELS } from "@/lib/types";
import { buildOutfitCoverRefreshPatch, getOutfitCover, countValidItems } from "@/lib/outfit-cover";
import { getWearSummary, hasWornDate } from "@/lib/wear-records";
import { useLocalDateKey } from "@/lib/use-local-date-key";
import { addOutfitToDate, recordActualOutfitWear, cancelActualOutfitWearForDate, formatOutfitWearSyncError } from "@/lib/outfit-wear-sync";
import { wardrobeRepository } from "@/lib/repository/wardrobe-repository";
import { rethrowIfFailed, upsertOutfit, upsertTripPlan, repoUpsertOutfitPlanEntry, repoDeleteOutfitPlanEntry, repoDeleteTripPlan } from "@/lib/repository/wardrobe-repository";
import { OutfitCover } from "@/components/outfit-cover";
import { OutfitWeeklyPlanStrip } from "@/components/outfit-weekly-plan-strip";
import { OutfitPlanningCalendarView } from "@/components/outfit-planning-calendar-view";
import { OutfitPlanAddView } from "@/components/outfit-plan-add-view";
import { OutfitPlanDetailView } from "@/components/outfit-plan-detail-view";
import { PlanPackingChecklistView } from "@/components/plan-packing-checklist-view";
import { OutfitPlanSelectSheet } from "@/components/outfit-plan-select-sheet";
import { buildPackingItemsFromPlan } from "@/lib/plan-packing";
import { getWeekDates, shiftDateByWeeks as shiftDateByWeeksFn } from "@/lib/outfit-calendar";
import { MotionSheet } from "@/components/motion-common";
import { MotionPopoverMenu } from "@/components/motion-common";
import { CatalogWaterfallCardShell } from "@/components/item-shell/catalog-waterfall-card-shell";
import { CatalogWaterfallGrid } from "@/components/item-shell/catalog-waterfall-grid";
import { ItemDetailPageShell } from "@/components/item-shell/item-detail-page-shell";
import { ConfirmActionSheet, NoticeSheet } from "@/components/dialogs";
import { OnlineAssetImage } from "@/components/online/online-asset-image";
import { TemperatureRangeBar } from "@/components/temperature-range-bar";
import {
  DetailAiCard,
  DetailFilmstrip,
  DetailHeroGallery,
  DetailInfoRow,
  DetailSurfaceCard,
  DetailTabs,
  DetailTitleMetaBlock,
  DetailTopBar,
  getDetailSlideLabel,
} from "@/components/detail-shell";
import { OutfitIntakeFlow } from "@/components/outfit-intake-flow";
import { fileToCompressedDataUrl, IMAGE_FILE_ACCEPT } from "@/lib/image";
import { buildLocalOutfitAiSuggestion, getCachedReplacementSuggestionForItem, getReplacementCandidatesForOutfitItem } from "@/lib/outfit-ai-suggestion";
import { generateOutfitAiSuggestionOnDevice, generateOutfitMetadataOnDevice, hasDeviceMiniMaxKey, loadMiniMaxSettings } from "@/lib/device-minimax";
import { buildLocalOutfitMetadataFromItems } from "@/lib/outfit-ai-metadata";
import { outfitDraftToSavedOutfit } from "@/lib/intake-save-adapters";
import type { OutfitIntakeDraft } from "@/lib/intake-draft";
import { useStableBackHandler } from "@/lib/use-stable-back-handler";
import type { AppRoute } from "@/lib/app-route";
import { normalizeTemperatureRange } from "@/lib/temperature-range";

const SCENE_OPTIONS = ["通勤", "休闲", "旅行", "约会", "户外", "正式", "居家"];
const STYLE_OPTIONS = ["简约", "休闲", "甜美", "优雅", "轻熟", "运动", "街头"];
const PAIRING_TAG_OPTIONS = ["显高", "显瘦", "轻通勤", "学院风", "复古", "清爽"];

type SubPage = "library" | "detail" | "create_flow" | "create_select" | "create_info" | "edit" | "real_image_add" | "real_image_view" | "planning_calendar" | "plan_add" | "plan_edit" | "plan_detail" | "packing_list";

/** 套装详情来源: 关闭详情后回到哪一页。 */
type DetailReturnTo = "library" | "planning_calendar" | "plan_detail" | "packing_list";

export function OutfitListView({
  outfits,
  items,
  locations,
  onRefresh,
  onMessage,
  onExpandImage,
  onSubPageChange,
  onSubPageKeyChange,
  onCloseOutfitDetail,
  onCreateClosed,
  createTrigger,
  onCreateTriggerConsumed,
  createPlanTrigger,
  onCreatePlanTriggerConsumed,
  outfitPlanEntries,
  outfitCalendarPlans,
  planPackingChecklistItems,
  onPlanDataChange,
  activeOutfitRoute,
}: {
  outfits: SavedOutfit[];
  items: WardrobeItem[];
  locations: ClosetLocation[];
  onRefresh: () => Promise<void>;
  onMessage: (msg: string, type?: "success" | "error" | "info") => void;
  onExpandImage: (image: { src: string; alt: string }) => void;
  onSubPageChange: (active: boolean) => void;
  // v1.1 review fix: 上报当前 outfit 子页 key（library / detail / planning_calendar / plan_add / packing_list …），
  // 让 wardrobe-app 在 planning 子页高亮全局新建面板的「添加穿搭计划」入口。
  onSubPageKeyChange?: (key: string | null) => void;
  /** v1.1.7 4A: navigation controller for route tracking */
  onOpenOutfitDetailFromLibrary?: (outfitId: string) => void;
  onOpenOutfitDetailFromCalendar?: (outfitId: string) => void;
  onCloseOutfitDetail?: () => void;
  activeOutfitRoute?: Extract<AppRoute, { name: "outfit_detail" }>;
  onCreateClosed?: () => void;
  createTrigger: number;
  onCreateTriggerConsumed?: () => void;
  // v1.1 review fix: 全局 FAB 触发添加穿搭计划（切到 plan_add 或弹出添加计划 sheet）
  createPlanTrigger?: number;
  onCreatePlanTriggerConsumed?: () => void;
  outfitPlanEntries: OutfitPlanEntry[];
  outfitCalendarPlans: OutfitCalendarPlan[];
  planPackingChecklistItems: PlanPackingChecklistItem[];
  onPlanDataChange: () => Promise<void>;
}) {
  const [subPage, setSubPage] = useState<SubPage>("library");
  const [viewingOutfitId, setViewingOutfitId] = useState<string | null>(null);
  // v1.1.4-dev 详情来源: 关闭套装详情时, 按此 subPage 返回。
  const [detailReturnTo, setDetailReturnTo] = useState<DetailReturnTo>("library");
  const [editingOutfitId, setEditingOutfitId] = useState<string | null>(null);

  // filters
  const [chipFilter, setChipFilter] = useState<string>("all");
  const [sceneChip] = useState<string>("");

 // create / edit state (create_flow 内部维护 selectedItemIds, edit 页复用 OutfitInfoForm 表单 state)
 const [createName, setCreateName] = useState("");
 const [createSeasons, setCreateSeasons] = useState<Season[]>([]);
 const [createScenes, setCreateScenes] = useState<string[]>([]);
 const [createStyles, setCreateStyles] = useState<string[]>([]);
 const [createPairingTags, setCreatePairingTags] = useState<string[]>([]);
 const [createMinC, setCreateMinC] = useState("");
 const [createMaxC, setCreateMaxC] = useState("");
 const [createNotes, setCreateNotes] = useState("");
 const [createCustomTag, setCreateCustomTag] = useState("");
 const [createSelectedIds, setCreateSelectedIds] = useState<number[]>([]);
 const [isRegeneratingInfo, setIsRegeneratingInfo] = useState(false);
  const [regenerateInfoHint, setRegenerateInfoHint] = useState("");
  const [writingOutfitId, setWritingOutfitId] = useState<string | null>(null);
  const [showRevisionConflict, setShowRevisionConflict] = useState(false);

  // real image state
  const [realImageViewing, setRealImageViewing] = useState<OutfitRealImage | null>(null);
  const [realImageCaption, setRealImageCaption] = useState("");
  const [realImageTakenAt, setRealImageTakenAt] = useState("");
  const [realImageFileUrl, setRealImageFileUrl] = useState("");
  const realImageInputRef = useRef<HTMLInputElement>(null);
  const realImageCameraRef = useRef<HTMLInputElement>(null);

  const isSubPage = subPage !== "library";
  useEffect(() => {
    onSubPageChange(isSubPage);
  }, [isSubPage, onSubPageChange]);

  // v1.1 review fix: 上报当前子页 key，让 wardrobe-app 能识别 planning 子页以高亮「添加穿搭计划」
  useEffect(() => {
    onSubPageKeyChange?.(isSubPage ? subPage : null);
  }, [isSubPage, subPage, onSubPageKeyChange]);

  // External create trigger
  useEffect(() => {
    if (createTrigger > 0) {
      startCreate();
      onCreateTriggerConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createTrigger]);

  // v1.1 review fix: 全局 FAB 触发添加穿搭计划。默认切到 plan_add 子页（用今天作为 startDate）。
  useEffect(() => {
    if (createPlanTrigger && createPlanTrigger > 0) {
      setSubPage("plan_add");
      onCreatePlanTriggerConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createPlanTrigger]);

  // Android back button — Subagent F: 使用稳定 handler
  useStableBackHandler(() => {
    // 1. 图片放大层关闭（由父级 wardrobe-app 处理 expandedImage）
    // 2. 更多菜单关闭 (menuOpen 在 OutfitDetailView 内部管理)
    // 3. 编辑 sheet 关闭
    if (subPage === "edit") { setSubPage("detail"); return true; }
    // 4. 实图管理页返回套装详情
    if (subPage === "real_image_view") { setRealImageViewing(null); setSubPage("detail"); return true; }
    if (subPage === "real_image_add") { setSubPage("detail"); return true; }
    // 5. 套装详情按 detailReturnTo 返回 (v1.1.4-dev 详情来源链路)
    if (subPage === "detail") { closeOutfitDetail(); return true; }
    // 6. 月历页返回套装首页
    if (subPage === "planning_calendar") { setSubPage("library"); return true; }
    // 7. 计划添加页返回上一层（月历）
    if (subPage === "plan_add") { setSubPage("planning_calendar"); return true; }
    if (subPage === "plan_edit") { setSubPage("plan_detail"); return true; }
    // 计划详情页返回月历
    if (subPage === "plan_detail") { setSubPage("planning_calendar"); return true; }
    // 打包清单页返回计划详情
    if (subPage === "packing_list") { setSubPage("plan_detail"); return true; }
    // create_flow 保持不动
    if (subPage === "create_flow") return false;
    if (subPage === "create_info") { setSubPage("create_select"); return true; }
    if (subPage === "create_select") { setSubPage("library"); return true; }
    return false;
  }, isSubPage);

  const itemIdSet = useMemo(() => new Set(items.filter((i) => i.id != null).map((i) => i.id as number)), [items]);
  const displayOutfits = useMemo(
    () => outfits.map((o) => ({ ...o, itemIds: o.itemIds.filter((id) => itemIdSet.has(id)) })).filter((o) => o.itemIds.length > 0),
    [outfits, itemIdSet],
  );

  const viewingOutfit = viewingOutfitId ? displayOutfits.find((o) => o.id === viewingOutfitId) : null;
  const viewingItems = viewingOutfit ? items.filter((i) => i.id && viewingOutfit.itemIds.includes(i.id)) : [];
  const editingOutfit = editingOutfitId ? displayOutfits.find((o) => o.id === editingOutfitId) : null;

  // stats
  const todayKey = useLocalDateKey();
  const wearSnapshot = { items, outfits, outfitPlanEntries };

	  // Round 6: planning state
	  const [planningMonthDate, setPlanningMonthDate] = useState(todayKey.slice(0, 7));
	  const [selectedPlanDate, setSelectedPlanDate] = useState(todayKey);
	  const [weeklyAnchorDate, setWeeklyAnchorDate] = useState(todayKey);
	  const [selectedWeekDate, setSelectedWeekDate] = useState(todayKey);
	  const [addPlanSheetOpen, setAddPlanSheetOpen] = useState(false);
	  const [planAddType, setPlanAddType] = useState<OutfitCalendarPlanType>("travel");
	  const [activeCalendarPlanId, setActiveCalendarPlanId] = useState<string | null>(null);
	  const [selectOutfitDate, setSelectOutfitDate] = useState<string | null>(null);
	  const [selectOutfitMode, setSelectOutfitMode] = useState<"change" | "backup">("backup");
	  const [showPlanSelectSheet, setShowPlanSelectSheet] = useState(false);
  const wornThisMonth = useMemo(() => {
    const monthPrefix = todayKey.slice(0, 7);
    return displayOutfits.filter((o) => (o.wornDates ?? []).some((d) => d.startsWith(monthPrefix))).length;
  }, [displayOutfits, todayKey]);

  // filtered outfits
  const filteredOutfits = useMemo(() => {
    let result = displayOutfits;

    if (chipFilter === "worn_recently") {
      result = result.filter((o) => (o.wornDates ?? []).length > 0);
    } else if (chipFilter === "never_worn") {
      result = result.filter((o) => (o.wornDates ?? []).length === 0);
 } else if (chipFilter !== "all") {
 // season or scene filter (styleTags 用 labelOutfitStyleTags 中文化)
 result = result.filter((o) => {
 const tags = [...(o.seasons ?? []).map((s) => SEASON_LABELS[s]), ...(o.sceneTags ?? []), ...labelOutfitStyleTags(o.styleTags ?? [])];
 return tags.includes(chipFilter);
 });
 }
    if (sceneChip) {
      result = result.filter((o) => (o.sceneTags ?? []).includes(sceneChip));
    }
    return result;
  }, [displayOutfits, chipFilter, sceneChip, todayKey]);

  // Mark worn today (v1.1.0 fix: use unified sync service)
  async function handleMarkWornToday(outfit: SavedOutfit) {
    try {
      const hasToday = hasWornDate(outfit.wornDates, todayKey, todayKey);
      const result = hasToday
        ? await cancelActualOutfitWearForDate({ dateKey: todayKey, outfitId: outfit.id, todayKey, snapshot: wearSnapshot })
        : await recordActualOutfitWear({ dateKey: todayKey, outfitId: outfit.id, todayKey, mode: "worn", snapshot: wearSnapshot }); await onRefresh();
      await onPlanDataChange();
      onMessage(hasToday ? "已取消今天穿着记录" : "已记录今天穿着");
    } catch (error) {
      onMessage(formatOutfitWearSyncError(error), "error");
    }
  }

  // Real image handlers
  function handleAddRealImage() {
    setRealImageFileUrl("");
    setRealImageCaption("");
    setRealImageTakenAt(todayKey);
    setSubPage("real_image_add");
  }

  function handleRealImageFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    fileToCompressedDataUrl(file).then((dataUrl) => {
      setRealImageFileUrl(dataUrl);
    }).catch(() => onMessage("图片读取失败", "error"));
    e.target.value = "";
  }

  async function handleSaveRealImage() {
    if (!viewingOutfit || !realImageFileUrl) return;
    const now = new Date().toISOString();
    const newImage: LocalOutfitRealImageDraft = {
      id: `outfit-real-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      localOriginalDataUrl: realImageFileUrl,
      localThumbnailDataUrl: realImageFileUrl,
      caption: realImageCaption.trim() || undefined,
      takenAt: realImageTakenAt || undefined,
      createdAt: now,
      updatedAt: now,
    };
    const updated: LocalOutfitRealImageDraft[] = [...(viewingOutfit.outfitRealImages ?? []), newImage];
    rethrowIfFailed(await wardrobeRepository.updateOutfit(viewingOutfit, { outfitRealImages: updated, updatedAt: now }), "保存套装失败");
    await onRefresh();
    setSubPage("detail");
    onMessage("穿搭实图已保存");
  }

  async function handleDeleteRealImage(imageId: string) {
    if (!viewingOutfit) return;
    const updated = (viewingOutfit.outfitRealImages ?? []).filter((img) => img.id !== imageId);
    rethrowIfFailed(await upsertOutfit({ ...viewingOutfit, outfitRealImages: updated, updatedAt: new Date().toISOString() }), "保存套装失败");
    await onRefresh();
    setRealImageViewing(null);
    setSubPage("detail");
    onMessage("穿搭实图已删除");
  }

  // Create outfit: 进入4步流程 (create_flow 内 IntakeFlowShell 自己管理 selectedItemIds)
 function startCreate() {
 setCreateName("");
 setCreateSeasons([]);
 setCreateScenes([]);
 setCreateStyles([]);
 setCreatePairingTags([]);
 setCreateMinC("");
 setCreateMaxC("");
 setCreateNotes("");
 setCreateCustomTag("");
 setCreateSelectedIds([]);
 setIsRegeneratingInfo(false);
 setRegenerateInfoHint("");
 setSubPage("create_flow");
 }

 // v1.0: 创建流程的保存 (OutfitIntakeFlow4步流程的 step3 保存回调) — 不再处理未知单品
 async function handleSaveOutfitIntake(draft: OutfitIntakeDraft) {
 const now = new Date().toISOString();
 const newOutfit = outfitDraftToSavedOutfit(draft, { now });
 if (newOutfit.itemIds.length <2) {
 onMessage("套装至少需要2 件衣物", "info");
 return;
 }
 rethrowIfFailed(await wardrobeRepository.createOutfit(newOutfit), "保存套装失败");
 await onRefresh();
 setSubPage("library");
 onMessage("套装已创建");
 onCreateClosed?.();
 }

 // v1.0: 创建流程的 AI增强回调 — 与 generateOutfitAiSuggestionOnDevice独立
 async function handleEnhanceOutfitDraft(draft: OutfitIntakeDraft): Promise<OutfitIntakeDraft> {
 const itemIds = draft.itemIds.value.filter((id): id is number => typeof id === "number");
 const itemIdSet = new Set(items.map((i) => i.id).filter((id): id is number => typeof id === "number"));
 const validIds = itemIds.filter((id) => itemIdSet.has(id));
 const outfitItems = validIds.map((id) => items.find((i) => i.id === id)!).filter(Boolean);
 const settings = loadMiniMaxSettings();
 if (!hasDeviceMiniMaxKey(settings) || outfitItems.length ===0) {
 const local = buildLocalOutfitMetadataFromItems({ outfitItems, currentName: draft.name.value });
 return patchIntakeDraftFromMetadata(draft, local);
 }
 try {
 const generated = await generateOutfitMetadataOnDevice(
 { itemIds: validIds, name: draft.name.value },
 { outfitItems, allItems: items },
 settings,
 );
 return patchIntakeDraftFromMetadata(draft, generated);
 } catch (error) {
 const local = buildLocalOutfitMetadataFromItems({ outfitItems, currentName: draft.name.value });
 return patchIntakeDraftFromMetadata(draft, local);
 }
 }

 function patchIntakeDraftFromMetadata(draft: OutfitIntakeDraft, meta: { name?: string; seasons?: Season[]; sceneTags?: string[]; styleTags?: string[]; pairingTags?: string[]; temperatureRange?: { minC?: number; maxC?: number }; notes?: string }): OutfitIntakeDraft {
 return {
 ...draft,
 ...(meta.name ? { name: { ...draft.name, value: meta.name } } : {}),
 ...(meta.seasons ? { seasons: { ...draft.seasons, value: meta.seasons } } : {}),
 ...(meta.sceneTags ? { sceneTags: { ...draft.sceneTags, value: meta.sceneTags } } : {}),
 ...(meta.styleTags ? { styleTags: { ...draft.styleTags, value: meta.styleTags } } : {}),
 ...(meta.pairingTags ? { pairingTags: { ...draft.pairingTags, value: meta.pairingTags } } : {}),
 ...(meta.temperatureRange ? { temperatureRange: { ...draft.temperatureRange, value: meta.temperatureRange } } : {}),
 ...(meta.notes !== undefined ? { notes: { ...draft.notes, value: meta.notes } } : {}),
 updatedAt: new Date().toISOString(),
 };
 }

 // v1.0: 编辑页 "重新使用 AI 生成信息" — 只回填表单,不直接保存
 async function handleRegenerateEditInfo() {
 if (isRegeneratingInfo) return;
 setIsRegeneratingInfo(true);
 setRegenerateInfoHint("");
 try {
 const itemIdSet = new Set(items.map((i) => i.id).filter((id): id is number => typeof id === "number"));
 const validIds = createSelectedIds.filter((id) => itemIdSet.has(id));
 const outfitItems = validIds.map((id) => items.find((i) => i.id === id)!).filter(Boolean);
 const settings = loadMiniMaxSettings();
 if (!hasDeviceMiniMaxKey(settings) || outfitItems.length ===0) {
 const local = buildLocalOutfitMetadataFromItems({ outfitItems, currentName: createName });
 applyMetadataToEditForm(local);
 setRegenerateInfoHint(outfitItems.length ===0 ? "套装内无衣物,已跳过 AI" : "无 MiniMax Key,已使用本地规则生成");
 return;
 }
 try {
 const generated = await generateOutfitMetadataOnDevice(
 { itemIds: validIds, name: createName },
 { outfitItems, allItems: items },
 settings,
 );
 applyMetadataToEditForm(generated);
 setRegenerateInfoHint("已使用 AI 生成,可继续手动修改");
 } catch (error) {
 const local = buildLocalOutfitMetadataFromItems({ outfitItems, currentName: createName });
 applyMetadataToEditForm(local);
 const reason = error instanceof Error ? error.message : "未知错误";
 setRegenerateInfoHint(`AI 生成失败 (${reason}),已降级为本地规则生成`);
 }
 } finally {
 setIsRegeneratingInfo(false);
 }
 }

 function applyMetadataToEditForm(meta: { name?: string; seasons?: Season[]; sceneTags?: string[]; styleTags?: string[]; pairingTags?: string[]; temperatureRange?: { minC?: number; maxC?: number }; notes?: string }) {
 if (meta.name?.trim()) setCreateName(meta.name.trim());
 if (meta.seasons) setCreateSeasons(meta.seasons);
 if (meta.sceneTags) setCreateScenes(meta.sceneTags);
 if (meta.styleTags) setCreateStyles(meta.styleTags);
 if (meta.pairingTags) setCreatePairingTags(meta.pairingTags);
 if (meta.temperatureRange) {
 setCreateMinC(meta.temperatureRange.minC?.toString() ?? "");
 setCreateMaxC(meta.temperatureRange.maxC?.toString() ?? "");
 }
 if (meta.notes !== undefined) setCreateNotes(meta.notes);
 }

 // v1.0:详情页切换收藏 (创建流程默认不收藏)
 async function handleToggleFavorite(outfit: SavedOutfit) {
 if (writingOutfitId === outfit.id) return;
 const next = !outfit.favorite;
 const now = new Date().toISOString();
 setWritingOutfitId(outfit.id);
 try {
   const result = await wardrobeRepository.updateOutfit(outfit, { favorite: next, updatedAt: now });
   if (!result.ok) {
     if (result.code === "conflict") {
       await onRefresh();
       setShowRevisionConflict(true);
       return;
     }
     onMessage(result.error ?? "保存套装失败，请重试", "error");
     return;
   }
   await onRefresh();
   onMessage(next ? "已收藏套装" : "已取消收藏");
 } finally {
   setWritingOutfitId(null);
 }
 }

 // Edit outfit
 function startEdit() {
 if (!viewingOutfit) return;
 setEditingOutfitId(viewingOutfit.id);
 setCreateName(viewingOutfit.name);
 setCreateSeasons(viewingOutfit.seasons ?? []);
 setCreateScenes(viewingOutfit.sceneTags ?? []);
 setCreateStyles(viewingOutfit.styleTags ?? []);
 setCreatePairingTags(viewingOutfit.pairingTags ?? []);
 setCreateMinC(viewingOutfit.temperatureRange?.minC?.toString() ?? "");
 setCreateMaxC(viewingOutfit.temperatureRange?.maxC?.toString() ?? "");
 setCreateNotes(viewingOutfit.notes ?? "");
 setCreateSelectedIds([...viewingOutfit.itemIds]);
 setIsRegeneratingInfo(false);
 setRegenerateInfoHint("");
 setSubPage("edit");
 }

  async function handleSaveEdit() {
    if (!editingOutfit) return;
    if (writingOutfitId === editingOutfit.id) return;
    if (createSelectedIds.length < 2) {
      onMessage("套装至少需要 2 件衣物", "info");
      return;
    }
    const now = new Date().toISOString();
    const selectedItems = items.filter((item) => item.id != null && createSelectedIds.includes(item.id));
    const patch: Partial<SavedOutfit> = {
      name: createName.trim() || "未命名套装",
      itemIds: createSelectedIds,
      ...buildOutfitCoverRefreshPatch(createSelectedIds, selectedItems),
      aiSuggestion: undefined,
      seasons: createSeasons.length > 0 ? createSeasons : undefined,
      sceneTags: createScenes.length > 0 ? createScenes : undefined,
      styleTags: createStyles.length > 0 ? createStyles : undefined,
      pairingTags: createPairingTags.length > 0 ? createPairingTags : undefined,
      temperatureRange: normalizeTemperatureRange((createMinC || createMaxC) ? {
        ...(createMinC ? { minC: parseFloat(createMinC) } : {}),
        ...(createMaxC ? { maxC: parseFloat(createMaxC) } : {}),
      } : undefined),
      notes: createNotes.trim() || undefined,
      updatedAt: now,
    };
    setWritingOutfitId(editingOutfit.id);
    try {
      const result = await wardrobeRepository.updateOutfit(editingOutfit, patch);
      if (!result.ok) {
        if (result.code === "conflict") {
          await onRefresh();
          setShowRevisionConflict(true);
          return;
        }
        onMessage(result.error ?? "保存套装失败，请重试", "error");
        return;
      }
      await onRefresh();
      setSubPage("detail");
      setEditingOutfitId(null);
      onMessage("套装已更新");
    } finally {
      setWritingOutfitId(null);
    }
  }

  // Delete outfit
  async function handleDeleteOutfit() {
    if (!viewingOutfit) return;
    if (writingOutfitId === viewingOutfit.id) return;
    setWritingOutfitId(viewingOutfit.id);
    try {
      const repoResult = await wardrobeRepository.deleteOutfit(viewingOutfit);
      if (!repoResult.ok) throw new Error(repoResult.error ?? "delete failed");
      const result = repoResult.data!;
      await onPlanDataChange();
      await onRefresh();
      setViewingOutfitId(null);
      setSubPage("library");
      onCloseOutfitDetail?.();
      onMessage(`套装已删除${result.deletedPlanEntryIds.length > 0 ? `，已清理 ${result.deletedPlanEntryIds.length} 条未来计划` : ""}`);
    } catch {
      onMessage("删除失败，请重试", "error");
      throw new Error("delete outfit failed");
    } finally {
      setWritingOutfitId(null);
    }
  }

	  // Round 6: planning helpers
	  const activeCalendarPlan = activeCalendarPlanId ? outfitCalendarPlans.find((p) => p.id === activeCalendarPlanId) : null;

	  // P0 fix: plan_detail / packing_list 时 activeCalendarPlan 被清空（race 或并发删除），安全退回月历
	  useEffect(() => {
	    if ((subPage === "plan_detail" || subPage === "packing_list") && !activeCalendarPlan) {
	      setSubPage("planning_calendar");
	    }
	  }, [subPage, activeCalendarPlan]);

	  // v1.1.0 fix: 使用 addOutfitToDate auto 模式，今天/未来创建计划，过去补录已穿
	  // v1.1.4-dev: 成功后调用 syncPackingChecklistForDate(dateKey), 让所有覆盖该日期的 plan 打包清单自动同步。
	  // v1.1.9 4D: 默认改为 "auto"，由 resolveAddOutfitIntent 根据日期状态决定 worn/planned
	  async function handleAddOutfitToDate(dateKey: string, outfitId: string, mode: "auto" | "planned" | "worn" = "auto", opts?: { makePrimary?: boolean; role?: import("@/lib/types").OutfitPlanEntryRole }) {
	    try {
	      const result = await addOutfitToDate({ dateKey, outfitId, mode, todayKey, snapshot: wearSnapshot, ...opts }); try {
	        await syncPackingChecklistForDate(dateKey);
	      } catch {
	        onMessage("打包清单同步失败，请重试", "error");
	      }
	      await onPlanDataChange();
	      onMessage(dateKey < todayKey ? "已补记穿搭" : dateKey === todayKey ? "已加入今日计划" : "已加入穿搭计划");
	    } catch (error) {
	      onMessage(formatOutfitWearSyncError(error), "error");
	    }
	  }

	  // v1.1.4-dev: 计划保存/编辑后调用 syncPackingChecklistForPlan, 保证打包清单与新范围一致。
	  async function handleSaveCalendarPlan(plan: OutfitCalendarPlan | OutfitCalendarPlanDraft) {
	    try {
        const wasEditing = subPage === "plan_edit";
        const result = await upsertTripPlan(plan);
        if (!result.ok || !result.data) {
          onMessage("计划保存失败，请重试", "error");
          return;
        }
	      try {
	        await syncPackingChecklistForPlan(result.data.id);
	      } catch {
	        onMessage("打包清单同步失败，请重试", "error");
	      }
	      await onPlanDataChange();
        setActiveCalendarPlanId(result.data.id);
	      setSubPage(wasEditing ? "plan_detail" : "planning_calendar");
	      onMessage("计划已保存");
	    } catch {
	      onMessage("操作失败，请重试", "error");
    }
	  }

		  async function handleDeleteCalendarPlan(planId: string) {
		    try {
		      void repoDeleteTripPlan(planId as unknown as OutfitCalendarPlan);
		      await onPlanDataChange();
          setActiveCalendarPlanId(null);
          setSubPage("planning_calendar");
		      onMessage("已删除旅行计划");
		    } catch {
		      onMessage("操作失败，请重试", "error");
		    }
		  }

  async function handleDeletePlanEntry(entry: OutfitPlanEntry) {
    try {
      // P0-04 fix: worn entries must go through cancel wear, not plain delete
      if (entry.status === "worn") {
        const outfitId = entry.outfitId ?? entry.actualOutfitId;
        if (outfitId) {
          await handleCancelOutfitWearForDate(outfitId, entry.date);
          return;
        }
      }
      void repoDeleteOutfitPlanEntry(entry.id as unknown as OutfitPlanEntry).then(r => { if (!r.ok) console.error("删除计划失败", r.error); });
      await syncPackingChecklistForDate(entry.date);
      await onPlanDataChange();
      onMessage("已删除当天穿搭");
    } catch {
      onMessage("删除失败，请重试", "error");
    }
  }

	  async function handleTogglePackingItemChecked(itemId: string, checked: boolean) {
	    try {
        if (activeCalendarPlanId) {
        const plan = outfitCalendarPlans.find((p) => p.id === activeCalendarPlanId);
        if (plan) {
          const now = new Date().toISOString();
          const updatedItems = planPackingChecklistItems.map((ci) =>
            ci.id === itemId ? { ...ci, checked, updatedAt: now } : ci
          );
          void upsertTripPlan(plan, updatedItems).then(r => { if (!r.ok) console.error("保存计划失败", r.error); });
        }
      }
	      await onPlanDataChange();
	    } catch {
	      onMessage("操作失败，请重试", "error");
	    }
	  }

	  async function handleSaveManualPackingItem(input: { label: string; category?: string; quantity?: number }) {
	    if (!activeCalendarPlanId) return;
	    try {
	      const plan = outfitCalendarPlans.find((p) => p.id === activeCalendarPlanId);
	      if (plan) {
	        const now = new Date().toISOString();
	        const newItem: PlanPackingChecklistItem = {
	          id: `packing-${activeCalendarPlanId}-manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
	          calendarPlanId: activeCalendarPlanId,
	          source: "manual",
	          label: input.label,
	          category: input.category || "手动新增",
	          quantity: input.quantity ?? 1,
	          checked: false,
	          createdAt: now,
	          updatedAt: now,
	        };
	        void upsertTripPlan(plan, [...planPackingChecklistItems, newItem]).then(r => { if (!r.ok) console.error("保存计划失败", r.error); });
	      }
	      await onPlanDataChange();
	    } catch {
	      onMessage("操作失败，请重试", "error");
	    }
	  }

	  async function handleMarkAllPacked() {
	    if (!activeCalendarPlanId) return;
	    try {
	      const plan = outfitCalendarPlans.find((p) => p.id === activeCalendarPlanId);
	      if (plan) {
	        const now = new Date().toISOString();
	        const updatedItems = planPackingChecklistItems.map((ci) =>
	          ci.calendarPlanId === activeCalendarPlanId ? { ...ci, checked: true, updatedAt: now } : ci
	        );
	        void upsertTripPlan(plan, updatedItems).then(r => { if (!r.ok) console.error("保存计划失败", r.error); });
	      }
	      await onPlanDataChange();
	    } catch {
	      onMessage("操作失败，请重试", "error");
	    }
	  }

	  async function handleResetAllPacking() {
	    if (!activeCalendarPlanId) return;
	    try {
	      const plan = outfitCalendarPlans.find((p) => p.id === activeCalendarPlanId);
	      if (plan) {
	        const now = new Date().toISOString();
	        const updatedItems = planPackingChecklistItems.map((ci) =>
	          ci.calendarPlanId === activeCalendarPlanId ? { ...ci, checked: false, updatedAt: now } : ci
	        );
	        void upsertTripPlan(plan, updatedItems).then(r => { if (!r.ok) console.error("保存计划失败", r.error); });
	      }
	      await onPlanDataChange();
	    } catch {
	      onMessage("操作失败，请重试", "error");
	    }
	  }

	  // v1.1.0 fix:统一使用 recordActualOutfitWear，不限于 Today
	  async function handleMarkPlanEntryWorn(entry: OutfitPlanEntry) {
	    const outfitId = entry.outfitId ?? entry.actualOutfitId;
	    if (!outfitId) return;
	    try {
	      const result = await recordActualOutfitWear({ dateKey: entry.date, outfitId, todayKey, mode: "worn", snapshot: wearSnapshot }); await onPlanDataChange();
	      onMessage(entry.date === todayKey ? "已记录今天穿了" : "已补记穿搭");
	    } catch (error) {
	      onMessage(formatOutfitWearSyncError(error), "error");
	    }
	  }

	  async function handleSkipPlanEntry(entry: OutfitPlanEntry) {
	    try {
        const now = new Date().toISOString();
        void repoUpsertOutfitPlanEntry({ ...entry, status: "skipped", updatedAt: now }).then(r => { if (!r.ok) console.error("保存计划失败", r.error); });
	      await onPlanDataChange();
	      onMessage("已标记为未穿");
	    } catch {
	      onMessage("操作失败，请重试", "error");
	    }
	  }

	  async function handleSetPrimaryEntry(entry: OutfitPlanEntry) {
	    try {
	      const now = new Date().toISOString();
	      const sameDay = outfitPlanEntries.filter((e) => e.date === entry.date && e.status === "planned");
	      for (const e of sameDay) {
	        if (e.id === entry.id) {
	          void repoUpsertOutfitPlanEntry({ ...e, isPrimary: true, updatedAt: now }).then(r => { if (!r.ok) console.error("保存计划失败", r.error); });
	        } else if (e.isPrimary) {
	          void repoUpsertOutfitPlanEntry({ ...e, isPrimary: false, updatedAt: now }).then(r => { if (!r.ok) console.error("保存计划失败", r.error); });
	        }
	      }
	      await onPlanDataChange();
	      onMessage("已设为当天主展示");
	    } catch {
	      onMessage("操作失败，请重试", "error");
	    }
	  }

	  // v1.1.0 fix: 新增取消实际穿着
	  async function handleCancelOutfitWearForDate(dateKey: string, outfitId: string) {
	    try {
	      const result = await cancelActualOutfitWearForDate({ dateKey, outfitId, todayKey, snapshot: wearSnapshot }); await onPlanDataChange();
	      onMessage(dateKey === todayKey ? "已取消今天穿着记录" : "已取消该日穿着记录");
	    } catch (error) {
	      onMessage(formatOutfitWearSyncError(error), "error");
	    }
	 }

	  function openPlanOutfitSelect(dateKey: string) {
	    setSelectOutfitDate(dateKey);
	    setSelectOutfitMode("backup");
	    setShowPlanSelectSheet(true);
	  }

	  function openChangeOutfitSelect(dateKey: string) {
	    setSelectOutfitDate(dateKey);
	    setSelectOutfitMode("change");
	    setShowPlanSelectSheet(true);
	  }

	  async function handleSelectOutfitForPlan(outfit: SavedOutfit) {
	    if (selectOutfitDate) {
	      const opts = selectOutfitMode === "change" ? { makePrimary: true } : { role: "backup" as const };
	      await handleAddOutfitToDate(selectOutfitDate, outfit.id, "auto", opts);
	    }
	    setShowPlanSelectSheet(false);
	    setSelectOutfitDate(null);
	  }

	  // v1.1.0 fix:切周时保持当前星期几偏移，不丢失选中日期
	  function handleShiftWeek(delta: -1 | 1) {
	    setWeeklyAnchorDate((prev) => {
	      const currentWeek = getWeekDates(prev);
	      const currentIndex = Math.max(0, currentWeek.indexOf(selectedWeekDate));
	      const nextAnchor = shiftDateByWeeksFn(prev, delta);
	      const nextWeek = getWeekDates(nextAnchor);
	      setSelectedWeekDate(nextWeek[currentIndex] ?? nextWeek[0] ?? nextAnchor);
	      return nextAnchor;
	    });
	  }

	  function openPlanningCalendarFromLibrary() {
	    setPlanningMonthDate(selectedWeekDate.slice(0, 7));
	    setSelectedPlanDate(selectedWeekDate);
	    setSubPage("planning_calendar");
	  }

	  function openTravelPlanSheetFromLibrary() {
	    setAddPlanSheetOpen(true);
	  }

  // v1.1.4-dev 详情来源链路: 打开套装详情时记录来源, 关闭时按来源返回。
  function openOutfitDetail(outfitId: string, returnTo: DetailReturnTo) {
    setViewingOutfitId(outfitId);
    setDetailReturnTo(returnTo);
    setSubPage("detail");
  }

  function closeOutfitDetail() {
    if (activeOutfitRoute) {
      onCloseOutfitDetail?.();
      return;
    }
    setSubPage(detailReturnTo);
    // 保留 viewingOutfitId 一帧, 让 OutfitDetailView 卸载动画稳定完成。
  }

  useEffect(() => {
    if (!activeOutfitRoute) return;
    setViewingOutfitId(activeOutfitRoute.outfitId);
    setDetailReturnTo(activeOutfitRoute.returnTo === "outfit_calendar" ? "planning_calendar" : "library");
    setSubPage("detail");
  }, [activeOutfitRoute?.outfitId, activeOutfitRoute?.returnTo, activeOutfitRoute?.returnRoute]);

  // v1.1.4-dev 计划详情入口: 同步该计划打包清单, 切到 plan_detail。
  async function openPlanDetail(planId: string) {
    setActiveCalendarPlanId(planId);
    try {
      await syncPackingChecklistForPlan(planId);
    } catch {
      onMessage("打包清单同步失败，请重试", "error");
    }
    setSubPage("plan_detail");
  }

  // v1.1.4-dev 打包清单自动同步 (单一 plan)
  async function syncPackingChecklistForPlan(planId: string): Promise<void> {
    const plan = outfitCalendarPlans.find((p) => p.id === planId);
    if (!plan) return;
    const allEntries = outfitPlanEntries;
    const allOutfits = outfits;
    const allItems = items;
    const allChecklist = planPackingChecklistItems.filter((ci) => ci.calendarPlanId === planId);
    const newItems = buildPackingItemsFromPlan({
      calendarPlan: plan,
      entries: allEntries,
      outfits: allOutfits,
      items: allItems,
      existingChecklistItems: allChecklist,
    });
    void upsertTripPlan(plan, newItems).then(r => { if (!r.ok) console.error("保存计划失败", r.error); });
  }

  // v1.1.4-dev 打包清单自动同步 (按日期 → 同步所有覆盖该日期的 plan)
  async function syncPackingChecklistForDate(dateKey: string): Promise<void> {
    const matchedPlans = outfitCalendarPlans.filter(
      (p) => dateKey >= p.startDate && dateKey <= p.endDate,
    );
    for (const plan of matchedPlans) {
      await syncPackingChecklistForPlan(plan.id);
    }
  }

  // v1.1.4-dev: 包装进入打包清单: 先同步再切页, 完成后只刷新一次页面状态。
  async function openPackingListFromPlanDetail() {
    if (!activeCalendarPlanId) return;
    try {
      await syncPackingChecklistForPlan(activeCalendarPlanId);
    } catch {
      onMessage("打包清单同步失败，请重试", "error");
    }
    await onPlanDataChange();
    setSubPage("packing_list");
  }
  // Render
  return (
    <div className="space-y-4">
      {subPage === "library" && (
        <>
          {/* Header - 与 AppSubPageTopBar / 衣橱首页顶部按钮行一致 h-14 (56px) */}
          <div className="flex h-14 items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-ink leading-tight">套装</h2>
              <p className="mt-0.5 truncate text-xs text-ink/50">
                {displayOutfits.length} 套{wornThisMonth > 0 ? ` · 本月穿过 ${wornThisMonth} 套` : ""}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={openPlanningCalendarFromLibrary}
                className="inline-flex h-10 min-w-[64px] items-center justify-center rounded-full border border-denim/20 bg-white px-3 text-sm font-semibold text-denim shadow-sm active:scale-95"
                aria-label="打开穿搭月历"
              >
                月历
              </button>
              <button
                type="button"
                onClick={openTravelPlanSheetFromLibrary}
                className="inline-flex h-10 min-w-[72px] items-center justify-center rounded-full bg-denim px-3 text-sm font-semibold text-white shadow-sm active:scale-95"
                aria-label="添加计划"
              >
                +计划
              </button>
            </div>
          </div>

	          <OutfitWeeklyPlanStrip
	            anchorDate={weeklyAnchorDate}
	            entries={outfitPlanEntries}
	            calendarPlans={outfitCalendarPlans}
	            outfits={outfits}
	            items={items}
	            todayKey={todayKey}
	            selectedDate={selectedWeekDate}
	            onSelectedDateChange={setSelectedWeekDate}
	            onShiftWeek={handleShiftWeek}
	            onSelectOutfitForDate={openPlanOutfitSelect}
	            onChangeOutfitForDate={openChangeOutfitSelect}
	            onViewOutfit={(outfitId) => openOutfitDetail(outfitId, "library")}
	            onMarkWornToday={handleMarkPlanEntryWorn}
	            onCancelWear={handleCancelOutfitWearForDate}
	            onSetPrimary={handleSetPrimaryEntry}
	            onMarkSkipped={handleSkipPlanEntry}
	            onDeleteEntry={handleDeletePlanEntry}
	            onOpenCalendarPlan={openPlanDetail}
	            onMessage={onMessage}
	          />

          {/* Chips */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {[
              { key: "all", label: "全部" },
              { key: "worn_recently", label: "最近穿过" },
              { key: "never_worn", label: "未穿过" },
              { key: "通勤", label: "通勤" },
              { key: "旅行", label: "旅行" },
              { key: "春", label: "春秋" },
              { key: "夏", label: "夏季" },
              { key: "冬", label: "冬季" },
            ].map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setChipFilter(chipFilter === chip.key ? "all" : chip.key)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  chipFilter === chip.key
                    ? "bg-denim/10 text-denim border border-denim/30"
                    : "bg-milk-darker/50 text-ink/60 border border-transparent"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Grid or Empty */}
          {displayOutfits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-3 rounded-full bg-milk-darker/60 p-4">
                <Layers size={32} className="text-ink/25" />
              </div>
              <p className="text-sm font-medium text-ink/50">还没有保存套装</p>
              <p className="mt-1 text-xs text-ink/30">用右下角 + 创建第一套穿搭。</p>
              <p className="text-xs text-ink/30">套装需要从已有衣物中选择创建。</p>
            </div>
          ) : filteredOutfits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-ink/40">没有匹配的套装</p>
            </div>
          ) : (
 <CatalogWaterfallGrid>
 {filteredOutfits.map((outfit) => {
 const validCount = countValidItems(outfit, items);
 const wearSummary = getWearSummary(outfit.wornDates, todayKey);
 const styleLabels = labelOutfitStyleTags(outfit.styleTags ?? []).slice(0,2);
 const sceneLabels = (outfit.sceneTags ?? []).slice(0,2);
 const tempLabel = outfit.temperatureRange
 ? `${outfit.temperatureRange.minC ?? "?"}℃ - ${outfit.temperatureRange.maxC ?? "?"}℃`
 : "";
 const subtitle = [
   `${validCount}件`,
   ...styleLabels,
   ...sceneLabels,
   tempLabel,
 ].filter(Boolean).join(" · ");

 return (
 <CatalogWaterfallCardShell
 key={outfit.id}
 ariaLabel={outfit.name?.trim() || "未命名套装"}
 onOpen={() => openOutfitDetail(outfit.id, "library")}
 title={outfit.name?.trim() || "未命名套装"}
 meta={subtitle}
 summary={wearSummary.label}
 media={<>
   <OutfitCover outfit={outfit} items={items} size="card" className="h-full w-full" />
   {outfit.favorite ? (
     <span aria-label="已收藏" className="absolute right-2 top-2 rounded-full bg-white/90 px-1.5 py-0.5 text-[11px] text-denim shadow-sm">★</span>
   ) : null}
 </>}
 />
                );
              })}
            </CatalogWaterfallGrid>
          )}

          {/* padding for global + */}
          <div className="h-20" />
        </>
      )}

      {/* Outfit Detail */}
      {subPage === "detail" && viewingOutfit && (
        <OutfitDetailView
          outfit={viewingOutfit}
          items={viewingItems}
          allItems={items}
          onBack={closeOutfitDetail}
          onEdit={startEdit}
          onMarkWorn={() => handleMarkWornToday(viewingOutfit)}
          onAddRealImage={handleAddRealImage}
          onViewRealImage={(img) => { setRealImageViewing(img); setSubPage("real_image_view"); }}
          onDeleteOutfit={handleDeleteOutfit}
 onToggleFavorite={() => handleToggleFavorite(viewingOutfit)}
          onExpandImage={onExpandImage}
          onRefresh={onRefresh}
          onMessage={onMessage}
          todayKey={todayKey}
        />
      )}

      {/* Real Image View */}
      {subPage === "real_image_view" && realImageViewing && (
        <RealImageView
          image={realImageViewing}
          onBack={() => { setRealImageViewing(null); setSubPage("detail"); }}
          onDelete={() => handleDeleteRealImage(realImageViewing.id)}
          onSaveCaption={async (caption) => {
            if (!viewingOutfit) return;
            const updated = (viewingOutfit.outfitRealImages ?? []).map((img) =>
              img.id === realImageViewing.id ? { ...img, caption, updatedAt: new Date().toISOString() } : img
            );
            rethrowIfFailed(await upsertOutfit({ ...viewingOutfit, outfitRealImages: updated, updatedAt: new Date().toISOString() }), "保存套装失败");
            await onRefresh();
            setRealImageViewing((prev) => prev ? { ...prev, caption, updatedAt: new Date().toISOString() } : null);
            onMessage("说明已更新");
          }}
          onExpandImage={onExpandImage}
        />
      )}

      {/* Add Real Image */}
      {subPage === "real_image_add" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSubPage("detail")} className="p-1 -ml-1"><ChevronLeft size={20} /></button>
            <h3 className="text-base font-semibold">添加穿搭实图</h3>
          </div>

          {realImageFileUrl ? (
            <div className="overflow-hidden rounded-xl bg-milk-darker/40">
              <img src={realImageFileUrl} alt="预览" className="max-h-[50vh] w-full object-contain" />
            </div>
          ) : (
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => realImageInputRef.current?.click()}
                className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white p-4 text-sm"
              >
                <ImageIcon size={20} className="text-ink/40" />
                <span>从相册选择</span>
              </button>
              <button
                type="button"
                onClick={() => realImageCameraRef.current?.click()}
                className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white p-4 text-sm"
              >
                <Camera size={20} className="text-ink/40" />
                <span>拍照</span>
              </button>
            </div>
          )}
          <input
            ref={realImageInputRef}
            type="file"
            accept={IMAGE_FILE_ACCEPT}
            className="hidden"
            onChange={handleRealImageFileSelected}
          />
          <input
            ref={realImageCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleRealImageFileSelected}
          />

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-ink/50">拍摄日期</label>
              <input
                type="date"
                value={realImageTakenAt}
                onChange={(e) => setRealImageTakenAt(e.target.value)}
                className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink/50">说明</label>
              <input
                type="text"
                value={realImageCaption}
                onChange={(e) => setRealImageCaption(e.target.value)}
                placeholder="例如：上海出差通勤穿搭"
                className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <p className="text-xs text-ink/30">这张照片会保存到当前套装，用于回看真实穿搭效果。</p>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setSubPage("detail")} className="flex-1 rounded-full border border-ink/10 py-2.5 text-sm">取消</button>
            <button
              type="button"
              onClick={handleSaveRealImage}
              disabled={!realImageFileUrl}
              className="flex-[2] rounded-full bg-denim py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* Create: Round 5 intake flow */}
      {subPage === "create_flow" && (
 <OutfitIntakeFlow
 items={items}
 locations={locations}
 defaultLocationId={locations?.[0]?.id}
 onEnhanceDraft={handleEnhanceOutfitDraft}
 onSave={handleSaveOutfitIntake}
 onExit={() => {
   setSubPage("library");
   onCreateClosed?.();
 }}
        />
      )}

      {/* v1.0: Edit 套装信息 (复用 OutfitInfoForm + 重新使用 AI 生成信息按钮) */}
      {subPage === "edit" && editingOutfit && (
        <OutfitInfoForm
          isEdit={true}
          name={createName} setName={setCreateName}
          seasons={createSeasons} setSeasons={setCreateSeasons}
          scenes={createScenes} setScenes={setCreateScenes}
          styles={createStyles} setStyles={setCreateStyles}
          pairingTags={createPairingTags} setPairingTags={setCreatePairingTags}
          customTag={createCustomTag} setCustomTag={setCreateCustomTag}
          minC={createMinC} setMinC={setCreateMinC}
          maxC={createMaxC} setMaxC={setCreateMaxC}
          notes={createNotes} setNotes={setCreateNotes}
          selectedIds={createSelectedIds}
          setSelectedIds={setCreateSelectedIds}
          items={items}
          onRegenerateInfo={handleRegenerateEditInfo}
          isRegeneratingInfo={isRegeneratingInfo}
          regenerateInfoHint={regenerateInfoHint}
          onBack={() => setSubPage("detail")}
          onSave={handleSaveEdit}
          onCancel={() => { setSubPage("detail"); setEditingOutfitId(null); }}
        />
      )}

	      {/* Round 6: Planning Calendar */}
	      {subPage === "planning_calendar" && (
	        <OutfitPlanningCalendarView
	          monthDate={planningMonthDate}
	          selectedDate={selectedPlanDate}
	          entries={outfitPlanEntries}
	          calendarPlans={outfitCalendarPlans}
	          outfits={outfits}
	          items={items}
	          todayKey={todayKey}
	          onBack={() => setSubPage("library")}
	          onAdd={() => setAddPlanSheetOpen(true)}
	          onMonthChange={(delta) => setPlanningMonthDate((prev) => {
	            const [y, m] = prev.split("-").map(Number) as [number, number];
	            let nm = m + delta;
	            let ny = y;
	            while (nm < 1) { nm += 12; ny--; }
	            while (nm > 12) { nm -= 12; ny++; }
	            return `${ny}-${String(nm).padStart(2, "0")}`;
	          })}
	          onToday={() => { setPlanningMonthDate(todayKey.slice(0, 7)); setSelectedPlanDate(todayKey); }}
	          onSelectedDateChange={setSelectedPlanDate}
	          onSelectOutfitForDate={openPlanOutfitSelect}
	          onViewOutfit={(outfitId) => openOutfitDetail(outfitId, "planning_calendar")}
	          onMarkWornToday={handleMarkPlanEntryWorn}
            onDeleteEntry={handleDeletePlanEntry}
	          onOpenCalendarPlan={openPlanDetail}
	          onMessage={onMessage}
	        />
	      )}

	      {/* Round 6: Plan Add */}
	      {subPage === "plan_add" && (
	        <OutfitPlanAddView
	          type={planAddType}
	          onBack={() => setSubPage("planning_calendar")}
	          onSave={handleSaveCalendarPlan}
	          onMessage={onMessage}
	        />
	      )}

        {subPage === "plan_edit" && activeCalendarPlan && (
          <OutfitPlanAddView
            type={activeCalendarPlan.type}
            initialPlan={activeCalendarPlan}
            onBack={() => setSubPage("plan_detail")}
            onSave={handleSaveCalendarPlan}
            onMessage={onMessage}
          />
        )}

	      {/* v1.1.4-dev: Plan Detail 单独渲染, 月历/计划胶囊入口 */}
	      {subPage === "plan_detail" && activeCalendarPlan && (
	        <OutfitPlanDetailView
	          calendarPlan={activeCalendarPlan}
	          entries={outfitPlanEntries}
	          outfits={outfits}
	          items={items}
	          todayKey={todayKey}
	          onBack={() => setSubPage("planning_calendar")}
            onEdit={() => setSubPage("plan_edit")}
            onDelete={() => handleDeleteCalendarPlan(activeCalendarPlan.id)}
	          onOpenPackingList={openPackingListFromPlanDetail}
	          onSelectOutfitForDate={(dateKey) => {
	            setSelectOutfitDate(dateKey);
	            setShowPlanSelectSheet(true);
	          }}
	          onViewOutfit={(outfitId) => openOutfitDetail(outfitId, "plan_detail")}
	        />
	      )}

	      {/* v1.1.4-dev: Packing List 单独渲染, 顶部「重新生成」按钮已删除, 改为自动同步 */}
	      {subPage === "packing_list" && activeCalendarPlan && (
	        <PlanPackingChecklistView
	          calendarPlan={activeCalendarPlan}
	          checklistItems={planPackingChecklistItems.filter((i) => i.calendarPlanId === activeCalendarPlanId)}
	          entries={outfitPlanEntries}
	          outfits={outfits}
	          items={items}
	          onBack={() => setSubPage("plan_detail")}
	          onToggleChecked={handleTogglePackingItemChecked}
	          onAddManual={handleSaveManualPackingItem}
	          onMarkAllPacked={handleMarkAllPacked}
	          onResetAll={handleResetAllPacking}
	          onMessage={onMessage}
	        />
	      )}

	      {/* Add Plan Sheet */}
	      <MotionSheet open={addPlanSheetOpen} onClose={() => setAddPlanSheetOpen(false)}>
	        <div className="text-center">
	          <h3 className="text-base font-semibold text-ink mb-3">添加计划</h3>
	          <div className="space-y-2">
	            {([
	              { type: "travel" as OutfitCalendarPlanType, label: "旅行", desc: "多天出行，可按日期安排穿搭并生成打包清单" },
	              { type: "business" as OutfitCalendarPlanType, label: "出差", desc: "商务出行，可按日期安排偏正式穿搭" },
	              { type: "custom" as OutfitCalendarPlanType, label: "自定义", desc: "自定义日期范围，用于活动、通勤周期及其他安排" },
	            ]).map((opt) => (
	              <button
	                key={opt.type}
	                type="button"
	                className="w-full rounded-xl border border-ink/10 bg-white p-3 text-left hover:bg-ink/2 transition-colors"
	                onClick={() => { setPlanAddType(opt.type); setAddPlanSheetOpen(false); setSubPage("plan_add"); }}
	              >
	                <p className="text-sm font-semibold text-ink">{opt.label}</p>
	                <p className="text-[11px] text-ink/45 mt-0.5">{opt.desc}</p>
	              </button>
	            ))}
	          </div>
	        </div>
	      </MotionSheet>

	      {/* Select Outfit Sheet */}
	      <OutfitPlanSelectSheet
	        open={showPlanSelectSheet}
	        onClose={() => { setShowPlanSelectSheet(false); setSelectOutfitDate(null); }}
	        outfits={displayOutfits}
	        items={items}
	        todayKey={todayKey}
	        dateKey={selectOutfitDate ?? undefined}
	        onSelect={handleSelectOutfitForPlan}
	      />
      <NoticeSheet
        open={showRevisionConflict}
        title="内容已在其他设备更新"
        description="已读取服务器上的最新版本，并保留你当前的编辑内容。请确认后再次保存。"
        actionLabel="继续编辑"
        onClose={() => setShowRevisionConflict(false)}
      />
    </div>
  );
}

// ─── Outfit Detail View ────────────────────────────────────────

function OutfitDetailView({
 outfit,
 items,
 allItems,
 onBack,
 onEdit,
 onMarkWorn,
 onAddRealImage,
 onViewRealImage,
 onDeleteOutfit,
 onToggleFavorite,
 onExpandImage,
 onRefresh,
 onMessage,
 todayKey,
}: {
 outfit: SavedOutfit;
 items: WardrobeItem[];
 allItems: WardrobeItem[];
 onBack: () => void;
 onEdit: () => void;
 onMarkWorn: () => void;
 onAddRealImage: () => void;
 onViewRealImage: (img: OutfitRealImage) => void;
 onDeleteOutfit: () => void | Promise<void>;
 /** v1.0: 收藏/取消收藏 (写在标题行右侧) */
 onToggleFavorite: () => void;
 onExpandImage: (image: { src: string; alt: string }) => void;
 onRefresh: () => Promise<void>;
 onMessage: (msg: string, type?: "success" | "error" | "info") => void;
 todayKey: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [detailTab, setDetailTab] = useState<"info" | "items" | "ai" | "records">("info");
  const [isGeneratingAdvice, setIsGeneratingAdvice] = useState(false);
  const [adviceError, setAdviceError] = useState("");
  const [replacementItemId, setReplacementItemId] = useState<number | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement>(null);
  const cover = getOutfitCover(outfit, allItems);
  const wearSummary = getWearSummary(outfit.wornDates, todayKey);
  const realImages = outfit.outfitRealImages ?? [];
  const allSlides = [
    { kind: "cover" as const, label: getDetailSlideLabel("outfit_cover") },
    ...realImages.map((img) => ({ kind: "real" as const, image: img, label: getDetailSlideLabel("outfit_real") })),
    { kind: "add" as const, label: "+套装示意" },
  ];
  const [activeSlide, setActiveSlide] = useState(0);
 const activeSlideData = allSlides[activeSlide];
 const sceneLabels = (outfit.sceneTags ?? []).join(" · ");
 // v1.0: 风格标签展示层中文化 (labelOutfitStyleTags 处理可能存在的英文枚举)
 const styleLabels = [...labelOutfitStyleTags(outfit.styleTags ?? []), ...(outfit.pairingTags ?? [])].join(" · ");
  const seasonLabels = outfit.seasons?.map((s) => SEASON_LABELS[s]).join(" / ") || "";
  const tempLabel = <TemperatureRangeBar value={outfit.temperatureRange} size="sm" />;
  const aiSuggestion = outfit.aiSuggestion;
  const gallerySlides = allSlides
    .filter((slide) => slide.kind !== "add")
    .map((slide) => ({
      id: slide.kind === "cover" ? "cover" : slide.image.id,
      label: slide.kind === "cover" ? getDetailSlideLabel("outfit_cover") : getDetailSlideLabel("outfit_real"),
      alt: outfit.name,
      imageDataUrl: "",
      thumbnailDataUrl: "",
      asset: slide.kind === "cover" ? outfit.coverImage?.asset : slide.image.image.asset,
      fallbackContent: slide.kind === "cover" ? (cover.mode === "empty" ? <div className="grid h-full w-full place-items-center text-ink/25"><Shirt size={48} /></div> : <OutfitCover outfit={outfit} items={allItems} size="detail" className="h-full w-full" />) : undefined,
      onAssetOpen: (url: string) => onExpandImage({ src: url, alt: slide.kind === "cover" ? outfit.name : slide.image.caption ?? "穿搭实图" }),
    }));
  const filmstripItems = allSlides
    .filter((slide) => slide.kind !== "add")
    .map((slide) => ({
      id: slide.kind === "cover" ? "cover" : slide.image.id,
      label: slide.kind === "cover" ? getDetailSlideLabel("outfit_cover") : getDetailSlideLabel("outfit_real"),
      imageDataUrl: "",
      thumbnailDataUrl: "",
      asset: slide.kind === "cover" ? outfit.coverImage?.asset : slide.image.image.asset,
      fallbackContent: slide.kind === "cover" ? <OutfitCover outfit={outfit} items={allItems} size="card" /> : undefined,
    }));
  const activeFilmstripId = activeSlideData?.kind === "real" ? activeSlideData.image.id : "cover";

  async function handleDeleteOutfit() {
    setMenuOpen(false);
    try {
      await onDeleteOutfit();
      setDeleteConfirm(false);
    } catch {
      // 父层负责 toast；失败时保留详情页和确认弹窗。
    }
  }

  async function saveAiSuggestion(nextSuggestion: OutfitAiSuggestion) {
    const now = new Date().toISOString();
    const updated = { ...outfit, aiSuggestion: nextSuggestion, updatedAt: now };
    void upsertOutfit(updated).then(r => { if (!r.ok) console.error("保存套装失败", r.error); });
    await onRefresh();
  }

  async function handleGenerateAdvice() {
    if (isGeneratingAdvice) return;
    setIsGeneratingAdvice(true);
    setAdviceError("");
    try {
      const settings = loadMiniMaxSettings();
      if (!hasDeviceMiniMaxKey(settings)) {
        const local = buildLocalOutfitAiSuggestion({ outfit, outfitItems: items, allItems });
        await saveAiSuggestion(local);
        setDetailTab("ai");
        onMessage("未配置 MiniMax Key，已生成本地规则建议", "info");
        return;
      }
      const generated = await generateOutfitAiSuggestionOnDevice(outfit, { outfitItems: items, allItems }, settings);
      await saveAiSuggestion(generated);
      setDetailTab("ai");
      onMessage("套装 AI 建议已生成");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "套装 AI 建议生成失败";
      const local = buildLocalOutfitAiSuggestion({ outfit, outfitItems: items, allItems });
      await saveAiSuggestion(local);
      setDetailTab("ai");
      setAdviceError(aiSuggestion ? `${msg}，已刷新为本地规则建议` : "");
      onMessage("AI 建议失败，已生成本地规则建议", "info");
    } finally {
      setIsGeneratingAdvice(false);
    }
  }

  return (
    <ItemDetailPageShell
      contentClassName="mx-auto w-full max-w-4xl pb-[calc(env(safe-area-inset-bottom)+24px)]"
      topBar={<DetailTopBar title="" onBack={onBack} onMore={() => setMenuOpen(!menuOpen)} moreButtonRef={menuAnchorRef} />}
      hero={<DetailHeroGallery slides={gallerySlides} currentIndex={Math.min(activeSlide, Math.max(gallerySlides.length - 1, 0))} onIndexChange={setActiveSlide} onExpandImage={onExpandImage} bottomRightAction={<button type="button" onClick={(event) => { event.stopPropagation(); onMarkWorn(); }} className="inline-flex h-9 items-center gap-1 rounded-full bg-white/90 border border-white/60 px-3 text-xs font-semibold shadow-sm text-ink/80">{wearSummary.hasToday ? "✓ 今天已穿" : "标记今天穿了"}</button>} emptyIcon={<Shirt size={48} />} emptyText="暂无套装封面" />}
      filmstrip={<DetailFilmstrip items={filmstripItems} activeId={activeFilmstripId} onSelect={(id) => { const index = allSlides.findIndex((slide) => slide.kind === "cover" ? id === "cover" : slide.kind === "real" && slide.image.id === id); if (index >= 0) setActiveSlide(index); }} addLabel="套装示意" onAdd={onAddRealImage} />}
      titleBlock={<DetailTitleMetaBlock eyebrow={wearSummary.label} title={outfit.name} metaParts={[`${items.length}件`, seasonLabels, sceneLabels, styleLabels]} />}
      tabs={<DetailTabs tabs={[{ key: "info", label: "信息" }, { key: "items", label: "组成" }, { key: "ai", label: "AI建议" }, { key: "records", label: "记录" }]} activeTab={detailTab} onChange={setDetailTab} />}
      overlays={<>
        <MotionPopoverMenu visible={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuAnchorRef as React.RefObject<HTMLElement | null>}>
          <div className="min-w-[160px] p-1">
            <button type="button" onClick={() => { setMenuOpen(false); onEdit(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-ink/80 hover:bg-mist"><Settings size={14} />编辑套装</button>
            <button type="button" onClick={() => { setMenuOpen(false); onToggleFavorite(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-ink/80 hover:bg-mist"><Sparkles size={14} />{outfit.favorite ? "取消收藏" : "收藏套装"}</button>
            <button type="button" onClick={() => { setMenuOpen(false); setDeleteConfirm(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"><Trash2 size={14} />删除套装</button>
          </div>
        </MotionPopoverMenu>
        <ConfirmActionSheet open={deleteConfirm} title={`删除「${outfit.name}」？`} description="删除后不会影响套装内的衣物，套装实图也会一并删除。" confirmLabel="删除" tone="danger" onConfirm={handleDeleteOutfit} onClose={() => setDeleteConfirm(false)} />
      </>}
    >

      {detailTab === "info" ? (
        <div className="px-4 mt-3 pb-8 space-y-4">
          <DetailAiCard
            title="AI套装建议"
            summary={aiSuggestion?.summary}
            sourceLabel={aiSuggestion?.source === "local" ? "基于本地规则" : aiSuggestion ? "基于 AI 建议" : undefined}
            generatedAt={aiSuggestion?.generatedAt}
            loading={isGeneratingAdvice}
            error={adviceError}
            emptyText="点击生成后，再查看适合场景、风险点、替换建议和缺失单品。"
            actionLabel={aiSuggestion ? "刷新建议" : "生成建议"}
            onAction={handleGenerateAdvice}
          />
          <DetailSurfaceCard title="套装概况">
            <div className="grid gap-3">
              <DetailInfoRow label="单品数量" value={`${items.length} 件`} />
              <DetailInfoRow label="收藏状态" value={outfit.favorite ? "已收藏" : "未收藏"} />

            </div>
          </DetailSurfaceCard>
          <DetailSurfaceCard title="适穿信息">
            <div className="grid gap-3">
              <DetailInfoRow label="适穿温度" value={tempLabel} />
              <DetailInfoRow label="风格标签" value={styleLabels} />
              <DetailInfoRow label="适合场景" value={sceneLabels} />
              <DetailInfoRow label="季节" value={seasonLabels} />
            </div>
          </DetailSurfaceCard>
          <DetailSurfaceCard title="穿着信息">
            <div className="grid gap-3">
              <DetailInfoRow label="穿着记录" value={wearSummary.label} />
              <DetailInfoRow label="穿着次数" value={`${(outfit.wornDates ?? []).length} 次`} />
            </div>
          </DetailSurfaceCard>
          <DetailSurfaceCard title="备注">
            <p className="text-sm leading-relaxed text-ink/65">{outfit.notes || "未填写"}</p>
          </DetailSurfaceCard>
        </div>
      ) : null}

      {detailTab === "items" ? (
        <div className="px-4 mt-4 pb-8">
          <OutfitCompositionTab
            outfit={outfit}
            items={items}
            allItems={allItems}
            suggestion={aiSuggestion}
            replacementItemId={replacementItemId}
            onToggleReplacement={(itemId) => setReplacementItemId((current) => current === itemId ? null : itemId)}
          />
        </div>
      ) : null}

      {detailTab === "ai" ? (
        <div className="px-4 mt-3 pb-8">
          <OutfitAiSuggestionDetail suggestion={aiSuggestion} allItems={allItems} onGenerate={handleGenerateAdvice} isLoading={isGeneratingAdvice} />
        </div>
      ) : null}

      {detailTab === "records" ? (
        <div className="px-4 mt-3 pb-8 space-y-3 rounded-lg border border-ink/8 bg-white p-3">
          <InfoRow label="穿着次数" value={`${(outfit.wornDates ?? []).length} 次`} />
          <InfoRow label="最近穿着" value={(outfit.wornDates ?? []).at(-1) ?? "暂无记录"} />
          <div>
            <p className="mb-2 text-xs font-medium text-ink/40">穿搭实图</p>
            {realImages.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto">
                {realImages.map((image) => (
                  <button key={image.id} type="button" onClick={() => onViewRealImage(image)} className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-milk-darker">
                    <OnlineAssetImage asset={image.image.asset} variant="thumbnail" alt={image.caption ?? "穿搭实图"} className="h-full w-full" imageClassName="object-cover" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink/40">还没有实图记录。</p>
            )}
          </div>
        </div>
      ) : null}
    </ItemDetailPageShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2 text-sm">
      <span className="text-xs text-ink/40">{label}</span>
      <span className="min-w-0 break-words text-ink/68">{value}</span>
    </div>
  );
}

function OutfitCompositionTab({
  outfit,
  items,
  allItems,
  suggestion,
  replacementItemId,
  onToggleReplacement,
}: {
  outfit: SavedOutfit;
  items: WardrobeItem[];
  allItems: WardrobeItem[];
  suggestion?: OutfitAiSuggestion;
  replacementItemId: number | null;
  onToggleReplacement: (itemId: number) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        if (typeof item.id !== "number") return null;
        const cached = getCachedReplacementSuggestionForItem(suggestion, item.id);
        const localCandidates = cached
          ? []
          : getReplacementCandidatesForOutfitItem({ originalItem: item, outfit, allItems, limit: 3 });
        const isOpen = replacementItemId === item.id;
        return (
          <article key={item.id} className="rounded-lg border border-ink/8 bg-white p-2.5">
            <div className="flex items-center gap-2">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-milk-darker/40">
                {item.mainImage ? (
                  <OnlineAssetImage asset={item.mainImage.asset} variant="thumbnail" alt={item.name} className="h-full w-full" />
                ) : (
                  <div className="grid h-full place-items-center text-ink/25"><Shirt size={16} /></div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.name}</p>
                <p className="truncate text-[11px] text-ink/42">{CATEGORY_LABELS[item.category]} · {labelOutfitStyleTags(item.styles).join(" / ") || "未标风格"}</p>
              </div>
              <button type="button" onClick={() => onToggleReplacement(item.id!)} className="h-8 shrink-0 rounded-md border border-ink/10 px-2 text-xs text-ink/65">
                替换建议
              </button>
            </div>
            {isOpen ? (
              <div className="mt-2 rounded-md bg-milk-darker/40 p-2">
                {cached ? (
                  <ReplacementLine
                    title="缓存建议"
                    itemIds={cached.suggestedItemIds}
                    allItems={allItems}
                    reason={cached.reason}
                  />
                ) : localCandidates.length > 0 ? (
                  <div className="grid gap-2">
                    {localCandidates.map((candidate) => (
                      <ReplacementLine
                        key={candidate.item.id}
                        title={candidate.item.name}
                        itemIds={typeof candidate.item.id === "number" ? [candidate.item.id] : []}
                        allItems={allItems}
                        reason={candidate.reasons.join("，")}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink/45">暂无合适替换候选。</p>
                )}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function OutfitAiSuggestionDetail({
  suggestion,
  allItems,
  onGenerate,
  isLoading,
}: {
  suggestion?: OutfitAiSuggestion;
  allItems: WardrobeItem[];
  onGenerate: () => void;
  isLoading: boolean;
}) {
  if (!suggestion) {
    return (
      <div className="rounded-lg border border-dashed border-ink/12 bg-white/70 p-5 text-center">
        <p className="text-sm font-medium text-ink/65">还没有套装建议</p>
        <p className="mt-1 text-xs text-ink/45">建议只会在你点击后生成。</p>
        <button type="button" onClick={onGenerate} disabled={isLoading} className="mt-3 h-9 rounded-lg bg-denim px-4 text-xs font-semibold text-white disabled:opacity-50">
          生成 AI 建议
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-ink/8 bg-white p-3">
      <SuggestionSection title="适合场景" items={suggestion.suitableScenes} />
      <SuggestionSection title="不太适合" items={suggestion.unsuitableScenes} />
      <SuggestionSection title="搭配优点" items={suggestion.strengths} />
      <SuggestionSection title="风险点" items={suggestion.risks} />
      <div>
        <p className="mb-2 text-xs font-semibold text-ink/45">可替换单品</p>
        {suggestion.replacementSuggestions.length > 0 ? (
          <div className="grid gap-2">
            {suggestion.replacementSuggestions.map((entry) => (
              <ReplacementLine
                key={`${entry.originalItemId}-${entry.suggestedItemIds.join("-")}`}
                title={`${findItemName(allItems, entry.originalItemId)} 可替换为`}
                itemIds={entry.suggestedItemIds}
                allItems={allItems}
                reason={entry.reason}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink/42">暂无替换建议。</p>
        )}
      </div>
      <SuggestionSection title="缺失单品" items={suggestion.missingItems} />
    </div>
  );
}

function SuggestionSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-ink/45">{title}</p>
      {items.length > 0 ? (
        <div className="grid gap-1 text-xs leading-relaxed text-ink/62">
          {items.map((item) => <p key={item}>· {item}</p>)}
        </div>
      ) : (
        <p className="text-xs text-ink/38">暂无。</p>
      )}
    </div>
  );
}

function ReplacementLine({
  title,
  itemIds,
  allItems,
  reason,
}: {
  title: string;
  itemIds: number[];
  allItems: WardrobeItem[];
  reason: string;
}) {
  const names = itemIds.map((id) => findItemName(allItems, id)).join("、");
  return (
    <div className="rounded-md bg-white px-2.5 py-2">
      <p className="text-xs font-semibold text-ink/68">{title}{names ? ` ${names}` : ""}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-ink/48">{reason}</p>
    </div>
  );
}

function findItemName(items: WardrobeItem[], itemId: number): string {
  return items.find((item) => item.id === itemId)?.name ?? `ID ${itemId}`;
}

// ─── Real Image View ───────────────────────────────────────────

function RealImageView({
  image,
  onBack,
  onDelete,
  onSaveCaption,
  onExpandImage,
}: {
  image: OutfitRealImage;
  onBack: () => void;
  onDelete: () => void;
  onSaveCaption: (caption: string) => void;
  onExpandImage: (image: { src: string; alt: string }) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(image.caption ?? "");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="p-1 -ml-1"><ChevronLeft size={20} /></button>
        <button type="button" ref={menuRef} onClick={() => setMenuOpen(!menuOpen)} className="p-1">
          <MoreHorizontal size={18} className="text-ink/50" />
        </button>
      </div>

      {menuOpen && (
        <div className="absolute right-4 z-50 mt-1 w-40 rounded-xl border border-ink/8 bg-white py-1 shadow-lg">
          <button type="button" onClick={() => { setMenuOpen(false); setEditingCaption(true); setCaptionDraft(image.caption ?? ""); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-milk-darker/40">
            <Pencil size={14} />编辑说明
          </button>
          <button type="button" onClick={() => { setMenuOpen(false); setDeleteConfirm(true); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-milk-darker/40">
            <Trash2 size={14} />删除实图
          </button>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmActionSheet open={deleteConfirm} title="删除这张穿搭实图？" description="删除后不会影响套装内的衣物，也不会删除套装。" confirmLabel="删除" tone="danger" onConfirm={onDelete} onClose={() => setDeleteConfirm(false)} />

      {/* Caption edit */}
      {editingCaption && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/30" onClick={() => setEditingCaption(false)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium">编辑说明</p>
            <input
              type="text"
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
              className="mt-2 w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => setEditingCaption(false)} className="flex-1 rounded-full border border-ink/10 py-2 text-sm">取消</button>
              <button type="button" onClick={() => { onSaveCaption(captionDraft); setEditingCaption(false); }} className="flex-1 rounded-full bg-denim py-2 text-sm font-medium text-white">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Large image */}
      <OnlineAssetImage asset={image.image.asset} variant="original" alt={image.caption ?? "穿搭实图"} className="max-h-[60vh] w-full rounded-xl" onOpen={(url) => onExpandImage({ src: url, alt: image.caption ?? "穿搭实图" })} />

      {image.caption && <p className="text-sm text-ink/70">{image.caption}</p>}
      {image.takenAt && <p className="text-xs text-ink/40">{image.takenAt}</p>}
    </div>
  );
}

// ─── Outfit Info Form (create/edit) ────────────────────────────

function OutfitInfoForm({
 isEdit,
 name, setName,
 seasons, setSeasons,
 scenes, setScenes,
 styles, setStyles,
 pairingTags, setPairingTags,
 customTag, setCustomTag,
 minC, setMinC,
 maxC, setMaxC,
 notes, setNotes,
 selectedIds, setSelectedIds,
 items,
 onRegenerateInfo,
 isRegeneratingInfo,
 regenerateInfoHint,
 onBack,
 onSave,
 onCancel,
}: {
 isEdit: boolean;
 name: string; setName: (v: string) => void;
 seasons: Season[]; setSeasons: (v: Season[]) => void;
 scenes: string[]; setScenes: (v: string[]) => void;
 styles: string[]; setStyles: (v: string[]) => void;
 pairingTags: string[]; setPairingTags: (v: string[]) => void;
 customTag: string; setCustomTag: (v: string) => void;
 minC: string; setMinC: (v: string) => void;
 maxC: string; setMaxC: (v: string) => void;
 notes: string; setNotes: (v: string) => void;
 selectedIds: number[];
 setSelectedIds: (v: number[]) => void;
 items: WardrobeItem[];
 /** v1.0: 仅在 edit 时调用; 只回填表单,不直接保存 */
 onRegenerateInfo?: () => Promise<void> | void;
 isRegeneratingInfo?: boolean;
 regenerateInfoHint?: string;
 onBack: () => void;
 onSave: () => void;
 onCancel: () => void;
}) {
 const toggleArr = <T,>(arr: T[], val: T): T[] => arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

 const selectedItems = items.filter((i) => i.id && selectedIds.includes(i.id));

 return (
 <div className="space-y-5">
 <div className="flex items-center gap-3">
 <button type="button" onClick={onBack} className="p-1 -ml-1"><ChevronLeft size={20} /></button>
 <h3 className="text-base font-semibold">{isEdit ? "编辑套装信息" : "创建搭配"}</h3>
 </div>

 {/* v1.0: 重新使用 AI 生成信息按钮 (仅 edit) */}
 {isEdit && onRegenerateInfo ? (
 <div className="rounded-2xl border border-denim/12 bg-denim/5 p-3">
 <button
 type="button"
 onClick={() => { void onRegenerateInfo(); }}
 disabled={isRegeneratingInfo}
 className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-denim px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
 >
 {isRegeneratingInfo ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
 {isRegeneratingInfo ? "正在生成…" : "重新使用 AI 生成信息"}
 </button>
 <p className="mt-2 text-xs leading-relaxed text-ink/55">
 会根据当前组成重新生成名称、场景、风格、温度和备注;生成后可继续手动修改,点击保存后才会写入。
 </p>
 {regenerateInfoHint ? <p className="mt-2 text-xs text-denim">{regenerateInfoHint}</p> : null}
 </div>
 ) : null}

      {/* Cover preview */}
      <div className="mx-auto w-full max-w-[240px] overflow-hidden rounded-xl border border-ink/8">
        <div className="aspect-square">
          {selectedItems.length > 0 ? (
            <CollagePreview items={selectedItems} />
          ) : (
            <div className="grid h-full place-items-center text-ink/25"><Shirt size={40} /></div>
          )}
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="text-xs font-medium text-ink/50">套装名称</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：蓝白通勤套装" className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm" />
      </div>

      {/* Seasons (v1.0: 重命名为"适合季节" + 增加"四季") */}
      <div>
        <label className="text-xs font-medium text-ink/50">适合季节</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {(["spring", "summer", "autumn", "winter", "all"] as Season[]).map((s) => (
            <button key={s} type="button" onClick={() => setSeasons(toggleArr(seasons, s))}
              className={`rounded-full px-3 py-1 text-sm ${seasons.includes(s) ? "bg-denim/10 text-denim border border-denim/30" : "border border-ink/10 bg-white text-ink/50"}`}>
              {SEASON_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Scenes */}
      <div>
        <label className="text-xs font-medium text-ink/50">场景</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {SCENE_OPTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setScenes(toggleArr(scenes, s))}
              className={`rounded-full px-3 py-1 text-sm ${scenes.includes(s) ? "bg-denim/10 text-denim border border-denim/30" : "border border-ink/10 bg-white text-ink/50"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Temperature */}
      <div>
        <label className="text-xs font-medium text-ink/50">适穿温度</label>
        <div className="mt-1 flex items-center gap-2">
          <input type="number" value={minC} onChange={(e) => setMinC(e.target.value)} placeholder="最低℃" className="w-20 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm" />
          <span className="text-xs text-ink/30">到</span>
          <input type="number" value={maxC} onChange={(e) => setMaxC(e.target.value)} placeholder="最高℃" className="w-20 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm" />
        </div>
      </div>

      {/* Styles */}
      <div>
        <label className="text-xs font-medium text-ink/50">风格</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {STYLE_OPTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setStyles(toggleArr(styles, s))}
              className={`rounded-full px-3 py-1 text-sm ${styles.includes(s) ? "bg-denim/10 text-denim border border-denim/30" : "border border-ink/10 bg-white text-ink/50"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Pairing tags */}
      <div>
        <label className="text-xs font-medium text-ink/50">搭配标签</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {PAIRING_TAG_OPTIONS.map((t) => (
            <button key={t} type="button" onClick={() => setPairingTags(toggleArr(pairingTags, t))}
              className={`rounded-full px-3 py-1 text-sm ${pairingTags.includes(t) ? "bg-denim/10 text-denim border border-denim/30" : "border border-ink/10 bg-white text-ink/50"}`}>
              {t}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input type="text" value={customTag} onChange={(e) => setCustomTag(e.target.value)} placeholder="自定义" className="w-16 rounded-full border border-ink/10 bg-white px-3 py-1 text-sm" />
            {customTag.trim() && (
              <button type="button" onClick={() => { setPairingTags([...pairingTags, customTag.trim()]); setCustomTag(""); }}
                className="rounded-full bg-denim/10 p-1 text-denim">
                <Plus size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-medium text-ink/50">备注</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="适合办公室、城市步行……" rows={3} className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm resize-none" />
      </div>

      {/* Items in outfit */}
      {isEdit && (
        <div>
          <label className="text-xs font-medium text-ink/50">套装内单品</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {selectedItems.map((item) => (
              <span key={item.id} className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3 py-1 text-sm">
                {item.name}
                <button type="button" onClick={() => setSelectedIds(selectedIds.filter((id) => id !== item.id))}><X size={12} /></button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="flex gap-3 pt-4">
        <button type="button" onClick={onCancel} className="flex-1 rounded-full border border-ink/10 py-2.5 text-sm">取消</button>
        <button type="button" onClick={onSave} className="flex-[2] rounded-full bg-denim py-2.5 text-sm font-medium text-white">保存套装</button>
      </div>
    </div>
  );
}

// ─── Collage Preview ───────────────────────────────────────────

function CollagePreview({ items }: { items: WardrobeItem[] }) {
  const assets = items.slice(0, 4).flatMap((item) => item.mainImage ? [item.mainImage.asset] : []);

  if (assets.length === 0) return <div className="grid h-full place-items-center text-ink/25"><Shirt size={40} /></div>;
  if (assets.length === 1) return <OnlineAssetImage asset={assets[0]} variant="thumbnail" alt="" className="h-full w-full p-2" />;

  if (assets.length === 2) {
    return (
      <div className="grid h-full w-full grid-cols-2">
        {assets.map((asset, i) => (
          <OnlineAssetImage key={asset.assetId} asset={asset} variant="thumbnail" alt="" className="h-full w-full" imageClassName="object-cover" />
        ))}
      </div>
    );
  }

  if (assets.length === 3) {
    return (
      <div className="grid h-full w-full grid-rows-2">
        <OnlineAssetImage asset={assets[0]} variant="thumbnail" alt="" className="h-full w-full border-b border-white/50" imageClassName="object-cover" />
        <div className="grid grid-cols-2">
          {assets.slice(1).map((asset, i) => (
            <OnlineAssetImage key={asset.assetId} asset={asset} variant="thumbnail" alt="" className={`h-full w-full ${i === 0 ? "border-r border-white/50" : ""}`} imageClassName="object-cover" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2">
      {assets.map((asset, i) => (
        <OnlineAssetImage key={asset.assetId} asset={asset} variant="thumbnail" alt="" className={`h-full w-full ${i === 0 ? "border-b border-r border-white/50" : i === 1 ? "border-b border-white/50" : i === 2 ? "border-r border-white/50" : ""}`} imageClassName="object-cover" />
      ))}
    </div>
  );
}

// ───v1.0: 风格标签中文化 helpers ────────────────────────────────────────

import { STYLE_LABELS as STYLE_LABELS_TABLE, type GarmentStyle } from "@/lib/types";

/** 把单个 tag 映射成中文标签;非枚举值原样返回。 */
function labelOutfitStyleTag(tag: string): string {
 const value = tag?.trim();
 if (!value) return "";
 return STYLE_LABELS_TABLE[value as GarmentStyle] ?? value;
}

/** 把整组 tags 映射成中文标签, 去重 + 去空。 */
function labelOutfitStyleTags(tags: string[] | undefined): string[] {
 if (!tags) return [];
 return Array.from(new Set(tags.map(labelOutfitStyleTag).filter(Boolean)));
}
