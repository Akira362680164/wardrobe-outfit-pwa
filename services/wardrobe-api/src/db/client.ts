import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

let pool: Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;

export function assertSafeTestDatabaseUrl(
  databaseUrl: string,
  nodeEnv = process.env.NODE_ENV,
) {
  if (nodeEnv === "test" && databaseUrl.includes("111.231.98.86")) {
    throw new Error("Tests must not use production database");
  }
}

export function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  assertSafeTestDatabaseUrl(databaseUrl);
  return databaseUrl;
}

export function getPostgresPool() {
  pool ??= new Pool({
    connectionString: getDatabaseUrl(),
  });
  return pool;
}

export function getDb() {
  db ??= drizzle(getPostgresPool(), { schema });
  return db;
}

export async function checkDatabaseReady() {
  await getPostgresPool().query("select 1");
  getDb();
  return { database: "ready" as const };
}

export async function closeDatabase() {
  await pool?.end();
  pool = null;
  db = null;
}
