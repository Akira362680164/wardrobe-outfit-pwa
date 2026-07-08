import { chooseSingleImage } from "../../../services/assets";
import { colorLabel, hasMiniMaxKey, recognizeGarmentImage } from "../../../services/ai";
import { clearIntakeDraft, getIntakeDraft, setIntakeDraft, type IntakeDraft } from "../../../stores/intake";

Page({
  data: {
    selecting: false,
    recognizing: false,
    draft: null as IntakeDraft | null,
    error: "",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "添加衣物" });
    this.setData({ draft: getIntakeDraft() });
  },

  onShow() {
    this.setData({ draft: getIntakeDraft() });
  },

  async chooseFromAlbum(this: any) {
    await this.chooseImage(["album"]);
  },

  async chooseFromCamera(this: any) {
    await this.chooseImage(["camera"]);
  },

  async chooseImage(this: any, sourceType: Array<"album" | "camera">) {
    if (this.data.selecting) return;
    this.setData({ selecting: true, error: "" });
    try {
      const imagePath = await chooseSingleImage(sourceType);
      const draft: IntakeDraft = {
        imagePath,
        name: "",
        category: "tops",
        color: "未标注",
        season: "all",
        note: "",
        source: "manual",
      };
      setIntakeDraft(draft);
      this.setData({ draft });
      if (hasMiniMaxKey()) await this.recognizeDraft(imagePath);
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "选择图片失败" });
    } finally {
      this.setData({ selecting: false });
    }
  },

  async recognizeDraft(this: any, imagePath: string) {
    this.setData({ recognizing: true });
    try {
      const tag = await recognizeGarmentImage(imagePath);
      const draft: IntakeDraft = {
        imagePath,
        name: tag.candidateNames[0] ?? "",
        category: tag.category,
        color: colorLabel(tag.colors),
        season: tag.seasons[0] ?? "all",
        note: tag.notes ?? "",
        styles: tag.styles,
        confidence: tag.confidence,
        needsReview: tag.needsReview,
        source: "ai",
        aiTag: tag as unknown as Record<string, unknown>,
      };
      setIntakeDraft(draft);
      this.setData({ draft });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "AI 识别失败，可继续人工录入" });
    } finally {
      this.setData({ recognizing: false });
    }
  },

  clearSelected() {
    clearIntakeDraft();
    this.setData({ draft: null, error: "" });
  },

  goReview() {
    if (!this.data.draft) {
      this.setData({ error: "请先选择图片" });
      return;
    }
    wx.navigateTo({ url: "/pages/intake/review/index" });
  },
});
