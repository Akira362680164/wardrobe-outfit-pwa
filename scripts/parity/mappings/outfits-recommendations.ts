import type { GenericAppOperation } from "../adapters/generic-app";
import type { GenericMiniOperation } from "../adapters/generic-mini";
import type { DomainManifest, Platform, SideEffectType } from "../types";

export interface GenericActionSpec {
  id: string;
  domain: string;
  screenId: string;
  stateId: string;
  actionId: string;
  platform: Platform;
  route: string;
  fixtureId: string;
  operation: GenericAppOperation | GenericMiniOperation | { kind: "semanticMappingMissing" };
  returnOperation?: GenericAppOperation | GenericMiniOperation;
  sideEffect: SideEffectType;
  serverAssertion?: string;
  semanticMappingMissing?: string;
}

type Mapping = {
  app?: GenericAppOperation;
  mini?: GenericMiniOperation;
  returnApp?: GenericAppOperation;
  returnMini?: GenericMiniOperation;
};

const P = {
  appCalendar: "parity.app.app.src.components.outfit.planning.calendar.view.",
  appDay: "parity.app.app.src.components.outfit.plan.day.card.",
  appOutfits: "parity.app.app.src.components.outfit.list.view.",
  appPacking: "parity.app.app.src.components.plan.packing.checklist.view.",
  miniCalendar: "parity.mini.pages.outfits.calendar.",
  miniOutfits: "parity.mini.pages.outfits.index.",
  miniDetail: "parity.mini.pages.outfits.detail.",
  miniCompose: "parity.mini.pages.outfits.compose.",
  miniTrip: "parity.mini.pages.trips.detail.",
  miniTripEdit: "parity.mini.pages.trips.edit.",
} as const;

const mappings: Record<string, Mapping> = {
  "outfits.calendar.back": { mini: { kind: "tap", parityId: `${P.miniCalendar}987cc092d8`, callMethodFallback: "goBack" } },
  "outfits.calendar.previous-month": {
    app: { kind: "click", parityId: `${P.appCalendar}cf2a254c24` },
    mini: { kind: "tap", parityId: `${P.miniCalendar}6066ece4a3`, callMethodFallback: "shiftMonth", fallbackArgs: { currentTarget: { dataset: { delta: "prev" } } } },
  },
  "outfits.calendar.next-month": {
    app: { kind: "click", parityId: `${P.appCalendar}60a1ddd8b9` },
    mini: { kind: "tap", parityId: `${P.miniCalendar}95b20bf679`, callMethodFallback: "shiftMonth", fallbackArgs: { currentTarget: { dataset: { delta: "next" } } } },
  },
  "outfits.calendar.select-date": {
    app: { kind: "click", parityId: `${P.appCalendar}1803ec14dd.2026-07-15` },
    mini: { kind: "tap", parityId: `${P.miniCalendar}59b1bf6c38.2026-07-15`, callMethodFallback: "selectDate", fallbackArgs: { currentTarget: { dataset: { date: "2026-07-15" } } } },
  },
  "outfits.calendar.add-plan": {
    app: { kind: "click", parityId: `${P.appCalendar}e7e2007f8b` },
    mini: { kind: "tap", parityId: `${P.miniCalendar}0d04423c45`, callMethodFallback: "openAddPlanSheet" },
    returnApp: { kind: "back" }, returnMini: { kind: "back" },
  },
  "outfits.calendar.mark-worn": {
    app: { kind: "click", parityId: `${P.appDay}1560441caa` },
    mini: { kind: "tap", parityId: `${P.miniCalendar}a5b2ea1a16`, callMethodFallback: "handlePrimaryAction" },
  },
  "outfits.calendar.cancel-worn": {
    app: { kind: "click", parityId: `${P.appDay}297ab020da` },
    mini: { kind: "tap", parityId: `${P.miniCalendar}a5b2ea1a16`, callMethodFallback: "handlePrimaryAction" },
  },
  "outfits.calendar.open": {
    app: { kind: "click", parityId: `${P.appOutfits}5f851a498b` },
    mini: { kind: "tap", parityId: `${P.miniOutfits}5e36a26692`, callMethodFallback: "openCalendar" },
    returnApp: { kind: "back" }, returnMini: { kind: "back" },
  },
  "outfits.detail.mark-worn": {
    app: { kind: "click", parityId: `${P.appOutfits}1f793c0f2c` },
    mini: { kind: "tap", parityId: `${P.miniDetail}a6ffebe767`, callMethodFallback: "toggleTodayWorn" },
  },
  "outfits.compose.save": {
    mini: { kind: "tap", parityId: `${P.miniCompose}ad8860d1a0`, callMethodFallback: "saveOutfit" },
  },
  "plans.detail.edit": {
    mini: { kind: "tap", parityId: `${P.miniTrip}638c102bc3`, callMethodFallback: "editPlan" },
    returnMini: { kind: "back" },
  },
  "plans.form.save": {
    mini: { kind: "tap", parityId: `${P.miniTripEdit}d9ed31253f`, callMethodFallback: "save" },
  },
  "plans.form.back": {
    mini: { kind: "tap", parityId: `${P.miniTripEdit}7c23ce8865`, callMethodFallback: "goBack" },
  },
  "outfits.edit.save": {
    app: { kind: "click", parityId: `${P.appOutfits}a91e4277f6` },
  },
  "outfits.edit.back": {
    app: { kind: "click", parityId: `${P.appOutfits}cb3f420db8` },
  },
  "outfits.image.pick": {
    app: { kind: "click", parityId: `${P.appOutfits}5d3f29e2cd` },
  },
  "outfits.image.save": {
    app: { kind: "click", parityId: `${P.appOutfits}46cea66824` },
  },
  "outfits.image.note-save": {
    app: { kind: "click", parityId: `${P.appOutfits}822ac5a1bc` },
  },
  "plans.packing.toggle": {
    app: { kind: "click", parityId: `${P.appPacking}714a3e5eb0.{packingItemId}` },
    mini: { kind: "tap", parityId: `${P.miniTrip}packing.toggle.{packingItemId}`, callMethodFallback: "togglePacking", fallbackArgs: { currentTarget: { dataset: { id: "{packingItemId}" } } } },
  },
  "plans.packing.refresh": {
    mini: { kind: "callMethod", method: "loadPlan" },
  },
};

const TARGET_DOMAINS = new Set(["outfits", "recommendations"]);

function routeFor(platform: Platform, screen: DomainManifest["screens"][number]): string {
  return screen[platform].routes[0] ?? "";
}

export function createOutfitsRecommendationsSpecs(manifests: DomainManifest[]): GenericActionSpec[] {
  const specs: GenericActionSpec[] = [];
  for (const manifest of manifests) {
    if (!TARGET_DOMAINS.has(manifest.domain)) continue;
    for (const screen of manifest.screens) {
      for (const action of screen.requiredActions) {
        for (const platform of action.requiredOn) {
          if (action.notApplicable?.[platform]) continue;
          const mapping = mappings[action.id];
          const operation = mapping?.[platform];
          const reason = operation ? undefined : `No reliable ${platform} parity-id/callMethod mapping for ${action.id}`;
          specs.push({
            id: `${screen.id}:${action.id}:${platform}`,
            domain: screen.domain,
            screenId: screen.id,
            stateId: screen.states[0]?.id ?? "default",
            actionId: action.id,
            platform,
            route: routeFor(platform, screen),
            fixtureId: screen.states[0]?.fixture ?? screen.fixtures[0] ?? "account.empty",
            operation: operation ?? { kind: "semanticMappingMissing" },
            ...(platform === "app" && mapping?.returnApp ? { returnOperation: mapping.returnApp } : {}),
            ...(platform === "mini" && mapping?.returnMini ? { returnOperation: mapping.returnMini } : {}),
            sideEffect: action.sideEffect,
            ...(action.serverAssertion ? { serverAssertion: action.serverAssertion } : {}),
            ...(reason ? { semanticMappingMissing: reason } : {}),
          });
        }
      }
    }
  }
  return specs.sort((a, b) => a.id.localeCompare(b.id));
}

export function summarizeMappings(specs: GenericActionSpec[]): { mapped: number; unmapped: number; byPlatform: Record<Platform, { mapped: number; unmapped: number }> } {
  const summary = { mapped: 0, unmapped: 0, byPlatform: { app: { mapped: 0, unmapped: 0 }, mini: { mapped: 0, unmapped: 0 } } };
  for (const spec of specs) {
    const key = spec.semanticMappingMissing ? "unmapped" : "mapped";
    summary[key] += 1;
    summary.byPlatform[spec.platform][key] += 1;
  }
  return summary;
}
