import type {
  AccountDeletionConfirmRequest,
  AccountDeletionMethod,
  AccountDeletionVerifyRequest,
  SendEmailCodeResponse,
} from "@wardrobe/cloud-contracts";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "../db/client.js";
import {
  accountDeletionAuthorizations,
  accountDeletionJobs,
  accountSecurityEvents,
  apiRequestTraces,
  assets,
  deviceSessions,
  diagnosticAccessAudits,
  diagnosticCases,
  emailIdentities,
  passwordCredentials,
  pendingRegistrations,
  phoneIdentities,
  refreshTokens,
  users,
  wechatBindingTickets,
  wechatIdentities,
} from "../db/schema.js";
import { verifyPassword as verifyPasswordHash } from "../security/password.js";
import { hmacSha256Base64Url } from "../security/hmac.js";
import { generateOpaqueToken, hashToken } from "../security/token-hash.js";
import type { StorageProvider } from "../storage/provider.js";
import { AuthApiError } from "./registrations.js";
import type { AccessTokenClaims } from "./session.js";
import { EmailVerificationService } from "./email-verification.js";
import { hashWechatOpenId, WechatCodeSessionClient, type WechatOpenIdClient } from "./wechat-openid.js";

const AUTHORIZATION_TTL_MS = 5 * 60 * 1000;

export interface AccountDeletionIdentityRecord {
  userId: string;
  disabledAt: Date | null;
  emailNormalized?: string;
  emailVerified: boolean;
  passwordHash?: string;
  wechat: Array<{ appId: string; openidHash: string }>;
}

export interface AccountDeletionJobRecord {
  id: string;
  receiptTokenHash: string;
  subjectUserId: string | null;
  status: "processing" | "completed" | "failed";
  storageKeys: string[];
  attempts: number;
  lastErrorCode: string | null;
  completedAt: Date | null;
  updatedAt: Date;
}

export interface AccountDeletionStore {
  getIdentity(userId: string): Promise<AccountDeletionIdentityRecord | null>;
  createAuthorization(input: {
    userId: string;
    deviceId: string;
    method: AccountDeletionMethod;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<void>;
  beginDeletion(input: {
    userId: string;
    deviceId: string;
    tokenHash: string;
    receiptTokenHash: string;
    now: Date;
  }): Promise<AccountDeletionJobRecord | null>;
  findJobByReceiptHash(receiptTokenHash: string): Promise<AccountDeletionJobRecord | null>;
  listProcessingJobs(limit: number): Promise<AccountDeletionJobRecord[]>;
  markJobFailure(jobId: string, errorCode: string, now: Date): Promise<void>;
  deleteUserAndComplete(jobId: string, userId: string, now: Date): Promise<void>;
}

export class PostgresAccountDeletionStore implements AccountDeletionStore {
  async getIdentity(userId: string): Promise<AccountDeletionIdentityRecord | null> {
    const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;
    const [[email], [password], wechat] = await Promise.all([
      getDb().select().from(emailIdentities).where(eq(emailIdentities.userId, userId)).limit(1),
      getDb().select().from(passwordCredentials).where(eq(passwordCredentials.userId, userId)).limit(1),
      getDb().select({ appId: wechatIdentities.appId, openidHash: wechatIdentities.openidHash })
        .from(wechatIdentities).where(eq(wechatIdentities.userId, userId)),
    ]);
    return {
      userId,
      disabledAt: user.disabledAt,
      emailNormalized: email?.emailNormalized,
      emailVerified: Boolean(email?.verifiedAt),
      passwordHash: password?.passwordHash,
      wechat,
    };
  }

  async createAuthorization(input: {
    userId: string; deviceId: string; method: AccountDeletionMethod; tokenHash: string;
    expiresAt: Date; now: Date;
  }) {
    await getDb().insert(accountDeletionAuthorizations).values({
      userId: input.userId,
      deviceId: input.deviceId,
      method: input.method,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  async beginDeletion(input: {
    userId: string; deviceId: string; tokenHash: string; receiptTokenHash: string; now: Date;
  }): Promise<AccountDeletionJobRecord | null> {
    const existing = await this.findJobByReceiptHash(input.receiptTokenHash);
    if (existing) return existing;

    const created = await getDb().transaction(async (tx) => {
      const [consumed] = await tx.update(accountDeletionAuthorizations)
        .set({ consumedAt: input.now, updatedAt: input.now })
        .where(and(
          eq(accountDeletionAuthorizations.userId, input.userId),
          eq(accountDeletionAuthorizations.deviceId, input.deviceId),
          eq(accountDeletionAuthorizations.tokenHash, input.tokenHash),
          isNull(accountDeletionAuthorizations.consumedAt),
          gt(accountDeletionAuthorizations.expiresAt, input.now),
        ))
        .returning({ id: accountDeletionAuthorizations.id });
      if (!consumed) return null;

      const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!user) return null;

      const sessions = await tx.select({ id: deviceSessions.id }).from(deviceSessions).where(eq(deviceSessions.userId, input.userId));
      const sessionIds = sessions.map((session) => session.id);
      const [assetRows, diagnosticRows] = await Promise.all([
        tx.select({ original: assets.originalStorageKey, thumbnail: assets.thumbnailStorageKey })
          .from(assets).where(eq(assets.userId, input.userId)),
        tx.select({ key: diagnosticCases.storageKey }).from(diagnosticCases).where(eq(diagnosticCases.userId, input.userId)),
      ]);
      const storageKeys = [...new Set([
        ...assetRows.flatMap((row) => [row.original, row.thumbnail]),
        ...diagnosticRows.map((row) => row.key),
      ].filter((key): key is string => Boolean(key)))];

      await tx.update(users).set({ disabledAt: input.now, updatedAt: input.now }).where(eq(users.id, input.userId));
      await tx.update(deviceSessions).set({ revokedAt: input.now, updatedAt: input.now }).where(eq(deviceSessions.userId, input.userId));
      if (sessionIds.length > 0) {
        await tx.update(refreshTokens).set({ status: "revoked", revokedAt: input.now, updatedAt: input.now })
          .where(inArray(refreshTokens.sessionId, sessionIds));
      }
      const [job] = await tx.insert(accountDeletionJobs).values({
        receiptTokenHash: input.receiptTokenHash,
        subjectUserId: input.userId,
        status: "processing",
        storageKeys,
        createdAt: input.now,
        updatedAt: input.now,
      }).returning();
      return job;
    });

    if (created) return toJobRecord(created);
    return this.findJobByReceiptHash(input.receiptTokenHash);
  }

  async findJobByReceiptHash(receiptTokenHash: string) {
    const [job] = await getDb().select().from(accountDeletionJobs)
      .where(eq(accountDeletionJobs.receiptTokenHash, receiptTokenHash)).limit(1);
    return job ? toJobRecord(job) : null;
  }

  async listProcessingJobs(limit: number) {
    const jobs = await getDb().select().from(accountDeletionJobs)
      .where(eq(accountDeletionJobs.status, "processing")).limit(limit);
    return jobs.map(toJobRecord);
  }

  async markJobFailure(jobId: string, errorCode: string, now: Date) {
    await getDb().update(accountDeletionJobs).set({
      attempts: sql`${accountDeletionJobs.attempts} + 1`,
      lastErrorCode: errorCode,
      updatedAt: now,
    }).where(and(eq(accountDeletionJobs.id, jobId), eq(accountDeletionJobs.status, "processing")));
  }

  async deleteUserAndComplete(jobId: string, userId: string, now: Date) {
    await getDb().transaction(async (tx) => {
      const [emailRows, phoneRows, wechatRows, diagnosticRows, sessionRows] = await Promise.all([
        tx.select({ email: emailIdentities.emailNormalized }).from(emailIdentities).where(eq(emailIdentities.userId, userId)),
        tx.select({ phone: phoneIdentities.phoneE164 }).from(phoneIdentities).where(eq(phoneIdentities.userId, userId)),
        tx.select({ openidHash: wechatIdentities.openidHash }).from(wechatIdentities).where(eq(wechatIdentities.userId, userId)),
        tx.select({ caseId: diagnosticCases.caseId }).from(diagnosticCases).where(eq(diagnosticCases.userId, userId)),
        tx.select({ deviceId: deviceSessions.deviceId }).from(deviceSessions).where(eq(deviceSessions.userId, userId)),
      ]);
      const caseIds = diagnosticRows.map((row) => row.caseId);
      const openidHashes = wechatRows.map((row) => row.openidHash);
      if (caseIds.length > 0) await tx.delete(diagnosticAccessAudits).where(inArray(diagnosticAccessAudits.caseId, caseIds));
      if (openidHashes.length > 0) await tx.delete(wechatBindingTickets).where(inArray(wechatBindingTickets.openidHash, openidHashes));
      const phoneNumbers = phoneRows.map((row) => row.phone);
      if (phoneNumbers.length > 0) await tx.delete(pendingRegistrations).where(inArray(pendingRegistrations.phoneE164, phoneNumbers));
      await tx.update(accountSecurityEvents).set({ userId: null, metadata: { redacted: true } })
        .where(eq(accountSecurityEvents.userId, userId));
      await tx.update(apiRequestTraces).set({ userIdHash: null })
        .where(eq(apiRequestTraces.userIdHash, hashToken(userId)));
      const deviceHashes = [...new Set(sessionRows.map((row) => hashToken(row.deviceId)))];
      if (deviceHashes.length > 0) {
        await tx.update(apiRequestTraces).set({ deviceIdHash: null })
          .where(inArray(apiRequestTraces.deviceIdHash, deviceHashes));
      }
      for (const row of emailRows) {
        await tx.delete(emailIdentities).where(and(eq(emailIdentities.userId, userId), eq(emailIdentities.emailNormalized, row.email)));
      }
      await tx.delete(users).where(eq(users.id, userId));
      await tx.update(accountDeletionJobs).set({
        subjectUserId: null,
        storageKeys: [],
        status: "completed",
        lastErrorCode: null,
        completedAt: now,
        updatedAt: now,
      }).where(eq(accountDeletionJobs.id, jobId));
    });
  }
}

export class AccountDeletionService {
  private readonly store: AccountDeletionStore;
  private readonly storage: StorageProvider;
  private readonly now: () => Date;
  private readonly verifyPassword: (hash: string, password: string) => Promise<boolean>;
  private readonly exchangeWechatCode: (appId: string, loginCode: string) => Promise<{ openidHash: string }>;
  private readonly verifyEmailCode: (email: string, code: string) => Promise<void>;
  private readonly sendEmailCode: (email: string, userId: string, ip?: string) => Promise<SendEmailCodeResponse>;

  constructor(options: {
    store?: AccountDeletionStore;
    storage: StorageProvider;
    emailVerificationService?: EmailVerificationService;
    wechatClient?: WechatOpenIdClient;
    now?: () => Date;
    verifyPassword?: (hash: string, password: string) => Promise<boolean>;
    exchangeWechatCode?: (appId: string, loginCode: string) => Promise<{ openidHash: string }>;
    verifyEmailCode?: (email: string, code: string) => Promise<void>;
    sendEmailCode?: (email: string, userId: string, ip?: string) => Promise<SendEmailCodeResponse>;
  }) {
    this.store = options.store ?? new PostgresAccountDeletionStore();
    this.storage = options.storage;
    this.now = options.now ?? (() => new Date());
    this.verifyPassword = options.verifyPassword ?? verifyPasswordHash;
    const email = options.emailVerificationService ?? new EmailVerificationService();
    const wechat = options.wechatClient ?? new WechatCodeSessionClient();
    this.verifyEmailCode = options.verifyEmailCode ?? (async (address, code) => {
      await email.verifyCode({ email: address, purpose: "delete_account", code });
    });
    this.sendEmailCode = options.sendEmailCode ?? ((address, userId, ip) =>
      email.sendCode({ email: address, purpose: "delete_account", userId, ip }));
    this.exchangeWechatCode = options.exchangeWechatCode ?? (async (appId, loginCode) => {
      const session = await wechat.codeToSession({ appId, loginCode });
      return { openidHash: hashWechatOpenId(appId, session.openid) };
    });
  }

  async requestEmailCode(claims: AccessTokenClaims, ip?: string) {
    const identity = await this.requireActiveIdentity(claims.userId);
    if (!identity.emailNormalized || !identity.emailVerified) {
      throw new AuthApiError(400, "account_deletion_method_unavailable", "Verified email is not available");
    }
    return this.sendEmailCode(identity.emailNormalized, claims.userId, ip);
  }

  async verify(claims: AccessTokenClaims, input: AccountDeletionVerifyRequest) {
    const identity = await this.requireActiveIdentity(claims.userId);
    if (input.method === "email") {
      if (!identity.emailNormalized || !identity.emailVerified) throw unavailable();
      await this.verifyEmailCode(identity.emailNormalized, input.emailCode);
    } else if (input.method === "password") {
      if (!identity.passwordHash || !(await this.verifyPassword(identity.passwordHash, input.currentPassword))) {
        throw new AuthApiError(401, "invalid_credentials", "Invalid current password");
      }
    } else {
      const binding = identity.wechat.find((item) => item.appId === input.appId);
      if (!binding) throw unavailable();
      const result = await this.exchangeWechatCode(input.appId, input.loginCode);
      if (result.openidHash !== binding.openidHash) {
        throw new AuthApiError(401, "invalid_credentials", "Wechat identity does not match this account");
      }
    }

    const now = this.now();
    const token = generateOpaqueToken();
    const expiresAt = new Date(now.getTime() + AUTHORIZATION_TTL_MS);
    await this.store.createAuthorization({
      userId: claims.userId,
      deviceId: claims.deviceId,
      method: input.method,
      tokenHash: hashToken(token),
      expiresAt,
      now,
    });
    return { authorizationToken: token, expiresAt: expiresAt.toISOString() };
  }

  async confirm(claims: AccessTokenClaims, input: AccountDeletionConfirmRequest) {
    const receiptToken = hmacSha256Base64Url(`account-deletion-receipt:${input.authorizationToken}`);
    const job = await this.store.beginDeletion({
      userId: claims.userId,
      deviceId: claims.deviceId,
      tokenHash: hashToken(input.authorizationToken),
      receiptTokenHash: hashToken(receiptToken),
      now: this.now(),
    });
    if (!job) throw new AuthApiError(409, "account_deletion_authorization_invalid", "Deletion authorization is invalid or expired");
    if (job.status === "processing") await this.processJob(job);
    const current = await this.store.findJobByReceiptHash(hashToken(receiptToken));
    return { receiptToken, status: current?.status === "completed" ? "completed" as const : "processing" as const };
  }

  async status(receiptToken: string) {
    const job = await this.store.findJobByReceiptHash(hashToken(receiptToken));
    if (!job) throw new AuthApiError(404, "account_deletion_receipt_not_found", "Deletion receipt not found");
    return {
      status: job.status,
      ...(job.completedAt ? { completedAt: job.completedAt.toISOString() } : {}),
      ...((job.status === "failed" || job.lastErrorCode) ? { referenceCode: job.id.slice(0, 8).toUpperCase() } : {}),
    };
  }

  async retryPendingJobs(limit = 25) {
    const jobs = await this.store.listProcessingJobs(limit);
    for (const job of jobs) await this.processJob(job);
  }

  private async processJob(job: AccountDeletionJobRecord) {
    if (!job.subjectUserId || job.status !== "processing") return;
    try {
      for (const key of [...new Set(job.storageKeys.filter(Boolean))]) await this.storage.delete(key);
      await this.store.deleteUserAndComplete(job.id, job.subjectUserId, this.now());
    } catch {
      await this.store.markJobFailure(job.id, "storage_or_database_delete_failed", this.now());
    }
  }

  private async requireActiveIdentity(userId: string) {
    const identity = await this.store.getIdentity(userId);
    if (!identity || identity.disabledAt) throw new AuthApiError(401, "AUTH_SESSION_REVOKED", "Account is unavailable");
    return identity;
  }
}

function unavailable() {
  return new AuthApiError(400, "account_deletion_method_unavailable", "Verification method is not bound to this account");
}

function toJobRecord(row: typeof accountDeletionJobs.$inferSelect): AccountDeletionJobRecord {
  return {
    id: row.id,
    receiptTokenHash: row.receiptTokenHash,
    subjectUserId: row.subjectUserId,
    status: row.status,
    storageKeys: Array.isArray(row.storageKeys) ? row.storageKeys.filter((key): key is string => typeof key === "string") : [],
    attempts: row.attempts,
    lastErrorCode: row.lastErrorCode,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
  };
}
