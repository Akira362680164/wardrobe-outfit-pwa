import { uploadImageForCreate } from "../../../services/assets";
import { createClientMutationId, createGarment } from "../../../services/workspace";
import { clearIntakeDraft, getIntakeDraft, setIntakeDraft, setLastCreatedGarmentId, type IntakeDraft } from "../../../stores/intake";

Page({
  data: {
    draft: null as IntakeDraft | null,
    saving: false,
    error: "",
    categories: [
      { value: "tops", label: "上装" },
      { value: "pants", label: "裤装" },
      { value: "skirts", label: "半裙" },
      { value: "one_piece", label: "连衣装" },
      { value: "shoes", label: "鞋履" },
      { value: "bags", label: "包袋" },
      { value: "accessories", label: "配饰" },
    ],
    seasons: [
      { value: "all", label: "四季" },
      { value: "spring", label: "春" },
      { value: "summer", label: "夏" },
      { value: "autumn", label: "秋" },
      { value: "winter", label: "冬" },
    ],
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "识别确认" });
    this.setData({ draft: getIntakeDraft() });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  updateName(this: any, event: WechatMiniprogram.InputEvent) {
    this.patchDraft({ name: event.detail.value });
  },

  updateColor(this: any, event: WechatMiniprogram.InputEvent) {
    this.patchDraft({ color: event.detail.value });
  },

  updateNote(this: any, event: WechatMiniprogram.InputEvent) {
    this.patchDraft({ note: event.detail.value });
  },

  chooseCategory(this: any, event: any) {
    this.patchDraft({ category: event.currentTarget.dataset.value });
  },

  chooseSeason(this: any, event: any) {
    this.patchDraft({ season: event.currentTarget.dataset.value });
  },

  patchDraft(this: any, patch: Partial<IntakeDraft>) {
    const next = { ...this.data.draft, ...patch } as IntakeDraft;
    setIntakeDraft(next);
    this.setData({ draft: next, error: "" });
  },

  async save(this: any) {
    const draft = this.data.draft as IntakeDraft | null;
    if (!draft) {
      this.setData({ error: "请先选择图片" });
      return;
    }
    if (!draft.name.trim()) {
      this.setData({ error: "请填写衣物名称" });
      return;
    }

    this.setData({ saving: true, error: "" });
    try {
      const clientMutationId = createClientMutationId();
      const assetMutations = await uploadImageForCreate({
        clientMutationId,
        entityType: "garment",
        image: { filePath: draft.imagePath },
      });
      const entity = await createGarment({
        clientMutationId,
        name: draft.name.trim(),
        category: draft.category,
        color: draft.color.trim() || "未标注",
        season: draft.season,
        note: draft.note.trim(),
        assetMutations,
      });
      clearIntakeDraft();
      setLastCreatedGarmentId(entity.id);
      wx.redirectTo({ url: "/pages/intake/result/index" });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "保存失败，请重试" });
    } finally {
      this.setData({ saving: false });
    }
  },
});
