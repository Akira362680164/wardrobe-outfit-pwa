#!/usr/bin/env node
console.warn('WARNING: test:logic:all is deprecated. Use test:local:full instead. This command will be removed in v2.1.4.');
const { execSync } = require('child_process');
try {
  execSync('npm run test:local:full', { stdio: 'inherit', shell: true });
} catch (e) {
  const code = e.status || 1;
  process.exit(code);
}
