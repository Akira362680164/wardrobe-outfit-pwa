import { LogEmailSender } from "./log-sender.js";
import { TencentSesEmailSender, type TencentSesConfig } from "./tencent-ses-sender.js";
import { EmailSendError, type EmailSender, type SendVerificationCodeInput } from "./types.js";

export type EmailProviderReadiness = "ready" | "unavailable";

export function getEmailProviderReadiness(env: NodeJS.ProcessEnv = process.env): EmailProviderReadiness {
  if (env.NODE_ENV === "test" || (env.EMAIL_PROVIDER ?? "log") === "log") return "ready";
  if (env.EMAIL_PROVIDER !== "tencent-ses") {
    throw new Error(`Unsupported EMAIL_PROVIDER: ${env.EMAIL_PROVIDER}`);
  }
  return loadTencentSesConfig(env) ? "ready" : "unavailable";
}

export function createEmailSenderFromEnv(env: NodeJS.ProcessEnv = process.env): EmailSender {
  if (env.NODE_ENV === "test" || (env.EMAIL_PROVIDER ?? "log") === "log") return new LogEmailSender();
  if (env.EMAIL_PROVIDER !== "tencent-ses") {
    throw new Error(`Unsupported EMAIL_PROVIDER: ${env.EMAIL_PROVIDER}`);
  }
  const config = loadTencentSesConfig(env);
  return config ? new TencentSesEmailSender(config) : new UnavailableEmailSender();
}

function loadTencentSesConfig(env: NodeJS.ProcessEnv): TencentSesConfig | null {
  const templateId = Number(env.TENCENT_SES_VERIFY_TEMPLATE_ID);
  if (
    !env.TENCENTCLOUD_SECRET_ID
    || !env.TENCENTCLOUD_SECRET_KEY
    || !env.TENCENT_SES_FROM
    || !Number.isSafeInteger(templateId)
    || templateId <= 0
  ) {
    return null;
  }
  return {
    secretId: env.TENCENTCLOUD_SECRET_ID,
    secretKey: env.TENCENTCLOUD_SECRET_KEY,
    region: env.TENCENT_SES_REGION ?? "ap-guangzhou",
    endpoint: env.TENCENT_SES_ENDPOINT ?? "ses.tencentcloudapi.com",
    from: env.TENCENT_SES_FROM,
    replyTo: env.TENCENT_SES_REPLY_TO ?? "",
    templateId,
  };
}

class UnavailableEmailSender implements EmailSender {
  async sendVerificationCode(_input: SendVerificationCodeInput): Promise<never> {
    throw new EmailSendError("email_provider_not_configured", "Email provider is not configured");
  }
}
