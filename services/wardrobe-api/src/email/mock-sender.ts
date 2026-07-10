import type { EmailCodePurpose } from "@wardrobe/cloud-contracts";

import type { EmailSender } from "./types.js";

export interface MockEmailMessage {
  to: string;
  emailMasked: string;
  code: string;
  purpose: EmailCodePurpose;
  minutes: number;
}

export class MockEmailSender implements EmailSender {
  readonly messages: MockEmailMessage[] = [];

  async sendVerificationCode(input: MockEmailMessage): Promise<void> {
    this.messages.push(input);
  }
}
