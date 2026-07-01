import { RunResultJson } from './adapters/shared-result-types';
import * as fs from 'fs';
import * as path from 'path';

export function writeTestResult(result: RunResultJson, outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const fileName = `${result.testId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  const filePath = path.join(outputDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8');
  return filePath;
}

// CLI entry point
if (require.main === module) {
  const layer = process.argv[2] || 'unit';
  const outputDir = process.argv[3] || process.cwd();
  const result: RunResultJson = {
    testId: `manual:${layer}`,
    layer: layer as RunResultJson['layer'],
    status: 'NOT_RUN',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 0,
    commit: process.env.GIT_COMMIT || 'unknown',
    branch: process.env.GIT_BRANCH || 'unknown',
    environment: {},
    passed: 0, failed: 0, skipped: 0, notRun: 0, flaky: 0,
    evidence: [],
  };
  const fp = writeTestResult(result, outputDir);
  console.log(`Result written to ${fp}`);
}
