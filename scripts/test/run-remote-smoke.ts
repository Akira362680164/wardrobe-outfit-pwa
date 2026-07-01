import { RunResultJson } from './adapters/shared-result-types';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const apiUrl = process.env.TEST_API_URL || 'http://127.0.0.1:3100';
  const startTime = Date.now();
  const resultDir = path.join(process.cwd(), 'test-results', 'postrelease', String(Date.now()));
  fs.mkdirSync(resultDir, { recursive: true });

  const results: RunResultJson = {
    testId: 'postrelease:smoke',
    layer: 'postrelease',
    status: 'NOT_RUN',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 0,
    commit: process.env.GIT_COMMIT || 'unknown',
    branch: process.env.GIT_BRANCH || 'unknown',
    environment: { apiUrl },
    passed: 0, failed: 0, skipped: 0, notRun: 0, flaky: 0,
    evidence: [],
  };

  try {
    // Check /api/ready
    const readyResp = await fetch(`${apiUrl}/api/ready`);
    const readyData = await readyResp.json();
    fs.writeFileSync(path.join(resultDir, 'api-ready.json'), JSON.stringify(readyData, null, 2));

    if (readyData.status !== 'ok') {
      results.status = 'FAILED';
      results.evidence.push(`/api/ready returned: ${JSON.stringify(readyData)}`);
    } else {
      results.status = 'PASSED';
      results.evidence.push('/api/ready: OK');
      results.passed = 1;
    }

    // Check /api/version
    const versionResp = await fetch(`${apiUrl}/api/version`);
    const versionData = await versionResp.json();
    fs.writeFileSync(path.join(resultDir, 'api-version.json'), JSON.stringify(versionData, null, 2));
    results.evidence.push(`Version: ${versionData.version || versionData.gitCommit || 'unknown'}`);
  } catch (e: unknown) {
    results.status = 'FAILED';
    results.evidence.push(`API unreachable: ${(e as Error).message}`);
    results.failed = 1;
  }

  results.finishedAt = new Date().toISOString();
  results.durationMs = Date.now() - startTime;

  fs.writeFileSync(path.join(resultDir, 'result.json'), JSON.stringify(results, null, 2));
  console.log(`Remote smoke: ${results.status}`);
  console.log(JSON.stringify(results.evidence, null, 2));
  process.exit(results.status === 'PASSED' ? 0 : 1);
}

main();
