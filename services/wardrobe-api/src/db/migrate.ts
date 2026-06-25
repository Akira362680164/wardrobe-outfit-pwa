import path from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { getDb } from "./client.js";

export function getMigrationsFolder() {
  return path.resolve(process.cwd(), "migrations");
}

export async function runMigrations() {
  await migrate(getDb(), { migrationsFolder: getMigrationsFolder() });
}
