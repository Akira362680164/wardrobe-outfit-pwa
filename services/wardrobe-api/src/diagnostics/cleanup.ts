import { and, eq, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb } from "../db/client.js";
import { diagnosticCases, diagnosticAccessAudits, diagnosticCaseRequestTraces } from "../db/schema.js";
import type * as schema from "../db/schema.js";
import { createCosDeleteObjectPresignedUrl, loadCosConfig } from "../storage/cos.js";

export async function cleanupExpiredDiagnosticCases(db?: NodePgDatabase<typeof schema>): Promise<void> {
  const database = db ?? getDb();
  const cosConfig = loadCosConfig();
  const now = new Date();

  // 1. 清理 pending_upload 超过 24 小时的
  const pendingCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const pendingRows = await database
    .select({ id: diagnosticCases.id, objectKey: diagnosticCases.objectKey })
    .from(diagnosticCases)
    .where(
      and(
        eq(diagnosticCases.status, "pending_upload"),
        lte(diagnosticCases.uploadAuthorizedAt, pendingCutoff),
      ),
    );

  for (const row of pendingRows) {
    try {
      if (cosConfig && row.objectKey) {
        await deleteCosObject(cosConfig, row.objectKey);
      }
      await database.delete(diagnosticCaseRequestTraces).where(eq(diagnosticCaseRequestTraces.diagnosticCaseId, row.id));
      await database.delete(diagnosticAccessAudits).where(eq(diagnosticAccessAudits.caseId, row.id));
      await database.delete(diagnosticCases).where(eq(diagnosticCases.id, row.id));
    } catch (err) {
      console.error("[cleanup] failed to clean pending case:", row.id, err instanceof Error ? err.message : String(err));
    }
  }

  // 2. 清理 uploaded 且已过期的
  const expiredRows = await database
    .select({ id: diagnosticCases.id, objectKey: diagnosticCases.objectKey, caseId: diagnosticCases.caseId })
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
      if (cosConfig && row.objectKey) {
        await deleteCosObject(cosConfig, row.objectKey);
      }
      await database.delete(diagnosticCaseRequestTraces).where(eq(diagnosticCaseRequestTraces.diagnosticCaseId, row.id));
      await database.delete(diagnosticAccessAudits).where(eq(diagnosticAccessAudits.caseId, row.caseId));
      await database.delete(diagnosticCases).where(eq(diagnosticCases.id, row.id));
    } catch (err) {
      console.error("[cleanup] failed to clean expired case:", row.id, err instanceof Error ? err.message : String(err));
    }
  }
}

async function deleteCosObject(config: NonNullable<ReturnType<typeof loadCosConfig>>, objectKey: string): Promise<void> {
  const deleteUrl = createCosDeleteObjectPresignedUrl({
    config,
    objectKey,
    now: new Date(),
  });
  const response = await fetch(deleteUrl, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`COS DELETE failed: ${response.status}`);
  }
}
