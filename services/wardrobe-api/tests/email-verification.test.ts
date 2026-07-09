import { randomUUID } from "node:crypto";

import type { EmailCodePurpose } from "@wardrobe/cloud-contracts";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { createEmailSenderFromEnv } from "../src/email/factory.js";
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EmailVerificationService,
  type EmailChallengeRecord,
  type EmailVerificationStore,
  hashEmailCode,
} from "../src/auth/email-verification.js";
import { MockEmailSender } from "../src/email/mock-sender.js";
import { EmailSendError, type EmailSender } from "../src/email/types.js";

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
      createdIpHash: input.createdIpHash ?? null,
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

  async findLatestChallengeForEmail(emailNormalized: string) {
    return this.challenges
      .filter((challenge) => challenge.emailNormalized === emailNormalized)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
  }

  async countChallengesSince(input: {
    emailNormalized?: string;
    createdIpHash?: string;
    since: Date;
  }) {
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

function makeFixture(now = new Date("2026-07-09T00:00:00.000Z")) {
  let currentNow = now;
  const store = new MemoryEmailVerificationStore();
  const sender = new MockEmailSender();
  const service = new EmailVerificationService({
    store,
    sender,
    now: () => currentNow,
  });
  return {
    store,
    sender,
    service,
    now,
    advance(milliseconds: number) {
      currentNow = new Date(currentNow.getTime() + milliseconds);
    },
  };
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
      cooldownSeconds: 60,
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
      .rejects.toMatchObject({ code: "email_rate_limited", retryAfterSeconds: 60 });
  });

  it("enforces cooldown across purposes for the same email", async () => {
    const { service } = makeFixture();
    await service.sendCode({ email: "user@example.com", purpose: "register" });

    await expect(service.sendCode({ email: "user@example.com", purpose: "reset_password" }))
      .rejects.toMatchObject({ code: "email_rate_limited", retryAfterSeconds: 60 });
  });

  it("limits one email to five sends per hour", async () => {
    const fixture = makeFixture();
    for (let index = 0; index < 5; index += 1) {
      await fixture.service.sendCode({ email: "user@example.com", purpose: "register" });
      fixture.advance(60_000);
    }

    await expect(fixture.service.sendCode({ email: "user@example.com", purpose: "register" }))
      .rejects.toMatchObject({ code: "email_code_rate_limited", statusCode: 429 });
  });

  it("limits one IP to twenty sends per hour", async () => {
    const fixture = makeFixture();
    for (let index = 0; index < 20; index += 1) {
      await fixture.service.sendCode({
        email: `user-${index}@example.com`,
        purpose: "register",
        ip: "127.0.0.1",
      });
    }

    await expect(fixture.service.sendCode({
      email: "user-20@example.com",
      purpose: "register",
      ip: "127.0.0.1",
    })).rejects.toMatchObject({ code: "email_code_rate_limited", statusCode: 429 });
  });

  it("removes the challenge when delivery fails", async () => {
    const store = new MemoryEmailVerificationStore();
    const sender: EmailSender = {
      async sendVerificationCode() {
        throw new EmailSendError("email_provider_error", "Email delivery failed");
      },
    };
    const service = new EmailVerificationService({ store, sender });

    await expect(service.sendCode({ email: "user@example.com", purpose: "register" }))
      .rejects.toMatchObject({ code: "email_provider_error", statusCode: 503 });
    expect(store.challenges).toHaveLength(0);
    expect(service.getDevelopmentCode({ email: "user@example.com", purpose: "register" })).toBeNull();
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
  it("returns 503 without creating a challenge when Tencent SES is incomplete", async () => {
    const store = new MemoryEmailVerificationStore();
    const service = new EmailVerificationService({
      store,
      sender: createEmailSenderFromEnv({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "tencent-ses",
      }),
    });
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
      emailVerificationService: service,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/email/send-code",
      payload: { email: "user@example.com", purpose: "register" },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "email_provider_not_configured" });
    expect(store.challenges).toHaveLength(0);
    await app.close();
  });

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
