import { aiEnhance, hasMiniMaxKey } from "../../../services/ai";
import { fetchGarments, fetchOutfits, getWorkspaceReadState, type MiniGarment } from "../../../services/workspace";

type CategoryChip = {
  key: string;
  label: string;
  count: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  outerwear: "外套",
  tops: "上衣",
  pants: "裤子",
  skirts: "半裙",
  one_piece: "连体",
  shoes: "鞋",
  bags: "包",
  hats: "帽子",
  jewelry: "首饰",
  accessories: "配饰",
};

Page({
  data: {
    loading: false,
    garments: [] as MiniGarment[],
    visibleGarments: [] as MiniGarment[],
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
      this.applyGarments(await fetchGarments());
    } catch (error) {
      this.setData({ loading: false, garments: [], visibleGarments: [], error: error instanceof Error ? error.message : "读取衣橱失败" });
    }
  },

  applyGarments(garments: MiniGarment[]) {
    const current = this.data.activeCategory;
    const categoryChips = buildCategoryChips(garments);
    const activeCategory = current === "all" || categoryChips.some((chip) => chip.key === current) ? current : "all";
    const visibleGarments = filterGarments(garments, activeCategory);
    const totalCount = garments.length;
    this.setData({
      loading: false,
      garments,
      visibleGarments,
      categoryChips,
      activeCategory,
      totalCount,
      statsText: `全部 ${totalCount} · 可穿 ${totalCount} · 衣橱 1`,
      emptyTitle: "",
      emptyAction: "",
    });
  },

  handleCategoryTap(event: { currentTarget: { dataset: { category?: string } } }) {
    const category = String(event.currentTarget.dataset.category || "all");
    this.setData({
      activeCategory: category,
      visibleGarments: filterGarments(this.data.garments, category),
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
    label: CATEGORY_LABELS[key] ?? garments.find((garment) => garment.category === key)?.categoryLabel ?? "未分类",
  }));
}

function filterGarments(garments: MiniGarment[], category: string): MiniGarment[] {
  return category === "all" ? garments : garments.filter((garment) => garment.category === category);
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
