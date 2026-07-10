import { z } from "zod";

export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  emailMasked: z.string().min(1).optional(),
  emailVerified: z.boolean().optional(),
  phoneMasked: z.string().min(1).optional(),
  phoneVerified: z.boolean().optional(),
  displayName: z.string().min(1).optional(),
  avatarUrl: z.string().url().optional(),
});

export const AuthTokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresAt: z.string().datetime(),
  refreshToken: z.string().min(1),
  refreshTokenExpiresAt: z.string().datetime(),
  user: AuthUserSchema,
});

export const EmailCodePurposeSchema = z.enum([
  "register",
  "wechat_register",
  "reset_password",
  "change_password",
  "change_email",
  "delete_account",
]);

export const SendEmailCodeRequestSchema = z.object({
  email: z.string().email(),
  purpose: EmailCodePurposeSchema,
  bindingTicket: z.string().min(16).optional(),
});

export const SendEmailCodeResponseSchema = z.object({
  status: z.literal("sent"),
  emailMasked: z.string().min(1),
  cooldownSeconds: z.number().int().positive(),
  expiresInSeconds: z.number().int().positive(),
});

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  emailCode: z.string().regex(/^\d{6}$/),
  password: z.string().min(8).max(256),
  phone: z.string().min(1).optional(),
  deviceId: z.string().min(1).max(200),
  deviceLabel: z.string().max(200).optional(),
  agreementVersion: z.string().min(1).optional(),
  privacyVersion: z.string().min(1).optional(),
});

export const PasswordLoginRequestSchema = z.object({
  account: z.string().min(1),
  password: z.string().min(8).max(256),
  deviceId: z.string().min(1).max(200),
  deviceLabel: z.string().max(200).optional(),
  client: z.enum(["android-app", "pwa", "wechat-miniprogram"]).optional(),
});

export const PasswordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const PasswordResetConfirmRequestSchema = z.object({
  email: z.string().email(),
  emailCode: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(256),
});

export const PasswordChangeRequestSchema = z.object({
  currentPassword: z.string().min(8).max(256),
  newPassword: z.string().min(8).max(256),
});

export const PasswordChangeWithEmailCodeRequestSchema = z.object({
  emailCode: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(256),
});

export const PasswordChangeCodeRequestResponseSchema = SendEmailCodeResponseSchema;

export const AccountSecurityResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    displayName: z.string().min(1),
  }),
  email: z.object({
    bound: z.boolean(),
    masked: z.string().min(1).optional(),
    verified: z.boolean(),
  }),
  phone: z.object({
    bound: z.boolean(),
    masked: z.string().min(1).optional(),
    verified: z.boolean(),
    usage: z.literal("login_name"),
  }),
  wechat: z.object({
    bound: z.boolean(),
    appId: z.string().min(1).optional(),
  }),
  password: z.object({
    set: z.boolean(),
    changedAt: z.string().datetime().optional(),
  }),
});

export const AccountDeletionMethodSchema = z.enum(["email", "password", "wechat"]);

export const AccountDeletionEmailCodeRequestResponseSchema = SendEmailCodeResponseSchema;

export const AccountDeletionVerifyRequestSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("email"),
    emailCode: z.string().regex(/^\d{6}$/),
  }),
  z.object({
    method: z.literal("password"),
    currentPassword: z.string().min(8).max(256),
  }),
  z.object({
    method: z.literal("wechat"),
    loginCode: z.string().min(1),
    appId: z.string().min(1),
  }),
]);

export const AccountDeletionVerifyResponseSchema = z.object({
  authorizationToken: z.string().min(32),
  expiresAt: z.string().datetime(),
});

export const AccountDeletionConfirmRequestSchema = z.object({
  authorizationToken: z.string().min(32),
  confirmationText: z.literal("DELETE_ACCOUNT"),
});

export const AccountDeletionConfirmResponseSchema = z.object({
  receiptToken: z.string().min(32),
  status: z.enum(["processing", "completed"]),
});

export const AccountDeletionStatusResponseSchema = z.object({
  status: z.enum(["processing", "completed", "failed"]),
  completedAt: z.string().datetime().optional(),
  referenceCode: z.string().min(1).optional(),
});

export const WechatOpenIdLoginRequestSchema = z.object({
  loginCode: z.string().min(1),
  appId: z.string().min(1),
  client: z.literal("wechat-miniprogram"),
  deviceId: z.string().min(1).max(200),
  deviceLabel: z.string().max(200).optional(),
});

export const WechatOpenIdUnboundResponseSchema = z.object({
  status: z.literal("requires_account_binding"),
  bindingTicket: z.string().min(16),
  expiresInSeconds: z.number().int().positive(),
  actions: z.array(z.enum(["bind_existing_account", "register_new_account"])),
});

export const WechatOpenIdLoggedInResponseSchema = AuthTokenResponseSchema.extend({
  status: z.literal("logged_in"),
});

export const WechatOpenIdLoginResponseSchema = z.union([
  WechatOpenIdLoggedInResponseSchema,
  WechatOpenIdUnboundResponseSchema,
]);

export const WechatBindExistingAccountRequestSchema = z.object({
  bindingTicket: z.string().min(16),
  account: z.string().min(1),
  password: z.string().min(8).max(256),
  deviceId: z.string().min(1).max(200),
  deviceLabel: z.string().max(200).optional(),
});

export const WechatRegisterWithEmailRequestSchema = RegisterRequestSchema.extend({
  bindingTicket: z.string().min(16),
});

export const AuthErrorCodeSchema = z.enum([
  "invalid_request",
  "rate_limited",
  "invalid_credentials",
  "invalid_account_format",
  "invalid_email",
  "invalid_phone",
  "email_unverified",
  "email_already_registered",
  "phone_already_registered",
  "email_code_invalid",
  "email_code_expired",
  "email_code_attempts_exceeded",
  "email_rate_limited",
  "email_code_rate_limited",
  "email_provider_not_configured",
  "email_provider_error",
  "email_service_unavailable",
  "wechat_code_invalid",
  "wechat_service_unavailable",
  "wechat_already_bound",
  "account_already_bound_wechat",
  "binding_ticket_expired",
  "account_deletion_method_unavailable",
  "account_deletion_authorization_invalid",
  "account_deletion_receipt_not_found",
  "session_unavailable",
]);

export const AuthErrorResponseSchema = z.object({
  code: AuthErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean().optional(),
  retryAfterSeconds: z.number().int().positive().optional(),
});

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

export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;
export type EmailCodePurpose = z.infer<typeof EmailCodePurposeSchema>;
export type SendEmailCodeRequest = z.infer<typeof SendEmailCodeRequestSchema>;
export type SendEmailCodeResponse = z.infer<typeof SendEmailCodeResponseSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type PasswordLoginRequest = z.infer<typeof PasswordLoginRequestSchema>;
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;
export type PasswordResetConfirmRequest = z.infer<typeof PasswordResetConfirmRequestSchema>;
export type PasswordChangeRequest = z.infer<typeof PasswordChangeRequestSchema>;
export type PasswordChangeWithEmailCodeRequest = z.infer<typeof PasswordChangeWithEmailCodeRequestSchema>;
export type PasswordChangeCodeRequestResponse = z.infer<typeof PasswordChangeCodeRequestResponseSchema>;
export type AccountSecurityResponse = z.infer<typeof AccountSecurityResponseSchema>;
export type AccountDeletionMethod = z.infer<typeof AccountDeletionMethodSchema>;
export type AccountDeletionEmailCodeRequestResponse = z.infer<typeof AccountDeletionEmailCodeRequestResponseSchema>;
export type AccountDeletionVerifyRequest = z.infer<typeof AccountDeletionVerifyRequestSchema>;
export type AccountDeletionVerifyResponse = z.infer<typeof AccountDeletionVerifyResponseSchema>;
export type AccountDeletionConfirmRequest = z.infer<typeof AccountDeletionConfirmRequestSchema>;
export type AccountDeletionConfirmResponse = z.infer<typeof AccountDeletionConfirmResponseSchema>;
export type AccountDeletionStatusResponse = z.infer<typeof AccountDeletionStatusResponseSchema>;
export type WechatOpenIdLoginRequest = z.infer<typeof WechatOpenIdLoginRequestSchema>;
export type WechatOpenIdLoginResponse = z.infer<typeof WechatOpenIdLoginResponseSchema>;
export type WechatBindExistingAccountRequest = z.infer<typeof WechatBindExistingAccountRequestSchema>;
export type WechatRegisterWithEmailRequest = z.infer<typeof WechatRegisterWithEmailRequestSchema>;
export type AuthErrorCode = z.infer<typeof AuthErrorCodeSchema>;
export type AuthErrorResponse = z.infer<typeof AuthErrorResponseSchema>;
export type WechatPhoneLoginRequest = z.infer<typeof WechatPhoneLoginRequestSchema>;
export type WechatPhoneLoginResponse = z.infer<typeof WechatPhoneLoginResponseSchema>;
export type WechatPhoneLoginErrorCode = z.infer<typeof WechatPhoneLoginErrorCodeSchema>;
export type WechatPhoneLoginErrorResponse = z.infer<typeof WechatPhoneLoginErrorResponseSchema>;
