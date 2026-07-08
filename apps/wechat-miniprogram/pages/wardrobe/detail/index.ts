import { aiEnhance, hasMiniMaxKey, recognizeGarmentImage } from "../../../services/ai";
import { deleteWorkspaceEntity, fetchGarmentDetail, updateGarment, type MiniGarmentDetail } from "../../../services/workspace";

Page({
  data: {
    title: "单品详情",
    loading: false,
    deleting: false,
    recognizing: false,
    adviceLoading: false,
    adviceSummary: "",
    adviceTips: [] as string[],
    deleteSheetOpen: false,
    item: null as MiniGarmentDetail | null,
    error: "",
  },

  async generateAdvice(this: any) {
    const item = this.data.item as MiniGarmentDetail | null;
    if (!item || this.data.adviceLoading) return;
    if (!hasMiniMaxKey()) {
      wx.showToast({ title: "请先在设置中填写 MiniMax Key", icon: "none" });
      return;
    }
    this.setData({ adviceLoading: true, adviceSummary: "", adviceTips: [] });
    try {
      const result = await aiEnhance<Record<string, unknown>>("garment-style-advice", { item });
      this.setData({
        adviceSummary: typeof result.summary === "string" ? result.summary : "已生成单品建议",
        adviceTips: ["scenes", "pairingTips", "avoidTips"].flatMap((key) => stringList(result[key])).slice(0, 6),
      });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "生成建议失败", icon: "none" });
    } finally {
      this.setData({ adviceLoading: false });
    }
  },

  async reRecognize(this: any) {
    const item = this.data.item as MiniGarmentDetail | null;
    if (!item || this.data.recognizing) return;
    if (!item.imageUrl) {
      wx.showToast({ title: "这件衣物没有可识别图片", icon: "none" });
      return;
    }
    this.setData({ recognizing: true });
    try {
      const tag = await recognizeGarmentImage(item.imageUrl);
      await updateGarment({
        id: item.id,
        expectedRevision: item.revision,
        currentPayload: item.rawPayload,
        name: tag.candidateNames[0] ?? item.name,
        category: tag.category,
        colors: tag.colors as unknown as Record<string, unknown>,
        seasons: tag.seasons,
        styles: tag.styles,
        notes: tag.notes,
        aiTag: tag as unknown as Record<string, unknown>,
      });
      this.setData({ item: await fetchGarmentDetail(item.id) });
      wx.showToast({ title: "已重新识别", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "重新识别失败", icon: "none" });
    } finally {
      this.setData({ recognizing: false });
    }
  },

  onLoad(query?: { id?: string }) {
    wx.setNavigationBarTitle({ title: "单品详情" });
    if (query?.id) void this.loadDetail(query.id);
    else this.setData({ error: "缺少单品 ID" });
  },

  async loadDetail(this: any, id: string) {
    this.setData({ loading: true, error: "" });
    try {
      this.setData({ item: await fetchGarmentDetail(id), loading: false });
    } catch (error) {
      this.setData({ loading: false, error: error instanceof Error ? error.message : "读取单品失败" });
    }
  },

  openDeleteSheet() {
    this.setData({ deleteSheetOpen: true });
  },

  closeDeleteSheet() {
    if (!this.data.deleting) this.setData({ deleteSheetOpen: false });
  },

  async confirmDelete(this: any) {
    const item = this.data.item as MiniGarmentDetail | null;
    if (!item || this.data.deleting) return;
    this.setData({ deleting: true });
    try {
      await deleteWorkspaceEntity("garments", item.id, item.revision);
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
