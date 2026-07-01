import { RunResultJson, TestLayer } from './shared-result-types';

/**
 * api-vitest-result-adapter — stub implementation.
 * Real implementation requires api-vitest execution environment.
 * Integration request: see tests/reports/integration-requests/
 */
export function adaptapi-vitest(input: unknown): Partial<RunResultJson> {
  return {
    testId: `api-vitest:stub`,
    layer: 'unit' as TestLayer,
    status: 'NOT_RUN',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 0,
    commit: process.env.GIT_COMMIT || 'unknown',
    branch: process.env.GIT_BRANCH || 'unknown',
    environment: {},
    passed: 0, failed: 0, skipped: 0, notRun: 1, flaky: 0,
    evidence: ['Stub adapter - requires real implementation'],
  };
}
