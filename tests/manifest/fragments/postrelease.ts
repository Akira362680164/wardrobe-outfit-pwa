import { TestEntry } from '../test-types';

export const postreleaseTests: TestEntry[] = [
  {
    testId: 'postrelease:smoke',
    layer: 'postrelease',
    filePath: 'scripts/test/run-remote-smoke.ts',
    description: 'Remote smoke test against deployed API',
    tags: ['smoke'],
    blocking: true,
    executionPolicy: 'manual',
    inputDescription: 'Deployed API /api/ready and /api/version',
    expectedOutput: 'API healthy, version matches expected',
    expectedEvidence: 'api-ready.json, api-version.json',
  },
];
