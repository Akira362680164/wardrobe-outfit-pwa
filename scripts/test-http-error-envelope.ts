import { strict as assert } from "node:assert";
import { toOnlineRequestError } from "../src/lib/online/online-error";
import { httpErrorFromResponse } from "../apps/wechat-miniprogram/services/http";

const body = {
  code: "conflict",
  message: "计划已变化",
  retryable: true,
  retryAfterSeconds: 45,
  details: { reasonCode: "primary_plan_changed" },
  requestId: "body-request-id",
};

const app = toOnlineRequestError(409, body, "header-request-id", "60");
assert.equal(app.status, 409);
assert.equal(app.code, "conflict");
assert.equal(app.retryable, true);
assert.equal(app.retryAfterSeconds, 45);
assert.equal(app.details?.reasonCode, "primary_plan_changed");
assert.equal(app.requestId, "body-request-id");

const mini = httpErrorFromResponse(429, body, { "Retry-After": "60" }, "fallback-request-id");
assert.equal(mini.statusCode, 429);
assert.equal(mini.code, "conflict");
assert.equal(mini.retryable, true);
assert.equal(mini.retryAfterSeconds, 45);
assert.equal(mini.details?.reasonCode, "primary_plan_changed");
assert.equal(mini.requestId, "body-request-id");

const headerOnly = httpErrorFromResponse(429, { code: "rate_limited", message: "稍后重试", retryable: true }, { "retry-after": "120" }, "header-only");
assert.equal(headerOnly.retryAfterSeconds, 120);

console.log("HTTP error envelope tests passed");
