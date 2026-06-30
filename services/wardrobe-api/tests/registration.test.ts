import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { FixedWindowRateLimiter } from "../src/auth/rate-limit.js";
import {
  RegistrationService,
  type CompletedRegistration,
  type DirectRegistrationResult,
  type PendingRegistrationRecord,
  type RegistrationStatus,
  type RegistrationStore,
  type SecurityEventInput,
} from "../src/auth/registrations.js";
import {
  SessionService,
  type AccessTokenClaims,
  type AccessTokenIssuer,
  type RefreshTokenRecord,
  type SessionAccountRecord,
  type SessionStore,
  type SessionUserRecord,
} from "../src/auth/session.js";
import { AuthApiError, maskPhoneE164, normalizePhoneE164 } from "../src/auth/registrations.js";
import { hashPassword } from "../src/security/password.js";
import { hashToken } from "../src/security/token-hash.js";

class MemoryRegistrationStore implements RegistrationStore {
  readonly registrations = new Map<string, PendingRegistrationRecord>();
  readonly phoneIdentities = new Map<string, { userId: string; maskedPhone: string }>();
  readonly passwordHashes = new Map<string, string>();
  readonly sessions = new Map<string, { userId: string; deviceId: string }>();
  readonly events: SecurityEventInput[] = [];
  private userIdSeq = 0;

  async hasUserForPhone(phoneE164: string) {
    return this.phoneIdentities.has(phoneE164);
  }

  async cancelPendingRegistrations(phoneE164: string, now: Date) {
    for (const registration of this.registrations.values()) {
      if (registration.phoneE164 === phoneE164 && registration.status === "pending") {
        registration.status = "cancelled";
        registration.cancelledAt = now;
        registration.updatedAt = now;
      }
    }
  }

  async createPendingRegistration(input: {
    phoneE164: string; maskedPhone: string; passwordHash: string;
    clientSecretHash: string; expiresAt: Date; now: Date;
  }) {
    const registration: PendingRegistrationRecord = {
      id: randomUUID(), phoneE164: input.phoneE164, maskedPhone: input.maskedPhone,
      passwordHash: input.passwordHash, clientSecretHash: input.clientSecretHash,
      status: "pending", verificationSource: null, verifiedAt: null,
      expiresAt: input.expiresAt, completedAt: null, cancelledAt: null,
      createdAt: input.now, updatedAt: input.now,
    };
    this.registrations.set(registration.id, registration);
    return registration;
  }

  async findPendingRegistration(registrationId: string) {
    return this.registrations.get(registrationId) ?? null;
  }

  async markRegistrationExpired(registrationId: string, now: Date) {
    const r = this.registrations.get(registrationId);
    if (r && (r.status === "pending" || r.status === "verified")) {
      r.status = "expired"; r.updatedAt = now;
    }
  }

  async verifyPendingRegistrationWithDevelopmentCli(registrationId: string, now: Date) {
    const r = this.registrations.get(registrationId);
    if (!r || r.status !== "pending" || r.expiresAt <= now) return null;
    r.status = "verified"; r.verificationSource = "development_cli";
    r.verifiedAt = now; r.updatedAt = now;
    return r;
  }

  async completeRegistration(input: { registrationId: string; deviceId: string; now: Date }): Promise<CompletedRegistration | null> {
    const r = this.registrations.get(input.registrationId);
    if (!r || r.status !== "verified" || r.expiresAt <= input.now) return null;
    const userId = randomUUID(); const sessionId = randomUUID();
    r.status = "completed"; r.completedAt = input.now; r.updatedAt = input.now;
    this.phoneIdentities.set(r.phoneE164, { userId, maskedPhone: r.maskedPhone });
    this.passwordHashes.set(userId, r.passwordHash!);
    this.sessions.set(sessionId, { userId, deviceId: input.deviceId });
    return { userId, sessionId, deviceId: input.deviceId, maskedPhone: r.maskedPhone };
  }

  async recordSecurityEvent(input: SecurityEventInput) { this.events.push(input); }

  async createDirectRegistration(input: {
    phoneE164: string; maskedPhone: string; passwordHash: string; now: Date;
    deviceId: string;
  }): Promise<DirectRegistrationResult> {
    if (this.phoneIdentities.has(input.phoneE164)) {
      throw new AuthApiError(409, "phone_already_registered", "Phone is already registered");
    }
    const userId = `user-${++this.userIdSeq}`;
    this.phoneIdentities.set(input.phoneE164, { userId, maskedPhone: input.maskedPhone });
    this.passwordHashes.set(userId, input.passwordHash);
    return { userId, maskedPhone: input.maskedPhone };
  }
}

class MemoryAccessTokenIssuer implements AccessTokenIssuer {
  private index = 0;
  private readonly claimsByToken = new Map<string, AccessTokenClaims>();

  async sign(claims: AccessTokenClaims, _now: Date) {
    const accessToken = `access-${++this.index}`;
    this.claimsByToken.set(accessToken, claims);
    return { accessToken, expiresAt: new Date(Date.now() + 15 * 60 * 1000) };
  }

  async verify(accessToken: string) {
    const claims = this.claimsByToken.get(accessToken);
    if (!claims) throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "Invalid access token");
    return claims;
  }
}

class MemorySessionStore implements SessionStore {
  readonly usersByPhone = new Map<string, SessionUserRecord>();
  readonly sessions = new Map<string, SessionAccountRecord>();
  readonly refreshTokens = new Map<string, RefreshTokenRecord>();
  readonly events: SecurityEventInput[] = [];

  async addUser(userId: string, phoneE164: string, maskedPhone: string, password: string) {
    const user: SessionUserRecord = {
      userId, maskedPhone, passwordHash: await hashPassword(password), disabledAt: null,
    };
    this.usersByPhone.set(phoneE164, user);
    return user;
  }

  async findUserByPhone(phoneE164: string) { return this.usersByPhone.get(phoneE164) ?? null; }

  async createSessionWithRefreshToken(input: {
    userId: string; deviceId: string; deviceLabel?: string | null;
    refreshTokenHash: string; tokenFamilyId: string; refreshExpiresAt: Date; now: Date;
  }) {
    const user = this.usersByPhone.get(input.userId);
    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      userId: input.userId, maskedPhone: user?.maskedPhone ?? "****",
      disabledAt: null, sessionRevokedAt: null, deviceId: input.deviceId,
    });
    this.refreshTokens.set(input.refreshTokenHash, {
      id: randomUUID(), sessionId, userId: input.userId, deviceId: input.deviceId,
      tokenHash: input.refreshTokenHash, tokenFamilyId: input.tokenFamilyId,
      status: "active", absoluteExpiresAt: input.refreshExpiresAt, revokedAt: null,
      refreshRequestId: null, idempotencyCiphertext: null, idempotencyNonce: null,
      idempotencyAuthTag: null, idempotencyExpiresAt: null, sessionRevokedAt: null,
      userDisabledAt: null, maskedPhone: user?.maskedPhone ?? "****",
    });
    return { sessionId };
  }

  async createRefreshTokenForSession() {}
  async findRefreshTokenByHash(_tokenHash: string): Promise<RefreshTokenRecord | null> { return null; }
  async rotateActiveRefreshToken(): Promise<boolean> { return false; }
  async revokeRefreshFamily() {}
  async revokeSession() {}
  async revokeAllSessions() {}
  async getAccountSession(): Promise<SessionAccountRecord | null> { return null; }
  async getPasswordCredential(): Promise<{ passwordHash: string } | null> { return null; }
  async changePasswordAndRevokeOtherSessions() {}
  async recordSecurityEvent(input: SecurityEventInput) { this.events.push(input); }
}

function makeFixture(options: { maxAttempts?: number; now?: Date } = {}) {
  const store = new MemoryRegistrationStore();
  const now = options.now ?? new Date("2026-06-26T00:00:00.000Z");
  const service = new RegistrationService({
    store,
    now: () => now,
    limiter: new FixedWindowRateLimiter({
      maxAttempts: options.maxAttempts ?? 5,
      windowMs: 15 * 60 * 1000,
    }),
  });
  return { service, store, now };
}

function makeAppFixture() {
  const regStore = new MemoryRegistrationStore();
  const sessStore = new MemorySessionStore();
  const registrationService = new RegistrationService({ store: regStore });
  const sessionService = new SessionService({
    store: sessStore,
    tokenIssuer: new MemoryAccessTokenIssuer(),
  });
  const app = buildApp({
    readinessCheck: async () => ({ database: "ready" }),
    registrationService,
    sessionService,
  });
  return { app, regStore, sessStore, registrationService, sessionService };
}

describe("direct registration API", () => {
  it("registers a new user and returns access + refresh tokens", async () => {
    const { app, regStore } = makeAppFixture();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { phone: "13812345678", password: "test-password-123", deviceId: "device-a", deviceLabel: "Android 手机" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.maskedPhone).toBe("138****5678");
    expect(body.user.id).toBeTruthy();
    // verify no pending registration artifacts in response
    expect(body.registrationId).toBeUndefined();
    expect(body.clientSecret).toBeUndefined();
    expect(body.status).toBeUndefined();
    // verify phone_identity created
    expect(regStore.phoneIdentities.has("+8613812345678")).toBe(true);

    await app.close();
  });

  it("records registration.succeeded security event", async () => {
    const { app, regStore } = makeAppFixture();
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { phone: "13812345678", password: "test-password-123", deviceId: "device-a" },
    });
    expect(regStore.events.map((e) => e.eventType)).toContain("registration.succeeded");
    await app.close();
  });

  it("returns 409 for duplicate phone", async () => {
    const { app } = makeAppFixture();
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { phone: "13812345678", password: "test-password-123", deviceId: "device-a" },
    });
    const dup = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { phone: "13812345678", password: "test-password-456", deviceId: "device-b" },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toMatchObject({ code: "phone_already_registered" });
    await app.close();
  });

  it("returns 400 for invalid phone", async () => {
    const { app } = makeAppFixture();
    const r = await app.inject({
      method: "POST", url: "/api/auth/register",
      payload: { phone: "abc", password: "test-password-123", deviceId: "device-a" },
    });
    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 for password shorter than 8", async () => {
    const { app } = makeAppFixture();
    const r = await app.inject({
      method: "POST", url: "/api/auth/register",
      payload: { phone: "13812345678", password: "1234567", deviceId: "device-a" },
    });
    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 for missing deviceId", async () => {
    const { app } = makeAppFixture();
    const r = await app.inject({
      method: "POST", url: "/api/auth/register",
      payload: { phone: "13812345678", password: "test-password-123" },
    });
    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it("returns 429 after exceeding rate limit", async () => {
    const { service, store } = makeFixture({ maxAttempts: 1 });
    await service.directRegister({
      phone: "13812345678", password: "test-password-123",
      deviceId: "device-a", rateLimitKey: "test-ip", ip: "1.2.3.4",
    });
    await expect(
      service.directRegister({
        phone: "13812345678", password: "test-password-456",
        deviceId: "device-a", rateLimitKey: "test-ip", ip: "1.2.3.4",
      }),
    ).rejects.toMatchObject({ code: "rate_limited", statusCode: 429 });
  });

  it("creates password hash not in plain text", async () => {
    const { app, regStore } = makeAppFixture();
    await app.inject({
      method: "POST", url: "/api/auth/register",
      payload: { phone: "13812345678", password: "my-secret-pass", deviceId: "device-a" },
    });
    const hash = regStore.passwordHashes.get("user-1");
    expect(hash).toContain("$argon2id$");
    expect(hash).not.toContain("my-secret-pass");
    await app.close();
  });
});

describe("direct registration service", () => {
  it("creates user, phone_identity and password_credential in one transaction", async () => {
    const { service, store } = makeFixture();
    const result = await service.directRegister({
      phone: "13812345678", password: "test-password-123",
      deviceId: "device-a", rateLimitKey: "test-ip", ip: "1.2.3.4",
    });
    expect(result.userId).toBeTruthy();
    expect(result.maskedPhone).toBe("138****5678");
    expect(store.phoneIdentities.has("+8613812345678")).toBe(true);
    expect(store.passwordHashes.get(result.userId)).toContain("$argon2id$");
    expect(store.events.map((e) => e.eventType)).toContain("registration.succeeded");
  });

  it("throws phone_already_registered for duplicate phone", async () => {
    const { service } = makeFixture();
    await service.directRegister({
      phone: "13812345678", password: "test-password-123",
      deviceId: "device-a", rateLimitKey: "test-ip",
    });
    await expect(
      service.directRegister({
        phone: "13812345678", password: "test-password-456",
        deviceId: "device-a", rateLimitKey: "test-ip",
      }),
    ).rejects.toMatchObject({ code: "phone_already_registered", statusCode: 409 });
  });
});
