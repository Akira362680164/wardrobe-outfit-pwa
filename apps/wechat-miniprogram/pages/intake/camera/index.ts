import { chooseImages, uploadImagesForCreate, type ChosenImage } from "../../../services/assets";
import { colorLabel, recognizeGarmentImages } from "../../../services/ai";
import { createClientMutationId } from "../../../services/workspace";
import { clearIntakeDraft, getIntakeKind, getIntakeQueue, setIntakeKind, setIntakeQueue, updateIntakeQueueItem, type IntakeDraft, type IntakeKind, type IntakeQueueItem } from "../../../stores/intake";

declare const getCurrentPages: () => unknown[];

const MAX_IMAGES = 10;

Page({
  data: {
    selecting: false,
    queue: [] as IntakeQueueItem[],
    totalCount: 0,
    readyCount: 0,
    failedCount: 0,
    uploadingCount: 0,
    maxCount: MAX_IMAGES,
    kind: "garment" as IntakeKind,
    pageTitle: "添加单品",
    emptyText: "请拍照或从图库选择单品图片",
    nextText: "下一步（AI识别）",
    error: "",
    currentIndex: 0,
    current: null as IntakeQueueItem | null,
    popoverStyle: "",
    popoverArrowStyle: "left:50%;transform:translateX(-50%) rotate(45deg);",
    confirmExitOpen: false,
  },

  onLoad(this: any, query?: { kind?: string }) {
    const kind: IntakeKind = query?.kind === "wishlist" ? "wishlist" : "garment";
    if (getIntakeKind() !== kind) clearIntakeDraft();
    setIntakeKind(kind);
    this.setData({
      kind,
      pageTitle: kind === "wishlist" ? "新增种草" : "添加单品",
      emptyText: kind === "wishlist" ? "请拍照或从图库选择商品图片" : "请拍照或从图库选择单品图片",
      nextText: kind === "wishlist" ? "下一步（识别种草）" : "下一步（AI识别）",
    });
    wx.setNavigationBarTitle({ title: kind === "wishlist" ? "新增种草" : "添加衣物" });
    this.refreshQueue();
    this.syncExitGuard();
  },

  onShow() {
    this.refreshQueue();
  },

  async chooseFromAlbum(this: any) {
    await this.chooseImage(["album"]);
  },

  async chooseFromCamera(this: any) {
    await this.chooseImage(["camera"]);
  },

  async chooseImage(this: any, sourceType: Array<"album" | "camera">) {
    if (this.data.selecting) return;
    const remaining = MAX_IMAGES - getIntakeQueue().length;
    if (remaining <= 0) {
      this.setData({ error: "最多选择 10 张图片" });
      return;
    }
    this.setData({ selecting: true, error: "" });
    try {
      const images = await chooseImages(sourceType, remaining);
      if (!images.length) return;
      const items = images.map((image) => createQueueItem(image, getIntakeKind()));
      setIntakeQueue([...getIntakeQueue(), ...items].slice(0, MAX_IMAGES));
      this.refreshQueue();
      this.syncExitGuard();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "选择图片失败" });
    } finally {
      this.setData({ selecting: false });
      this.refreshQueue();
    }
  },

  async prepareAssets(this: any, items: IntakeQueueItem[]) {
    for (const item of items) updateIntakeQueueItem(item.clientItemId, { status: "uploading", error: "" });
    this.refreshQueue();
    const results = await uploadImagesForCreate({
      entityType: getIntakeKind() === "wishlist" ? "wishlistItem" : "garment",
      images: items.map((item) => ({
        clientItemId: item.clientItemId,
        clientMutationId: item.clientMutationId,
        filePath: item.stablePath,
        stablePath: item.stablePath,
      })),
    });
    for (const result of results) {
      if (!result.clientItemId) continue;
      const status = result.error ? "failed" : "ready";
      updateIntakeQueueItem(result.clientItemId, {
        status,
        error: result.error ?? "",
        assetMutations: result.assetMutations ?? [],
      });
    }
    this.refreshQueue();
  },

  selectCurrent(this: any, event: any) {
    this.setData({ currentIndex: Number(event.currentTarget.dataset.index) || 0 });
    this.refreshQueue();
    this.refreshPopoverPosition();
  },

  async editCurrent(this: any) {
    const item = this.data.current as IntakeQueueItem | null;
    if (!item) return;
    wx.navigateTo({
      url: `/pages/intake/crop/index?clientItemId=${encodeURIComponent(item.clientItemId)}&src=${encodeURIComponent(item.processedPath || item.stablePath)}`,
    });
  },

  removeCurrent(this: any) {
    const item = this.data.current as IntakeQueueItem | null;
    if (!item) return;
    setIntakeQueue(getIntakeQueue().filter((entry) => entry.clientItemId !== item.clientItemId));
    this.setData({ currentIndex: Math.max(0, this.data.currentIndex - 1) });
    this.refreshQueue();
    this.syncExitGuard();
  },

  clearSelected(this: any) {
    clearIntakeDraft();
    this.refreshQueue();
    this.setData({ error: "" });
    this.syncExitGuard();
  },

  cancel(this: any) {
    if (!getIntakeQueue().length) return this.exitNow();
    this.setData({ confirmExitOpen: true });
  },

  closeExitConfirm(this: any) {
    this.setData({ confirmExitOpen: false });
  },

  confirmExit(this: any) {
    clearIntakeDraft();
    this.setData({ confirmExitOpen: false });
    this.syncExitGuard();
    this.exitNow();
  },

  async goReview(this: any) {
    const selected = getIntakeQueue().filter((item) => item.status === "selected" || item.status === "failed");
    if (!selected.length && !getIntakeQueue().some((item) => item.status === "ready")) {
      wx.showToast({ title: "请先选择图片", icon: "none" });
      return;
    }
    if (selected.length) await this.prepareAssets(selected);
    if (!getIntakeQueue().some((item) => item.status === "ready")) return;
    await this.recognizeBeforeReview();
    this.disableExitGuard();
    wx.navigateTo({ url: `/pages/intake/review/index?kind=${getIntakeKind()}` });
  },

  async recognizeBeforeReview(this: any) {
    const targets = getIntakeQueue().filter((item) => item.status === "ready");
    targets.forEach((item) => updateIntakeQueueItem(item.clientItemId, { status: "recognizing", error: "" }));
    this.refreshQueue();
    try {
      const results = await recognizeGarmentImages(targets.map((item) => ({ clientItemId: item.clientItemId, stablePath: item.processedPath, fallbackName: `${item.clientItemId}.jpg` })));
      for (const result of results) {
        const item = getIntakeQueue().find((entry) => entry.clientItemId === result.clientItemId);
        if (!item) continue;
        if (result.status === "failed") {
          updateIntakeQueueItem(item.clientItemId, { status: "needs_confirm", error: result.error || "AI识别失败，请手工确认" });
        } else {
          const tag = result.tag;
          updateIntakeQueueItem(item.clientItemId, { status: "confirmed", error: "", draft: {
            ...item.draft,
            name: tag.candidateNames.find(Boolean) ?? item.draft.name,
            category: tag.category || item.draft.category,
            color: colorLabel(tag.colors),
            season: tag.seasons[0] || item.draft.season,
            seasons: tag.seasons,
            styles: tag.styles,
            note: tag.notes ?? item.draft.note,
            confidence: tag.confidence,
            source: "ai",
            aiTag: tag as unknown as Record<string, unknown>,
          } });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI识别失败，请手工确认";
      targets.forEach((item) => updateIntakeQueueItem(item.clientItemId, { status: "needs_confirm", error: message }));
    }
    this.refreshQueue();
  },

  exitNow() {
    if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1 });
    else wx.switchTab({ url: getIntakeKind() === "wishlist" ? "/pages/wishlist/index/index" : "/pages/wardrobe/index/index" });
  },

  syncExitGuard() {
    // 业务确认统一由 ui-confirm-sheet 提供，避免微信原生确认页遮挡页面。
  },

  disableExitGuard() {
    // 保留方法名兼容已有流程；不注册微信原生离开确认。
  },

  refreshQueue(this: any) {
    const queue = getIntakeQueue();
    const currentIndex = Math.min(this.data.currentIndex || 0, Math.max(0, queue.length - 1));
    this.setData({
      queue,
      currentIndex,
      current: queue[currentIndex] ?? null,
      totalCount: queue.length,
      readyCount: queue.filter((item) => item.status === "ready").length,
      failedCount: queue.filter((item) => item.status === "failed").length,
      uploadingCount: queue.filter((item) => item.status === "uploading").length,
    });
    setTimeout(() => this.refreshPopoverPosition(), 0);
  },

  refreshPopoverPosition(this: any) {
    if (!this.data.current || !this.data.queue.length) {
      this.setData({ popoverStyle: "", popoverArrowStyle: "left:50%;transform:translateX(-50%) rotate(45deg);" });
      return;
    }
    const query = (wx as typeof wx & { createSelectorQuery: () => any }).createSelectorQuery().in(this);
    query.select(".photo-card").boundingClientRect();
    query.selectAll(".thumb-wrap").boundingClientRect();
    query.exec((rects: Array<any>) => {
      const card = rects?.[0];
      const thumbs = rects?.[1] as Array<any> | undefined;
      const thumb = thumbs?.[this.data.currentIndex];
      if (!card || !thumb) return;
      const bubbleWidth = Math.min(card.width - 24, 250);
      const midpoint = thumb.left + thumb.width / 2;
      const left = Math.max(card.left + 12, Math.min(midpoint - bubbleWidth / 2, card.right - bubbleWidth - 12));
      const arrowLeft = Math.max(16, Math.min(midpoint - left, bubbleWidth - 16));
      const bubbleHeight = 58;
      const top = Math.max(card.top + 8, thumb.top - bubbleHeight - 12);
      this.setData({
        popoverStyle: `left:${left}px;top:${top}px;width:${bubbleWidth}px;transform:none;`,
        popoverArrowStyle: `left:${arrowLeft}px;transform:translateX(-50%) rotate(45deg);`,
      });
    });
  },
});

function createQueueItem(image: ChosenImage, kind: IntakeKind): IntakeQueueItem {
  const clientItemId = createClientMutationId();
  const clientMutationId = createClientMutationId();
  const draft: IntakeDraft = {
    imagePath: image.imagePath,
    stablePath: image.stablePath,
    name: "",
    category: "tops",
    color: "未标注",
    season: "all",
    seasons: [],
    note: "",
    styles: [],
    temperatureRange: { minC: 10, maxC: 25 },
    formality: 3,
    warmth: 2,
    material: "",
    fitGender: "unisex",
    fitNotes: "",
    locationId: "home",
    status: kind === "wishlist" ? "interested" : "active",
    price: "",
    productUrl: "",
    source: "manual",
  };
  return {
    clientItemId,
    clientMutationId,
    imagePath: image.imagePath,
    stablePath: image.stablePath,
    sourcePath: image.imagePath,
    processedPath: image.stablePath,
    status: "selected",
    error: "",
    assetMutations: [],
    draft,
  };
}
