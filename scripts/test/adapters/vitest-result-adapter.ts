import { RunResultJson, TestLayer } from './shared-result-types';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface VitestJsonOutput {
  numTotalTestSuites: number;
  numPassedTestSuites: number;
  numFailedTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  success: boolean;
  testResults: Array<{
    assertionResults: Array<{
      title: string;
      status: string;
      duration: number;
    }>;
    startTime: number;
    endTime: number;
    status: string;
    message: string;
  }>;
}

export function runVitestAndAdapt(
  testFile: string,
  layer: TestLayer,
  commit: string,
  branch: string
): RunResultJson {
  const startTime = Date.now();
  let vitestOutput: VitestJsonOutput;

  try {
    const output = execSync(
      `npx vitest run "${testFile}" --reporter json 2>/dev/null`,
      { encoding: 'utf-8', timeout: 120000 }
    );
    vitestOutput = JSON.parse(output);
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    if (err.stdout) {
      try { vitestOutput = JSON.parse(err.stdout as string); }
      catch { /* ignore */ }
    }
    const fallback: RunResultJson = {
      testId: `vitest:${path.basename(testFile)}`,
      layer,
      status: 'ERROR',
      startedAt: new Date(startTime).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      commit,
      branch,
      environment: {},
      passed: 0, failed: 0, skipped: 0, notRun: 0, flaky: 0,
      evidence: [(err.stderr || err.message || 'unknown error').substring(0, 2000)],
    };
    return fallback;
  }

  if (!vitestOutput) {
    return {
      testId: `vitest:${path.basename(testFile)}`,
      layer,
      status: 'ERROR',
      startedAt: new Date(startTime).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      commit, branch,
      environment: {},
      passed: 0, failed: 0, skipped: 0, notRun: 0, flaky: 0,
      evidence: ['No vitest JSON output captured'],
    };
  }

  const status: RunResultJson['status'] = vitestOutput.success ? 'PASSED' : 'FAILED';
  const finishedAt = new Date().toISOString();

  return {
    testId: `vitest:${path.basename(testFile)}`,
    layer,
    status,
    startedAt: new Date(startTime).toISOString(),
    finishedAt,
    durationMs: Date.now() - startTime,
    commit, branch,
    environment: {},
    passed: vitestOutput.numPassedTests || 0,
    failed: vitestOutput.numFailedTests || 0,
    skipped: vitestOutput.numPendingTests || 0,
    notRun: 0,
    flaky: 0,
    evidence: [`Vitest suites: ${vitestOutput.numPassedTestSuites}/${vitestOutput.numTotalTestSuites} passed`],
  };
}
