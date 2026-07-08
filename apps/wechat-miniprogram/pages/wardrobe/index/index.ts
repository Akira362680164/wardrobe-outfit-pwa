import { fetchGarments, getWorkspaceReadState, type MiniGarment } from "../../../services/workspace";

type CategoryChip = {
  key: string;
  label: string;
  count: number;
};

const CATEGORY_LABELS: Record<string, string> = {
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
    emptyTitle: "",
    emptyAction: "",
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
});

function setCustomTabBarSelected(page: unknown, selected: number) {
  const getTabBar = (page as { getTabBar?: () => ({ setData?: (data: { selected: number }) => void } | null) }).getTabBar;
  const tabBar = getTabBar?.();
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
