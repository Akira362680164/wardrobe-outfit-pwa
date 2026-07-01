import { TestEntry } from '../test-types';

export const apiTests: TestEntry[] = [
  { testId: 'api:health', layer: 'api', filePath: 'services/wardrobe-api/tests/health.test.ts', tags: ['smoke'], blocking: true, inputDescription: 'API server running', expectedOutput: 'Health endpoint returns ok', expectedEvidence: 'test results' },
  { testId: 'api:registration', layer: 'api', filePath: 'services/wardrobe-api/tests/registration.test.ts', tags: ['smoke'], blocking: true, inputDescription: 'API server running', expectedOutput: 'Registration flow works', expectedEvidence: 'test results' },
  { testId: 'api:session', layer: 'api', filePath: 'services/wardrobe-api/tests/session.test.ts', tags: ['smoke'], blocking: true, inputDescription: 'API server running', expectedOutput: 'Session login/logout works', expectedEvidence: 'test results' },
  { testId: 'api:workspace', layer: 'api', filePath: 'services/wardrobe-api/tests/workspace.test.ts', tags: ['critical'], blocking: true, inputDescription: 'API server running', expectedOutput: 'Workspace CRUD operations work', expectedEvidence: 'test results' },
  { testId: 'api:assets', layer: 'api', filePath: 'services/wardrobe-api/tests/assets.test.ts', tags: ['critical'], blocking: true, inputDescription: 'API server running', expectedOutput: 'Asset operations work', expectedEvidence: 'test results' },
  { testId: 'api:diagnostics', layer: 'api', filePath: 'services/wardrobe-api/tests/diagnostics.test.ts', tags: ['full'], blocking: false },
  { testId: 'api:security', layer: 'api', filePath: 'services/wardrobe-api/tests/security.test.ts', tags: ['full'], blocking: false },
  { testId: 'api:reset-test-data', layer: 'api', filePath: 'services/wardrobe-api/tests/reset-test-data.test.ts', tags: ['full'], blocking: false },
];
