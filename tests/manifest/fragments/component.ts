import { TestEntry } from '../test-types';

export const componentTests: TestEntry[] = [
  {
    testId: 'component:async-action-button',
    layer: 'component',
    filePath: 'tests/component/async-action-button.test.tsx',
    description: 'React component rendering with jsdom + testing-library',
    tags: ['smoke'],
    blocking: true,
    executionPolicy: 'scheduled',
    executionNodes: [{ name: 'local' }],
    inputDescription: 'React element rendering',
    expectedOutput: 'DOM rendered correctly',
    expectedEvidence: 'assertion results',
  },
  {
    testId: 'component:placeholder',
    layer: 'component',
    filePath: 'tests/component/placeholder.test.ts',
    description: 'Component test placeholder',
    tags: ['smoke'],
    blocking: false,
  },
];
