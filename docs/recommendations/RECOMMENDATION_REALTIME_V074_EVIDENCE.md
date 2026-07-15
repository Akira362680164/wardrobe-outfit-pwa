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
