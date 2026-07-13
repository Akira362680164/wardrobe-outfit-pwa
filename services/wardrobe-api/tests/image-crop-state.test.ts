import { describe, expect, it } from "vitest";
import { applyAutomaticImageCrop, applyManualImageCrop, failAutomaticImageCrop, imageCropProgress, queueImageCrop, startImageCrop, type ImageCropItemState, type ImageCropSuggestion } from "@wardrobe/cloud-contracts";

const suggestion: ImageCropSuggestion = { clientItemId: "a", cropBox: { x: .1, y: .1, width: .8, height: .8 }, source: "u2netp", confidence: .9, needsReview: false, reasonCodes: [], modelVersion: "test", coordinateSpace: "exif-corrected-normalized-top-left" };
function idle(id = "a"): ImageCropItemState { return { clientItemId: id, revision: 0, cropState: "idle", completed: false }; }

describe("image crop batch state", () => {
  it("accepts out-of-order independent responses once", () => { const a = startImageCrop(queueImageCrop(idle("a")), 1); const b = startImageCrop(queueImageCrop(idle("b")), 1); const doneB = applyAutomaticImageCrop(b, 1, { ...suggestion, clientItemId: "b" }); expect(imageCropProgress([a, doneB])).toEqual({ completed: 1, total: 2 }); const doneA = applyAutomaticImageCrop(a, 1, suggestion); expect(imageCropProgress([doneA, doneB])).toEqual({ completed: 2, total: 2 }); });
  it("manual adjustment invalidates a late automatic result", () => { const pending = startImageCrop(queueImageCrop(idle()), 1); const manual = applyManualImageCrop(pending); expect(applyAutomaticImageCrop(manual, 1, suggestion)).toEqual(manual); });
  it("retry revisions ignore stale responses without duplicate progress", () => { const first = startImageCrop(queueImageCrop(idle()), 1); const retry = startImageCrop(queueImageCrop(first), 2); expect(applyAutomaticImageCrop(retry, 1, suggestion)).toEqual(retry); const done = applyAutomaticImageCrop(retry, 2, suggestion); expect(imageCropProgress([done])).toEqual({ completed: 1, total: 1 }); });
  it("a failure completes only that item and newly added items extend the denominator", () => { const failed = failAutomaticImageCrop(startImageCrop(queueImageCrop(idle("a")), 1), 1, "timeout"); const added = queueImageCrop(idle("b")); expect(imageCropProgress([failed, added])).toEqual({ completed: 1, total: 2 }); });
});
