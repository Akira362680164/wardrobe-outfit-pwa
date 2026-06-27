import { createHash, timingSafeEqual } from "node:crypto";

export interface ReaderAuthConfig {
  tokenHash: string;
  tokenId: string;
}

export function loadReaderAuthConfig(env: Record<string, string | undefined> = process.env): ReaderAuthConfig | null {
  const tokenHash = env.DIAGNOSTIC_READER_TOKEN_HASH?.trim();
  const tokenId = env.DIAGNOSTIC_READER_TOKEN_ID?.trim();
  if (!tokenHash || !tokenId) return null;
  return { tokenHash, tokenId };
}

export function hashReaderToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyReaderToken(token: string, expectedHash: string): boolean {
  const actualHash = hashReaderToken(token);
  if (actualHash.length !== expectedHash.length) return false;
  try {
    return timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash));
  } catch {
    return false;
  }
}
