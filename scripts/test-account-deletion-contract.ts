import assert from "node:assert/strict";

import {
  AccountDeletionConfirmRequestSchema,
  AccountDeletionStatusResponseSchema,
  AccountDeletionVerifyRequestSchema,
} from "@wardrobe/cloud-contracts";

assert.equal(
  AccountDeletionVerifyRequestSchema.parse({ method: "password", currentPassword: "password-123" }).method,
  "password",
);
assert.equal(
  AccountDeletionVerifyRequestSchema.parse({ method: "email", emailCode: "123456" }).method,
  "email",
);
assert.equal(
  AccountDeletionVerifyRequestSchema.parse({ method: "wechat", loginCode: "wx-code", appId: "wx-app" }).method,
  "wechat",
);
assert.equal(AccountDeletionVerifyRequestSchema.safeParse({ method: "sms", code: "123456" }).success, false);
assert.equal(
  AccountDeletionConfirmRequestSchema.safeParse({
    authorizationToken: "a".repeat(32),
    confirmationText: "DELETE_ACCOUNT",
  }).success,
  true,
);
assert.equal(
  AccountDeletionConfirmRequestSchema.safeParse({
    authorizationToken: "a".repeat(32),
    confirmationText: "DELETE",
  }).success,
  false,
);
assert.equal(
  AccountDeletionStatusResponseSchema.safeParse({
    status: "completed",
    completedAt: new Date().toISOString(),
  }).success,
  true,
);
assert.equal(AccountDeletionStatusResponseSchema.safeParse({ status: "unknown" }).success, false);

console.log("account deletion contracts: ok");
