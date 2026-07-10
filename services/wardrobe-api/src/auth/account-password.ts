import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { SendEmailCodeResponse } from "@wardrobe/cloud-contracts";

import { getDb } from "../db/client.js";
import {
  accountSecurityEvents,
  deviceSessions,
  emailIdentities,
  locations,
  passwordCredentials,
  phoneIdentities,
  refreshTokens,
  users,
  wechatIdentities,
} from "../db/schema.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import { hashToken } from "../security/token-hash.js";
import { EMAIL_CODE_COOLDOWN_MS, EMAIL_CODE_TTL_MS, EmailVerificationService, maskEmail, normalizeEmail } from "./email-verification.js";
import { AuthApiError, maskPhoneE164, normalizePhoneE164, type SecurityEventInput } from "./registrations.js";
import { FixedWindowRateLimiter } from "./rate-limit.js";
import { LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS, type AccessTokenClaims, type SessionService } from "./session.js";

export interface AccountIdentityRecord {
  userId: string;
  passwordHash: string;
  disabledAt: Date | null;
  emailMasked?: string;
  emailVerified?: boolean;
  phoneMasked?: string;
  phoneVerified?: boolean;
  displayName?: string;
}

export interface AccountSecuritySnapshot {
  user: { id: string; displayName: string };
  email: { bound: boolean; masked?: string; verified: boolean };
  phone: { bound: boolean; masked?: string; verified: boolean; usage: "login_name" };
  wechat: { bound: boolean; appId?: string };
  password: { set: boolean; changedAt?: string };
}

export interface AccountPasswordStore {
  hasEmail(emailNormalized: string): Promise<boolean>;
  hasPhone(phoneE164: string): Promise<boolean>;
  findByEmail(emailNormalized: string): Promise<AccountIdentityRecord | null>;
  findByPhone(phoneE164: string): Promise<AccountIdentityRecord | null>;
  findEmailByUser(userId: string): Promise<{ emailNormalized: string; emailMasked: string; verified: boolean } | null>;
  createEmailAccount(input: {
    emailNormalized: string;
    emailMasked: string;
    passwordHash: string;
    phoneE164?: string | null;
    phoneMasked?: string | null;
    deviceId: string;
    now: Date;
  }): Promise<AccountIdentityRecord>;
  updatePasswordAndRevokeAllSessions(input: { userId: string; passwordHash: string; now: Date }): Promise<void>;
  updatePasswordAndRevokeOtherSessions(input: {
    userId: string;
    currentSessionId: string;
    passwordHash: string;
    now: Date;
  }): Promise<void>;
  getAccountSecurity(userId: string): Promise<AccountSecuritySnapshot | null>;
  recordSecurityEvent(input: SecurityEventInput): Promise<void>;
}

export class PostgresAccountPasswordStore implements AccountPasswordStore {
  async hasEmail(emailNormalized: string) {
    const rows = await getDb().select({ id: emailIdentities.id }).from(emailIdentities).where(eq(emailIdentities.emailNormalized, emailNormalized)).limit(1);
    return rows.length > 0;
  }

  async hasPhone(phoneE164: string) {
    const rows = await getDb().select({ id: phoneIdentities.id }).from(phoneIdentities).where(eq(phoneIdentities.phoneE164, phoneE164)).limit(1);
    return rows.length > 0;
  }

  async findByEmail(emailNormalized: string) {
    const [identity] = await getDb().select().from(emailIdentities).where(eq(emailIdentities.emailNormalized, emailNormalized)).limit(1);
    if (!identity) return null;
    return this.buildIdentity(identity.userId, { emailMasked: identity.emailMasked, emailVerified: identity.verifiedAt !== null });
  }

  async findByPhone(phoneE164: string) {
    const [identity] = await getDb().select().from(phoneIdentities).where(eq(phoneIdentities.phoneE164, phoneE164)).limit(1);
    if (!identity) return null;
    return this.buildIdentity(identity.userId, { phoneMasked: identity.maskedPhone, phoneVerified: identity.verifiedAt !== null });
  }

  async findEmailByUser(userId: string) {
    const [identity] = await getDb().select().from(emailIdentities).where(eq(emailIdentities.userId, userId)).limit(1);
    return identity
      ? { emailNormalized: identity.emailNormalized, emailMasked: identity.emailMasked, verified: identity.verifiedAt !== null }
      : null;
  }

  async createEmailAccount(input: {
    emailNormalized: string;
    emailMasked: string;
    passwordHash: string;
    phoneE164?: string | null;
    phoneMasked?: string | null;
    deviceId: string;
    now: Date;
  }) {
    const userId = await getDb().transaction(async (tx) => {
      const [createdUser] = await tx.insert(users).values({}).returning({ id: users.id });
      await tx.insert(emailIdentities).values({
        userId: createdUser.id,
        emailNormalized: input.emailNormalized,
        emailMasked: input.emailMasked,
        verifiedAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      });
      if (input.phoneE164 && input.phoneMasked) {
        await tx.insert(phoneIdentities).values({
          userId: createdUser.id,
          phoneE164: input.phoneE164,
          maskedPhone: input.phoneMasked,
          verifiedAt: null,
          createdAt: input.now,
          updatedAt: input.now,
        });
      }
      await tx.insert(passwordCredentials).values({
        userId: createdUser.id,
        passwordHash: input.passwordHash,
        changedAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      });
      await tx.insert(locations).values({
        userId: createdUser.id,
        originDeviceId: input.deviceId,
        payload: { dexieId: "home", name: "默认衣橱", note: "默认衣橱", sortOrder: 1 },
        createdAt: input.now,
        updatedAt: input.now,
      });
      return createdUser.id;
    });
    return {
      userId,
      passwordHash: input.passwordHash,
      disabledAt: null,
      emailMasked: input.emailMasked,
      emailVerified: true,
      phoneMasked: input.phoneMasked ?? undefined,
      phoneVerified: input.phoneMasked ? false : undefined,
    };
  }

  async updatePasswordAndRevokeAllSessions(input: { userId: string; passwordHash: string; now: Date }) {
    const sessions = await getDb().select({ id: deviceSessions.id }).from(deviceSessions).where(eq(deviceSessions.userId, input.userId));
    const sessionIds = sessions.map((session) => session.id);
    await getDb().transaction(async (tx) => {
      await tx.update(passwordCredentials)
        .set({ passwordHash: input.passwordHash, passwordVersion: sql`${passwordCredentials.passwordVersion} + 1`, changedAt: input.now, updatedAt: input.now })
        .where(eq(passwordCredentials.userId, input.userId));
      await tx.update(deviceSessions).set({ revokedAt: input.now, updatedAt: input.now }).where(eq(deviceSessions.userId, input.userId));
      if (sessionIds.length > 0) {
        await tx.update(refreshTokens).set({ status: "revoked", revokedAt: input.now, updatedAt: input.now }).where(inArray(refreshTokens.sessionId, sessionIds));
      }
    });
  }

  async updatePasswordAndRevokeOtherSessions(input: { userId: string; currentSessionId: string; passwordHash: string; now: Date }) {
    const otherSessions = await getDb()
      .select({ id: deviceSessions.id })
      .from(deviceSessions)
      .where(and(eq(deviceSessions.userId, input.userId), ne(deviceSessions.id, input.currentSessionId)));
    const otherSessionIds = otherSessions.map((session) => session.id);
    await getDb().transaction(async (tx) => {
      await tx.update(passwordCredentials)
        .set({ passwordHash: input.passwordHash, passwordVersion: sql`${passwordCredentials.passwordVersion} + 1`, changedAt: input.now, updatedAt: input.now })
        .where(eq(passwordCredentials.userId, input.userId));
      if (otherSessionIds.length > 0) {
        await tx.update(deviceSessions).set({ revokedAt: input.now, updatedAt: input.now }).where(inArray(deviceSessions.id, otherSessionIds));
        await tx.update(refreshTokens).set({ status: "revoked", revokedAt: input.now, updatedAt: input.now }).where(inArray(refreshTokens.sessionId, otherSessionIds));
      }
    });
  }

  async getAccountSecurity(userId: string) {
    const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;
    const [email] = await getDb().select().from(emailIdentities).where(eq(emailIdentities.userId, userId)).limit(1);
    const [phone] = await getDb().select().from(phoneIdentities).where(eq(phoneIdentities.userId, userId)).limit(1);
    const [wechat] = await getDb().select().from(wechatIdentities).where(eq(wechatIdentities.userId, userId)).limit(1);
    const [password] = await getDb().select().from(passwordCredentials).where(eq(passwordCredentials.userId, userId)).limit(1);
    return {
      user: { id: userId, displayName: user.displayName ?? "Wardora 用户" },
      email: { bound: Boolean(email), masked: email?.emailMasked, verified: email ? email.verifiedAt !== null : false },
      phone: { bound: Boolean(phone), masked: phone?.maskedPhone, verified: phone ? phone.verifiedAt !== null : false, usage: "login_name" as const },
      wechat: { bound: Boolean(wechat), appId: wechat?.appId },
      password: { set: Boolean(password), changedAt: password?.changedAt?.toISOString() },
    };
  }

  async recordSecurityEvent(input: SecurityEventInput) {
    await getDb().insert(accountSecurityEvents).values({
      userId: input.userId ?? null,
      eventType: input.eventType,
      ipHash: input.ip ? hashToken(input.ip) : null,
      userAgentHash: input.userAgent ? hashToken(input.userAgent) : null,
      metadata: input.metadata ?? {},
      redacted: true,
    });
  }

  private async buildIdentity(userId: string, identity: Partial<AccountIdentityRecord>) {
    const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
    const [credential] = await getDb().select().from(passwordCredentials).where(eq(passwordCredentials.userId, userId)).limit(1);
    if (!user || !credential) return null;
    const email = identity.emailMasked
      ? null
      : (await getDb().select().from(emailIdentities).where(eq(emailIdentities.userId, userId)).limit(1))[0] ?? null;
    const phone = identity.phoneMasked
      ? null
      : (await getDb().select().from(phoneIdentities).where(eq(phoneIdentities.userId, userId)).limit(1))[0] ?? null;
    return {
      userId,
      passwordHash: credential.passwordHash,
      disabledAt: user.disabledAt,
      emailMasked: identity.emailMasked ?? email?.emailMasked,
      emailVerified: identity.emailVerified ?? (email ? email.verifiedAt !== null : undefined),
      phoneMasked: identity.phoneMasked ?? phone?.maskedPhone,
      phoneVerified: identity.phoneVerified ?? (phone ? phone.verifiedAt !== null : undefined),
      displayName: user.displayName ?? undefined,
    };
  }
}

export class AccountPasswordAuthService {
  private readonly store: AccountPasswordStore;
  private readonly sessionService: SessionService;
  private readonly emailVerificationService: EmailVerificationService;
  private readonly limiter: FixedWindowRateLimiter;
  private readonly now: () => Date;

  constructor(options: {
    store?: AccountPasswordStore;
    sessionService: SessionService;
    emailVerificationService?: EmailVerificationService;
    limiter?: FixedWindowRateLimiter;
    now?: () => Date;
  }) {
    this.store = options.store ?? new PostgresAccountPasswordStore();
    this.sessionService = options.sessionService;
    this.emailVerificationService = options.emailVerificationService ?? new EmailVerificationService();
    this.limiter = options.limiter ?? new FixedWindowRateLimiter({ maxAttempts: LOGIN_RATE_LIMIT_MAX, windowMs: LOGIN_RATE_LIMIT_WINDOW_MS });
    this.now = options.now ?? (() => new Date());
  }

  async register(input: { email: string; emailCode: string; password: string; phone?: string; deviceId: string; deviceLabel?: string | null; ip?: string; userAgent?: string }) {
    const now = this.now();
    const emailNormalized = normalizeEmail(input.email);
    const emailMasked = maskEmail(emailNormalized);
    const phone = input.phone?.trim() ? normalizePhoneE164(input.phone) : null;
    const phoneMasked = phone ? maskPhoneE164(phone) : null;
    if (await this.store.hasEmail(emailNormalized)) throw new AuthApiError(409, "email_already_registered", "Email is already registered");
    if (phone && await this.store.hasPhone(phone)) throw new AuthApiError(409, "phone_already_registered", "Phone is already registered");
    await this.emailVerificationService.verifyCode({ email: emailNormalized, purpose: "register", code: input.emailCode, now });
    const user = await this.store.createEmailAccount({
      emailNormalized,
      emailMasked,
      passwordHash: await hashPassword(input.password),
      phoneE164: phone,
      phoneMasked,
      deviceId: input.deviceId,
      now,
    });
    return this.issueTokens(user, {
      deviceId: input.deviceId,
      deviceLabel: input.deviceLabel,
      eventType: "registration.succeeded",
      ip: input.ip,
      userAgent: input.userAgent,
      eventMetadata: { emailMasked, phoneMasked },
    });
  }

  async login(input: { account: string; password: string; deviceId: string; deviceLabel?: string | null; rateLimitKey: string; ip?: string; userAgent?: string }) {
    const now = this.now();
    const identityKey = normalizeAccountForLogin(input.account.trim());
    const rate = this.limiter.take(`login:${input.rateLimitKey}:${identityKey.value}`, now.getTime());
    if (!rate.allowed) throw new AuthApiError(429, "rate_limited", "Too many login attempts", rate.retryAfterSeconds);
    const user = identityKey.kind === "email" ? await this.store.findByEmail(identityKey.value) : await this.store.findByPhone(identityKey.value);
    const pwValid = user && !user.disabledAt ? await verifyPassword(user.passwordHash, input.password) : (await verifyMissingPassword(), false);
    if (identityKey.kind === "email" && user && !user.emailVerified) throw new AuthApiError(403, "email_unverified", "Email is not verified");
    if (!pwValid || !user) {
      await this.store.recordSecurityEvent({ eventType: "login.failed", ip: input.ip, userAgent: input.userAgent, metadata: { accountKind: identityKey.kind } });
      throw new AuthApiError(401, "invalid_credentials", "Invalid account or password");
    }
    return this.issueTokens(user, {
      deviceId: input.deviceId,
      deviceLabel: input.deviceLabel,
      eventType: "login.succeeded",
      ip: input.ip,
      userAgent: input.userAgent,
      eventMetadata: { emailMasked: user.emailMasked, phoneMasked: user.phoneMasked },
    });
  }

  async requestPasswordReset(input: { email: string; ip?: string }): Promise<SendEmailCodeResponse> {
    this.emailVerificationService.ensureDeliveryAvailable();
    const emailNormalized = normalizeEmail(input.email);
    const user = await this.store.findByEmail(emailNormalized);
    if (user?.emailVerified) {
      return this.emailVerificationService.sendCode({ email: emailNormalized, purpose: "reset_password", userId: user.userId, ip: input.ip });
    }
    return {
      status: "sent",
      emailMasked: maskEmail(emailNormalized),
      cooldownSeconds: EMAIL_CODE_COOLDOWN_MS / 1000,
      expiresInSeconds: EMAIL_CODE_TTL_MS / 1000,
    };
  }

  async confirmPasswordReset(input: { email: string; emailCode: string; newPassword: string }) {
    const now = this.now();
    const emailNormalized = normalizeEmail(input.email);
    await this.emailVerificationService.verifyCode({ email: emailNormalized, purpose: "reset_password", code: input.emailCode, now });
    const user = await this.store.findByEmail(emailNormalized);
    if (!user?.emailVerified) throw new AuthApiError(400, "email_code_invalid", "Invalid email code");
    await this.store.updatePasswordAndRevokeAllSessions({ userId: user.userId, passwordHash: await hashPassword(input.newPassword), now });
    await this.store.recordSecurityEvent({ userId: user.userId, eventType: "password.reset", metadata: { emailMasked: user.emailMasked } });
    return { status: "ok" as const };
  }

  async requestPasswordChangeCode(claims: AccessTokenClaims, input: { ip?: string }) {
    const email = await this.store.findEmailByUser(claims.userId);
    if (!email?.verified) throw new AuthApiError(400, "email_unverified", "Email is not verified");
    return this.emailVerificationService.sendCode({
      email: email.emailNormalized,
      purpose: "change_password",
      userId: claims.userId,
      ip: input.ip,
    });
  }

  async changePasswordWithEmailCode(claims: AccessTokenClaims, input: { emailCode: string; newPassword: string }) {
    const now = this.now();
    const email = await this.store.findEmailByUser(claims.userId);
    if (!email?.verified) throw new AuthApiError(400, "email_unverified", "Email is not verified");
    await this.emailVerificationService.verifyCode({ email: email.emailNormalized, purpose: "change_password", code: input.emailCode, now });
    await this.store.updatePasswordAndRevokeOtherSessions({ userId: claims.userId, currentSessionId: claims.sessionId, passwordHash: await hashPassword(input.newPassword), now });
    await this.store.recordSecurityEvent({ userId: claims.userId, eventType: "password.changed_with_email_code", metadata: { emailMasked: email.emailMasked } });
    return { status: "ok" as const };
  }

  async getAccountSecurity(claims: AccessTokenClaims) {
    const snapshot = await this.store.getAccountSecurity(claims.userId);
    if (!snapshot) throw new AuthApiError(401, "AUTH_SESSION_REVOKED", "Session revoked");
    return snapshot;
  }

  private issueTokens(user: AccountIdentityRecord, input: { deviceId: string; deviceLabel?: string | null; eventType: string; ip?: string; userAgent?: string; eventMetadata?: Record<string, unknown> }) {
    return this.sessionService.issueTokensForUser({
      userId: user.userId,
      maskedPhone: user.phoneMasked ?? user.emailMasked ?? "Wardora 用户",
      phoneMasked: user.phoneMasked,
      phoneVerified: user.phoneVerified,
      emailMasked: user.emailMasked,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      deviceId: input.deviceId,
      deviceLabel: input.deviceLabel,
      eventType: input.eventType,
      ip: input.ip,
      userAgent: input.userAgent,
      eventMetadata: input.eventMetadata,
    });
  }
}

export function normalizeAccountForLogin(account: string): { kind: "email" | "phone"; value: string } {
  if (account.includes("@")) return { kind: "email", value: normalizeEmail(account) };
  try {
    return { kind: "phone", value: normalizePhoneE164(account) };
  } catch {
    throw new AuthApiError(400, "invalid_account_format", "Invalid account format");
  }
}

let missingPasswordHash: Promise<string> | null = null;
async function verifyMissingPassword() {
  missingPasswordHash ??= hashPassword(`missing-${randomUUID()}`);
  try { await verifyPassword(await missingPasswordHash, "invalid-password-32-bytes"); } catch { /* timing only */ }
}
