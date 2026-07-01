import { closeDatabase, getPostgresPool } from "../db/client.js";
import { createStorageProviderFromEnv } from "../storage/factory.js";
import { resetTestData } from "../admin/reset-test-data.js";

const execute = process.argv.includes("--execute");

try {
  const report = await resetTestData({
    pool: getPostgresPool(),
    storage: createStorageProviderFromEnv(),
    env: {
      WARDROBE_ENV: process.env.WARDROBE_ENV,
      ALLOW_TEST_DATA_RESET: process.env.ALLOW_TEST_DATA_RESET,
      RESET_CONFIRMATION: process.env.RESET_CONFIRMATION,
    },
    execute,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (execute && (!report.databaseCleared || !report.storageCleared)) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "reset failed"}\n`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
