import { RunResultJson, TestLayer } from './shared-result-types';

/**
 * maestro-result-adapter — stub implementation.
 * Real implementation requires maestro execution environment.
 * Integration request: see tests/reports/integration-requests/
 */
export function adaptmaestro(input: unknown): Partial<RunResultJson> {
  return {
    testId: `maestro:stub`,
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
