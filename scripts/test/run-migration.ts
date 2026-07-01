#!/usr/bin/env tsx
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as path from "path";

async function main() {
  const dbUrl = process.env.DATABASE_URL || "postgresql:///wardrobe_test";
  const schemaName = process.env.TEST_RUN_ID || "public";
  
  console.log(`Migrating ${dbUrl} schema=${schemaName}`);
  
  const pool = new Pool({ connectionString: dbUrl });
  
  // Set search path
  await pool.query(`SET search_path TO ${schemaName}`);
  
  const db = drizzle(pool);
  
  await migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), "services/wardrobe-api/migrations"),
  });
  
  console.log("Migration complete");
  await pool.end();
}

main().catch(e => { console.error("Migration failed:", e); process.exit(1); });
