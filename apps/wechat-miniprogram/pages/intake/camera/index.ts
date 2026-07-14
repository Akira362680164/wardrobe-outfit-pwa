import { chooseImages, uploadImagesForCreate, type ChosenImage } from "../../../services/assets";
import { colorLabel, recognizeGarmentImages } from "../../../services/ai";
import { hasMiniMaxKey } from "../../../services/ai";
import { applyCropBoxToOriginal, requestCropSuggestion, rotateOriginalFile } from "../../../services/image-crop";
import { composeNestedCropBoxes } from "../../../generated/image-crop";
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
    autoCropEnabled: false,
    cropCompleted: 0,
    cropTotal: 0,
    cropEditorOpen: false,
    editCropBox: { x: 0, y: 0, width: 1, height: 1 },
    editSourcePath: "",
    editStageStyle: "",
  },

  onLoad(this: any, query?: { kind?: string }) {
    const kind: IntakeKind = query?.kind === "wishlist" ? "wishlist" : "garment";
    const autoCropEnabled = !hasMiniMaxKey();
    if (getIntakeKind() !== kind) clearIntakeDraft();
    setIntakeKind(kind);
    this.setData({
      kind,
      pageTitle: kind === "wishlist" ? "新增种草" : "添加单品",
      emptyText: kind === "wishlist" ? "请拍照或从图库选择商品图片" : "请拍照或从图库选择单品图片",
      nextText: kind === "wishlist" ? "下一步（识别种草）" : "下一步（AI识别）",
      autoCropEnabled,
      ...(autoCropEnabled ? { nextText: "下一步（填写属性）" } : {}),
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
      if (!hasMiniMaxKey()) void this.runAutomaticCrop(items);
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
        filePath: item.processedPath,
        stablePath: item.processedPath,
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
  },

  async editCurrent(this: any) {
    const item = this.data.current as IntakeQueueItem | null;
    if (!item) return;
    const editStageStyle = await cropStageStyle(item.sourcePath);
    this.setData({ cropEditorOpen: true, editCropBox: { ...item.preCropBox }, editSourcePath: item.sourcePath, editStageStyle });
  },

  closeCropEditor(this: any) { this.setData({ cropEditorOpen: false }); },

  startCropGesture(this: any, event: any) {
    const touch = event.touches?.[0]; if (!touch) return;
    const query = (wx as any).createSelectorQuery();
    query.select(".geometry-crop-stage").boundingClientRect((rect: any) => { this.cropGesture = { handle: event.currentTarget.dataset.handle || "move", startX: touch.clientX, startY: touch.clientY, rect, box: { ...this.data.editCropBox } }; }).exec();
  },

  moveCropGesture(this: any, event: any) {
    const touch = event.touches?.[0]; const gesture = this.cropGesture; if (!touch || !gesture?.rect) return;
    const dx = (touch.clientX - gesture.startX) / gesture.rect.width; const dy = (touch.clientY - gesture.startY) / gesture.rect.height; const min = 0.08; let { x, y, width, height } = gesture.box;
    if (gesture.handle === "move") { x = clamp(x + dx, 0, 1 - width); y = clamp(y + dy, 0, 1 - height); }
    else { if (gesture.handle.includes("w")) { const right = x + width; x = clamp(x + dx, 0, right - min); width = right - x; } if (gesture.handle.includes("e")) width = clamp(width + dx, min, 1 - x); if (gesture.handle.includes("n")) { const bottom = y + height; y = clamp(y + dy, 0, bottom - min); height = bottom - y; } if (gesture.handle.includes("s")) height = clamp(height + dy, min, 1 - y); }
    this.setData({ editCropBox: { x, y, width, height } });
  },

  endCropGesture(this: any) { this.cropGesture = null; },

  async confirmCropEditor(this: any) {
    const item = this.data.current as IntakeQueueItem | null; if (!item) return;
    const box = this.data.editCropBox; const cropped = await applyCropBoxToOriginal(item.sourcePath, box);
    updateIntakeQueueItem(item.clientItemId, {
      processedPath: cropped,
      imagePath: cropped,
      status: "selected",
      error: "",
      assetMutations: [],
      draft: { ...item.draft, imagePath: cropped, stablePath: cropped },
      cropState: "manual",
      cropRevision: item.cropRevision + 1,
      cropCompleted: true,
      preCropBox: box,
      preCropRevision: item.preCropRevision + 1,
    });
    this.setData({ cropEditorOpen: false });
    this.refreshQueue();
  },

  async rotateCropSource(this: any, event: any) {
    const item = this.data.current as IntakeQueueItem | null; if (!item) return;
    const degrees = Number(event.currentTarget.dataset.degrees) === 270 ? 270 : 90;
    const rotated = await rotateOriginalFile(item.sourcePath, degrees);
    const editStageStyle = await cropStageStyle(rotated);
    updateIntakeQueueItem(item.clientItemId, { sourcePath: rotated, stablePath: rotated, processedPath: rotated, imagePath: rotated, preCropBox: { x: 0, y: 0, width: 1, height: 1 }, preCropRevision: item.preCropRevision + 1, cropRevision: item.cropRevision + 1, cropState: "manual", cropCompleted: true, draft: { ...item.draft, imagePath: rotated, stablePath: rotated } });
    this.setData({ editSourcePath: rotated, editStageStyle, editCropBox: { x: 0, y: 0, width: 1, height: 1 } }); this.refreshQueue();
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
    wx.showModal({
      title: "退出本次录入？",
      content: "退出后，本次选择的图片和填写内容将被清空。",
      confirmText: "确认退出",
      cancelText: "继续录入",
      success: (result) => { if (result.confirm) { clearIntakeDraft(); this.syncExitGuard(); this.exitNow(); } },
    });
  },

  async goReview(this: any) {
    const selected = getIntakeQueue().filter((item) => item.status === "selected" || item.status === "failed");
    if (!selected.length && !getIntakeQueue().some((item) => item.status === "ready")) {
      wx.showToast({ title: "请先选择图片", icon: "none" });
      return;
    }
    if (selected.length) await this.prepareAssets(selected);
    if (!getIntakeQueue().some((item) => item.status === "ready")) return;
    if (hasMiniMaxKey()) await this.recognizeBeforeReview();
    else getIntakeQueue().forEach((item) => updateIntakeQueueItem(item.clientItemId, { status: "needs_confirm", error: "", draft: { ...item.draft, source: "manual", imagePath: item.processedPath, stablePath: item.processedPath } }));
    this.disableExitGuard();
    wx.navigateTo({ url: `/pages/intake/review/index?kind=${getIntakeKind()}` });
  },

  async runAutomaticCrop(this: any, added: IntakeQueueItem[]) {
    const planned = added.map((item) => ({ id: item.clientItemId, revision: item.cropRevision + 1, sourcePath: item.sourcePath }));
    planned.forEach((entry) => updateIntakeQueueItem(entry.id, { cropState: "queued", cropRevision: entry.revision, cropCompleted: false }));
    this.refreshQueue();
    let cursor = 0;
    const worker = async () => {
      while (cursor < planned.length) {
        const entry = planned[cursor++]!;
        updateIntakeQueueItem(entry.id, { cropState: "processing" }); this.refreshQueue();
        try {
          const response = await requestCropSuggestion({ clientItemId: entry.id, revision: entry.revision, filePath: entry.sourcePath });
          const preview = await applyCropBoxToOriginal(entry.sourcePath, response.suggestion.cropBox);
          const current = getIntakeQueue().find((item) => item.clientItemId === entry.id);
          if (current && current.cropRevision === response.revision && current.cropState !== "manual") updateIntakeQueueItem(entry.id, { processedPath: preview, imagePath: preview, cropState: "applied", cropCompleted: true, draft: { ...current.draft, imagePath: preview, stablePath: preview } });
        } catch {
          const current = getIntakeQueue().find((item) => item.clientItemId === entry.id);
          if (current && current.cropRevision === entry.revision && current.cropState !== "manual") updateIntakeQueueItem(entry.id, { cropState: "failed", cropCompleted: true });
        }
        this.refreshQueue();
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, planned.length) }, worker));
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
          const finalCropBox = composeNestedCropBoxes(item.preCropBox, result.cropNeedsReview ? undefined : result.secondaryCropBox);
          const finalPreview = await applyCropBoxToOriginal(item.sourcePath, finalCropBox).catch(() => item.processedPath);
          updateIntakeQueueItem(item.clientItemId, { status: "confirmed", error: "", processedPath: finalPreview, finalCropBox, draft: {
            ...item.draft,
            imagePath: finalPreview,
            stablePath: finalPreview,
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
    const api = wx as typeof wx & { enableAlertBeforeUnload?: (options: { message: string }) => void; disableAlertBeforeUnload?: () => void };
    if (getIntakeQueue().length) api.enableAlertBeforeUnload?.({ message: "退出本次录入？" });
    else api.disableAlertBeforeUnload?.();
  },

  disableExitGuard() {
    (wx as typeof wx & { disableAlertBeforeUnload?: () => void }).disableAlertBeforeUnload?.();
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
      cropCompleted: queue.filter((item) => item.cropCompleted).length,
      cropTotal: queue.length,
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
    cropState: "idle",
    cropRevision: 0,
    cropCompleted: false,
    preCropBox: { x: 0, y: 0, width: 1, height: 1 },
    preCropRevision: 0,
    draft,
  };
}

function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }

async function cropStageStyle(src: string): Promise<string> {
  const info = await new Promise<WechatMiniprogram.GetImageInfoSuccessCallbackResult>((resolve, reject) => wx.getImageInfo({ src, success: resolve, fail: reject }));
  const windowInfo = wx.getWindowInfo();
  const maxWidth = Math.max(1, windowInfo.windowWidth - 24);
  const maxHeight = Math.max(1, Math.round(windowInfo.screenHeight * 0.72));
  const scale = Math.min(maxWidth / info.width, maxHeight / info.height);
  return `width:${Math.round(info.width * scale)}px;height:${Math.round(info.height * scale)}px`;
}
