import { chooseSingleImage } from "../../../services/assets";
import { setIntakeDraft } from "../../../stores/intake";

Page({
  data: {
    selecting: false,
    error: "",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "添加衣物" });
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
      setIntakeDraft({
        imagePath,
        name: "",
        category: "tops",
        color: "未标注",
        season: "all",
        note: "",
      });
      wx.navigateTo({ url: "/pages/intake/review/index" });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "选择图片失败" });
    } finally {
      this.setData({ selecting: false });
    }
  },
});
