import { lte } from "drizzle-orm";

import { getDb } from "../db/client.js";
import { refreshTokens } from "../db/schema.js";

export async function cleanupExpiredRefreshIdempotencyPayloads(now = new Date()) {
  const rows = await getDb()
    .update(refreshTokens)
    .set({
      idempotencyCiphertext: null,
      idempotencyNonce: null,
      idempotencyAuthTag: null,
      idempotencyExpiresAt: null,
    })
    .where(lte(refreshTokens.idempotencyExpiresAt, now))
    .returning({ id: refreshTokens.id });

  return rows.length;
}
