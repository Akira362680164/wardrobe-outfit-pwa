import { randomBytes, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { FixedWindowRateLimiter } from "../src/auth/rate-limit.js";
import {
  SessionService,
  type AccessTokenClaims,
  type AccessTokenIssuer,
  type RefreshTokenRecord,
  type SessionAccountRecord,
  type SessionStore,
  type SessionUserRecord,
} from "../src/auth/session.js";
import { AuthApiError, maskPhoneE164, normalizePhoneE164, type SecurityEventInput } from "../src/auth/registrations.js";
import { hashPassword } from "../src/security/password.js";
import { hashToken } from "../src/security/token-hash.js";

class MemoryAccessTokenIssuer implements AccessTokenIssuer {
  private index = 0;
  private readonly claimsByToken = new Map<string, AccessTokenClaims>();

  async sign(claims: AccessTokenClaims, now: Date) {
    const accessToken = `access-${++this.index}`;
    this.claimsByToken.set(accessToken, claims);
    return {
      accessToken,
      expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
    };
  }

  async verify(accessToken: string) {
    const claims = this.claimsByToken.get(accessToken);
    if (!claims) throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "Invalid access token");
    return claims;
  }
}

class MemorySessionStore implements SessionStore {
  readonly usersByPhone = new Map<string, SessionUserRecord>();
  readonly usersById = new Map<string, SessionUserRecord>();
  readonly credentialsByUserId = new Map<string, { passwordHash: string }>();
  readonly sessions = new Map<string, SessionAccountRecord>();
  readonly refreshTokens = new Map<string, RefreshTokenRecord>();
  readonly events: SecurityEventInput[] = [];

  async addUser(phone: string, password: string) {
    const phoneE164 = normalizePhoneE164(phone);
    const user: SessionUserRecord = {
      userId: randomUUID(),
      maskedPhone: maskPhoneE164(phoneE164),
      passwordHash: await hashPassword(password),
      disabledAt: null,
    };
    this.usersByPhone.set(phoneE164, user);
    this.usersById.set(user.userId, user);
    this.credentialsByUserId.set(user.userId, { passwordHash: user.passwordHash });
    return user;
  }

  async findUserByPhone(phoneE164: string) {
    return this.usersByPhone.get(phoneE164) ?? null;
  }

  async createSessionWithRefreshToken(input: {
    userId: string;
    deviceId: string;
    refreshTokenHash: string;
    tokenFamilyId: string;
    refreshExpiresAt: Date;
    now: Date;
  }) {
    const user = this.usersById.get(input.userId);
    if (!user) throw new Error("missing user");

    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      userId: input.userId,
      maskedPhone: user.maskedPhone,
      disabledAt: user.disabledAt,
      sessionRevokedAt: null,
      deviceId: input.deviceId,
    });
    this.refreshTokens.set(input.refreshTokenHash, {
      id: randomUUID(),
      sessionId,
      userId: input.userId,
      deviceId: input.deviceId,
      tokenHash: input.refreshTokenHash,
      tokenFamilyId: input.tokenFamilyId,
      status: "active",
      absoluteExpiresAt: input.refreshExpiresAt,
      revokedAt: null,
      refreshRequestId: null,
      idempotencyCiphertext: null,
      idempotencyNonce: null,
      idempotencyAuthTag: null,
      idempotencyExpiresAt: null,
      sessionRevokedAt: null,
      userDisabledAt: user.disabledAt,
      maskedPhone: user.maskedPhone,
    });
    return { sessionId };
  }

  async createRefreshTokenForSession(input: {
    sessionId: string;
    refreshTokenHash: string;
    tokenFamilyId: string;
    refreshExpiresAt: Date;
    now: Date;
  }) {
    const session = this.sessions.get(input.sessionId);
    if (!session) throw new Error("missing session");
    this.refreshTokens.set(input.refreshTokenHash, {
      id: randomUUID(),
      sessionId: input.sessionId,
      userId: session.userId,
      deviceId: session.deviceId,
      tokenHash: input.refreshTokenHash,
      tokenFamilyId: input.tokenFamilyId,
      status: "active",
      absoluteExpiresAt: input.refreshExpiresAt,
      revokedAt: null,
      refreshRequestId: null,
      idempotencyCiphertext: null,
      idempotencyNonce: null,
      idempotencyAuthTag: null,
      idempotencyExpiresAt: null,
      sessionRevokedAt: session.sessionRevokedAt,
      userDisabledAt: session.disabledAt,
      maskedPhone: session.maskedPhone,
    });
  }

  async findRefreshTokenByHash(tokenHash: string) {
    const token = this.refreshTokens.get(tokenHash);
    if (!token) return null;
    const session = this.sessions.get(token.sessionId);
    return session
      ? {
          ...token,
          sessionRevokedAt: session.sessionRevokedAt,
          userDisabledAt: session.disabledAt,
          maskedPhone: session.maskedPhone,
        }
      : null;
  }

  async rotateActiveRefreshToken(input: {
    oldRefreshTokenHash: string;
    refreshRequestId: string;
    idempotency: {
      ciphertext: string;
      nonce: string;
      authTag: string;
      expiresAt: Date;
    };
    newRefreshTokenHash: string;
    newRefreshExpiresAt: Date;
    now: Date;
  }) {
    const old = this.refreshTokens.get(input.oldRefreshTokenHash);
    if (!old || old.status !== "active") return false;

    old.status = "used";
    old.refreshRequestId = input.refreshRequestId;
    old.idempotencyCiphertext = input.idempotency.ciphertext;
    old.idempotencyNonce = input.idempotency.nonce;
    old.idempotencyAuthTag = input.idempotency.authTag;
    old.idempotencyExpiresAt = input.idempotency.expiresAt;

    this.refreshTokens.set(input.newRefreshTokenHash, {
      ...old,
      id: randomUUID(),
      tokenHash: input.newRefreshTokenHash,
      status: "active",
      absoluteExpiresAt: input.newRefreshExpiresAt,
      revokedAt: null,
      refreshRequestId: null,
      idempotencyCiphertext: null,
      idempotencyNonce: null,
      idempotencyAuthTag: null,
      idempotencyExpiresAt: null,
    });
    return true;
  }

  async revokeRefreshFamily(tokenFamilyId: string, now: Date) {
    for (const token of this.refreshTokens.values()) {
      if (token.tokenFamilyId === tokenFamilyId) {
        token.status = "revoked";
        token.revokedAt = now;
      }
    }
  }

  async revokeSession(sessionId: string, now: Date) {
    const session = this.sessions.get(sessionId);
    if (session) session.sessionRevokedAt = now;
    for (const token of this.refreshTokens.values()) {
      if (token.sessionId === sessionId) {
        token.status = "revoked";
        token.revokedAt = now;
      }
    }
  }

  async revokeAllSessions(userId: string, now: Date) {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) await this.revokeSession(sessionId, now);
    }
  }

  async getAccountSession(userId: string, sessionId: string) {
    const session = this.sessions.get(sessionId);
    return session?.userId === userId ? session : null;
  }

  async getPasswordCredential(userId: string) {
    return this.credentialsByUserId.get(userId) ?? null;
  }

  async changePasswordAndRevokeOtherSessions(input: {
    userId: string;
    currentSessionId: string;
    newPasswordHash: string;
    now: Date;
  }) {
    this.credentialsByUserId.set(input.userId, { passwordHash: input.newPasswordHash });
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === input.userId && sessionId !== input.currentSessionId) {
        await this.revokeSession(sessionId, input.now);
      }
    }
  }

  async recordSecurityEvent(input: SecurityEventInput) {
    this.events.push(input);
  }
}

function makeFixture(options: { loginMaxAttempts?: number; refreshMaxAttempts?: number } = {}) {
  const store = new MemorySessionStore();
  const now = new Date("2026-06-26T00:00:00.000Z");
  const service = new SessionService({
    store,
    tokenIssuer: new MemoryAccessTokenIssuer(),
    refreshIdempotencyKey: randomBytes(32),
    now: () => now,
    loginLimiter: new FixedWindowRateLimiter({
      maxAttempts: options.loginMaxAttempts ?? 5,
      windowMs: 15 * 60 * 1000,
    }),
    refreshLimiter: new FixedWindowRateLimiter({
      maxAttempts: options.refreshMaxAttempts ?? 20,
      windowMs: 60 * 1000,
    }),
  });
  const app = buildApp({
    readinessCheck: async () => ({ database: "ready" }),
    sessionService: service,
  });
  return { app, store };
}

async function login(app: ReturnType<typeof buildApp>, phone = "+8613812345678", deviceId = "device-a") {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      phone,
      password: "test-password-123",
      deviceId,
    },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    accessToken: string;
    refreshToken: string;
    user: { id: string; maskedPhone: string };
  };
}

describe("session API", () => {
  it("uses a unified error for wrong passwords and keeps audit events redacted", async () => {
    const { app, store } = makeFixture();
    const user = await store.addUser("+8613812345678", "test-password-123");

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        phone: "+8613812345678",
        password: "wrong-password",
        deviceId: "device-a",
      },
    });

    const events = JSON.stringify(store.events);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "invalid_credentials" });
    expect(events).toContain("138****5678");
    expect(events).not.toContain("+8613812345678");
    expect(events).not.toContain(user.passwordHash);
    expect(events).not.toContain("wrong-password");
    expect(events).not.toMatch(/access-|refreshToken|refresh-token/);

    await app.close();
  });

  it("rate limits session endpoints with retryAfterSeconds", async () => {
    const { app, store } = makeFixture({ loginMaxAttempts: 1 });
    await store.addUser("+8613812345678", "test-password-123");

    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { phone: "+8613812345678", password: "wrong-password", deviceId: "device-a" },
    });
    const limited = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { phone: "+8613812345678", password: "wrong-password", deviceId: "device-a" },
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.json().retryAfterSeconds).toBeGreaterThan(0);

    await app.close();
  });

  it("refreshes tokens and returns the same result for the same lost-response retry", async () => {
    const { app, store } = makeFixture();
    await store.addUser("+8613812345678", "test-password-123");
    const first = await login(app);
    const refreshRequestId = randomUUID();

    const rotated = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: {
        refreshToken: first.refreshToken,
        refreshRequestId,
        deviceId: "device-a",
      },
    });
    const retry = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: {
        refreshToken: first.refreshToken,
        refreshRequestId,
        deviceId: "device-a",
      },
    });

    expect(rotated.statusCode).toBe(200);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(rotated.json());
    expect(store.refreshTokens.get(hashToken(first.refreshToken))?.status).toBe("used");

    await app.close();
  });

  it("treats a used refresh token with a different request id as replay", async () => {
    const { app, store } = makeFixture();
    await store.addUser("+8613812345678", "test-password-123");
    const first = await login(app);
    const rotated = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: {
        refreshToken: first.refreshToken,
        refreshRequestId: randomUUID(),
        deviceId: "device-a",
      },
    });
    const replay = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: {
        refreshToken: first.refreshToken,
        refreshRequestId: randomUUID(),
        deviceId: "device-a",
      },
    });

    const nextRefreshToken = rotated.json().refreshToken as string;
    expect(replay.statusCode).toBe(403);
    expect(replay.json()).toMatchObject({ code: "AUTH_REFRESH_REUSED" });
    expect(store.refreshTokens.get(hashToken(nextRefreshToken))?.status).toBe("revoked");

    await app.close();
  });

  it("revokes other devices after changing password", async () => {
    const { app, store } = makeFixture();
    await store.addUser("+8613812345678", "test-password-123");
    const deviceA = await login(app, "+8613812345678", "device-a");
    const deviceB = await login(app, "+8613812345678", "device-b");

    const changed = await app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { authorization: `Bearer ${deviceA.accessToken}` },
      payload: {
        currentPassword: "test-password-123",
        newPassword: "new-password-456",
      },
    });
    const currentMe = await app.inject({
      method: "GET",
      url: "/api/account/me",
      headers: { authorization: `Bearer ${deviceA.accessToken}` },
    });
    const otherMe = await app.inject({
      method: "GET",
      url: "/api/account/me",
      headers: { authorization: `Bearer ${deviceB.accessToken}` },
    });

    expect(changed.statusCode).toBe(200);
    expect(currentMe.statusCode).toBe(200);
    expect(otherMe.statusCode).toBe(401);

    await app.close();
  });

  it("returns account/me and revokes the current session on logout", async () => {
    const { app, store } = makeFixture();
    await store.addUser("+8613812345678", "test-password-123");
    const tokens = await login(app);
    const me = await app.inject({
      method: "GET",
      url: "/api/account/me",
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const afterLogout = await app.inject({
      method: "GET",
      url: "/api/account/me",
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ user: { maskedPhone: "138****5678" }, deviceId: "device-a" });
    expect(logout.statusCode).toBe(200);
    expect(afterLogout.statusCode).toBe(401);

    await app.close();
  });
});
