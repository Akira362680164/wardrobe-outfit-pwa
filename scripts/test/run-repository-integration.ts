#!/usr/bin/env tsx
/**
 * Runs repository integration tests against real PostgreSQL.
 * Requires:
 *   - PostgreSQL database wardrobe_test (or WARDROBE_TEST_DATABASE_URL)
 *   - Run ID for isolated schema
 * Usage: tsx scripts/test/run-repository-integration.ts [--run-id <id>]
 */
import { execSync } from 'child_process';

const RUN_ID = process.argv.includes('--run-id')
  ? process.argv[process.argv.indexOf('--run-id') + 1]
  : `run_${Date.now()}`;

async function main() {
  console.log(`Repository integration test (Run ID: ${RUN_ID})`);
  console.log('This test requires a running PostgreSQL instance.');
  console.log('');
  console.log('Setup:');
  console.log(`  1. CREATE SCHEMA IF NOT EXISTS ${RUN_ID};`);
  console.log('  2. Run migrations against the schema');
  console.log('  3. Set search_path to ' + RUN_ID);
  console.log('');
  console.log('Run:');
  console.log(`  WARDROBE_TEST_RUN_ID=${RUN_ID} npx vitest run tests/integration/repository/`);
  
  if (!process.env.WARDROBE_TEST_DATABASE_URL) {
    console.log('\nNo WARDROBE_TEST_DATABASE_URL set. Skipping real execution.');
    process.exit(0);
  }
  
  execSync(`WARDROBE_TEST_RUN_ID=${RUN_ID} npx vitest run tests/integration/repository/`, { stdio: 'inherit' });
}

main();
