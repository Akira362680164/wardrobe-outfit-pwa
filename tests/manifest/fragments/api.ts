import { TestEntry } from '../test-types';

export const apiTests: TestEntry[] = [
  {
    testId: 'api:placeholder',
    layer: 'api',
    filePath: 'tests/api/placeholder.test.ts',
    description: 'API test placeholder',
    tags: ['smoke'],
    blocking: false,
  },
];
