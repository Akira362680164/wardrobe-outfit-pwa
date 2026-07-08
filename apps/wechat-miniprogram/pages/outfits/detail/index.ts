import { aiEnhance, hasMiniMaxKey } from "../../../services/ai";
import { deleteWorkspaceEntity, fetchGarments, fetchOutfitDetail, type MiniOutfitDetail } from "../../../services/workspace";

Page({
  data: {
    loading: false,
    deleting: false,
    adviceLoading: false,
    adviceSummary: "",
    adviceTips: [] as string[],
    deleteSheetOpen: false,
    outfit: null as MiniOutfitDetail | null,
    error: "",
  },

  async generateAdvice(this: any) {
    const outfit = this.data.outfit as MiniOutfitDetail | null;
    if (!outfit || this.data.adviceLoading) return;
    if (!hasMiniMaxKey()) {
      wx.showToast({ title: "请先在设置中填写 MiniMax Key", icon: "none" });
      return;
    }
    this.setData({ adviceLoading: true, adviceSummary: "", adviceTips: [] });
    try {
      const allItems = await fetchGarments();
      const outfitItems = allItems.filter((item) => outfit.itemIds.includes(item.legacyItemId) || outfit.itemEntityIds.includes(item.id));
      const result = await aiEnhance<Record<string, unknown>>("outfit-ai-suggestion", { outfit, outfitItems, allItems });
      this.setData({
        adviceSummary: typeof result.summary === "string" ? result.summary : "已生成套装建议",
        adviceTips: ["suitableScenes", "unsuitableScenes", "strengths", "risks", "missingItems"].flatMap((key) => stringList(result[key])).slice(0, 8),
      });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "生成建议失败", icon: "none" });
    } finally {
      this.setData({ adviceLoading: false });
    }
  },

  onLoad(query?: { id?: string }) {
    wx.setNavigationBarTitle({ title: "套装详情" });
    if (query?.id) void this.loadDetail(query.id);
    else this.setData({ error: "缺少套装 ID" });
  },

  async loadDetail(this: any, id: string) {
    this.setData({ loading: true, error: "" });
    try {
      this.setData({ outfit: await fetchOutfitDetail(id), loading: false });
    } catch (error) {
      this.setData({ loading: false, error: error instanceof Error ? error.message : "读取套装失败" });
    }
  },

  openDeleteSheet() {
    this.setData({ deleteSheetOpen: true });
  },

  closeDeleteSheet() {
    if (!this.data.deleting) this.setData({ deleteSheetOpen: false });
  },

  async confirmDelete(this: any) {
    const outfit = this.data.outfit as MiniOutfitDetail | null;
    if (!outfit || this.data.deleting) return;
    this.setData({ deleting: true });
    try {
      await deleteWorkspaceEntity("outfits", outfit.id, outfit.revision);
      wx.showToast({ title: "已删除", icon: "success" });
      wx.navigateBack({ delta: 1 });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" });
      this.setData({ deleting: false });
    }
  },
});

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}
