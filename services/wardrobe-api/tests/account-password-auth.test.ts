import { randomBytes, randomUUID } from "node:crypto";

import type { EmailCodePurpose } from "@wardrobe/cloud-contracts";
import { describe, expect, it } from "vitest";

import {
  AccountPasswordAuthService,
  type AccountIdentityRecord,
  type AccountPasswordStore,
  type AccountSecuritySnapshot,
} from "../src/auth/account-password.js";
import { FixedWindowRateLimiter } from "../src/auth/rate-limit.js";
import { type SecurityEventInput } from "../src/auth/registrations.js";
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
import { MockEmailSender } from "../src/email/mock-sender.js";
import { createEmailSenderFromEnv } from "../src/email/factory.js";
import { hashPassword } from "../src/security/password.js";

class MemoryAccessTokenIssuer implements AccessTokenIssuer {
  private index = 0;
  private readonly claimsByToken = new Map<string, AccessTokenClaims>();

  async sign(claims: AccessTokenClaims, now: Date) {
    const accessToken = `account-access-${++this.index}`;
    this.claimsByToken.set(accessToken, claims);
    return { accessToken, expiresAt: new Date(now.getTime() + 15 * 60 * 1000) };
  }

  async verify(accessToken: string) {
    const claims = this.claimsByToken.get(accessToken);
    if (!claims) throw new Error("invalid token");
    return claims;
  }
}

class MemorySessionStore implements SessionStore {
  readonly sessions = new Map<string, SessionAccountRecord>();
  readonly events: SecurityEventInput[] = [];

  async findUserByPhone(): Promise<SessionUserRecord | null> { return null; }

  async createSessionWithRefreshToken(input: {
    userId: string;
    deviceId: string;
    refreshTokenHash: string;
    tokenFamilyId: string;
    refreshExpiresAt: Date;
    now: Date;
  }) {
    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      userId: input.userId,
      maskedPhone: "legacy",
      disabledAt: null,
      sessionRevokedAt: null,
      deviceId: input.deviceId,
    });
    return { sessionId };
  }

  async createRefreshTokenForSession(): Promise<void> {}
  async findRefreshTokenByHash(): Promise<RefreshTokenRecord | null> { return null; }
  async rotateActiveRefreshToken(): Promise<boolean> { return false; }
  async revokeRefreshFamily(): Promise<void> {}
  async revokeSession(): Promise<void> {}
  async revokeAllSessions(): Promise<void> {}
  async getAccountSession(userId: string, sessionId: string) {
    return this.sessions.get(sessionId)?.userId === userId ? this.sessions.get(sessionId)! : null;
  }
  async getPasswordCredential(): Promise<{ passwordHash: string } | null> { return null; }
  async changePasswordAndRevokeOtherSessions(): Promise<void> {}
  async recordSecurityEvent(input: SecurityEventInput) { this.events.push(input); }
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
  readonly events: SecurityEventInput[] = [];
  revokedAllForUser: string | null = null;

  async hasEmail(emailNormalized: string) {
    return [...this.users.values()].some((user) => user.emailNormalized === emailNormalized);
  }

  async hasPhone(phoneE164: string) {
    return [...this.users.values()].some((user) => user.phoneE164 === phoneE164);
  }

  async findByEmail(emailNormalized: string) {
    return [...this.users.values()].find((user) => user.emailNormalized === emailNormalized) ?? null;
  }

  async findByPhone(phoneE164: string) {
    return [...this.users.values()].find((user) => user.phoneE164 === phoneE164) ?? null;
  }

  async findEmailByUser(userId: string) {
    const user = this.users.get(userId);
    return user ? { emailNormalized: user.emailNormalized, emailMasked: user.emailMasked!, verified: Boolean(user.emailVerified) } : null;
  }

  async createEmailAccount(input: {
    emailNormalized: string;
    emailMasked: string;
    passwordHash: string;
    phoneE164?: string | null;
    phoneMasked?: string | null;
  }) {
    const user: AccountIdentityRecord & { emailNormalized: string; phoneE164?: string } = {
      userId: randomUUID(),
      emailNormalized: input.emailNormalized,
      phoneE164: input.phoneE164 ?? undefined,
      passwordHash: input.passwordHash,
      disabledAt: null,
      emailMasked: input.emailMasked,
      emailVerified: true,
      phoneMasked: input.phoneMasked ?? undefined,
      phoneVerified: input.phoneMasked ? false : undefined,
    };
    this.users.set(user.userId, user);
    return user;
  }

  async updatePasswordAndRevokeAllSessions(input: { userId: string; passwordHash: string }) {
    const user = this.users.get(input.userId);
    if (user) user.passwordHash = input.passwordHash;
    this.revokedAllForUser = input.userId;
  }

  async updatePasswordAndRevokeOtherSessions(input: { userId: string; passwordHash: string }) {
    const user = this.users.get(input.userId);
    if (user) user.passwordHash = input.passwordHash;
  }

  async getAccountSecurity(userId: string): Promise<AccountSecuritySnapshot | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    return {
      user: { id: user.userId, displayName: "Wardora 用户" },
      email: { bound: true, masked: user.emailMasked, verified: Boolean(user.emailVerified) },
      phone: { bound: Boolean(user.phoneMasked), masked: user.phoneMasked, verified: Boolean(user.phoneVerified), usage: "login_name" },
      wechat: { bound: false },
      password: { set: true, changedAt: "2026-07-09T00:00:00.000Z" },
    };
  }

  async recordSecurityEvent(input: SecurityEventInput) { this.events.push(input); }
}

function makeFixture(emailServiceOverride?: EmailVerificationService) {
  let now = new Date("2026-07-09T00:00:00.000Z");
  const accountStore = new MemoryAccountStore();
  const emailSender = new MockEmailSender();
  const emailService = emailServiceOverride ?? new EmailVerificationService({
    store: new MemoryEmailStore(),
    sender: emailSender,
    now: () => now,
  });
  const sessionStore = new MemorySessionStore();
  const sessionService = new SessionService({
    store: sessionStore,
    tokenIssuer: new MemoryAccessTokenIssuer(),
    refreshIdempotencyKey: randomBytes(32),
    now: () => now,
  });
  const service = new AccountPasswordAuthService({
    store: accountStore,
    sessionService,
    emailVerificationService: emailService,
    limiter: new FixedWindowRateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 }),
    now: () => now,
  });
  return {
    service,
    accountStore,
    emailService,
    emailSender,
    sessionStore,
    advance(milliseconds: number) {
      now = new Date(now.getTime() + milliseconds);
    },
  };
}

describe("account password auth service", () => {
  it("returns the same provider error for unknown password-reset emails", async () => {
    const emailService = new EmailVerificationService({
      store: new MemoryEmailStore(),
      sender: createEmailSenderFromEnv({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "tencent-ses",
      }),
    });
    const { service } = makeFixture(emailService);

    await expect(service.requestPasswordReset({ email: "missing@example.com" }))
      .rejects.toMatchObject({ code: "email_provider_not_configured", statusCode: 503 });
  });

  it("registers with verified email and keeps phone as an unverified login name", async () => {
    const { service, accountStore, emailService, emailSender } = makeFixture();
    await emailService.sendCode({ email: "user@example.com", purpose: "register" });

    const tokens = await service.register({
      email: "USER@example.com",
      emailCode: emailSender.messages[0].code,
      password: "password-123",
      phone: "13812345678",
      deviceId: "device-a",
    });

    expect(tokens.user.emailMasked).toBe("u***@example.com");
    expect(tokens.user.emailVerified).toBe(true);
    expect(tokens.user.phoneMasked).toBe("138****5678");
    expect(tokens.user.phoneVerified).toBe(false);
    expect(accountStore.users.size).toBe(1);
  });

  it("logs in with either verified email or phone login name", async () => {
    const { service, emailService, emailSender } = makeFixture();
    await emailService.sendCode({ email: "user@example.com", purpose: "register" });
    await service.register({
      email: "user@example.com",
      emailCode: emailSender.messages[0].code,
      password: "password-123",
      phone: "13812345678",
      deviceId: "device-a",
    });

    await expect(service.login({
      account: "user@example.com",
      password: "password-123",
      deviceId: "device-b",
      rateLimitKey: "test",
    })).resolves.toMatchObject({ user: { emailMasked: "u***@example.com" } });

    await expect(service.login({
      account: "13812345678",
      password: "password-123",
      deviceId: "device-c",
      rateLimitKey: "test",
    })).resolves.toMatchObject({ user: { phoneMasked: "138****5678", phoneVerified: false } });
  });

  it("resets password through verified email and revokes old sessions", async () => {
    const { service, accountStore, emailService, emailSender, advance } = makeFixture();
    await emailService.sendCode({ email: "user@example.com", purpose: "register" });
    const tokens = await service.register({
      email: "user@example.com",
      emailCode: emailSender.messages[0].code,
      password: "password-123",
      deviceId: "device-a",
    });

    advance(60_000);
    await service.requestPasswordReset({ email: "user@example.com" });
    const resetCode = emailSender.messages.at(-1)!.code;
    await service.confirmPasswordReset({
      email: "user@example.com",
      emailCode: resetCode,
      newPassword: "password-456",
    });

    expect(accountStore.revokedAllForUser).toBe(tokens.user.id);
    await expect(service.login({
      account: "user@example.com",
      password: "password-456",
      deviceId: "device-b",
      rateLimitKey: "test",
    })).resolves.toBeTruthy();
  });

  it("changes password through the logged-in email code", async () => {
    const { service, emailService, emailSender, sessionStore, advance } = makeFixture();
    await emailService.sendCode({ email: "user@example.com", purpose: "register" });
    const tokens = await service.register({
      email: "user@example.com",
      emailCode: emailSender.messages[0].code,
      password: "password-123",
      deviceId: "device-a",
    });
    const sessionId = [...sessionStore.sessions.entries()].find(([, session]) => session.userId === tokens.user.id)![0];
    const claims = { userId: tokens.user.id, sessionId, deviceId: "device-a" };

    advance(60_000);
    await service.requestPasswordChangeCode(claims, {});
    const message = emailSender.messages.at(-1)!;
    expect(message.to).toBe("user@example.com");
    expect(message.purpose).toBe("change_password");

    await service.changePasswordWithEmailCode(claims, {
      emailCode: message.code,
      newPassword: "password-789",
    });

    await expect(service.login({
      account: "user@example.com",
      password: "password-789",
      deviceId: "device-b",
      rateLimitKey: "test",
    })).resolves.toBeTruthy();
  });

  it("returns the account security snapshot", async () => {
    const { service, emailService, emailSender, sessionStore } = makeFixture();
    await emailService.sendCode({ email: "user@example.com", purpose: "register" });
    const tokens = await service.register({
      email: "user@example.com",
      emailCode: emailSender.messages[0].code,
      password: "password-123",
      phone: "13812345678",
      deviceId: "device-a",
    });
    const sessionId = [...sessionStore.sessions.entries()].find(([, session]) => session.userId === tokens.user.id)![0];

    await expect(service.getAccountSecurity({
      userId: tokens.user.id,
      sessionId,
      deviceId: "device-a",
    })).resolves.toMatchObject({
      email: { bound: true, verified: true },
      phone: { bound: true, verified: false, usage: "login_name" },
      wechat: { bound: false },
    });
  });
});
