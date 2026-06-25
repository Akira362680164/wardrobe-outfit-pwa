import { timingSafeEqual } from "node:crypto";

import { and, eq, gt, inArray } from "drizzle-orm";

import { getDb } from "../db/client.js";
import {
  accountSecurityEvents,
  deviceSessions,
  passwordCredentials,
  pendingRegistrations,
  phoneIdentities,
  users,
} from "../db/schema.js";
import { hashPassword } from "../security/password.js";
import { generateOpaqueToken, hashToken } from "../security/token-hash.js";
import { FixedWindowRateLimiter } from "./rate-limit.js";

export const REGISTRATION_TTL_MS = 30 * 60 * 1000;
export const REGISTRATION_RATE_LIMIT_MAX = 5;
export const REGISTRATION_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export type RegistrationStatus = "pending" | "verified" | "expired" | "cancelled" | "completed";

export interface PendingRegistrationRecord {
  id: string;
  phoneE164: string;
  maskedPhone: string;
  passwordHash: string;
  clientSecretHash: string;
  status: RegistrationStatus;
  verificationSource: string | null;
  verifiedAt: Date | null;
  expiresAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompletedRegistration {
  userId: string;
  sessionId: string;
  deviceId: string;
  maskedPhone: string;
}

export interface SecurityEventInput {
  userId?: string | null;
  eventType: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface RegistrationStore {
  hasUserForPhone(phoneE164: string): Promise<boolean>;
  cancelPendingRegistrations(phoneE164: string, now: Date): Promise<void>;
  createPendingRegistration(input: {
    phoneE164: string;
    maskedPhone: string;
    passwordHash: string;
    clientSecretHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<PendingRegistrationRecord>;
  findPendingRegistration(registrationId: string): Promise<PendingRegistrationRecord | null>;
  markRegistrationExpired(registrationId: string, now: Date): Promise<void>;
  verifyPendingRegistrationWithDevelopmentCli(
    registrationId: string,
    now: Date,
  ): Promise<PendingRegistrationRecord | null>;
  completeRegistration(input: {
    registrationId: string;
    deviceId: string;
    now: Date;
  }): Promise<CompletedRegistration | null>;
  recordSecurityEvent(input: SecurityEventInput): Promise<void>;
}

export class AuthApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export class PostgresRegistrationStore implements RegistrationStore {
  async hasUserForPhone(phoneE164: string) {
    const rows = await getDb()
      .select({ id: phoneIdentities.id })
      .from(phoneIdentities)
      .where(eq(phoneIdentities.phoneE164, phoneE164))
      .limit(1);
    return rows.length > 0;
  }

  async cancelPendingRegistrations(phoneE164: string, now: Date) {
    await getDb()
      .update(pendingRegistrations)
      .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
      .where(and(eq(pendingRegistrations.phoneE164, phoneE164), eq(pendingRegistrations.status, "pending")));
  }

  async createPendingRegistration(input: {
    phoneE164: string;
    maskedPhone: string;
    passwordHash: string;
    clientSecretHash: string;
    expiresAt: Date;
    now: Date;
  }) {
    const [created] = await getDb()
      .insert(pendingRegistrations)
      .values({
        phoneE164: input.phoneE164,
        maskedPhone: input.maskedPhone,
        passwordHash: input.passwordHash,
        clientSecretHash: input.clientSecretHash,
        status: "pending",
        expiresAt: input.expiresAt,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();

    return created;
  }

  async findPendingRegistration(registrationId: string) {
    const [registration] = await getDb()
      .select()
      .from(pendingRegistrations)
      .where(eq(pendingRegistrations.id, registrationId))
      .limit(1);
    return registration ?? null;
  }

  async markRegistrationExpired(registrationId: string, now: Date) {
    await getDb()
      .update(pendingRegistrations)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          eq(pendingRegistrations.id, registrationId),
          inArray(pendingRegistrations.status, ["pending", "verified"]),
        ),
      );
  }

  async verifyPendingRegistrationWithDevelopmentCli(registrationId: string, now: Date) {
    const registration = await this.findPendingRegistration(registrationId);
    if (!registration) return null;
    if (registration.status !== "pending") return null;
    if (registration.expiresAt <= now) {
      await this.markRegistrationExpired(registrationId, now);
      return null;
    }

    const [verified] = await getDb()
      .update(pendingRegistrations)
      .set({
        status: "verified",
        verificationSource: "development_cli",
        verifiedAt: now,
        updatedAt: now,
      })
      .where(and(eq(pendingRegistrations.id, registrationId), eq(pendingRegistrations.status, "pending")))
      .returning();

    return verified ?? null;
  }

  async completeRegistration(input: { registrationId: string; deviceId: string; now: Date }) {
    return getDb().transaction(async (tx) => {
      const [registration] = await tx
        .update(pendingRegistrations)
        .set({
          status: "completed",
          completedAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(pendingRegistrations.id, input.registrationId),
            eq(pendingRegistrations.status, "verified"),
            gt(pendingRegistrations.expiresAt, input.now),
          ),
        )
        .returning();

      if (!registration) {
        return null;
      }

      const [createdUser] = await tx.insert(users).values({}).returning({ id: users.id });
      await tx.insert(phoneIdentities).values({
        userId: createdUser.id,
        phoneE164: registration.phoneE164,
        maskedPhone: registration.maskedPhone,
        verifiedAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      });
      await tx.insert(passwordCredentials).values({
        userId: createdUser.id,
        passwordHash: registration.passwordHash,
        changedAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      });
      const [session] = await tx
        .insert(deviceSessions)
        .values({
          userId: createdUser.id,
          deviceId: input.deviceId,
          lastSeenAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning({ id: deviceSessions.id });

      return {
        userId: createdUser.id,
        sessionId: session.id,
        deviceId: input.deviceId,
        maskedPhone: registration.maskedPhone,
      };
    });
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
}

export class RegistrationService {
  private readonly store: RegistrationStore;
  private readonly limiter: FixedWindowRateLimiter;
  private readonly now: () => Date;

  constructor(options: {
    store?: RegistrationStore;
    limiter?: FixedWindowRateLimiter;
    now?: () => Date;
  } = {}) {
    this.store = options.store ?? new PostgresRegistrationStore();
    this.limiter =
      options.limiter ??
      new FixedWindowRateLimiter({
        maxAttempts: REGISTRATION_RATE_LIMIT_MAX,
        windowMs: REGISTRATION_RATE_LIMIT_WINDOW_MS,
      });
    this.now = options.now ?? (() => new Date());
  }

  async requestRegistration(input: {
    phone: string;
    password: string;
    rateLimitKey: string;
    ip?: string;
    userAgent?: string;
  }) {
    const now = this.now();
    const phoneE164 = normalizePhoneE164(input.phone);
    const maskedPhone = maskPhoneE164(phoneE164);
    const rate = this.limiter.take(`registration:${input.rateLimitKey}:${phoneE164}`, now.getTime());

    if (!rate.allowed) {
      await this.store.recordSecurityEvent({
        eventType: "registration.rate_limited",
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { maskedPhone },
      });
      throw new AuthApiError(429, "rate_limited", "Too many registration attempts", rate.retryAfterSeconds);
    }

    if (await this.store.hasUserForPhone(phoneE164)) {
      throw new AuthApiError(409, "phone_already_registered", "Phone is already registered");
    }

    await this.store.cancelPendingRegistrations(phoneE164, now);

    const clientSecret = generateOpaqueToken();
    const registration = await this.store.createPendingRegistration({
      phoneE164,
      maskedPhone,
      passwordHash: await hashPassword(input.password),
      clientSecretHash: hashToken(clientSecret),
      expiresAt: new Date(now.getTime() + REGISTRATION_TTL_MS),
      now,
    });

    await this.store.recordSecurityEvent({
      eventType: "registration.requested",
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: {
        registrationId: registration.id,
        maskedPhone,
      },
    });

    return {
      registrationId: registration.id,
      clientSecret,
      maskedPhone,
      expiresAt: registration.expiresAt.toISOString(),
    };
  }

  async getRegistrationStatus(input: { registrationId: string; clientSecret: string }) {
    const registration = await this.requireRegistrationWithSecret(input.registrationId, input.clientSecret);
    const now = this.now();
    const status = await this.visibleStatus(registration, now);
    return {
      status,
      expiresAt: registration.expiresAt.toISOString(),
      serverTime: now.toISOString(),
    };
  }

  async completeRegistration(input: { registrationId: string; clientSecret: string; deviceId: string }) {
    const registration = await this.requireRegistrationWithSecret(input.registrationId, input.clientSecret);
    const now = this.now();
    const status = await this.visibleStatus(registration, now);

    if (status !== "verified") {
      throw new AuthApiError(409, "registration_not_verified", "Registration is not verified");
    }

    const completed = await this.store.completeRegistration({
      registrationId: registration.id,
      deviceId: input.deviceId,
      now,
    });

    if (!completed) {
      throw new AuthApiError(409, "registration_not_completable", "Registration cannot be completed");
    }

    await this.store.recordSecurityEvent({
      userId: completed.userId,
      eventType: "registration.completed",
      metadata: {
        registrationId: registration.id,
        maskedPhone: completed.maskedPhone,
      },
    });

    return {
      status: "completed" as const,
      userId: completed.userId,
      sessionId: completed.sessionId,
      deviceId: completed.deviceId,
      maskedPhone: completed.maskedPhone,
      serverTime: now.toISOString(),
    };
  }

  async verifyPendingRegistrationWithDevelopmentCli(registrationId: string) {
    const now = this.now();
    const registration = await this.store.verifyPendingRegistrationWithDevelopmentCli(registrationId, now);

    if (!registration) {
      throw new AuthApiError(404, "registration_not_found", "Pending registration was not found");
    }

    await this.store.recordSecurityEvent({
      eventType: "registration.verified",
      metadata: {
        registrationId: registration.id,
        maskedPhone: registration.maskedPhone,
        verificationSource: "development_cli",
      },
    });

    return registration;
  }

  private async requireRegistrationWithSecret(registrationId: string, clientSecret: string) {
    const registration = await this.store.findPendingRegistration(registrationId);

    if (!registration || !safeEqual(registration.clientSecretHash, hashToken(clientSecret))) {
      throw new AuthApiError(401, "invalid_registration_secret", "Invalid registration secret");
    }

    return registration;
  }

  private async visibleStatus(registration: PendingRegistrationRecord, now: Date): Promise<RegistrationStatus> {
    if ((registration.status === "pending" || registration.status === "verified") && registration.expiresAt <= now) {
      await this.store.markRegistrationExpired(registration.id, now);
      return "expired";
    }

    return registration.status;
  }
}

export function normalizePhoneE164(phone: string) {
  const compact = phone.trim().replace(/[\s().-]/g, "");
  const normalized = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;

  if (/^1[3-9]\d{9}$/.test(normalized)) {
    return `+86${normalized}`;
  }

  if (/^861[3-9]\d{9}$/.test(normalized)) {
    return `+${normalized}`;
  }

  if (/^\+861[3-9]\d{9}$/.test(normalized)) {
    return normalized;
  }

  if (/^\+[1-9]\d{7,14}$/.test(normalized)) {
    return normalized;
  }

  throw new AuthApiError(400, "invalid_phone", "Invalid phone number");
}

export function maskPhoneE164(phoneE164: string) {
  const digits = phoneE164.replace(/\D/g, "");
  const localDigits = digits.startsWith("86") && digits.length === 13 ? digits.slice(2) : digits;

  if (localDigits.length >= 7) {
    return `${localDigits.slice(0, 3)}****${localDigits.slice(-4)}`;
  }

  return "****";
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
