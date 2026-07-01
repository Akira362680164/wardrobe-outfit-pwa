import { TestEntry } from '../test-types';

export const vendorDeviceTests: TestEntry[] = [
  {
    testId: 'vendor-device:checklist',
    layer: 'vendor-device',
    filePath: 'tests/android/vendor-device-checklist.md',
    description: 'Manual vendor device checklist',
    tags: ['release'],
    blocking: true,
    executionPolicy: 'manual',
    inputDescription: 'Physical device running candidate APK',
    expectedOutput: 'All checklist items verified',
    expectedEvidence: 'signed checklist or result.json',
  },
];
