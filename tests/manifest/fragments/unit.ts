import { TestEntry } from '../test-types';

export const unitTests: TestEntry[] = [
  {
    testId: 'unit:parse-json-object',
    layer: 'unit',
    filePath: 'tests/unit/parse-json-object.test.ts',
    description: 'JSON parsing utility functions',
    tags: ['smoke'],
    blocking: true,
    executionPolicy: 'scheduled',
    executionNodes: [{ name: 'local' }],
    inputDescription: 'JSON strings',
    expectedOutput: 'Parsed objects or null',
    expectedEvidence: 'assertion results',
  },
  {
    testId: 'unit:thumbnail',
    layer: 'unit',
    filePath: 'tests/unit/thumbnail.test.ts',
    description: 'Thumbnail size calculation',
    tags: ['smoke'],
    blocking: true,
    executionPolicy: 'scheduled',
    executionNodes: [{ name: 'local' }],
    inputDescription: 'Original dimensions and max dimension',
    expectedOutput: 'Correctly scaled thumbnail dimensions',
    expectedEvidence: 'assertion results',
  },
];
