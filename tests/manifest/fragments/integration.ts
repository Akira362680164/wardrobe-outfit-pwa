import { TestEntry } from '../test-types';

export const integrationTests: TestEntry[] = [
  {
    testId: 'integration:overview-structure-only',
    layer: 'integration',
    filePath: 'tests/integration/repository/overview-roundtrip.test.ts',
    description: 'PostgreSQL repository: connect, create user, default location',
    tags: ['repository'],
    blocking: true,
    executionPolicy: 'scheduled',
    executionNodes: [{ name: 'local-postgres' }],
    inputDescription: 'PostgreSQL wardrobe_test database',
    expectedOutput: 'Database operations succeed',
    expectedEvidence: '3/3 tests pass',
  },
  {
    testId: 'integration:overview-large-workspace',
    layer: 'integration',
    filePath: 'tests/integration/repository/overview.test.ts',
    description: 'Repository overview with multiple entities (placeholder)',
    tags: ['repository'],
    blocking: false,
    executionPolicy: 'manual',
  },
];
