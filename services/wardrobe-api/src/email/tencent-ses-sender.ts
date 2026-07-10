import { createRequire } from "node:module";

import {
  EmailSendError,
  emailPurposeText,
  type EmailSender,
  type SendVerificationCodeInput,
  type SendVerificationCodeResult,
} from "./types.js";

export interface TencentSesConfig {
  secretId: string;
  secretKey: string;
  region: string;
  endpoint: string;
  from: string;
  replyTo: string;
  templateId: number;
}

export interface TencentSesClient {
  SendEmail(input: Record<string, unknown>): Promise<{ MessageId?: string }>;
}

const require = createRequire(import.meta.url);

export class TencentSesEmailSender implements EmailSender {
  private readonly client: TencentSesClient;

  constructor(
    private readonly config: TencentSesConfig,
    client?: TencentSesClient,
  ) {
    this.client = client ?? createClient(config);
  }

  async sendVerificationCode(input: SendVerificationCodeInput): Promise<SendVerificationCodeResult> {
    try {
      const response = await this.client.SendEmail({
        FromEmailAddress: this.config.from,
        ReplyToAddresses: this.config.replyTo,
        Destination: [input.to],
        Subject: "Wardora 邮箱验证码",
        Template: {
          TemplateID: this.config.templateId,
          TemplateData: JSON.stringify({
            purposeText: emailPurposeText(input.purpose),
            code: input.code,
            minutes: String(input.minutes),
          }),
        },
        TriggerType: 1,
        Unsubscribe: "0",
      });
      if (!response.MessageId) {
        throw new EmailSendError("email_provider_error", "Tencent SES response missing MessageId");
      }
      return { provider: "tencent-ses", messageId: response.MessageId };
    } catch (error) {
      if (error instanceof EmailSendError) throw error;
      throw new EmailSendError("email_provider_error", "Tencent SES email delivery failed");
    }
  }
}

function createClient(config: TencentSesConfig): TencentSesClient {
  const tencentcloud = require("tencentcloud-sdk-nodejs") as {
    ses: { v20201002: { Client: new (config: Record<string, unknown>) => TencentSesClient } };
  };
  return new tencentcloud.ses.v20201002.Client({
    credential: {
      secretId: config.secretId,
      secretKey: config.secretKey,
    },
    region: config.region,
    profile: {
      httpProfile: {
        endpoint: config.endpoint,
        reqMethod: "POST",
        reqTimeout: 10,
      },
    },
  });
}
