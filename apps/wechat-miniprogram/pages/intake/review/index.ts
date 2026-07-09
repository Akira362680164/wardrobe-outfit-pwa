import { colorLabel, recognizeGarmentImages, type AiGarmentTag } from "../../../services/ai";
import { batchCreateGarments, type BatchCreateGarmentInput } from "../../../services/workspace";
import {
  getIntakeQueue,
  setLastCreatedGarmentId,
  setLastIntakeSaveResult,
  updateIntakeQueueItem,
  type IntakeDraft,
  type IntakeQueueItem,
  type IntakeQueueItemStatus,
} from "../../../stores/intake";

Page({
  data: {
    items: [] as IntakeQueueItem[],
    current: null as IntakeQueueItem | null,
    currentIndex: 0,
    currentPositionText: "",
    currentStatusText: "",
    confirmedCount: 0,
    failedCount: 0,
    pendingCount: 0,
    totalCount: 0,
    recognizing: false,
    saving: false,
    canSave: false,
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

  onLoad(this: any) {
    wx.setNavigationBarTitle({ title: "识别确认" });
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
          updateIntakeQueueItem(item.clientItemId, { status: "failed", error: result.error });
          continue;
        }
        updateIntakeQueueItem(item.clientItemId, {
          status: "needs_confirm",
          error: "",
          draft: draftFromTag(item, result.tag),
        });
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "批量识别失败，请手动填写或稍后重试";
      targets.forEach((item) => updateIntakeQueueItem(item.clientItemId, { status: "failed", error: message }));
    } finally {
      this.setData({ recognizing: false });
      this.refreshQueue(this.data.currentIndex);
    }
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

  chooseCategory(this: any, event: any) {
    this.patchDraft({ category: String(event.currentTarget.dataset.value || "tops") });
  },

  chooseSeason(this: any, event: any) {
    this.patchDraft({ season: String(event.currentTarget.dataset.value || "all") });
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
      this.setData({ error: "请填写衣物名称" });
      return;
    }
    if (!item.assetMutations.length) {
      this.setData({ error: "图片未上传成功，请返回重选或跳过此项" });
      return;
    }
    updateIntakeQueueItem(item.clientItemId, { status: "confirmed", error: "", draft });
    this.refreshQueue(this.data.currentIndex + 1);
  },

  skipCurrent(this: any) {
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

    const results = await batchCreateGarments(confirmed.map(toBatchCreateInput));
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
    setLastCreatedGarmentId(savedIds[0] ?? "");
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
      confirmedCount,
      failedCount: getIntakeQueue().filter((item) => item.status === "failed").length,
      pendingCount,
      totalCount: items.length,
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
  if (status === "failed") return "失败/可跳过";
  return "待处理";
}

function draftFromTag(item: IntakeQueueItem, tag: AiGarmentTag): IntakeDraft {
  return {
    ...item.draft,
    name: tag.candidateNames.find(Boolean) ?? item.draft.name,
    category: tag.category || item.draft.category,
    color: colorLabel(tag.colors),
    season: tag.seasons[0] || item.draft.season || "all",
    note: tag.notes ?? item.draft.note,
    styles: tag.styles,
    confidence: tag.confidence,
    needsReview: tag.needsReview,
    source: "ai",
    aiTag: tag as unknown as Record<string, unknown>,
  };
}

function normalizeDraft(draft: IntakeDraft): IntakeDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    color: draft.color.trim() || "未标注",
    note: draft.note.trim(),
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
    seasons: draft.season ? [draft.season] : [],
    styles: draft.styles,
    aiTag: draft.aiTag,
    assetMutations: item.assetMutations,
  };
}

function colorsForDraft(draft: IntakeDraft): Record<string, unknown> {
  const aiColors = draft.aiTag?.colors as Record<string, unknown> | undefined;
  if (aiColors && draft.color === colorLabel(aiColors as AiGarmentTag["colors"])) return aiColors;
  return { mode: "single", primary: draft.color || "未标注" };
}
