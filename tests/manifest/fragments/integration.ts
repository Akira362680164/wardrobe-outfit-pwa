import { TestEntry } from '../test-types';

export const integrationTests: TestEntry[] = [
  {
    testId: 'integration:placeholder',
    layer: 'integration',
    filePath: 'tests/integration/placeholder.test.ts',
    description: 'Integration test placeholder',
    tags: ['smoke'],
    blocking: false,
  },
];
