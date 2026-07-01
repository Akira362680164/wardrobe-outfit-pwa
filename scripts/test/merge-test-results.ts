import { RunResultJson } from './adapters/shared-result-types';
import * as fs from 'fs';
import * as path from 'path';

export function mergeResults(results: RunResultJson[]): RunResultJson {
  const anyFailed = results.some(r => r.status === 'FAILED' || r.status === 'ERROR');
  return {
    testId: 'merged:all',
    layer: results[0]?.layer || 'unit',
    status: anyFailed ? 'FAILED' : 'PASSED',
    startedAt: results[0]?.startedAt || new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: results.reduce((s, r) => s + r.durationMs, 0),
    commit: results[0]?.commit || 'unknown',
    branch: results[0]?.branch || 'unknown',
    environment: {},
    passed: results.reduce((s, r) => s + r.passed, 0),
    failed: results.reduce((s, r) => s + r.failed, 0),
    skipped: results.reduce((s, r) => s + r.skipped, 0),
    notRun: results.reduce((s, r) => s + r.notRun, 0),
    flaky: results.reduce((s, r) => s + r.flaky, 0),
    evidence: results.map(r => `${r.testId}: ${r.status}`),
  };
}

function collectResults(dir: string): RunResultJson[] {
  const results: RunResultJson[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (f.endsWith('.json') && fs.statSync(fp).isFile()) {
      try {
        results.push(JSON.parse(fs.readFileSync(fp, 'utf-8')));
      } catch { /* skip unparseable */ }
    }
  }
  return results;
}

if (require.main === module) {
  const scope = process.argv.includes('--scope') ? process.argv[process.argv.indexOf('--scope')+1] : 'all';
  const resultsDir = path.join(process.cwd(), 'test-results');
  const results = collectResults(resultsDir);
  if (results.length === 0) {
    console.log('No result files found');
    process.exit(0);
  }
  const merged = mergeResults(results);
  const outDir = path.join(resultsDir, 'merged');
  fs.mkdirSync(outDir, { recursive: true });
  const fp = path.join(outDir, `merged-${scope}-${Date.now()}.json`);
  fs.writeFileSync(fp, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`Merged ${results.length} results -> ${fp}`);
  console.log(`Status: ${merged.status} (${merged.passed} passed, ${merged.failed} failed)`);
}
