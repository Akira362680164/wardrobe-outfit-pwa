# Tencent SES Email Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend-only Tencent Cloud SES verification sender, durable email-code rate limits, readiness reporting, and response-driven 60-second resend timers without enabling real delivery before template approval.

**Architecture:** Keep the existing `EmailSender` boundary and add one environment factory. `EmailVerificationService` remains the single state-machine owner; PostgreSQL challenge rows enforce cooldown and hourly limits, while App and mini program consume `cooldownSeconds` returned by the API.

**Tech Stack:** TypeScript, Fastify, Drizzle/PostgreSQL, Zod, Vitest, React/Next.js, WeChat mini program, Tencent Cloud Node.js SDK.

## Global Constraints

- No Tencent SecretId, SecretKey, TemplateID, verification code, OpenID, binding ticket, or password may enter Git or client code.
- `NODE_ENV=test` always uses `LogEmailSender`; no provider test may make a network request.
- `EMAIL_PROVIDER` defaults to `log`; unsupported values fail startup.
- The resend cooldown is 60 seconds, code validity is 10 minutes, and a code allows at most 5 failed attempts.
- Hourly limits are 5 successful sends per normalized email and 20 successful sends per hashed IP, across all purposes.
- Keep `wechat_register`; add `change_email` only as a delivery purpose, not as a new account-management flow.
- Do not deploy, mutate server environment variables, call live SES, upload a mini program, or build an APK in this task.
- Do not touch unrelated untracked environment, agent, or temporary files.

---

### Task 1: Provider Contract, Tencent Sender, Factory, And Readiness

**Files:**
- Modify: `packages/cloud-contracts/src/auth/contracts.ts`
- Modify: `packages/cloud-contracts/src/common/health.ts`
- Modify: `services/wardrobe-api/src/email/types.ts`
- Modify: `services/wardrobe-api/src/email/log-sender.ts`
- Modify: `services/wardrobe-api/src/email/mock-sender.ts`
- Create: `services/wardrobe-api/src/email/tencent-ses-sender.ts`
- Create: `services/wardrobe-api/src/email/factory.ts`
- Modify: `services/wardrobe-api/src/auth/email-verification.ts`
- Modify: `services/wardrobe-api/src/app.ts`
- Create: `services/wardrobe-api/tests/email-sender.test.ts`
- Modify: `services/wardrobe-api/tests/health.test.ts`
- Modify: `services/wardrobe-api/package.json`
- Modify: `package-lock.json`
- Modify: `VERSION_HISTORY.md`

**Interfaces:**
- Consumes: existing `EmailCodePurpose`, `EmailVerificationService`, and `/api/ready` route.
- Produces: `SendVerificationCodeResult`, `EmailSendError`, `emailPurposeText`, `TencentSesEmailSender`, `createEmailSenderFromEnv`, and `getEmailProviderReadiness`.

- [x] **Step 1: Install the backend-only SDK**

Run:

```bash
npm --workspace @wardrobe/wardrobe-api install tencentcloud-sdk-nodejs
```

Expected: the API workspace dependency and root lockfile include `tencentcloud-sdk-nodejs`; no client package imports it.

- [x] **Step 2: Write failing sender, factory, and health tests**

Add tests that construct `TencentSesEmailSender` with a fake client and assert this exact payload:

```ts
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
```

Also assert: test env forces log, incomplete Tencent config is unavailable, unknown provider throws, provider failures are normalized, and `/api/ready` includes `email`.

- [x] **Step 3: Run the focused tests and confirm failure**

Run:

```bash
npm --workspace @wardrobe/wardrobe-api run test -- tests/email-sender.test.ts tests/health.test.ts
```

Expected: failure because the sender/factory and `dependencies.email` do not exist.

- [x] **Step 4: Extend the shared contracts**

Add `change_email` to `EmailCodePurposeSchema`, add the provider error codes to `AuthErrorCodeSchema`, and require the email dependency:

```ts
email: z.enum(["ready", "unavailable"]),
```

Keep all existing auth values for backwards compatibility.

- [x] **Step 5: Implement the existing sender boundary**

Use these exact public types in `email/types.ts`:

```ts
export interface SendVerificationCodeResult {
  provider: "log" | "tencent-ses";
  messageId?: string;
}

export interface EmailSender {
  sendVerificationCode(input: SendVerificationCodeInput): Promise<SendVerificationCodeResult>;
}

export class EmailSendError extends Error {
  constructor(readonly code: "email_provider_not_configured" | "email_provider_error", message: string) {
    super(message);
  }
}
```

`emailPurposeText` must map all five current purposes and `change_email` to Chinese template text. `LogEmailSender` returns `{ provider: "log" }`; test mode logs nothing.

- [x] **Step 6: Implement the Tencent sender and factory**

The Tencent sender accepts a narrow client with `SendEmail`, sends one destination, and returns:

```ts
return { provider: "tencent-ses", messageId: response.MessageId };
```

The factory behavior is:

```ts
if (env.NODE_ENV === "test") return new LogEmailSender();
if ((env.EMAIL_PROVIDER ?? "log") === "log") return new LogEmailSender();
if (env.EMAIL_PROVIDER !== "tencent-ses") throw new Error(`Unsupported EMAIL_PROVIDER: ${env.EMAIL_PROVIDER}`);
return readiness === "ready" ? new TencentSesEmailSender(config) : new UnavailableEmailSender();
```

Only the API-side Tencent sender may call `createRequire(import.meta.url)`.

- [x] **Step 7: Wire sender and readiness into the app**

Default `EmailVerificationService` to `createEmailSenderFromEnv()`. Add an injectable `emailReadinessCheck` to `BuildAppOptions`, set `deps.email`, and include it in `allReady`. Incomplete configured SES returns `503` from `/api/ready` and email-send attempts return `503 email_provider_not_configured`.

- [x] **Step 8: Run provider validation**

Run:

```bash
npm run cloud:contracts:typecheck
npm run api:typecheck
npm --workspace @wardrobe/wardrobe-api run test -- tests/email-sender.test.ts tests/health.test.ts tests/email-verification.test.ts
```

Expected: all pass without a Tencent credential or network request.

- [x] **Step 9: Record and commit Task 1**

Update `VERSION_HISTORY.md`, stage only Task 1 files, verify `git diff --cached --check`, then commit:

```bash
git commit -m "v2.1.11 add tencent ses email sender"
```

---

### Task 2: Durable Email And IP Send Limits

**Files:**
- Modify: `services/wardrobe-api/src/db/schema.ts`
- Create: `services/wardrobe-api/migrations/0015_email_verification_rate_limit_indexes.sql`
- Modify: `services/wardrobe-api/migrations/meta/_journal.json`
- Modify: `services/wardrobe-api/src/auth/email-verification.ts`
- Modify: `services/wardrobe-api/tests/email-verification.test.ts`
- Modify: `services/wardrobe-api/tests/account-password-auth.test.ts`
- Modify: `services/wardrobe-api/tests/wechat-openid-auth.test.ts`
- Modify: `VERSION_HISTORY.md`

**Interfaces:**
- Consumes: `EmailVerificationStore`, `EmailSendError`, hashed IPs, and the existing challenge table.
- Produces: cross-purpose 60-second cooldown, durable hourly counts, and failed-dispatch cleanup.

- [ ] **Step 1: Write failing state-machine tests**

Cover these exact assertions:

```ts
expect(result.cooldownSeconds).toBe(60);
await expect(sixthEmailSend).rejects.toMatchObject({ code: "email_code_rate_limited", statusCode: 429 });
await expect(twentyFirstIpSend).rejects.toMatchObject({ code: "email_code_rate_limited", statusCode: 429 });
expect(store.challenges).toHaveLength(0); // after provider failure
```

Use timestamps separated by at least 60 seconds for hourly-limit tests so cooldown does not mask the intended assertion.

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
npm --workspace @wardrobe/wardrobe-api run test -- tests/email-verification.test.ts
```

Expected: current 30-second cooldown and missing count/delete methods fail.

- [ ] **Step 3: Add query indexes and migration**

Add these indexes in both Drizzle schema and SQL migration:

```sql
CREATE INDEX "email_verification_challenges_email_created_at_idx"
  ON "email_verification_challenges" ("email_normalized", "created_at");
CREATE INDEX "email_verification_challenges_ip_created_at_idx"
  ON "email_verification_challenges" ("created_ip_hash", "created_at");
```

Append migration index 15 to `_journal.json` without editing prior entries.

- [ ] **Step 4: Extend the store and state machine**

Add store methods for latest challenge by email, recent count by email or IP, and challenge deletion. Set:

```ts
export const EMAIL_CODE_COOLDOWN_MS = 60 * 1000;
export const EMAIL_CODE_RATE_WINDOW_MS = 60 * 60 * 1000;
export const EMAIL_CODE_EMAIL_RATE_MAX = 5;
export const EMAIL_CODE_IP_RATE_MAX = 20;
```

Check availability and limits before creation. Create a challenge, call the sender, and delete that exact challenge when dispatch throws. Convert `EmailSendError` into 503 `AuthApiError` without provider details.

- [ ] **Step 5: Update in-memory stores in auth tests**

Each test store implements the new methods by filtering its challenge array. `deleteChallenge(id)` removes only the matching challenge and leaves existing verified/consumed fixtures unchanged.

- [ ] **Step 6: Run state-machine and auth validation**

Run:

```bash
npm run api:typecheck
npm --workspace @wardrobe/wardrobe-api run test -- tests/email-verification.test.ts tests/account-password-auth.test.ts tests/wechat-openid-auth.test.ts tests/session.test.ts tests/registration.test.ts
```

Expected: all pass; no challenge JSON contains the plaintext code.

- [ ] **Step 7: Record and commit Task 2**

Update `VERSION_HISTORY.md`, stage only Task 2 files, verify the staged diff, then commit:

```bash
git commit -m "v2.1.11 enforce email verification limits"
```

---

### Task 3: Response-Driven 60-Second Client Countdown

**Files:**
- Modify: `src/components/auth/auth-gate.tsx`
- Modify: `src/components/auth/account-views.tsx`
- Modify: `src/components/auth/auth-provider.tsx`
- Modify: `apps/wechat-miniprogram/pages/login/register-email/index.ts`
- Modify: `apps/wechat-miniprogram/pages/login/forgot-password/index.ts`
- Modify: `apps/wechat-miniprogram/pages/settings/change-password/index.ts`
- Modify: `scripts/test-app-email-auth-flow.ts`
- Modify: `scripts/test-auth-client-shell.ts`
- Modify: `scripts/test-auth-flow-v2-0-1.ts`
- Modify: `scripts/test-wechat-email-auth-flow.ts`
- Modify: `docs/superpowers/specs/2026-07-09-account-auth-email-wechat-design.md`
- Modify: `VERSION_HISTORY.md`

**Interfaces:**
- Consumes: existing `SendEmailCodeResponse.cooldownSeconds` returned by registration, reset, and password-change requests.
- Produces: server-driven countdown behavior in all App/PWA and mini-program email-code screens.

- [ ] **Step 1: Update failing source-contract tests**

Require send handlers to assign the returned response and call:

```ts
setCountdown(response.cooldownSeconds);
```

or in the mini program:

```ts
this.startCountdown(response.cooldownSeconds);
```

Also assert the provider error codes have Chinese messages and mini-program login code contains neither `getPhoneNumber` nor `open-type="getPhoneNumber"`.

- [ ] **Step 2: Run the client contract tests and confirm failure**

Run:

```bash
npm run test:logic:auth-client-shell
npm run test:logic:auth-flow-v2-0-1
npm run test:logic:app-email-auth-flow
npm run test:logic:wechat-email-auth-flow
```

Expected: failure while handlers still call `setCountdown(30)` or `startCountdown(30)`.

- [ ] **Step 3: Use the API response in every send handler**

Registration, password reset, and password change capture the response and use its positive integer `cooldownSeconds`. Add messages for `email_code_rate_limited`, `email_provider_not_configured`, and `email_provider_error`. Do not change layout, styling, or route structure.

- [ ] **Step 4: Update the superseded account design values**

Change phase-one design references from 30 seconds to 60 seconds and state that the duration comes from `cooldownSeconds` so the documentation matches runtime behavior.

- [ ] **Step 5: Run client validation**

Run:

```bash
npm run typecheck
npm --prefix apps/wechat-miniprogram run typecheck
npm run test:logic:auth-client-shell
npm run test:logic:auth-flow-v2-0-1
npm run test:logic:app-email-auth-flow
npm run test:logic:wechat-email-auth-flow
npm run test:logic:online-auth-shell
npm run test:logic:online-workspace
```

Expected: all pass and no auth client hard-codes a 30-second email resend timer.

- [ ] **Step 6: Record and commit Task 3**

Update `VERSION_HISTORY.md`, stage only Task 3 files, verify the staged diff, then commit:

```bash
git commit -m "v2.1.11 use server email resend cooldown"
```

---

### Task 4: Full Local Acceptance

**Files:**
- Modify: `VERSION_HISTORY.md`

**Interfaces:**
- Consumes: all three implementation commits.
- Produces: a reproducible local acceptance record and explicit live-validation boundary.

- [ ] **Step 1: Run full required validation**

Run:

```bash
npm run cloud:contracts:typecheck
npm run api:typecheck
npm --workspace @wardrobe/wardrobe-api run test
npm run typecheck
npm --prefix apps/wechat-miniprogram run typecheck
npm run test:logic:online-auth-shell
npm run test:logic:auth-flow-v2-0-1
npm run test:logic:auth-client-shell
npm run test:logic:app-email-auth-flow
npm run test:logic:wechat-email-auth-flow
npm run test:logic:online-workspace
npm run build
git diff --check
```

Expected: every command passes without real Tencent credentials.

- [ ] **Step 2: Run source-safety scans**

Run searches proving no Secret or phone-number JSAPI entered client code, and verify only backend files import the Tencent SDK. Do not print values from `.env` files.

- [ ] **Step 3: Finalize the history and plan status**

Record actual test results and these remaining risks: template approval pending, no TemplateID, no production configuration/deployment, no real inbox, no mini-program real-device preview, and no Android APK rebuild.

- [ ] **Step 4: Commit acceptance metadata if changed**

If validation changes only plan/history files, stage those exact files and commit:

```bash
git commit -m "docs: record tencent ses validation"
```
