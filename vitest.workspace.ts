import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      include: ['tests/**/*.test.ts'],
      exclude: ['node_modules', 'tests/fixtures'],
    },
  },
]);
