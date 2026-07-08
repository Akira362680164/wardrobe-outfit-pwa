import {
  WechatPhoneLoginRequestSchema,
  WechatPhoneLoginResponseSchema,
  type WechatPhoneLoginRequest,
} from "@wardrobe/cloud-contracts";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import { getDb } from "../db/client.js";
import { accountSecurityEvents, locations, phoneIdentities, users, wechatAccounts } from "../db/schema.js";
import { hashToken } from "../security/token-hash.js";
import { AuthApiError, maskPhoneE164, normalizePhoneE164, type SecurityEventInput } from "./registrations.js";
import { FixedWindowRateLimiter } from "./rate-limit.js";
import { type SessionService } from "./session.js";

const WECHAT_LOGIN_RATE_LIMIT_MAX = 10;
const WECHAT_LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export interface WechatSessionResult {
  openid: string;
  unionid?: string;
}

export interface WechatPhoneResult {
  phoneNumber: string;
  purePhoneNumber?: string;
}

export interface WechatClient {
  codeToSession(input: { appId: string; loginCode: string }): Promise<WechatSessionResult>;
  getPhoneNumber(input: { appId: string; phoneCode: string }): Promise<WechatPhoneResult>;
}

export interface WechatUserRecord {
  userId: string;
  maskedPhone: string;
  disabledAt: Date | null;
}

export interface WechatAuthStore {
  findUserByPhone(phoneE164: string): Promise<WechatUserRecord | null>;
  findWechatUser(appId: string, openid: string): Promise<{ userId: string } | null>;
  bindWechatAccount(input: {
    userId: string;
    appId: string;
    openid: string;
    unionid?: string;
    phoneHash: string;
    phoneMasked: string;
    now: Date;
  }): Promise<void>;
  createUserWithWechatAccount(input: {
    phoneE164: string;
    phoneMasked: string;
    appId: string;
    openid: string;
    unionid?: string;
    phoneHash: string;
    deviceId: string;
    now: Date;
  }): Promise<{ userId: string }>;
  recordSecurityEvent(input: SecurityEventInput): Promise<void>;
}

export class PostgresWechatAuthStore implements WechatAuthStore {
  async findUserByPhone(phoneE164: string) {
    const [identity] = await getDb()
      .select()
      .from(phoneIdentities)
      .where(eq(phoneIdentities.phoneE164, phoneE164))
      .limit(1);
    if (!identity) return null;

    const [user] = await getDb().select().from(users).where(eq(users.id, identity.userId)).limit(1);
    if (!user) return null;

    return {
      userId: user.id,
      maskedPhone: identity.maskedPhone,
      disabledAt: user.disabledAt,
    };
  }

  async findWechatUser(appId: string, openid: string) {
    const [account] = await getDb()
      .select({ userId: wechatAccounts.userId })
      .from(wechatAccounts)
      .where(and(eq(wechatAccounts.appId, appId), eq(wechatAccounts.openid, openid)))
      .limit(1);
    return account ?? null;
  }

  async bindWechatAccount(input: {
    userId: string;
    appId: string;
    openid: string;
    unionid?: string;
    phoneHash: string;
    phoneMasked: string;
    now: Date;
  }) {
    const existing = await this.findWechatUser(input.appId, input.openid);
    if (existing && existing.userId !== input.userId) {
      throw new WechatAuthError(409, "account_binding_conflict", "微信账号已绑定其他用户", false);
    }
    if (existing) {
      await getDb()
        .update(wechatAccounts)
        .set({
          unionid: input.unionid ?? null,
          phoneHash: input.phoneHash,
          phoneMasked: input.phoneMasked,
          updatedAt: input.now,
        })
        .where(and(eq(wechatAccounts.appId, input.appId), eq(wechatAccounts.openid, input.openid)));
      return;
    }

    await getDb().insert(wechatAccounts).values({
      userId: input.userId,
      appId: input.appId,
      openid: input.openid,
      unionid: input.unionid ?? null,
      phoneHash: input.phoneHash,
      phoneMasked: input.phoneMasked,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  async createUserWithWechatAccount(input: {
    phoneE164: string;
    phoneMasked: string;
    appId: string;
    openid: string;
    unionid?: string;
    phoneHash: string;
    deviceId: string;
    now: Date;
  }) {
    return getDb().transaction(async (tx) => {
      const [createdUser] = await tx.insert(users).values({}).returning({ id: users.id });
      await tx.insert(phoneIdentities).values({
        userId: createdUser.id,
        phoneE164: input.phoneE164,
        maskedPhone: input.phoneMasked,
        verifiedAt: input.now,
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
      await tx.insert(wechatAccounts).values({
        userId: createdUser.id,
        appId: input.appId,
        openid: input.openid,
        unionid: input.unionid ?? null,
        phoneHash: input.phoneHash,
        phoneMasked: input.phoneMasked,
        createdAt: input.now,
        updatedAt: input.now,
      });
      return { userId: createdUser.id };
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

export class WechatAuthError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export class WechatPhoneAuthService {
  private readonly client: WechatClient;
  private readonly store: WechatAuthStore;
  private readonly sessionService: SessionService;
  private readonly limiter: FixedWindowRateLimiter;
  private readonly now: () => Date;

  constructor(options: {
    client?: WechatClient;
    store?: WechatAuthStore;
    sessionService: SessionService;
    limiter?: FixedWindowRateLimiter;
    now?: () => Date;
  }) {
    this.client = options.client ?? new WechatApiClient();
    this.store = options.store ?? new PostgresWechatAuthStore();
    this.sessionService = options.sessionService;
    this.limiter =
      options.limiter ??
      new FixedWindowRateLimiter({
        maxAttempts: WECHAT_LOGIN_RATE_LIMIT_MAX,
        windowMs: WECHAT_LOGIN_RATE_LIMIT_WINDOW_MS,
      });
    this.now = options.now ?? (() => new Date());
  }

  async login(input: WechatPhoneLoginRequest & { rateLimitKey: string; ip?: string; userAgent?: string }) {
    const now = this.now();
    const rate = this.limiter.take(`wechat-phone:${input.rateLimitKey}`, now.getTime());
    if (!rate.allowed) {
      throw new WechatAuthError(429, "rate_limited", "登录尝试过多，请稍后再试", true, rate.retryAfterSeconds);
    }

    const session = await this.client.codeToSession({ appId: input.appId, loginCode: input.loginCode });
    const phone = await this.client.getPhoneNumber({ appId: input.appId, phoneCode: input.phoneCode });
    const phoneE164 = normalizePhoneE164(phone.purePhoneNumber ?? phone.phoneNumber);
    const phoneMasked = maskPhoneE164(phoneE164);
    const phoneHash = hashPhone(phoneE164);
    const existingWechatUser = await this.store.findWechatUser(input.appId, session.openid);
    const existingPhoneUser = await this.store.findUserByPhone(phoneE164);

    if (existingWechatUser && (!existingPhoneUser || existingWechatUser.userId !== existingPhoneUser.userId)) {
      await this.store.recordSecurityEvent({
        eventType: "wechat_phone_login.binding_conflict",
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { appId: input.appId, openidHash: hashToken(session.openid), phoneMasked },
      });
      throw new WechatAuthError(409, "account_binding_conflict", "微信账号与手机号绑定关系不一致", false);
    }

    const isNewUser = !existingPhoneUser;
    const user = existingPhoneUser ?? await this.store.createUserWithWechatAccount({
      phoneE164,
      phoneMasked,
      appId: input.appId,
      openid: session.openid,
      unionid: session.unionid,
      phoneHash,
      deviceId: input.deviceId,
      now,
    });
    const userId = user.userId;
    const maskedPhone = existingPhoneUser?.maskedPhone ?? phoneMasked;
    const disabledAt = existingPhoneUser?.disabledAt ?? null;
    if (disabledAt) {
      throw new WechatAuthError(403, "account_binding_conflict", "账号不可用", false);
    }

    if (!isNewUser) {
      await this.store.bindWechatAccount({
        userId,
        appId: input.appId,
        openid: session.openid,
        unionid: session.unionid,
        phoneHash,
        phoneMasked: maskedPhone,
        now,
      });
    }

    const tokens = await this.sessionService.issueTokensForUser({
      userId,
      maskedPhone,
      deviceId: input.deviceId,
      deviceLabel: input.deviceLabel,
      eventType: "wechat_phone_login.succeeded",
      ip: input.ip,
      userAgent: input.userAgent,
      eventMetadata: {
        appId: input.appId,
        openidHash: hashToken(session.openid),
        phoneMasked: maskedPhone,
        isNewUser,
        agreementVersion: input.agreementVersion,
        privacyVersion: input.privacyVersion,
      },
    });

    return WechatPhoneLoginResponseSchema.parse({
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      isNewUser,
      nextAction: "home",
      user: {
        id: tokens.user.id,
        phoneMasked: tokens.user.maskedPhone,
      },
    });
  }
}

export function registerWechatPhoneAuthRoutes(
  app: FastifyInstance,
  service: WechatPhoneAuthService,
) {
  app.post("/api/auth/wechat/phone-login", async (request, reply) => {
    try {
      const body = WechatPhoneLoginRequestSchema.parse(request.body);
      return await service.login({
        ...body,
        rateLimitKey: request.ip,
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      });
    } catch (error) {
      return sendWechatAuthError(reply, error);
    }
  });
}

function sendWechatAuthError(reply: FastifyReply, error: unknown) {
  if (error instanceof WechatAuthError) {
    const body: Record<string, unknown> = {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
    if (error.retryAfterSeconds !== undefined) body.retryAfterSeconds = error.retryAfterSeconds;
    return reply.code(error.statusCode).send(body);
  }

  if (error instanceof AuthApiError) {
    return reply.code(error.statusCode).send({
      code: error.code === "invalid_phone" ? "wechat_phone_unavailable" : error.code,
      message: error.message,
      retryable: false,
    });
  }

  if (error instanceof z.ZodError) {
    return reply.code(400).send({ code: "invalid_request", message: "Invalid request", retryable: false });
  }

  throw error;
}

export function hashPhone(phoneE164: string) {
  const salt = process.env.PHONE_HASH_SALT ?? (process.env.NODE_ENV === "test" ? "wardrobe-test-phone-hash-salt" : "");
  if (!salt) {
    throw new WechatAuthError(503, "wechat_service_unavailable", "微信服务暂不可用，请稍后再试", true);
  }
  return createHash("sha256").update(`${salt}:${phoneE164}`).digest("hex");
}

class WechatApiClient implements WechatClient {
  async codeToSession(input: { appId: string; loginCode: string }) {
    const secret = requireSecret(input.appId);
    const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid", input.appId);
    url.searchParams.set("secret", secret);
    url.searchParams.set("js_code", input.loginCode);
    url.searchParams.set("grant_type", "authorization_code");
    const payload = await fetchWechatJson(url);
    if ((typeof payload.errcode === "number" && payload.errcode !== 0) || typeof payload.openid !== "string") {
      throw new WechatAuthError(401, "wechat_code_invalid", "微信登录授权已过期，请重新登录", true);
    }
    return {
      openid: payload.openid,
      unionid: typeof payload.unionid === "string" ? payload.unionid : undefined,
    };
  }

  async getPhoneNumber(input: { appId: string; phoneCode: string }) {
    const accessToken = await this.getAccessToken(input.appId);
    const url = new URL("https://api.weixin.qq.com/wxa/business/getuserphonenumber");
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: input.phoneCode }),
    });
    const payload = await response.json() as Record<string, unknown>;
    const phoneInfo = payload.phone_info;
    if (!response.ok || (typeof payload.errcode === "number" && payload.errcode !== 0) || !phoneInfo || typeof phoneInfo !== "object") {
      throw new WechatAuthError(401, "wechat_phone_unavailable", "无法获取微信认证手机号，请重新授权", true);
    }
    const phoneNumber = (phoneInfo as Record<string, unknown>).phoneNumber;
    const purePhoneNumber = (phoneInfo as Record<string, unknown>).purePhoneNumber;
    if (typeof phoneNumber !== "string") {
      throw new WechatAuthError(401, "wechat_phone_unavailable", "无法获取微信认证手机号，请重新授权", true);
    }
    return {
      phoneNumber,
      purePhoneNumber: typeof purePhoneNumber === "string" ? purePhoneNumber : undefined,
    };
  }

  private async getAccessToken(appId: string) {
    const secret = requireSecret(appId);
    const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
    url.searchParams.set("grant_type", "client_credential");
    url.searchParams.set("appid", appId);
    url.searchParams.set("secret", secret);
    const payload = await fetchWechatJson(url);
    if ((typeof payload.errcode === "number" && payload.errcode !== 0) || typeof payload.access_token !== "string") {
      throw new WechatAuthError(503, "wechat_service_unavailable", "微信服务暂不可用，请稍后再试", true);
    }
    return payload.access_token;
  }
}

async function fetchWechatJson(url: URL) {
  const response = await fetch(url);
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new WechatAuthError(503, "wechat_service_unavailable", "微信服务暂不可用，请稍后再试", true);
  }
  return payload;
}

function requireSecret(appId: string) {
  const configuredAppId = process.env.WECHAT_MINIPROGRAM_APP_ID;
  const secret = process.env.WECHAT_MINIPROGRAM_APP_SECRET;
  if (configuredAppId && configuredAppId !== appId) {
    throw new WechatAuthError(400, "invalid_request", "Invalid appId", false);
  }
  if (!secret) {
    throw new WechatAuthError(503, "wechat_service_unavailable", "微信服务暂不可用，请稍后再试", true);
  }
  return secret;
}
