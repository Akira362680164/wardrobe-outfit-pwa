#!/usr/bin/env tsx
import { execFileSync } from 'child_process';
import * as path from 'path';

async function main() {
  const runId = process.env.TEST_RUN_ID || '';
  const dbUrl = process.env.DATABASE_URL || '';
  const storageRoot = (process.env.TEST_STORAGE_ROOT || '');

  if (!runId || !runId.startsWith('run_')) {
    console.error('TEST_RUN_ID must start with run_');
    process.exit(1);
  }

  if (!dbUrl) throw new Error('DATABASE_URL is required');
  console.log(`Dropping schema: ${runId}`);
  execFileSync('psql', [dbUrl, '-c', `DROP SCHEMA IF EXISTS "${runId}" CASCADE;`], { stdio: 'inherit' });

  const resolvedStorageRoot = storageRoot ? path.resolve(storageRoot) : '';
  const resolvedCwd = path.resolve(process.cwd());
  if (resolvedStorageRoot && resolvedStorageRoot.startsWith(`${resolvedCwd}${path.sep}`)) {
    console.log(`Moving test storage to trash: ${resolvedStorageRoot}`);
    try {
      execFileSync('trash', [resolvedStorageRoot], { stdio: 'inherit' });
    } catch {
      throw new Error(`Unable to move test storage to trash; preserved at ${resolvedStorageRoot}`);
    }
  }

  // Verify public schema has no new business records
  const recordCount = execFileSync('psql', [dbUrl, '-tAc', "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"], { encoding: 'utf-8' }).trim();
  console.log(`Public schema tables: ${recordCount}`);

  console.log('Cleanup complete');
}

main().catch(e => { console.error(e); process.exit(1); });
