import { chooseImages, uploadImagesForCreate, type ChosenImage } from "../../../services/assets";
import { createClientMutationId } from "../../../services/workspace";
import { clearIntakeDraft, getIntakeQueue, setIntakeQueue, updateIntakeQueueItem, type IntakeDraft, type IntakeQueueItem } from "../../../stores/intake";

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
    error: "",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "添加衣物" });
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
      const items = images.map(createQueueItem);
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
      entityType: "garment",
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
    else wx.switchTab({ url: "/pages/wardrobe/index/index" });
  },

  goReview() {
    if (!getIntakeQueue().some((item) => item.status === "ready")) {
      wx.showToast({ title: "请先选择图片", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/intake/review/index" });
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

function createQueueItem(image: ChosenImage): IntakeQueueItem {
  const clientItemId = createClientMutationId();
  const clientMutationId = createClientMutationId();
  const draft: IntakeDraft = {
    imagePath: image.imagePath,
    stablePath: image.stablePath,
    name: "",
    category: "tops",
    color: "未标注",
    season: "all",
    note: "",
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
