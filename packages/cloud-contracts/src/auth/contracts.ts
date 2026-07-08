import { z } from "zod";

export const WechatPhoneLoginRequestSchema = z.object({
  loginCode: z.string().min(1),
  phoneCode: z.string().min(1),
  appId: z.string().min(1),
  client: z.literal("wechat-miniprogram"),
  deviceId: z.string().min(1).max(200),
  deviceLabel: z.string().max(200).optional(),
  agreementVersion: z.string().min(1),
  privacyVersion: z.string().min(1),
});

export const WechatPhoneLoginResponseSchema = z.object({
  token: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.string().datetime(),
  refreshTokenExpiresAt: z.string().datetime(),
  isNewUser: z.boolean(),
  nextAction: z.enum(["home", "complete_profile"]),
  user: z.object({
    id: z.string().uuid(),
    phoneMasked: z.string().min(1),
    displayName: z.string().min(1).optional(),
    avatarUrl: z.string().url().optional(),
  }),
});

export const WechatPhoneLoginErrorCodeSchema = z.enum([
  "invalid_request",
  "rate_limited",
  "wechat_code_invalid",
  "wechat_phone_unavailable",
  "wechat_service_unavailable",
  "account_binding_conflict",
  "session_unavailable",
]);

export const WechatPhoneLoginErrorResponseSchema = z.object({
  code: WechatPhoneLoginErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  retryAfterSeconds: z.number().int().positive().optional(),
});

export type WechatPhoneLoginRequest = z.infer<typeof WechatPhoneLoginRequestSchema>;
export type WechatPhoneLoginResponse = z.infer<typeof WechatPhoneLoginResponseSchema>;
export type WechatPhoneLoginErrorCode = z.infer<typeof WechatPhoneLoginErrorCodeSchema>;
export type WechatPhoneLoginErrorResponse = z.infer<typeof WechatPhoneLoginErrorResponseSchema>;
