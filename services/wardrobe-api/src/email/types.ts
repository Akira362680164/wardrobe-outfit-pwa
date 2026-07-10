import type { EmailCodePurpose } from "@wardrobe/cloud-contracts";

export interface EmailSender {
  sendVerificationCode(input: {
    to: string;
    emailMasked: string;
    code: string;
    purpose: EmailCodePurpose;
    minutes: number;
  }): Promise<void>;
}
