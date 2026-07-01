#!/usr/bin/env tsx
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  const runId = process.env.TEST_RUN_ID || `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const dbUrl = process.env.DATABASE_URL || `postgresql:///${runId.replace('run_', 'wardrobe_test')}`;
  const schemaName = runId;
  const storageRoot = process.env.TEST_STORAGE_ROOT || path.join(process.cwd(), 'test-results', 'runtime', runId, 'storage');

  // Create directories
  fs.mkdirSync(storageRoot, { recursive: true });
  fs.mkdirSync(path.dirname(storageRoot), { recursive: true });

  // Log environment
  const envLog = { runId, dbUrl, schemaName, storageRoot, createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(path.dirname(storageRoot), 'environment.json'), JSON.stringify(envLog, null, 2));

  // Create schema
  console.log(`Creating schema: ${schemaName}`);
  execSync(`psql "${dbUrl}" -c "CREATE SCHEMA IF NOT EXISTS ${schemaName};"`, { stdio: 'inherit' });

  // Set search_path
  execSync(`psql "${dbUrl}" -c "ALTER DATABASE \\"$(echo $dbUrl | rev | cut -d/ -f1 | rev | cut -d? -f1)\\" SET search_path TO ${schemaName};"`, { stdio: 'inherit' });

  // Record schema before state
  execSync(`psql "${dbUrl}" -c "SELECT table_name FROM information_schema.tables WHERE table_schema='${schemaName}';" > "${path.dirname(storageRoot)}/schema-before.json"`, { shell: true });

  // Run migrations
  console.log('Running migrations...');
  const apiDir = path.join(process.cwd(), 'services/wardrobe-api');
  execSync(`cd "${apiDir}" && npm run migrate 2>&1`, { stdio: 'inherit', env: { ...process.env, DATABASE_URL: dbUrl } });

  // Record schema after state
  execSync(`psql "${dbUrl}" -c "SELECT table_name FROM information_schema.tables WHERE table_schema='${schemaName}';" > "${path.dirname(storageRoot)}/schema-after.json"`, { shell: true });

  console.log(`Schema ${schemaName} ready. Storage: ${storageRoot}`);
  console.log(`Run ID: ${runId}`);
  console.log(`DATABASE_URL=${dbUrl}`);
}

main().catch(e => { console.error(e); process.exit(1); });
