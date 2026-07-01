import { TestEntry } from '../test-types';

export const contractTests: TestEntry[] = [
  {
    testId: 'contract:manifest-valid',
    layer: 'contract',
    filePath: 'tests/contract/contract.test.ts',
    description: 'Contract tests for manifest and legacy fields',
    tags: ['smoke'],
    blocking: true,
    executionPolicy: 'scheduled',
    executionNodes: [{ name: 'local' }],
    inputDescription: 'Manifest structure and legacy field scan',
    expectedOutput: 'All contract checks pass',
    expectedEvidence: 'test output',
  },
];
