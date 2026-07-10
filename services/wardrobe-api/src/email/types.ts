import type { EmailCodePurpose } from "@wardrobe/cloud-contracts";

export interface SendVerificationCodeInput {
  to: string;
  emailMasked: string;
  code: string;
  purpose: EmailCodePurpose;
  minutes: number;
}

export interface SendVerificationCodeResult {
  provider: "log" | "tencent-ses";
  messageId?: string;
}

export interface EmailSender {
  readonly readiness?: "ready" | "unavailable";
  sendVerificationCode(input: SendVerificationCodeInput): Promise<SendVerificationCodeResult>;
}

export class EmailSendError extends Error {
  constructor(
    readonly code: "email_provider_not_configured" | "email_provider_error",
    message: string,
  ) {
    super(message);
  }
}

export function emailPurposeText(purpose: EmailCodePurpose): string {
  const mapping: Record<EmailCodePurpose, string> = {
    register: "注册 Wardora 账号",
    wechat_register: "注册并绑定微信",
    reset_password: "重置密码",
    change_password: "修改密码",
    change_email: "更换邮箱",
    delete_account: "注销账号",
  };
  return mapping[purpose];
}
