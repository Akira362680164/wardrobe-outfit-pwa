import { aiEnhance, hasMiniMaxKey } from "../../../services/ai";
import { MINI_CATEGORY_LABELS } from "../../../generated/catalogs";
import { deleteWorkspaceEntity, fetchClosetLocations, fetchGarments, fetchOutfits, getWorkspaceReadState, type MiniClosetLocation, type MiniGarment } from "../../../services/workspace";
import { getRuntimeSessionScope } from "../../../stores/session";
import { selectCustomTab } from "../../../utils/custom-tab-bar";
import { currentAccessibilityFontStyle } from "../../../utils/accessibility-font";
import { markRuntimeDomainDirty, runRuntimeDomainRefresh } from "../../../utils/runtime-refresh";

type CategoryChip = {
  key: string;
  label: string;
  count: number;
};

type LocationOption = {
  id: string;
  name: string;
  note: string;
  count: number;
};
Page({
  data: {
    fontStyle: currentAccessibilityFontStyle(),
    initialLoading: false,
    refreshing: false,
    garments: [] as MiniGarment[],
    visibleGarments: [] as MiniGarment[],
    locations: [] as MiniClosetLocation[],
    locationOptions: [] as LocationOption[],
    wardrobeScope: "all",
    scopeLabel: "全部衣橱",
    scopeCount: 0,
    categoryChips: [] as CategoryChip[],
    activeCategory: "all",
    totalCount: 0,
    statsText: "全部 0 · 可穿 0 · 衣橱 1",
    error: "",
    diagnosisLoading: false,
    diagnosisSummary: "",
    diagnosisTips: [] as string[],
    diagnosisError: "",
    diagnosisExpanded: true,
    emptyTitle: "",
    emptyAction: "",
    actionMenuOpen: false,
    locationMenuOpen: false,
    createSheetOpen: false,
    selectionMode: false,
    selectedIds: [] as string[],
    selectedMap: {} as Record<string, boolean>,
    deleteConfirmOpen: false,
    deletingSelection: false,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "衣橱" });
    selectCustomTab(this, 0);
  },

  onShow() {
    this.resetForRuntimeSession();
    selectCustomTab(this, 0);
    void this.loadGarments();
  },

  onReady() {
    selectCustomTab(this, 0);
  },

  resetForRuntimeSession(this: any) {
    const scope = getRuntimeSessionScope();
    if (this.runtimeSessionScope && this.runtimeSessionScope !== scope) {
      this.hasLoadedGarments = false;
      this.setData({ garments: [], visibleGarments: [], locations: [], locationOptions: [], categoryChips: [], totalCount: 0, scopeCount: 0 });
    }
    this.runtimeSessionScope = scope;
  },

  async loadGarments(this: any, options: { force?: boolean } = {}) {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      (this as any).hasLoadedGarments = false;
      this.setData({
        initialLoading: false,
        refreshing: false,
        garments: [],
        visibleGarments: [],
        locations: [],
        locationOptions: [],
        wardrobeScope: "all",
        scopeLabel: "全部衣橱",
        scopeCount: 0,
        categoryChips: [],
        totalCount: 0,
        statsText: "全部 0 · 可穿 0 · 衣橱 1",
        error: "",
        emptyTitle: state === "logged_out" ? "登录后查看衣橱" : "请先配置后端 API 域名",
        emptyAction: state === "logged_out" ? "去登录" : "去设置",
      });
      return;
    }

    const hasData = Boolean((this as any).hasLoadedGarments);
    try {
      const result = await runRuntimeDomainRefresh(
        "garments",
        async () => {
          this.setData({ initialLoading: !hasData, refreshing: hasData, error: "" });
          const [garments, locations] = await Promise.all([fetchGarments(), fetchClosetLocations().catch(() => [])]);
          return { garments, locations };
        },
        { force: Boolean(options.force), hasData },
      );
      if (result.status === "fulfilled" && result.accepted) {
        (this as any).hasLoadedGarments = true;
        this.applyGarments(result.value.garments, result.value.locations);
      }
      else this.setData({ initialLoading: false, refreshing: false });
    } catch (error) {
      markRuntimeDomainDirty("garments");
      this.setData({ initialLoading: false, refreshing: false, error: error instanceof Error ? error.message : "读取衣橱失败" });
    }
  },

  applyGarments(this: any, garments: MiniGarment[], locations?: MiniClosetLocation[]) {
    const currentLocations = locations ?? this.data.locations;
    if ((this.data.garments.length > 0 || this.data.locations.length > 0)
      && sameList(garments, this.data.garments)
      && sameList(currentLocations, this.data.locations)) {
      this.setData({ initialLoading: false, refreshing: false, error: "", emptyTitle: "", emptyAction: "" });
      return;
    }
    const current = this.data.activeCategory;
    const wardrobeScope = this.data.wardrobeScope;
    const locationOptions = buildLocationOptions(garments, currentLocations);
    const activeScope = wardrobeScope === "all" || locationOptions.some((option) => option.id === wardrobeScope) ? wardrobeScope : "all";
    const scopeItems = filterByLocation(garments, activeScope);
    const categoryChips = buildCategoryChips(scopeItems);
    const activeCategory = current === "all" || categoryChips.some((chip) => chip.key === current) ? current : "all";
    const visibleGarments = filterGarments(scopeItems, activeCategory);
    const totalCount = garments.length;
    const scopeLabel = locationOptions.find((option) => option.id === activeScope)?.name ?? "全部衣橱";
    this.setData({
      initialLoading: false,
      refreshing: false,
      error: "",
      garments,
      locations: currentLocations,
      locationOptions,
      wardrobeScope: activeScope,
      scopeLabel,
      scopeCount: scopeItems.length,
      visibleGarments,
      categoryChips,
      activeCategory,
      totalCount,
      statsText: buildStatsText(scopeItems, activeScope, currentLocations.length || 1),
      emptyTitle: "",
      emptyAction: "",
    });
  },

  handleCategoryTap(event: { currentTarget: { dataset: { category?: string } } }) {
    const category = String(event.currentTarget.dataset.category || "all");
    const scopeItems = filterByLocation(this.data.garments, this.data.wardrobeScope);
    this.setData({
      activeCategory: category,
      visibleGarments: filterGarments(scopeItems, category),
    });
  },

  toggleLocationMenu() {
    this.setData({ locationMenuOpen: !this.data.locationMenuOpen, actionMenuOpen: false });
  },

  selectWardrobe(event: { currentTarget: { dataset: { id?: string } } }) {
    const scope = String(event.currentTarget.dataset.id || "all");
    const scopeItems = filterByLocation(this.data.garments, scope);
    const categoryChips = buildCategoryChips(scopeItems);
    const activeCategory = categoryChips.some((chip) => chip.key === this.data.activeCategory) ? this.data.activeCategory : "all";
    this.setData({
      wardrobeScope: scope,
      scopeLabel: this.data.locationOptions.find((option) => option.id === scope)?.name ?? "全部衣橱",
      scopeCount: scopeItems.length,
      categoryChips,
      activeCategory,
      visibleGarments: filterGarments(scopeItems, activeCategory),
      statsText: buildStatsText(scopeItems, scope, this.data.locations.length || 1),
      locationMenuOpen: false,
    });
  },

  handlePrimaryAction() {
    if (getWorkspaceReadState() === "logged_out") {
      wx.redirectTo({ url: "/pages/login/index" });
      return;
    }
    wx.switchTab({ url: "/pages/settings/index/index" });
  },

  handleEmptyAction() {
    if (this.data.emptyAction) {
      this.handlePrimaryAction();
      return;
    }
    this.openIntake();
  },

  openIntake() {
    this.setData({ actionMenuOpen: false });
    wx.navigateTo({ url: "/pages/intake/camera/index" });
  },

  openCreateSheet() {
    this.setData({ actionMenuOpen: false, createSheetOpen: true });
  },

  closeCreateSheet() {
    this.setData({ createSheetOpen: false });
  },

  openDetail(event: { detail?: { id?: string } }) {
    const id = event.detail?.id;
    if (this.data.selectionMode) { this.toggleSelected(id); return; }
    wx.navigateTo({ url: `/pages/wardrobe/detail/index${id ? `?id=${encodeURIComponent(id)}` : ""}` });
  },

  openSearch() {
    wx.navigateTo({ url: "/pages/wardrobe/search/index" });
  },

  openStatistics() {
    wx.navigateTo({ url: "/pages/wardrobe/statistics/index" });
  },

  toggleActionMenu() {
    this.setData({ actionMenuOpen: !this.data.actionMenuOpen });
  },

  closeActionMenu() {
    if (this.data.actionMenuOpen) this.setData({ actionMenuOpen: false });
  },

  closeOverlays() {
    if (this.data.actionMenuOpen || this.data.locationMenuOpen) this.setData({ actionMenuOpen: false, locationMenuOpen: false });
  },

  noop() {},

  handleActionMenuTap(event: { currentTarget: { dataset: { action?: string } } }) {
    const action = event.currentTarget.dataset.action;
    this.setData({ actionMenuOpen: false });
    if (action === "search") {
      this.openSearch();
      return;
    }
    if (action === "stats") {
      this.openStatistics();
      return;
    }
    void this.runDiagnosis();
  },

  async runDiagnosis(this: any) {
    if (this.data.diagnosisLoading) return;
    if (!hasMiniMaxKey()) {
      wx.showToast({ title: "请先在设置中填写 MiniMax Key", icon: "none" });
      return;
    }
    this.setData({ diagnosisLoading: true, diagnosisSummary: "", diagnosisTips: [], diagnosisError: "", diagnosisExpanded: true });
    try {
      const result = await aiEnhance<Record<string, unknown>>("wardrobe-diagnosis", {
        items: this.data.garments,
        outfits: await fetchOutfits(),
        locations: [],
      });
      this.setData({
        diagnosisSummary: typeof result.summary === "string" ? result.summary : "衣橱诊断已生成",
        diagnosisTips: diagnosisTips(result).slice(0, 5),
      });
    } catch (error) {
      this.setData({ diagnosisError: error instanceof Error ? error.message : "诊断失败" });
    } finally {
      this.setData({ diagnosisLoading: false });
    }
  },

  toggleDiagnosis() { this.setData({ diagnosisExpanded: !this.data.diagnosisExpanded }); },
  closeDiagnosis() { this.setData({ diagnosisSummary: "", diagnosisTips: [], diagnosisError: "", diagnosisLoading: false }); },

  enterSelection(this: any, event: any) {
    const id = event.detail?.id;
    if (id) this.setData({ selectionMode: true, selectedIds: [id], selectedMap: { [id]: true } });
  },

  toggleSelected(this: any, id?: string) {
    if (!id) return;
    const current = this.data.selectedIds as string[];
    const selectedIds = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
    this.setData({ selectedIds, selectedMap: Object.fromEntries(selectedIds.map((entry) => [entry, true])) });
  },

  cancelSelection() { this.setData({ selectionMode: false, selectedIds: [], selectedMap: {} }); },

  confirmBatchDelete(this: any) {
    const count = this.data.selectedIds.length;
    if (!count) return;
    this.setData({ deleteConfirmOpen: true });
  },

  closeDeleteConfirm(this: any) {
    if (!this.data.deletingSelection) this.setData({ deleteConfirmOpen: false });
  },

  confirmDeleteSelection(this: any) {
    this.setData({ deleteConfirmOpen: false });
    void this.batchDeleteSelected();
  },

  async batchDeleteSelected(this: any) {
    if (this.data.deletingSelection) return;
    this.setData({ deletingSelection: true });
    try {
      for (const id of this.data.selectedIds as string[]) {
        const item = (this.data.garments as MiniGarment[]).find((entry) => entry.id === id);
        if (item) {
          await deleteWorkspaceEntity("garments", item.id, item.revision);
          markRuntimeDomainDirty("garments");
        }
      }
      this.cancelSelection();
      await this.loadGarments();
    } catch (error) { wx.showToast({ title: error instanceof Error ? error.message : "批量删除失败", icon: "none" }); }
    finally { this.setData({ deletingSelection: false }); }
  },
});

function buildCategoryChips(garments: MiniGarment[]): CategoryChip[] {
  const counts = new Map<string, number>();
  for (const garment of garments) counts.set(garment.category, (counts.get(garment.category) ?? 0) + 1);
  const preferredOrder = ["tops", "pants", "shoes"];
  return Array.from(counts.entries()).sort(([left], [right]) => {
    const leftIndex = preferredOrder.indexOf(left);
    const rightIndex = preferredOrder.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return (MINI_CATEGORY_LABELS[left] ?? left).localeCompare(MINI_CATEGORY_LABELS[right] ?? right, "zh-CN");
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  }).map(([key, count]) => ({
    key,
    count,
    label: MINI_CATEGORY_LABELS[key] ?? garments.find((garment) => garment.category === key)?.categoryLabel ?? key,
  }));
}

function buildLocationOptions(garments: MiniGarment[], locations: MiniClosetLocation[]): LocationOption[] {
  const fallback = locations.length ? locations : [{ id: "home", name: "默认衣橱", note: "", sortOrder: 1 }];
  return [
    { id: "all", name: "全部衣橱", note: "包含所有衣物", count: garments.length },
    ...fallback.map((location) => ({
      id: location.id,
      name: location.name,
      note: location.note,
      count: garments.filter((garment) => garment.locationId === location.id).length,
    })),
  ];
}

function filterByLocation(garments: MiniGarment[], scope: string): MiniGarment[] {
  return scope === "all" ? garments : garments.filter((garment) => garment.locationId === scope);
}

function filterGarments(garments: MiniGarment[], category: string): MiniGarment[] {
  return category === "all" ? garments : garments.filter((garment) => garment.category === category);
}

function buildStatsText(items: MiniGarment[], scope: string, locationCount: number): string {
  const activeCount = items.filter((item) => item.status === "active").length;
  return scope === "all" ? `全部 ${items.length} · 可穿 ${activeCount} · 衣橱 ${locationCount}` : `全部 ${items.length} · 可穿 ${activeCount}`;
}

function diagnosisTips(result: Record<string, unknown>): string[] {
  return ["gaps", "duplicates", "idleItems", "reusableOutfits", "purchaseSuggestions"]
    .flatMap((key) => {
      const value = result[key];
      if (!Array.isArray(value)) return [];
      return value.map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          return [record.title, record.reason, record.suggestion].filter((part): part is string => typeof part === "string" && part.length > 0).join("：");
        }
        return "";
      });
    })
    .filter((item) => item.length > 0);
}

function sameList<T>(left: T[], right: T[]): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}
