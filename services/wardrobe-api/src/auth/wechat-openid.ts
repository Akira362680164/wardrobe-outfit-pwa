import {
  WechatBindExistingAccountRequestSchema,
  WechatOpenIdLoginRequestSchema,
  WechatOpenIdLoginResponseSchema,
  WechatRegisterWithEmailRequestSchema,
} from "@wardrobe/cloud-contracts";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import { getDb } from "../db/client.js";
import {
  accountSecurityEvents,
  emailIdentities,
  locations,
  passwordCredentials,
  phoneIdentities,
  users,
  wechatBindingTickets,
  wechatIdentities,
} from "../db/schema.js";
import { hmacSha256Base64Url } from "../security/hmac.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import { generateOpaqueToken, hashToken } from "../security/token-hash.js";
import { AccountPasswordStore, normalizeAccountForLogin, PostgresAccountPasswordStore } from "./account-password.js";
import { EmailVerificationService, maskEmail, normalizeEmail } from "./email-verification.js";
import { AuthApiError, maskPhoneE164, normalizePhoneE164, type SecurityEventInput } from "./registrations.js";
import { FixedWindowRateLimiter } from "./rate-limit.js";
import { type SessionService } from "./session.js";
import { WechatAuthError, type WechatSessionResult } from "./wechat-phone.js";

export const WECHAT_BINDING_TICKET_TTL_MS = 10 * 60 * 1000;
const WECHAT_OPENID_RATE_LIMIT_MAX = 10;
const WECHAT_OPENID_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export interface WechatOpenIdClient {
  codeToSession(input: { appId: string; loginCode: string }): Promise<WechatSessionResult>;
}

export interface WechatBindingTicketRecord {
  id: string;
  appId: string;
  openidHash: string;
  unionidHash: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface WechatOpenIdStore {
  findWechatUser(appId: string, openidHash: string): Promise<{ userId: string; emailMasked?: string; phoneMasked?: string; disabledAt: Date | null } | null>;
  createBindingTicket(input: { appId: string; openidHash: string; unionidHash?: string | null; ticketHash: string; expiresAt: Date; now: Date }): Promise<void>;
  findBindingTicket(ticketHash: string): Promise<WechatBindingTicketRecord | null>;
  consumeBindingTicket(ticketId: string, now: Date): Promise<void>;
  bindExistingUser(input: { userId: string; appId: string; openidHash: string; unionidHash?: string | null; now: Date }): Promise<void>;
  createUserWithEmailAndWechat(input: {
    appId: string;
    openidHash: string;
    unionidHash?: string | null;
    emailNormalized: string;
    emailMasked: string;
    passwordHash: string;
    phoneE164?: string | null;
    phoneMasked?: string | null;
    deviceId: string;
    now: Date;
  }): Promise<{ userId: string }>;
  recordSecurityEvent(input: SecurityEventInput): Promise<void>;
}

export class PostgresWechatOpenIdStore implements WechatOpenIdStore {
  async findWechatUser(appId: string, openidHash: string) {
    const [identity] = await getDb()
      .select()
      .from(wechatIdentities)
      .where(and(eq(wechatIdentities.appId, appId), eq(wechatIdentities.openidHash, openidHash)))
      .limit(1);
    if (!identity) return null;
    const [user] = await getDb().select().from(users).where(eq(users.id, identity.userId)).limit(1);
    if (!user) return null;
    const [email] = await getDb().select().from(emailIdentities).where(eq(emailIdentities.userId, user.id)).limit(1);
    const [phone] = await getDb().select().from(phoneIdentities).where(eq(phoneIdentities.userId, user.id)).limit(1);
    return {
      userId: user.id,
      emailMasked: email?.emailMasked,
      phoneMasked: phone?.maskedPhone,
      disabledAt: user.disabledAt,
    };
  }

  async createBindingTicket(input: { appId: string; openidHash: string; unionidHash?: string | null; ticketHash: string; expiresAt: Date; now: Date }) {
    await getDb().insert(wechatBindingTickets).values({
      appId: input.appId,
      openidHash: input.openidHash,
      unionidHash: input.unionidHash ?? null,
      ticketHash: input.ticketHash,
      expiresAt: input.expiresAt,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  async findBindingTicket(ticketHash: string) {
    const [ticket] = await getDb()
      .select()
      .from(wechatBindingTickets)
      .where(eq(wechatBindingTickets.ticketHash, ticketHash))
      .limit(1);
    return ticket ?? null;
  }

  async consumeBindingTicket(ticketId: string, now: Date) {
    await getDb().update(wechatBindingTickets)
      .set({ consumedAt: now, updatedAt: now })
      .where(eq(wechatBindingTickets.id, ticketId));
  }

  async bindExistingUser(input: { userId: string; appId: string; openidHash: string; unionidHash?: string | null; now: Date }) {
    const existing = await this.findWechatUser(input.appId, input.openidHash);
    if (existing && existing.userId !== input.userId) {
      throw new AuthApiError(409, "wechat_already_bound", "Wechat is already bound");
    }
    const [sameApp] = await getDb()
      .select({ id: wechatIdentities.id })
      .from(wechatIdentities)
      .where(and(eq(wechatIdentities.userId, input.userId), eq(wechatIdentities.appId, input.appId)))
      .limit(1);
    if (sameApp) throw new AuthApiError(409, "account_already_bound_wechat", "Account already has a WeChat binding");
    await getDb().insert(wechatIdentities).values({
      userId: input.userId,
      appId: input.appId,
      openidHash: input.openidHash,
      unionidHash: input.unionidHash ?? null,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  async createUserWithEmailAndWechat(input: {
    appId: string;
    openidHash: string;
    unionidHash?: string | null;
    emailNormalized: string;
    emailMasked: string;
    passwordHash: string;
    phoneE164?: string | null;
    phoneMasked?: string | null;
    deviceId: string;
    now: Date;
  }) {
    return getDb().transaction(async (tx) => {
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
      await tx.insert(wechatIdentities).values({
        userId: createdUser.id,
        appId: input.appId,
        openidHash: input.openidHash,
        unionidHash: input.unionidHash ?? null,
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

export class WechatOpenIdAuthService {
  private readonly client: WechatOpenIdClient;
  private readonly store: WechatOpenIdStore;
  private readonly accountStore: AccountPasswordStore;
  private readonly sessionService: SessionService;
  private readonly emailVerificationService: EmailVerificationService;
  private readonly limiter: FixedWindowRateLimiter;
  private readonly now: () => Date;

  constructor(options: {
    client?: WechatOpenIdClient;
    store?: WechatOpenIdStore;
    accountStore?: AccountPasswordStore;
    sessionService: SessionService;
    emailVerificationService?: EmailVerificationService;
    limiter?: FixedWindowRateLimiter;
    now?: () => Date;
  }) {
    this.client = options.client ?? new WechatCodeSessionClient();
    this.store = options.store ?? new PostgresWechatOpenIdStore();
    this.accountStore = options.accountStore ?? new PostgresAccountPasswordStore();
    this.sessionService = options.sessionService;
    this.emailVerificationService = options.emailVerificationService ?? new EmailVerificationService();
    this.limiter = options.limiter ?? new FixedWindowRateLimiter({ maxAttempts: WECHAT_OPENID_RATE_LIMIT_MAX, windowMs: WECHAT_OPENID_RATE_LIMIT_WINDOW_MS });
    this.now = options.now ?? (() => new Date());
  }

  async login(input: { loginCode: string; appId: string; deviceId: string; deviceLabel?: string | null; rateLimitKey: string; ip?: string; userAgent?: string }) {
    const now = this.now();
    const rate = this.limiter.take(`wechat-openid:${input.rateLimitKey}`, now.getTime());
    if (!rate.allowed) throw new AuthApiError(429, "rate_limited", "Too many WeChat login attempts", rate.retryAfterSeconds);
    const session = await this.client.codeToSession({ appId: input.appId, loginCode: input.loginCode });
    const openidHash = hashWechatOpenId(input.appId, session.openid);
    const unionidHash = session.unionid ? hashWechatUnionId(input.appId, session.unionid) : null;
    const user = await this.store.findWechatUser(input.appId, openidHash);
    if (user) {
      if (user.disabledAt) throw new AuthApiError(403, "invalid_credentials", "Account disabled");
      const tokens = await this.sessionService.issueTokensForUser({
        userId: user.userId,
        maskedPhone: user.phoneMasked ?? user.emailMasked ?? "Wardora 用户",
        phoneMasked: user.phoneMasked,
        emailMasked: user.emailMasked,
        emailVerified: Boolean(user.emailMasked),
        deviceId: input.deviceId,
        deviceLabel: input.deviceLabel,
        eventType: "wechat_openid_login.succeeded",
        ip: input.ip,
        userAgent: input.userAgent,
        eventMetadata: { appId: input.appId, openidHash },
      });
      return WechatOpenIdLoginResponseSchema.parse({ ...tokens, status: "logged_in" });
    }

    const bindingTicket = generateOpaqueToken();
    await this.store.createBindingTicket({
      appId: input.appId,
      openidHash,
      unionidHash,
      ticketHash: hashToken(bindingTicket),
      expiresAt: new Date(now.getTime() + WECHAT_BINDING_TICKET_TTL_MS),
      now,
    });
    await this.store.recordSecurityEvent({
      eventType: "wechat_openid_login.requires_binding",
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: { appId: input.appId, openidHash },
    });
    return {
      status: "requires_account_binding" as const,
      bindingTicket,
      expiresInSeconds: WECHAT_BINDING_TICKET_TTL_MS / 1000,
      actions: ["bind_existing_account", "register_new_account"] as const,
    };
  }

  async bindExisting(input: { bindingTicket: string; account: string; password: string; deviceId: string; deviceLabel?: string | null; ip?: string; userAgent?: string }) {
    const now = this.now();
    const ticket = await this.requireTicket(input.bindingTicket, now);
    const account = normalizeAccountForLogin(input.account);
    const user = account.kind === "email"
      ? await this.accountStore.findByEmail(account.value)
      : await this.accountStore.findByPhone(account.value);
    if (!user || user.disabledAt || !(await verifyPassword(user.passwordHash, input.password))) {
      throw new AuthApiError(401, "invalid_credentials", "Invalid account or password");
    }
    if (account.kind === "email" && !user.emailVerified) {
      throw new AuthApiError(403, "email_unverified", "Email is not verified");
    }
    await this.store.bindExistingUser({
      userId: user.userId,
      appId: ticket.appId,
      openidHash: ticket.openidHash,
      unionidHash: ticket.unionidHash,
      now,
    });
    await this.store.consumeBindingTicket(ticket.id, now);
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
      eventType: "wechat_openid_bind_existing.succeeded",
      ip: input.ip,
      userAgent: input.userAgent,
      eventMetadata: { appId: ticket.appId, openidHash: ticket.openidHash },
    });
  }

  async registerWithEmail(input: { bindingTicket: string; email: string; emailCode: string; password: string; phone?: string; deviceId: string; deviceLabel?: string | null; ip?: string; userAgent?: string }) {
    const now = this.now();
    const ticket = await this.requireTicket(input.bindingTicket, now);
    const emailNormalized = normalizeEmail(input.email);
    const emailMasked = maskEmail(emailNormalized);
    const phoneE164 = input.phone?.trim() ? normalizePhoneE164(input.phone) : null;
    const phoneMasked = phoneE164 ? maskPhoneE164(phoneE164) : null;
    if (await this.accountStore.hasEmail(emailNormalized)) throw new AuthApiError(409, "email_already_registered", "Email is already registered");
    if (phoneE164 && await this.accountStore.hasPhone(phoneE164)) throw new AuthApiError(409, "phone_already_registered", "Phone is already registered");
    await this.emailVerificationService.verifyCode({ email: emailNormalized, purpose: "wechat_register", code: input.emailCode, now });
    const created = await this.store.createUserWithEmailAndWechat({
      appId: ticket.appId,
      openidHash: ticket.openidHash,
      unionidHash: ticket.unionidHash,
      emailNormalized,
      emailMasked,
      passwordHash: await hashPassword(input.password),
      phoneE164,
      phoneMasked,
      deviceId: input.deviceId,
      now,
    });
    await this.store.consumeBindingTicket(ticket.id, now);
    return this.sessionService.issueTokensForUser({
      userId: created.userId,
      maskedPhone: phoneMasked ?? emailMasked,
      phoneMasked: phoneMasked ?? undefined,
      phoneVerified: phoneMasked ? false : undefined,
      emailMasked,
      emailVerified: true,
      deviceId: input.deviceId,
      deviceLabel: input.deviceLabel,
      eventType: "wechat_openid_register.succeeded",
      ip: input.ip,
      userAgent: input.userAgent,
      eventMetadata: { appId: ticket.appId, openidHash: ticket.openidHash, emailMasked, phoneMasked },
    });
  }

  private async requireTicket(bindingTicket: string, now: Date) {
    const ticket = await this.store.findBindingTicket(hashToken(bindingTicket));
    if (!ticket || ticket.consumedAt || ticket.expiresAt <= now) {
      throw new AuthApiError(409, "binding_ticket_expired", "Binding ticket expired");
    }
    return ticket;
  }
}

export function registerWechatOpenIdAuthRoutes(app: FastifyInstance, service: WechatOpenIdAuthService) {
  app.post("/api/auth/wechat/login", async (request, reply) => {
    try {
      const body = WechatOpenIdLoginRequestSchema.parse(request.body);
      return await service.login({ ...body, rateLimitKey: request.ip, ip: request.ip, userAgent: request.headers["user-agent"] });
    } catch (error) {
      return sendWechatOpenIdError(reply, error);
    }
  });

  app.post("/api/auth/wechat/bind-existing-account", async (request, reply) => {
    try {
      const body = WechatBindExistingAccountRequestSchema.parse(request.body);
      return await service.bindExisting({ ...body, ip: request.ip, userAgent: request.headers["user-agent"] });
    } catch (error) {
      return sendWechatOpenIdError(reply, error);
    }
  });

  app.post("/api/auth/wechat/register-with-email", async (request, reply) => {
    try {
      const body = WechatRegisterWithEmailRequestSchema.parse(request.body);
      return await service.registerWithEmail({ ...body, ip: request.ip, userAgent: request.headers["user-agent"] });
    } catch (error) {
      return sendWechatOpenIdError(reply, error);
    }
  });
}

function sendWechatOpenIdError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthApiError) {
    return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  }
  if (error instanceof WechatAuthError) {
    return reply.code(error.statusCode).send({ code: error.code, message: error.message, retryable: error.retryable });
  }
  if (error instanceof z.ZodError) {
    return reply.code(400).send({ code: "invalid_request", message: "Invalid request" });
  }
  throw error;
}

export function hashWechatOpenId(appId: string, openid: string) {
  return hmacSha256Base64Url(`wechat-openid:${appId}:${openid}`);
}

export function hashWechatUnionId(appId: string, unionid: string) {
  return hmacSha256Base64Url(`wechat-unionid:${appId}:${unionid}`);
}

export class WechatCodeSessionClient implements WechatOpenIdClient {
  async codeToSession(input: { appId: string; loginCode: string }) {
    const secret = requireWechatSecret(input.appId);
    const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid", input.appId);
    url.searchParams.set("secret", secret);
    url.searchParams.set("js_code", input.loginCode);
    url.searchParams.set("grant_type", "authorization_code");
    const response = await fetch(url);
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok || (typeof payload.errcode === "number" && payload.errcode !== 0) || typeof payload.openid !== "string") {
      throw new WechatAuthError(401, "wechat_code_invalid", "微信登录授权已过期，请重新登录", true);
    }
    return {
      openid: payload.openid,
      unionid: typeof payload.unionid === "string" ? payload.unionid : undefined,
    };
  }
}

function requireWechatSecret(appId: string) {
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
