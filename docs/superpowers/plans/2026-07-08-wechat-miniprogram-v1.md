# WeChat Mini Program V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full native WeChat Mini Program version while sharing the existing wardrobe server, workspace contracts, assets, auth session model, and future AI proxy with Android.

**Architecture:** Add `apps/wechat-miniprogram/` as an isolated native mini program. Reuse `packages/cloud-contracts` and existing `/api/workspace/*` / `/api/assets/*`; only add new APIs for WeChat phone login and AI proxy.

**Tech Stack:** Native WeChat Mini Program, TypeScript, WXML, WXSS, `wechatide` CLI, Fastify, PostgreSQL, existing `@wardrobe/cloud-contracts`.

## Global Constraints

- Worktree: `/Users/fangzheng/Documents/wardrobe-wechat-miniprogram`.
- Branch: `feature/wechat-miniprogram-v1`.
- Do not modify unrelated Web/Android runtime code unless assigned to the Android AI lane.
- Do not add a cross-platform UI framework.
- Do not add duplicate business REST endpoints for wardrobe/outfit/wishlist.
- Do not store business data or images in persistent client cache.
- Do not upload, deploy, run cloud writes, run production migration, or build Android APK without explicit user approval.

---

### Task 1: Platform And `wechatide` Tooling

**Files:**
- Create: `apps/wechat-miniprogram/scripts/wechatide-help.mjs`
- Create: `apps/wechat-miniprogram/scripts/wechatide-open.mjs`
- Create: `apps/wechat-miniprogram/scripts/wechatide-preview.mjs`
- Create: `apps/wechat-miniprogram/scripts/wechatide-upload.mjs`
- Create/modify: `apps/wechat-miniprogram/package.json`
- Create: `docs/wechat-mini/ide-setup.md`
- Create: `docs/wechat-mini/platform-setup-checklist.md`

**Interfaces:**
- Produces npm scripts `wechatide:help`, `wechatide:open`, `wechatide:preview`, `wechatide:upload`.

- [ ] Implement scripts with `child_process.spawn`.
- [ ] Add package scripts.
- [ ] Run `npm --prefix apps/wechat-miniprogram run wechatide:help`.
- [ ] Record unavailable login/AppID issues as setup checklist items.

### Task 2: Native Mini Program Skeleton

**Files:**
- Create: `apps/wechat-miniprogram/app.ts`
- Create: `apps/wechat-miniprogram/app.json`
- Create: `apps/wechat-miniprogram/app.wxss`
- Create: `apps/wechat-miniprogram/project.config.json`
- Create: `apps/wechat-miniprogram/project.private.config.json.example`
- Create: `apps/wechat-miniprogram/sitemap.json`
- Create: `apps/wechat-miniprogram/tsconfig.json`
- Create: page placeholders under `apps/wechat-miniprogram/pages/**`
- Create: `apps/wechat-miniprogram/services/http.ts`
- Create: `apps/wechat-miniprogram/stores/session.ts`
- Create: `apps/wechat-miniprogram/utils/route.ts`

**Interfaces:**
- Produces route constants and empty pages for all full-version app sections.

- [ ] Create the full page tree from the V6 task document.
- [ ] Add strict TypeScript config.
- [ ] Add simple page modules that compile without backend access.
- [ ] Run `npx tsc -p apps/wechat-miniprogram/tsconfig.json --noEmit`.

### Task 3: Mini Program UI System

**Files:**
- Create: `docs/wechat-mini/ui-spec-digest.md`
- Create: `docs/wechat-mini/ui-feasibility.md`
- Create: `docs/wechat-mini/icon-license.md`
- Create: `apps/wechat-miniprogram/styles/*.wxss`
- Create: `apps/wechat-miniprogram/components/ui/**`
- Create: `apps/wechat-miniprogram/custom-tab-bar/**`

**Interfaces:**
- Produces UI primitives used by mini program pages.

- [ ] Digest `docs/designs/wardrobe-ui-spec.md`.
- [ ] Document mini program feasibility and fallbacks.
- [ ] Implement tokens, glass, layout, typography, motion.
- [ ] Implement button, card, nav bar, sheet, toast, skeleton, empty state, icon.
- [ ] Implement custom tab bar using the UI tokens.

### Task 4: WeChat Phone Login Backend

**Files:**
- Create/modify: `packages/cloud-contracts/src/auth/contracts.ts`
- Modify: `packages/cloud-contracts/src/index.ts`
- Create/modify: `services/wardrobe-api/src/auth/wechat-phone-login.ts`
- Modify: `services/wardrobe-api/src/auth/routes.ts`
- Modify: `services/wardrobe-api/src/db/schema.ts`
- Create migration under `services/wardrobe-api/migrations/`
- Create tests under `services/wardrobe-api/tests/`

**Interfaces:**
- Produces `POST /api/auth/wechat/phone-login` and shared contract types.

- [ ] Add request/response schemas to cloud contracts.
- [ ] Add DB structures for WeChat account binding using hashed identifiers.
- [ ] Implement service with injectable WeChat client for tests.
- [ ] Register route and error handling.
- [ ] Add tests for existing phone login, new user registration, cancelled/expired code, and risk collision.

### Task 5: Integration And Validation

**Files:**
- Modify: `VERSION_HISTORY.md`
- Modify: `docs/wechat-mini/execution-board.md`
- Create: `docs/wechat-mini/qa-report.md`

**Interfaces:**
- Consumes outputs from Tasks 1-4.

- [ ] Review subagent diffs for path ownership.
- [ ] Resolve integration conflicts.
- [ ] Run focused TypeScript and API tests.
- [ ] Record risk gate and validation in version history.
- [ ] Commit the integrated batch.

