import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmailSenderFromEnv, getEmailProviderReadiness } from "../src/email/factory.js";
import { LogEmailSender } from "../src/email/log-sender.js";
import {
  TencentSesEmailSender,
  type TencentSesClient,
  type TencentSesConfig,
} from "../src/email/tencent-ses-sender.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("email sender factory", () => {
  it("does not log verification codes in test mode", async () => {
    process.env.NODE_ENV = "test";
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await new LogEmailSender().sendVerificationCode({
      to: "user@example.com",
      emailMasked: "u***@example.com",
      code: "123456",
      purpose: "register",
      minutes: 10,
    });

    expect(consoleInfo).not.toHaveBeenCalled();
  });

  it("forces log delivery in test mode", () => {
    const sender = createEmailSenderFromEnv({
      NODE_ENV: "test",
      EMAIL_PROVIDER: "tencent-ses",
    });

    expect(sender).toBeInstanceOf(LogEmailSender);
  });

  it("reports provider readiness without exposing missing values", () => {
    expect(getEmailProviderReadiness({ NODE_ENV: "development" })).toBe("ready");
    expect(getEmailProviderReadiness({
      NODE_ENV: "production",
      EMAIL_PROVIDER: "tencent-ses",
      TENCENTCLOUD_SECRET_ID: "secret-id",
    })).toBe("unavailable");
    expect(getEmailProviderReadiness(completeTencentEnv())).toBe("ready");
  });

  it("rejects unknown providers", () => {
    expect(() => createEmailSenderFromEnv({
      NODE_ENV: "production",
      EMAIL_PROVIDER: "smtp",
    })).toThrow("Unsupported EMAIL_PROVIDER: smtp");
  });
});

describe("TencentSesEmailSender", () => {
  it("sends the approved verification template and returns MessageId", async () => {
    let request: Record<string, unknown> | null = null;
    const client: TencentSesClient = {
      SendEmail: async (input) => {
        request = input;
        return { MessageId: "message-123" };
      },
    };
    const sender = new TencentSesEmailSender(config(), client);

    const result = await sender.sendVerificationCode({
      to: "user@example.com",
      emailMasked: "u***@example.com",
      code: "123456",
      purpose: "register",
      minutes: 10,
    });

    expect(request).toEqual({
      FromEmailAddress: "Wardora <no-reply@mail.zhengfangapps.cloud>",
      ReplyToAddresses: "reply@example.com",
      Destination: ["user@example.com"],
      Subject: "Wardora 邮箱验证码",
      Template: {
        TemplateID: 123,
        TemplateData: JSON.stringify({
          purposeText: "注册 Wardora 账号",
          code: "123456",
          minutes: "10",
        }),
      },
      TriggerType: 1,
      Unsubscribe: "0",
    });
    expect(result).toEqual({ provider: "tencent-ses", messageId: "message-123" });
  });

  it("normalizes provider failures without leaking the request", async () => {
    const client: TencentSesClient = {
      SendEmail: async () => {
        throw new Error("secret-id secret-key user@example.com 123456");
      },
    };
    const sender = new TencentSesEmailSender(config(), client);

    const promise = sender.sendVerificationCode({
      to: "user@example.com",
      emailMasked: "u***@example.com",
      code: "123456",
      purpose: "reset_password",
      minutes: 10,
    });

    await expect(promise).rejects.toMatchObject({
      code: "email_provider_error",
      message: "Tencent SES email delivery failed",
    });
    await expect(promise).rejects.not.toThrow(/secret-id|secret-key|user@example.com|123456/);
  });

  it("rejects responses without MessageId", async () => {
    const client: TencentSesClient = { SendEmail: async () => ({}) };
    const sender = new TencentSesEmailSender(config(), client);

    await expect(sender.sendVerificationCode({
      to: "user@example.com",
      emailMasked: "u***@example.com",
      code: "123456",
      purpose: "change_password",
      minutes: 10,
    })).rejects.toMatchObject({ code: "email_provider_error" });
  });
});

function config(): TencentSesConfig {
  return {
    secretId: "secret-id",
    secretKey: "secret-key",
    region: "ap-guangzhou",
    endpoint: "ses.tencentcloudapi.com",
    from: "Wardora <no-reply@mail.zhengfangapps.cloud>",
    replyTo: "reply@example.com",
    templateId: 123,
  };
}

function completeTencentEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    EMAIL_PROVIDER: "tencent-ses",
    TENCENTCLOUD_SECRET_ID: "secret-id",
    TENCENTCLOUD_SECRET_KEY: "secret-key",
    TENCENT_SES_FROM: "Wardora <no-reply@mail.zhengfangapps.cloud>",
    TENCENT_SES_VERIFY_TEMPLATE_ID: "123",
  };
}
