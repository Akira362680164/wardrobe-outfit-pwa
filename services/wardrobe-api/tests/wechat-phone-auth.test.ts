import { randomBytes, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { type SecurityEventInput } from "../src/auth/registrations.js";
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
import {
  WechatPhoneAuthService,
  type WechatAuthStore,
  type WechatClient,
  type WechatSessionResult,
} from "../src/auth/wechat-phone.js";
import { AuthApiError, maskPhoneE164, normalizePhoneE164 } from "../src/auth/registrations.js";
import { hashToken } from "../src/security/token-hash.js";

class MemoryAccessTokenIssuer implements AccessTokenIssuer {
  private index = 0;
  private readonly claimsByToken = new Map<string, AccessTokenClaims>();

  async sign(claims: AccessTokenClaims, now: Date) {
    const accessToken = `wechat-access-${++this.index}`;
    this.claimsByToken.set(accessToken, claims);
    return { accessToken, expiresAt: new Date(now.getTime() + 15 * 60 * 1000) };
  }

  async verify(accessToken: string) {
    const claims = this.claimsByToken.get(accessToken);
    if (!claims) throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "Invalid access token");
    return claims;
  }
}

class MemorySessionStore implements SessionStore {
  readonly users = new Map<string, SessionUserRecord>();
  readonly sessions = new Map<string, SessionAccountRecord>();
  readonly refreshTokens = new Map<string, RefreshTokenRecord>();
  readonly events: SecurityEventInput[] = [];

  addUser(user: { userId: string; maskedPhone: string; disabledAt?: Date | null }) {
    this.users.set(user.userId, {
      userId: user.userId,
      maskedPhone: user.maskedPhone,
      disabledAt: user.disabledAt ?? null,
      passwordHash: "unused",
    });
  }

  async findUserByPhone(): Promise<SessionUserRecord | null> { return null; }

  async createSessionWithRefreshToken(input: {
    userId: string;
    deviceId: string;
    deviceLabel?: string | null;
    refreshTokenHash: string;
    tokenFamilyId: string;
    refreshExpiresAt: Date;
    now: Date;
  }) {
    const user = this.users.get(input.userId);
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

  async createRefreshTokenForSession(): Promise<void> {}
  async findRefreshTokenByHash(): Promise<RefreshTokenRecord | null> { return null; }
  async rotateActiveRefreshToken(): Promise<boolean> { return false; }
  async revokeRefreshFamily(): Promise<void> {}
  async revokeSession(): Promise<void> {}
  async revokeAllSessions(): Promise<void> {}
  async getAccountSession(): Promise<SessionAccountRecord | null> { return null; }
  async getPasswordCredential(): Promise<{ passwordHash: string } | null> { return null; }
  async changePasswordAndRevokeOtherSessions(): Promise<void> {}
  async recordSecurityEvent(input: SecurityEventInput) { this.events.push(input); }
}

class MemoryWechatStore implements WechatAuthStore {
  readonly usersByPhone = new Map<string, { userId: string; maskedPhone: string; disabledAt: Date | null }>();
  readonly wechatByOpenid = new Map<string, { userId: string }>();
  readonly events: SecurityEventInput[] = [];
  constructor(private readonly sessionStore: MemorySessionStore) {}

  addUser(phone: string, userId = randomUUID()) {
    const phoneE164 = normalizePhoneE164(phone);
    const user = { userId, maskedPhone: maskPhoneE164(phoneE164), disabledAt: null };
    this.usersByPhone.set(phoneE164, user);
    this.sessionStore.addUser(user);
    return user;
  }

  async findUserByPhone(phoneE164: string) {
    return this.usersByPhone.get(phoneE164) ?? null;
  }

  async findWechatUser(appId: string, openid: string) {
    return this.wechatByOpenid.get(`${appId}:${openid}`) ?? null;
  }

  async bindWechatAccount(input: {
    userId: string;
    appId: string;
    openid: string;
  }) {
    this.wechatByOpenid.set(`${input.appId}:${input.openid}`, { userId: input.userId });
  }

  async createUserWithWechatAccount(input: {
    phoneE164: string;
    phoneMasked: string;
    appId: string;
    openid: string;
  }) {
    const user = { userId: randomUUID(), maskedPhone: input.phoneMasked, disabledAt: null };
    this.usersByPhone.set(input.phoneE164, user);
    this.wechatByOpenid.set(`${input.appId}:${input.openid}`, { userId: user.userId });
    this.sessionStore.addUser(user);
    return { userId: user.userId };
  }

  async recordSecurityEvent(input: SecurityEventInput) { this.events.push(input); }
}

class MemoryWechatClient implements WechatClient {
  session: WechatSessionResult = { openid: "openid-a", unionid: "union-a" };
  phone = "13812345678";

  async codeToSession() { return this.session; }
  async getPhoneNumber() { return { phoneNumber: this.phone, purePhoneNumber: this.phone }; }
}

function makeFixture() {
  const sessionStore = new MemorySessionStore();
  const wechatStore = new MemoryWechatStore(sessionStore);
  const wechatClient = new MemoryWechatClient();
  const service = new WechatPhoneAuthService({
    client: wechatClient,
    store: wechatStore,
    sessionService: new SessionService({
      store: sessionStore,
      tokenIssuer: new MemoryAccessTokenIssuer(),
      refreshIdempotencyKey: randomBytes(32),
      now: () => new Date("2026-07-08T00:00:00.000Z"),
    }),
    limiter: new FixedWindowRateLimiter({ maxAttempts: 10, windowMs: 15 * 60 * 1000 }),
    now: () => new Date("2026-07-08T00:00:00.000Z"),
  });
  const app = buildApp({
    readinessCheck: async () => ({ database: "ready" }),
    wechatPhoneAuthService: service,
  });
  return { app, sessionStore, wechatStore };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    loginCode: "login-code",
    phoneCode: "phone-code",
    appId: "wx-app",
    client: "wechat-miniprogram",
    deviceId: "mini-device",
    agreementVersion: "2026-07-08",
    privacyVersion: "2026-07-08",
    ...overrides,
  };
}

describe("wechat phone auth API", () => {
  it("logs in an existing phone identity and binds the wechat account", async () => {
    const { app, wechatStore, sessionStore } = makeFixture();
    const user = wechatStore.addUser("13812345678");

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/wechat/phone-login",
      payload: payload(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.token).toBe("wechat-access-1");
    expect(body.refreshToken).toBeTruthy();
    expect(body.expiresAt).toBe("2026-07-08T00:15:00.000Z");
    expect(body.isNewUser).toBe(false);
    expect(body.nextAction).toBe("home");
    expect(body.user).toMatchObject({ id: user.userId, phoneMasked: "138****5678" });
    expect(wechatStore.wechatByOpenid.get("wx-app:openid-a")?.userId).toBe(user.userId);
    expect(sessionStore.events.at(-1)?.eventType).toBe("wechat_phone_login.succeeded");

    await app.close();
  });

  it("creates a new user without leaking raw phone into audit events", async () => {
    const { app, wechatStore, sessionStore } = makeFixture();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/wechat/phone-login",
      payload: payload(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.isNewUser).toBe(true);
    expect(body.user.phoneMasked).toBe("138****5678");
    expect(wechatStore.usersByPhone.has("+8613812345678")).toBe(true);
    expect(JSON.stringify([...wechatStore.events, ...sessionStore.events])).not.toContain("13812345678");
    expect(JSON.stringify([...wechatStore.events, ...sessionStore.events])).not.toContain("+8613812345678");
    expect(JSON.stringify([...wechatStore.events, ...sessionStore.events])).not.toContain(hashToken(body.refreshToken));

    await app.close();
  });

  it("rejects a wechat openid bound to a different phone user", async () => {
    const { app, wechatStore } = makeFixture();
    const phoneUser = wechatStore.addUser("13812345678");
    const otherUserId = randomUUID();
    expect(otherUserId).not.toBe(phoneUser.userId);
    wechatStore.wechatByOpenid.set("wx-app:openid-a", { userId: otherUserId });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/wechat/phone-login",
      payload: payload(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "account_binding_conflict",
      retryable: false,
    });
    expect(JSON.stringify(wechatStore.events)).not.toContain("13812345678");

    await app.close();
  });

  it("returns invalid_request for malformed payloads", async () => {
    const { app } = makeFixture();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/wechat/phone-login",
      payload: payload({ phoneCode: "" }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "invalid_request", retryable: false });

    await app.close();
  });
});
