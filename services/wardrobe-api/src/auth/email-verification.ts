import { randomInt } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { EmailCodePurpose } from "@wardrobe/cloud-contracts";

import { getDb } from "../db/client.js";
import { emailVerificationChallenges } from "../db/schema.js";
import { createEmailSenderFromEnv } from "../email/factory.js";
import { EmailSendError, type EmailSender } from "../email/types.js";
import { hmacSha256Base64Url } from "../security/hmac.js";
import { hashToken } from "../security/token-hash.js";
import { AuthApiError } from "./registrations.js";

export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_CODE_COOLDOWN_MS = 30 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

export interface EmailChallengeRecord {
  id: string;
  emailNormalized: string;
  codeHash: string;
  purpose: EmailCodePurpose;
  userId: string | null;
  bindingTicketId: string | null;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface EmailVerificationStore {
  findLatestChallenge(input: {
    emailNormalized: string;
    purpose: EmailCodePurpose;
  }): Promise<EmailChallengeRecord | null>;
  createChallenge(input: {
    emailNormalized: string;
    codeHash: string;
    purpose: EmailCodePurpose;
    userId?: string | null;
    bindingTicketId?: string | null;
    expiresAt: Date;
    createdIpHash?: string | null;
    now: Date;
  }): Promise<EmailChallengeRecord>;
  incrementAttempts(challengeId: string, now: Date): Promise<void>;
  consumeChallenge(challengeId: string, now: Date): Promise<void>;
}

export class PostgresEmailVerificationStore implements EmailVerificationStore {
  async findLatestChallenge(input: { emailNormalized: string; purpose: EmailCodePurpose }) {
    const [challenge] = await getDb()
      .select()
      .from(emailVerificationChallenges)
      .where(and(
        eq(emailVerificationChallenges.emailNormalized, input.emailNormalized),
        eq(emailVerificationChallenges.purpose, input.purpose),
      ))
      .orderBy(desc(emailVerificationChallenges.createdAt))
      .limit(1);
    return challenge ? { ...challenge, purpose: challenge.purpose as EmailCodePurpose } : null;
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
    const [challenge] = await getDb()
      .insert(emailVerificationChallenges)
      .values({
        emailNormalized: input.emailNormalized,
        codeHash: input.codeHash,
        purpose: input.purpose,
        userId: input.userId ?? null,
        bindingTicketId: input.bindingTicketId ?? null,
        attempts: 0,
        expiresAt: input.expiresAt,
        createdIpHash: input.createdIpHash ?? null,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    return { ...challenge, purpose: challenge.purpose as EmailCodePurpose };
  }

  async incrementAttempts(challengeId: string, now: Date) {
    await getDb()
      .update(emailVerificationChallenges)
      .set({
        attempts: sql`${emailVerificationChallenges.attempts} + 1`,
        updatedAt: now,
      })
      .where(eq(emailVerificationChallenges.id, challengeId));
  }

  async consumeChallenge(challengeId: string, now: Date) {
    await getDb()
      .update(emailVerificationChallenges)
      .set({ consumedAt: now, updatedAt: now })
      .where(and(eq(emailVerificationChallenges.id, challengeId), isNull(emailVerificationChallenges.consumedAt)));
  }
}

export class EmailVerificationService {
  private readonly store: EmailVerificationStore;
  private readonly sender: EmailSender;
  private readonly now: () => Date;
  private readonly developmentCodes = new Map<string, string>();

  constructor(options: {
    store?: EmailVerificationStore;
    sender?: EmailSender;
    now?: () => Date;
  } = {}) {
    this.store = options.store ?? new PostgresEmailVerificationStore();
    this.sender = options.sender ?? createEmailSenderFromEnv();
    this.now = options.now ?? (() => new Date());
  }

  async sendCode(input: {
    email: string;
    purpose: EmailCodePurpose;
    userId?: string | null;
    bindingTicketId?: string | null;
    ip?: string;
  }) {
    const now = this.now();
    const emailNormalized = normalizeEmail(input.email);
    const emailMasked = maskEmail(emailNormalized);
    const latest = await this.store.findLatestChallenge({ emailNormalized, purpose: input.purpose });
    if (latest && latest.createdAt.getTime() + EMAIL_CODE_COOLDOWN_MS > now.getTime()) {
      const retryAfterSeconds = Math.max(1, Math.ceil((latest.createdAt.getTime() + EMAIL_CODE_COOLDOWN_MS - now.getTime()) / 1000));
      throw new AuthApiError(429, "email_rate_limited", "Email code requested too frequently", retryAfterSeconds);
    }

    const code = createEmailCode();
    await this.store.createChallenge({
      emailNormalized,
      codeHash: hashEmailCode(emailNormalized, input.purpose, code),
      purpose: input.purpose,
      userId: input.userId ?? null,
      bindingTicketId: input.bindingTicketId ?? null,
      expiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_MS),
      createdIpHash: input.ip ? hashToken(input.ip) : null,
      now,
    });
    this.setDevelopmentCode(emailNormalized, input.purpose, code);
    try {
      await this.sender.sendVerificationCode({
        to: emailNormalized,
        emailMasked,
        code,
        purpose: input.purpose,
        minutes: EMAIL_CODE_TTL_MS / 60_000,
      });
    } catch (error) {
      if (error instanceof EmailSendError) {
        throw new AuthApiError(
          503,
          error.code,
          error.code === "email_provider_not_configured"
            ? "Email provider is not configured"
            : "Email delivery failed",
        );
      }
      throw error;
    }
    return {
      status: "sent" as const,
      emailMasked,
      cooldownSeconds: EMAIL_CODE_COOLDOWN_MS / 1000,
      expiresInSeconds: EMAIL_CODE_TTL_MS / 1000,
    };
  }

  async verifyCode(input: {
    email: string;
    purpose: EmailCodePurpose;
    code: string;
    now?: Date;
  }): Promise<{ emailNormalized: string; emailMasked: string; challengeId: string }> {
    const now = input.now ?? this.now();
    const emailNormalized = normalizeEmail(input.email);
    const challenge = await this.store.findLatestChallenge({ emailNormalized, purpose: input.purpose });
    if (!challenge || challenge.consumedAt) {
      throw new AuthApiError(400, "email_code_invalid", "Invalid email code");
    }
    if (challenge.expiresAt <= now) {
      throw new AuthApiError(400, "email_code_expired", "Email code expired");
    }
    if (challenge.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      throw new AuthApiError(400, "email_code_attempts_exceeded", "Too many email code attempts");
    }

    const valid = challenge.codeHash === hashEmailCode(emailNormalized, input.purpose, input.code);
    if (!valid) {
      await this.store.incrementAttempts(challenge.id, now);
      if (challenge.attempts + 1 >= EMAIL_CODE_MAX_ATTEMPTS) {
        throw new AuthApiError(400, "email_code_attempts_exceeded", "Too many email code attempts");
      }
      throw new AuthApiError(400, "email_code_invalid", "Invalid email code");
    }

    await this.store.consumeChallenge(challenge.id, now);
    return { emailNormalized, emailMasked: maskEmail(emailNormalized), challengeId: challenge.id };
  }

  getDevelopmentCode(input: { email: string; purpose: EmailCodePurpose }): string | null {
    if (!isAuthTestMode()) return null;
    return this.developmentCodes.get(testCodeKey(normalizeEmail(input.email), input.purpose)) ?? null;
  }

  private setDevelopmentCode(emailNormalized: string, purpose: EmailCodePurpose, code: string) {
    if (process.env.NODE_ENV === "production") return;
    this.developmentCodes.set(testCodeKey(emailNormalized, purpose), code);
  }
}

export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AuthApiError(400, "invalid_email", "Invalid email");
  }
  return normalized;
}

export function maskEmail(emailNormalized: string): string {
  const [local = "", domain = ""] = emailNormalized.split("@");
  const head = local.slice(0, 1) || "*";
  return `${head}***@${domain}`;
}

export function hashEmailCode(emailNormalized: string, purpose: EmailCodePurpose, code: string): string {
  return hmacSha256Base64Url(`email-code:${purpose}:${emailNormalized}:${code}`);
}

function createEmailCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function testCodeKey(emailNormalized: string, purpose: EmailCodePurpose) {
  return `${purpose}:${emailNormalized}`;
}

export function isAuthTestMode(): boolean {
  return process.env.NODE_ENV === "test" || process.env.WARDROBE_AUTH_TEST === "1";
}
