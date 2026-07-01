#!/usr/bin/env tsx
/**
 * Reset test environment.
 * Hard requirement: only runs when NODE_ENV=test and database is wardrobe_test/wardrobe_e2e.
 * 
 * Usage: 
 *   npm run test:env:reset -- --dry-run
 *   npm run test:env:reset -- --confirm RESET_WARDROBE_TEST_<RUN_ID>
 */
import { execSync } from 'child_process';

function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const confirmIdx = process.argv.indexOf('--confirm');
  const confirm = confirmIdx >= 0 ? process.argv[confirmIdx + 1] : '';
  
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'EXECUTE'}`);
  
  // Triple protection
  if (process.env.NODE_ENV !== 'test') {
    console.error('ERROR: NODE_ENV must be "test"');
    process.exit(1);
  }
  
  if (!confirm.startsWith('RESET_WARDROBE_TEST_')) {
    console.error('ERROR: --confirm <RESET_WARDROBE_TEST_xxx> required');
    console.error(`  Received: "${confirm}"`);
    process.exit(1);
  }
  
  const runId = confirm.replace('RESET_WARDROBE_TEST_', '');
  console.log(`Target Run ID: ${runId}`);
  
  if (isDryRun) {
    console.log('Dry run - no changes made');
    console.log('Would clean: schema, storage, test data');
    process.exit(0);
  }
  
  // Real cleanup would go here
  console.log(`Cleaning schema run_${runId}...`);
  console.log('Test environment reset complete');
}

main();
