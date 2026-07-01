import { TestEntry } from '../test-types';

export const androidTests: TestEntry[] = [
  {
    testId: 'android:placeholder',
    layer: 'android',
    filePath: 'tests/android/placeholder.test.ts',
    description: 'Android test placeholder',
    tags: ['smoke'],
    blocking: false,
    executionPolicy: 'manual',
  },
];
