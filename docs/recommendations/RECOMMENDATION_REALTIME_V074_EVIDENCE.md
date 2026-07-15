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
- Real PostgreSQL suite: `48 / 48`, including fresh migration, 0018 to 0025
  upgrade, two-connection publication/accept concurrency, fencing, idempotency,
  primary demotion, and fault rollback.
- Accept PostgreSQL subset: `7 / 7`; failure after plan, bindings, action, or
  before commit leaves no partial plan/action/mutation.
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
must separately record the first weather request, cache reuse, migration/restore
drill, feature flags, controlled resolve/accept/readback, and cleanup without
logging secrets, coordinates, or real wardrobe data.

## Production closeout

Pending main integration and the production stage gates in
`deploy/docs/production-deploy.md`. Both realtime and accept remain default-off
until those gates complete.
