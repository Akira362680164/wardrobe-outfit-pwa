import type { Platform, SideEffectType } from "../types";

export type GenericMappedOperation =
  | { kind: "click"; parityId: string; callMethod?: string }
  | { kind: "call"; callMethod: string; parityId?: string }
  | { kind: "back" };

export interface GenericActionSpec {
  platform: Platform;
  domain: "wardrobe" | "intake";
  screenId: string;
  actionId: string;
  route: string;
  fixture: string;
  operation?: GenericMappedOperation;
  returnOperation?: GenericMappedOperation;
  sideEffect: SideEffectType;
  serverAssertion?: string;
  source?: string;
  semanticMappingMissing?: true;
  missingReason?: string;
}

type PartialSpec = Omit<GenericActionSpec, "platform" | "domain" | "screenId" | "actionId" | "route" | "fixture" | "sideEffect">;

function mapped(
  platform: Platform,
  domain: GenericActionSpec["domain"],
  screenId: string,
  actionId: string,
  route: string,
  fixture: string,
  sideEffect: SideEffectType,
  details: PartialSpec,
): GenericActionSpec {
  return { platform, domain, screenId, actionId, route, fixture, sideEffect, ...details };
}

function missing(
  platform: Platform,
  domain: GenericActionSpec["domain"],
  screenId: string,
  actionId: string,
  route: string,
  fixture: string,
  sideEffect: SideEffectType,
  missingReason: string,
  serverAssertion?: string,
): GenericActionSpec {
  return { platform, domain, screenId, actionId, route, fixture, sideEffect, serverAssertion, semanticMappingMissing: true, missingReason };
}

const garmentAppRoute = "garment_detail?id={{garment.complete.id}}";
const garmentMiniRoute = "/pages/wardrobe/detail/index?id={{garment.complete.id}}";
const intakeAppRoute = "route.intake.single.item";
const intakeMiniRoute = "/pages/intake/camera/index";
const reviewMiniRoute = "/pages/intake/review/index";

export const wardrobeIntakeActionSpecs: readonly GenericActionSpec[] = [
  mapped("app", "wardrobe", "wardrobe.garment.detail", "garment.detail.back", garmentAppRoute, "garment.complete", "NONE", { operation: { kind: "click", parityId: "parity.app.app.src.components.app.sub.page.top.bar.06136d0714" }, source: "src/components/app-sub-page-top-bar.tsx:35" }),
  mapped("mini", "wardrobe", "wardrobe.garment.detail", "garment.detail.back", garmentMiniRoute, "garment.complete", "NONE", { operation: { kind: "call", callMethod: "navigateBack", parityId: "parity.mini.components.domain.item.detail.shell.10b7ba6751" }, source: "apps/wechat-miniprogram/components/domain/item-detail-shell/index.wxml:3" }),
  mapped("app", "wardrobe", "wardrobe.garment.detail", "garment.detail.more", garmentAppRoute, "garment.complete", "LOCAL_STATE", { operation: { kind: "click", parityId: "parity.app.app.src.components.app.sub.page.top.bar.eb7c5db4cb" }, returnOperation: { kind: "back" }, source: "src/components/app-sub-page-top-bar.tsx:65" }),
  missing("mini", "wardrobe", "wardrobe.garment.detail", "garment.detail.more", garmentMiniRoute, "garment.complete", "LOCAL_STATE", "No mini control represents the APP more menu; openDeleteSheet is a divergent destructive action."),
  mapped("app", "wardrobe", "wardrobe.garment.detail", "garment.detail.edit", garmentAppRoute, "garment.complete", "NONE", { operation: { kind: "click", parityId: "parity.app.app.src.components.garment.detail.3.0.055d5aec7c" }, returnOperation: { kind: "back" }, source: "src/components/garment-detail-3.0.tsx:262" }),
  mapped("mini", "wardrobe", "wardrobe.garment.detail", "garment.detail.edit", garmentMiniRoute, "garment.complete", "NONE", { operation: { kind: "call", callMethod: "editItem", parityId: "parity.mini.pages.wardrobe.detail.81af8d2818" }, returnOperation: { kind: "back" }, source: "apps/wechat-miniprogram/pages/wardrobe/detail/index.wxml:23" }),
  missing("app", "wardrobe", "wardrobe.garment.detail", "garment.detail.rerecognize", garmentAppRoute, "garment.complete", "ASYNC_JOB", "No APP garment-detail control or handler uniquely maps to rerecognition.", "ai-recognition-response-contract"),
  mapped("mini", "wardrobe", "wardrobe.garment.detail", "garment.detail.rerecognize", garmentMiniRoute, "garment.complete", "ASYNC_JOB", { operation: { kind: "call", callMethod: "reRecognize", parityId: "parity.mini.pages.wardrobe.detail.58ff59e195" }, serverAssertion: "ai-recognition-response-contract", source: "apps/wechat-miniprogram/pages/wardrobe/detail/index.wxml:24" }),
  mapped("app", "wardrobe", "wardrobe.garment.detail", "garment.detail.ai-advice", garmentAppRoute, "garment.complete", "ASYNC_JOB", { operation: { kind: "click", parityId: "parity.app.app.src.components.detail.shell.df580c9129" }, serverAssertion: "garment-ai-advice-response-contract", source: "src/components/detail-shell.tsx:394" }),
  mapped("mini", "wardrobe", "wardrobe.garment.detail", "garment.detail.ai-advice", garmentMiniRoute, "garment.complete", "ASYNC_JOB", { operation: { kind: "call", callMethod: "generateAdvice", parityId: "parity.mini.pages.wardrobe.detail.1b530a3c5d" }, serverAssertion: "garment-ai-advice-response-contract", source: "apps/wechat-miniprogram/pages/wardrobe/detail/index.wxml:25" }),
  mapped("app", "wardrobe", "wardrobe.garment.detail", "garment.detail.delete.cancel", garmentAppRoute, "garment.delete_target", "NONE", { operation: { kind: "click", parityId: "parity.app.app.src.components.dialogs.confirm.action.sheet.ab99c876dd" }, source: "src/components/dialogs/confirm-action-sheet.tsx:34" }),
  mapped("mini", "wardrobe", "wardrobe.garment.detail", "garment.detail.delete.cancel", garmentMiniRoute, "garment.delete_target", "NONE", { operation: { kind: "call", callMethod: "closeDeleteSheet", parityId: "parity.mini.pages.wardrobe.detail.56de619f53" }, source: "apps/wechat-miniprogram/pages/wardrobe/detail/index.wxml:109" }),
  mapped("app", "wardrobe", "wardrobe.garment.detail", "garment.detail.delete.confirm", garmentAppRoute, "garment.delete_target", "BACKEND_WRITE", { operation: { kind: "click", parityId: "parity.app.app.src.components.dialogs.confirm.action.sheet.e9c85107f7" }, serverAssertion: "garment-delete-readback", source: "src/components/dialogs/confirm-action-sheet.tsx:35" }),
  mapped("mini", "wardrobe", "wardrobe.garment.detail", "garment.detail.delete.confirm", garmentMiniRoute, "garment.delete_target", "BACKEND_WRITE", { operation: { kind: "call", callMethod: "confirmDelete", parityId: "parity.mini.pages.wardrobe.detail.d4c3e783b7" }, serverAssertion: "garment-delete-readback", source: "apps/wechat-miniprogram/pages/wardrobe/detail/index.wxml:108" }),

  mapped("app", "intake", "intake.select", "intake.select.camera", intakeAppRoute, "garment.complete", "HOST_NATIVE", { operation: { kind: "click", parityId: "parity.app.app.src.components.garment.intake.flow.3e301f728c" }, serverAssertion: "camera-result-contract", source: "src/components/garment-intake-flow.tsx:1854" }),
  mapped("mini", "intake", "intake.select", "intake.select.camera", intakeMiniRoute, "garment.complete", "HOST_NATIVE", { operation: { kind: "call", callMethod: "chooseFromCamera", parityId: "parity.mini.pages.intake.camera.4c0f77bb11" }, serverAssertion: "camera-result-contract", source: "apps/wechat-miniprogram/pages/intake/camera/index.wxml:32" }),
  mapped("app", "intake", "intake.select", "intake.select.album", intakeAppRoute, "garment.complete", "HOST_NATIVE", { operation: { kind: "click", parityId: "parity.app.app.src.components.garment.intake.flow.8b349a35cd" }, serverAssertion: "photo-picker-result-contract", source: "src/components/garment-intake-flow.tsx:1863" }),
  mapped("mini", "intake", "intake.select", "intake.select.album", intakeMiniRoute, "garment.complete", "HOST_NATIVE", { operation: { kind: "call", callMethod: "chooseFromAlbum", parityId: "parity.mini.pages.intake.camera.82c58ca1f0" }, serverAssertion: "photo-picker-result-contract", source: "apps/wechat-miniprogram/pages/intake/camera/index.wxml:35" }),
  mapped("app", "intake", "intake.select", "intake.select.continue", intakeAppRoute, "garment.complete", "OBJECT_UPLOAD", { operation: { kind: "click", parityId: "parity.app.app.src.components.intake.flow.shell.ee3fa5c0d6" }, serverAssertion: "temporary-assets-readback", source: "src/components/intake-flow-shell.tsx:208" }),
  mapped("mini", "intake", "intake.select", "intake.select.continue", intakeMiniRoute, "garment.complete", "OBJECT_UPLOAD", { operation: { kind: "call", callMethod: "goReview", parityId: "parity.mini.pages.intake.camera.f2079c386e" }, serverAssertion: "temporary-assets-readback", source: "apps/wechat-miniprogram/pages/intake/camera/index.wxml:47" }),

  missing("app", "intake", "intake.review", "intake.review.recognize", intakeAppRoute, "garment.complete", "ASYNC_JOB", "Recognition starts from selection flow state and has no dedicated tap action matching the manifest.", "recognition-job-readback"),
  missing("mini", "intake", "intake.review", "intake.review.recognize", reviewMiniRoute, "garment.complete", "ASYNC_JOB", "Recognition is initiated before review; no review-page recognize control exists.", "recognition-job-readback"),
  mapped("app", "intake", "intake.review", "intake.review.save", intakeAppRoute, "garment.complete", "BACKEND_WRITE", { operation: { kind: "click", parityId: "parity.app.app.src.components.intake.flow.shell.ee3fa5c0d6" }, serverAssertion: "garment-batch-create-readback", source: "src/components/intake-flow-shell.tsx:208" }),
  mapped("mini", "intake", "intake.review", "intake.review.save", reviewMiniRoute, "garment.complete", "BACKEND_WRITE", { operation: { kind: "call", callMethod: "saveAll", parityId: "parity.mini.pages.intake.review.0471a40afd" }, serverAssertion: "garment-batch-create-readback", source: "apps/wechat-miniprogram/pages/intake/review/index.wxml:128" }),
  mapped("app", "intake", "intake.review", "intake.review.retry", intakeAppRoute, "garment.ai_unavailable", "ASYNC_JOB", { operation: { kind: "click", parityId: "parity.app.app.src.components.garment.intake.flow.c172dd9aaa" }, serverAssertion: "recognition-retry-readback", source: "src/components/garment-intake-flow.tsx:1295" }),
  mapped("mini", "intake", "intake.review", "intake.review.retry", reviewMiniRoute, "garment.ai_unavailable", "ASYNC_JOB", { operation: { kind: "call", callMethod: "retryRecognition", parityId: "parity.mini.pages.intake.review.e48926fbfd" }, serverAssertion: "recognition-retry-readback", source: "apps/wechat-miniprogram/pages/intake/review/index.wxml:17" }),

  missing("app", "intake", "intake.result", "intake.result.view", intakeAppRoute, "garment.complete", "BACKEND_READ", "APP intake has no separately addressable result screen or view-created-garment control.", "created-garment-readback"),
  missing("mini", "intake", "intake.result", "intake.result.view", "/pages/intake/result/index", "garment.complete", "BACKEND_READ", "openWardrobe does not uniquely implement view-created-garment readback.", "created-garment-readback"),
  missing("app", "intake", "intake.result", "intake.result.done", intakeAppRoute, "garment.complete", "NONE", "APP intake exposes submit state rather than a result-screen done control."),
  missing("mini", "intake", "intake.result", "intake.result.done", "/pages/intake/result/index", "garment.complete", "NONE", "Both addMore and openWardrobe are present; neither is semantically identified as manifest done."),

  mapped("app", "intake", "intake.crop", "intake.crop.rotate", intakeAppRoute, "garment.complete", "LOCAL_STATE", { operation: { kind: "click", parityId: "parity.app.app.src.components.garment.intake.flow.15293a38da.${imageItem.id}" }, source: "src/components/garment-intake-flow.tsx:1184" }),
  missing("mini", "intake", "intake.crop", "intake.crop.rotate", intakeMiniRoute, "garment.complete", "LOCAL_STATE", "Audited mini inventory has no crop rotation control."),
  mapped("app", "intake", "intake.crop", "intake.crop.confirm", intakeAppRoute, "garment.complete", "LOCAL_STATE", { operation: { kind: "click", parityId: "parity.app.app.src.components.garment.intake.flow.4b81be6ee0.${imageItem.id}" }, source: "src/components/garment-intake-flow.tsx:1219" }),
  missing("mini", "intake", "intake.crop", "intake.crop.confirm", intakeMiniRoute, "garment.complete", "LOCAL_STATE", "Audited mini inventory has no crop confirmation control."),

  mapped("app", "intake", "intake.partial-save-confirm", "intake.partial.cancel", intakeAppRoute, "garment.no_image", "NONE", { operation: { kind: "click", parityId: "parity.app.app.src.components.garment.intake.flow.46f80c328e" }, source: "src/components/garment-intake-flow.tsx:881" }),
  missing("mini", "intake", "intake.partial-save-confirm", "intake.partial.cancel", reviewMiniRoute, "garment.no_image", "NONE", "Mini has no partial-save decision state."),
  mapped("app", "intake", "intake.partial-save-confirm", "intake.partial.confirm", intakeAppRoute, "garment.no_image", "BACKEND_WRITE", { operation: { kind: "click", parityId: "parity.app.app.src.components.garment.intake.flow.cabc2ebbf1" }, serverAssertion: "partial-batch-create-readback", source: "src/components/garment-intake-flow.tsx:886" }),
  missing("mini", "intake", "intake.partial-save-confirm", "intake.partial.confirm", reviewMiniRoute, "garment.no_image", "BACKEND_WRITE", "Mini has no save-completed-only confirmation.", "partial-batch-create-readback"),
] as const;

export function wardrobeIntakeMappingCoverage() {
  const mapped = wardrobeIntakeActionSpecs.filter((spec) => !spec.semanticMappingMissing).length;
  return { total: wardrobeIntakeActionSpecs.length, mapped, unmapped: wardrobeIntakeActionSpecs.length - mapped };
}
