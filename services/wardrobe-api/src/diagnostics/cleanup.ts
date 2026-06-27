import { and, eq, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb } from "../db/client.js";
import { diagnosticCases, diagnosticAccessAudits, diagnosticCaseRequestTraces } from "../db/schema.js";
import type * as schema from "../db/schema.js";
import { createStorageProviderFromEnv } from "../storage/factory.js";
import type { StorageProvider } from "../storage/provider.js";

export async function cleanupExpiredDiagnosticCases(db?: NodePgDatabase<typeof schema>, injectedStorage?: StorageProvider | null): Promise<void> {
  const database = db ?? getDb();
  const storage = injectedStorage === undefined ? createStorageProviderFromEnv() : injectedStorage;
  const now = new Date();

  // 1. 清理 pending_upload 超过 24 小时的
  const pendingCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const pendingRows = await database
    .select({ id: diagnosticCases.id, caseId: diagnosticCases.caseId, storageKey: diagnosticCases.storageKey })
    .from(diagnosticCases)
    .where(
      and(
        eq(diagnosticCases.status, "pending_upload"),
        lte(diagnosticCases.uploadCreatedAt, pendingCutoff),
      ),
    );

  for (const row of pendingRows) {
    try {
      if (storage && row.storageKey) await storage.delete(row.storageKey);
      await database.delete(diagnosticCaseRequestTraces).where(eq(diagnosticCaseRequestTraces.diagnosticCaseId, row.id));
      await database.delete(diagnosticAccessAudits).where(eq(diagnosticAccessAudits.caseId, row.caseId));
      await database.delete(diagnosticCases).where(eq(diagnosticCases.id, row.id));
    } catch (err) {
      console.error("[cleanup] failed to clean pending case:", row.id, err instanceof Error ? err.message : String(err));
    }
  }

  // 2. 清理 uploaded 且已过期的
  const expiredRows = await database
    .select({ id: diagnosticCases.id, storageKey: diagnosticCases.storageKey, caseId: diagnosticCases.caseId })
    .from(diagnosticCases)
    .where(
      and(
        eq(diagnosticCases.status, "uploaded"),
        sql`${diagnosticCases.expiresAt} IS NOT NULL`,
        lte(diagnosticCases.expiresAt, now),
      ),
    );

  for (const row of expiredRows) {
    try {
      if (storage && row.storageKey) await storage.delete(row.storageKey);
      await database.delete(diagnosticCaseRequestTraces).where(eq(diagnosticCaseRequestTraces.diagnosticCaseId, row.id));
      await database.delete(diagnosticAccessAudits).where(eq(diagnosticAccessAudits.caseId, row.caseId));
      await database.delete(diagnosticCases).where(eq(diagnosticCases.id, row.id));
    } catch (err) {
      console.error("[cleanup] failed to clean expired case:", row.id, err instanceof Error ? err.message : String(err));
    }
  }
}
