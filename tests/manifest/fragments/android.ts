import { TestEntry } from '../test-types';

export const androidTests: TestEntry[] = [
  { testId: 'android:metadata', layer: 'android', filePath: 'scripts/android-emulator-regression.sh (metadata)', description: 'APK metadata verification', tags: ['smoke'], blocking: true, executionPolicy: 'manual', executionNodes: [{ name: 'local-android' }], inputDescription: 'Built APK file', expectedOutput: 'versionName/versionCode/signer match expected', expectedEvidence: 'aapt output' },
  { testId: 'android:launch', layer: 'android', filePath: 'scripts/android-emulator-regression.sh (launch)', description: 'Android app launch test', tags: ['interaction'], blocking: true, executionPolicy: 'manual', executionNodes: [{ name: 'local-android' }], inputDescription: 'APK installed on emulator', expectedOutput: 'App launches without fatal crash', expectedEvidence: 'logcat + screenshot' },
  { testId: 'android:interaction', layer: 'android', filePath: 'scripts/android-emulator-regression.sh (interaction)', description: 'Android interaction test', tags: ['interaction'], blocking: true, executionPolicy: 'manual', executionNodes: [{ name: 'local-android' }], inputDescription: 'App running on emulator', expectedOutput: 'Return key, landscape work without crash', expectedEvidence: 'logcat + screenshots' },
];
