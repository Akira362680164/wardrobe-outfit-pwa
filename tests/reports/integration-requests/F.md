# Subagent F Integration Request — E2E Tests

## Required E2E Runner Changes

Please update `scripts/run-e2e-local.sh` and `playwright.config.ts`:

1. Add `--grep-invert @ai-live` for default E2E runs (skip AI live tests)
2. Add `--grep @ai-live` for dedicated AI live test runs
3. Support `E2E_AI_MODE` environment variable (fixture/live)
4. Add `--reporter html,json` for CI compatibility

## Reporter Config

```json
{
  "reporter": [
    ["html"],
    ["json", { "outputFile": "test-results/e2e/results.json" }]
  ]
}
```
