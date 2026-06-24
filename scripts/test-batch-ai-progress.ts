import { strict as assert } from "node:assert";
import {
  createIntakeField,
  summarizeBatchIntakeItems,
  type BatchIntakeItem,
  type GarmentIntakeDraft,
} from "../src/lib/intake-draft";
import { buildColorInfo } from "../src/lib/color-fields";

const now = "2026-06-11T08:00:00.000Z";

function makeDraft(id: string): GarmentIntakeDraft {
  return {
    id,
    kind: "garment",
    imageDataUrl: "data:image/png;base64,aaa",
    useTransparentImage: createIntakeField(false, "default", "high", { needsReview: false }),
    name: createIntakeField("白衬衫", "ai", "high", { needsReview: false }),
    category: createIntakeField("tops", "ai", "high", { needsReview: false }),
    colors: createIntakeField(buildColorInfo("single", ["白"]), "local", "high", { needsReview: false }),
    seasons: createIntakeField(["spring"], "ai", "medium", { needsReview: true }),
    styles: createIntakeField(["commute"], "ai", "medium", { needsReview: true }),
    formality: createIntakeField(4, "ai", "medium", { needsReview: true }),
    warmth: createIntakeField(2, "ai", "medium", { needsReview: true }),
    locationId: createIntakeField("home", "default", "high", { needsReview: false }),
    status: createIntakeField("active", "default", "high", { needsReview: false }),
    processingIssues: [],
    createdAt: now,
    updatedAt: now,
  };
}

const items: BatchIntakeItem<GarmentIntakeDraft>[] = [
  { id: "1", index: 0, status: "ai_done", draft: makeDraft("d1") },
  { id: "2", index: 1, status: "needs_review", draft: makeDraft("d2") },
  { id: "3", index: 2, status: "failed", draft: makeDraft("d3"), error: "网络失败" },
  { id: "4", index: 3, status: "ai_running", draft: makeDraft("d4") },
];

const summary = summarizeBatchIntakeItems(items);
assert.equal(summary.total, 4, "统计总数");
assert.equal(summary.completed, 3, "failed 也算一个已结束状态");
assert.equal(summary.saveable, 2, "成功和需确认项可保存，失败项保留草稿但不默认保存");
assert.equal(summary.failed, 1, "失败数");
assert.equal(summary.needsReview, 1, "需确认数");
assert.equal(summary.isProcessing, true, "仍有运行中");
assert.equal(summary.canSaveAny, true, "部分失败仍可保存成功项");
assert.equal(summary.progressPercent, 75, "整体进度百分比");

const allDone = summarizeBatchIntakeItems(items.map((item) => item.status === "ai_running" ? { ...item, status: "confirmed" } : item));
assert.equal(allDone.isProcessing, false, "全部结束后不应处于处理中");
assert.equal(allDone.confirmed, 1, "确认数");

console.log("batch ai progress tests passed");
