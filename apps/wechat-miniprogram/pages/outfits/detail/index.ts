import { aiEnhance, hasMiniMaxKey } from "../../../services/ai";
import { chooseImages, uploadPreparedImageAssets, type AssetMutation } from "../../../services/assets";
import {
  cancelOutfitWornToday,
  deleteWorkspaceEntity,
  fetchGarments,
  fetchOutfitDetail,
  markOutfitWornToday,
  setOutfitFavorite,
  updateOutfit,
  createClientMutationId,
  type MiniOutfitDetail,
} from "../../../services/workspace";

Page({
  data: {
    loading: false,
    deleting: false,
    actioning: "",
    adviceLoading: false,
    adviceSummary: "",
    adviceTips: [] as string[],
    deleteSheetOpen: false,
    outfit: null as MiniOutfitDetail | null,
    error: "",
    activeTab: "info",
  },

  async toggleFavorite(this: any) {
    const outfit = this.data.outfit as MiniOutfitDetail | null;
    if (!outfit || this.data.actioning) return;
    this.setData({ actioning: "favorite" });
    try {
      const next = await setOutfitFavorite(outfit.id, outfit.revision, !outfit.favorite);
      this.setData({ outfit: next });
      wx.showToast({ title: next.favorite ? "已收藏" : "已取消收藏", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "更新收藏失败", icon: "none" });
    } finally {
      this.setData({ actioning: "" });
    }
  },

  async toggleTodayWorn(this: any) {
    const outfit = this.data.outfit as MiniOutfitDetail | null;
    if (!outfit || this.data.actioning) return;
    this.setData({ actioning: "worn" });
    try {
      const next = outfit.wornToday
        ? await cancelOutfitWornToday(outfit.id, outfit.revision)
        : await markOutfitWornToday(outfit.id, outfit.revision);
      this.setData({ outfit: next });
      wx.showToast({ title: next.wornToday ? "已记录穿着" : "已撤销穿着", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "更新穿着失败", icon: "none" });
    } finally {
      this.setData({ actioning: "" });
    }
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

  switchTab(this: any, event: any) { this.setData({ activeTab: event.currentTarget.dataset.tab }); },
  previewPhoto(this: any, event: any) { const outfit = this.data.outfit as MiniOutfitDetail | null; if (!outfit) return; const urls = outfit.wornPhotos.map((photo) => photo.imageUrl).filter(Boolean); (wx as typeof wx & { previewImage: (options: { current?: string; urls: string[] }) => void }).previewImage({ current: event.detail.url || urls[0], urls }); },
  async addWornPhoto(this: any) { const outfit = this.data.outfit as MiniOutfitDetail | null; if (!outfit) return; try { const images = await chooseImages(["album", "camera"], Math.max(1, 9 - outfit.wornPhotos.length)); if (!images.length) return; const now = new Date().toISOString(); const refs = photoMetadata(outfit); const mutations: AssetMutation[] = []; for (const image of images) { const id = createClientMutationId(); const fieldName = `actualWornPhoto.${id}`; const uploaded = await uploadPreparedImageAssets({ clientMutationId: createClientMutationId(), entityType: "outfit", fieldName, originalPath: image.imagePath, processedPath: image.stablePath }); mutations.push(...uploaded.assetMutations); refs.push({ id, fieldName, caption: "", createdAt: now, updatedAt: now }); } this.setData({ outfit: await updateOutfit({ id: outfit.id, expectedRevision: outfit.revision, currentPayload: outfit.rawPayload, patch: { actualWornPhotos: refs }, assetMutations: mutations }) }); } catch (error) { wx.showToast({ title: error instanceof Error ? error.message : "添加实穿照片失败", icon: "none" }); } },
  async removeWornPhoto(this: any, event: any) { const outfit = this.data.outfit as MiniOutfitDetail | null; const id = event.detail.id; if (!outfit || !id) return; const target = outfit.wornPhotos.find((photo) => photo.id === id); if (!target) return; this.setData({ outfit: await updateOutfit({ id: outfit.id, expectedRevision: outfit.revision, currentPayload: outfit.rawPayload, patch: { actualWornPhotos: photoMetadata(outfit).filter((photo) => photo.id !== id) }, assetMutations: [{ kind: "remove", fieldName: target.fieldName }] }) }); },

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
    if (this.data.actioning) return;
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
function photoMetadata(outfit: MiniOutfitDetail): Array<{ id: string; fieldName: string; caption?: string; createdAt?: string; updatedAt?: string }> { return Array.isArray(outfit.rawPayload.actualWornPhotos) ? outfit.rawPayload.actualWornPhotos.filter((entry): entry is { id: string; fieldName: string } => Boolean(entry && typeof entry === "object" && "id" in entry && "fieldName" in entry)) : []; }
