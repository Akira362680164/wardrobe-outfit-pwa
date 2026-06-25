import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";

export const REFRESH_IDEMPOTENCY_WINDOW_MS = 60_000;
export const REFRESH_IDEMPOTENCY_KEY_PATH = "/run/secrets/refresh-idempotency.key";

export interface RefreshIdempotencyScope {
  sessionId: string;
  oldRefreshTokenHash: string;
  refreshRequestId: string;
  deviceId: string;
}

export interface EncryptedRefreshIdempotencyPayload {
  ciphertext: string;
  nonce: string;
  authTag: string;
  expiresAt: Date;
}

export function parseRefreshIdempotencyKey(raw: Buffer | string) {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8").trim() : raw.trim();
  const candidates = [
    Buffer.isBuffer(raw) ? raw : Buffer.from(raw),
    Buffer.from(text, "base64"),
    Buffer.from(text, "hex"),
  ];
  const key = candidates.find((candidate) => candidate.length === 32);
  if (!key) {
    throw new Error("refresh idempotency key must be 32 bytes");
  }
  return key;
}

export async function loadRefreshIdempotencyKey(path = REFRESH_IDEMPOTENCY_KEY_PATH) {
  return parseRefreshIdempotencyKey(await readFile(path));
}

export function buildRefreshIdempotencyAad(scope: RefreshIdempotencyScope) {
  return Buffer.from(
    [
      scope.sessionId,
      scope.oldRefreshTokenHash,
      scope.refreshRequestId,
      scope.deviceId,
    ].join("\n"),
    "utf8",
  );
}

export function encryptRefreshIdempotencyPayload(
  key: Buffer,
  scope: RefreshIdempotencyScope,
  payload: unknown,
  now = new Date(),
): EncryptedRefreshIdempotencyPayload {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(buildRefreshIdempotencyAad(scope));

  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64url"),
    nonce: nonce.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    expiresAt: new Date(now.getTime() + REFRESH_IDEMPOTENCY_WINDOW_MS),
  };
}

export function decryptRefreshIdempotencyPayload<T>(
  key: Buffer,
  scope: RefreshIdempotencyScope,
  encrypted: EncryptedRefreshIdempotencyPayload,
  now = new Date(),
): T {
  if (encrypted.expiresAt.getTime() <= now.getTime()) {
    throw new Error("refresh idempotency payload expired");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encrypted.nonce, "base64url"),
  );
  decipher.setAAD(buildRefreshIdempotencyAad(scope));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf8")) as T;
}

export function sameRefreshRetryScope(a: RefreshIdempotencyScope, b: RefreshIdempotencyScope) {
  const left = buildRefreshIdempotencyAad(a);
  const right = buildRefreshIdempotencyAad(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
