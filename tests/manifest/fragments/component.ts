import { TestEntry } from '../test-types';

export const componentTests: TestEntry[] = [
  {
    testId: 'component:placeholder',
    layer: 'component',
    filePath: 'tests/component/placeholder.test.ts',
    description: 'Component test placeholder',
    tags: ['smoke'],
    blocking: false,
  },
];
