#!/usr/bin/env tsx
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface EnvCheck {
  name: string;
  pass: boolean;
  detail: string;
}

async function main() {
  const checkRunId = process.env.TEST_RUN_ID || `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const checks: EnvCheck[] = [];

  // 1. NODE_ENV
  checks.push({
    name: 'NODE_ENV=test',
    pass: process.env.NODE_ENV === 'test',
    detail: process.env.NODE_ENV || '(not set)',
  });

  // 2. Database name
  const dbUrl = process.env.DATABASE_URL || `postgresql:///${checkRunId.replace('run_', 'wardrobe_')}`;
  const dbName = dbUrl.replace(/.*\//, '').replace(/\?.*$/, '');
  const validDbs = ['wardrobe_test', 'wardrobe_integration', 'wardrobe_e2e'];
  checks.push({
    name: `Database name (${dbName}) in allowlist`,
    pass: validDbs.includes(dbName),
    detail: dbName,
  });

  // 3. Schema name
  checks.push({
    name: `Schema name (${checkRunId}) starts with run_`,
    pass: checkRunId.startsWith('run_'),
    detail: checkRunId,
  });

  // 4. Host allowlist
  const hostAllowlist = (process.env.TEST_DATABASE_HOST_ALLOWLIST || 'localhost,127.0.0.1,::1').split(',');
  const hostMatch = dbUrl.match(/@([^:]+):/);
  const host = hostMatch ? hostMatch[1] : 'localhost';
  checks.push({
    name: `Host (${host}) in allowlist`,
    pass: hostAllowlist.includes(host),
    detail: host,
  });

  // 5. Not public IP
  const publicIps = ['111.231.98.86'];
  checks.push({
    name: 'Host not public IP',
    pass: !publicIps.includes(host),
    detail: host,
  });

  // 6. Storage root
  const storageRoot = process.env.TEST_STORAGE_ROOT || path.join(process.cwd(), 'test-results', 'runtime', checkRunId, 'storage');
  checks.push({
    name: 'Storage root in project directory',
    pass: storageRoot.startsWith(process.cwd()),
    detail: storageRoot,
  });

  // Print results
  const allPass = checks.every(c => c.pass);
  console.log(`\nTest Environment Verification (Run ID: ${checkRunId})`);
  console.log('='.repeat(60));
  for (const check of checks) {
    console.log(`  ${check.pass ? '✅' : '❌'} ${check.name}`);
    console.log(`     ${check.detail}`);
  }
  console.log('='.repeat(60));
  console.log(`Result: ${allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
  
  process.exit(allPass ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
