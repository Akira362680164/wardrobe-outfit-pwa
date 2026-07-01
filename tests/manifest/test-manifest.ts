import { TestEntry } from './test-types';
import { contractTests } from './fragments/contract';
import { unitTests } from './fragments/unit';
import { componentTests } from './fragments/component';
import { integrationTests } from './fragments/integration';
import { apiTests } from './fragments/api';
import { e2eTests } from './fragments/e2e';
import { androidTests } from './fragments/android';
import { vendor_deviceTests as vendorDeviceTests } from './fragments/vendor-device';
import { postreleaseTests } from './fragments/postrelease';

export const testManifest: TestEntry[] = [
  ...contractTests,
  ...unitTests,
  ...componentTests,
  ...integrationTests,
  ...apiTests,
  ...e2eTests,
  ...androidTests,
  ...vendorDeviceTests,
  ...postreleaseTests,
];
