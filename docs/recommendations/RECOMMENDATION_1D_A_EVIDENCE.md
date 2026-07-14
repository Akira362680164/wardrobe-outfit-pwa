# Wardora recommendation backend 1D-A evidence

Date: 2026-07-14
Scope: strict Payload V2 compatibility and deterministic `forecast` / `locationless` / `weather_fallback` engine behavior only.

## Test-first evidence

- The existing 24 V1 fixtures and committed shadow artifacts were not edited or regenerated.
- Added 12 hand-written V2 expectations in a separate fixture module:
  - 5 context/readiness scenarios: locationless, weather fallback, forecast delegation, dress + shoes, and empty wardrobe;
  - 4 frozen item-adaptability vectors;
  - 3 frozen candidate-adaptability vectors.
- First runnable V2 test after dependencies were restored: `31` tests collected, `20` failed and `11` passed. The failures were the expected missing `generateRecommendationsV2`, adaptability functions, and V1/V2 schemas.
- After implementation: V2 suite `31/31` passed. No test writes or regenerates expected data.

## Forecast parity

The V2 forecast fixture is parsed by `RecommendationEngineInputV2Schema`, stripped only of `resolvedContext`, and delegated to the unchanged V1 `generateRecommendations` entry. The test asserts deep equality of the complete `RecommendationEngineOutput`, including candidate IDs, order, scores, exclusions, reasons, readiness, shortlist, and metrics.

Result: passed. Existing V1 recommendation suite also remains `49/49`.

## Generic-mode boundaries

- `locationless` and `weather_fallback` reject temperature, feels-like, rain, and wind fields at the schema boundary.
- Both modes skip temperature hard filtering and use the same frozen adaptability algorithm.
- The two generic modes produce equal engine output for otherwise equal inputs; only their payload-level context/location/fixed summary/resolution evidence differs.
- Weather reason codes (`weather_fit`, `rain_ready`, `needs_evening_layer`) and weather risk codes (`too_hot`, `too_cold`, `rain_exposure`, `wind_exposure`, `missing_required_layer`) are forbidden.
- `adaptable_conditions` is emitted exactly when candidate adaptability is at least `75`.
- Empty wardrobe returns internal `not_ready` with `shoes`, `tops`, and `pants` missing; dress + shoes is a valid limited-ready candidate state. Neither path throws.

## 1C preservation evidence

No changes were made to:

- `services/wardrobe-api/src/recommendations/workspace-adapter.ts`
- `services/wardrobe-api/src/recommendations/generation-service.ts`
- `services/wardrobe-api/src/recommendations/worker.ts`
- `services/wardrobe-api/src/recommendations/read-service.ts`
- recommendation routes or production feature flags

The existing worker/read/routes/contracts regression set passed together with the V1/V2 suites (`99/99`). API full test passed `232/232`. `recommendations:shadow:check` still reports that artifacts match the original 24 committed fixtures.

## Enablement state

- Existing V1 recommendation worker behavior remains unchanged.
- PAW remains disabled.
- There is no V2 worker, V2 current write, new route, location/weather persistence, QWeather call, GeoAPI call, or UI wiring in this batch.
