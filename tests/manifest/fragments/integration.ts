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
  {
    testId: 'integration:overview-large-workspace',
    layer: 'integration',
    filePath: 'tests/integration/repository/overview.test.ts',
    description: 'Repository overview integration test',
    tags: ['repository'],
    blocking: false,
    executionPolicy: 'manual',
    executionNodes: [{ name: 'local-postgres' }],
  },
];
