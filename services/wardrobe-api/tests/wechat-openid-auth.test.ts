import { randomBytes, randomUUID } from "node:crypto";

import type { EmailCodePurpose } from "@wardrobe/cloud-contracts";
import { describe, expect, it } from "vitest";

import {
  type AccountIdentityRecord,
  type AccountPasswordStore,
  type AccountSecuritySnapshot,
} from "../src/auth/account-password.js";
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
  EmailVerificationService,
  type EmailChallengeRecord,
  type EmailVerificationStore,
} from "../src/auth/email-verification.js";
import {
  hashWechatOpenId,
  WechatOpenIdAuthService,
  type WechatBindingTicketRecord,
  type WechatOpenIdClient,
  type WechatOpenIdStore,
} from "../src/auth/wechat-openid.js";
import { MockEmailSender } from "../src/email/mock-sender.js";
import { hashPassword } from "../src/security/password.js";

class MemoryAccessTokenIssuer implements AccessTokenIssuer {
  private index = 0;
  async sign(_claims: AccessTokenClaims, now: Date) {
    return { accessToken: `wechat-openid-access-${++this.index}`, expiresAt: new Date(now.getTime() + 15 * 60 * 1000) };
  }
  async verify(): Promise<AccessTokenClaims> { throw new Error("not needed"); }
}

class MemorySessionStore implements SessionStore {
  async findUserByPhone(): Promise<SessionUserRecord | null> { return null; }
  async createSessionWithRefreshToken(input: { userId: string; deviceId: string }) {
    return { sessionId: `${input.userId}:${input.deviceId}` };
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
  async recordSecurityEvent(): Promise<void> {}
}

class MemoryEmailStore implements EmailVerificationStore {
  readonly challenges: EmailChallengeRecord[] = [];
  async findLatestChallenge(input: { emailNormalized: string; purpose: EmailCodePurpose }) {
    return this.challenges
      .filter((challenge) => challenge.emailNormalized === input.emailNormalized && challenge.purpose === input.purpose)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
  }
  async createChallenge(input: {
    emailNormalized: string;
    codeHash: string;
    purpose: EmailCodePurpose;
    userId?: string | null;
    bindingTicketId?: string | null;
    expiresAt: Date;
    createdIpHash?: string | null;
    now: Date;
  }) {
    const challenge: EmailChallengeRecord = {
      id: randomUUID(),
      emailNormalized: input.emailNormalized,
      codeHash: input.codeHash,
      purpose: input.purpose,
      userId: input.userId ?? null,
      bindingTicketId: input.bindingTicketId ?? null,
      createdIpHash: input.createdIpHash ?? null,
      attempts: 0,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: input.now,
    };
    this.challenges.push(challenge);
    return challenge;
  }
  async incrementAttempts(challengeId: string) {
    const challenge = this.challenges.find((item) => item.id === challengeId);
    if (challenge) challenge.attempts += 1;
  }
  async consumeChallenge(challengeId: string, now: Date) {
    const challenge = this.challenges.find((item) => item.id === challengeId);
    if (challenge) challenge.consumedAt = now;
  }
  async findLatestChallengeForEmail(emailNormalized: string) {
    return this.challenges
      .filter((challenge) => challenge.emailNormalized === emailNormalized)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
  }
  async countChallengesSince(input: { emailNormalized?: string; createdIpHash?: string; since: Date }) {
    return this.challenges.filter((challenge) =>
      challenge.createdAt >= input.since
      && (!input.emailNormalized || challenge.emailNormalized === input.emailNormalized)
      && (!input.createdIpHash || challenge.createdIpHash === input.createdIpHash)
    ).length;
  }
  async deleteChallenge(challengeId: string) {
    const index = this.challenges.findIndex((challenge) => challenge.id === challengeId);
    if (index >= 0) this.challenges.splice(index, 1);
  }
}

class MemoryAccountStore implements AccountPasswordStore {
  readonly users = new Map<string, AccountIdentityRecord & { emailNormalized: string; phoneE164?: string }>();
  async addUser(input: { email: string; password: string; phoneE164?: string; phoneMasked?: string }) {
    const user = {
      userId: randomUUID(),
      emailNormalized: input.email,
      passwordHash: await hashPassword(input.password),
      disabledAt: null,
      emailMasked: "u***@example.com",
      emailVerified: true,
      phoneE164: input.phoneE164,
      phoneMasked: input.phoneMasked,
      phoneVerified: input.phoneMasked ? false : undefined,
    };
    this.users.set(user.userId, user);
    return user;
  }
  async hasEmail(emailNormalized: string) { return [...this.users.values()].some((user) => user.emailNormalized === emailNormalized); }
  async hasPhone(phoneE164: string) { return [...this.users.values()].some((user) => user.phoneE164 === phoneE164); }
  async findByEmail(emailNormalized: string) { return [...this.users.values()].find((user) => user.emailNormalized === emailNormalized) ?? null; }
  async findByPhone(phoneE164: string) { return [...this.users.values()].find((user) => user.phoneE164 === phoneE164) ?? null; }
  async findEmailByUser(): Promise<{ emailNormalized: string; emailMasked: string; verified: boolean } | null> { return null; }
  async createEmailAccount(): Promise<AccountIdentityRecord> { throw new Error("not used"); }
  async updatePasswordAndRevokeAllSessions(): Promise<void> {}
  async updatePasswordAndRevokeOtherSessions(): Promise<void> {}
  async getAccountSecurity(): Promise<AccountSecuritySnapshot | null> { return null; }
  async recordSecurityEvent(): Promise<void> {}
}

class MemoryWechatStore implements WechatOpenIdStore {
  readonly usersByWechat = new Map<string, { userId: string; emailMasked?: string; phoneMasked?: string; disabledAt: Date | null }>();
  readonly tickets = new Map<string, WechatBindingTicketRecord>();
  readonly events: SecurityEventInput[] = [];
  registeredUserId: string | null = null;

  async findWechatUser(appId: string, openidHash: string) {
    return this.usersByWechat.get(`${appId}:${openidHash}`) ?? null;
  }
  async createBindingTicket(input: { appId: string; openidHash: string; unionidHash?: string | null; ticketHash: string; expiresAt: Date }) {
    this.tickets.set(input.ticketHash, {
      id: randomUUID(),
      appId: input.appId,
      openidHash: input.openidHash,
      unionidHash: input.unionidHash ?? null,
      expiresAt: input.expiresAt,
      consumedAt: null,
    });
  }
  async findBindingTicket(ticketHash: string) { return this.tickets.get(ticketHash) ?? null; }
  async consumeBindingTicket(ticketId: string, now: Date) {
    for (const ticket of this.tickets.values()) if (ticket.id === ticketId) ticket.consumedAt = now;
  }
  async bindExistingUser(input: { userId: string; appId: string; openidHash: string }) {
    this.usersByWechat.set(`${input.appId}:${input.openidHash}`, {
      userId: input.userId,
      emailMasked: "u***@example.com",
      phoneMasked: "138****5678",
      disabledAt: null,
    });
  }
  async createUserWithEmailAndWechat(input: { appId: string; openidHash: string; emailMasked: string; phoneMasked?: string | null }) {
    const userId = randomUUID();
    this.registeredUserId = userId;
    this.usersByWechat.set(`${input.appId}:${input.openidHash}`, {
      userId,
      emailMasked: input.emailMasked,
      phoneMasked: input.phoneMasked ?? undefined,
      disabledAt: null,
    });
    return { userId };
  }
  async recordSecurityEvent(input: SecurityEventInput) { this.events.push(input); }
}

class MemoryWechatClient implements WechatOpenIdClient {
  async codeToSession() { return { openid: "openid-a", unionid: "union-a" }; }
}

function makeFixture() {
  const now = new Date("2026-07-09T00:00:00.000Z");
  const emailSender = new MockEmailSender();
  const emailService = new EmailVerificationService({
    store: new MemoryEmailStore(),
    sender: emailSender,
    now: () => now,
  });
  const accountStore = new MemoryAccountStore();
  const wechatStore = new MemoryWechatStore();
  const sessionService = new SessionService({
    store: new MemorySessionStore(),
    tokenIssuer: new MemoryAccessTokenIssuer(),
    refreshIdempotencyKey: randomBytes(32),
    now: () => now,
  });
  const service = new WechatOpenIdAuthService({
    client: new MemoryWechatClient(),
    store: wechatStore,
    accountStore,
    sessionService,
    emailVerificationService: emailService,
    limiter: new FixedWindowRateLimiter({ maxAttempts: 10, windowMs: 15 * 60 * 1000 }),
    now: () => now,
  });
  return { service, accountStore, wechatStore, emailService, emailSender };
}

describe("wechat openid auth service", () => {
  it("returns a binding ticket for first-time WeChat login without leaking OpenID", async () => {
    const { service } = makeFixture();
    const result = await service.login({
      loginCode: "wx-code",
      appId: "wx-app",
      deviceId: "mini-device",
      rateLimitKey: "ip",
    });

    expect(result.status).toBe("requires_account_binding");
    expect(JSON.stringify(result)).not.toContain("openid-a");
    expect(JSON.stringify(result)).not.toContain("union-a");
  });

  it("binds an existing password account and then logs in by bound OpenID", async () => {
    const { service, accountStore } = makeFixture();
    const user = await accountStore.addUser({
      email: "user@example.com",
      password: "password-123",
      phoneE164: "+8613812345678",
      phoneMasked: "138****5678",
    });
    const first = await service.login({ loginCode: "wx-code", appId: "wx-app", deviceId: "mini-device", rateLimitKey: "ip" });
    if (first.status !== "requires_account_binding") throw new Error("expected binding ticket");

    const bound = await service.bindExisting({
      bindingTicket: first.bindingTicket,
      account: "user@example.com",
      password: "password-123",
      deviceId: "mini-device",
    });
    expect(bound.user.id).toBe(user.userId);

    const second = await service.login({ loginCode: "wx-code", appId: "wx-app", deviceId: "mini-device-2", rateLimitKey: "ip" });
    expect(second.status).toBe("logged_in");
    if (second.status === "logged_in") expect(second.user.id).toBe(user.userId);
  });

  it("registers a new email account and binds the current WeChat", async () => {
    const { service, wechatStore, emailService, emailSender } = makeFixture();
    const first = await service.login({ loginCode: "wx-code", appId: "wx-app", deviceId: "mini-device", rateLimitKey: "ip" });
    if (first.status !== "requires_account_binding") throw new Error("expected binding ticket");
    await emailService.sendCode({ email: "user@example.com", purpose: "wechat_register" });

    const tokens = await service.registerWithEmail({
      bindingTicket: first.bindingTicket,
      email: "user@example.com",
      emailCode: emailSender.messages[0].code,
      password: "password-123",
      phone: "13812345678",
      deviceId: "mini-device",
    });

    expect(tokens.user.emailMasked).toBe("u***@example.com");
    expect(tokens.user.emailVerified).toBe(true);
    expect(tokens.user.phoneMasked).toBe("138****5678");
    expect(tokens.user.phoneVerified).toBe(false);
    expect(wechatStore.registeredUserId).toBe(tokens.user.id);
    expect([...wechatStore.usersByWechat.keys()][0]).toBe(`wx-app:${hashWechatOpenId("wx-app", "openid-a")}`);
  });
});
