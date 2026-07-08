import { chooseSingleImage } from "../../../services/assets";
import { clearIntakeDraft, getIntakeDraft, setIntakeDraft, type IntakeDraft } from "../../../stores/intake";

Page({
  data: {
    selecting: false,
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
      const draft = {
        imagePath,
        name: "",
        category: "tops",
        color: "未标注",
        season: "all",
        note: "",
      };
      setIntakeDraft(draft);
      this.setData({ draft });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "选择图片失败" });
    } finally {
      this.setData({ selecting: false });
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
