import { discoverTests } from './discover-tests';
import { validateManifest } from './validate-test-manifest';
import { writeTestResult } from './write-test-result';
import { runVitestAndAdapt } from './adapters/vitest-result-adapter';
import { RunResultJson, TestLayer } from './adapters/shared-result-types';
import * as path from 'path';
import * as fs from 'fs';

const COMMIT = process.env.GIT_COMMIT || require('child_process').execSync('git rev-parse HEAD', {encoding:'utf-8'}).trim();
const BRANCH = process.env.GIT_BRANCH || require('child_process').execSync('git branch --show-current', {encoding:'utf-8'}).trim();

async function main() {
  const layer = process.argv[2] as TestLayer;
  const baseline = process.argv.includes('--baseline');
  const tagIndex = process.argv.indexOf('--tag');
  const tag = tagIndex >= 0 ? process.argv[tagIndex + 1] : undefined;

  if (!layer) {
    console.error('Usage: tsx scripts/test/run-suite.ts <layer> [--baseline] [--tag <tag>]');
    process.exit(1);
  }

  if (layer === 'manifest') {
    const result = validateManifest();
    const output: RunResultJson = {
      testId: 'manifest:validate',
      layer: 'contract',
      status: result.valid ? 'PASSED' : 'FAILED',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0, commit: COMMIT, branch: BRANCH,
      environment: {},
      passed: result.valid ? 1 : 0,
      failed: result.valid ? 0 : result.errors.length,
      skipped: 0, notRun: 0, flaky: 0,
      evidence: [...result.errors, ...result.warnings],
    };
    const outDir = path.join(process.cwd(), 'test-results', `suite-${layer}-${Date.now()}`);
    const fp = writeTestResult(output, outDir);
    console.log(`Manifest result: ${output.status} -> ${fp}`);
    process.exit(result.valid ? 0 : 1);
    return;
  }

  // Get test entries for this layer
  const entries = discoverTests({ layer, tag, baseline });
  if (entries.length === 0) {
    console.log(`No tests found for layer=${layer} tag=${tag} baseline=${baseline}. Skipping.`);
    const output: RunResultJson = {
      testId: `suite:${layer}`,
      layer,
      status: 'SKIPPED',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0, commit: COMMIT, branch: BRANCH,
      environment: {},
      passed: 0, failed: 0, skipped: 0, notRun: 0, flaky: 0,
      evidence: ['No test entries found - this is expected for empty fragments'],
    };
    const outDir = path.join(process.cwd(), 'test-results', `suite-${layer}-${Date.now()}`);
    writeTestResult(output, outDir);
    return;
  }

  // Run each test entry
  const results: RunResultJson[] = [];
  for (const entry of entries) {
    const fullPath = path.join(process.cwd(), entry.filePath);
    if (!fs.existsSync(fullPath)) {
      console.log(`Test file not found: ${fullPath} (declared in manifest as ${entry.filePath})`);
      results.push({
        testId: entry.testId,
        layer,
        status: 'NOT_RUN',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0, commit: COMMIT, branch: BRANCH,
        environment: {},
        passed: 0, failed: 0, skipped: 0, notRun: 1, flaky: 0,
        evidence: [`File not found: ${entry.filePath}`],
      });
      continue;
    }
    const result = runVitestAndAdapt(fullPath, layer, COMMIT, BRANCH);
    results.push(result);
    console.log(`  ${result.testId}: ${result.status} (${result.passed}/${result.passed + result.failed})`);
  }

  const anyFailed = results.some(r => r.status === 'FAILED' || r.status === 'ERROR');
  const merged: RunResultJson = {
    testId: `suite:${layer}`,
    layer,
    status: anyFailed ? 'FAILED' : 'PASSED',
    startedAt: results[0]?.startedAt || new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    commit: COMMIT, branch: BRANCH,
    environment: {},
    passed: results.reduce((sum, r) => sum + r.passed, 0),
    failed: results.reduce((sum, r) => sum + r.failed, 0),
    skipped: results.reduce((sum, r) => sum + r.skipped, 0),
    notRun: results.reduce((sum, r) => sum + r.notRun, 0),
    flaky: results.reduce((sum, r) => sum + r.flaky, 0),
    evidence: results.map(r => `${r.testId}: ${r.status}`),
  };
  const outDir = path.join(process.cwd(), 'test-results', `suite-${layer}-${Date.now()}`);
  const fp = writeTestResult(merged, outDir);
  console.log(`Suite result: ${merged.status} -> ${fp}`);
  process.exit(anyFailed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
