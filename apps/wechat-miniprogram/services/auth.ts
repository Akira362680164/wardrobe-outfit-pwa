import { request } from "./http";
import { setSession, type SessionState } from "../stores/session";

const WECHAT_MINIPROGRAM_APP_ID = "wx14a1a85b7b3844d0";
const AGREEMENT_VERSION = "2026-07-08";
const PRIVACY_VERSION = "2026-07-08";

export interface WechatPhoneLoginResponse {
  token: string;
  refreshToken?: string;
  expiresAt: string;
  refreshTokenExpiresAt?: string;
  isNewUser: boolean;
  nextAction: "home" | "complete_profile";
  user: {
    id: string;
    phoneMasked: string;
    displayName?: string;
    avatarUrl?: string;
  };
}

let runtimeDeviceId = "";

export async function loginWithWechatPhone(phoneCode: string): Promise<SessionState> {
  const loginCode = await getLoginCode();
  const deviceId = getRuntimeDeviceId();
  const result = await request<WechatPhoneLoginResponse>({
    method: "POST",
    path: "/api/auth/wechat/phone-login",
    auth: false,
    toast: false,
    data: {
      loginCode,
      phoneCode,
      appId: WECHAT_MINIPROGRAM_APP_ID,
      client: "wechat-miniprogram",
      deviceId,
      deviceLabel: getDeviceLabel(),
      agreementVersion: AGREEMENT_VERSION,
      privacyVersion: PRIVACY_VERSION,
    },
  });

  return setSession({
    token: result.token,
    refreshToken: result.refreshToken,
    deviceId,
    expiresAt: Date.parse(result.expiresAt),
    refreshTokenExpiresAt: result.refreshTokenExpiresAt ? Date.parse(result.refreshTokenExpiresAt) : undefined,
    user: {
      id: result.user.id,
      phoneMasked: result.user.phoneMasked,
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
        else reject(new Error("授权已过期，请重新点击登录。"));
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
