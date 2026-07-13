import { MINI_SEASON_CATALOG } from "../../../generated/catalogs";
import { generateOutfitMetadata, hasMiniMaxKey } from "../../../services/ai";
import {
  createClientMutationId,
  createOutfit,
  fetchClosetLocations,
  fetchGarments,
  fetchOutfitDetail,
  getWorkspaceReadState,
  updateOutfit,
  type MiniClosetLocation,
  type MiniGarment,
  type MiniOutfitDetail,
} from "../../../services/workspace";
import { getCapsuleGeometry } from "../../../utils/capsule-layout";
import {
  activeSelectableGarments,
  analyzeComposition,
  buildCategoryChips,
  buildLocalOutfitDraft,
  buildLocationOptions,
  filterGarments,
  parseTagInput,
  type OutfitDraft,
  type SelectableGarment,
} from "./logic";

declare const getCurrentPages: () => unknown[];

const FIELD_COUNT = 6;

Page({
  data: {
    editing: false,
    editingFocusComposition: false,
    editingOutfit: null as MiniOutfitDetail | null,
    loading: false,
    saving: false,
    generating: false,
    step: 0,
    capsuleTopRpx: 0,
    capsuleHeightRpx: 64,
    capsuleRightInsetRpx: 192,
    garments: [] as SelectableGarment[],
    visibleGarments: [] as SelectableGarment[],
    selectedGarments: [] as SelectableGarment[],
    selectedMap: {} as Record<string, boolean>,
    selectedCount: 0,
    locations: [] as MiniClosetLocation[],
    locationOptions: [] as Array<{ id: string; name: string; count: number }>,
    activeLocation: "all",
    categoryChips: [] as Array<{ key: string; label: string; count: number }>,
    activeCategory: "all",
    searchText: "",
    seasonOptions: MINI_SEASON_CATALOG.map((item) => ({ ...item, selected: false })),
    name: "",
    seasons: [] as string[],
    sceneText: "",
    styleText: "",
    pairingText: "",
    notes: "",
    temperatureRange: undefined as OutfitDraft["temperatureRange"],
    compositionSlots: [] as Array<{ key: string; label: string; present: boolean; statusText: string }>,
    compositionSummary: "",
    fieldCount: FIELD_COUNT,
    needsReviewCount: 0,
    canSave: false,
    analysisHint: "",
    issues: [] as string[],
    error: "",
    emptyTitle: "",
    emptyAction: "",
    confirmExitOpen: false,
    draftMutationId: createClientMutationId(),
  },

  onLoad(this: any, query?: { id?: string; focus?: string }) {
    const capsule = getCapsuleGeometry();
    const editingId = query?.id ? decodeURIComponent(query.id) : "";
    const editing = Boolean(editingId);
    this.setData({
      capsuleTopRpx: capsule.topRpx,
      capsuleHeightRpx: capsule.heightRpx,
      capsuleRightInsetRpx: capsule.rightInsetRpx,
      editing,
      editingFocusComposition: query?.focus === "composition",
      step: editing && query?.focus !== "composition" ? 1 : 0,
    });
    wx.setNavigationBarTitle({ title: editing ? "编辑套装" : "创建套装" });
    void this.loadGarments(editingId || undefined);
  },

  async loadGarments(this: any, editingId?: string) {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      this.setData({
        loading: false,
        garments: [],
        visibleGarments: [],
        error: "",
        emptyTitle: state === "logged_out" ? "登录后创建套装" : "请先配置后端 API 域名",
        emptyAction: state === "logged_out" ? "去登录" : "去设置",
      });
      return;
    }

    this.setData({ loading: true, error: "", emptyTitle: "", emptyAction: "" });
    try {
      const [rawGarments, locations] = await Promise.all([
        fetchGarments(),
        fetchClosetLocations().catch(() => []),
      ]);
      const garments = activeSelectableGarments(rawGarments);
      const locationOptions = buildLocationOptions(garments, locations);
      const defaultLocation = locations[0]?.id ?? "all";
      this.setData({
        loading: false,
        garments,
        locations,
        locationOptions,
        activeLocation: editingId ? "all" : defaultLocation,
        emptyTitle: garments.length ? "" : "当前衣橱还没有可用衣物",
      });
      if (editingId) {
        const outfit = await fetchOutfitDetail(editingId);
        const selectedLegacyIds = new Set(outfit.itemIds);
        const selectedEntityIds = new Set(outfit.itemEntityIds);
        const selectedGarments = garments.map((item) => ({
          ...item,
          selected: selectedLegacyIds.has(item.legacyItemId) || selectedEntityIds.has(item.id),
        }));
        const payload = outfit.rawPayload;
        const seasons = Array.isArray(payload.seasons) ? payload.seasons.filter((value): value is string => typeof value === "string") : [];
        const sceneTags = Array.isArray(payload.sceneTags) ? payload.sceneTags.filter((value): value is string => typeof value === "string") : [];
        const styleTags = Array.isArray(payload.styleTags) ? payload.styleTags.filter((value): value is string => typeof value === "string") : [];
        const pairingTags = Array.isArray(payload.pairingTags) ? payload.pairingTags.filter((value): value is string => typeof value === "string") : [];
        const selected = selectedGarments.filter((item) => item.selected);
        const composition = analyzeComposition(selected);
        this.setData({
          garments: selectedGarments,
          editingOutfit: outfit,
          selectedGarments,
          selectedMap: selectedGarments.filter((item) => item.selected).reduce((result: Record<string, boolean>, item) => { result[String(item.legacyItemId)] = true; return result; }, {}),
          selectedCount: selected.length,
          name: typeof payload.name === "string" ? payload.name : outfit.name,
          seasons,
          sceneText: sceneTags.join("、"),
          styleText: styleTags.join("、"),
          pairingText: pairingTags.join("、"),
          notes: typeof payload.notes === "string" ? payload.notes : outfit.notes,
          temperatureRange: payload.temperatureRange as OutfitDraft["temperatureRange"],
          seasonOptions: MINI_SEASON_CATALOG.map((item) => ({ ...item, selected: seasons.includes(item.value) })),
          compositionSlots: composition.slots,
          compositionSummary: composition.summary,
          step: this.data.editingFocusComposition ? 0 : 1,
          analysisHint: "编辑完成后点击保存，组成和套装信息才会写入。",
        });
        this.applyFilters();
        this.updateReviewSummary();
        return;
      }
      this.applyFilters();
    } catch (error) {
      this.setData({
        loading: false,
        garments: [],
        visibleGarments: [],
        error: error instanceof Error ? error.message : "读取衣物失败",
      });
    }
  },

  applyFilters(this: any) {
    const scopeItems = filterGarments(
      this.data.garments,
      this.data.activeLocation,
      "all",
      "",
    );
    const categoryChips = buildCategoryChips(scopeItems);
    const activeCategory = categoryChips.some(
      (chip) => chip.key === this.data.activeCategory,
    )
      ? this.data.activeCategory
      : "all";
    this.setData({
      categoryChips,
      activeCategory,
      visibleGarments: filterGarments(
        this.data.garments,
        this.data.activeLocation,
        activeCategory,
        this.data.searchText,
      ),
    });
  },

  selectLocation(this: any, event: { currentTarget: { dataset: { id?: string } } }) {
    this.setData({ activeLocation: String(event.currentTarget.dataset.id || "all") });
    this.applyFilters();
  },

  selectCategory(this: any, event: { currentTarget: { dataset: { key?: string } } }) {
    this.setData({ activeCategory: String(event.currentTarget.dataset.key || "all") });
    this.applyFilters();
  },

  handleSearchInput(this: any, event: WechatMiniprogram.InputEvent) {
    this.setData({ searchText: event.detail.value });
    this.applyFilters();
  },

  toggleGarment(this: any, event: { currentTarget: { dataset: { id?: string | number } } }) {
    const id = Number(event.currentTarget.dataset.id);
    if (!Number.isFinite(id)) return;
    const garments = this.data.garments.map((item: SelectableGarment) =>
      item.legacyItemId === id ? { ...item, selected: !item.selected } : item,
    );
    this.setData({ garments, analysisHint: "", issues: [] });
    this.syncSelection(true);
    this.applyFilters();
  },

  removeSelected(this: any, event: { currentTarget: { dataset: { id?: string | number } } }) {
    this.toggleGarment(event);
  },

  syncSelection(this: any, draftChanged = false) {
    const selectedGarments = this.data.garments.filter((item: SelectableGarment) => item.selected);
    const selectedMap = selectedGarments.reduce(
      (result: Record<string, boolean>, item: SelectableGarment) => {
        result[String(item.legacyItemId)] = true;
        return result;
      },
      {},
    );
    this.setData({
      selectedGarments,
      selectedMap,
      selectedCount: selectedGarments.length,
      ...(draftChanged ? { draftMutationId: createClientMutationId() } : {}),
    });
    this.updateReviewSummary();
  },

  async nextStep(this: any) {
    if (this.data.generating || this.data.selectedCount < 2) return;
    const selected = this.data.selectedGarments as SelectableGarment[];
    if (this.data.editing) {
      const composition = analyzeComposition(selected);
      this.setData({
        step: 1,
        analysisHint: "组成已调整，点击保存后才会写入。",
        issues: [],
        compositionSlots: composition.slots,
        compositionSummary: composition.summary,
      });
      this.updateReviewSummary();
      return;
    }
    const localDraft = buildLocalOutfitDraft(selected);
    this.applyDraft(localDraft, false);
    this.setData({ generating: true, analysisHint: "正在分析套装…", issues: [] });

    let draft = localDraft;
    let analysisHint = "已使用本地规则生成";
    const issues: string[] = [];
    if (hasMiniMaxKey()) {
      try {
        const metadata = await generateOutfitMetadata({
          itemIds: selected.map((item) => item.legacyItemId),
          outfitItems: selected.map((item) => ({
            id: item.legacyItemId,
            name: item.name,
            category: item.category,
            subcategory: item.subcategory || undefined,
            colors: { mode: "single", primary: item.colorText || "未标注" },
            seasons: item.seasons,
            styles: item.styles,
            temperatureRange: item.temperatureRange,
          })),
        });
        draft = {
          ...localDraft,
          ...(metadata.name ? { name: metadata.name } : {}),
          ...(metadata.seasons ? { seasons: metadata.seasons } : {}),
          ...(metadata.sceneTags ? { sceneTags: metadata.sceneTags } : {}),
          ...(metadata.styleTags ? { styleTags: metadata.styleTags } : {}),
          ...(metadata.pairingTags ? { pairingTags: metadata.pairingTags } : {}),
          ...(metadata.temperatureRange ? { temperatureRange: metadata.temperatureRange } : {}),
          ...(metadata.notes !== undefined ? { notes: metadata.notes } : {}),
        };
        analysisHint = "已使用 AI 生成，可继续校对";
      } catch (error) {
        analysisHint = "AI 生成失败，已使用本地规则生成";
        issues.push(error instanceof Error ? error.message : "AI 生成失败，已保留本地草稿");
      }
    }

    const composition = analyzeComposition(selected);
    this.applyDraft(draft, false);
    this.setData({
      step: 1,
      generating: false,
      analysisHint,
      issues,
      compositionSlots: composition.slots,
      compositionSummary: composition.summary,
    });
    this.updateReviewSummary();
  },

  previousStep(this: any) {
    if (this.data.saving || this.data.generating) return;
    this.setData({ step: 0, error: "" });
  },

  editComposition(this: any) {
    if (!this.data.editing || this.data.saving || this.data.generating) return;
    this.setData({ step: 0, error: "", analysisHint: "" });
  },

  applyDraft(this: any, draft: OutfitDraft, changed: boolean) {
    this.setData({
      name: draft.name,
      seasons: draft.seasons,
      sceneText: draft.sceneTags.join("、"),
      styleText: draft.styleTags.join("、"),
      pairingText: draft.pairingTags.join("、"),
      notes: draft.notes,
      temperatureRange: draft.temperatureRange,
      seasonOptions: MINI_SEASON_CATALOG.map((item) => ({
        ...item,
        selected: draft.seasons.includes(item.value),
      })),
      ...(changed ? { draftMutationId: createClientMutationId() } : {}),
    });
  },

  handleNameInput(this: any, event: WechatMiniprogram.InputEvent) {
    this.setData({ name: event.detail.value, draftMutationId: createClientMutationId() });
    this.updateReviewSummary();
  },

  handleTextInput(this: any, event: WechatMiniprogram.InputEvent & { currentTarget: { dataset: { field?: string } } }) {
    const field = String(event.currentTarget.dataset.field || "");
    if (!["sceneText", "styleText", "pairingText", "notes"].includes(field)) return;
    this.setData({ [field]: event.detail.value, draftMutationId: createClientMutationId() });
    this.updateReviewSummary();
  },

  toggleSeason(this: any, event: { currentTarget: { dataset: { value?: string } } }) {
    const value = String(event.currentTarget.dataset.value || "");
    if (!value) return;
    const seasons = this.data.seasons.includes(value)
      ? this.data.seasons.filter((item: string) => item !== value)
      : [...this.data.seasons, value];
    this.setData({
      seasons,
      seasonOptions: MINI_SEASON_CATALOG.map((item) => ({
        ...item,
        selected: seasons.includes(item.value),
      })),
      draftMutationId: createClientMutationId(),
    });
    this.updateReviewSummary();
  },

  updateReviewSummary(this: any) {
    const reviewValues = [
      this.data.name.trim(),
      this.data.seasons.length ? "season" : "",
      this.data.sceneText.trim(),
      this.data.styleText.trim(),
      this.data.pairingText.trim(),
    ];
    const needsReviewCount = reviewValues.filter((value) => !value).length;
    this.setData({
      needsReviewCount,
      canSave: this.data.selectedCount >= 2 && Boolean(this.data.name.trim()),
    });
  },

  requestExit(this: any) {
    if (this.data.selectedCount || this.data.step > 0) {
      this.setData({ confirmExitOpen: true });
      return;
    }
    this.exitNow();
  },

  closeExitConfirm(this: any) {
    this.setData({ confirmExitOpen: false });
  },

  confirmExit(this: any) {
    this.setData({ confirmExitOpen: false });
    this.exitNow();
  },

  exitNow() {
    if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1 });
    else wx.switchTab({ url: "/pages/outfits/index/index" });
  },

  handleEmptyAction() {
    const state = getWorkspaceReadState();
    if (state === "logged_out") {
      wx.redirectTo({ url: "/pages/login/index" });
      return;
    }
    if (state === "api_not_configured") {
      wx.switchTab({ url: "/pages/settings/index/index" });
      return;
    }
    wx.switchTab({ url: "/pages/wardrobe/index/index" });
  },

  async saveOutfit(this: any) {
    if (this.data.saving) return;
    const name = this.data.name.trim();
    const selected = this.data.selectedGarments as SelectableGarment[];
    if (!name || selected.length < 2) {
      this.setData({ issues: [!name ? "请先填写套装名称" : "套装至少需要 2 件衣物"] });
      this.updateReviewSummary();
      return;
    }

    this.setData({ saving: true, issues: [], error: "" });
    try {
      if (this.data.editing) {
        const outfit = this.data.editingOutfit as MiniOutfitDetail | null;
        if (!outfit) throw new Error("套装信息已失效，请返回后重试");
        const result = await updateOutfit({
          id: outfit.id,
          expectedRevision: outfit.revision,
          currentPayload: outfit.rawPayload,
          clientMutationId: this.data.draftMutationId,
          patch: {
            name,
            legacyItemIds: selected.map((item) => item.legacyItemId),
            itemIds: selected.map((item) => item.legacyItemId),
            itemEntityIds: selected.map((item) => item.id),
            seasons: this.data.seasons,
            sceneTags: parseTagInput(this.data.sceneText),
            styleTags: parseTagInput(this.data.styleText),
            pairingTags: parseTagInput(this.data.pairingText),
            temperatureRange: this.data.temperatureRange,
            notes: this.data.notes.trim() || undefined,
            aiSuggestion: undefined,
          },
        });
        await fetchOutfitDetail(result.id);
        wx.showToast({ title: "套装已更新", icon: "success" });
        wx.navigateBack({ delta: 1 });
        return;
      }
      const created = await createOutfit({
        name,
        legacyItemIds: selected.map((item) => item.legacyItemId),
        seasons: this.data.seasons,
        sceneTags: parseTagInput(this.data.sceneText),
        styleTags: parseTagInput(this.data.styleText),
        pairingTags: parseTagInput(this.data.pairingText),
        temperatureRange: this.data.temperatureRange,
        notes: this.data.notes.trim() || undefined,
        clientMutationId: this.data.draftMutationId,
      });
      await fetchOutfitDetail(created.id);
      wx.showToast({ title: "套装已保存", icon: "success" });
      wx.switchTab({ url: "/pages/outfits/index/index" });
    } catch (error) {
      this.setData({
        saving: false,
        issues: [error instanceof Error ? error.message : "保存套装失败"],
      });
    }
  },
});
