import { randomUUID } from "node:crypto";

import type { EmailCodePurpose } from "@wardrobe/cloud-contracts";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EmailVerificationService,
  type EmailChallengeRecord,
  type EmailVerificationStore,
  hashEmailCode,
} from "../src/auth/email-verification.js";
import { MockEmailSender } from "../src/email/mock-sender.js";

class MemoryEmailVerificationStore implements EmailVerificationStore {
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
      attempts: 0,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: input.now,
    };
    this.challenges.push(challenge);
    return challenge;
  }

  async incrementAttempts(challengeId: string, now: Date) {
    const challenge = this.challenges.find((item) => item.id === challengeId);
    if (challenge) {
      challenge.attempts += 1;
      challenge.createdAt = challenge.createdAt;
      void now;
    }
  }

  async consumeChallenge(challengeId: string, now: Date) {
    const challenge = this.challenges.find((item) => item.id === challengeId);
    if (challenge) challenge.consumedAt = now;
  }
}

function makeFixture(now = new Date("2026-07-09T00:00:00.000Z")) {
  const store = new MemoryEmailVerificationStore();
  const sender = new MockEmailSender();
  const service = new EmailVerificationService({
    store,
    sender,
    now: () => now,
  });
  return { store, sender, service, now };
}

afterEach(() => {
  delete process.env.WARDROBE_AUTH_TEST;
});

describe("email verification service", () => {
  it("sends a six digit code without storing plaintext in the challenge", async () => {
    const { store, sender, service } = makeFixture();

    const result = await service.sendCode({
      email: " User@Example.COM ",
      purpose: "register",
      ip: "127.0.0.1",
    });

    expect(result).toMatchObject({
      status: "sent",
      emailMasked: "u***@example.com",
      cooldownSeconds: 30,
      expiresInSeconds: 600,
    });
    expect(sender.messages).toHaveLength(1);
    expect(sender.messages[0].code).toMatch(/^\d{6}$/);
    expect(store.challenges[0].emailNormalized).toBe("user@example.com");
    expect(store.challenges[0].codeHash).toBe(hashEmailCode("user@example.com", "register", sender.messages[0].code));
    expect(JSON.stringify(store.challenges[0])).not.toContain(sender.messages[0].code);
  });

  it("enforces the resend cooldown for same email and purpose", async () => {
    const { service } = makeFixture();
    await service.sendCode({ email: "user@example.com", purpose: "register" });

    await expect(service.sendCode({ email: "user@example.com", purpose: "register" }))
      .rejects.toMatchObject({ code: "email_rate_limited", retryAfterSeconds: 30 });
  });

  it("exposes the latest code through the test-mode helper", async () => {
    const { service, sender } = makeFixture();
    await service.sendCode({ email: "user@example.com", purpose: "register" });
    expect(service.getDevelopmentCode({ email: "USER@example.com", purpose: "register" })).toBe(sender.messages[0].code);
  });

  it("consumes a valid code once", async () => {
    const { service, sender } = makeFixture();
    await service.sendCode({ email: "user@example.com", purpose: "register" });

    const result = await service.verifyCode({
      email: "user@example.com",
      purpose: "register",
      code: sender.messages[0].code,
    });

    expect(result.emailNormalized).toBe("user@example.com");
    await expect(service.verifyCode({
      email: "user@example.com",
      purpose: "register",
      code: sender.messages[0].code,
    })).rejects.toMatchObject({ code: "email_code_invalid" });
  });

  it("rejects expired codes and too many wrong attempts", async () => {
    const { service, store, sender, now } = makeFixture();
    await service.sendCode({ email: "user@example.com", purpose: "register" });
    store.challenges[0].expiresAt = new Date(now.getTime() - 1);
    await expect(service.verifyCode({
      email: "user@example.com",
      purpose: "register",
      code: sender.messages[0].code,
    })).rejects.toMatchObject({ code: "email_code_expired" });

    const second = makeFixture();
    await second.service.sendCode({ email: "user@example.com", purpose: "register" });
    for (let attempt = 1; attempt < EMAIL_CODE_MAX_ATTEMPTS; attempt += 1) {
      await expect(second.service.verifyCode({
        email: "user@example.com",
        purpose: "register",
        code: "000000",
      })).rejects.toMatchObject({ code: attempt === EMAIL_CODE_MAX_ATTEMPTS - 1 ? "email_code_attempts_exceeded" : "email_code_invalid" });
    }
  });
});

describe("email verification routes", () => {
  it("sends codes and serves the test code in test mode", async () => {
    const fixture = makeFixture();
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
      emailVerificationService: fixture.service,
    });

    const send = await app.inject({
      method: "POST",
      url: "/api/auth/email/send-code",
      payload: { email: "user@example.com", purpose: "register" },
    });
    expect(send.statusCode).toBe(200);
    expect(send.json().emailMasked).toBe("u***@example.com");

    const visible = await app.inject({
      method: "GET",
      url: "/api/auth/email/test-code?email=user%40example.com&purpose=register",
    });
    expect(visible.statusCode).toBe(200);
    expect(visible.json().code).toBe(fixture.sender.messages[0].code);

    await app.close();
  });
});
