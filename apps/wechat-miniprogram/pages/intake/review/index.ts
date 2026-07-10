import { MINI_CATEGORY_CATALOG, MINI_SEASON_CATALOG, MINI_STYLE_CATALOG } from "../../../generated/catalogs";
import { colorLabel, recognizeGarmentImages, type AiGarmentTag } from "../../../services/ai";
import { buildSubcategoryChoices, CATEGORY_OPTIONS, isSubcategoryInCategory, normalizeCategoryId } from "../../../services/category-catalog";
import { batchCreateGarments, createWishlistItem, type BatchCreateGarmentInput, type CreateWishlistInput } from "../../../services/workspace";
import {
  getIntakeKind,
  getIntakeQueue,
  setIntakeKind,
  setLastCreatedGarmentId,
  setLastIntakeSaveResult,
  updateIntakeQueueItem,
  type IntakeDraft,
  type IntakeKind,
  type IntakeQueueItem,
  type IntakeQueueItemStatus,
} from "../../../stores/intake";

const intakeCategories = MINI_CATEGORY_CATALOG.map((category) => ({ value: category.id, label: category.label }));

Page({
  data: {
    items: [] as IntakeQueueItem[],
    current: null as IntakeQueueItem | null,
    currentIndex: 0,
    currentPositionText: "",
    currentStatusText: "",
    confidenceText: "--",
    confirmedCount: 0,
    failedCount: 0,
    pendingCount: 0,
    totalCount: 0,
    kind: "garment" as IntakeKind,
    pageTitle: "添加单品",
    recognizedTitle: "已识别 0 件单品",
    draftTitle: "校对衣物草稿",
    saveLabel: "保存 0 件单品",
    recognizing: false,
    saving: false,
    canSave: false,
    error: "",
    categories: intakeCategories,
    subcategoryOptions: buildSubcategoryChoices("tops"),
    seasons: MINI_SEASON_CATALOG,
    styles: MINI_STYLE_CATALOG,
    fitGenders: [
      { value: "unisex", label: "中性" },
      { value: "menswear", label: "男装" },
      { value: "womenswear", label: "女装" },
      { value: "unknown", label: "未判断" },
    ],
  },

  onLoad(this: any, query?: { kind?: string }) {
    const kind: IntakeKind = query?.kind === "wishlist" ? "wishlist" : getIntakeKind();
    setIntakeKind(kind);
    wx.setNavigationBarTitle({ title: kind === "wishlist" ? "种草确认" : "识别确认" });
    this.setData({
      kind,
      pageTitle: kind === "wishlist" ? "新增种草" : "添加单品",
      draftTitle: kind === "wishlist" ? "校对种草草稿" : "校对衣物草稿",
    });
    this.refreshQueue(0);
    void this.ensureRecognition();
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  async ensureRecognition(this: any) {
    const targets = getIntakeQueue().filter((item) => item.status === "ready");
    if (!targets.length) return;

    targets.forEach((item) => updateIntakeQueueItem(item.clientItemId, { status: "recognizing", error: "" }));
    this.refreshQueue(this.data.currentIndex);

    try {
      const results = await recognizeGarmentImages(targets.map((item) => ({
        clientItemId: item.clientItemId,
        stablePath: item.stablePath,
        fallbackName: `${item.clientItemId}.jpg`,
      })));
      for (const result of results) {
        const item = getIntakeQueue().find((entry) => entry.clientItemId === result.clientItemId);
        if (!item) continue;
        if (result.status === "failed") {
          updateIntakeQueueItem(item.clientItemId, { status: "needs_confirm", error: result.error || "AI识别失败，请手工确认后保存" });
          continue;
        }
        updateIntakeQueueItem(item.clientItemId, {
          status: "confirmed",
          error: "",
          draft: draftFromTag(item, result.tag),
        });
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "AI识别失败，请手工确认后保存";
      targets.forEach((item) => updateIntakeQueueItem(item.clientItemId, { status: "needs_confirm", error: message }));
    } finally {
      this.setData({ recognizing: false });
      this.refreshQueue(this.data.currentIndex);
    }
  },

  async retryRecognition(this: any) {
    const item = this.currentQueueItem();
    if (!item || this.data.recognizing || this.data.saving || item.status === "saving") return;
    if (!item.assetMutations.length) {
      this.setData({ error: "图片未上传成功，请返回重选" });
      return;
    }
    updateIntakeQueueItem(item.clientItemId, { status: "ready", error: "" });
    this.refreshQueue(this.data.currentIndex);
    await this.ensureRecognition();
  },

  chooseItem(this: any, event: any) {
    this.refreshQueue(Number(event.currentTarget.dataset.index) || 0);
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

  updateDraftField(this: any, event: WechatMiniprogram.InputEvent) {
    const field = (event as unknown as { currentTarget?: { dataset?: { field?: string } } }).currentTarget?.dataset?.field;
    if (typeof field === "string") this.patchDraft({ [field]: event.detail.value } as Partial<IntakeDraft>);
  },

  updateDraftNumber(this: any, event: any) {
    const field = event.currentTarget.dataset.field;
    const value = Number(event.detail.value);
    if (typeof field !== "string" || !Number.isFinite(value)) return;
    if (field === "minTemp" || field === "maxTemp") {
      const current = this.currentQueueItem()?.draft.temperatureRange ?? {};
      this.patchDraft({ temperatureRange: field === "minTemp" ? { ...current, minC: value } : { ...current, maxC: value } });
      return;
    }
    this.patchDraft({ [field]: value } as Partial<IntakeDraft>);
  },

  chooseCategory(this: any, event: any) {
    const nextCategory = toKnownCategory(String(event.currentTarget.dataset.value || "tops"));
    const item = this.currentQueueItem();
    this.patchDraft({ category: nextCategory, subcategory: item?.draft.category === nextCategory ? item.draft.subcategory : undefined });
  },

  chooseSubcategory(this: any, event: any) {
    const item = this.currentQueueItem();
    if (!item) return;
    const category = toKnownCategory(item.draft.category);
    const value = String(event.currentTarget.dataset.value || "");
    const next = value && isSubcategoryInCategory(category, value) ? value : undefined;
    this.patchDraft({ subcategory: next === item.draft.subcategory ? undefined : next });
  },

  chooseSeason(this: any, event: any) {
    const value = String(event.currentTarget.dataset.value || "all");
    this.patchDraft({ season: value, seasons: value ? [value] : [] });
  },

  toggleStyle(this: any, event: any) {
    const value = String(event.currentTarget.dataset.value || "");
    const current = this.currentQueueItem()?.draft.styles ?? [];
    this.patchDraft({ styles: current.includes(value) ? current.filter((item: string) => item !== value) : [...current, value] });
  },

  chooseFitGender(this: any, event: any) {
    this.patchDraft({ fitGender: String(event.currentTarget.dataset.value || "unisex") });
  },

  patchDraft(this: any, patch: Partial<IntakeDraft>) {
    const item = this.currentQueueItem();
    if (!item) return;
    updateIntakeQueueItem(item.clientItemId, { draft: { ...item.draft, ...patch } });
    this.refreshQueue(this.data.currentIndex);
  },

  confirmCurrent(this: any) {
    const item = this.currentQueueItem();
    if (!item || item.status === "recognizing" || item.status === "saving" || item.status === "saved") return;
    const draft = normalizeDraft(item.draft);
    if (!draft.name) {
      this.setData({ error: getIntakeKind() === "wishlist" ? "请填写商品名称" : "请填写衣物名称" });
      return;
    }
    if (getIntakeKind() === "wishlist" && draft.price) {
      const price = Number(draft.price);
      if (!Number.isFinite(price) || price < 0) {
        this.setData({ error: "价格格式不正确" });
        return;
      }
    }
    if (!item.assetMutations.length) {
      this.setData({ error: "图片未上传成功，请返回重选" });
      return;
    }
    updateIntakeQueueItem(item.clientItemId, { status: "confirmed", error: "", draft });
    this.refreshQueue(this.data.currentIndex + 1);
  },

  async saveAll(this: any) {
    const confirmed = getIntakeQueue().filter((item) => item.status === "confirmed");
    if (!confirmed.length) {
      this.setData({ error: "请至少确认 1 件单品" });
      return;
    }

    confirmed.forEach((item) => updateIntakeQueueItem(item.clientItemId, { status: "saving", error: "" }));
    this.setData({ saving: true, error: "" });
    this.refreshQueue(this.data.currentIndex);

    const kind = getIntakeKind();
    const results = kind === "wishlist" ? await saveWishlistItems(confirmed) : await batchCreateGarments(confirmed.map(toBatchCreateInput));
    const savedIds: string[] = [];
    const failedItemIds: string[] = [];
    for (const result of results) {
      if (result.status === "succeeded") {
        savedIds.push(result.entity.id);
        updateIntakeQueueItem(result.clientItemId, { status: "saved", serverEntityId: result.entity.id, error: "" });
      } else {
        failedItemIds.push(result.clientItemId);
        updateIntakeQueueItem(result.clientItemId, { status: "failed", error: result.error });
      }
    }

    setLastIntakeSaveResult({
      succeeded: savedIds.length,
      failed: failedItemIds.length + getIntakeQueue().filter((item) => item.status === "failed" && !failedItemIds.includes(item.clientItemId)).length,
      savedIds,
      failedItemIds,
    });
    setLastCreatedGarmentId(kind === "garment" ? savedIds[0] ?? "" : "");
    this.setData({ saving: false });
    this.refreshQueue(this.data.currentIndex);
    wx.redirectTo({ url: "/pages/intake/result/index" });
  },

  currentQueueItem(this: any): IntakeQueueItem | null {
    const current = this.data.current as IntakeQueueItem | null;
    if (!current) return null;
    return getIntakeQueue().find((item) => item.clientItemId === current.clientItemId) ?? null;
  },

  refreshQueue(this: any, preferredIndex?: number) {
    const items = getReviewItems();
    const maxIndex = Math.max(items.length - 1, 0);
    const index = Math.min(Math.max(typeof preferredIndex === "number" ? preferredIndex : this.data.currentIndex, 0), maxIndex);
    const current = items[index] ?? null;
    const recognizing = items.some((item) => item.status === "recognizing" || item.status === "ready");
    const saving = this.data.saving || items.some((item) => item.status === "saving");
    const confirmedCount = items.filter((item) => item.status === "confirmed").length;
    const pendingCount = items.filter((item) => item.status === "needs_confirm" || item.status === "ready" || item.status === "recognizing").length;
    this.setData({
      items,
      current,
      currentIndex: index,
      currentPositionText: current ? `${index + 1} / ${items.length}` : "",
      currentStatusText: current ? statusText(current.status) : "",
      confidenceText: confidenceText(current),
      confirmedCount,
      failedCount: getIntakeQueue().filter((item) => item.status === "failed").length,
      pendingCount,
      totalCount: items.length,
      seasons: markSelected(this.data.seasons, current?.draft.seasons?.length ? current.draft.seasons : current?.draft.season ? [current.draft.season] : []),
      subcategoryOptions: buildSubcategoryChoices(toKnownCategory(current?.draft.category), current?.draft.subcategory),
      styles: markSelected(this.data.styles, current?.draft.styles ?? []),
      fitGenders: markSelected(this.data.fitGenders, current?.draft.fitGender ? [current.draft.fitGender] : []),
      recognizedTitle: `${recognizing ? '正在识别' : '已识别'} ${items.length} 件${getIntakeKind() === "wishlist" ? "种草" : "单品"}`,
      saveLabel: `保存 ${confirmedCount} 件${getIntakeKind() === "wishlist" ? "种草" : "单品"}`,
      recognizing,
      canSave: confirmedCount > 0 && pendingCount === 0 && !recognizing && !saving,
      error: "",
    });
  },
});

function getReviewItems(): IntakeQueueItem[] {
  return getIntakeQueue().filter((item) => ["ready", "recognizing", "needs_confirm", "confirmed", "saving", "failed"].includes(item.status));
}

function statusText(status: IntakeQueueItemStatus): string {
  if (status === "recognizing" || status === "ready") return "AI 识别中";
  if (status === "needs_confirm") return "待确认";
  if (status === "confirmed") return "已确认";
  if (status === "saving") return "保存中";
  if (status === "failed") return "失败";
  return "待处理";
}

function confidenceText(item: IntakeQueueItem | null): string {
  const confidence = item?.draft.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return "--";
  const percent = confidence <= 1 ? confidence * 100 : confidence;
  return String(Math.max(0, Math.min(100, Math.round(percent))));
}

function draftFromTag(item: IntakeQueueItem, tag: AiGarmentTag): IntakeDraft {
  const category = toKnownCategory(tag.category || item.draft.category);
  const subcategory = (tag as unknown as { subcategory?: string }).subcategory ?? item.draft.subcategory;
  return {
    ...item.draft,
    name: tag.candidateNames.find(Boolean) ?? item.draft.name,
    category,
    subcategory: isSubcategoryInCategory(category, subcategory) ? subcategory : undefined,
    color: colorLabel(tag.colors),
    season: tag.seasons[0] || item.draft.season || "all",
    seasons: tag.seasons,
    note: tag.notes ?? item.draft.note,
    styles: tag.styles,
    temperatureRange: tag.temperatureRange ?? item.draft.temperatureRange,
    formality: tag.formality ?? item.draft.formality,
    warmth: tag.warmth ?? item.draft.warmth,
    material: tag.material ?? item.draft.material,
    fitGender: tag.fitGender ?? item.draft.fitGender,
    fitNotes: tag.fitNotes ?? item.draft.fitNotes,
    confidence: tag.confidence,
    needsReview: tag.needsReview,
    source: "ai",
    aiTag: tag as unknown as Record<string, unknown>,
  };
}

function normalizeDraft(draft: IntakeDraft): IntakeDraft {
  const category = toKnownCategory(draft.category);
  const subcategory = isSubcategoryInCategory(category, draft.subcategory) ? draft.subcategory : undefined;
  return {
    ...draft,
    category,
    subcategory,
    name: draft.name.trim(),
    color: draft.color.trim() || "未标注",
    seasons: draft.seasons?.length ? draft.seasons : draft.season ? [draft.season] : [],
    note: draft.note.trim(),
    material: draft.material?.trim(),
    fitNotes: draft.fitNotes?.trim(),
    price: draft.price?.trim(),
    productUrl: draft.productUrl?.trim(),
  };
}

function toBatchCreateInput(item: IntakeQueueItem): BatchCreateGarmentInput {
  const draft = normalizeDraft(item.draft);
  return {
    clientItemId: item.clientItemId,
    clientMutationId: item.clientMutationId,
    name: draft.name,
    category: draft.category,
    color: draft.color,
    season: draft.season,
    note: draft.note,
    colors: colorsForDraft(draft),
    seasons: draft.seasons?.length ? draft.seasons : draft.season ? [draft.season] : [],
    styles: draft.styles,
    subcategory: draft.subcategory,
    temperatureRange: draft.temperatureRange,
    formality: draft.formality,
    warmth: draft.warmth,
    material: draft.material,
    fitGender: draft.fitGender,
    fitNotes: draft.fitNotes,
    locationId: draft.locationId,
    status: draft.status,
    aiTag: draft.aiTag,
    assetMutations: item.assetMutations,
  };
}

async function saveWishlistItems(items: IntakeQueueItem[]) {
  const results = [];
  for (const item of items) {
    try {
      const entity = await createWishlistItem(toWishlistCreateInput(item));
      results.push({ clientItemId: item.clientItemId, clientMutationId: item.clientMutationId, status: "succeeded" as const, entity });
    } catch (error) {
      results.push({
        clientItemId: item.clientItemId,
        clientMutationId: item.clientMutationId,
        status: "failed" as const,
        error: error instanceof Error ? error.message : "保存种草失败",
      });
    }
  }
  return results;
}

function toWishlistCreateInput(item: IntakeQueueItem): CreateWishlistInput {
  const draft = normalizeDraft(item.draft);
  const price = draft.price ? Number(draft.price) : undefined;
  return {
    clientMutationId: item.clientMutationId,
    name: draft.name,
    category: draft.category,
    subcategory: draft.subcategory,
    colors: colorsForDraft(draft),
    seasons: draft.seasons?.length ? draft.seasons : draft.season ? [draft.season] : [],
    styles: draft.styles,
    temperatureRange: draft.temperatureRange,
    formality: draft.formality,
    warmth: draft.warmth,
    material: draft.material,
    fitGender: draft.fitGender,
    fitNotes: draft.fitNotes,
    price: Number.isFinite(price) ? price : undefined,
    productUrl: draft.productUrl || undefined,
    status: "interested",
    notes: draft.note,
    aiTag: draft.aiTag,
    assetMutations: item.assetMutations,
  };
}

function colorsForDraft(draft: IntakeDraft): Record<string, unknown> {
  const aiColors = draft.aiTag?.colors as Record<string, unknown> | undefined;
  if (aiColors && draft.color === colorLabel(aiColors as AiGarmentTag["colors"])) return aiColors;
  return { mode: "single", primary: draft.color || "未标注" };
}

function markSelected<T extends { value: string; label: string }>(options: T[], selected: string[]): Array<T & { selected: boolean }> {
  return options.map((option) => ({ ...option, selected: selected.includes(option.value) }));
}

function toKnownCategory(category?: string): string {
  const normalized = normalizeCategoryId(category || "tops");
  return CATEGORY_OPTIONS.some((option) => option.value === normalized) ? normalized : "tops";
}
