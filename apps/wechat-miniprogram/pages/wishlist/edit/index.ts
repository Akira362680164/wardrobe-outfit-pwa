import { chooseSingleImage, uploadImageForCreate } from "../../../services/assets";
import { hasMiniMaxKey, recognizeGarmentImage, type AiGarmentTag } from "../../../services/ai";
import { createClientMutationId, createWishlistItem, getWorkspaceReadState } from "../../../services/workspace";

Page({
  data: {
    saving: false,
    recognizing: false,
    name: "",
    category: "tops",
    price: "",
    productUrl: "",
    notes: "",
    imagePath: "",
    aiTag: null as AiGarmentTag | null,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "新增种草" });
  },

  handleNameInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ name: event.detail.value });
  },

  handlePriceInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ price: event.detail.value });
  },

  handleUrlInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ productUrl: event.detail.value });
  },

  handleNotesInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ notes: event.detail.value });
  },

  async chooseImage() {
    if (this.data.saving) return;
    try {
      const imagePath = await chooseSingleImage(["album", "camera"]);
      this.setData({ imagePath });
      if (hasMiniMaxKey()) await this.recognizeWishlistImage(imagePath);
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "选择图片失败", icon: "none" });
    }
  },

  async recognizeWishlistImage(this: any, imagePath: string) {
    this.setData({ recognizing: true });
    try {
      const tag = await recognizeGarmentImage(imagePath);
      this.setData({
        aiTag: tag,
        name: this.data.name || tag.candidateNames[0] || "",
        category: tag.category,
        notes: this.data.notes || tag.notes || "",
      });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "AI 识别失败，可继续手动填写", icon: "none" });
    } finally {
      this.setData({ recognizing: false });
    }
  },

  async saveWishlist() {
    if (this.data.saving) return;
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      wx.showToast({ title: state === "logged_out" ? "请先登录" : "请先配置 API 域名", icon: "none" });
      return;
    }

    const name = this.data.name.trim();
    const priceText = this.data.price.trim();
    const price = priceText ? Number(priceText) : undefined;
    if (!name) {
      wx.showToast({ title: "先填写商品名称", icon: "none" });
      return;
    }
    if (priceText && (!Number.isFinite(price) || (price ?? 0) < 0)) {
      wx.showToast({ title: "价格格式不正确", icon: "none" });
      return;
    }

    this.setData({ saving: true });
    try {
      const clientMutationId = createClientMutationId();
      const assetMutations = this.data.imagePath
        ? await uploadImageForCreate({
            clientMutationId,
            entityType: "wishlistItem",
            image: { filePath: this.data.imagePath },
          })
        : [];
      await createWishlistItem({
        clientMutationId,
        name,
        category: this.data.category,
        subcategory: this.data.aiTag?.subcategory,
        colors: this.data.aiTag?.colors as unknown as Record<string, unknown> | undefined,
        seasons: this.data.aiTag?.seasons,
        styles: this.data.aiTag?.styles,
        aiTag: this.data.aiTag as unknown as Record<string, unknown> | undefined,
        price,
        productUrl: this.data.productUrl.trim() || undefined,
        notes: this.data.notes.trim() || undefined,
        assetMutations,
      });
      wx.showToast({ title: "种草已保存", icon: "success" });
      wx.redirectTo({ url: "/pages/wishlist/index/index" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "保存种草失败", icon: "none" });
      this.setData({ saving: false });
    }
  },
});
