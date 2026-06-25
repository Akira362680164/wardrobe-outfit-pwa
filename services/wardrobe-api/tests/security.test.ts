import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getMigrationsFolder } from "../src/db/migrate.js";
import { ARGON2ID_OPTIONS, hashPassword, verifyPassword } from "../src/security/password.js";
import {
  decryptRefreshIdempotencyPayload,
  encryptRefreshIdempotencyPayload,
  parseRefreshIdempotencyKey,
  REFRESH_IDEMPOTENCY_WINDOW_MS,
  sameRefreshRetryScope,
  type RefreshIdempotencyScope,
} from "../src/security/refresh-idempotency.js";
import { generateOpaqueToken, hashToken } from "../src/security/token-hash.js";
import { importJwtKeyPairFromPem, JWT_ALGORITHM } from "../src/security/jwt-keys.js";
import { redactedLogSerializer } from "../src/shared/redact.js";

describe("auth schema migration", () => {
  it("contains the A2 authentication tables and no wechat identity table", () => {
    const migration = readFileSync(
      path.join(getMigrationsFolder(), "0000_auth_schema.sql"),
      "utf8",
    );

    for (const table of [
      "users",
      "phone_identities",
      "password_credentials",
      "pending_registrations",
      "device_sessions",
      "refresh_tokens",
      "account_security_events",
    ]) {
      expect(migration).toContain(`CREATE TABLE ${table}`);
    }

    expect(migration).not.toContain("wechat_identities");
    expect(migration).toContain("idempotency_ciphertext");
    expect(migration).toContain("idempotency_nonce");
    expect(migration).toContain("idempotency_auth_tag");
    expect(migration).toContain("idempotency_expires_at");
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  });
});

describe("password hashing", () => {
  it("uses Argon2id and verifies passwords", async () => {
    expect(ARGON2ID_OPTIONS.type).toBe(2);

    const hash = await hashPassword("test-password-123");

    expect(hash).toContain("$argon2id$");
    expect(hash).not.toContain("test-password-123");
    await expect(verifyPassword(hash, "test-password-123")).resolves.toBe(true);
    await expect(verifyPassword(hash, "wrong-password")).resolves.toBe(false);
  });
});

describe("token hashing", () => {
  it("generates opaque tokens and hashes without storing plaintext", () => {
    const token = generateOpaqueToken();
    const hash = hashToken(token);

    expect(token).not.toHaveLength(0);
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token);
  });
});

describe("JWT key loading", () => {
  it("imports PEM key pairs without committing key material", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });

    const keys = await importJwtKeyPairFromPem(privateKey, publicKey);

    expect(JWT_ALGORITHM).toBe("RS256");
    expect(keys.privateKey.type).toBe("private");
    expect(keys.publicKey.type).toBe("public");
  });
});

describe("refresh idempotency encryption", () => {
  const scope: RefreshIdempotencyScope = {
    sessionId: "session-a",
    oldRefreshTokenHash: "old-token-hash",
    refreshRequestId: "refresh-request-id",
    deviceId: "device-a",
  };

  it("encrypts retry payloads with a 60 second window", () => {
    const key = parseRefreshIdempotencyKey(randomBytes(32));
    const now = new Date("2026-06-26T00:00:00.000Z");
    const payload = {
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    };

    const encrypted = encryptRefreshIdempotencyPayload(key, scope, payload, now);

    expect(REFRESH_IDEMPOTENCY_WINDOW_MS).toBe(60_000);
    expect(encrypted.ciphertext).not.toContain(payload.refreshToken);
    expect(encrypted.expiresAt.toISOString()).toBe("2026-06-26T00:01:00.000Z");
    expect(
      decryptRefreshIdempotencyPayload<typeof payload>(
        key,
        scope,
        encrypted,
        new Date("2026-06-26T00:00:30.000Z"),
      ),
    ).toEqual(payload);
  });

  it("rejects a different device even with the same refresh request id", () => {
    const key = parseRefreshIdempotencyKey(randomBytes(32));
    const encrypted = encryptRefreshIdempotencyPayload(key, scope, { refreshToken: "next" });

    expect(() =>
      decryptRefreshIdempotencyPayload(key, { ...scope, deviceId: "device-b" }, encrypted),
    ).toThrow();
    expect(sameRefreshRetryScope(scope, { ...scope })).toBe(true);
    expect(sameRefreshRetryScope(scope, { ...scope, deviceId: "device-b" })).toBe(false);
  });
});

describe("redacted log serializer", () => {
  it("removes secrets and masks phone numbers", () => {
    const redacted = redactedLogSerializer({
      phone: "+8613812345678",
      passwordHash: "argon2hash",
      nested: {
        refreshToken: "refresh-token",
        accessToken: "access-token",
        clientSecret: "client-secret",
      },
    });

    expect(JSON.stringify(redacted)).not.toContain("+8613812345678");
    expect(JSON.stringify(redacted)).not.toContain("argon2hash");
    expect(JSON.stringify(redacted)).not.toContain("refresh-token");
    expect(JSON.stringify(redacted)).toContain("861****5678");
  });
});
