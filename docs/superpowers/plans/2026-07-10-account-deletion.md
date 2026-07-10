# Wardora Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-service, three-confirmation account deletion to the Android App and WeChat mini-program, with immediate account disablement, all-session revocation, verified database/object-storage deletion, and honest pending/success states.

**Architecture:** Shared Zod contracts define verification, authorization, confirmation, receipt, and status responses. A focused API service owns one-time deletion authorizations and durable deletion jobs; final confirmation disables the account and revokes sessions transactionally, then deletes storage and user data idempotently, with the existing server timer retrying pending jobs. App and mini-program use the same server state machine but expose only identity methods available on each client.

**Tech Stack:** TypeScript, Zod, Fastify, Drizzle/PostgreSQL, React/Next.js, Capacitor Android, WeChat Mini Program, Vitest, repository contract scripts, ADB/WebView E2E.

## Global Constraints

- Version target is `2.1.13-test`, upgraded from the current `2.1.12-test` baseline before APK delivery.
- No new runtime dependency or App-to-mini-program WeChat OpenSDK bridge.
- Entry is the bottom-most red underlined “注销账号” text in Account Security, without button visual treatment, while preserving a minimum 44px touch target.
- Flow is exactly risk notice, one existing identity verification, and final irreversible authorization.
- App supports verified-email and current-password verification only; mini-program supports bound WeChat, verified email, and current password.
- Final confirmation immediately disables login and revokes every session; no cooling-off period and no recovery.
- “账号已注销” is shown only after database records, asset files, and diagnostic files are deleted.
- Do not collect deletion reasons, identity cards, faces, or any identity type not already bound to the account.
- Server state is authoritative; no optimistic success, local business cache, outbox, or client-only deletion.
- App/service/shared work lands on `main` before latest `main` is merged into the mini-program task branch and integrated into `wechat/miniprogram`.

---

### Task 1: Shared contracts and durable schema

**Files:**
- Modify: `packages/cloud-contracts/src/auth/contracts.ts`
- Modify: `packages/cloud-contracts/src/index.ts`
- Modify: `services/wardrobe-api/src/db/schema.ts`
- Create: `services/wardrobe-api/migrations/0016_account_deletion.sql`
- Modify: `services/wardrobe-api/migrations/meta/_journal.json`
- Test: `scripts/test-account-deletion-contract.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `AccountDeletionMethod = "email" | "password" | "wechat"`.
- Produces: request/response schemas for `/api/auth/account-deletion/email/request`, `/verify`, `/confirm`, and `/status/:receiptToken`.
- Produces: `accountDeletionAuthorizations` and `accountDeletionJobs` Drizzle tables.

- [ ] **Step 1: Write the failing contract test**

Create `scripts/test-account-deletion-contract.ts` to assert that valid email/password/WeChat verification requests parse, an unknown method fails, confirmation requires both `authorizationToken` and `confirmationText: "DELETE_ACCOUNT"`, and status responses accept only `processing | completed | failed`.

```ts
import assert from "node:assert/strict";
import {
  AccountDeletionConfirmRequestSchema,
  AccountDeletionStatusResponseSchema,
  AccountDeletionVerifyRequestSchema,
} from "@wardrobe/cloud-contracts";

assert.equal(AccountDeletionVerifyRequestSchema.parse({ method: "password", currentPassword: "password-123" }).method, "password");
assert.equal(AccountDeletionVerifyRequestSchema.parse({ method: "email", emailCode: "123456" }).method, "email");
assert.equal(AccountDeletionVerifyRequestSchema.parse({ method: "wechat", loginCode: "wx-code", appId: "wx-app" }).method, "wechat");
assert.equal(AccountDeletionVerifyRequestSchema.safeParse({ method: "sms", code: "123456" }).success, false);
assert.equal(AccountDeletionConfirmRequestSchema.safeParse({ authorizationToken: "a".repeat(32), confirmationText: "DELETE_ACCOUNT" }).success, true);
assert.equal(AccountDeletionStatusResponseSchema.safeParse({ status: "completed", completedAt: new Date().toISOString() }).success, true);
console.log("account deletion contracts: ok");
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `npx tsx scripts/test-account-deletion-contract.ts`

Expected: FAIL because account deletion schemas are not exported.

- [ ] **Step 3: Add the exact shared contract surface**

Add discriminated verification schemas and response types to `contracts.ts`:

```ts
export const AccountDeletionMethodSchema = z.enum(["email", "password", "wechat"]);
export const AccountDeletionEmailCodeRequestResponseSchema = SendEmailCodeResponseSchema;
export const AccountDeletionVerifyRequestSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("email"), emailCode: z.string().regex(/^\d{6}$/) }),
  z.object({ method: z.literal("password"), currentPassword: z.string().min(8).max(256) }),
  z.object({ method: z.literal("wechat"), loginCode: z.string().min(1), appId: z.string().min(1) }),
]);
export const AccountDeletionVerifyResponseSchema = z.object({
  authorizationToken: z.string().min(32),
  expiresAt: z.string().datetime(),
});
export const AccountDeletionConfirmRequestSchema = z.object({
  authorizationToken: z.string().min(32),
  confirmationText: z.literal("DELETE_ACCOUNT"),
});
export const AccountDeletionConfirmResponseSchema = z.object({
  receiptToken: z.string().min(32),
  status: z.enum(["processing", "completed"]),
});
export const AccountDeletionStatusResponseSchema = z.object({
  status: z.enum(["processing", "completed", "failed"]),
  completedAt: z.string().datetime().optional(),
  referenceCode: z.string().min(1).optional(),
});
```

Add `delete_account` to `EmailCodePurposeSchema` and export the inferred types through `packages/cloud-contracts/src/index.ts`.

- [ ] **Step 4: Add durable authorization and job tables**

Add a status enum and two tables. Authorizations store only hashed opaque tokens and expire after five minutes. Jobs keep the subject user UUID and pending storage keys only while processing; completion clears both fields.

```ts
export const accountDeletionJobStatus = pgEnum("account_deletion_job_status", ["processing", "completed", "failed"]);

export const accountDeletionAuthorizations = pgTable("account_deletion_authorizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  method: text("method").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({ tokenUnique: uniqueIndex("account_deletion_authorizations_token_unique").on(table.tokenHash) }));

export const accountDeletionJobs = pgTable("account_deletion_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  receiptTokenHash: text("receipt_token_hash").notNull(),
  subjectUserId: uuid("subject_user_id"),
  status: accountDeletionJobStatus("status").notNull().default("processing"),
  storageKeys: jsonb("storage_keys").$type<string[]>().notNull().default([]),
  attempts: integer("attempts").notNull().default(0),
  lastErrorCode: text("last_error_code"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({ receiptUnique: uniqueIndex("account_deletion_jobs_receipt_unique").on(table.receiptTokenHash) }));
```

Mirror the schema in `0016_account_deletion.sql` and append journal index 16 with tag `0016_account_deletion`.

- [ ] **Step 5: Wire and pass contract checks**

Add `test:logic:account-deletion` to `package.json`. Run:

`npm run cloud:contracts:typecheck && npm run test:logic:account-deletion`

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cloud-contracts/src services/wardrobe-api/src/db/schema.ts services/wardrobe-api/migrations scripts/test-account-deletion-contract.ts package.json
git commit -m "v2.1.13-test add account deletion contracts"
```

### Task 2: Server authorization, deletion engine, routes, and retry

**Files:**
- Create: `services/wardrobe-api/src/auth/account-deletion.ts`
- Create: `services/wardrobe-api/src/auth/account-deletion-routes.ts`
- Create: `services/wardrobe-api/src/auth/account-deletion-cleanup.ts`
- Modify: `services/wardrobe-api/src/app.ts`
- Modify: `services/wardrobe-api/src/server.ts`
- Modify: `services/wardrobe-api/src/email/types.ts`
- Test: `services/wardrobe-api/tests/account-deletion.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas and tables, `SessionService.authenticate`, `EmailVerificationService`, `StorageProvider`, existing password verification and WeChat code exchange patterns.
- Produces: `AccountDeletionService.requestEmailCode`, `verify`, `confirm`, `status`, `retryPendingJobs`.

- [ ] **Step 1: Write failing API tests**

Use an in-memory `AccountDeletionStore` and fake storage provider to cover:

```ts
it("offers only identities already bound to the account", async () => { /* GET security remains authoritative */ });
it("issues one-use authorization after valid password", async () => { /* POST verify */ });
it("rejects WeChat verification when the OpenID belongs to another user", async () => { /* 401 */ });
it("disables the user and revokes every session before deletion", async () => { /* confirm */ });
it("reports processing and retries when one storage key fails", async () => { /* 202 then completed */ });
it("does not report completed until storage and database deletion finish", async () => { /* status */ });
it("is idempotent for repeated confirmation and receipt polling", async () => { /* same job */ });
it("rejects expired, reused, cross-user, and cross-device authorizations", async () => { /* 401/409 */ });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm --workspace @wardrobe/wardrobe-api test -- tests/account-deletion.test.ts`

Expected: FAIL because routes and service do not exist.

- [ ] **Step 3: Implement the focused store and service**

Define the service boundary:

```ts
export interface AccountDeletionStore {
  getSecurity(userId: string): Promise<AccountSecuritySnapshot | null>;
  verifyPassword(userId: string, currentPassword: string): Promise<boolean>;
  verifyWechat(userId: string, appId: string, loginCode: string): Promise<boolean>;
  createAuthorization(input: { userId: string; deviceId: string; method: AccountDeletionMethod; tokenHash: string; expiresAt: Date; now: Date }): Promise<void>;
  consumeAuthorizationAndDisable(input: { userId: string; deviceId: string; tokenHash: string; receiptTokenHash: string; now: Date }): Promise<{ jobId: string; storageKeys: string[] }>;
  findJobByReceiptHash(receiptTokenHash: string): Promise<AccountDeletionJobRecord | null>;
  listProcessingJobs(limit: number): Promise<AccountDeletionJobRecord[]>;
  markJobFailure(jobId: string, errorCode: string, now: Date): Promise<void>;
  deleteUserAndComplete(jobId: string, userId: string, now: Date): Promise<void>;
}
```

Use `generateOpaqueToken()` plus `hashToken()`. Authorization TTL is exactly five minutes. `consumeAuthorizationAndDisable` must lock the authorization/user, atomically consume it, set `users.disabledAt`, revoke all device sessions/refresh tokens, collect asset and diagnostic storage keys, and create one job.

- [ ] **Step 4: Implement storage deletion and retry**

`processJob` deletes every unique non-empty storage key through `StorageProvider.delete`. On any failure, retain the full key list, increment attempts, set `lastErrorCode = "storage_delete_failed"`, and leave the account disabled. When all storage deletes succeed, delete diagnostic access audits by case ID, scrub user-linked security-event metadata, delete the user so FK cascades remove business/auth rows, then clear `subjectUserId` and `storageKeys` while marking the job completed.

`retryPendingAccountDeletions()` reads at most 25 jobs per pass and calls `processJob` independently so one failure does not block the rest.

- [ ] **Step 5: Register authenticated routes**

Register:

```text
POST /api/auth/account-deletion/email/request
POST /api/auth/account-deletion/verify
POST /api/auth/account-deletion/confirm
GET  /api/auth/account-deletion/status/:receiptToken
```

Email requests look up the current user's verified bound email and call `EmailVerificationService.sendCode({ purpose: "delete_account", userId })`; clients never post an arbitrary email. WeChat verification accepts only the configured mini-program AppID and compares the exchanged OpenID hash to the current user binding.

- [ ] **Step 6: Register periodic retry**

Call cleanup once at server startup and inside the existing cleanup interval in `server.ts`:

```ts
void retryPendingAccountDeletions().catch(() => {});
```

Do not add another timer.

- [ ] **Step 7: Pass focused and full API checks**

Run:

`npm --workspace @wardrobe/wardrobe-api test -- tests/account-deletion.test.ts`

`npm run cloud:contracts:typecheck && npm run api:typecheck && npm run api:test`

Expected: focused tests and all API tests PASS.

- [ ] **Step 8: Commit**

```bash
git add services/wardrobe-api/src services/wardrobe-api/tests/account-deletion.test.ts
git commit -m "v2.1.13-test implement account deletion service"
```

### Task 3: App API, local clearing, navigation, and three-confirmation UI

**Files:**
- Modify: `src/lib/cloud-auth-api.ts`
- Modify: `src/lib/device-minimax.ts`
- Modify: `src/lib/app-route.ts`
- Modify: `src/components/auth/auth-provider.tsx`
- Modify: `src/components/auth/account-views.tsx`
- Create: `src/components/auth/account-deletion-view.tsx`
- Modify: `src/components/wardrobe-app.tsx`
- Test: `scripts/test-account-deletion-app.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 HTTP contracts.
- Produces: `clearMiniMaxSettings`, App deletion client functions, `account_deletion` route, and `AccountDeletionView`.

- [ ] **Step 1: Write the failing App contract test**

Assert source-level and pure-contract behavior:

```ts
assert.match(accountViewSource, /注销账号/);
assert.match(accountViewSource, /underline/);
assert.doesNotMatch(accountViewSource, /微信身份验证/);
assert.match(deletionViewSource, /我已了解，继续注销/);
assert.match(deletionViewSource, /验证并继续/);
assert.match(deletionViewSource, /永久注销账号/);
assert.match(deletionViewSource, /DELETE_ACCOUNT/);
assert.match(deviceMiniMaxSource, /clearMiniMaxSettings/);
```

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx scripts/test-account-deletion-app.ts`

Expected: FAIL because the view and clearing API do not exist.

- [ ] **Step 3: Add API and local cleanup functions**

Add typed functions in `cloud-auth-api.ts` for email-code request, verification, confirmation, and receipt status. Add:

```ts
export function clearMiniMaxSettings(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(SETTINGS_KEY);
}
```

After server confirmation begins, `AuthProvider.completeAccountDeletion()` clears session storage, refresh state, MiniMax settings, and in-memory authentication state without calling ordinary logout.

- [ ] **Step 4: Add route and bottom-most entry**

Add `{ name: "account_deletion" }` to `AppRoute`, map it to settings, support back navigation, and render `AccountDeletionView` from `wardrobe-app.tsx`.

In `AccountManagementView`, retain the existing logout control and append this final entry after a 24px gap:

```tsx
<button
  type="button"
  onClick={onDeleteAccount}
  className="mx-auto flex min-h-11 items-center bg-transparent px-4 text-sm text-clay underline underline-offset-4"
>
  注销账号
</button>
```

The semantic button preserves accessibility, but there is no visible button background, border, radius, or container.

- [ ] **Step 5: Implement the three stages**

`AccountDeletionView` uses a local state union:

```ts
type DeletionStage = "notice" | "verify-choice" | "verify-email" | "verify-password" | "final" | "processing" | "completed" | "failed";
```

Notice copy, verification copy, final checkbox, processing, success, pending retry, and pre-submit failure must match the approved design document verbatim. App derives methods from account security and renders only email/password. It polls a receipt with bounded backoff while mounted, but server retry continues if the client closes.

- [ ] **Step 6: Pass focused App checks**

Run:

`npm run test:logic:account-deletion-app && npm run test:logic:auth-client-shell && npm run test:logic:app-route && npm run typecheck`

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src scripts/test-account-deletion-app.ts package.json
git commit -m "v2.1.13-test add App account deletion flow"
```

### Task 4: Legal text, version history, local release gate, and Android APK

**Files:**
- Modify: `src/content/legal-content.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `VERSION_HISTORY.md`
- Test: existing website/auth/release checks
- Generate (untracked delivery): `衣橱穿搭助手-v2.1.13-test.apk`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: truthful legal content and signed Android artifact.

- [ ] **Step 1: Update legal content**

Replace statements that the App lacks account deletion with the exact path `设置 → 账号安全 → 注销账号`, the three-stage flow, immediate disablement, deletion scope, non-recoverability, storage-failure status, and lawful-retention exception. Keep the public contact fallback for exceptional inaccessible accounts.

- [ ] **Step 2: Bump version**

Set root package and lockfile version to `2.1.13-test`. Do not hand-edit Android version fields because Gradle derives them.

- [ ] **Step 3: Run local release gate**

Run:

`npm run test:logic:account-deletion && npm run test:logic:account-deletion-app`

`npm run test:logic:website && npm run test:fast && npm run test:component && npm run test:integration:repository && npm run test:api`

`npm run cloud:contracts:typecheck && npm run api:typecheck && npm --prefix apps/wechat-miniprogram run typecheck && npm run build`

Expected: all PASS. Investigate failures; do not weaken unrelated tests.

- [ ] **Step 4: Build and verify the signed APK**

Confirm `android/signing/wardrobe-fixed.jks` and `android/signing/wardrobe-signing.properties` exist, then run `npm run android:apk`. Copy the release output to root as `衣橱穿搭助手-v2.1.13-test.apk` without adding it to Git.

Run metadata/signature verification and install on `wardrobe-test` Android 15 emulator. Cover startup, account security bottom entry, three stages, cancellation at each stage, password/email verification against test API, final deletion, all-session invalidation, failed old login, re-registration without old data, Android back priority, 390px portrait screenshot, and crash log scan.

- [ ] **Step 5: Record evidence and commit**

Add the exact commands, emulator, Android version, APK metadata, signer CN, tested paths, deletion result, log summary, and uncovered live risks to the top of `VERSION_HISTORY.md`.

```bash
git add src/content/legal-content.tsx package.json package-lock.json VERSION_HISTORY.md
git commit -m "v2.1.13-test validate App account deletion"
```

### Task 5: Integrate verified App/service work into local main

**Files:**
- No new source files; Git integration only.

**Interfaces:**
- Produces: local `main` containing the verified shared contracts, API, App, legal text, and design/plan history.

- [ ] **Step 1: Confirm task worktree closure**

Run `git status --short`, `git log --oneline main..HEAD`, and focused validation once more. Expected: clean task worktree and only task commits ahead of `main`.

- [ ] **Step 2: Confirm formal main integration directory is safe**

In the formal main directory run `git branch --show-current`, `git status --short`, and `git worktree list`. Proceed only if branch is `main`, no tracked/staged edits or Git operation exists, and no other integration is active. Preserve known untracked files.

- [ ] **Step 3: Fast-forward local main**

Run `git merge --ff-only codex/account-deletion-design` from the formal main directory. Do not push until mini-program integration and final verification are complete.

### Task 6: Mini-program service, page, dynamic verification, and local clearing

**Files:**
- Modify: `apps/wechat-miniprogram/app.json`
- Modify: `apps/wechat-miniprogram/services/auth.ts`
- Modify: `apps/wechat-miniprogram/services/ai.ts`
- Modify: `apps/wechat-miniprogram/pages/settings/account/index.ts`
- Modify: `apps/wechat-miniprogram/pages/settings/account/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/settings/account/index.wxss`
- Create: `apps/wechat-miniprogram/pages/settings/account-deletion/index.json`
- Create: `apps/wechat-miniprogram/pages/settings/account-deletion/index.ts`
- Create: `apps/wechat-miniprogram/pages/settings/account-deletion/index.wxml`
- Create: `apps/wechat-miniprogram/pages/settings/account-deletion/index.wxss`
- Test: `scripts/test-account-deletion-miniprogram.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: shared contracts and server routes now present on local `main`.
- Produces: mini-program three-stage deletion page and `clearMiniMaxSettings` for WeChat storage.

- [ ] **Step 1: Create an isolated mini-program task branch**

From a clean, up-to-date `wechat/miniprogram`, create `codex/wechat-account-deletion` in a new sibling worktree, then merge latest local `main` into it. Resolve only genuine mini-program branch differences; do not develop in the formal mini integration directory.

- [ ] **Step 2: Write the failing mini-program contract test**

Assert the page is registered, account page ends with red underlined text, and deletion page contains all three method labels plus all three confirmation actions. Also assert WeChat verification calls `wx.login` and local AI settings expose a clearing function.

- [ ] **Step 3: Run and verify failure**

Run: `npx tsx scripts/test-account-deletion-miniprogram.ts`

Expected: FAIL because the page is not registered.

- [ ] **Step 4: Implement typed auth calls and local cleanup**

Add request functions equivalent to the App. WeChat verification obtains a fresh login code and posts:

```ts
{ method: "wechat", loginCode, appId: WECHAT_MINIPROGRAM_APP_ID }
```

Add `clearMiniMaxSettings()` that removes `wardrobe-miniprogram-minimax-settings`. On confirmed deletion, clear session and MiniMax settings before redirecting to login.

- [ ] **Step 5: Add bottom entry and page**

Append a tappable `<text>` or unstyled `<view role="button">注销账号</view>` after logout, centered with red underlined text and a 44px hit area. The deletion page mirrors approved copy and stages, dynamically showing WeChat/email/password only when bound. `wx.login` verification remains inside the mini-program.

- [ ] **Step 6: Pass static and type checks**

Run:

`npm run test:logic:account-deletion-miniprogram`

`npm --prefix apps/wechat-miniprogram run typecheck`

`npm run catalog:miniprogram:check && npm run test:logic:miniprogram-catalog`

Expected: all PASS.

- [ ] **Step 7: Validate in WeChat DevTools**

Open the task worktree project with the repository script, refresh the simulator, compile the new page, open Account Security, and verify the bottom entry, notice, dynamic choices, final sheet, cancel/back paths, narrow-screen wrapping, and processing/error states. Real `wx.login` must be tested only in a valid logged-in WeChat environment; otherwise record it as an explicit live risk.

- [ ] **Step 8: Update history and commit**

Add mini-program files, tests, package script, and a new top `VERSION_HISTORY.md` record with exact DevTools results.

```bash
git commit -m "v2.1.13-test add mini-program account deletion"
```

### Task 7: Final dual-baseline integration and delivery

**Files:**
- No new feature files; integration evidence may update `VERSION_HISTORY.md` if final results differ.

**Interfaces:**
- Produces: local `main` and `wechat/miniprogram` verified baselines, then matching GitHub backup if authorized by the existing publish workflow.

- [ ] **Step 1: Integrate mini-program branch**

In the formal mini integration directory, confirm `wechat/miniprogram`, clean tracked state, and no active integration. Fast-forward if possible; otherwise merge `codex/wechat-account-deletion` without rewriting either baseline.

- [ ] **Step 2: Run cross-platform final gate**

From formal main run shared contracts, API, App deletion tests, full typecheck/build, and APK metadata/signature checks. From formal mini run mini deletion test, mini typecheck, catalog checks, and WeChat DevTools refresh/compile.

- [ ] **Step 3: Verify remote and local commit topology**

Confirm local `main` contains App/service commits and local `wechat/miniprogram` contains latest `main` plus mini changes. Push each baseline only after all final checks pass; never force push.

- [ ] **Step 4: Final handoff**

Report both baseline commit hashes, APK absolute path/size/SHA-256/version/signer, App emulator results, mini DevTools results, whether real WeChat verification was covered, production deployment status, and any unrelated untracked files left untouched.

## Plan Self-Review

- Spec coverage: entry placement, exact three stages, dynamic methods, App/mini difference, immediate disablement, session revocation, storage/database deletion, pending honesty, local key clearing, legal text, Android and WeChat validation are each assigned to a task.
- Placeholder scan: no implementation placeholder or deferred code path remains; live WeChat and production deployment are explicit validation boundaries, not missing implementation.
- Type consistency: `AccountDeletionMethod`, authorization token, confirmation text, receipt token, and `processing | completed | failed` statuses are identical across contracts, server, App, and mini-program tasks.
