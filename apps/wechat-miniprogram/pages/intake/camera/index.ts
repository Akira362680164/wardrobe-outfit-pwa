import { chooseImages, uploadImagesForCreate, type ChosenImage } from "../../../services/assets";
import { colorLabel, recognizeGarmentImages } from "../../../services/ai";
import { createClientMutationId } from "../../../services/workspace";
import { clearCropWorkflow, consumeCropResult, startCropJob, type CropResult } from "../../../stores/crop-job";
import {
  beginIntakeSession,
  endIntakeSession,
  getIntakeKind,
  getIntakeQueue,
  setIntakeQueue,
  updateIntakeQueueItem,
  type IntakeDraft,
  type IntakeKind,
  type IntakeQueueItem,
} from "../../../stores/intake";
import { getCapsuleGeometry } from "../../../utils/capsule-layout";

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
    activePopoverItemId: "",
    popoverStyle: "",
    popoverArrowStyle: "left:50%;transform:translateX(-50%) rotate(45deg);",
    confirmExitOpen: false,
    leaveGuardActive: true,
    navTopRpx: 0,
    navHeightRpx: 64,
    navRightRpx: 0,
  },

  onLoad(this: any, query?: { kind?: string }) {
    const kind: IntakeKind = query?.kind === "wishlist" ? "wishlist" : "garment";
    beginIntakeSession(kind);
    clearCropWorkflow();
    const capsule = getCapsuleGeometry();
    this.setData({
      kind,
      pageTitle: kind === "wishlist" ? "新增种草" : "添加单品",
      emptyText: kind === "wishlist" ? "请拍照或从图库选择商品图片" : "请拍照或从图库选择单品图片",
      nextText: kind === "wishlist" ? "下一步（识别种草）" : "下一步（AI识别）",
      navTopRpx: capsule.topRpx,
      navHeightRpx: capsule.heightRpx,
      navRightRpx: capsule.rightInsetRpx + 12,
      leaveGuardActive: true,
    });
    wx.setNavigationBarTitle({ title: kind === "wishlist" ? "新增种草" : "添加衣物" });
    this.refreshQueue();
  },

  onShow(this: any) {
    const result = consumeCropResult("intake");
    if (result) this.applyCropResult(result);
    else this.refreshQueue();
  },

  applyCropResult(this: any, result: CropResult) {
    if (!result.targetId) return;
    const item = getIntakeQueue().find((entry) => entry.clientItemId === result.targetId);
    if (!item) return;
    updateIntakeQueueItem(item.clientItemId, {
      processedPath: result.processedPath,
      imagePath: result.processedPath,
      cropBox: result.cropBox,
      rotationDeg: result.rotationDeg,
      cropRatio: result.cropRatio,
      status: "selected",
      error: "",
      assetMutations: [],
      draft: { ...item.draft, imagePath: result.processedPath, stablePath: result.processedPath },
    });
    this.setData({ activePopoverItemId: "", popoverStyle: "" });
    this.refreshQueue();
    wx.showToast({ title: "裁切已应用", icon: "success", duration: 1200 });
  },

  async chooseFromAlbum(this: any) {
    this.closePopover();
    await this.chooseImage(["album"]);
  },

  async chooseFromCamera(this: any) {
    this.closePopover();
    await this.chooseImage(["camera"]);
  },

  async chooseImage(this: any, sourceType: Array<"album" | "camera">) {
    if (this.data.selecting) return;
    const remaining = MAX_IMAGES - getIntakeQueue().length;
    if (remaining <= 0) {
      this.setData({ error: "已达到 10 张上限" });
      return;
    }
    this.setData({ selecting: true, error: "" });
    try {
      const images = await chooseImages(sourceType, remaining);
      if (!images.length) return;
      const items = images.map((image) => createQueueItem(image, getIntakeKind()));
      setIntakeQueue([...getIntakeQueue(), ...items].slice(0, MAX_IMAGES));
      this.refreshQueue();
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
        filePath: item.processedPath,
        stablePath: item.sourcePath,
        originalPath: item.sourcePath,
        processedPath: item.processedPath,
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
    const index = Number(event.currentTarget.dataset.index) || 0;
    const item = getIntakeQueue()[index];
    if (!item) return;
    const nextPopoverId = this.data.activePopoverItemId === item.clientItemId ? "" : item.clientItemId;
    this.setData({ currentIndex: index, activePopoverItemId: nextPopoverId, popoverStyle: "" });
    this.refreshQueue();
    if (nextPopoverId) setTimeout(() => this.refreshPopoverPosition(), 0);
  },

  editCurrent(this: any) {
    const item = this.data.current as IntakeQueueItem | null;
    if (!item) return;
    const job = startCropJob({
      target: "intake",
      targetId: item.clientItemId,
      sourcePath: item.sourcePath,
      cropBox: item.cropBox,
      rotationDeg: item.rotationDeg,
      cropRatio: item.cropRatio,
    });
    this.closePopover();
    wx.navigateTo({ url: `/pages/intake/crop/index?jobId=${encodeURIComponent(job.id)}` });
  },

  removeCurrent(this: any) {
    const item = this.data.current as IntakeQueueItem | null;
    if (!item) return;
    const nextQueue = getIntakeQueue().filter((entry) => entry.clientItemId !== item.clientItemId);
    setIntakeQueue(nextQueue);
    this.setData({
      currentIndex: Math.min(this.data.currentIndex, Math.max(0, nextQueue.length - 1)),
      activePopoverItemId: "",
      popoverStyle: "",
      error: "",
    });
    this.refreshQueue();
  },

  closePopover(this: any) {
    if (!this.data.activePopoverItemId && !this.data.popoverStyle) return;
    this.setData({ activePopoverItemId: "", popoverStyle: "" });
  },

  stopTap() {},

  handleThumbScroll(this: any) {
    if (!this.data.activePopoverItemId || this.popoverRefreshPending) return;
    this.popoverRefreshPending = true;
    setTimeout(() => {
      this.popoverRefreshPending = false;
      this.refreshPopoverPosition();
    }, 16);
  },

  cancel(this: any) {
    this.closePopover();
    this.requestExit();
  },

  requestExit(this: any) {
    if (!getIntakeQueue().length) return this.exitNow(false);
    this.setData({ confirmExitOpen: true });
  },

  onGuardBack(this: any) {
    if (this.data.activePopoverItemId) {
      this.closePopover();
      return;
    }
    if (this.data.confirmExitOpen) {
      this.closeExitConfirm();
      return;
    }
    this.requestExit();
  },

  closeExitConfirm(this: any) {
    this.setData({ confirmExitOpen: false });
  },

  confirmExit(this: any) {
    this.setData({ confirmExitOpen: false });
    this.exitNow(true);
  },

  async goReview(this: any) {
    this.closePopover();
    const selected = getIntakeQueue().filter((item) => item.status === "selected" || item.status === "failed");
    if (!selected.length && !getIntakeQueue().some((item) => item.status === "ready")) {
      wx.showToast({ title: "请先选择图片", icon: "none" });
      return;
    }
    if (selected.length) await this.prepareAssets(selected);
    if (!getIntakeQueue().some((item) => item.status === "ready")) return;
    await this.recognizeBeforeReview();
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

  exitNow(this: any, clear: boolean) {
    if (clear) {
      endIntakeSession();
      clearCropWorkflow();
    }
    this.setData({ leaveGuardActive: false, activePopoverItemId: "", popoverStyle: "" });
    setTimeout(() => {
      if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1 });
      else wx.switchTab({ url: getIntakeKind() === "wishlist" ? "/pages/wishlist/index/index" : "/pages/wardrobe/index/index" });
    }, 0);
  },

  refreshQueue(this: any) {
    const queue = getIntakeQueue();
    const currentIndex = Math.min(this.data.currentIndex || 0, Math.max(0, queue.length - 1));
    const activePopoverItemId = queue.some((item) => item.clientItemId === this.data.activePopoverItemId) ? this.data.activePopoverItemId : "";
    this.setData({
      queue,
      currentIndex,
      current: queue[currentIndex] ?? null,
      activePopoverItemId,
      totalCount: queue.length,
      readyCount: queue.filter((item) => item.status === "ready").length,
      failedCount: queue.filter((item) => item.status === "failed").length,
      uploadingCount: queue.filter((item) => item.status === "uploading").length,
    });
    if (activePopoverItemId) setTimeout(() => this.refreshPopoverPosition(), 0);
  },

  refreshPopoverPosition(this: any) {
    const queue = getIntakeQueue();
    const targetIndex = queue.findIndex((item) => item.clientItemId === this.data.activePopoverItemId);
    if (targetIndex < 0) return this.closePopover();
    const query = (wx as typeof wx & { createSelectorQuery: () => any }).createSelectorQuery().in(this);
    query.select(".photo-card").boundingClientRect();
    query.select(".thumb-strip").boundingClientRect();
    query.selectAll(".thumb-wrap").boundingClientRect();
    query.exec((rects: Array<any>) => {
      const card = rects?.[0];
      const strip = rects?.[1];
      const thumb = (rects?.[2] as Array<any> | undefined)?.[targetIndex];
      if (!card || !strip || !thumb) return;
      if (thumb.right <= strip.left || thumb.left >= strip.right) return this.closePopover();
      const bubbleWidth = Math.min(212, card.width - 24);
      const bubbleHeight = 46;
      const midpoint = thumb.left + thumb.width / 2;
      const minLeft = 12;
      const maxLeft = Math.max(minLeft, card.width - bubbleWidth - 12);
      const left = Math.max(minLeft, Math.min(midpoint - card.left - bubbleWidth / 2, maxLeft));
      const arrowLeft = Math.max(16, Math.min(midpoint - card.left - left, bubbleWidth - 16));
      const top = Math.max(8, thumb.top - card.top - bubbleHeight - 6);
      this.setData({
        popoverStyle: `left:${left}px;top:${top}px;width:${bubbleWidth}px;`,
        popoverArrowStyle: `left:${arrowLeft}px;transform:translateX(-50%) rotate(45deg);`,
      });
    });
  },
});

function createQueueItem(image: ChosenImage, kind: IntakeKind): IntakeQueueItem {
  const clientItemId = createClientMutationId();
  const clientMutationId = createClientMutationId();
  const sourcePath = image.stablePath;
  const draft: IntakeDraft = {
    imagePath: sourcePath,
    stablePath: sourcePath,
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
    imagePath: sourcePath,
    stablePath: sourcePath,
    sourcePath,
    processedPath: sourcePath,
    rotationDeg: 0,
    cropRatio: "3:4",
    status: "selected",
    error: "",
    assetMutations: [],
    draft,
  };
}
