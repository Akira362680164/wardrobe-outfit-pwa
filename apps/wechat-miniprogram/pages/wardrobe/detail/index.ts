import { aiEnhance, hasMiniMaxKey } from "../../../services/ai";
import { chooseImages, uploadPreparedImageAssets, type AssetMutation } from "../../../services/assets";
import { cancelGarmentWornOnDate, createClientMutationId, deleteWorkspaceEntity, fetchGarmentDetail, markGarmentWornOnDate, updateGarment, type MiniGarmentDetail } from "../../../services/workspace";
import { currentAccessibilityFontStyle } from "../../../utils/accessibility-font";
import { getRuntimeRefreshSnapshot, markRuntimeDomainDirty } from "../../../utils/runtime-refresh";

type ReferenceMetadata = { id: string; fieldName: string; caption?: string; createdAt?: string; updatedAt?: string };

Page({
  data: { fontStyle: currentAccessibilityFontStyle(), initialLoading: false, refreshing: false, deleting: false, wearActioning: false, wornToday: false, adviceLoading: false, adviceSummary: "", adviceTips: [] as string[], adviceSource: "", deleteSheetOpen: false, menuOpen: false, activeTab: "info", item: null as MiniGarmentDetail | null, error: "" },
  onLoad(this: any, query?: { id?: string }) { wx.setNavigationBarTitle({ title: "单品详情" }); if (query?.id) { this.detailId = query.id; void this.loadDetail(query.id); } else this.setData({ error: "缺少单品 ID" }); },
  onShow(this: any) { const item = this.data.item as MiniGarmentDetail | null; if (item && getRuntimeRefreshSnapshot("garments").version !== this.detailDomainVersion) void this.loadDetail(item.id); },
  async loadDetail(this: any, id: string) { const requestId = (this.detailRequestId || 0) + 1; this.detailRequestId = requestId; const hasData = Boolean(this.data.item); this.setData({ initialLoading: !hasData, refreshing: hasData, error: "" }); try { const item = await fetchGarmentDetail(id); if (requestId !== this.detailRequestId) return; const advice = item.aiStyleAdvice; this.detailDomainVersion = getRuntimeRefreshSnapshot("garments").version; this.setData({ item, wornToday: item.wornDates.includes(localDateKey()), initialLoading: false, refreshing: false, adviceSummary: advice?.summary ?? "", adviceTips: advice ? [...advice.scenes, ...advice.pairingTips, ...advice.avoidTips].slice(0, 6) : [], adviceSource: advice ? "来自已保存的 AI 建议" : "" }); } catch (error) { if (requestId !== this.detailRequestId) return; this.setData({ initialLoading: false, refreshing: false, error: error instanceof Error ? error.message : "读取单品失败" }); if (hasData) wx.showToast({ title: "单品刷新失败，已保留当前内容", icon: "none" }); } },
  openMenu() { this.setData({ menuOpen: true }); }, closeMenu() { this.setData({ menuOpen: false }); },
  editItem(this: any) { const item = this.data.item as MiniGarmentDetail | null; if (item) wx.navigateTo({ url: `/pages/wardrobe/edit/index?id=${encodeURIComponent(item.id)}` }); },
  moveItem(this: any) { this.closeMenu(); this.editItem(); },
  switchTab(event: any) { const tab = event.currentTarget.dataset.tab; if (["info", "inspiration", "pairing"].includes(tab)) this.setData({ activeTab: tab }); },
  async toggleWornToday(this: any) {
    const item = this.data.item as MiniGarmentDetail | null;
    if (!item || this.data.wearActioning) return;
    const dateKey = localDateKey();
    const action = this.data.wornToday ? "cancel" : "mark";
    const mutationKey = `${item.id}:${item.revision}:${dateKey}:${action}`;
    if (!this.wearMutation || this.wearMutation.key !== mutationKey) {
      this.wearMutation = { key: mutationKey, id: createClientMutationId() };
    }
    this.setData({ wearActioning: true });
    try {
      const refreshed = action === "mark"
        ? await markGarmentWornOnDate(item.id, item.revision, dateKey, this.wearMutation.id)
        : await cancelGarmentWornOnDate(item.id, item.revision, dateKey, this.wearMutation.id);
      this.wearMutation = null;
      this.setData({ item: refreshed, wornToday: refreshed.wornDates.includes(dateKey) });
      acknowledgeGarmentMutation(this);
      wx.showToast({ title: action === "mark" ? "已记录今天穿着" : "已取消今天穿着记录", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "穿着记录更新失败，请重试", icon: "none" });
    } finally {
      this.setData({ wearActioning: false });
    }
  },
  async generateAdvice(this: any) { const item = this.data.item as MiniGarmentDetail | null; if (!item || this.data.adviceLoading) return; if (!hasMiniMaxKey()) { wx.showToast({ title: "请先在设置中填写 AI 服务密钥", icon: "none" }); return; } this.setData({ adviceLoading: true }); try { const result = await aiEnhance<Record<string, unknown>>("garment-style-advice", { item }); const advice = { summary: typeof result.summary === "string" ? result.summary : "已生成单品建议", scenes: stringList(result.scenes), pairingTips: stringList(result.pairingTips), avoidTips: stringList(result.avoidTips), generatedAt: new Date().toISOString() }; await updateGarment({ id: item.id, expectedRevision: item.revision, currentPayload: { ...item.rawPayload, aiStyleAdvice: advice }, name: item.name, category: item.category, subcategory: item.subcategory || undefined, colors: item.colorsRaw as Record<string, unknown>, seasons: item.seasons, styles: item.styles, temperatureRange: item.temperatureRange, formality: item.formality, warmth: item.warmth, material: item.material, fitGender: item.fitGender, fitNotes: item.fitNotes, locationId: item.locationId, status: item.status, notes: item.notes === "无备注" ? undefined : item.notes, assetMutations: [] }); const refreshed = await fetchGarmentDetail(item.id); this.setData({ item: refreshed, adviceSummary: refreshed.aiStyleAdvice?.summary || advice.summary, adviceTips: refreshed.aiStyleAdvice ? [...refreshed.aiStyleAdvice.scenes, ...refreshed.aiStyleAdvice.pairingTips, ...refreshed.aiStyleAdvice.avoidTips].slice(0, 6) : [...advice.scenes, ...advice.pairingTips, ...advice.avoidTips].slice(0, 6), adviceSource: "已保存的 AI 建议" }); acknowledgeGarmentMutation(this); } catch (error) { wx.showToast({ title: error instanceof Error ? error.message : "生成建议失败", icon: "none" }); } finally { this.setData({ adviceLoading: false }); } },
  previewMedia(this: any, event: any) { const item = this.data.item as MiniGarmentDetail | null; if (!item) return; const urls = [item.imageUrl, ...item.inspirationImages.map((image) => image.imageUrl)].filter(Boolean); (wx as typeof wx & { previewImage: (options: { current?: string; urls: string[] }) => void }).previewImage({ current: event.detail.url || urls[0], urls }); },
  async addInspiration(this: any) { const item = this.data.item as MiniGarmentDetail | null; if (!item) return; try { const images = await chooseImages(["album", "camera"], Math.max(1, 9 - item.inspirationImages.length)); if (!images.length) return; const now = new Date().toISOString(); const references = referenceMetadata(item); const mutations: AssetMutation[] = []; for (const image of images) { const id = createClientMutationId(); const fieldName = `referenceOutfitImage.${id}`; const uploaded = await uploadPreparedImageAssets({ clientMutationId: createClientMutationId(), entityType: "garment", fieldName, originalPath: image.imagePath, processedPath: image.stablePath }); mutations.push(...uploaded.assetMutations); references.push({ id, fieldName, caption: "", createdAt: now, updatedAt: now }); } await saveReferences(item, references, mutations); this.setData({ item: await fetchGarmentDetail(item.id) }); acknowledgeGarmentMutation(this); } catch (error) { wx.showToast({ title: error instanceof Error ? error.message : "添加灵感失败", icon: "none" }); } },
  async removeInspiration(this: any, event: any) { const item = this.data.item as MiniGarmentDetail | null; const id = event.detail.id; if (!item || !id) return; const target = item.inspirationImages.find((image) => image.id === id); if (!target) return; await saveReferences(item, referenceMetadata(item).filter((entry) => entry.id !== id), [{ kind: "remove", fieldName: target.fieldName }]); this.setData({ item: await fetchGarmentDetail(item.id) }); acknowledgeGarmentMutation(this); },
  openDeleteSheet() { this.setData({ deleteSheetOpen: true, menuOpen: false }); }, closeDeleteSheet() { if (!this.data.deleting) this.setData({ deleteSheetOpen: false }); },
  async confirmDelete(this: any) { const item = this.data.item as MiniGarmentDetail | null; if (!item || this.data.deleting) return; this.setData({ deleting: true }); try { await deleteWorkspaceEntity("garments", item.id, item.revision); markRuntimeDomainDirty("garments"); markRuntimeDomainDirty("outfits"); markRuntimeDomainDirty("planning"); wx.showToast({ title: "已删除", icon: "success" }); wx.navigateBack({ delta: 1 }); } catch (error) { wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" }); this.setData({ deleting: false }); } },
});

function referenceMetadata(item: MiniGarmentDetail): ReferenceMetadata[] { return Array.isArray(item.rawPayload.referenceOutfitImages) ? item.rawPayload.referenceOutfitImages.filter((entry): entry is ReferenceMetadata => Boolean(entry && typeof entry === "object" && "id" in entry && "fieldName" in entry)) : []; }
function saveReferences(item: MiniGarmentDetail, referenceOutfitImages: ReferenceMetadata[], assetMutations: AssetMutation[]) { return updateGarment({ id: item.id, expectedRevision: item.revision, currentPayload: item.rawPayload, name: item.name, category: item.category, subcategory: item.subcategory || undefined, colors: item.colorsRaw as Record<string, unknown>, seasons: item.seasons, styles: item.styles, temperatureRange: item.temperatureRange, formality: item.formality, warmth: item.warmth, material: item.material, fitGender: item.fitGender, fitNotes: item.fitNotes, locationId: item.locationId, status: item.status, notes: item.notes === "无备注" ? undefined : item.notes, referenceOutfitImages, assetMutations }); }
function stringList(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : []; }
function acknowledgeGarmentMutation(page: any) { page.detailRequestId = (page.detailRequestId || 0) + 1; markRuntimeDomainDirty("garments"); page.detailDomainVersion = getRuntimeRefreshSnapshot("garments").version; }
function localDateKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
