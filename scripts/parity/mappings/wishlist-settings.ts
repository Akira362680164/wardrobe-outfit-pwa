import type { GenericAppOperation } from "../adapters/generic-app";
import type { GenericMiniOperation } from "../adapters/generic-mini";
import type { Platform, SideEffectType } from "../types";

export interface GenericActionSpec {
  platform: Platform;
  screenId: string;
  actionId: string;
  route: string;
  fixtureId: string;
  sideEffect: SideEffectType;
  serverAssertion?: string;
  operation?: GenericAppOperation | GenericMiniOperation;
  returnOperation?: GenericAppOperation | GenericMiniOperation;
  source?: string;
  semanticMappingMissing?: string;
}

interface Obligation {
  screenId: string;
  actionId: string;
  fixtureId: string;
  sideEffect: SideEffectType;
  serverAssertion?: string;
}

const obligations: Obligation[] = [
  { screenId: "wishlist.home", actionId: "wishlist.filter", fixtureId: "wishlist.normal", sideEffect: "LOCAL_STATE" },
  { screenId: "wishlist.home", actionId: "wishlist.item.open", fixtureId: "wishlist.normal", sideEffect: "BACKEND_READ", serverAssertion: "wishlist-detail-readback" },
  { screenId: "wishlist.home", actionId: "wishlist.bulk.toggle", fixtureId: "wishlist.normal", sideEffect: "LOCAL_STATE" },
  { screenId: "wishlist.detail", actionId: "wishlist.detail.convert", fixtureId: "wishlist.normal", sideEffect: "LOCAL_STATE" },
  { screenId: "wishlist.detail", actionId: "wishlist.detail.reject", fixtureId: "wishlist.normal", sideEffect: "BACKEND_WRITE", serverAssertion: "wishlist-status-readback" },
  { screenId: "wishlist.detail", actionId: "wishlist.detail.delete", fixtureId: "wishlist.normal", sideEffect: "BACKEND_WRITE", serverAssertion: "wishlist-delete-readback" },
  { screenId: "wishlist.edit", actionId: "wishlist.edit.save", fixtureId: "wishlist.normal", sideEffect: "BACKEND_WRITE", serverAssertion: "wishlist-update-readback" },
  { screenId: "wishlist.edit", actionId: "wishlist.edit.media.add", fixtureId: "wishlist.normal", sideEffect: "HOST_NATIVE", serverAssertion: "media-picker-result-contract" },
  { screenId: "wishlist.purchased", actionId: "wishlist.purchased.open", fixtureId: "wishlist.normal", sideEffect: "BACKEND_READ", serverAssertion: "wishlist-detail-readback" },
  { screenId: "wishlist.purchased", actionId: "wishlist.purchased.garment", fixtureId: "wishlist.normal", sideEffect: "BACKEND_READ", serverAssertion: "converted-garment-readback" },
  { screenId: "wishlist.rejected", actionId: "wishlist.rejected.restore", fixtureId: "wishlist.normal", sideEffect: "BACKEND_WRITE", serverAssertion: "wishlist-status-readback" },
  { screenId: "wishlist.rejected", actionId: "wishlist.rejected.open", fixtureId: "wishlist.normal", sideEffect: "BACKEND_READ", serverAssertion: "wishlist-detail-readback" },
  { screenId: "wishlist.archived", actionId: "wishlist.archived.restore", fixtureId: "wishlist.normal", sideEffect: "BACKEND_WRITE", serverAssertion: "wishlist-status-readback" },
  { screenId: "wishlist.archived", actionId: "wishlist.archived.open", fixtureId: "wishlist.normal", sideEffect: "BACKEND_READ", serverAssertion: "wishlist-detail-readback" },
  { screenId: "wishlist.convert-confirm", actionId: "wishlist.convert.cancel", fixtureId: "wishlist.normal", sideEffect: "NONE" },
  { screenId: "wishlist.convert-confirm", actionId: "wishlist.convert.confirm", fixtureId: "wishlist.normal", sideEffect: "BACKEND_WRITE", serverAssertion: "wishlist-convert-transaction-readback" },
  { screenId: "wardrobe.statistics", actionId: "statistics.period.change", fixtureId: "garment.complete", sideEffect: "LOCAL_STATE" },
  { screenId: "wardrobe.statistics", actionId: "statistics.refresh", fixtureId: "garment.complete", sideEffect: "BACKEND_READ", serverAssertion: "wear-statistics-readback" },
  { screenId: "settings.diagnostics.upload", actionId: "diagnostics.upload.open", fixtureId: "diagnostics.normal", sideEffect: "LOCAL_STATE" },
  { screenId: "settings.diagnostics.upload", actionId: "diagnostics.upload.cancel", fixtureId: "diagnostics.normal", sideEffect: "NONE" },
  { screenId: "settings.diagnostics.upload", actionId: "diagnostics.upload.confirm", fixtureId: "diagnostics.normal", sideEffect: "OBJECT_UPLOAD", serverAssertion: "diagnostic-create-upload-checksum-readback" },
  { screenId: "settings.diagnostics.upload", actionId: "diagnostics.upload.retry", fixtureId: "diagnostics.normal", sideEffect: "OBJECT_UPLOAD", serverAssertion: "diagnostic-retry-idempotency" },
];

const routes: Record<Platform, Record<string, string>> = {
  app: {
    "wishlist.home": "route.wishlist.home",
    "wishlist.detail": "internal.subpage.detail",
    "wishlist.edit": "internal.subpage.add.edit",
    "wishlist.purchased": "route.wishlist.purchased",
    "wishlist.rejected": "route.wishlist.rejected",
    "wishlist.archived": "route.wishlist.archived",
    "wishlist.convert-confirm": "internal.overlay.wishlist.convert-confirm",
    "wardrobe.statistics": "src.components.wear.statistics.view",
    "settings.diagnostics.upload": "settings_home:diagnostic-upload",
  },
  mini: {
    "wishlist.home": "/pages/wishlist/index/index",
    "wishlist.detail": "/pages/wishlist/detail/index?id={{wishlist.normal.id}}",
    "wishlist.edit": "/pages/wishlist/edit/index?id={{wishlist.normal.id}}",
    "wishlist.purchased": "/pages/wishlist/index/index?status=purchased",
    "wishlist.rejected": "/pages/wishlist/index/index?status=rejected",
    "wishlist.archived": "/pages/wishlist/index/index?status=archived",
    "wishlist.convert-confirm": "/pages/wishlist/detail/index?id={{wishlist.normal.id}}",
    "wardrobe.statistics": "/pages/wardrobe/index/index",
    "settings.diagnostics.upload": "/pages/settings/diagnostics/index",
  },
};

type Located = Pick<GenericActionSpec, "operation" | "returnOperation" | "source">;
const tap = (parityId: string, source: string, returnOperation?: GenericAppOperation | GenericMiniOperation): Located => ({
  operation: { kind: "click", parityId } as GenericAppOperation,
  returnOperation: returnOperation ?? { kind: "back" },
  source,
});
const miniTap = (parityId: string, source: string, callMethodFallback?: string): Located => ({
  operation: { kind: "tap", parityId, ...(callMethodFallback ? { callMethodFallback } : {}) },
  returnOperation: { kind: "back" },
  source,
});

const app: Record<string, Located> = {
  "wishlist.filter": tap("parity.app.app.src.components.wishlist.view.2.0.a01176f31e", "src/components/wishlist-view-2.0.tsx:1625", { kind: "checkpoint" }),
  "wishlist.item.open": tap("parity.app.app.src.components.wishlist.view.2.0.f1cd95ffec", "src/components/wishlist-view-2.0.tsx:1148"),
  "wishlist.detail.convert": tap("parity.app.app.src.components.wishlist.view.2.0.200d5034ed", "src/components/wishlist-view-2.0.tsx:1183", { kind: "back" }),
  "wishlist.detail.delete": tap("parity.app.app.src.components.wishlist.view.2.0.a64cb8e7c5", "src/components/wishlist-view-2.0.tsx:1402", { kind: "back" }),
  "wishlist.edit.media.add": tap("parity.app.app.src.components.wishlist.view.2.0.1d1cbe8156", "src/components/wishlist-view-2.0.tsx:957", { kind: "back" }),
  "wishlist.purchased.open": tap("parity.app.app.src.components.wishlist.view.2.0.f1cd95ffec", "src/components/wishlist-view-2.0.tsx:1148"),
  "wishlist.purchased.garment": tap("parity.app.app.src.components.wishlist.view.2.0.8fd5a3e95a.{{wishlist.normal.id}}", "src/components/wishlist-view-2.0.tsx:1306"),
  "wishlist.rejected.restore": tap("parity.app.app.src.components.wishlist.view.2.0.ad16ad2e42", "src/components/wishlist-view-2.0.tsx:1318", { kind: "checkpoint" }),
  "wishlist.rejected.open": tap("parity.app.app.src.components.wishlist.view.2.0.f1cd95ffec", "src/components/wishlist-view-2.0.tsx:1148"),
  "wishlist.archived.restore": tap("parity.app.app.src.components.wishlist.view.2.0.70fac64691", "src/components/wishlist-view-2.0.tsx:1330", { kind: "checkpoint" }),
  "wishlist.archived.open": tap("parity.app.app.src.components.wishlist.view.2.0.f1cd95ffec", "src/components/wishlist-view-2.0.tsx:1148"),
  "wishlist.convert.cancel": tap("parity.app.app.src.components.wishlist.view.2.0.9d134cfa04", "src/components/wishlist-view-2.0.tsx:1234", { kind: "checkpoint" }),
  "wishlist.convert.confirm": tap("parity.app.app.src.components.wishlist.view.2.0.ac69c93ea7", "src/components/wishlist-view-2.0.tsx:1198"),
  "diagnostics.upload.open": tap("parity.app.app.src.components.wardrobe.app.141e00a965", "src/components/wardrobe-app.tsx:4395", { kind: "back" }),
  "diagnostics.upload.cancel": tap("parity.app.app.src.components.wardrobe.app.2730ac63f5", "src/components/wardrobe-app.tsx:4430", { kind: "checkpoint" }),
  "diagnostics.upload.confirm": tap("parity.app.app.src.components.wardrobe.app.3e4ba0eb4e", "src/components/wardrobe-app.tsx:4437", { kind: "back" }),
  "diagnostics.upload.retry": tap("parity.app.app.src.components.wardrobe.app.228be4f8aa", "src/components/wardrobe-app.tsx:4510", { kind: "back" }),
};

const mini: Record<string, Located> = {
  "wishlist.filter": miniTap("parity.mini.pages.wishlist.index.4d1ee0fca3.{{filter.key}}", "apps/wechat-miniprogram/pages/wishlist/index/index.wxml:31"),
  "wishlist.item.open": miniTap("parity.mini.pages.wishlist.index.9bb5b67c4c.{{wishlist.normal.id}}", "apps/wechat-miniprogram/pages/wishlist/index/index.wxml:54", "openDetail"),
  "wishlist.detail.convert": miniTap("parity.mini.pages.wishlist.detail.9bb6c9d939", "apps/wechat-miniprogram/pages/wishlist/detail/index.wxml:19", "togglePurchase"),
  "wishlist.detail.reject": miniTap("parity.mini.pages.wishlist.detail.eafe6523ad", "apps/wechat-miniprogram/pages/wishlist/detail/index.wxml:20", "toggleRejected"),
  "wishlist.detail.delete": miniTap("parity.mini.pages.wishlist.detail.10d92bcd14", "apps/wechat-miniprogram/pages/wishlist/detail/index.wxml:110", "confirmDelete"),
  "wishlist.edit.save": miniTap("parity.mini.pages.wishlist.edit.4c4c5f2b06", "apps/wechat-miniprogram/pages/wishlist/edit/index.wxml:117", "save"),
  "wishlist.purchased.open": miniTap("parity.mini.pages.wishlist.index.9bb5b67c4c.{{wishlist.normal.id}}", "apps/wechat-miniprogram/pages/wishlist/index/index.wxml:54", "openDetail"),
  "wishlist.rejected.restore": miniTap("parity.mini.pages.wishlist.detail.eafe6523ad", "apps/wechat-miniprogram/pages/wishlist/detail/index.wxml:20", "toggleRejected"),
  "wishlist.rejected.open": miniTap("parity.mini.pages.wishlist.index.9bb5b67c4c.{{wishlist.normal.id}}", "apps/wechat-miniprogram/pages/wishlist/index/index.wxml:54", "openDetail"),
  "wishlist.archived.open": miniTap("parity.mini.pages.wishlist.index.9bb5b67c4c.{{wishlist.normal.id}}", "apps/wechat-miniprogram/pages/wishlist/index/index.wxml:54", "openDetail"),
  "wishlist.convert.confirm": miniTap("parity.mini.pages.wishlist.detail.9bb6c9d939", "apps/wechat-miniprogram/pages/wishlist/detail/index.wxml:19", "togglePurchase"),
  "diagnostics.upload.open": miniTap("parity.mini.pages.settings.diagnostics.ca6aee58af", "apps/wechat-miniprogram/pages/settings/diagnostics/index.wxml:9", "showUnavailable"),
};

const knownMissing: Partial<Record<Platform, Record<string, string>>> = {
  app: {
    "wishlist.bulk.toggle": "No APP parity-id implements the manifest bulk-toggle semantic.",
    "wishlist.detail.reject": "Detail action is synthesized through an action model without an action-specific parity-id.",
    "wishlist.edit.save": "ItemEditPageShell save has no action-specific parity-id in the inventory.",
    "statistics.period.change": "WearStatisticsView exposes no period selector.",
    "statistics.refresh": "WearStatisticsView exposes no refresh control.",
  },
  mini: {
    "wishlist.bulk.toggle": "Mini wishlist has no bulk-selection state or control.",
    "wishlist.edit.media.add": "No stable parity-id maps the media picker obligation in the locked inventory.",
    "wishlist.purchased.garment": "Mini detail has no converted-garment navigation control.",
    "wishlist.archived.restore": "Mini has no archived restore action.",
    "wishlist.convert.cancel": "Locked mini source has no conversion confirmation overlay to cancel.",
    "statistics.period.change": "Mini has no registered statistics screen or period selector.",
    "statistics.refresh": "Mini has no registered statistics screen or refresh action.",
    "diagnostics.upload.cancel": "Locked mini source has no diagnostic description overlay.",
    "diagnostics.upload.confirm": "Locked mini source only exposes showUnavailable and cannot confirm upload.",
    "diagnostics.upload.retry": "Locked mini source has no diagnostic failure/retry state.",
  },
};

export function buildWishlistSettingsActionSpecs(): GenericActionSpec[] {
  return obligations.flatMap((obligation) => (["app", "mini"] as const).map((platform) => {
    const located = platform === "app" ? app[obligation.actionId] : mini[obligation.actionId];
    const missing = knownMissing[platform]?.[obligation.actionId];
    if (!located && !missing) throw new Error(`Mapping disposition missing: ${platform}/${obligation.actionId}`);
    return {
      platform,
      ...obligation,
      route: routes[platform][obligation.screenId],
      ...(located ?? { semanticMappingMissing: missing }),
    };
  }));
}

export function summarizeWishlistSettingsMappings(specs = buildWishlistSettingsActionSpecs()) {
  return (["app", "mini"] as const).map((platform) => {
    const platformSpecs = specs.filter((spec) => spec.platform === platform);
    return {
      platform,
      obligations: platformSpecs.length,
      mapped: platformSpecs.filter((spec) => spec.operation).length,
      unmapped: platformSpecs.filter((spec) => spec.semanticMappingMissing).length,
    };
  });
}
