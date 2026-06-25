import { randomUUID } from "node:crypto";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";

import { getDb } from "../db/client.js";
import {
  accountSecurityEvents,
  deviceSessions,
  passwordCredentials,
  phoneIdentities,
  refreshTokens,
  users,
} from "../db/schema.js";
import { importJwtKeyPairFromPem, JWT_ALGORITHM, loadJwtKeyPair } from "../security/jwt-keys.js";
import {
  decryptRefreshIdempotencyPayload,
  encryptRefreshIdempotencyPayload,
  loadRefreshIdempotencyKey,
  type EncryptedRefreshIdempotencyPayload,
} from "../security/refresh-idempotency.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import { generateOpaqueToken, hashToken } from "../security/token-hash.js";
import { AuthApiError, maskPhoneE164, normalizePhoneE164, type SecurityEventInput } from "./registrations.js";
import { FixedWindowRateLimiter } from "./rate-limit.js";

export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MAX = 5;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const REFRESH_RATE_LIMIT_MAX = 20;
export const REFRESH_RATE_LIMIT_WINDOW_MS = 60 * 1000;

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
  deviceId: string;
}

export interface AccessTokenIssuer {
  sign(claims: AccessTokenClaims, now: Date): Promise<{ accessToken: string; expiresAt: Date }>;
  verify(accessToken: string): Promise<AccessTokenClaims>;
}

export class JwtAccessTokenIssuer implements AccessTokenIssuer {
  private keyPair?: Promise<Awaited<ReturnType<typeof importJwtKeyPairFromPem>>>;

  async sign(claims: AccessTokenClaims, now: Date) {
    const keys = await this.getKeyPair();
    const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_MS);
    const accessToken = await new SignJWT({
      userId: claims.userId,
      sessionId: claims.sessionId,
      deviceId: claims.deviceId,
    })
      .setProtectedHeader({ alg: JWT_ALGORITHM })
      .setSubject(claims.userId)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(keys.privateKey);

    return { accessToken, expiresAt };
  }

  async verify(accessToken: string) {
    const keys = await this.getKeyPair();
    const { payload } = await jwtVerify(accessToken, keys.publicKey, {
      algorithms: [JWT_ALGORITHM],
    });

    if (
      typeof payload.userId !== "string" ||
      typeof payload.sessionId !== "string" ||
      typeof payload.deviceId !== "string"
    ) {
      throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "Invalid access token");
    }

    return {
      userId: payload.userId,
      sessionId: payload.sessionId,
      deviceId: payload.deviceId,
    };
  }

  private getKeyPair() {
    this.keyPair ??= loadJwtKeyPair();
    return this.keyPair;
  }
}

export interface SessionUserRecord {
  userId: string;
  maskedPhone: string;
  passwordHash: string;
  disabledAt: Date | null;
}

export interface SessionAccountRecord {
  userId: string;
  maskedPhone: string;
  disabledAt: Date | null;
  sessionRevokedAt: Date | null;
  deviceId: string;
}

export interface RefreshTokenRecord {
  id: string;
  sessionId: string;
  userId: string;
  deviceId: string;
  tokenHash: string;
  tokenFamilyId: string;
  status: "active" | "used" | "revoked";
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  refreshRequestId: string | null;
  idempotencyCiphertext: string | null;
  idempotencyNonce: string | null;
  idempotencyAuthTag: string | null;
  idempotencyExpiresAt: Date | null;
  sessionRevokedAt: Date | null;
  userDisabledAt: Date | null;
  maskedPhone: string;
}

export interface SessionStore {
  findUserByPhone(phoneE164: string): Promise<SessionUserRecord | null>;
  createSessionWithRefreshToken(input: {
    userId: string;
    deviceId: string;
    deviceLabel?: string | null;
    refreshTokenHash: string;
    tokenFamilyId: string;
    refreshExpiresAt: Date;
    now: Date;
  }): Promise<{ sessionId: string }>;
  createRefreshTokenForSession(input: {
    sessionId: string;
    refreshTokenHash: string;
    tokenFamilyId: string;
    refreshExpiresAt: Date;
    now: Date;
  }): Promise<void>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  rotateActiveRefreshToken(input: {
    oldRefreshTokenHash: string;
    refreshRequestId: string;
    idempotency: EncryptedRefreshIdempotencyPayload;
    newRefreshTokenHash: string;
    newRefreshExpiresAt: Date;
    now: Date;
  }): Promise<boolean>;
  revokeRefreshFamily(tokenFamilyId: string, now: Date): Promise<void>;
  revokeSession(sessionId: string, now: Date): Promise<void>;
  revokeAllSessions(userId: string, now: Date): Promise<void>;
  getAccountSession(userId: string, sessionId: string): Promise<SessionAccountRecord | null>;
  getPasswordCredential(userId: string): Promise<{ passwordHash: string } | null>;
  changePasswordAndRevokeOtherSessions(input: {
    userId: string;
    currentSessionId: string;
    newPasswordHash: string;
    now: Date;
  }): Promise<void>;
  recordSecurityEvent(input: SecurityEventInput): Promise<void>;
}

export class PostgresSessionStore implements SessionStore {
  async findUserByPhone(phoneE164: string) {
    const [identity] = await getDb()
      .select()
      .from(phoneIdentities)
      .where(eq(phoneIdentities.phoneE164, phoneE164))
      .limit(1);
    if (!identity) return null;

    const [user] = await getDb().select().from(users).where(eq(users.id, identity.userId)).limit(1);
    const [credential] = await getDb()
      .select()
      .from(passwordCredentials)
      .where(eq(passwordCredentials.userId, identity.userId))
      .limit(1);

    if (!user || !credential) return null;
    return {
      userId: user.id,
      maskedPhone: identity.maskedPhone,
      passwordHash: credential.passwordHash,
      disabledAt: user.disabledAt,
    };
  }

  async createSessionWithRefreshToken(input: {
    userId: string;
    deviceId: string;
    deviceLabel?: string | null;
    refreshTokenHash: string;
    tokenFamilyId: string;
    refreshExpiresAt: Date;
    now: Date;
  }) {
    return getDb().transaction(async (tx) => {
      const [session] = await tx
        .insert(deviceSessions)
        .values({
          userId: input.userId,
          deviceId: input.deviceId,
          deviceLabel: input.deviceLabel ?? null,
          lastSeenAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning({ id: deviceSessions.id });

      await tx.insert(refreshTokens).values({
        sessionId: session.id,
        tokenHash: input.refreshTokenHash,
        tokenFamilyId: input.tokenFamilyId,
        status: "active",
        absoluteExpiresAt: input.refreshExpiresAt,
        createdAt: input.now,
        updatedAt: input.now,
      });

      return { sessionId: session.id };
    });
  }

  async createRefreshTokenForSession(input: {
    sessionId: string;
    refreshTokenHash: string;
    tokenFamilyId: string;
    refreshExpiresAt: Date;
    now: Date;
  }) {
    await getDb().insert(refreshTokens).values({
      sessionId: input.sessionId,
      tokenHash: input.refreshTokenHash,
      tokenFamilyId: input.tokenFamilyId,
      status: "active",
      absoluteExpiresAt: input.refreshExpiresAt,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  async findRefreshTokenByHash(tokenHash: string) {
    const [token] = await getDb()
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    if (!token) return null;

    const [session] = await getDb()
      .select()
      .from(deviceSessions)
      .where(eq(deviceSessions.id, token.sessionId))
      .limit(1);
    if (!session) return null;

    const [user] = await getDb().select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (!user) return null;

    const [identity] = await getDb()
      .select()
      .from(phoneIdentities)
      .where(eq(phoneIdentities.userId, user.id))
      .limit(1);

    return {
      id: token.id,
      sessionId: token.sessionId,
      userId: session.userId,
      deviceId: session.deviceId,
      tokenHash: token.tokenHash,
      tokenFamilyId: token.tokenFamilyId,
      status: token.status,
      absoluteExpiresAt: token.absoluteExpiresAt,
      revokedAt: token.revokedAt,
      refreshRequestId: token.refreshRequestId,
      idempotencyCiphertext: token.idempotencyCiphertext,
      idempotencyNonce: token.idempotencyNonce,
      idempotencyAuthTag: token.idempotencyAuthTag,
      idempotencyExpiresAt: token.idempotencyExpiresAt,
      sessionRevokedAt: session.revokedAt,
      userDisabledAt: user.disabledAt,
      maskedPhone: identity?.maskedPhone ?? "****",
    };
  }

  async rotateActiveRefreshToken(input: {
    oldRefreshTokenHash: string;
    refreshRequestId: string;
    idempotency: EncryptedRefreshIdempotencyPayload;
    newRefreshTokenHash: string;
    newRefreshExpiresAt: Date;
    now: Date;
  }) {
    return getDb().transaction(async (tx) => {
      const [oldToken] = await tx
        .update(refreshTokens)
        .set({
          status: "used",
          usedAt: input.now,
          refreshRequestId: input.refreshRequestId,
          idempotencyCiphertext: input.idempotency.ciphertext,
          idempotencyNonce: input.idempotency.nonce,
          idempotencyAuthTag: input.idempotency.authTag,
          idempotencyExpiresAt: input.idempotency.expiresAt,
          updatedAt: input.now,
        })
        .where(and(eq(refreshTokens.tokenHash, input.oldRefreshTokenHash), eq(refreshTokens.status, "active")))
        .returning({
          sessionId: refreshTokens.sessionId,
          tokenFamilyId: refreshTokens.tokenFamilyId,
        });

      if (!oldToken) return false;

      await tx.insert(refreshTokens).values({
        sessionId: oldToken.sessionId,
        tokenHash: input.newRefreshTokenHash,
        tokenFamilyId: oldToken.tokenFamilyId,
        status: "active",
        absoluteExpiresAt: input.newRefreshExpiresAt,
        createdAt: input.now,
        updatedAt: input.now,
      });

      return true;
    });
  }

  async revokeRefreshFamily(tokenFamilyId: string, now: Date) {
    await getDb()
      .update(refreshTokens)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(eq(refreshTokens.tokenFamilyId, tokenFamilyId));
  }

  async revokeSession(sessionId: string, now: Date) {
    await getDb().transaction(async (tx) => {
      await tx
        .update(deviceSessions)
        .set({ revokedAt: now, updatedAt: now })
        .where(eq(deviceSessions.id, sessionId));
      await tx
        .update(refreshTokens)
        .set({ status: "revoked", revokedAt: now, updatedAt: now })
        .where(eq(refreshTokens.sessionId, sessionId));
    });
  }

  async revokeAllSessions(userId: string, now: Date) {
    const sessions = await getDb()
      .select({ id: deviceSessions.id })
      .from(deviceSessions)
      .where(eq(deviceSessions.userId, userId));
    const sessionIds = sessions.map((session) => session.id);

    await getDb().transaction(async (tx) => {
      await tx
        .update(deviceSessions)
        .set({ revokedAt: now, updatedAt: now })
        .where(eq(deviceSessions.userId, userId));
      if (sessionIds.length > 0) {
        await tx
          .update(refreshTokens)
          .set({ status: "revoked", revokedAt: now, updatedAt: now })
          .where(inArray(refreshTokens.sessionId, sessionIds));
      }
    });
  }

  async getAccountSession(userId: string, sessionId: string) {
    const [session] = await getDb()
      .select()
      .from(deviceSessions)
      .where(and(eq(deviceSessions.id, sessionId), eq(deviceSessions.userId, userId)))
      .limit(1);
    const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
    const [identity] = await getDb()
      .select()
      .from(phoneIdentities)
      .where(eq(phoneIdentities.userId, userId))
      .limit(1);

    if (!session || !user) return null;
    return {
      userId,
      maskedPhone: identity?.maskedPhone ?? "****",
      disabledAt: user.disabledAt,
      sessionRevokedAt: session.revokedAt,
      deviceId: session.deviceId,
    };
  }

  async getPasswordCredential(userId: string) {
    const [credential] = await getDb()
      .select({ passwordHash: passwordCredentials.passwordHash })
      .from(passwordCredentials)
      .where(eq(passwordCredentials.userId, userId))
      .limit(1);
    return credential ?? null;
  }

  async changePasswordAndRevokeOtherSessions(input: {
    userId: string;
    currentSessionId: string;
    newPasswordHash: string;
    now: Date;
  }) {
    const otherSessions = await getDb()
      .select({ id: deviceSessions.id })
      .from(deviceSessions)
      .where(and(eq(deviceSessions.userId, input.userId), ne(deviceSessions.id, input.currentSessionId)));
    const otherSessionIds = otherSessions.map((session) => session.id);

    await getDb().transaction(async (tx) => {
      await tx
        .update(passwordCredentials)
        .set({
          passwordHash: input.newPasswordHash,
          passwordVersion: sql`${passwordCredentials.passwordVersion} + 1`,
          changedAt: input.now,
          updatedAt: input.now,
        })
        .where(eq(passwordCredentials.userId, input.userId));

      if (otherSessionIds.length > 0) {
        await tx
          .update(deviceSessions)
          .set({ revokedAt: input.now, updatedAt: input.now })
          .where(inArray(deviceSessions.id, otherSessionIds));
        await tx
          .update(refreshTokens)
          .set({ status: "revoked", revokedAt: input.now, updatedAt: input.now })
          .where(inArray(refreshTokens.sessionId, otherSessionIds));
      }
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

export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: {
    id: string;
    maskedPhone: string;
  };
}

export class SessionService {
  private readonly store: SessionStore;
  private readonly tokenIssuer: AccessTokenIssuer;
  private readonly loginLimiter: FixedWindowRateLimiter;
  private readonly refreshLimiter: FixedWindowRateLimiter;
  private readonly now: () => Date;
  private refreshIdempotencyKey?: Promise<Buffer>;

  constructor(options: {
    store?: SessionStore;
    tokenIssuer?: AccessTokenIssuer;
    loginLimiter?: FixedWindowRateLimiter;
    refreshLimiter?: FixedWindowRateLimiter;
    refreshIdempotencyKey?: Buffer;
    now?: () => Date;
  } = {}) {
    this.store = options.store ?? new PostgresSessionStore();
    this.tokenIssuer = options.tokenIssuer ?? new JwtAccessTokenIssuer();
    this.loginLimiter =
      options.loginLimiter ??
      new FixedWindowRateLimiter({
        maxAttempts: LOGIN_RATE_LIMIT_MAX,
        windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
      });
    this.refreshLimiter =
      options.refreshLimiter ??
      new FixedWindowRateLimiter({
        maxAttempts: REFRESH_RATE_LIMIT_MAX,
        windowMs: REFRESH_RATE_LIMIT_WINDOW_MS,
      });
    this.now = options.now ?? (() => new Date());
    if (options.refreshIdempotencyKey) {
      this.refreshIdempotencyKey = Promise.resolve(options.refreshIdempotencyKey);
    }
  }

  async login(input: {
    phone: string;
    password: string;
    deviceId: string;
    deviceLabel?: string | null;
    rateLimitKey: string;
    ip?: string;
    userAgent?: string;
  }) {
    const now = this.now();
    const phoneE164 = normalizePhoneE164(input.phone);
    const maskedPhone = maskPhoneE164(phoneE164);
    const rate = this.loginLimiter.take(`login:${input.rateLimitKey}:${phoneE164}`, now.getTime());

    if (!rate.allowed) {
      throw new AuthApiError(429, "rate_limited", "Too many login attempts", rate.retryAfterSeconds);
    }

    const user = await this.store.findUserByPhone(phoneE164);
    if (!user || user.disabledAt || !(await verifyPassword(user.passwordHash, input.password))) {
      await this.store.recordSecurityEvent({
        eventType: "login.failed",
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { maskedPhone },
      });
      throw new AuthApiError(401, "invalid_credentials", "Invalid phone or password");
    }

    const refreshToken = generateOpaqueToken();
    const refreshTokenExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    const session = await this.store.createSessionWithRefreshToken({
      userId: user.userId,
      deviceId: input.deviceId,
      deviceLabel: input.deviceLabel,
      refreshTokenHash: hashToken(refreshToken),
      tokenFamilyId: randomUUID(),
      refreshExpiresAt: refreshTokenExpiresAt,
      now,
    });
    const access = await this.tokenIssuer.sign(
      { userId: user.userId, sessionId: session.sessionId, deviceId: input.deviceId },
      now,
    );

    await this.store.recordSecurityEvent({
      userId: user.userId,
      eventType: "login.succeeded",
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: { maskedPhone: user.maskedPhone },
    });

    return this.buildTokenResponse({
      accessToken: access.accessToken,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      refreshTokenExpiresAt,
      userId: user.userId,
      maskedPhone: user.maskedPhone,
    });
  }

  async issueTokensForExistingSession(input: {
    userId: string;
    sessionId: string;
    deviceId: string;
    maskedPhone: string;
  }) {
    const now = this.now();
    const refreshToken = generateOpaqueToken();
    const refreshTokenExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    await this.store.createRefreshTokenForSession({
      sessionId: input.sessionId,
      refreshTokenHash: hashToken(refreshToken),
      tokenFamilyId: randomUUID(),
      refreshExpiresAt: refreshTokenExpiresAt,
      now,
    });
    const access = await this.tokenIssuer.sign(
      { userId: input.userId, sessionId: input.sessionId, deviceId: input.deviceId },
      now,
    );

    return this.buildTokenResponse({
      accessToken: access.accessToken,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      refreshTokenExpiresAt,
      userId: input.userId,
      maskedPhone: input.maskedPhone,
    });
  }

  async refresh(input: {
    refreshToken: string;
    refreshRequestId: string;
    deviceId: string;
    rateLimitKey: string;
  }): Promise<SessionTokens> {
    const now = this.now();
    const rate = this.refreshLimiter.take(`refresh:${input.rateLimitKey}:${input.deviceId}`, now.getTime());

    if (!rate.allowed) {
      throw new AuthApiError(429, "rate_limited", "Too many refresh attempts", rate.retryAfterSeconds);
    }

    const oldRefreshTokenHash = hashToken(input.refreshToken);
    const old = await this.store.findRefreshTokenByHash(oldRefreshTokenHash);

    if (!old || old.sessionRevokedAt || old.userDisabledAt || old.revokedAt || old.absoluteExpiresAt <= now) {
      throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "Invalid refresh token");
    }

    if (old.deviceId !== input.deviceId) {
      await this.store.revokeRefreshFamily(old.tokenFamilyId, now);
      throw new AuthApiError(403, "AUTH_REFRESH_REUSED", "Refresh token replay detected");
    }

    if (old.status === "used") {
      return this.handleUsedRefreshToken(old, input.refreshRequestId, input.deviceId, now);
    }

    if (old.status !== "active") {
      throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "Invalid refresh token");
    }

    const newRefreshToken = generateOpaqueToken();
    const newRefreshTokenExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    const access = await this.tokenIssuer.sign(
      { userId: old.userId, sessionId: old.sessionId, deviceId: old.deviceId },
      now,
    );
    const payload = this.buildTokenResponse({
      accessToken: access.accessToken,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: newRefreshToken,
      refreshTokenExpiresAt: newRefreshTokenExpiresAt,
      userId: old.userId,
      maskedPhone: old.maskedPhone,
    });
    const idempotency = encryptRefreshIdempotencyPayload(
      await this.getRefreshIdempotencyKey(),
      {
        sessionId: old.sessionId,
        oldRefreshTokenHash,
        refreshRequestId: input.refreshRequestId,
        deviceId: input.deviceId,
      },
      payload,
      now,
    );

    const rotated = await this.store.rotateActiveRefreshToken({
      oldRefreshTokenHash,
      refreshRequestId: input.refreshRequestId,
      idempotency,
      newRefreshTokenHash: hashToken(newRefreshToken),
      newRefreshExpiresAt: newRefreshTokenExpiresAt,
      now,
    });

    if (!rotated) {
      return this.refresh(input);
    }

    await this.store.recordSecurityEvent({
      userId: old.userId,
      eventType: "refresh.rotated",
      metadata: { maskedPhone: old.maskedPhone },
    });

    return payload;
  }

  async logout(claims: AccessTokenClaims) {
    await this.store.revokeSession(claims.sessionId, this.now());
    return { status: "ok" as const };
  }

  async logoutAll(claims: AccessTokenClaims) {
    await this.store.revokeAllSessions(claims.userId, this.now());
    return { status: "ok" as const };
  }

  async changePassword(claims: AccessTokenClaims, currentPassword: string, newPassword: string) {
    const credential = await this.store.getPasswordCredential(claims.userId);

    if (!credential || !(await verifyPassword(credential.passwordHash, currentPassword))) {
      throw new AuthApiError(401, "invalid_credentials", "Invalid phone or password");
    }

    await this.store.changePasswordAndRevokeOtherSessions({
      userId: claims.userId,
      currentSessionId: claims.sessionId,
      newPasswordHash: await hashPassword(newPassword),
      now: this.now(),
    });

    await this.store.recordSecurityEvent({
      userId: claims.userId,
      eventType: "password.changed",
      metadata: {},
    });

    return { status: "ok" as const };
  }

  async me(claims: AccessTokenClaims) {
    const account = await this.store.getAccountSession(claims.userId, claims.sessionId);

    if (!account || account.disabledAt || account.sessionRevokedAt || account.deviceId !== claims.deviceId) {
      throw new AuthApiError(401, "AUTH_SESSION_REVOKED", "Session revoked");
    }

    return {
      user: {
        id: account.userId,
        maskedPhone: account.maskedPhone,
      },
      deviceId: account.deviceId,
    };
  }

  async authenticate(authorizationHeader: string | undefined) {
    const token = parseBearerToken(authorizationHeader);
    let claims: AccessTokenClaims;
    try {
      claims = await this.tokenIssuer.verify(token);
    } catch (error) {
      if (error instanceof AuthApiError) throw error;
      throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "Invalid access token");
    }
    await this.me(claims);
    return claims;
  }

  private async handleUsedRefreshToken(
    old: RefreshTokenRecord,
    refreshRequestId: string,
    deviceId: string,
    now: Date,
  ) {
    const encrypted =
      old.idempotencyCiphertext &&
      old.idempotencyNonce &&
      old.idempotencyAuthTag &&
      old.idempotencyExpiresAt
        ? {
            ciphertext: old.idempotencyCiphertext,
            nonce: old.idempotencyNonce,
            authTag: old.idempotencyAuthTag,
            expiresAt: old.idempotencyExpiresAt,
          }
        : null;

    if (old.refreshRequestId === refreshRequestId && encrypted) {
      try {
        return decryptRefreshIdempotencyPayload<SessionTokens>(
          await this.getRefreshIdempotencyKey(),
          {
            sessionId: old.sessionId,
            oldRefreshTokenHash: old.tokenHash,
            refreshRequestId,
            deviceId,
          },
          encrypted,
          now,
        );
      } catch {
        // Fall through to replay handling below.
      }
    }

    await this.store.revokeRefreshFamily(old.tokenFamilyId, now);
    await this.store.recordSecurityEvent({
      userId: old.userId,
      eventType: "refresh.replay_detected",
      metadata: { maskedPhone: old.maskedPhone },
    });
    throw new AuthApiError(403, "AUTH_REFRESH_REUSED", "Refresh token replay detected");
  }

  private buildTokenResponse(input: {
    accessToken: string;
    accessTokenExpiresAt: Date;
    refreshToken: string;
    refreshTokenExpiresAt: Date;
    userId: string;
    maskedPhone: string;
  }): SessionTokens {
    return {
      accessToken: input.accessToken,
      accessTokenExpiresAt: input.accessTokenExpiresAt.toISOString(),
      refreshToken: input.refreshToken,
      refreshTokenExpiresAt: input.refreshTokenExpiresAt.toISOString(),
      user: {
        id: input.userId,
        maskedPhone: input.maskedPhone,
      },
    };
  }

  private getRefreshIdempotencyKey() {
    this.refreshIdempotencyKey ??= loadRefreshIdempotencyKey();
    return this.refreshIdempotencyKey;
  }
}

export function parseBearerToken(authorizationHeader: string | undefined) {
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "Missing bearer token");
  }
  return match[1];
}
