import { aiEnhance, hasMiniMaxKey } from "../../../services/ai";
import { MINI_CATEGORY_LABELS } from "../../../generated/catalogs";
import { fetchClosetLocations, fetchGarments, fetchOutfits, getWorkspaceReadState, type MiniClosetLocation, type MiniGarment } from "../../../services/workspace";

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
    loading: false,
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
    emptyTitle: "",
    emptyAction: "",
    actionMenuOpen: false,
    locationMenuOpen: false,
    createSheetOpen: false,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "衣橱" });
    setCustomTabBarSelected(this, 0);
    void this.loadGarments();
  },

  onShow() {
    setCustomTabBarSelected(this, 0);
    void this.loadGarments();
  },

  onReady() {
    setCustomTabBarSelected(this, 0);
  },

  async loadGarments() {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      this.setData({
        loading: false,
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

    this.setData({ loading: true, error: "" });
    try {
      const [garments, locations] = await Promise.all([fetchGarments(), fetchClosetLocations().catch(() => [])]);
      this.applyGarments(garments, locations);
    } catch (error) {
      this.setData({ loading: false, garments: [], visibleGarments: [], error: error instanceof Error ? error.message : "读取衣橱失败" });
    }
  },

  applyGarments(this: any, garments: MiniGarment[], locations?: MiniClosetLocation[]) {
    const currentLocations = locations ?? this.data.locations;
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
      loading: false,
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
    wx.navigateTo({ url: `/pages/wardrobe/detail/index${id ? `?id=${encodeURIComponent(id)}` : ""}` });
  },

  showSearchTip() {
    wx.showToast({ title: "搜索暂未开放", icon: "none" });
  },

  showStatsTip() {
    wx.showToast({ title: this.data.statsText, icon: "none" });
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
      this.showSearchTip();
      return;
    }
    if (action === "stats") {
      this.showStatsTip();
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
    this.setData({ diagnosisLoading: true, diagnosisSummary: "", diagnosisTips: [] });
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
      wx.showToast({ title: error instanceof Error ? error.message : "诊断失败", icon: "none" });
    } finally {
      this.setData({ diagnosisLoading: false });
    }
  },
});

function setCustomTabBarSelected(page: unknown, selected: number) {
  const pageWithTabBar = page as { getTabBar?: () => ({ setData?: (data: { selected: number }) => void } | null) };
  const tabBar = pageWithTabBar.getTabBar?.();
  if (tabBar && typeof tabBar.setData === "function") tabBar.setData({ selected });
}

function buildCategoryChips(garments: MiniGarment[]): CategoryChip[] {
  const counts = new Map<string, number>();
  for (const garment of garments) counts.set(garment.category, (counts.get(garment.category) ?? 0) + 1);
  return Array.from(counts.entries()).map(([key, count]) => ({
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
