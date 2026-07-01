import { TestEntry } from '../test-types';

export const contractTests: TestEntry[] = [
  {
    testId: 'contract:manifest-valid',
    layer: 'contract',
    filePath: 'tests/contract/contract.test.ts',
    description: 'Contract tests for manifest structure',
    tags: ['smoke'],
    blocking: true,
    executionPolicy: 'scheduled',
    executionNodes: [{ name: 'local' }],
    inputDescription: 'Manifest structure validation',
    expectedOutput: 'All contract checks pass',
    expectedEvidence: 'test output',
  },
  {
    testId: 'contract:no-legacy-image-fields',
    layer: 'contract',
    filePath: 'tests/contract/strict/legacy-image-fields.test.ts',
    description: 'Strict check for legacy image fields in source',
    tags: ['strict'],
    blocking: true,
    executionPolicy: 'scheduled',
    executionNodes: [{ name: 'local' }],
    inputDescription: 'Scan src/ for legacy dataUrl fields',
    expectedOutput: 'No legacy field violations found',
    expectedEvidence: 'scan results',
  },
];
