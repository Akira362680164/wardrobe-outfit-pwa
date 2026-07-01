# Legacy Script Mapping

Last updated: 2026-07-01

## Status

Status | Meaning
---|---
MIGRATED | Moved to new tests/ directory under matching layer
SUPERSEDED | Replaced by new test with different approach
RETAINED | Still useful, registered in manifest as UNCLASSIFIED
DEPRECATED | Will be removed in v2.1.4, kept with warning
UNCLASSIFIED | Not yet reviewed

## Subagent B Scripts (Contract/Old Assertions)

| Old Script | Status | New Test ID | Notes |
|---|---|---|---|
| scripts/test-component-reuse-contract.ts | RETAINED | — | Still used by test:logic:component-reuse |
| scripts/test-shared-item-shells.ts | RETAINED | — | Still used by test:logic:shared-item-shells |
| scripts/test-delete-cascade-regression.ts | RETAINED | — | Regression test |
| scripts/test-online-only-purge.ts | RETAINED | — | Still used by test:logic:online-only-purge |
| scripts/test-auth-client-shell.ts | RETAINED | — | Still used by test:logic:auth-client-shell |
| scripts/test-detail-shell-ui.ts | RETAINED | — | Still used by test:logic:detail-shell |
| scripts/test-item-wishlist-edit-recognition-layout.ts | RETAINED | — | Still used |
| scripts/test-real-user-zip-contract.ts | SUPERSEDED | — | Deleted in public export cleanup |
| scripts/test-ai-intake-live-contract.ts | DEPRECATED | contract:ai-intake | Keep as reference until v2.1.4 |
| scripts/test-intake-field-contract.ts | RETAINED | — | Still used |
| scripts/test-pants-category-ai-contract.ts | RETAINED | — | Still used |
| scripts/test-diagnostic-events.ts | RETAINED | — | Still used |
| scripts/test-latest-backup-contract.ts | RETAINED | — | Still used |
| scripts/test-latest-backup-native-security.ts | RETAINED | — | Still used |
| scripts/test-latest-backup-restore-roundtrip.ts | RETAINED | — | Still used |
| scripts/test-long-term-backup.ts | RETAINED | — | Still used |
| scripts/test-garment-intake-confirm-contract.ts | RETAINED | — | Still used |
| scripts/test-wishlist-intake-confirm-contract.ts | RETAINED | — | Still used |
| scripts/test-outfit-intake-confirm-contract.ts | RETAINED | — | Still used |
| scripts/test-intake-fullscreen-layout.ts | RETAINED | — | Still used |
| scripts/test-sync-fix-verification.ts | RETAINED | — | Still used |

## Subagent C Scripts (Pure Function/Unit)

| Old Script | Status | New Test ID | Notes |
|---|---|---|---|
| scripts/test-cropper-math.ts | RETAINED | — | Pure function, still active |
| scripts/test-recommendations.ts | RETAINED | — | Core logic test |
| scripts/test-color-catalog.ts | RETAINED | — | Still used |
| scripts/test-wear-statistics.ts | RETAINED | — | Still used |
| scripts/test-outfit-cover-consistency.ts | RETAINED | — | Still used |
| scripts/test-carousel-logic.ts | RETAINED | — | Still used |
| scripts/test-garment-image-source.ts | RETAINED | — | Still used |
| scripts/test-temperature-confidence-global.ts | RETAINED | — | Still used |
| scripts/test-batch-ai-progress.ts | RETAINED | — | Still used |
| scripts/test-color-labels.ts | RETAINED | — | Still used |
| scripts/test-intake-draft.ts | RETAINED | — | Still used |
| scripts/test-outfit-calendar.ts | RETAINED | — | Still used |
| scripts/test-outfit-planning.ts | RETAINED | — | Still used |
| scripts/test-plan-packing.ts | RETAINED | — | Still used |
| scripts/test-online-write-repository.ts | RETAINED | — | Still used |
| scripts/test-online-workspace-client.ts | RETAINED | — | Still used |
| scripts/test-wishlist-conversion-flow.ts | RETAINED | — | Still used |
| scripts/test-wishlist-legacy-id-fallback.ts | RETAINED | — | Still used |
| scripts/test-garment-detail-pairing.ts | RETAINED | — | Still used |
| scripts/test-wear-records.ts | RETAINED | — | Still used |
| scripts/test-parse-json-object.ts | RETAINED | — | Still used |
| scripts/test-thumbnail.ts | RETAINED | — | Still used |
| scripts/test-build-identity.ts | RETAINED | — | Still used |
| scripts/test-outfit-metadata.ts | RETAINED | — | Still used |
| scripts/test-intake-submit-state.ts | RETAINED | — | Still used |

## Summary

- MIGRATED: 0
- SUPERSEDED: 1
- RETAINED: 44
- DEPRECATED: 1
- UNCLASSIFIED: 0
