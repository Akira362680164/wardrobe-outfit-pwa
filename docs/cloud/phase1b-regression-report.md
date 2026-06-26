# Cloud Phase 1B Regression Report

Date: 2026-06-26
Branch: `codex/cloud-phase1-auth`
Baseline commit before B9: `363cb0f v1.1.37 cloud 1B B8 legacy Dexie import`

## Scope

Phase 1B-B9 is a regression and feature-flag closeout, not a new feature build.

Checked:

- Production defaults remain closed unless env vars are explicitly set.
- Internal test build can enable auth, account workspace, and structured sync together.
- Stage 1B local logic regression passes after aligning stale static tests with the current route-driven source.
- Stage 1B report records what is done, what remains local-only, and what must wait for Phase 1C.

## Feature Flag Position

Production defaults remain closed:

```text
NEXT_PUBLIC_CLOUD_AUTH_ENABLED unset/false
NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED unset/false
NEXT_PUBLIC_CLOUD_SYNC_ENABLED unset/false
```

The code paths still require `=== "true"` before enabling auth, account workspace, or cloud sync. The B9 test build used temporary env vars only:

```text
NEXT_PUBLIC_CLOUD_AUTH_ENABLED=true
NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED=true
NEXT_PUBLIC_CLOUD_SYNC_ENABLED=true
NEXT_PUBLIC_WARDROBE_API_BASE_URL=http://111.231.98.86
```

The temporary IP is intentional while `zhengfangapps.cloud` is unavailable before Tencent Cloud ICP/domain readiness.

## Regression Results

Passed:

- `npm run test:logic:all`
- `npm run typecheck`
- `npm run cloud:contracts:typecheck`
- `npm --workspace @wardrobe/wardrobe-api run typecheck`
- `npm run build`
- `NEXT_PUBLIC_CLOUD_AUTH_ENABLED=true NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED=true NEXT_PUBLIC_CLOUD_SYNC_ENABLED=true NEXT_PUBLIC_WARDROBE_API_BASE_URL=http://111.231.98.86 npm run build`

The build still reports existing unused/import/image/hook warnings in older UI files. They are not new B9 failures.

## Stale Test Alignment

During full regression, three static tests were still asserting pre-cleanup source shapes:

- `scripts/test-navigation-and-intake-entry.ts`: updated assertions after old `saveGarmentIntakeDraft` and `switchView` were removed; current source uses route-driven `navigation.openRoute` / `closeCreateFlow`.
- `scripts/test-wardrobe-app-split.ts`: updated assertion to record that `use-wardrobe-capture-queue-controller.ts` remains a future extraction point while current `WardrobeApp` queue state is still inline.
- `scripts/test-color-catalog.ts`: updated assertion after `wardrobe-app.tsx` stopped directly importing unused `COLOR_OPTIONS`; color UI still uses the shared color catalog through form controls.

No production behavior was changed by these three test updates.

## Phase 1B Coverage

Locally covered by tests:

- Per-account workspace naming and registry isolation.
- Workspace generation guard for late responses.
- Cloud-ready state requiring system network plus `/api/health`, `/api/ready`, and valid session.
- Existing local workspace + valid offline authorization can enter offline.
- First-time local workspace requires online bootstrap; no fake blank wardrobe on failed bootstrap.
- Outbox write helpers for garment, outfit, outfitItem, wishlistItem, wearEvent, tripPlan, and outfitPlan.
- Conflict list and local/cloud resolution paths.
- Legacy Dexie import into current account workspace, with idempotent migration state and old DB preservation.
- DataURL stripping from structured cloud payloads.

Not covered by local tests:

- Real Tencent Cloud login/bootstrap/push/pull smoke against `111.231.98.86`.
- Real Android WebView import of a historical user Dexie database.
- Real multi-account manual switching on device.
- Any image asset upload/download, thumbnail download, or COS flow.
- APK packaging for this B9 closeout.

## Known Limits Before Phase 1C

- Structured data sync is implemented behind closed production flags; it is not approved for default production enablement.
- Existing business screens still primarily read the legacy Dexie state. Phase 1B mirrors writes and supports import; it does not complete a full business-read switch to the account workspace.
- Image DataURLs are deliberately excluded from structured sync payloads. Cloud image assets belong to Phase 1C.
- `use-wardrobe-capture-queue-controller.ts` is still not wired into `WardrobeApp`; queue state remains inline and should be simplified in a separate cleanup, not inside 1B cloud sync.
- The test build uses `http://111.231.98.86` as the temporary API base. This must be swapped back to the domain when the Tencent Cloud domain is ready.

## Next Gate

Phase 1B can be considered locally closed after B9 commit, with production cloud workspace/sync flags still off.

Before starting Phase 1C, stop and confirm branch and scope again. Phase 1C should focus on assets API, COS private bucket flow, account-scoped image cache, thumbnail bootstrap, and late-response guards for image upload/download.
