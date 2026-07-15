# Recommendation realtime V0.7.4 evidence

## Scope and frozen decisions

This batch implements 2A-0 through 2A-4 for Recommendation Payload V3,
foreground resolve, worker prewarming, and transactional plan acceptance. The
five product decisions in the execution brief are frozen: remaining objective
weights are normalized after PAW removal; rotation grows by steps and only 365
days is labelled long-unworn; replacing a primary demotes it to backup; the
worker prewarms only today and tomorrow; accept stays disabled until both App
and mini-program readers support plans with garment UUIDs and no outfit UUID.

## Local verification

- Hand-written V3 fixture red phase: `20 failed / 1 passed` before implementation.
- API full suite: `320 / 320`.
- Real PostgreSQL suite: `50 / 50`, including fresh migration, 0018 to 0026
  upgrade, two-connection publication/accept concurrency, fencing, idempotency,
  primary demotion, account-delete cascade, and fault rollback.
- Accept PostgreSQL subset: `8 / 8`; the default locationless hard-filter path
  runs with its resolved rule version, and failure after plan, bindings, action,
  or before commit leaves no partial plan/action/mutation.
- App typecheck, cloud-contract build/typecheck, API typecheck, mini-program
  typecheck, plan-packing logic, root logic, production build, and
  `git diff --check` are release gates.

## Two-process CPU load approximation

The local benchmark ran two Node processes simultaneously. Each process used a
500-garment representative input, 60 cached-rule samples, 60 rule samples after
weather fallback, and 100 same-fingerprint coordinator reuse samples. This is
a two-load-lane approximation; it does not claim to measure the QWeather network
timeout itself.

| Scenario | Lane 1 P95 | Lane 2 P95 | Gate |
| --- | ---: | ---: | ---: |
| Same fingerprint coordinator reuse | 0.19 ms | 0.20 ms | 300 ms |
| Cached weather plus realtime rules | 12.10 ms | 9.41 ms | 800 ms |
| Rules after weather fallback | 12.06 ms | 8.75 ms | 2,000 ms |
| 500-garment rule kernel | 12.10 ms | 9.41 ms | 300 ms |

The executable benchmark is
`services/wardrobe-api/scripts/benchmark-realtime-v074.ts`. Production evidence
below records the first weather request, cache reuse, migration/restore drill,
feature flags, controlled resolve/accept/readback, and cleanup without logging
secrets, coordinates, or real wardrobe data.

## Production closeout

- Main was integrated and pushed at `4148541`; the mini-program reader branch
  was synchronized and pushed at `c98a2c1`. App/root and mini-program TypeScript
  gates passed before accept was enabled.
- Backups were written before both migration deployments. The final backup used
  for the 0026 drill is `wardrobe-20260715-202445.sql`; it restored into an
  isolated database, migrated from 25 to 26, and passed an account-plus-garment
  cascade deletion. The earlier 0024/0025 drill passed the previous-image
  health/version check, and the retained `3d1634d` migrator also read the final
  26-migration schema without error.
- Production runs `wardrobe-api:4148541` for API and worker. Both containers are
  running with zero restarts; internal and public health/ready/version are 200,
  the version endpoint reports `4148541`, and unauthenticated GET/resolve/accept
  routes return 401.
- Controlled QWeather smoke made exactly one `now`, one `hourly`, and one
  `daily` upstream request; a second overview/read added zero upstream requests.
  Both dates were forecast mode, shared one generation batch, and used
  `Asia/Shanghai`.
- A synthetic account generated today/tomorrow as one batch in 158.29 ms, then
  reused both records in 46.88 ms. Accept committed once, replayed idempotently,
  produced a plan without `outfitId`, stored four garment UUIDs/snapshots and
  four image bindings, and wrote one action plus one mutation. Cleanup left zero
  synthetic profiles.
- Release flags were enabled in stages after the controlled run. Final state is
  `RECOMMENDATION_REALTIME_ENABLED=true` and
  `RECOMMENDATION_ACCEPT_ENABLED=true`; PAW date/candidate evaluation, alerts,
  and historical climate remain false. Post-readiness API 5xx and worker error
  counts were both zero.
- The isolated restore databases were removed. Docker retains the current image
  and verified rollback image `wardrobe-api:3d1634d`; root disk is 24% used with
  about 51 GiB available.

## 2A-5 accept/readiness closeout

- The red phase reproduced two deterministic failures before the fix: nested
  garment-set/display-summary fingerprint drift and prepare errors escaping the
  stale fallback boundary (`2 failed / 7 passed`). The final API suite is
  `327 / 327`; the real PostgreSQL suite is `59 / 59`, including 17 accept tests
  with two-connection field races, transaction fault injection, and snapshot
  plan wear/cancel rollback.
- App planning logic passed `222` assertions (`186` existing planning plus `36`
  wear-state), and the new recommendation-plan presentation fixture passed `5`.
  Mini-program state passed `16` assertions and its shared day-card fixture
  passed `5`. Cloud contracts, API/root/mini typecheck, production build, and
  `git diff --check` also passed.
- Two simultaneous 500-garment benchmark lanes recorded zero engine calls for
  same-fingerprint reuse. Reuse P95 was `0.20 / 0.29 ms`, cached-rule/kernel was
  `9.73 / 10.84 ms`, and weather-fallback rules were `9.64 / 9.97 ms`; all were
  below the `300 / 800 / 2,000 ms` gates.
- Main code `6fb576e` and mini-program merge `0e2b81d` were pushed. The production
  backup is `wardrobe-20260715-220552.sql`; it restored into an isolated database
  with 26 migrations, and the previous `wardrobe-api:4148541` image passed ready
  against that restore. The isolated restore database was then removed.
- Production API and worker run `wardrobe-api:6fb576e`, image ID
  `sha256:8969eddedf1a8815721964499993deba3afaed06520e68896b2a378e77f8c70d`.
  Both containers have zero restarts; public health/ready/version are 200,
  protected routes return 401 without credentials, and migration count remains
  26. `RECOMMENDATION_REALTIME_ENABLED=true` and
  `RECOMMENDATION_ACCEPT_ENABLED=true` remained enabled throughout deployment.
- A production synthetic account used the real Fastify Bearer-session plus
  device boundary for resolve, read, accept, planning read, idempotent replay,
  mark-worn, and wear-summary. Today/tomorrow first generated together, the
  second resolve reused both, the accepted plan had no `outfitId`, three garment
  and actual-wear snapshots read back, all three wear counts became one, and
  account cleanup reported zero residual rows. A fresh QWeather population was
  followed by the second resolve with identical cache `fetched_at` evidence,
  proving no repeated upstream fetch for that cache key.
- The normal Dockerfile rebuild was blocked by Debian mirror `apt-get update`
  stalls. Because this batch changed no dependency, shared runtime package, or
  migration, the release image was built as a deterministic overlay of locally
  compiled API `dist` on the verified `4148541` image. This is the retained
  deployment risk; application gates, restore/old-image compatibility, and the
  authenticated production HTTP transaction all passed on the deployed image.
