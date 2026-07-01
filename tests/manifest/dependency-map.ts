import { testManifest } from './test-manifest';

export interface FileTestMapping {
  filePathPattern: string;
  testIds: string[];
}

// Auto-generated from manifest entries
const patterns: Map<string, string[]> = new Map();
for (const entry of testManifest) {
  const file = entry.filePath;
  const dir = file.substring(0, file.lastIndexOf('/'));
  const key = dir || file;
  if (!patterns.has(key)) patterns.set(key, []);
  patterns.get(key)!.push(entry.testId);
}

export const dependencyMap: FileTestMapping[] = Array.from(patterns.entries())
  .map(([filePathPattern, testIds]) => ({ filePathPattern, testIds }));

export function findTestsForFile(filePath: string): string[] {
  const matched: string[] = [];
  for (const mapping of dependencyMap) {
    if (filePath.startsWith(mapping.filePathPattern) ||
        mapping.filePathPattern.startsWith(filePath) ||
        filePath.includes(mapping.filePathPattern)) {
      matched.push(...mapping.testIds);
    }
  }
  return [...new Set(matched)];
}
