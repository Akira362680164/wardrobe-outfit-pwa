import { TestEntry } from '../test-types';

export const e2eTests: TestEntry[] = [
  { testId: 'e2e:android-smoke', layer: 'e2e', filePath: 'scripts/android-e2e/run-android-e2e.ts --suite smoke', description: 'Real APK smoke flow via WebView CDP', tags: ['smoke'], blocking: true, executionPolicy: 'manual', executionNodes: [{ name: 'local-android' }], inputDescription: 'Installed APK, Android device, test API', expectedOutput: 'APK launches; auth, default closet, navigation and global create pass', expectedEvidence: 'Screenshots, logcat and API snapshots' },
  { testId: 'e2e:android-critical', layer: 'e2e', filePath: 'scripts/android-e2e/run-android-e2e.ts --suite critical', description: 'Real APK critical business flows via WebView CDP', tags: ['critical'], blocking: true, executionPolicy: 'manual', executionNodes: [{ name: 'local-android' }], inputDescription: 'Installed APK, Android device, test API', expectedOutput: 'Garment, wishlist, outfit, account isolation and force-stop restore flows pass', expectedEvidence: 'Screenshots, logcat and API snapshots' },
  { testId: 'e2e:android-full', layer: 'e2e', filePath: 'scripts/android-e2e/run-android-e2e.ts --suite full', description: 'Real APK smoke plus critical business flows', tags: ['full'], blocking: true, executionPolicy: 'manual', executionNodes: [{ name: 'local-android' }], inputDescription: 'Installed APK, Android device, test API', expectedOutput: 'Smoke and critical suites pass in one APK run', expectedEvidence: 'Screenshots, logcat and API snapshots' },
  { testId: 'e2e:account-page', layer: 'e2e', filePath: 'e2e/specs/account-page.spec.ts', description: 'Account page', tags: ['full'], blocking: false },
  { testId: 'e2e:two-device', layer: 'e2e', filePath: 'e2e/specs/two-device-data-sync.spec.ts', description: 'Two device data sync', tags: ['full'], blocking: false },
  { testId: 'e2e:cascade-delete', layer: 'e2e', filePath: 'e2e/specs/cascade-delete-sync.spec.ts', description: 'Cascade delete sync', tags: ['full'], blocking: false },
  { testId: 'e2e:online-failure-retry', layer: 'e2e', filePath: 'e2e/specs/online-failure-retry.spec.ts', description: 'Online failure retry', tags: ['full'], blocking: false },
  { testId: 'e2e:ai-recognition-failure', layer: 'e2e', filePath: 'e2e/specs/ai-recognition-failure-retry.spec.ts', description: 'AI recognition failure retry', tags: ['full'], blocking: false },
  { testId: 'e2e:dev-server-image', layer: 'e2e', filePath: 'e2e/specs/dev-server-image-verification.spec.ts', description: 'Dev server image verification', tags: ['full'], blocking: false },
  { testId: 'e2e:ai-live', layer: 'e2e', filePath: 'e2e/specs/90-ai-live.spec.ts', description: 'AI live recognition (manual)', tags: ['ai-live'], blocking: false, executionPolicy: 'manual' },
];
