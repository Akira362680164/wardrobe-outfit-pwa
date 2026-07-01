import { RunResultJson } from './adapters/shared-result-types';
import { validateManifest } from './validate-test-manifest';
import * as fs from 'fs';
import * as path from 'path';

export function validateReleaseGate(
  results: RunResultJson[],
  scope: 'automated' | 'final' | 'postrelease' = 'automated'
): { pass: boolean; errors: string[] } {
  const errors: string[] = [];
  const manifestResult = validateManifest();
  if (!manifestResult.valid) {
    errors.push(...manifestResult.errors.map(e => `Manifest: ${e}`));
  }

  for (const result of results) {
    if (result.status === 'FAILED' || result.status === 'ERROR') {
      errors.push(`Test ${result.testId}: ${result.status}`);
    }
    if (result.status === 'SKIPPED' || result.status === 'NOT_RUN') {
      errors.push(`Test ${result.testId}: ${result.status} - not executed`);
    }
  }

  if (scope === 'final') {
    errors.push('Final gate checks not yet implemented (APK manifest, vendor device)');
  }

  return { pass: errors.length === 0, errors };
}

if (require.main === module) {
  const scopeIndex = process.argv.indexOf('--scope');
  const scope = scopeIndex >= 0 ? process.argv[scopeIndex+1] as 'automated'|'final'|'postrelease' : 'automated';
  const resultsDir = path.join(process.cwd(), 'test-results');
  const results: RunResultJson[] = [];
  if (fs.existsSync(resultsDir)) {
    for (const f of fs.readdirSync(resultsDir)) {
      const fp = path.join(resultsDir, f);
      if (f.endsWith('.json') && fs.statSync(fp).isFile()) {
        try { results.push(JSON.parse(fs.readFileSync(fp, 'utf-8'))); } catch {}
      }
    }
  }
  const { pass, errors } = validateReleaseGate(results, scope);
  console.log(`Gate scope: ${scope}`);
  console.log(`Pass: ${pass}`);
  errors.forEach(e => console.log(`  ERROR: ${e}`));
  process.exit(pass ? 0 : 1);
}
