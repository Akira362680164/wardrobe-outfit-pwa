# WeChat Mini Program UI Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven execution only for isolated file groups. The mother agent owns dispatch, merge review, validation, screenshots, `VERSION_HISTORY.md`, and the final commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复微信小程序与 App v03-alpha 真实业务流截图之间的 UI 差距，优先收口三个未修复一级页的微信胶囊避让，并补齐加号弹层与三个新建入口跳转截图证据。

**Architecture:** 不照抄 PDF 或截图坐标。所有顶部避让以运行时 `wx.getMenuButtonBoundingClientRect()` 为基准，让一级页标题容器 top 与微信胶囊 top 对齐，页面后续内容自然下移。颜色、圆角、遮罩、玻璃、Icon 只使用现有小程序 token 和 App UI 标准，避免新增设计体系。

**Tech Stack:** 微信小程序 WXML/WXSS/TypeScript，`apps/wechat-miniprogram`，微信开发者工具 CLI `wechatide`，截图参考 `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/`。

## Global Constraints

- 不改 `node_modules`，不改密钥、登录态或线上数据写入规则。
- 衣橱首页顶部避让已修复；本轮新增衣橱首页卡片修复项：瀑布流卡片比例和字段展示方式必须与 App 首页一致。
- 三个仍需顶部修复的一级页是 `套装`、`种草`、`设置`。
- `设置` 页必须把 `设置` 标题作为顶部第一视觉元素；AI banner 放到标题下方。
- 顶部避让不能硬编码某张图的 y 坐标；必须使用微信运行时胶囊信息。
- 每个 subagent 只能编辑自己被分配的文件组；不得多个 subagent 同时改同一文件。
- 母 agent 统一做共享文件、合并、测试、截图、版本历史和提交。
- 衣橱首页卡片修复由单独 subagent 执行；不得与套装/种草/设置顶部修复 subagent 并行编辑同一文件。
- 本次是小程序 UI 修复，不打 Android APK。

---

## Source Material

- PDF 分析：`/Users/fangzheng/Downloads/app_vs_miniprogram_ui_gap_analysis_12pages_v4_wechat_capsule_image_ratio_verified.pdf`
- App 真实截图：`/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/`
- 小程序现有截图：`/Users/fangzheng/Desktop/wechat-miniprogram-v03-alpha-flow-screenshots/`
- 小程序复检截图：`/Users/fangzheng/Desktop/wechat-miniprogram-v03-alpha-flow-screenshots-20260708-220231/`
- UI 标准：`/Users/fangzheng/Documents/衣柜识别+根据要去的地方和活动自动搭配穿搭的APP/docs/designs/wardrobe-ui-spec.md`
- 小程序工作树：`/Users/fangzheng/Documents/wardrobe-wechat-miniprogram`

## Accept / Reject From The PDF

### 已接受

- 一级页标题必须避让微信胶囊，标题顶部与胶囊顶部对齐。
- 套装首页保留标题、副标题、月历入口、本周套装、筛选与列表结构；只修顶部与视觉 token，不照搬坐标。
- 种草首页保留标题、副标题、状态筛选、两列商品卡和 FAB；只修顶部与视觉 token，不照搬坐标。
- 设置首页保留设置卡片结构；标题必须先出现，AI banner 下移。
- 二三级页继续使用透明毛玻璃 TopBar，不能恢复白色顶部条。
- 详情页、录入页、删除弹层后续按 3:4 图片、同心圆角、浮层遮罩和安全区规则收口。
- 加号弹层必须截图验证：打开弹层、点击三个入口后的目标页。

### 不接受

- 不接受 PDF 的绝对坐标和静态截图位置。
- 不接受在微信胶囊区域放右侧自定义按钮。
- 不接受设置页文案写成“尚未接入后端 AI 代理”；当前后端 AI 代理已接入录入识别、诊断和建议类能力。
- 不接受为了视觉对齐新增另一套颜色、圆角、遮罩或图标资产。
- 不接受多个 subagent 修改同一页面文件后由 Git 自动合并。

## UI Decisions

### Color

Use existing mini program tokens from `apps/wechat-miniprogram/styles/tokens.wxss`.

| Use | Token / Value |
| --- | --- |
| Page background | `--app-ambient` |
| Main text / title | `--color-ink` = `#1d2228` |
| Subtitle / secondary text | `--color-muted` = `rgba(29, 34, 40, 0.56)` |
| Card surface | `rgba(255, 255, 252, 0.78)` or `--color-surface` glass variants |
| Card border | `--color-line` = `rgba(29, 34, 40, 0.10)` |
| Primary action / FAB | `--color-primary` = `#355c7d` |
| AI banner / AI status | `--color-ai` = `#b97155`; background `rgba(185, 113, 85, 0.12)` |
| Wishlist semantic accent | `--color-shopping` = `#8c4a62`; active chip background `rgba(140, 74, 98, 0.10)` |
| Danger | `--color-danger` = `#dc2626` |

### Radius

| Object | Radius |
| --- | ---: |
| Main page cards | `--radius-card` = `56rpx` |
| Main card internal frame / status card | `--radius-card-inner` = `40rpx` |
| Secondary card / banner | `--radius-card-secondary` = `36rpx` |
| Buttons, chips, small controls | `--radius-control` = `28rpx` |
| Bottom sheet top corners | `--radius-sheet` = `52rpx` |
| Thumbnails / small icon tile | `--radius-thumb` = `20rpx` |
| Floating create button | `--radius-fab` = `50%` |

Rule: card and image radii must look concentric. Do not use a round inner active state inside a rounded rectangular nav or card, except the FAB.

### Glass / Mask / Shadow

| Layer | Standard |
| --- | --- |
| Top glass | `rgba(251, 251, 248, 0.75)` + `blur(60rpx) saturate(1.5)` |
| Bottom sheet / nav glass | `rgba(255, 255, 252, 0.75)` + `blur(60rpx) saturate(1.5)` |
| Strong sheet/card glass | `rgba(255, 255, 252, 0.88)` |
| Sheet mask | `rgba(29, 34, 40, 0.40)` |
| Card shadow | `--shadow-card` |
| Soft elevated shadow | `--shadow-soft` |

### Icon Choices

Use existing mini `ui-icon` names from `components/ui/icon/icons.ts`; add assets only if the name is required and missing.

| Scenario | Icon |
| --- | --- |
| FAB / create | `plus` |
| Add garment | `camera` |
| Add outfit | `layers` |
| Add wishlist | `shopping-bag` |
| Settings tab / settings entry | `settings` |
| Account | `user` |
| Calendar / stats if needed | existing text button is acceptable for this pass; do not add a custom SVG |
| AI / banner | `sparkles` or `wand-sparkles`, not `✣` |
| More / chevron | `chevron-right` or existing text arrow only if no icon asset is available |

### Wardrobe Home Card Contract

The wardrobe home card must match the App home card content model, not the current mini program text-only model.

| Row | Required content | Notes |
| --- | --- | --- |
| Media | 3:4 garment image frame | Image may use `aspectFit`, but the frame must stay 3:4 and must not be stretched by text content. |
| Title | garment name | One line, truncate with ellipsis. |
| Meta | category + color swatches + color names | Example: `上衣 · ● 蓝 / ● 橙`; use real colored dots, not only text. |
| Summary | wear summary | `未穿过` or `最近 M/D · 穿过 N 次`; do not show season here. |

Do not show `seasonText` on wardrobe home cards. Season stays available on detail pages and edit/confirm flows.

## Top Capsule Alignment Rule

The implementation must compute a title top value from the actual WeChat capsule:

```ts
const menuRect = wx.getMenuButtonBoundingClientRect?.();
const systemInfo = wx.getSystemInfoSync();
const pixelRatio = 750 / (systemInfo.windowWidth || 375);
const titleTopRpx = Math.round((menuRect?.top ?? (systemInfo.statusBarHeight ?? 0) + 8) * pixelRatio);
```

Each affected page applies this value to the root container or first header block so the title block begins at that top. The page content below the title keeps normal margins, so everything moves together.

Acceptance:

- On `outfit_home`, `wishlist_home`, and `settings_home`, the title container top aligns with the capsule top within a small visual tolerance.
- No custom content enters the capsule right-side reserved area.
- No page uses a copied screenshot coordinate such as a fixed y-position from the PDF.

## File Ownership Plan

Mother agent owns these files:

- `apps/wechat-miniprogram/app.ts`
- `apps/wechat-miniprogram/styles/*.wxss` only if a shared token/class is truly needed
- `apps/wechat-miniprogram/components/domain/create-sheet/*` if create sheet needs a shared visual or accessibility fix
- `VERSION_HISTORY.md`
- validation scripts or screenshot artifacts

Subagents own isolated page groups:

| Subagent | Editable files | Purpose |
| --- | --- | --- |
| A: Outfit home | `pages/outfits/index/index.ts`, `.wxml`, `.wxss`, `.json` | Capsule title alignment and minor visual token cleanup for 套装首页 |
| B: Wishlist home | `pages/wishlist/index/index.ts`, `.wxml`, `.wxss`, `.json` | Capsule title alignment and minor visual token cleanup for 种草首页 |
| C: Settings home | `pages/settings/index/index.ts`, `.wxml`, `.wxss`, `.json` | Move title above banner, capsule title alignment, stale banner/icon cleanup |
| D: Wardrobe card contract | `services/workspace.ts`, `pages/wardrobe/index/index.{ts,wxml,wxss}`, `components/domain/catalog-card/index.{ts,wxml,wxss}` | 3:4 wardrobe cards and App-aligned field display |
| E: Read-only visual QA | no edits | Screenshot checklist, compare against App reference, report issues |

Do not run A/B/C/D in parallel if their write scopes overlap. D may run independently of A/B/C only because it owns wardrobe card/data files; if another task needs `catalog-card` or `workspace.ts`, pause D until that task is merged.

## Task 0: Mother Agent Setup

**Files:**
- Read: `/Users/fangzheng/Documents/wardrobe-wechat-miniprogram/AGENTS.md` if present, root project `AGENTS.md`, mini `package.json`, mini `VERSION_HISTORY.md`
- Read: `apps/wechat-miniprogram/app.ts`
- Read: the three page file groups listed above

- [ ] Record branch and dirty state in both repos.
- [ ] If mini worktree has user or other-agent changes, do not overwrite them. Stage only this task's hunks later.
- [ ] Confirm wardrobe homepage is only regression scope.
- [ ] Add shared capsule data only if it reduces duplication. Keep the smallest working approach.
- [ ] Dispatch A/B/C with exact file ownership.

Suggested shared data shape if editing `app.ts`:

```ts
export interface WardrobeMiniAppGlobalData {
  apiBaseUrl: string;
  safeAreaBottom: number;
  statusBarHeight: number;
  menuButtonTop: number;
  menuButtonHeight: number;
  windowWidth: number;
}
```

Do not add a new helper package. If a tiny helper is needed, keep it in the page or a single existing utility file.

## Task 1: Outfit Home

**Files:**
- Modify: `apps/wechat-miniprogram/pages/outfits/index/index.ts`
- Modify: `apps/wechat-miniprogram/pages/outfits/index/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/outfits/index/index.wxss`

Implementation requirements:

- Title `套装` top aligns with capsule top.
- Subtitle `{{outfitCountLabel}}` stays under title.
- `月历` button stays below title/subtitle, not in capsule row.
- Existing FAB remains bottom-right, above tab bar.
- Keep colors from token table: title ink, subtitle muted, primary action denim.
- Keep card radius: week card `56rpx`, inner empty block `40rpx`, chips `28rpx`.
- Do not redesign the whole outfit card in this pass unless a visible overflow is introduced.

Checklist:

- [ ] Compute `titleTopRpx` from menu button rect or consume mother-provided value.
- [ ] Bind root style, for example `style="padding-top: {{titleTopRpx}}rpx"`.
- [ ] Remove page-level hard top padding that fights the runtime value.
- [ ] Confirm title, subtitle, calendar action, week card, filters, cards all move together.
- [ ] Confirm no title text or action overlaps capsule at 390 and 360 width.

## Task 1A: Wardrobe Home Card Contract

**Files:**
- Modify: `apps/wechat-miniprogram/services/workspace.ts`
- Modify: `apps/wechat-miniprogram/pages/wardrobe/index/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/wardrobe/index/index.wxss`
- Modify: `apps/wechat-miniprogram/components/domain/catalog-card/index.ts`
- Modify: `apps/wechat-miniprogram/components/domain/catalog-card/index.wxml`
- Modify: `apps/wechat-miniprogram/components/domain/catalog-card/index.wxss`

Implementation requirements:

- Keep the existing wardrobe home top/capsule layout; do not reopen the top header task.
- The card media frame must remain 3:4.
- The visible wardrobe card content must be: title, category + color swatches, wear summary.
- Remove `seasonText` from the wardrobe home card display.
- Add structured card fields in `MiniGarment` instead of parsing display strings in WXML.
- Preserve wishlist cards that already use `catalog-card`; do not force wishlist into wardrobe-only display.

Data interface:

```ts
export interface MiniGarment {
  id: string;
  revision: number;
  legacyItemId: number;
  name: string;
  category: string;
  categoryLabel: string;
  colorText: string;
  colorNames: string[];
  cardColors: Array<{ name: string; swatch: string; needsBorder: boolean }>;
  wearSummary: string;
  seasonText: string;
  imageUrl: string;
  updatedAt: string;
}
```

Color swatch values must follow the App color catalog for common colors:

```ts
const COLOR_SWATCHES: Record<string, { bg: string; border?: string }> = {
  "黑": { bg: "#1D2228" },
  "白": { bg: "#F8FAFC", border: "rgba(29,34,40,0.26)" },
  "灰": { bg: "#9CA3AF" },
  "米白": { bg: "#F3EEE3", border: "rgba(29,34,40,0.18)" },
  "米": { bg: "#E6D5B8", border: "rgba(29,34,40,0.16)" },
  "卡其": { bg: "#B7A477" },
  "棕": { bg: "#87583E" },
  "蓝": { bg: "#355C7D" },
  "牛仔蓝": { bg: "#3F6F9F" },
  "绿": { bg: "#5F7058" },
  "红": { bg: "#B84A45" },
  "粉": { bg: "#E8A7B8" },
  "深灰": { bg: "#4B5563" },
  "杏": { bg: "#E6C5A5", border: "rgba(29,34,40,0.14)" },
  "驼": { bg: "#B8845F" },
  "咖啡": { bg: "#5F4032" },
  "酒红": { bg: "#7B2E3A" },
  "橙": { bg: "#D9823B" },
  "黄": { bg: "#E3B64B", border: "rgba(29,34,40,0.12)" },
  "天蓝": { bg: "#83B6D9" },
  "藏青": { bg: "#243B5A" },
  "橄榄绿": { bg: "#777B48" },
  "墨绿": { bg: "#315B4B" },
  "紫": { bg: "#8C4A86" },
  "金": { bg: "#C6A15B", border: "rgba(29,34,40,0.12)" },
  "银": { bg: "#B8C0C8", border: "rgba(29,34,40,0.16)" },
};
```

Wear summary logic:

```ts
function formatWearSummary(value: unknown): string {
  const dates = Array.isArray(value) ? value.filter(isNonEmptyString) : [];
  if (dates.length === 0) return "未穿过";
  const last = dates[dates.length - 1] || "";
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(last);
  const dateText = match ? `${Number(match[2])}/${Number(match[3])}` : "";
  return dateText ? `最近 ${dateText} · 穿过 ${dates.length} 次` : `穿过 ${dates.length} 次`;
}
```

Catalog card compatibility:

- Keep existing `meta`, `submeta`, and `badge` properties for wishlist and other generic usage.
- Add optional properties such as `categoryLabel`, `colors`, and `summary`; render the structured wardrobe meta only when `colors` is present.
- The structured colors should render at most 3 colors; if more exist, show `+N`.
- Text must remain one line and truncate.

Checklist:

- [ ] Extend `MiniGarment` and `toMiniGarment()` with `colorNames`, `cardColors`, and `wearSummary`.
- [ ] Add small color swatch helper functions in `workspace.ts`; do not create a new dependency.
- [ ] Update wardrobe home `catalog-card` usage to pass `category-label`, `colors`, and `summary`, and stop passing season as `submeta`.
- [ ] Update `catalog-card` to render structured category/color line only for wardrobe cards.
- [ ] Make card text area fixed enough that long names and colors do not stretch the card.
- [ ] Verify wishlist cards still display category/price/status as before.

Validation:

```bash
npm --prefix apps/wechat-miniprogram run typecheck
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --wxml pages/wardrobe/index/index.wxml
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --wxss pages/wardrobe/index/index.wxss
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --wxml components/domain/catalog-card/index.wxml
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --wxss components/domain/catalog-card/index.wxss
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --wxml pages/wishlist/index/index.wxml
```

## Task 2: Wishlist Home

**Files:**
- Modify: `apps/wechat-miniprogram/pages/wishlist/index/index.ts`
- Modify: `apps/wechat-miniprogram/pages/wishlist/index/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/wishlist/index/index.wxss`

Implementation requirements:

- Title `种草` top aligns with capsule top.
- Subtitle `{{summaryText}}` stays under title.
- Content horizontal padding uses `32rpx`, not `28rpx`, unless a visual regression proves 28rpx is required.
- Status chips use `--radius-control`.
- Wishlist semantic accent can use `--color-shopping` for active status; do not change global FAB color for this pass.
- Two-column product grid remains.

Checklist:

- [ ] Compute or consume `titleTopRpx`.
- [ ] Bind root style and remove the fixed `calc(env(safe-area-inset-top) + 152rpx)` top padding.
- [ ] Keep the status-chip row below the title/subtitle with normal spacing.
- [ ] Confirm `catalog-card` images remain 3:4 and card text does not overflow.

## Task 3: Settings Home

**Files:**
- Modify: `apps/wechat-miniprogram/pages/settings/index/index.ts`
- Modify: `apps/wechat-miniprogram/pages/settings/index/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/settings/index/index.wxss`

Implementation requirements:

- Title `设置` is the first visual element and aligns with capsule top.
- AI banner moves under the title, with `24rpx-28rpx` top margin.
- Replace decorative `✣` with `ui-icon name="sparkles"` or `wand-sparkles`.
- Keep banner color `rgba(185, 113, 85, 0.12)` and text muted.
- Keep settings cards `40rpx` radius and controls `28rpx`.
- Do not reintroduce stale copy saying AI proxy is not connected.

Checklist:

- [ ] Move `<view class="page-title">设置</view>` before `.ai-banner`.
- [ ] Compute or consume `titleTopRpx`.
- [ ] Bind root style and remove fixed top padding.
- [ ] Replace the banner mark with an existing icon.
- [ ] Confirm card list remains below the banner with no overlap.

## Task 4: Create Sheet And Plus Entry Validation

**Files:**
- Prefer no code change if current `create-sheet` already meets spec.
- Modify only if necessary: `apps/wechat-miniprogram/components/domain/create-sheet/index.*`

Current routes:

| Button | Current route | Expected target |
| --- | --- | --- |
| 添加衣物 | `/pages/intake/camera/index` | 单品照片选择/录入页 |
| 添加套装 | `/pages/outfits/compose/index` | 套装创建页 |
| 添加种草单品 | `/pages/wishlist/edit/index` | 种草编辑/新增页 |

Visual requirements:

- Sheet mask remains `rgba(29, 34, 40, 0.40)`.
- Sheet radius remains `52rpx 52rpx 0 0`.
- Items use `40rpx` radius and `116rpx` minimum height.
- Icons remain `camera`, `layers`, `shopping-bag`.
- Active item uses primary color and `rgba(53, 92, 125, 0.08)` background.

Screenshot requirements:

- [ ] From wardrobe home: tap `+`, screenshot sheet open.
- [ ] From outfit home: tap `+`, screenshot sheet open.
- [ ] From wishlist home: tap `+`, screenshot sheet open.
- [ ] From one open sheet, tap `添加衣物`, screenshot target page.
- [ ] Return, tap `添加套装`, screenshot target page.
- [ ] Return, tap `添加种草单品`, screenshot target page.

If a route fails, fix only that route or page registration. Do not redesign the sheet.

## Task 5: Full PDF Follow-Up Scope

These are accepted but lower priority than the three primary page top fixes.

| Page | Accept | Implementation owner |
| --- | --- | --- |
| 衣橱首页顶部 | 已修复；只回归截图 | Mother agent |
| 衣橱首页卡片 | 新增修复：瀑布流媒体 3:4，字段改成 App 首页的标题、分类+颜色色块、穿着摘要 | Wardrobe card subagent only |
| 套装月历 | Use shared transparent subpage TopBar, no white oval top band | Separate future subagent, files under `pages/outfits/calendar/*` |
| 套装详情 | 3:4 hero, filmstrip, no top-right custom capsule button | Separate future subagent, detail files only |
| 种草详情 | 3:4 product hero, actions not squeezed into three tiny buttons | Separate future subagent, wishlist detail files only |
| 单品详情 | 3:4 hero, swatches, temperature display, no capsule conflict | Separate future subagent, wardrobe detail files only |
| 添加单品空态 | Fix count text to reflect real selected images | Intake subagent only |
| 添加单品已导入 | Keep 3:4 preview and thumbnail queue; toast floats outside image | Intake subagent only |
| 添加单品校对 | Save button count must equal actual savable count | Intake subagent only |
| 删除确认弹层 | Horizontal cancel/confirm, danger confirm text specific | Overlay subagent only |

Do not mix these follow-up files into the three一级页 top-fix commit unless the user explicitly expands the implementation scope.

## Screenshot Matrix

Save new screenshots under a timestamped desktop folder:

`/Users/fangzheng/Desktop/wechat-miniprogram-ui-gap-fix-YYYYMMDD-HHMMSS/`

Required captures:

| ID | Mini page/action | App reference |
| --- | --- | --- |
| 01 | wardrobe home after fix regression | `wardrobe_home_390_top.png` |
| 02 | outfit home after title/capsule fix | `outfit_home_390_top.png` |
| 03 | wishlist home after title/capsule fix | `wishlist_home_390_top.png` |
| 04 | settings home after title/capsule fix | `settings_home_390_top.png` |
| 05 | wardrobe `+` sheet open | no App exact sheet reference; compare to UI token |
| 06 | outfit `+` sheet open | no App exact sheet reference; compare to UI token |
| 07 | wishlist `+` sheet open | no App exact sheet reference; compare to UI token |
| 08 | after `添加衣物` | `intake_single_step1_empty_390_top.png` |
| 09 | after `添加套装` | no exact App screenshot in current set; confirm route and layout |
| 10 | after `添加种草单品` | wishlist intake/edit target; confirm route and layout |
| 11 | wardrobe card close-up after 3:4 + field fix | `wardrobe_home_390_top.png` plus user screenshot `/Users/fangzheng/Downloads/Screenshot_2026-07-09-01-19-10-43_ccf0e574077213e.jpg` |

Also keep a contact sheet comparing App reference and mini screenshots.

## Validation Commands

Run from `/Users/fangzheng/Documents/wardrobe-wechat-miniprogram`:

```bash
npm --prefix apps/wechat-miniprogram run typecheck
```

Then compile with the existing WeChat developer tools wrapper:

```bash
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --refresh
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --wxml pages/outfits/index/index.wxml
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --wxss pages/outfits/index/index.wxss
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --wxml pages/wishlist/index/index.wxml
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --wxss pages/wishlist/index/index.wxss
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --wxml pages/settings/index/index.wxml
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --wxss pages/settings/index/index.wxss
```

The wrapper uses the configured `wardrobe-mini` client. Do not upload, publish, or use cloud write tools.

Screenshot validation:

- [ ] Open each required page in simulator.
- [ ] Capture the matrix above.
- [ ] Compare against `/Users/fangzheng/Desktop/v03-alpha-真实业务流截图/`.
- [ ] Verify no title/copy/FAB/tab bar overlaps on 390px simulator.
- [ ] If possible, repeat top four page captures at 360px width.

## Version History And Commit

At the end, update the mini program `VERSION_HISTORY.md` with:

- date `2026-07-09`
- version `2.1.8-test`
- agent name
- files changed
- validation results
- screenshot output folder
- risk gate: `high` if runtime UI and screenshot flow changed
- subagent note: list each subagent and confirm no shared file conflicts

Commit only the files changed by this implementation. Do not stage unrelated existing dirty files.

## Final Acceptance

- `套装`、`种草`、`设置` 一级页标题 top visually aligns with WeChat capsule top.
- 衣橱首页 remains fixed.
- Settings title is above AI banner.
- 加号弹层 appears correctly from all plus-enabled top-level pages.
- 三个新建入口 all navigate to the expected page and have screenshots.
- Typecheck and WeChat compile pass, or failures are clearly identified as pre-existing with evidence.
- Screenshot folder and contact sheet are delivered.
