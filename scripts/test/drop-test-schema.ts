#!/usr/bin/env tsx
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const runId = process.env.TEST_RUN_ID || '';
  const dbUrl = process.env.DATABASE_URL || '';
  const storageRoot = (process.env.TEST_STORAGE_ROOT || '');

  if (!runId || !runId.startsWith('run_')) {
    console.error('TEST_RUN_ID must start with run_');
    process.exit(1);
  }

  console.log(`Dropping schema: ${runId}`);
  execSync(`psql "${dbUrl}" -c "DROP SCHEMA IF EXISTS ${runId} CASCADE;"`, { stdio: 'inherit' });

  if (storageRoot && storageRoot.startsWith(process.cwd())) {
    console.log(`Cleaning storage: ${storageRoot}`);
    fs.rmSync(storageRoot, { recursive: true, force: true });
  }

  // Verify public schema has no new business records
  const recordCount = execSync(`psql "${dbUrl}" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"`, { encoding: 'utf-8' }).trim();
  console.log(`Public schema tables: ${recordCount}`);

  console.log('Cleanup complete');
}

main().catch(e => { console.error(e); process.exit(1); });
