import { generateOutfitMetadata, hasMiniMaxKey } from "../../../services/ai";
import {
  createOutfit,
  fetchGarments,
  getWorkspaceReadState,
  type MiniGarment,
} from "../../../services/workspace";

type SelectableGarment = MiniGarment & { selected: boolean };

Page({
  data: {
    loading: false,
    saving: false,
    generating: false,
    name: "",
    sceneText: "",
    seasonText: "",
    aiNotes: "",
    seasons: [] as string[],
    sceneTags: [] as string[],
    garments: [] as SelectableGarment[],
    selectedCount: 0,
    error: "",
    emptyTitle: "",
    emptyAction: "",
  },

  async generateBaseInfo(this: any) {
    if (this.data.generating) return;
    const selected = this.data.garments.filter((item: SelectableGarment) => item.selected);
    if (selected.length < 2) {
      wx.showToast({ title: "至少选择 2 件衣物", icon: "none" });
      return;
    }
    if (!hasMiniMaxKey()) {
      wx.showToast({ title: "请先在设置中填写 MiniMax Key", icon: "none" });
      return;
    }

    this.setData({ generating: true });
    try {
      const metadata = await generateOutfitMetadata({
        name: this.data.name.trim() || undefined,
        itemIds: selected.map((item: SelectableGarment) => item.legacyItemId),
        outfitItems: selected.map((item: SelectableGarment) => ({
          id: item.legacyItemId,
          name: item.name,
          category: item.category,
          subcategory: item.subcategory,
          colors: { mode: "single", primary: item.colorText || "未标注" },
          seasons: item.seasonText ? [item.seasonText] : [],
          styles: [],
        })),
      });
      this.setData({
        name: this.data.name.trim() || metadata.name || "",
        seasons: metadata.seasons ?? [],
        sceneTags: metadata.sceneTags ?? [],
        seasonText: (metadata.seasons ?? []).join(" / "),
        sceneText: (metadata.sceneTags ?? []).join(" / "),
        aiNotes: metadata.notes ?? "",
      });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "生成失败", icon: "none" });
    } finally {
      this.setData({ generating: false });
    }
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "搭配编辑" });
    void this.loadGarments();
  },

  async loadGarments() {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      this.setData({
        loading: false,
        garments: [],
        error: "",
        emptyTitle: state === "logged_out" ? "登录后创建套装" : "请先配置后端 API 域名",
        emptyAction: state === "logged_out" ? "去登录" : "去设置",
      });
      return;
    }

    this.setData({ loading: true, error: "" });
    try {
      const garments = (await fetchGarments()).map((item) => ({ ...item, selected: false }));
      this.setData({ garments, selectedCount: 0, loading: false });
    } catch (error) {
      this.setData({ loading: false, garments: [], error: error instanceof Error ? error.message : "读取衣物失败" });
    }
  },

  handleNameInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ name: event.detail.value });
  },

  toggleGarment(event: any) {
    const id = Number(event.currentTarget.dataset.id);
    const garments = this.data.garments.map((item) => (
      item.legacyItemId === id ? { ...item, selected: !item.selected } : item
    ));
    this.setData({ garments, selectedCount: garments.filter((item) => item.selected).length });
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

  async saveOutfit() {
    if (this.data.saving) return;
    const name = this.data.name.trim();
    const selected = this.data.garments.filter((item) => item.selected);
    if (!name) {
      wx.showToast({ title: "先填写套装名称", icon: "none" });
      return;
    }
    if (selected.length < 2) {
      wx.showToast({ title: "至少选择 2 件衣物", icon: "none" });
      return;
    }

    this.setData({ saving: true });
    try {
      await createOutfit({
        name,
        legacyItemIds: selected.map((item) => item.legacyItemId),
        seasons: this.data.seasons,
        sceneTags: this.data.sceneTags,
      });
      wx.showToast({ title: "套装已保存", icon: "success" });
      wx.switchTab({ url: "/pages/outfits/index/index" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "保存套装失败", icon: "none" });
      this.setData({ saving: false });
    }
  },
});
