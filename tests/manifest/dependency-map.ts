export interface FileTestMapping {
  filePath: string;
  testIds: string[];
}

export const dependencyMap: FileTestMapping[] = [];

export function findTestsForFile(filePath: string): string[] {
  const matched: string[] = [];
  for (const mapping of dependencyMap) {
    if (filePath.startsWith(mapping.filePath) || mapping.filePath.startsWith(filePath)) {
      matched.push(...mapping.testIds);
    }
  }
  return matched;
}
