# Wardora Compliance Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a public Wardora compliance website from the existing Next.js project while preserving the default App/Android root entry and the existing API deployment.

**Architecture:** Add a build-time `app`/`website` surface switch inside the current App Router project. The default build keeps `AppRoot` at `/` and `out` for Capacitor; the website build selects the public homepage and atomically moves its static export to `out-website`. Public pages share typed site configuration, legal content, navigation, footer, and website-only styling.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Lucide React, static export, Playwright, existing Node/tsx test scripts.

## Global Constraints

- Do not change `api.zhengfangapps.cloud`, server API routes, Android native behavior, or WeChat miniprogram code.
- Do not invent an operator name, public email address, ICP number, police record number, licence, or certification.
- Keep `npm run build` as the default App build and `out` as Capacitor's `webDir`.
- Produce website output at `out-website` without adding a new dependency or database access.
- Do not modify production DNS or submit any filing application.
- The final branch must contain exactly one task commit named `feat: add Wardora compliance website`.

---

### Task 1: Build Target and Typed Public Configuration

**Files:**
- Create: `src/lib/site-build-target.ts`
- Create: `src/lib/site-config.ts`
- Create: `scripts/build-website.mjs`
- Create: `scripts/test-wardora-compliance-site.ts`
- Create: `scripts/verify-wardora-website.ts`
- Modify: `scripts/build-web-with-info.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `getSiteBuildTarget(): "app" | "website"`, `isWebsiteBuild(): boolean`, `siteConfig`, and `siteLinks`.
- Produces: `npm run build:website` and `npm run test:logic:website`.

- [x] **Step 1: Write failing source-contract tests**

Add assertions that require the typed config fields, honest missing-value labels, build target helper, dedicated build script, default build target, and package scripts. The test must reject empty `href`, placeholder numbers disguised as real filings, and any change to Capacitor `webDir`.

- [x] **Step 2: Run the contract test and confirm failure**

Run: `npx tsx scripts/test-wardora-compliance-site.ts`

Expected: FAIL because the site modules and package scripts do not exist.

- [x] **Step 3: Implement build target and site configuration**

Use the exact build target union:

```ts
export type SiteBuildTarget = "app" | "website";

export function getSiteBuildTarget(): SiteBuildTarget {
  return process.env.WARDORA_BUILD_TARGET === "website" ? "website" : "app";
}
```

Read public values from `NEXT_PUBLIC_WARDORA_SITE_*` variables, trim them, validate email/URL before producing links, and expose honest labels when missing. Keep `https://zhengfangapps.cloud` as the default canonical domain and `https://beian.miit.gov.cn/` as the ICP query destination only when a real ICP number exists.

- [x] **Step 4: Implement isolated website build output**

Extend `build-web-with-info.mjs` so the caller can select `WARDORA_BUILD_TARGET`; add `build-website.mjs` to preserve any existing `out`, run a website build, rename the generated website export to `out-website`, and restore the pre-existing App output even when the website build fails. Use Node filesystem APIs and temporary sibling directories, never shell deletion commands.

- [x] **Step 5: Run the contract test**

Run: `npm run test:logic:website`

Expected: PASS with all build/config contracts satisfied.

### Task 2: Shared Website Shell and Visual System

**Files:**
- Create: `src/components/site/site-header.tsx`
- Create: `src/components/site/site-footer.tsx`
- Create: `src/components/site/site-layout.tsx`
- Create: `src/components/site/site-mark.tsx`
- Create: `src/app/site.css`

**Interfaces:**
- Consumes: `siteConfig` and `siteLinks` from Task 1.
- Produces: `SiteLayout`, `SiteHeader`, `SiteFooter`, and `SiteMark`.

- [x] **Step 1: Extend contract tests for shell semantics**

Assert the header exposes all five navigation destinations, the mobile control uses `aria-expanded`, the footer renders the four compliance links, and conditional contact/filing links never emit empty URLs.

- [x] **Step 2: Implement the accessible responsive shell**

Build a small client-only header for menu state and server-rendered footer/layout components. Reuse existing color variables and add `.site-*` classes scoped to website elements. Use a 1120px content container, 760px reading column, 20px mobile gutters, 68px desktop header, visible focus styles, 44px controls, and reduced-motion guards.

- [x] **Step 3: Run type and contract checks**

Run: `npm run typecheck && npm run test:logic:website`

Expected: both commands PASS.

### Task 3: Homepage, Metadata, Robots, Sitemap, Manifest, and 404

**Files:**
- Create: `src/components/site/site-home.tsx`
- Create: `src/components/build-home.tsx`
- Create: `src/components/site/build-home-website.tsx`
- Modify: `src/app/page.tsx`
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `src/app/layout.tsx`
- Create: `src/app/not-found.tsx`
- Create: `src/app/robots.ts`
- Create: `src/app/sitemap.ts`
- Create: `public/wardora.webmanifest`

**Interfaces:**
- Consumes: `isWebsiteBuild`, `siteConfig`, `SiteLayout`.
- Produces: website root content only for the website target while retaining `AppRoot` for the default target.

- [x] **Step 1: Add route and copy contracts**

Assert the homepage contains the exact title, subtitle, description, six required functions, service-boundary statement, two required calls to action, and no app-store download control.

- [x] **Step 2: Implement the website homepage**

Build the editorial wardrobe-record hero, six feature cards, service-boundary panel, and compliance links. Use semantic sections and decorative elements marked `aria-hidden="true"`. Keep motion CSS-only and optional.

- [x] **Step 3: Switch root output at build time**

In `src/app/page.tsx`, return `SiteHome` only when `isWebsiteBuild()` is true; otherwise return the existing `<AppRoot />`. In `layout.tsx`, emit Wardora website metadata and omit App-only service-worker/motion wrappers for website builds while preserving the current App layout path.

- [x] **Step 4: Add static discovery files and 404**

Generate canonical robots and sitemap entries from `siteConfig.domain`; add a separate Wardora website manifest at `/wardora.webmanifest` and custom 404. Keep the existing App manifest unchanged and all website URLs HTTPS and public-only.

- [x] **Step 5: Run checks and both builds**

Run: `npm run typecheck && npm run test:logic:website && npm run build && npm run build:website`

Expected: App build exports `/` with App metadata to `out`; website build exports Wardora homepage, robots, sitemap, manifest, and 404 to `out-website`; the pre-existing `out` remains the App build.

### Task 4: Legal, Account Deletion, and Contact Pages

**Files:**
- Create: `src/content/legal-content.tsx`
- Create: `src/components/site/legal-page.tsx`
- Create: `src/app/privacy/page.tsx`
- Create: `src/app/terms/page.tsx`
- Create: `src/app/account-deletion/page.tsx`
- Create: `src/app/contact/page.tsx`
- Modify: `src/app/legal/privacy/page.tsx`
- Modify: `src/app/legal/terms/page.tsx`
- Create: `app/privacy/page.tsx`
- Create: `app/terms/page.tsx`
- Create: `app/account-deletion/page.tsx`
- Create: `app/contact/page.tsx`

**Interfaces:**
- Consumes: `siteConfig`, `SiteLayout`.
- Produces: shared `privacySections`, `termsSections`, `accountDeletionSections`, and the four public pages.

- [x] **Step 1: Add legal chapter contracts**

Assert all 15 privacy chapters, 15 terms chapters, seven account-deletion topics, six contact categories, truthful cloud/image/AI disclosures, and absence of the nonexistent App deletion path.

- [x] **Step 2: Implement shared factual legal content**

Create structured sections that disclose server-authoritative data, account identifiers, images, wardrobe entities, MiniMax requests/results, local/session storage, diagnostics, Tencent SES, WeChat interfaces, Capacitor capabilities, user rights, minors, updates, and contact status. Mark operator, retention, SDK inventory, and contact facts for pre-launch review without using placeholder legal identities.

- [x] **Step 3: Implement public pages and App reuse**

Render public pages through the website shell and reading layout. Adapt the existing App legal routes to the same shared sections while retaining their App-specific back-navigation component.

- [x] **Step 4: Run legal and type checks**

Run: `npm run typecheck && npm run test:logic:website && npm run test:logic:auth-client-shell && npm run test:logic:app-email-auth-flow`

Expected: all commands PASS and existing auth legal links remain valid.

### Task 5: Deployment Documentation and Full Verification

**Files:**
- Create: `docs/deployment/wardora-website.md`
- Modify: `deploy/caddy/Caddyfile`
- Modify: `VERSION_HISTORY.md`
- Modify: `docs/superpowers/plans/2026-07-10-wardora-compliance-website.md`

**Interfaces:**
- Consumes: `out-website`, site environment variables, current Caddy API block.
- Produces: a deployable static-site Caddy example and evidence-backed delivery record.

- [x] **Step 1: Document deployment and safe Caddy separation**

Add a website site block for `zhengfangapps.cloud` that serves a configurable static root and uses `try_files {path} {path}/ /404.html`; add a `www` redirect block. Leave the existing `api.zhengfangapps.cloud` block behavior unchanged. Document DNS A/AAAA or platform records, `www` CNAME, automatic HTTPS, environment variables, build/publish commands, validation commands, and rollback.

- [x] **Step 2: Run project verification**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run test:logic:website
npm run build
npm run build:website
git diff --check
```

Expected: all supported commands pass; if `npm run lint` fails because `next lint` is unsupported, record the real error and continue with typecheck/test/build evidence.

- [x] **Step 3: Run responsive browser verification**

Serve `out-website` locally and use Playwright at 375, 390, 430, 768, 1024, and 1440 pixels. Check all public routes, direct refresh, mobile navigation, footer links, 404, zero horizontal overflow, readable filing status, and no console errors. Capture representative desktop and mobile screenshots into ignored test output only.

- [x] **Step 4: Scan public output and verify App isolation**

Search `out-website` for secret-key names, database URLs, internal filesystem paths, private IPs, `undefined`, empty links, and fabricated filing numbers. Confirm `out/index.html` still contains the App identity and `out-website/index.html` contains Wardora website identity. Confirm `git diff` contains no server route, Android native, or miniprogram changes.

- [x] **Step 5: Finalize version history and the single commit**

Replace the design-only version-history entry with the complete file list, exact command outcomes, responsive evidence, and remaining legal/configuration risks. Stage only task files and amend the existing task commit without changing its required message:

```bash
git add VERSION_HISTORY.md deploy/caddy/Caddyfile docs/deployment/wardora-website.md docs/superpowers/plans/2026-07-10-wardora-compliance-website.md docs/superpowers/specs/2026-07-10-wardora-compliance-website-design.md package.json public/wardora.webmanifest scripts/build-web-with-info.mjs scripts/build-website.mjs scripts/test-wardora-compliance-site.ts src/app src/components/site src/content/legal-content.tsx src/lib/site-build-target.ts src/lib/site-config.ts
git commit --amend --no-edit
```

Expected: branch has one task commit named `feat: add Wardora compliance website`, working tree is clean, and no unrelated files are staged.
