import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import {
  AccountDeletionService,
  type AccountDeletionIdentityRecord,
  type AccountDeletionJobRecord,
  type AccountDeletionStore,
} from "../src/auth/account-deletion.js";
import type { StorageProvider } from "../src/storage/provider.js";
import type { SessionService } from "../src/auth/session.js";

const userId = randomUUID();
const claims = { userId, sessionId: randomUUID(), deviceId: "device-1" };

describe("account deletion service", () => {
  it("issues a one-use authorization after a valid password", async () => {
    const store = new MemoryDeletionStore();
    const service = createService(store);

    const result = await service.verify(claims, { method: "password", currentPassword: "password-123" });
    expect(result.authorizationToken.length).toBeGreaterThanOrEqual(32);
    expect(store.authorizations).toHaveLength(1);
    expect(store.authorizations[0]).toMatchObject({ userId, deviceId: "device-1", method: "password" });
  });

  it("rejects an identity method that is not bound to the account", async () => {
    const store = new MemoryDeletionStore();
    store.identity.wechat = [];
    const service = createService(store);

    await expect(service.verify(claims, { method: "wechat", loginCode: "code", appId: "wx-app" }))
      .rejects.toMatchObject({ statusCode: 400, code: "account_deletion_method_unavailable" });
  });

  it("disables first, reports processing on storage failure, and completes on retry", async () => {
    const store = new MemoryDeletionStore();
    const storage = memoryStorage("users/u/original.jpg");
    const service = createService(store, storage);
    const verified = await service.verify(claims, { method: "password", currentPassword: "password-123" });

    const confirmed = await service.confirm(claims, {
      authorizationToken: verified.authorizationToken,
      confirmationText: "DELETE_ACCOUNT",
    });
    expect(store.disabled).toBe(true);
    expect(store.revoked).toBe(true);
    expect(confirmed.status).toBe("processing");
    expect((await service.status(confirmed.receiptToken)).status).toBe("processing");

    await service.retryPendingJobs();
    expect((await service.status(confirmed.receiptToken)).status).toBe("completed");
    expect(store.deleted).toBe(true);
  });

  it("returns the same receipt for a repeated final confirmation", async () => {
    const store = new MemoryDeletionStore();
    const service = createService(store);
    const verified = await service.verify(claims, { method: "password", currentPassword: "password-123" });
    const input = { authorizationToken: verified.authorizationToken, confirmationText: "DELETE_ACCOUNT" as const };

    const first = await service.confirm(claims, input);
    const second = await service.confirm(claims, input);
    expect(second.receiptToken).toBe(first.receiptToken);
    expect(store.jobs).toHaveLength(1);
  });

  it("exposes authenticated verification and receipt-only status routes", async () => {
    const store = new MemoryDeletionStore();
    const service = createService(store);
    const app = buildApp({
      sessionService: {
        authenticate: async (header: string | undefined) => {
          if (header !== "Bearer ok") throw new Error("unauthorized");
          return claims;
        },
      } as SessionService,
      accountDeletionService: service,
      storageProvider: memoryStorage(),
    });

    const verified = await app.inject({
      method: "POST",
      url: "/api/auth/account-deletion/verify",
      headers: { authorization: "Bearer ok" },
      payload: { method: "password", currentPassword: "password-123" },
    });
    expect(verified.statusCode).toBe(200);
    const authorizationToken = verified.json().authorizationToken as string;
    const confirmed = await app.inject({
      method: "POST",
      url: "/api/auth/account-deletion/confirm",
      headers: { authorization: "Bearer ok" },
      payload: { authorizationToken, confirmationText: "DELETE_ACCOUNT" },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().status).toBe("completed");
    const status = await app.inject({
      method: "GET",
      url: `/api/auth/account-deletion/status/${confirmed.json().receiptToken}`,
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().status).toBe("completed");
    await app.close();
  });
});

class MemoryDeletionStore implements AccountDeletionStore {
  identity: AccountDeletionIdentityRecord = {
    userId,
    disabledAt: null,
    emailNormalized: "user@example.com",
    emailVerified: true,
    passwordHash: "$test$password",
    wechat: [{ appId: "wx-app", openidHash: "openid-hash" }],
  };
  authorizations: Array<{ userId: string; deviceId: string; method: string; tokenHash: string; expiresAt: Date }> = [];
  jobs: AccountDeletionJobRecord[] = [];
  disabled = false;
  revoked = false;
  deleted = false;

  async getIdentity(targetUserId: string) { return targetUserId === userId ? this.identity : null; }
  async createAuthorization(input: { userId: string; deviceId: string; method: string; tokenHash: string; expiresAt: Date }) {
    this.authorizations.push(input);
  }
  async beginDeletion(input: { userId: string; deviceId: string; tokenHash: string; receiptTokenHash: string; now: Date }) {
    const authorization = this.authorizations.find((item) => item.tokenHash === input.tokenHash && item.userId === input.userId && item.deviceId === input.deviceId);
    if (!authorization) return null;
    const existing = this.jobs.find((job) => job.receiptTokenHash === input.receiptTokenHash);
    if (existing) return existing;
    this.disabled = true;
    this.revoked = true;
    const job: AccountDeletionJobRecord = {
      id: randomUUID(), receiptTokenHash: input.receiptTokenHash, subjectUserId: input.userId,
      status: "processing", storageKeys: ["users/u/original.jpg"], attempts: 0,
      lastErrorCode: null, completedAt: null, updatedAt: input.now,
    };
    this.jobs.push(job);
    return job;
  }
  async findJobByReceiptHash(receiptTokenHash: string) { return this.jobs.find((job) => job.receiptTokenHash === receiptTokenHash) ?? null; }
  async listProcessingJobs() { return this.jobs.filter((job) => job.status === "processing"); }
  async markJobFailure(jobId: string, errorCode: string, now: Date) {
    const job = this.jobs.find((item) => item.id === jobId)!;
    job.attempts += 1; job.lastErrorCode = errorCode; job.updatedAt = now;
  }
  async deleteUserAndComplete(jobId: string, _targetUserId: string, now: Date) {
    const job = this.jobs.find((item) => item.id === jobId)!;
    this.deleted = true; job.status = "completed"; job.subjectUserId = null; job.storageKeys = [];
    job.completedAt = now; job.updatedAt = now;
  }
}

function createService(store: MemoryDeletionStore, storage = memoryStorage()) {
  return new AccountDeletionService({
    store,
    storage,
    verifyPassword: async (_hash, password) => password === "password-123",
    exchangeWechatCode: async () => ({ openidHash: "openid-hash" }),
    verifyEmailCode: async () => undefined,
    sendEmailCode: async () => ({ status: "sent", emailMasked: "u***@example.com", cooldownSeconds: 60, expiresInSeconds: 600 }),
    now: () => new Date("2026-07-10T12:00:00.000Z"),
  });
}

function memoryStorage(failOnceKey?: string): StorageProvider {
  let failed = false;
  return {
    name: "memory",
    save: async (input) => ({ storageKey: input.storageKey, sha256: input.expectedSha256, sizeBytes: input.bytes.length }),
    openReadStream: async () => { throw new Error("unused"); },
    stat: async () => ({ exists: false }),
    delete: async (key) => {
      if (key === failOnceKey && !failed) { failed = true; throw new Error("temporary"); }
    },
    cleanupTemporaryFiles: async () => 0,
    checkReady: async () => undefined,
  };
}
