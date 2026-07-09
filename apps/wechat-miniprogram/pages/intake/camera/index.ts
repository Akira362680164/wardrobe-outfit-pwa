import { chooseImages, uploadImagesForCreate, type ChosenImage } from "../../../services/assets";
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
      await this.prepareAssets(items);
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

  clearSelected() {
    clearIntakeDraft();
    this.refreshQueue();
    this.setData({ error: "" });
  },

  cancel() {
    if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1 });
    else wx.switchTab({ url: getIntakeKind() === "wishlist" ? "/pages/wishlist/index/index" : "/pages/wardrobe/index/index" });
  },

  goReview() {
    if (!getIntakeQueue().some((item) => item.status === "ready")) {
      wx.showToast({ title: "请先选择图片", icon: "none" });
      return;
    }
    wx.navigateTo({ url: `/pages/intake/review/index?kind=${getIntakeKind()}` });
  },

  refreshQueue(this: any) {
    const queue = getIntakeQueue();
    this.setData({
      queue,
      totalCount: queue.length,
      readyCount: queue.filter((item) => item.status === "ready").length,
      failedCount: queue.filter((item) => item.status === "failed").length,
      uploadingCount: queue.filter((item) => item.status === "uploading").length,
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
    status: "selected",
    error: "",
    assetMutations: [],
    draft,
  };
}
