import { TestEntry } from '../test-types';

export const e2eTests: TestEntry[] = [
  {
    testId: 'e2e:placeholder',
    layer: 'e2e',
    filePath: 'tests/e2e/placeholder.test.ts',
    description: 'E2E test placeholder',
    tags: ['smoke'],
    blocking: false,
    executionPolicy: 'manual',
  },
];
