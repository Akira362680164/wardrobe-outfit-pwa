import { uploadImageForCreate } from "../../../services/assets";
import { MINI_CATEGORY_CATALOG, MINI_SEASON_CATALOG } from "../../../generated/catalogs";
import { createClientMutationId, createGarment, fetchGarmentDetail } from "../../../services/workspace";
import { clearIntakeDraft, getIntakeDraft, setIntakeDraft, setLastCreatedGarmentId, type IntakeDraft } from "../../../stores/intake";

const intakeCategories = MINI_CATEGORY_CATALOG.map((category) => ({ value: category.id, label: category.label }));

function subcategoriesFor(categoryId: string) {
  return MINI_CATEGORY_CATALOG.find((category) => category.id === categoryId)?.subcategories
    .map((subcategory) => ({ value: subcategory.id, label: subcategory.label })) ?? [];
}

Page({
  data: {
    draft: null as IntakeDraft | null,
    saving: false,
    error: "",
    categories: intakeCategories,
    subcategories: [] as Array<{ value: string; label: string }>,
    seasons: MINI_SEASON_CATALOG,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "识别确认" });
    const draft = getIntakeDraft();
    this.setData({ draft, subcategories: subcategoriesFor(draft?.category ?? "") });
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
    const category = String(event.currentTarget.dataset.value || "tops");
    this.patchDraft({ category, subcategory: undefined });
    this.setData({ subcategories: subcategoriesFor(category) });
  },

  chooseSubcategory(this: any, event: any) {
    this.patchDraft({ subcategory: String(event.currentTarget.dataset.value || "") || undefined });
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
        subcategory: draft.subcategory,
        color: draft.color.trim() || "未标注",
        season: draft.season,
        note: draft.note.trim(),
        colors: draft.aiTag?.colors as Record<string, unknown> | undefined,
        seasons: draft.aiTag?.seasons as string[] | undefined,
        styles: draft.styles,
        aiTag: draft.aiTag,
        assetMutations,
      });
      await fetchGarmentDetail(entity.id);
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
