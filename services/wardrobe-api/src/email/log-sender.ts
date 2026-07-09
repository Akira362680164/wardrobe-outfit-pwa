import type { EmailSender } from "./types.js";

export class LogEmailSender implements EmailSender {
  async sendVerificationCode(input: Parameters<EmailSender["sendVerificationCode"]>[0]) {
    if (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "production") {
      console.info(
        `[wardrobe-auth-email] purpose=${input.purpose} email=${input.emailMasked} code=${input.code} expires=${input.minutes}m`,
      );
    }
    return { provider: "log" as const };
  }
}
