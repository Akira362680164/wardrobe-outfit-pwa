"use client";

import {
  Camera,
  Check,
  ChevronLeft,
  ImageIcon,
  Layers,
  MoreHorizontal,
  Pencil,
  Settings,
  Plus,
  RefreshCw,
  Search,
  Shirt,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ClosetLocation, GarmentCategory, LocalOutfitRealImageDraft, OutfitAiSuggestion, OutfitCalendarPlan, OutfitCalendarPlanDraft, OutfitCalendarPlanType, OutfitPlanEntry, OutfitRealImage, PlanPackingChecklistItem, SavedOutfit, Season, WardrobeItem } from "@/lib/types";
import { CATEGORY_LABELS, SEASON_LABELS } from "@/lib/types";
import { buildOutfitCoverRefreshPatch, getOutfitCover, countValidItems } from "@/lib/outfit-cover";
import { getWearSummary, hasWornDate } from "@/lib/wear-records";
import { useLocalDateKey } from "@/lib/use-local-date-key";
import { addOutfitToDate, recordActualOutfitWear, cancelActualOutfitWearForDate, formatOutfitWearSyncError } from "@/lib/outfit-wear-sync";
import { wardrobeRepository } from "@/lib/repository/wardrobe-repository";
import { rethrowIfFailed, upsertOutfit, upsertTripPlan, repoUpdateOutfit, repoUpdateOutfitPlanEntry, repoSetOutfitPlanPrimary, repoDeleteOutfitPlanEntry, repoDeleteTripPlan, repoUpdatePackingChecklist } from "@/lib/repository/wardrobe-repository";
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
  DetailTabContent,
  DetailTabs,
  DetailTitleMetaBlock,
  DetailTopBar,
  getDetailSlideLabel,
} from "@/components/detail-shell";
import { OutfitIntakeFlow } from "@/components/outfit-intake-flow";
import { fileToCompressedDataUrl, IMAGE_FILE_ACCEPT } from "@/lib/image";
import { buildLocalOutfitAiSuggestion, getCachedReplacementSuggestionForItem, getReplacementCandidatesForOutfitItem } from "@/lib/outfit-ai-suggestion";
import { hasDeviceMiniMaxKey, loadMiniMaxSettings } from "@/lib/device-minimax";
import { generateOutfitAiSuggestionOnServer } from "@/lib/online/online-ai-enhancement-client";
import { generateOutfitMetadataOnServer } from "@/lib/online/online-ai-intake-client";
import { buildLocalOutfitMetadataFromItems } from "@/lib/outfit-ai-metadata";
import { outfitDraftToSavedOutfit } from "@/lib/intake-save-adapters";
import type { OutfitIntakeDraft } from "@/lib/intake-draft";
import { useStableBackHandler } from "@/lib/use-stable-back-handler";
import type { AppRoute } from "@/lib/app-route";
import { normalizeTemperatureRange } from "@/lib/temperature-range";

const SCENE_OPTIONS = ["通勤", "休闲", "旅行", "约会", "户外", "正式", "居家"];
const STYLE_OPTIONS = ["简约", "休闲", "甜美", "优雅", "轻熟", "运动", "街头"];
const PAIRING_TAG_OPTIONS = ["显高", "显瘦", "轻通勤", "学院风", "复古", "清爽"];

type SubPage = "library" | "detail" | "create_flow" | "create_select" | "create_info" | "edit" | "edit_composition" | "real_image_add" | "real_image_view" | "planning_calendar" | "plan_add" | "plan_edit" | "plan_detail" | "packing_list";
type CompositionEditReturnTo = "detail" | "edit";
type OutfitDetailTab = "info" | "items" | "ai" | "records";

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
  const [compositionEditReturnTo, setCompositionEditReturnTo] = useState<CompositionEditReturnTo>("edit");
  const [compositionEditDirty, setCompositionEditDirty] = useState(false);
  const [compositionBackConfirmOpen, setCompositionBackConfirmOpen] = useState(false);
  const [detailTabAfterEdit, setDetailTabAfterEdit] = useState<OutfitDetailTab>("info");

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
  const pendingPlanMutationIdsRef = useRef(new Map<string, string>());

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
    if (subPage === "edit_composition") {
      if (compositionEditDirty) { setCompositionBackConfirmOpen(true); return true; }
      setSubPage(compositionEditReturnTo);
      return true;
    }
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
	  const [selectOutfitMode, setSelectOutfitMode] = useState<"primary" | "change" | "backup">("primary");
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

 // v1.0: 创建流程的 AI增强回调 — 与套装详情 AI 建议独立
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
 const generated = await generateOutfitMetadataOnServer(
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
 const generated = await generateOutfitMetadataOnServer(
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
 setDetailTabAfterEdit("info");
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

  function startCompositionEdit(returnTo: CompositionEditReturnTo) {
    const source = returnTo === "detail" ? viewingOutfit : editingOutfit;
    if (!source) return;
    setEditingOutfitId(source.id);
    setCreateSelectedIds([...source.itemIds]);
    setCompositionEditReturnTo(returnTo);
    setCompositionEditDirty(false);
    if (returnTo === "detail") setDetailTabAfterEdit("items");
    setSubPage("edit_composition");
  }

  async function handleSaveCompositionQuick(selectedIds: number[]): Promise<boolean> {
    if (!viewingOutfit || writingOutfitId === viewingOutfit.id) return false;
    if (selectedIds.length < 2) {
      onMessage("套装至少需要 2 件衣物", "info");
      return false;
    }
    const now = new Date().toISOString();
    const selectedItems = items.filter((item) => item.id != null && selectedIds.includes(item.id));
    setWritingOutfitId(viewingOutfit.id);
    try {
      const result = await wardrobeRepository.updateOutfit(viewingOutfit, {
        itemIds: selectedIds,
        ...buildOutfitCoverRefreshPatch(selectedIds, selectedItems),
        aiSuggestion: undefined,
        updatedAt: now,
      });
      if (!result.ok) {
        if (result.code === "conflict") {
          await onRefresh();
          setShowRevisionConflict(true);
        } else {
          onMessage(result.error ?? "保存套装组成失败，请重试", "error");
        }
        return false;
      }
      await onRefresh();
      setCreateSelectedIds(selectedIds);
      setCompositionEditDirty(false);
      setEditingOutfitId(null);
      setDetailTabAfterEdit("items");
      setSubPage("detail");
      onMessage("套装组成已更新，原 AI 建议已清除");
      return true;
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "保存套装组成失败，请重试", "error");
      return false;
    } finally {
      setWritingOutfitId(null);
    }
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
		      const plan = outfitCalendarPlans.find((candidate) => candidate.id === planId);
		      if (!plan) throw new Error("旅行计划不存在，请刷新后重试");
		      rethrowIfFailed(await repoDeleteTripPlan(plan), "删除旅行计划失败");
		      await onPlanDataChange();
          setActiveCalendarPlanId(null);
          setSubPage("planning_calendar");
		      onMessage("已删除旅行计划");
		    } catch (error) {
		      onMessage(error instanceof Error ? error.message : "操作失败，请重试", "error");
		      throw error;
		    }
		  }

  async function handleDeletePlanEntry(entry: OutfitPlanEntry) {
    try {
      // P0-04 fix: worn entries must go through cancel wear, not plain delete
      if (entry.status === "worn") {
        const outfitId = entry.outfitId ?? entry.actualOutfitId;
        if (outfitId) {
          await handleCancelOutfitWearForDate(entry.date, outfitId);
          return;
        }
      }
      rethrowIfFailed(await repoDeleteOutfitPlanEntry(entry), "删除当天穿搭失败");
      try {
        await syncPackingChecklistForDate(entry.date, entry.id);
      } catch (error) {
        await onPlanDataChange();
        onMessage(error instanceof Error ? `穿搭已删除，但${error.message}` : "穿搭已删除，但打包清单同步失败，请重试", "error");
        return;
      }
      await onPlanDataChange();
      onMessage("已删除当天穿搭");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "删除失败，请重试", "error");
      throw error;
    }
  }

	  async function handleTogglePackingItemChecked(itemId: string, checked: boolean) {
      if (!activeCalendarPlanId) throw new Error("旅行计划不存在，请刷新后重试");
      const plan = outfitCalendarPlans.find((candidate) => candidate.id === activeCalendarPlanId);
      if (!plan) throw new Error("旅行计划不存在，请刷新后重试");
      const now = new Date().toISOString();
      const updatedItems = planPackingChecklistItems
        .filter((item) => item.calendarPlanId === activeCalendarPlanId)
        .map((item) => item.id === itemId ? { ...item, checked, updatedAt: now } : item);
      rethrowIfFailed(await repoUpdatePackingChecklist(plan, updatedItems), "更新打包清单失败");
      await onPlanDataChange();
	  }

	  async function handleSaveManualPackingItem(input: { label: string; category?: string; quantity?: number }) {
	    if (!activeCalendarPlanId) throw new Error("旅行计划不存在，请刷新后重试");
	      const plan = outfitCalendarPlans.find((p) => p.id === activeCalendarPlanId);
	      if (!plan) throw new Error("旅行计划不存在，请刷新后重试");
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
	        const currentItems = planPackingChecklistItems.filter((item) => item.calendarPlanId === activeCalendarPlanId);
	        rethrowIfFailed(await repoUpdatePackingChecklist(plan, [...currentItems, newItem]), "更新打包清单失败");
	      await onPlanDataChange();
	  }

	  async function handleMarkAllPacked() {
	    if (!activeCalendarPlanId) throw new Error("旅行计划不存在，请刷新后重试");
	      const plan = outfitCalendarPlans.find((p) => p.id === activeCalendarPlanId);
	      if (!plan) throw new Error("旅行计划不存在，请刷新后重试");
	        const now = new Date().toISOString();
	        const updatedItems = planPackingChecklistItems
	          .filter((item) => item.calendarPlanId === activeCalendarPlanId)
	          .map((item) => ({ ...item, checked: true, updatedAt: now }));
	        rethrowIfFailed(await repoUpdatePackingChecklist(plan, updatedItems), "更新打包清单失败");
	      await onPlanDataChange();
	  }

	  async function handleResetAllPacking() {
	    if (!activeCalendarPlanId) throw new Error("旅行计划不存在，请刷新后重试");
	      const plan = outfitCalendarPlans.find((p) => p.id === activeCalendarPlanId);
	      if (!plan) throw new Error("旅行计划不存在，请刷新后重试");
	        const now = new Date().toISOString();
	        const updatedItems = planPackingChecklistItems
	          .filter((item) => item.calendarPlanId === activeCalendarPlanId)
	          .map((item) => ({ ...item, checked: false, updatedAt: now }));
	        rethrowIfFailed(await repoUpdatePackingChecklist(plan, updatedItems), "更新打包清单失败");
	      await onPlanDataChange();
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
	      const key = `skip:${entry.id}`;
	      const clientMutationId = pendingPlanMutationIdsRef.current.get(key) ?? crypto.randomUUID();
	      pendingPlanMutationIdsRef.current.set(key, clientMutationId);
	      rethrowIfFailed(await repoUpdateOutfitPlanEntry(entry, { status: "skipped", updatedAt: now }, { clientMutationId }), "保存计划失败");
	      pendingPlanMutationIdsRef.current.delete(key);
	      await onPlanDataChange();
	      onMessage("已标记为未穿");
	    } catch (error) {
	      onMessage(error instanceof Error ? error.message : "操作失败，请重试", "error");
	    }
	  }

	  async function handleSetPrimaryEntry(entry: OutfitPlanEntry) {
	    try {
	      const key = `primary:${entry.id}`;
	      const clientMutationId = pendingPlanMutationIdsRef.current.get(key) ?? crypto.randomUUID();
	      pendingPlanMutationIdsRef.current.set(key, clientMutationId);
	      rethrowIfFailed(await repoSetOutfitPlanPrimary(entry, { clientMutationId }), "设置当天主展示失败");
	      pendingPlanMutationIdsRef.current.delete(key);
	      await onPlanDataChange();
	      onMessage("已设为当天主展示");
	    } catch (error) {
	      onMessage(error instanceof Error ? error.message : "操作失败，请重试", "error");
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
	    const primary = outfitPlanEntries.find((entry) => entry.date === dateKey && entry.status === "planned" && entry.isPrimary);
	    const hasResolvablePrimary = Boolean(primary && outfits.some((outfit) => outfit.id === primary.outfitId));
	    setSelectOutfitMode(hasResolvablePrimary ? "backup" : "primary");
	    setShowPlanSelectSheet(true);
	  }

	  function openChangeOutfitSelect(dateKey: string) {
	    setSelectOutfitDate(dateKey);
	    setSelectOutfitMode("change");
	    setShowPlanSelectSheet(true);
	  }

	  async function handleSelectOutfitForPlan(outfit: SavedOutfit) {
	    if (selectOutfitDate) {
	      const opts = selectOutfitMode === "backup" ? { role: "backup" as const } : { makePrimary: true };
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
    setDetailTabAfterEdit("info");
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
      await onPlanDataChange();
    } catch {
      onMessage("打包清单同步失败，请重试", "error");
    }
    setSubPage("plan_detail");
  }

  // v1.1.4-dev 打包清单自动同步 (单一 plan)
  async function syncPackingChecklistForPlan(planId: string, excludedEntryId?: string): Promise<void> {
    const plan = outfitCalendarPlans.find((p) => p.id === planId);
    if (!plan) return;
    const allEntries = excludedEntryId
      ? outfitPlanEntries.filter((entry) => entry.id !== excludedEntryId)
      : outfitPlanEntries;
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
    rethrowIfFailed(await repoUpdatePackingChecklist(plan, newItems), "同步打包清单失败");
  }

  // v1.1.4-dev 打包清单自动同步 (按日期 → 同步所有覆盖该日期的 plan)
  async function syncPackingChecklistForDate(dateKey: string, excludedEntryId?: string): Promise<void> {
    const matchedPlans = outfitCalendarPlans.filter(
      (p) => dateKey >= p.startDate && dateKey <= p.endDate,
    );
    for (const plan of matchedPlans) {
      await syncPackingChecklistForPlan(plan.id, excludedEntryId);
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
    <div className="w-full min-w-0 max-w-full overflow-x-hidden space-y-4">
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
                data-parity-id="parity.app.app.src.components.outfit.list.view.5f851a498b" onClick={openPlanningCalendarFromLibrary}
                className="inline-flex h-10 min-w-[64px] items-center justify-center rounded-full border border-denim/20 bg-white px-3 text-sm font-semibold text-denim shadow-sm active:scale-95"
                aria-label="打开穿搭月历"
              >
                月历
              </button>
              <button
                type="button"
                data-parity-id="parity.app.app.src.components.outfit.list.view.5546e4b500" onClick={openTravelPlanSheetFromLibrary}
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
                data-parity-id={`parity.app.app.src.components.outfit.list.view.d3c37fd77b.${chip.key}`}
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
          initialTab={detailTabAfterEdit}
          onBack={closeOutfitDetail}
          onEdit={startEdit}
          onEditComposition={() => startCompositionEdit("detail")}
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
            <button type="button" data-parity-id="parity.app.app.src.components.outfit.list.view.d5844f6dd1" onClick={() => setSubPage("detail")} className="p-1 -ml-1"><ChevronLeft size={20} /></button>
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
                data-parity-id="parity.app.app.src.components.outfit.list.view.5d3f29e2cd" onClick={() => realImageInputRef.current?.click()}
                className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white p-4 text-sm"
              >
                <ImageIcon size={20} className="text-ink/40" />
                <span>从相册选择</span>
              </button>
              <button
                type="button"
                data-parity-id="parity.app.app.src.components.outfit.list.view.574b2d8b9e" onClick={() => realImageCameraRef.current?.click()}
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
            data-parity-id="parity.app.app.src.components.outfit.list.view.f17df68943" onChange={handleRealImageFileSelected}
          />
          <input
            ref={realImageCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            data-parity-id="parity.app.app.src.components.outfit.list.view.ab56cf440f" onChange={handleRealImageFileSelected}
          />

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-ink/50">拍摄日期</label>
              <input
                type="date"
                value={realImageTakenAt}
                data-parity-id="parity.app.app.src.components.outfit.list.view.c5837ddcfb" onChange={(e) => setRealImageTakenAt(e.target.value)}
                className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink/50">说明</label>
              <input
                type="text"
                value={realImageCaption}
                data-parity-id="parity.app.app.src.components.outfit.list.view.e75930158f" onChange={(e) => setRealImageCaption(e.target.value)}
                placeholder="例如：上海出差通勤穿搭"
                className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <p className="text-xs text-ink/30">这张照片会保存到当前套装，用于回看真实穿搭效果。</p>

          <div className="flex gap-3 pt-2">
            <button type="button" data-parity-id="parity.app.app.src.components.outfit.list.view.4abd97f970" onClick={() => setSubPage("detail")} className="flex-1 rounded-full border border-ink/10 py-2.5 text-sm">取消</button>
            <button
              type="button"
              data-parity-id="parity.app.app.src.components.outfit.list.view.46cea66824" onClick={handleSaveRealImage}
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
          onEditComposition={() => startCompositionEdit("edit")}
          onRegenerateInfo={handleRegenerateEditInfo}
          isRegeneratingInfo={isRegeneratingInfo}
          regenerateInfoHint={regenerateInfoHint}
          onBack={() => setSubPage("detail")}
          onSave={handleSaveEdit}
          onCancel={() => { setSubPage("detail"); setEditingOutfitId(null); }}
        />
      )}

      {subPage === "edit_composition" && editingOutfit && (
        <OutfitCompositionEditor
          title="编辑套装组成"
          items={items}
          locations={locations}
          initialSelectedIds={createSelectedIds}
          confirmLabel={compositionEditReturnTo === "detail" ? "保存组成" : "完成选择"}
          isSaving={compositionEditReturnTo === "detail" && writingOutfitId === editingOutfit.id}
          onBack={() => setSubPage(compositionEditReturnTo)}
          onDirtyChange={setCompositionEditDirty}
          onConfirm={async (selectedIds) => {
            setCreateSelectedIds(selectedIds);
            if (compositionEditReturnTo === "detail") return handleSaveCompositionQuick(selectedIds);
            setCompositionEditDirty(false);
            setSubPage("edit");
            return true;
          }}
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
	          onCancelWear={handleCancelOutfitWearForDate}
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
	            setSelectOutfitMode("change");
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
	      <MotionSheet open={addPlanSheetOpen} onClose={() => setAddPlanSheetOpen(false)} variant="action" ariaLabel="添加穿搭计划">
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
	                data-parity-id={`parity.app.app.src.components.outfit.list.view.d61cac655d.${opt.type}`}
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
      <ConfirmActionSheet
        open={compositionBackConfirmOpen}
        title="放弃本次组成修改？"
        description="当前选择还没有保存，返回后会丢失本次调整。"
        confirmLabel="放弃修改"
        cancelLabel="继续编辑"
        tone="danger"
        onConfirm={() => { setCompositionBackConfirmOpen(false); setCompositionEditDirty(false); setSubPage(compositionEditReturnTo); }}
        onClose={() => setCompositionBackConfirmOpen(false)}
      />
    </div>
  );
}

// ─── Outfit Detail View ────────────────────────────────────────

function OutfitDetailView({
 outfit,
 items,
 allItems,
 initialTab,
 onBack,
 onEdit,
 onEditComposition,
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
 initialTab?: OutfitDetailTab;
 onBack: () => void;
 onEdit: () => void;
 onEditComposition: () => void;
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
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<OutfitDetailTab>(initialTab ?? "info");
  const [isGeneratingAdvice, setIsGeneratingAdvice] = useState(false);
  const [adviceError, setAdviceError] = useState("");
  const [pendingAiSuggestion, setPendingAiSuggestion] = useState<OutfitAiSuggestion | undefined>();
  const pendingAiMutationIdRef = useRef<string | null>(null);
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
  useEffect(() => {
    setDetailTab(initialTab ?? "info");
    setActiveSlide(0);
  }, [initialTab, outfit.id]);
 const activeSlideData = allSlides[activeSlide];
 const sceneLabels = (outfit.sceneTags ?? []).join(" · ");
 // v1.0: 风格标签展示层中文化 (labelOutfitStyleTags 处理可能存在的英文枚举)
 const styleLabels = [...labelOutfitStyleTags(outfit.styleTags ?? []), ...(outfit.pairingTags ?? [])].join(" · ");
  const seasonLabels = outfit.seasons?.map((s) => SEASON_LABELS[s]).join(" / ") || "";
  const tempLabel = <TemperatureRangeBar value={outfit.temperatureRange} size="sm" />;
  const aiSuggestion = pendingAiSuggestion ?? outfit.aiSuggestion;
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
    if (deleteSubmitting) return;
    setMenuOpen(false);
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await onDeleteOutfit();
      setDeleteConfirm(false);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "删除失败，请重试");
      // 父层负责 toast；失败时保留详情页和确认弹窗。
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function saveAiSuggestion(nextSuggestion: OutfitAiSuggestion) {
    const now = new Date().toISOString();
    const clientMutationId = pendingAiMutationIdRef.current ?? crypto.randomUUID();
    pendingAiMutationIdRef.current = clientMutationId;
    rethrowIfFailed(await repoUpdateOutfit(outfit, { aiSuggestion: nextSuggestion, updatedAt: now }, { clientMutationId }), "保存套装建议失败");
    pendingAiMutationIdRef.current = null;
    setPendingAiSuggestion(undefined);
    await onRefresh();
  }

  async function handleGenerateAdvice() {
    if (isGeneratingAdvice) return;
    setIsGeneratingAdvice(true);
    setAdviceError("");
    if (pendingAiSuggestion) {
      try {
        await saveAiSuggestion(pendingAiSuggestion);
        setDetailTab("ai");
        onMessage("套装 AI 建议已保存");
      } catch (error) {
        setAdviceError(error instanceof Error ? error.message : "保存套装建议失败，请重试");
        onMessage(error instanceof Error ? error.message : "保存套装建议失败，请重试", "error");
      } finally {
        setIsGeneratingAdvice(false);
      }
      return;
    }

    let nextSuggestion: OutfitAiSuggestion;
    let usedLocalFallback = false;
    try {
      const settings = loadMiniMaxSettings();
      if (!hasDeviceMiniMaxKey(settings)) {
        nextSuggestion = buildLocalOutfitAiSuggestion({ outfit, outfitItems: items, allItems });
        usedLocalFallback = true;
      } else {
        nextSuggestion = await generateOutfitAiSuggestionOnServer(outfit, { outfitItems: items, allItems }, settings);
      }
    } catch (error) {
      nextSuggestion = buildLocalOutfitAiSuggestion({ outfit, outfitItems: items, allItems });
      usedLocalFallback = true;
      setAdviceError(`${error instanceof Error ? error.message : "套装 AI 建议生成失败"}，已切换本地规则建议`);
    }

    try {
      await saveAiSuggestion(nextSuggestion);
      setDetailTab("ai");
      onMessage(usedLocalFallback ? "已保存本地规则建议" : "套装 AI 建议已生成");
    } catch (error) {
      setPendingAiSuggestion(nextSuggestion);
      setAdviceError(error instanceof Error ? error.message : "保存套装建议失败，请重试");
      onMessage(error instanceof Error ? error.message : "保存套装建议失败，请重试", "error");
    } finally {
      setIsGeneratingAdvice(false);
    }
  }

  return (
    <ItemDetailPageShell
      contentClassName="mx-auto w-full max-w-4xl pb-[calc(env(safe-area-inset-bottom)+24px)]"
      topBar={<DetailTopBar title="" onBack={onBack} onMore={() => setMenuOpen(!menuOpen)} moreButtonRef={menuAnchorRef} />}
      hero={<DetailHeroGallery slides={gallerySlides} currentIndex={Math.min(activeSlide, Math.max(gallerySlides.length - 1, 0))} onIndexChange={setActiveSlide} onExpandImage={onExpandImage} bottomRightAction={<button type="button" data-parity-id="parity.app.app.src.components.outfit.list.view.1f793c0f2c" onClick={(event) => { event.stopPropagation(); onMarkWorn(); }} className="inline-flex h-9 items-center gap-1 ui-control-radius bg-white/75 border border-white/60 px-3 text-xs font-semibold text-ink/80 backdrop-blur-xl">{wearSummary.hasToday ? "✓ 今天已穿" : "标记今天穿了"}</button>} emptyIcon={<Shirt size={48} />} emptyText="暂无套装封面" />}
      filmstrip={<DetailFilmstrip items={filmstripItems} activeId={activeFilmstripId} onSelect={(id) => { const index = allSlides.findIndex((slide) => slide.kind === "cover" ? id === "cover" : slide.kind === "real" && slide.image.id === id); if (index >= 0) setActiveSlide(index); }} addLabel="套装示意" onAdd={onAddRealImage} />}
      titleBlock={<DetailTitleMetaBlock eyebrow={wearSummary.label} title={outfit.name} metaParts={[`${items.length}件`, seasonLabels, sceneLabels, styleLabels]} />}
      tabs={<DetailTabs tabs={[{ key: "info", label: "信息" }, { key: "items", label: "组成" }, { key: "ai", label: "AI建议" }, { key: "records", label: "记录" }]} activeTab={detailTab} data-parity-id="parity.app.app.src.components.outfit.list.view.0b5d63af92" onChange={setDetailTab} />}
      overlays={<>
        <MotionPopoverMenu visible={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuAnchorRef as React.RefObject<HTMLElement | null>}>
          <div className="min-w-[160px] p-1">
            <button type="button" data-parity-id="parity.app.app.src.components.outfit.list.view.c88032f82d" onClick={() => { setMenuOpen(false); onEdit(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-ink/80 hover:bg-mist"><Settings size={14} />编辑套装</button>
            <button type="button" data-parity-id="parity.app.app.src.components.outfit.list.view.916620b4a2" onClick={() => { setMenuOpen(false); onToggleFavorite(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-ink/80 hover:bg-mist"><Sparkles size={14} />{outfit.favorite ? "取消收藏" : "收藏套装"}</button>
            <button type="button" data-parity-id="parity.app.app.src.components.outfit.list.view.db73d8b142" onClick={() => { setMenuOpen(false); setDeleteConfirm(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"><Trash2 size={14} />删除套装</button>
          </div>
        </MotionPopoverMenu>
        <ConfirmActionSheet
          open={deleteConfirm}
          title={`删除「${outfit.name}」？`}
          description="删除后不会影响套装内的衣物，套装实图也会一并删除。"
          confirmLabel="删除"
          tone="danger"
          submitting={deleteSubmitting}
          error={deleteError}
          onConfirm={handleDeleteOutfit}
          onClose={() => {
            setDeleteConfirm(false);
            setDeleteError(null);
          }}
        />
      </>}
    >

      <DetailTabContent activeKey={detailTab}>
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
              onEditComposition={onEditComposition}
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
                    <button key={image.id} type="button" data-parity-id={`parity.app.app.src.components.outfit.list.view.70ee9ec3bb.${image.id}`} onClick={() => onViewRealImage(image)} className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-milk-darker">
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
      </DetailTabContent>
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
  onEditComposition,
  suggestion,
  replacementItemId,
  onToggleReplacement,
}: {
  outfit: SavedOutfit;
  items: WardrobeItem[];
  allItems: WardrobeItem[];
  onEditComposition: () => void;
  suggestion?: OutfitAiSuggestion;
  replacementItemId: number | null;
  onToggleReplacement: (itemId: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">套装组成</p>
          <p className="mt-0.5 text-xs text-ink/45">当前共 {items.length} 件衣物</p>
        </div>
        <button
          type="button"
          data-parity-id="parity.app.app.src.components.outfit.list.view.edit-composition"
          onClick={onEditComposition}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-denim/25 bg-white px-3 text-xs font-semibold text-denim"
        >
          编辑组成
        </button>
      </div>
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
              <button type="button" data-parity-id="parity.app.app.src.components.outfit.list.view.6a06ba69ed" onClick={() => onToggleReplacement(item.id!)} aria-label={`查看 ${item.name} 的替换建议`} className="min-h-11 shrink-0 ui-control-radius border border-ink/10 px-2 text-xs text-ink/65">
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
        <button type="button" data-parity-id="parity.app.app.src.components.outfit.list.view.1b7f0a6cfd" onClick={onGenerate} disabled={isLoading} className="mt-3 h-9 rounded-lg bg-denim px-4 text-xs font-semibold text-white disabled:opacity-50">
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
  onDelete: () => void | Promise<void>;
  onSaveCaption: (caption: string) => void | Promise<void>;
  onExpandImage: (image: { src: string; alt: string }) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(image.caption ?? "");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [captionSaving, setCaptionSaving] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button type="button" data-parity-id="parity.app.app.src.components.outfit.list.view.983315d853" onClick={onBack} className="p-1 -ml-1"><ChevronLeft size={20} /></button>
        <button type="button" ref={menuRef} data-parity-id="parity.app.app.src.components.outfit.list.view.ec3595582b" onClick={() => setMenuOpen(!menuOpen)} className="p-1">
          <MoreHorizontal size={18} className="text-ink/50" />
        </button>
      </div>

      <MotionPopoverMenu visible={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuRef as React.RefObject<HTMLElement | null>}>
        <div className="w-40 py-1">
          <button type="button" data-parity-id="parity.app.app.src.components.outfit.list.view.fc53cffe40" onClick={() => { setMenuOpen(false); setEditingCaption(true); setCaptionDraft(image.caption ?? ""); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-milk-darker/40">
            <Pencil size={14} />编辑说明
          </button>
          <button type="button" data-parity-id="parity.app.app.src.components.outfit.list.view.fa04042fc9" onClick={() => { setMenuOpen(false); setDeleteConfirm(true); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-milk-darker/40">
            <Trash2 size={14} />删除实图
          </button>
        </div>
      </MotionPopoverMenu>

      {/* Delete confirm */}
      <ConfirmActionSheet
        open={deleteConfirm}
        title="删除这张穿搭实图？"
        description="删除后不会影响套装内的衣物，也不会删除套装。"
        confirmLabel="删除"
        tone="danger"
        submitting={deleteSubmitting}
        error={deleteError}
        onConfirm={async () => {
          if (deleteSubmitting) return;
          setDeleteSubmitting(true);
          setDeleteError(null);
          try {
            await onDelete();
            setDeleteConfirm(false);
          } catch (error) {
            setDeleteError(error instanceof Error ? error.message : "删除失败，请重试");
          } finally {
            setDeleteSubmitting(false);
          }
        }}
        onClose={() => {
          setDeleteConfirm(false);
          setDeleteError(null);
        }}
      />

      {/* Caption edit */}
      <MotionSheet
        open={editingCaption}
        onClose={() => {
          if (!captionSaving) {
            setEditingCaption(false);
            setCaptionError(null);
          }
        }}
        variant="form"
        preferBottom={false}
        ariaLabel="编辑穿搭实图说明"
        dismissible={!captionSaving}
        closeOnBackdrop={!captionSaving}
        closeOnEscape={!captionSaving}
        panelClassName="sm:max-w-sm"
      >
          <div>
            <p className="text-sm font-medium">编辑说明</p>
            <input
              type="text"
              value={captionDraft}
              data-parity-id="parity.app.app.src.components.outfit.list.view.55c593c654" onChange={(e) => setCaptionDraft(e.target.value)}
              className="mt-2 w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
            />
            {captionError ? <p role="alert" className="mt-2 text-xs text-red-600">{captionError}</p> : null}
            <div className="mt-4 flex gap-3">
              <button type="button" disabled={captionSaving} data-parity-id="parity.app.app.src.components.outfit.list.view.c67aaefef9" onClick={() => setEditingCaption(false)} className="flex-1 rounded-full border border-ink/10 py-2 text-sm disabled:opacity-50">取消</button>
              <button
                type="button"
                disabled={captionSaving}
                data-parity-id="parity.app.app.src.components.outfit.list.view.822ac5a1bc"
                onClick={async () => {
                  if (captionSaving) return;
                  setCaptionSaving(true);
                  setCaptionError(null);
                  try {
                    await onSaveCaption(captionDraft);
                    setEditingCaption(false);
                  } catch (error) {
                    setCaptionError(error instanceof Error ? error.message : "保存失败，请重试");
                  } finally {
                    setCaptionSaving(false);
                  }
                }}
                className="flex-1 rounded-full bg-denim py-2 text-sm font-medium text-white disabled:opacity-50"
              >{captionSaving ? "保存中..." : "保存"}</button>
            </div>
          </div>
      </MotionSheet>

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
 onEditComposition,
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
 onEditComposition?: () => void;
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
 <button type="button" data-parity-id="parity.app.app.src.components.outfit.list.view.cb3f420db8" onClick={onBack} className="-ml-1 inline-flex h-11 w-11 shrink-0 items-center justify-center ui-control-radius text-ink/70" aria-label="返回"><ChevronLeft size={20} /></button>
 <h3 className="text-base font-semibold">{isEdit ? "编辑套装信息" : "创建搭配"}</h3>
 </div>

 {/* v1.0: 重新使用 AI 生成信息按钮 (仅 edit) */}
 {isEdit && onRegenerateInfo ? (
 <div className="rounded-2xl border border-denim/12 bg-denim/5 p-3">
 <button
 type="button"
 data-parity-id="parity.app.app.src.components.outfit.list.view.4c3cea17f9" onClick={() => { void onRegenerateInfo(); }}
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

      {isEdit ? (
        <div className="rounded-2xl border border-ink/8 bg-white/75 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">套装组成</p>
              <p className="mt-0.5 text-xs text-ink/45">已选择 {selectedIds.length} 件衣物</p>
            </div>
            <button
              type="button"
              data-parity-id="parity.app.app.src.components.outfit.list.view.edit-form-composition"
              onClick={onEditComposition}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-denim/25 bg-white px-3 text-xs font-semibold text-denim"
            >
              编辑组成
            </button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {selectedItems.map((item) => (
              <div key={item.id} className="w-20 shrink-0 text-center">
                <div className="h-20 overflow-hidden rounded-lg bg-milk-darker/40">
                  {item.mainImage ? (
                    <OnlineAssetImage asset={item.mainImage.asset} variant="thumbnail" alt={item.name} className="h-full w-full" />
                  ) : <div className="grid h-full place-items-center text-ink/25"><Shirt size={18} /></div>}
                </div>
                <p className="mt-1 truncate text-[11px] text-ink/65">{item.name}</p>
              </div>
            ))}
          </div>
          {selectedIds.length < 2 ? <p className="mt-2 text-xs text-clay">套装至少需要 2 件衣物</p> : null}
        </div>
      ) : null}

      {/* Name */}
      <div>
        <label className="text-xs font-medium text-ink/50">套装名称</label>
        <input type="text" value={name} data-parity-id="parity.app.app.src.components.outfit.list.view.d0acaa7642" onChange={(e) => setName(e.target.value)} placeholder="例如：蓝白通勤套装" className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm" />
      </div>

      {/* Seasons (v1.0: 重命名为"适合季节" + 增加"四季") */}
      <div>
        <label className="text-xs font-medium text-ink/50">适合季节</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {(["spring", "summer", "autumn", "winter", "all"] as Season[]).map((s) => (
            <button key={s} type="button" data-parity-id={`parity.app.app.src.components.outfit.list.view.138a7e3007.${s}`} onClick={() => setSeasons(toggleArr(seasons, s))}
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
            <button key={s} type="button" data-parity-id={`parity.app.app.src.components.outfit.list.view.7392ff08a7.${s}`} onClick={() => setScenes(toggleArr(scenes, s))}
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
          <input type="number" data-parity-id="parity.app.app.src.components.outfit.list.view.4955a36c70" value={minC} onChange={(e) => setMinC(e.target.value)} placeholder="最低℃" className="w-20 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm" />
          <span className="text-xs text-ink/30">到</span>
          <input type="number" data-parity-id="parity.app.app.src.components.outfit.list.view.4f1f66edd9" value={maxC} onChange={(e) => setMaxC(e.target.value)} placeholder="最高℃" className="w-20 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm" />
        </div>
      </div>

      {/* Styles */}
      <div>
        <label className="text-xs font-medium text-ink/50">风格</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {STYLE_OPTIONS.map((s) => (
            <button key={s} type="button" data-parity-id={`parity.app.app.src.components.outfit.list.view.7998ccc498.${s}`} onClick={() => setStyles(toggleArr(styles, s))}
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
            <button key={t} type="button" data-parity-id={`parity.app.app.src.components.outfit.list.view.79475048d9.${t}`} onClick={() => setPairingTags(toggleArr(pairingTags, t))}
              className={`rounded-full px-3 py-1 text-sm ${pairingTags.includes(t) ? "bg-denim/10 text-denim border border-denim/30" : "border border-ink/10 bg-white text-ink/50"}`}>
              {t}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input type="text" data-parity-id="parity.app.app.src.components.outfit.list.view.4ee78cf6f8" value={customTag} onChange={(e) => setCustomTag(e.target.value)} placeholder="自定义" className="w-16 rounded-full border border-ink/10 bg-white px-3 py-1 text-sm" />
            {customTag.trim() && (
              <button type="button" data-parity-id="parity.app.app.src.components.outfit.list.view.cd6e8e767f" onClick={() => { setPairingTags([...pairingTags, customTag.trim()]); setCustomTag(""); }}
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
        <textarea data-parity-id="parity.app.app.src.components.outfit.list.view.26ab234f9c" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="适合办公室、城市步行……" rows={3} className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm resize-none" />
      </div>

      {/* Bottom bar */}
      <div className="flex gap-3 pt-4">
        <button type="button" data-parity-id="parity.app.app.src.components.outfit.list.view.5911a347e0" onClick={onCancel} className="flex-1 rounded-full border border-ink/10 py-2.5 text-sm">取消</button>
        <button type="button" data-parity-id="parity.app.app.src.components.outfit.list.view.a91e4277f6" onClick={onSave} className="flex-[2] rounded-full bg-denim py-2.5 text-sm font-medium text-white">保存套装</button>
      </div>
    </div>
  );
}

function OutfitCompositionEditor({
  title,
  items,
  locations,
  initialSelectedIds,
  confirmLabel = "保存组成",
  onDirtyChange,
  isSaving = false,
  onBack,
  onConfirm,
}: {
  title: string;
  items: WardrobeItem[];
  locations: ClosetLocation[];
  initialSelectedIds: number[];
  confirmLabel?: string;
  onDirtyChange?: (dirty: boolean) => void;
  isSaving?: boolean;
  onBack: () => void;
  onConfirm: (selectedIds: number[]) => Promise<boolean> | boolean;
}) {
  const [selectedIds, setSelectedIds] = useState(() => Array.from(new Set(initialSelectedIds)));
  const [locationFilter, setLocationFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<GarmentCategory | "all">("all");
  const [searchText, setSearchText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const initialKey = initialSelectedIds.join(",");
  const selectedKey = selectedIds.join(",");
  const hasChanges = initialKey !== selectedKey;
  const activeItems = useMemo(
    () => items.filter((item) => item.status === "active" && typeof item.id === "number"),
    [items],
  );
  const locationItems = useMemo(
    () => locationFilter === "all" ? activeItems : activeItems.filter((item) => item.locationId === locationFilter),
    [activeItems, locationFilter],
  );
  const categoryChips = useMemo(() => {
    const counts = new Map<GarmentCategory, number>();
    locationItems.forEach((item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1));
    const order: GarmentCategory[] = ["tops", "pants", "skirts", "one_piece", "shoes", "bags", "hats", "jewelry", "accessories"];
    return [
      { key: "all" as const, label: "全部", count: locationItems.length },
      ...order.filter((key) => counts.has(key)).map((key) => ({ key, label: CATEGORY_LABELS[key], count: counts.get(key) ?? 0 })),
    ];
  }, [locationItems]);
  const visibleItems = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return locationItems.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (!query) return true;
      return [item.name, CATEGORY_LABELS[item.category], ...(item.styles ?? [])].filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [categoryFilter, locationItems, searchText]);
  const selectedItems = useMemo(
    () => selectedIds.map((id) => items.find((item) => item.id === id)).filter((item): item is WardrobeItem => Boolean(item)),
    [items, selectedIds],
  );
  const unavailableCount = selectedIds.filter((id) => !activeItems.some((item) => item.id === id)).length;
  const busy = isSaving || isSubmitting;

  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  function toggleItem(id: number) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function requestBack() {
    if (busy) return;
    if (hasChanges) setDiscardOpen(true);
    else onBack();
  }

  async function confirmSelection() {
    if (busy || selectedIds.length < 2) return;
    setIsSubmitting(true);
    try {
      await onConfirm(selectedIds);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-1rem)] space-y-4 pb-[calc(env(safe-area-inset-bottom)+88px)]">
      <div className="app-glass-top sticky top-0 z-30 -mx-4 px-4 pb-3" style={{ paddingTop: "calc(max(env(safe-area-inset-top, 0px), var(--android-safe-area-top, 0px)) + 0.5rem)" }}>
        <div className="flex items-center gap-3">
        <button type="button" data-parity-id="parity.app.app.src.components.outfit.composition-editor.back" onClick={requestBack} disabled={busy} className="inline-flex h-11 w-11 shrink-0 items-center justify-center ui-control-radius text-ink/75 disabled:opacity-40" aria-label="返回">
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <p className="mt-0.5 text-xs text-ink/45">从当前衣橱中选择套装单品</p>
        </div>
        </div>
      </div>

      <div className="rounded-2xl border border-ink/8 bg-white/75 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">已选 {selectedIds.length} 件</p>
            <p className="mt-0.5 text-xs text-ink/45">套装至少需要 2 件衣物</p>
          </div>
          {unavailableCount > 0 ? <span className="text-right text-xs text-clay">{unavailableCount} 件已不可用</span> : null}
        </div>
        {selectedItems.length > 0 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {selectedItems.map((item) => (
              <button key={item.id} type="button" data-parity-id={`parity.app.app.src.components.outfit.composition-editor.remove.${item.id}`} onClick={() => toggleItem(item.id!)} className="inline-flex min-h-11 max-w-[160px] shrink-0 items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3 text-xs text-ink/70">
                <span className="truncate">{item.name}</span><X size={13} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : <p className="mt-3 text-xs text-ink/40">还没有选择衣物。</p>}
      </div>

      {locations.length > 0 ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" data-parity-id="parity.app.app.src.components.outfit.composition-editor.location.all" onClick={() => setLocationFilter("all")} className={`min-h-11 shrink-0 rounded-full px-3 text-xs font-medium ${locationFilter === "all" ? "border border-denim/30 bg-denim/10 text-denim" : "bg-milk-darker/50 text-ink/60"}`}>全部衣橱 ({activeItems.length})</button>
          {locations.map((location) => (
            <button key={location.id} type="button" data-parity-id={`parity.app.app.src.components.outfit.composition-editor.location.${location.id}`} onClick={() => setLocationFilter(location.id)} className={`min-h-11 shrink-0 rounded-full px-3 text-xs font-medium ${locationFilter === location.id ? "border border-denim/30 bg-denim/10 text-denim" : "bg-milk-darker/50 text-ink/60"}`}>{location.name}</button>
          ))}
        </div>
      ) : null}

      <label className="flex h-11 items-center gap-2 rounded-xl border border-ink/10 bg-white px-3">
        <Search size={16} className="text-ink/35" aria-hidden="true" />
        <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索名称、风格或分类" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {categoryChips.map((chip) => (
          <button key={chip.key} type="button" data-parity-id={`parity.app.app.src.components.outfit.composition-editor.category.${chip.key}`} onClick={() => setCategoryFilter(chip.key)} className={`min-h-11 shrink-0 rounded-full px-3 text-xs font-medium ${categoryFilter === chip.key ? "border border-denim/30 bg-denim/10 text-denim" : "bg-milk-darker/50 text-ink/60"}`}>{chip.label} ({chip.count})</button>
        ))}
      </div>

      {visibleItems.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {visibleItems.map((item) => {
            const selected = selectedIds.includes(item.id!);
            return (
              <button key={item.id} type="button" data-parity-id={`parity.app.app.src.components.outfit.composition-editor.item.${item.id}`} onClick={() => toggleItem(item.id!)} aria-pressed={selected} className={`min-w-0 overflow-hidden rounded-xl border text-left ${selected ? "border-denim bg-denim/6" : "border-ink/8 bg-white"}`}>
                <div className="relative aspect-[3/4] bg-mist">
                  {item.mainImage ? <OnlineAssetImage asset={item.mainImage.asset} variant="thumbnail" alt={item.name} className="h-full w-full" imageClassName="object-contain" /> : <div className="grid h-full place-items-center text-ink/25"><Shirt size={24} /></div>}
                  {selected ? <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-denim text-white"><Check size={14} aria-hidden="true" /></span> : null}
                </div>
                <div className="p-2"><p className="truncate text-xs font-semibold text-ink">{item.name}</p><p className="mt-0.5 truncate text-[11px] text-ink/45">{CATEGORY_LABELS[item.category]}</p></div>
              </button>
            );
          })}
        </div>
      ) : <div className="rounded-xl border border-dashed border-ink/12 bg-white/60 p-8 text-center text-sm text-ink/45">当前筛选条件下没有可用衣物。</div>}

      <div className="app-glass-bottom sticky bottom-0 z-40 -mx-4 border-t border-ink/8 px-4 pt-3" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px), var(--android-safe-area-bottom, 0px))" }}>
        <div className="flex gap-3">
          <button type="button" data-parity-id="parity.app.app.src.components.outfit.composition-editor.cancel" onClick={requestBack} disabled={busy} className="h-12 flex-1 ui-control-radius border border-ink/10 bg-white text-sm text-ink/70 disabled:opacity-40">取消</button>
          <button type="button" data-parity-id="parity.app.app.src.components.outfit.composition-editor.confirm" onClick={() => { void confirmSelection(); }} disabled={busy || selectedIds.length < 2} className="h-12 flex-[2] ui-control-radius bg-denim text-sm font-semibold text-white disabled:opacity-40">{busy ? "正在保存…" : confirmLabel}</button>
        </div>
      </div>

      <ConfirmActionSheet open={discardOpen} title="放弃本次修改？" description="当前选择还没有保存，返回后会丢失本次组成调整。" confirmLabel="放弃修改" cancelLabel="继续编辑" tone="danger" onConfirm={onBack} onClose={() => setDiscardOpen(false)} />
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
