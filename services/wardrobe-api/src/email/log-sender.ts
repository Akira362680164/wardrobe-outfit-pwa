import type { EmailSender } from "./types.js";

export class LogEmailSender implements EmailSender {
  async sendVerificationCode(input: Parameters<EmailSender["sendVerificationCode"]>[0]): Promise<void> {
    if (process.env.NODE_ENV === "production") return;
    console.info(
      `[wardrobe-auth-email] purpose=${input.purpose} email=${input.emailMasked} code=${input.code} expires=${input.minutes}m`,
    );
  }
}
