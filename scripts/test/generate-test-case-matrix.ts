import { testManifest } from '../../tests/manifest/test-manifest';
import * as fs from 'fs';
import * as path from 'path';

function generateMatrix(): string {
  const lines: string[] = [
    '# Test Case Matrix',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Total entries: ${testManifest.length}`,
    '',
    '## By Layer',
    '',
  ];
  const byLayer = new Map<string, typeof testManifest>();
  for (const entry of testManifest) {
    const list = byLayer.get(entry.layer) || [];
    list.push(entry);
    byLayer.set(entry.layer, list);
  }
  for (const [layer, entries] of byLayer) {
    lines.push(`### ${layer}`);
    lines.push('');
    lines.push('| Test ID | File | Blocking | Tags |');
    lines.push('|---|---|---|---|');
    for (const e of entries) {
      lines.push(`| ${e.testId} | ${e.filePath} | ${e.blocking ? 'Yes' : 'No'} | ${(e.tags || []).join(', ')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

if (require.main === module) {
  const checkMode = process.argv.includes('--check');
  const matrix = generateMatrix();
  const outPath = path.join(process.cwd(), 'docs', 'test-case-matrix.md');
  if (checkMode) {
    if (fs.existsSync(outPath)) {
      const existing = fs.readFileSync(outPath, 'utf-8');
      if (existing === matrix) {
        console.log('Matrix is up to date');
        process.exit(0);
      } else {
        console.log('Matrix is outdated - run test:matrix:generate to update');
        process.exit(1);
      }
    } else {
      console.log('Matrix file not found');
      process.exit(1);
    }
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, matrix, 'utf-8');
    console.log(`Matrix generated at ${outPath}`);
  }
}
