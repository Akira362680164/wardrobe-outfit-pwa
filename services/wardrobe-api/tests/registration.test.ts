import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { FixedWindowRateLimiter } from "../src/auth/rate-limit.js";
import {
  REGISTRATION_TTL_MS,
  RegistrationService,
  type CompletedRegistration,
  type PendingRegistrationRecord,
  type RegistrationStatus,
  type RegistrationStore,
  type SecurityEventInput,
} from "../src/auth/registrations.js";
import { hashToken } from "../src/security/token-hash.js";

class MemoryRegistrationStore implements RegistrationStore {
  readonly registrations = new Map<string, PendingRegistrationRecord>();
  readonly phoneIdentities = new Map<string, { userId: string; maskedPhone: string }>();
  readonly passwordHashes = new Map<string, string>();
  readonly sessions = new Map<string, { userId: string; deviceId: string }>();
  readonly events: SecurityEventInput[] = [];

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
    phoneE164: string;
    maskedPhone: string;
    passwordHash: string;
    clientSecretHash: string;
    expiresAt: Date;
    now: Date;
  }) {
    const registration: PendingRegistrationRecord = {
      id: randomUUID(),
      phoneE164: input.phoneE164,
      maskedPhone: input.maskedPhone,
      passwordHash: input.passwordHash,
      clientSecretHash: input.clientSecretHash,
      status: "pending",
      verificationSource: null,
      verifiedAt: null,
      expiresAt: input.expiresAt,
      completedAt: null,
      cancelledAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.registrations.set(registration.id, registration);
    return registration;
  }

  async findPendingRegistration(registrationId: string) {
    return this.registrations.get(registrationId) ?? null;
  }

  async markRegistrationExpired(registrationId: string, now: Date) {
    const registration = this.registrations.get(registrationId);
    if (registration && (registration.status === "pending" || registration.status === "verified")) {
      registration.status = "expired";
      registration.updatedAt = now;
    }
  }

  async verifyPendingRegistrationWithDevelopmentCli(registrationId: string, now: Date) {
    const registration = this.registrations.get(registrationId);
    if (!registration || registration.status !== "pending" || registration.expiresAt <= now) {
      return null;
    }
    registration.status = "verified";
    registration.verificationSource = "development_cli";
    registration.verifiedAt = now;
    registration.updatedAt = now;
    return registration;
  }

  async completeRegistration(input: {
    registrationId: string;
    deviceId: string;
    now: Date;
  }): Promise<CompletedRegistration | null> {
    const registration = this.registrations.get(input.registrationId);
    if (!registration || registration.status !== "verified" || registration.expiresAt <= input.now) {
      return null;
    }

    const userId = randomUUID();
    const sessionId = randomUUID();
    registration.status = "completed";
    registration.completedAt = input.now;
    registration.updatedAt = input.now;
    this.phoneIdentities.set(registration.phoneE164, { userId, maskedPhone: registration.maskedPhone });
    this.passwordHashes.set(userId, registration.passwordHash);
    this.sessions.set(sessionId, { userId, deviceId: input.deviceId });
    return { userId, sessionId, deviceId: input.deviceId, maskedPhone: registration.maskedPhone };
  }

  async recordSecurityEvent(input: SecurityEventInput) {
    this.events.push(input);
  }
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
  const app = buildApp({
    readinessCheck: async () => ({ database: "ready" }),
    registrationService: service,
  });
  return { app, service, store, now };
}

async function createRegistration(app: ReturnType<typeof buildApp>, phone = "+8613812345678") {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/registrations",
    payload: { phone, password: "test-password-123" },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    registrationId: string;
    clientSecret: string;
    maskedPhone: string;
    expiresAt: string;
  };
}

describe("registration API", () => {
  it("creates a pending registration with a one-time client secret", async () => {
    const { app, store, now } = makeFixture();
    const created = await createRegistration(app);
    const row = store.registrations.get(created.registrationId);

    expect(created.maskedPhone).toBe("138****5678");
    expect(created.clientSecret).not.toHaveLength(0);
    expect(created.expiresAt).toBe(new Date(now.getTime() + REGISTRATION_TTL_MS).toISOString());
    expect(row?.status).toBe<RegistrationStatus>("pending");
    expect(row?.passwordHash).toContain("$argon2id$");
    expect(row?.passwordHash).not.toContain("test-password-123");
    expect(row?.clientSecretHash).toBe(hashToken(created.clientSecret));
    expect(store.events.map((event) => event.eventType)).toContain("registration.requested");

    await app.close();
  });

  it("cancels an older pending registration for the same phone", async () => {
    const { app, store } = makeFixture();
    const first = await createRegistration(app);
    const second = await createRegistration(app);

    expect(store.registrations.get(first.registrationId)?.status).toBe("cancelled");
    expect(store.registrations.get(second.registrationId)?.status).toBe("pending");

    await app.close();
  });

  it("rejects status checks with the wrong client secret or query secret", async () => {
    const { app } = makeFixture();
    const created = await createRegistration(app);
    const wrongSecret = await app.inject({
      method: "POST",
      url: `/api/auth/registrations/${created.registrationId}/status`,
      payload: { clientSecret: "wrong-client-secret", deviceId: "device-a" },
    });
    const querySecret = await app.inject({
      method: "POST",
      url: `/api/auth/registrations/${created.registrationId}/status?clientSecret=${created.clientSecret}`,
      payload: { clientSecret: created.clientSecret, deviceId: "device-a" },
    });

    expect(wrongSecret.statusCode).toBe(401);
    expect(querySecret.statusCode).toBe(400);

    await app.close();
  });

  it("does not complete before CLI verification", async () => {
    const { app } = makeFixture();
    const created = await createRegistration(app);
    const response = await app.inject({
      method: "POST",
      url: `/api/auth/registrations/${created.registrationId}/complete`,
      payload: { clientSecret: created.clientSecret, deviceId: "device-a" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "registration_not_verified" });

    await app.close();
  });

  it("allows CLI verified registration to complete exactly once", async () => {
    const { app, service, store } = makeFixture();
    const created = await createRegistration(app);
    await service.verifyPendingRegistrationWithDevelopmentCli(created.registrationId);

    const complete = await app.inject({
      method: "POST",
      url: `/api/auth/registrations/${created.registrationId}/complete`,
      payload: { clientSecret: created.clientSecret, deviceId: "device-a" },
    });
    const duplicate = await app.inject({
      method: "POST",
      url: `/api/auth/registrations/${created.registrationId}/complete`,
      payload: { clientSecret: created.clientSecret, deviceId: "device-a" },
    });

    expect(complete.statusCode).toBe(200);
    expect(complete.json()).toMatchObject({
      status: "completed",
      maskedPhone: "138****5678",
    });
    expect(store.sessions.get(complete.json().sessionId)?.deviceId).toBe("device-a");
    expect(store.phoneIdentities.has("+8613812345678")).toBe(true);
    expect(store.events.map((event) => event.eventType)).toContain("registration.verified");
    expect(store.events.map((event) => event.eventType)).toContain("registration.completed");
    expect(duplicate.statusCode).toBe(409);

    await app.close();
  });

  it("rate limits repeated registration requests", async () => {
    const { app } = makeFixture({ maxAttempts: 1 });
    await createRegistration(app);
    const limited = await app.inject({
      method: "POST",
      url: "/api/auth/registrations",
      payload: { phone: "+8613812345678", password: "test-password-123" },
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.json().retryAfterSeconds).toBeGreaterThan(0);

    await app.close();
  });

  it("rejects duplicate registration after the phone becomes a formal account", async () => {
    const { app, service } = makeFixture();
    const created = await createRegistration(app);
    await service.verifyPendingRegistrationWithDevelopmentCli(created.registrationId);
    await app.inject({
      method: "POST",
      url: `/api/auth/registrations/${created.registrationId}/complete`,
      payload: { clientSecret: created.clientSecret, deviceId: "device-a" },
    });

    const duplicatePhone = await app.inject({
      method: "POST",
      url: "/api/auth/registrations",
      payload: { phone: "+8613812345678", password: "test-password-456" },
    });

    expect(duplicatePhone.statusCode).toBe(409);
    expect(duplicatePhone.json()).toMatchObject({ code: "phone_already_registered" });

    await app.close();
  });
});

describe("development CLI verification", () => {
  it("uses development_cli and does not create a wechat identity path", () => {
    const cli = readFileSync(
      path.join(process.cwd(), "src/cli/verify-pending-registration.ts"),
      "utf8",
    );

    expect(cli).toContain("verifyPendingRegistrationWithDevelopmentCli");
    expect(cli).not.toMatch(/wechat/i);
  });
});
