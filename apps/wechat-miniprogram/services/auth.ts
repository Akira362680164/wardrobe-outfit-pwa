import { request } from "./http";
import { setSession, type SessionState, type SessionUser } from "../stores/session";

const WECHAT_MINIPROGRAM_APP_ID = "wx14a1a85b7b3844d0";
const AGREEMENT_VERSION = "2026-07-08";
const PRIVACY_VERSION = "2026-07-08";

interface AuthTokenResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  user: SessionUser & { maskedPhone?: string };
}

export interface WechatLoginBranchResponse {
  status: "requires_account_binding";
  bindingTicket: string;
  expiresInSeconds: number;
  actions: Array<"bind_existing_account" | "register_new_account">;
}

export type WechatLoginResponse = (AuthTokenResponse & { status: "logged_in" }) | WechatLoginBranchResponse;

export interface SendEmailCodeResponse {
  status: "sent";
  emailMasked: string;
  cooldownSeconds: number;
  expiresInSeconds: number;
}

export interface AccountSecurityResponse {
  user: { id: string; displayName: string };
  email: { bound: boolean; masked?: string; verified: boolean };
  phone: { bound: boolean; masked?: string; verified: boolean; usage: "login_name" };
  wechat: { bound: boolean; appId?: string };
  password: { set: boolean; changedAt?: string };
}

let runtimeDeviceId = "";

export async function loginWithWechatOpenId(): Promise<WechatLoginResponse> {
  const loginCode = await getLoginCode();
  const deviceId = getRuntimeDeviceId();
  const result = await request<WechatLoginResponse>({
    method: "POST",
    path: "/api/auth/wechat/login",
    auth: false,
    toast: false,
    data: {
      loginCode,
      appId: WECHAT_MINIPROGRAM_APP_ID,
      client: "wechat-miniprogram",
      deviceId,
      deviceLabel: getDeviceLabel(),
    },
  });

  if (result.status === "logged_in") saveTokenResponse(result, deviceId);
  return result;
}

export async function bindExistingWechatAccount(input: {
  bindingTicket: string;
  account: string;
  password: string;
}): Promise<SessionState> {
  const deviceId = getRuntimeDeviceId();
  const result = await request<AuthTokenResponse>({
    method: "POST",
    path: "/api/auth/wechat/bind-existing-account",
    auth: false,
    toast: false,
    data: {
      ...input,
      deviceId,
      deviceLabel: getDeviceLabel(),
    },
  });
  return saveTokenResponse(result, deviceId);
}

export async function registerWithEmail(input: {
  email: string;
  emailCode: string;
  password: string;
  phone?: string;
  bindingTicket?: string;
}): Promise<SessionState> {
  const deviceId = getRuntimeDeviceId();
  const path = input.bindingTicket ? "/api/auth/wechat/register-with-email" : "/api/auth/register";
  const result = await request<AuthTokenResponse>({
    method: "POST",
    path,
    auth: false,
    toast: false,
    data: {
      ...input,
      deviceId,
      deviceLabel: getDeviceLabel(),
      agreementVersion: AGREEMENT_VERSION,
      privacyVersion: PRIVACY_VERSION,
    },
  });
  return saveTokenResponse(result, deviceId);
}

export async function loginWithPassword(account: string, password: string): Promise<SessionState> {
  const deviceId = getRuntimeDeviceId();
  const result = await request<AuthTokenResponse>({
    method: "POST",
    path: "/api/auth/login",
    auth: false,
    toast: false,
    data: {
      account,
      password,
      deviceId,
      deviceLabel: getDeviceLabel(),
      client: "wechat-miniprogram",
    },
  });
  return saveTokenResponse(result, deviceId);
}

export function sendEmailCode(input: {
  email: string;
  purpose: "register" | "wechat_register" | "reset_password" | "change_password";
  bindingTicket?: string;
}): Promise<SendEmailCodeResponse> {
  return request<SendEmailCodeResponse>({
    method: "POST",
    path: "/api/auth/email/send-code",
    auth: false,
    toast: false,
    data: input,
  });
}

export function requestPasswordReset(email: string): Promise<SendEmailCodeResponse> {
  return request<SendEmailCodeResponse>({
    method: "POST",
    path: "/api/auth/password/reset/request",
    auth: false,
    toast: false,
    data: { email },
  });
}

export function confirmPasswordReset(input: {
  email: string;
  emailCode: string;
  newPassword: string;
}): Promise<{ status: "ok" }> {
  return request<{ status: "ok" }>({
    method: "POST",
    path: "/api/auth/password/reset/confirm",
    auth: false,
    toast: false,
    data: input,
  });
}

export function changePasswordWithCurrentPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ status: "ok" }> {
  return request<{ status: "ok" }>({
    method: "POST",
    path: "/api/auth/password/change",
    auth: true,
    toast: false,
    data: input,
  });
}

export function requestPasswordChangeCode(): Promise<SendEmailCodeResponse> {
  return request<SendEmailCodeResponse>({
    method: "POST",
    path: "/api/auth/password/change/request-code",
    auth: true,
    toast: false,
  });
}

export function changePasswordWithEmailCode(input: {
  emailCode: string;
  newPassword: string;
}): Promise<{ status: "ok" }> {
  return request<{ status: "ok" }>({
    method: "POST",
    path: "/api/auth/password/change-with-email-code",
    auth: true,
    toast: false,
    data: input,
  });
}

export function getAccountSecurity(): Promise<AccountSecurityResponse> {
  return request<AccountSecurityResponse>({
    method: "GET",
    path: "/api/auth/account/security",
    auth: true,
    toast: false,
  });
}

function saveTokenResponse(result: AuthTokenResponse, deviceId: string): SessionState {
  return setSession({
    token: result.accessToken,
    refreshToken: result.refreshToken,
    deviceId,
    expiresAt: Date.parse(result.accessTokenExpiresAt),
    refreshTokenExpiresAt: result.refreshTokenExpiresAt ? Date.parse(result.refreshTokenExpiresAt) : undefined,
    user: {
      id: result.user.id,
      emailMasked: result.user.emailMasked,
      emailVerified: result.user.emailVerified,
      phoneMasked: result.user.phoneMasked ?? result.user.maskedPhone,
      phoneVerified: result.user.phoneVerified,
      displayName: result.user.displayName,
      avatarUrl: result.user.avatarUrl,
    },
  });
}

function getLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (result) => {
        if (result.code) resolve(result.code);
        else reject(new Error("微信登录授权已过期，请重新点击登录。"));
      },
      fail: () => reject(new Error("微信登录失败，请稍后重试。")),
    });
  });
}

function getRuntimeDeviceId(): string {
  if (!runtimeDeviceId) runtimeDeviceId = `wechat-mini-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return runtimeDeviceId;
}

function getDeviceLabel(): string {
  const info = wx.getSystemInfoSync();
  return [info.platform, info.model, info.system].filter(Boolean).join(" / ").slice(0, 200);
}
