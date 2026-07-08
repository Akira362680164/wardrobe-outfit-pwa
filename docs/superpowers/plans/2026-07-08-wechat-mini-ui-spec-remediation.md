# WeChat Mini Program UI Spec Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the WeChat Mini Program UI back into compliance with `wardrobe-ui-spec.html` and the `v03-alpha` real business-flow screenshots without inventing colors, spacing, radii, navigation structure, or page layouts.

**Architecture:** First lock a small shared UI foundation from the existing UI spec, then let page-focused subagents repair disjoint page groups against that foundation. Final QA is screenshot-based in WeChat DevTools, not code-only review.

**Tech Stack:** Native WeChat Mini Program, TypeScript, WXML, WXSS, existing `wechatide` CLI, existing mini-program UI components and SVG icon assets.

## Global Constraints

- Worktree: `/Users/fangzheng/Documents/wardrobe-wechat-miniprogram`.
- Source UI spec: `/Users/fangzheng/Documents/衣柜识别+根据要去的地方和活动自动搭配穿搭的APP/docs/designs/wardrobe-ui-spec.html`.
- Source UI spec Markdown: `/Users/fangzheng/Documents/衣柜识别+根据要去的地方和活动自动搭配穿搭的APP/docs/designs/wardrobe-ui-spec.md`.
- Real screenshots: `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/`.
- Do not modify backend server code: `services/wardrobe-api/**`, `packages/cloud-contracts/**`, migrations.
- Do not invent colors. Use only UI spec tokens: `ink`, `paper`, `mist`, `surface`, `primary`, `success`, `ai`, `shopping`, `danger`, `line`, `muted`, `background.appAmbient`.
- Do not invent radii. Use only UI spec radii: first-level card, second-level card, normal control, bottom menu, thumbnail, explicit FAB.
- Do not invent glass. Use only UI spec glass targets: top glass, bottom glass, toast glass, sheet.
- Do not place custom action buttons in the top-right WeChat capsule area.
- Bottom tab bar has exactly 4 items from the spec: `衣橱 / 套装 / 种草 / 设置`.
- If the UI spec does not define an element, mark it as `规范缺口` in the report instead of inventing a style.
- Update `VERSION_HISTORY.md` only after the integrated patch is ready; do not record partial subagent drafts as shipped work.
- Every coding subagent must state changed files and validation commands in its final message.

---

## Current Dirty Baseline Notice

The worktree currently contains uncommitted experimental mini-program UI edits from the login/tab/FAB discussion. Before executing this plan, the coordinator must decide whether to keep, rewrite, or discard those edits as part of Task 1. No subagent may assume the current dirty UI is correct.

---

### Task 1: Coordinator Baseline And Spec Lock

**Owner:** main agent, no subagent write access.

**Files:**
- Read: `/Users/fangzheng/Documents/衣柜识别+根据要去的地方和活动自动搭配穿搭的APP/docs/designs/wardrobe-ui-spec.html`
- Read: `/Users/fangzheng/Documents/衣柜识别+根据要去的地方和活动自动搭配穿搭的APP/docs/designs/wardrobe-ui-spec.md`
- Read: `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/live-capture-manifest.json`
- Read: `apps/wechat-miniprogram/**`
- Do not modify files in this task unless cleaning the current dirty UI baseline is explicitly approved.

**Produces:**
- A locked implementation checklist for page workers.
- A decision on the current dirty UI edits: keep/rewrite/discard.

- [ ] Run `git status --short`.
- [ ] Run `git diff -- apps/wechat-miniprogram VERSION_HISTORY.md`.
- [ ] Extract the UI spec facts workers must use:
  - `background.appAmbient`
  - color tokens and uses
  - first-level card radius
  - second-level card radius
  - normal control radius
  - bottom nav glass
  - top glass
  - toast glass
  - 4-tab app shell
  - page structure references from `v03-alpha` screenshots
- [ ] Decide the baseline for current uncommitted UI edits.
- [ ] If keeping any dirty edit, rewrite it to the spec before page subagents start.
- [ ] Confirm backend diff is zero:

```bash
git diff -- services/wardrobe-api packages/cloud-contracts | wc -l
```

Expected: `0`.

---

### Task 2: UI Foundation Subagent

**Owner:** one worker subagent. This task must complete before page subagents start.

**Files:**
- Modify: `apps/wechat-miniprogram/styles/tokens.wxss`
- Modify: `apps/wechat-miniprogram/styles/glass.wxss`
- Modify: `apps/wechat-miniprogram/styles/layout.wxss`
- Modify: `apps/wechat-miniprogram/app.wxss`
- Modify: `apps/wechat-miniprogram/components/ui/button/index.wxss`
- Modify: `apps/wechat-miniprogram/components/ui/card/index.wxss`
- Modify: `apps/wechat-miniprogram/components/ui/icon-button/index.wxss`
- Modify: `apps/wechat-miniprogram/components/ui/input/index.wxss`
- Modify: `apps/wechat-miniprogram/custom-tab-bar/index.ts`
- Modify: `apps/wechat-miniprogram/custom-tab-bar/index.wxml`
- Modify: `apps/wechat-miniprogram/custom-tab-bar/index.wxss`
- Modify: `apps/wechat-miniprogram/app.json`

**Interfaces:**
- Produces shared classes/tokens used by every page:
  - `.page-shell`
  - `.top-glass`
  - `.surface-panel`
  - `.glass-panel`
  - `.primary-button`
  - `.secondary-button`
  - `.content-fab`
  - `.bottom-glass-bar`
  - 4-item custom tab bar

- [ ] Replace or confirm token values match the spec exactly:
  - `--color-ink: #1d2228`
  - `--color-paper: #fbfbf8`
  - `--color-mist: #f4f5f3`
  - `--color-surface: #fffffc`
  - `--color-primary: #355c7d`
  - `--color-success: #5f7058`
  - `--color-ai: #b97155`
  - `--color-shopping: #8c4a62`
  - `--color-danger: #dc2626`
  - `--app-ambient` from `background.appAmbient`
- [ ] Replace any page-global pure-white or custom gradient background with `--app-ambient`.
- [ ] Define shared radii only from the spec:
  - first-level card: `56rpx`
  - second-level card: `36rpx` to `40rpx`
  - normal control: `24rpx` to `28rpx`
  - bottom menu: `52rpx`
  - thumbnail: `16rpx` to `24rpx`
  - FAB: `50%`
- [ ] Implement the custom tab bar with exactly 4 tabs:
  - `衣橱` -> `/pages/wardrobe/index/index`
  - `套装` -> `/pages/outfits/index/index`
  - `种草` -> `/pages/wishlist/index/index`
  - `设置` -> `/pages/settings/index/index`
- [ ] Remove any `首页` or `添加` tab from `app.json` and `custom-tab-bar`.
- [ ] Keep `pages/intake/camera/index` as a normal page, not a tab.
- [ ] Add top-right capsule avoidance into shared top/page shell classes. Do not put custom buttons in that space.
- [ ] Validate:

```bash
npm --prefix apps/wechat-miniprogram run typecheck
wechatide -c wardrobe-mini -t compile_wxml --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path custom-tab-bar/index.wxml
wechatide -c wardrobe-mini -t compile_wxss --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path custom-tab-bar/index.wxss
```

Expected: all pass.

---

### Task 3: Login And Account Entry Subagent

**Owner:** one worker subagent after Task 2.

**Files:**
- Modify: `apps/wechat-miniprogram/pages/login/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/login/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/login/index.ts`
- Modify: `apps/wechat-miniprogram/pages/login/password/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/login/password/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/login/password/index.ts`

**Reference screenshots and spec sections:**
- `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/auth_login_390_top.png`
- `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/auth_register_390_top.png`
- UI spec sections: `2.1 颜色`, `2.2 圆角`, `2.3 Glass`, `16 产品视觉方案实操`

- [ ] Keep the official primary action text exactly `微信认证登录`.
- [ ] Keep account/password entry as a secondary action; the password form remains on its own page.
- [ ] Use only tokenized colors and radii from Task 2.
- [ ] Align login cards to the real login screenshot structure: centered card, surface/glass background, tokenized inputs, primary button.
- [ ] Do not use custom colors for warning/error states beyond `danger`.
- [ ] Validate:

```bash
npm --prefix apps/wechat-miniprogram run typecheck
wechatide -c wardrobe-mini -t compile_wxml --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path pages/login/index.wxml
wechatide -c wardrobe-mini -t compile_wxss --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path pages/login/index.wxss
wechatide -c wardrobe-mini -t compile_wxml --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path pages/login/password/index.wxml
wechatide -c wardrobe-mini -t compile_wxss --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path pages/login/password/index.wxss
```

Expected: all pass.

---

### Task 4: Wardrobe Main Page Subagent

**Owner:** one worker subagent after Task 2.

**Files:**
- Modify: `apps/wechat-miniprogram/pages/wardrobe/index/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/wardrobe/index/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/wardrobe/index/index.ts`
- Modify only if required for navigation: `apps/wechat-miniprogram/pages/home/index.ts`

**Reference screenshots and spec sections:**
- `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/wardrobe_home_390_top.png`
- UI spec sections: `4 App Shell`, `7.2 瀑布流与多选`, `11 通知 Toast`, `16 产品视觉方案实操`

- [ ] Treat `wardrobe/index` as the first primary tab. Do not preserve a separate `home` visual as a primary app surface.
- [ ] Rebuild the page structure to match wardrobe real screenshot:
  - top filter/search/stat action row
  - category chips
  - 2-column item grid
  - bottom nav
  - global create FAB if needed
- [ ] Use `CatalogWaterfallGrid` behavior in mini-program form: fixed card image area, name/meta truncation, tokenized selected state.
- [ ] Use `primary` for selected chips and active states.
- [ ] Use `surface` card backgrounds and `line` borders.
- [ ] Validate WXML/WXSS compile and page open:

```bash
wechatide -c wardrobe-mini -t compile_wxml --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path pages/wardrobe/index/index.wxml
wechatide -c wardrobe-mini -t compile_wxss --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path pages/wardrobe/index/index.wxss
wechatide -c wardrobe-mini -t simulator_open_page --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --page pages/wardrobe/index/index
```

Expected: all pass; screenshot shows no custom control in WeChat capsule area.

---

### Task 5: Outfit Main And Calendar Subagent

**Owner:** one worker subagent after Task 2.

**Files:**
- Modify: `apps/wechat-miniprogram/pages/outfits/index/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/outfits/index/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/outfits/index/index.ts`
- Modify: `apps/wechat-miniprogram/pages/outfits/calendar/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/outfits/calendar/index.wxss`

**Reference screenshots and spec sections:**
- `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/outfit_home_390_top.png`
- `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/outfit_calendar_390_top.png`
- UI spec sections: `4 App Shell`, `5 Route`, `16 产品视觉方案实操`

- [ ] Rebuild outfit home to match the real screenshot:
  - title `套装`
  - calendar/plan controls
  - weekly outfit card
  - filter chips
  - outfit card with image collage
  - bottom nav
- [ ] New outfit action belongs in content area/FAB, never page top-right.
- [ ] Use `primary`, not `ink`, for main actions.
- [ ] Use normal-control radius for buttons except explicit FAB.
- [ ] Replace placeholder calendar page with the real screenshot structure or mark missing API data as a tokenized empty state.
- [ ] Validate:

```bash
wechatide -c wardrobe-mini -t compile_wxml --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path pages/outfits/index/index.wxml
wechatide -c wardrobe-mini -t compile_wxss --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path pages/outfits/index/index.wxss
wechatide -c wardrobe-mini -t compile_wxml --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path pages/outfits/calendar/index.wxml
wechatide -c wardrobe-mini -t compile_wxss --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path pages/outfits/calendar/index.wxss
```

Expected: all pass; screenshot shows 4-tab bottom nav and no top-right custom action.

---

### Task 6: Wishlist Main And Edit Subagent

**Owner:** one worker subagent after Task 2.

**Files:**
- Modify: `apps/wechat-miniprogram/pages/wishlist/index/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/wishlist/index/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/wishlist/index/index.ts`
- Modify: `apps/wechat-miniprogram/pages/wishlist/edit/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/wishlist/edit/index.wxss`

**Reference screenshots and spec sections:**
- `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/wishlist_home_390_top.png`
- UI spec sections: `4 App Shell`, `8 领域 UI 映射`, `16 产品视觉方案实操`

- [ ] Rebuild wishlist home to match real screenshot:
  - title `种草`
  - item count/subtitle
  - status filter chips
  - product card grid
  - bottom nav
  - content-area new action, not top-right
- [ ] Use `shopping` only for wishlist semantic accents. Main buttons and selected nav remain `primary`.
- [ ] Use product image cards with first-level card radius and thumbnail rules.
- [ ] Edit page must use bottom glass save bar and normal-control-radius inputs.
- [ ] Validate:

```bash
wechatide -c wardrobe-mini -t compile_wxml --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path pages/wishlist/index/index.wxml
wechatide -c wardrobe-mini -t compile_wxss --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path pages/wishlist/index/index.wxss
wechatide -c wardrobe-mini -t compile_wxml --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path pages/wishlist/edit/index.wxml
wechatide -c wardrobe-mini -t compile_wxss --project /Users/fangzheng/Documents/wardrobe-wechat-miniprogram/apps/wechat-miniprogram --file-path pages/wishlist/edit/index.wxss
```

Expected: all pass.

---

### Task 7: Settings Family Subagent

**Owner:** one worker subagent after Task 2.

**Files:**
- Modify: `apps/wechat-miniprogram/pages/settings/index/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/settings/index/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/settings/account/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/settings/account/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/settings/ai-key/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/settings/ai-key/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/settings/privacy/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/settings/privacy/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/settings/diagnostics/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/settings/diagnostics/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/settings/about/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/settings/about/index.wxss`

**Reference screenshots and spec sections:**
- `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/settings_home_390_top.png`
- UI spec sections: `4 App Shell`, `10 AI 与系统状态`, `16 产品视觉方案实操`

- [ ] Rebuild settings home with:
  - MiniMax/AI warning bar using `ai` tint
  - first-level grouped cards
  - row action buttons using normal-control radius
  - bottom nav
- [ ] Subpages use `AppSubPageTopBar` equivalent and no bottom nav unless they are primary settings home.
- [ ] Do not use black/ink as the primary action color.
- [ ] Mark backend-unavailable actions with explicit disabled state and copy from current business rules.
- [ ] Validate every settings WXML/WXSS file with `compile_wxml` and `compile_wxss`.

Expected: all pass.

---

### Task 8: Intake Flow Subagent

**Owner:** one worker subagent after Task 2.

**Files:**
- Modify: `apps/wechat-miniprogram/pages/intake/camera/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/intake/camera/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/intake/review/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/intake/review/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/intake/result/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/intake/result/index.wxss`

**Reference screenshots and spec sections:**
- `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/intake_single_step1_empty_390_top.png`
- `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/intake_single_step1_imported_390_top.png`
- `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/intake_single_confirm_390_top.png`
- `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/intake_single_confirm_390_bottom.png`
- UI spec section: `9 录入流程状态机`

- [ ] Implement visible two-step flow only:
  - Step 1: `选择照片`
  - Step 2: `确认信息`
- [ ] Use progress bar primary + mist track.
- [ ] Use bottom glass action bar.
- [ ] Buttons use result-oriented copy from the spec: `下一步（AI 识别）`, `保存 N 件单品`.
- [ ] Keep current backend limitation clear: AI recognition proxy is not implemented yet; do not invent an AI service call.
- [ ] Validate WXML/WXSS for all intake pages and open camera/review pages in simulator.

Expected: all pass.

---

### Task 9: Detail Pages Subagent

**Owner:** one worker subagent after Task 2.

**Files:**
- Modify: `apps/wechat-miniprogram/pages/wardrobe/detail/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/wardrobe/detail/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/outfits/detail/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/outfits/detail/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/wishlist/detail/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/wishlist/detail/index.wxss`

**Reference screenshots and spec sections:**
- `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/garment_detail_390_top.png`
- `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/garment_detail_390_info.png`
- `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/outfit_detail_390_top.png`
- `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/wishlist_detail_390_top.png`
- UI spec sections: `7 核心组件 Contract`, `8 领域 UI 映射`

- [ ] Replace placeholder detail pages with real detail structure:
  - secondary top bar
  - 3:4 hero media
  - thumbnail strip where applicable
  - title and meta on background, not inside random cards
  - first-level info cards
  - color chips and temperature bar when data exists
- [ ] No bottom nav on detail pages.
- [ ] No top-right custom action in WeChat capsule area; more actions must be below/left of capsule or inside content.
- [ ] Validate all detail WXML/WXSS files.

Expected: all pass.

---

### Task 10: Placeholder Route Audit Subagent

**Owner:** one explorer subagent, read-only first; worker only after coordinator approval.

**Files to inspect:**
- `apps/wechat-miniprogram/pages/recommendations/index/index.*`
- `apps/wechat-miniprogram/pages/trips/index/index.*`
- `apps/wechat-miniprogram/pages/trips/detail/index.*`
- `apps/wechat-miniprogram/pages/try-on/index/index.*`
- `apps/wechat-miniprogram/pages/webview/agreement/index.*`
- `apps/wechat-miniprogram/pages/webview/privacy/index.*`
- `apps/wechat-miniprogram/pages/wardrobe/edit/index.*`

**Goal:**
- Decide which placeholder routes are required for the current mini-program scope and which should be hidden from navigation until implemented.

- [ ] Report every route still using `placeholder-card`.
- [ ] For each route, classify:
  - `must implement now`
  - `can remain route-only but hidden`
  - `should be removed from visible entry points`
- [ ] Do not delete routes without coordinator approval.
- [ ] If approved for code changes, apply only tokenized placeholder/empty-state styles; do not present placeholders as finished UI.

Expected: report delivered before final QA.

---

### Task 11: Integrated QA And Screenshot Report

**Owner:** main agent plus one read-only QA subagent.

**Files:**
- Create: `docs/wechat-mini/ui-spec-remediation-report.md`
- Modify: `VERSION_HISTORY.md`

**Screenshots to capture with `wechatide`:**
- `pages/login/index`
- `pages/login/password/index`
- `pages/wardrobe/index/index`
- `pages/outfits/index/index`
- `pages/wishlist/index/index`
- `pages/settings/index/index`
- `pages/intake/camera/index`
- `pages/intake/review/index`
- `pages/outfits/detail/index`
- `pages/wishlist/detail/index`

- [ ] Run full mini-program typecheck:

```bash
npm --prefix apps/wechat-miniprogram run typecheck
```

Expected: pass.

- [ ] Compile every touched WXML and WXSS file with `wechatide`.
- [ ] Open every touched page with `simulator_open_page`.
- [ ] Capture screenshots to `test-results/wechat-miniprogram-ui-spec/`.
- [ ] QA subagent compares screenshots against:
  - `wardrobe-ui-spec.html`
  - matching `v03-alpha` real screenshot
  - this plan's Global Constraints
- [ ] Main agent fixes only concrete QA findings, then reruns focused validation.
- [ ] Confirm backend diff is zero:

```bash
git diff -- services/wardrobe-api packages/cloud-contracts | wc -l
```

Expected: `0`.

- [ ] Update `VERSION_HISTORY.md` with:
  - changed files
  - subagent list and scope
  - validation commands
  - screenshots produced
  - remaining UI gaps
- [ ] Commit the integrated batch.

Expected final deliverables:
- UI code aligned to the spec sections listed above.
- Screenshot report at `docs/wechat-mini/ui-spec-remediation-report.md`.
- Clean commit containing only mini-program UI/spec-report changes.

---

## Subagent Dispatch Order

1. Run Task 1 locally.
2. Dispatch Task 2 to one worker. No page worker starts until Task 2 is reviewed.
3. Dispatch Tasks 3-9 in parallel only after Task 2 merges. Their write sets are disjoint.
4. Dispatch Task 10 as read-only in parallel with Tasks 3-9.
5. Run Task 11 after all workers return.

## Standard Subagent Prompt Prefix

Use this prefix for every worker:

```text
You are working in /Users/fangzheng/Documents/wardrobe-wechat-miniprogram.
Read AGENTS.md if present, README.md, package.json, VERSION_HISTORY.md top entry, this plan, wardrobe-ui-spec.html, and the relevant v03-alpha screenshots before editing.
Do not modify backend code under services/wardrobe-api/**, packages/cloud-contracts/**, or migrations.
Do not invent colors, radii, glass, spacing, or page structures. If the UI spec does not define something, report it as 规范缺口.
Only edit your assigned files. Do not revert other agents' or user changes.
Return changed files, validation commands, and remaining risks.
```

