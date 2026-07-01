import { findTestsForFile } from '../../tests/manifest/dependency-map';
import { discoverTests } from './discover-tests';
import { execSync } from 'child_process';

function getChangedFiles(): string[] {
  try {
    const head = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    const parent = execSync(`git rev-parse ${head}~1 2>/dev/null || echo HEAD`, { encoding: 'utf-8' }).trim();
    const diff = execSync(`git diff --name-only ${parent}...${head} 2>/dev/null || git diff --name-only HEAD~1`, { encoding: 'utf-8' }).trim();
    return diff.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const changedFiles = getChangedFiles();
  if (changedFiles.length === 0) {
    console.log('No changed files detected');
    process.exit(0);
  }
  console.log('Changed files:');
  changedFiles.forEach(f => console.log(`  ${f}`));

  const allTestIds = new Set<string>();
  for (const file of changedFiles) {
    const testIds = findTestsForFile(file);
    testIds.forEach(id => allTestIds.add(id));
  }

  if (allTestIds.size === 0) {
    console.log('No affected tests found for changed files');
    process.exit(0);
  }
  console.log(`\nAffected tests (${allTestIds.size}):`);
  allTestIds.forEach(id => console.log(`  ${id}`));
}

main();
