# 备案网站公开名称对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将官网所有访客可见名称从 Wardora 对齐为备案名称“个人内网穿透及衣橱小站”，将关联产品统一称为“衣橱穿搭助手”，并完成网站、共享法律内容、版本、APK 与 Android 验证闭环。

**Architecture:** 继续以 `src/lib/site-config.ts` 作为官网命名和备案信息的单一配置源；页面、metadata、manifest 和共享法律文本分别消费 `siteName` 与 `productName`，不复制第二套法律内容。公开路径移除旧品牌，但内部脚本、环境变量、测试目录和服务器发布目录保持不变，避免无收益部署重构。

**Tech Stack:** Next.js 15、React 19、TypeScript、静态导出、Playwright、Capacitor 8、Gradle、ADB。

## Global Constraints

- 备案网站名称固定为“个人内网穿透及衣橱小站”。
- 关联产品与 Android 应用名称固定为“衣橱穿搭助手”。
- 运营主体固定为“方正”，网站备案号固定为“鲁ICP备2026037404号-1”。
- 官网明确当前不向公众提供独立内网穿透服务，不新增任何虚构入口或能力。
- 公开页面、metadata、manifest 和法律文案不得再出现 Wardora。
- 不修改 Android 包名 `com.wardrobe.outfit`、API 域名、数据库、认证、邮件逻辑、微信小程序发布配置、Caddy 路由和服务器发布目录。
- 公安联网备案数据码不得作为正式公安备案号展示。
- 腾讯云实名认证中的邮箱、住址、手机号和证件信息不得写入网站。
- 共享法律内容进入 App，版本从 `2.1.12-test` 递增至 `2.1.13-test`，使用固定签名 `CN=fangzheng` 构建 APK。

---

### Task 1: 建立公开命名合同

**Files:**
- Modify: `src/lib/site-config.ts`
- Modify: `scripts/test-wardora-compliance-site.ts`

**Interfaces:**
- Produces: `siteConfig.siteName: "个人内网穿透及衣橱小站"`
- Produces: `siteConfig.siteShortName: "衣橱小站"`
- Produces: `siteConfig.productName: "衣橱穿搭助手"`
- Preserves: `siteStatus.operatorLabel`、`siteStatus.icpLabel`、`siteStatus.policeLabel`

- [ ] **Step 1: 先写失败的命名合同**

在 `scripts/test-wardora-compliance-site.ts` 中将旧站名断言替换并增加产品名、短名称和公开资源路径断言：

```ts
assert.equal(siteConfig.siteName, "个人内网穿透及衣橱小站");
assert.equal(siteConfig.siteShortName, "衣橱小站");
assert.equal(siteConfig.productName, "衣橱穿搭助手");
assert.equal(siteStatus.operatorLabel, "方正");
assert.equal(siteStatus.icpLabel, "鲁ICP备2026037404号-1");
assert.match(read("src/app/layout.tsx"), /manifest:\s*["']\/site\.webmanifest["']/);
```

- [ ] **Step 2: 运行合同测试并确认失败**

Run: `npm run test:logic:website`

Expected: FAIL，提示 `siteName` 仍为 `Wardora` 或 `siteShortName` / `productName` 尚不存在。

- [ ] **Step 3: 实现集中命名配置**

在 `src/lib/site-config.ts` 的 `siteConfig` 中使用：

```ts
siteName: "个人内网穿透及衣橱小站",
siteShortName: "衣橱小站",
productName: "衣橱穿搭助手",
siteDescription: "衣橱穿搭助手官方信息与合规页面",
```

保留现有域名、主体、ICP、公安备案和日期配置逻辑。

- [ ] **Step 4: 运行合同测试确认命名断言通过**

Run: `npm run test:logic:website`

Expected: 新增的名称断言通过；manifest 路径断言可在 Task 2 完成前保持唯一预期失败。

- [ ] **Step 5: 提交集中命名合同**

```bash
git add src/lib/site-config.ts scripts/test-wardora-compliance-site.ts
git commit -m "test: define备案网站公开名称合同"
```

### Task 2: 替换官网公开品牌与 metadata

**Files:**
- Modify: `src/components/site/site-mark.tsx`
- Modify: `src/components/site/site-home.tsx`
- Modify: `src/components/site/site-footer.tsx`
- Modify: `src/components/site/legal-page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `app/layout.tsx`
- Modify: `src/app/not-found.tsx`
- Modify: `src/app/privacy/page.tsx`
- Modify: `src/app/terms/page.tsx`
- Modify: `src/app/account-deletion/page.tsx`
- Modify: `src/app/contact/page.tsx`
- Rename: `public/wardora.webmanifest` → `public/site.webmanifest`
- Modify: `docs/deployment/wardora-website.md`
- Modify: `scripts/test-wardora-compliance-site.ts`

**Interfaces:**
- Consumes: `siteConfig.siteName`、`siteConfig.siteShortName`、`siteConfig.productName`
- Produces: 首页、页头、页脚、联系页、404、metadata 和 manifest 的一致公开名称

- [ ] **Step 1: 扩充失败的公开内容测试**

在 `scripts/test-wardora-compliance-site.ts` 增加：

```ts
const publicWebsiteSources = [
  "src/components/site/site-mark.tsx",
  "src/components/site/site-home.tsx",
  "src/components/site/site-footer.tsx",
  "src/components/site/legal-page.tsx",
  "src/app/layout.tsx",
  "src/app/not-found.tsx",
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/account-deletion/page.tsx",
  "src/app/contact/page.tsx",
  "public/site.webmanifest",
];
for (const path of publicWebsiteSources) {
  assert.doesNotMatch(read(path), /Wardora/i, `${path} must not expose the retired public name`);
}
```

- [ ] **Step 2: 运行测试并确认旧名称命中**

Run: `npm run test:logic:website`

Expected: FAIL，至少命中 `site-mark.tsx`、`site-home.tsx` 或旧 manifest 路径。

- [ ] **Step 3: 替换页面与组件公开文案**

使用集中配置完成以下效果：

```tsx
<h1>{siteConfig.siteName}</h1>
<p className="site-hero__kicker">{siteConfig.productName}官方信息与合规页面</p>
<p>
  本网站当前只提供产品介绍、隐私政策、用户协议、账号注销说明、联系渠道及备案信息，
  不向公众提供独立的内网穿透服务。
</p>
```

页脚版权改为：

```tsx
<span>© 2026 {siteStatus.operatorLabel}</span>
```

联系页产品信息改为：

```tsx
<p>网站名称：{siteConfig.siteName}</p>
<p>关联产品：{siteConfig.productName}</p>
<p>服务类型：个人衣橱与穿搭管理工具的介绍及合规信息展示</p>
```

- [ ] **Step 4: 对齐 metadata 与 manifest**

两个 layout 使用：

```ts
title: {
  default: `${siteConfig.siteName}｜${siteConfig.productName}官方信息与合规页面`,
  template: `%s｜${siteConfig.siteName}`,
},
manifest: "/site.webmanifest",
openGraph: {
  title: siteConfig.siteName,
  description: siteConfig.siteDescription,
  url: siteConfig.domain,
  siteName: siteConfig.siteName,
  locale: "zh_CN",
  type: "website",
},
```

使用 `mv public/wardora.webmanifest public/site.webmanifest` 安全重命名 tracked 文件，并将内容改为：

```json
{
  "name": "个人内网穿透及衣橱小站",
  "short_name": "衣橱小站",
  "description": "衣橱穿搭助手官方信息与合规页面",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f4f5f3",
  "theme_color": "#33483a",
  "lang": "zh-CN"
}
```

- [ ] **Step 5: 更新部署说明并运行官网合同测试**

将部署说明标题和公开名称改为“个人内网穿透及衣橱小站”，同时保留 `/srv/wardora-website` 等内部发布路径。

Run: `npm run test:logic:website`

Expected: PASS。

- [ ] **Step 6: 提交官网公开名称变更**

```bash
git add src/components/site src/app app/layout.tsx public/site.webmanifest public/wardora.webmanifest docs/deployment/wardora-website.md scripts/test-wardora-compliance-site.ts
git commit -m "feat: align website name with ICP filing"
```

### Task 3: 修正共享法律产品名并递增版本

**Files:**
- Modify: `src/content/legal-content.tsx`
- Modify: `scripts/test-wardora-compliance-site.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `VERSION_HISTORY.md`

**Interfaces:**
- Consumes: `siteConfig.productName`
- Produces: 官网与 App 复用的“衣橱穿搭助手”法律文本
- Produces: App 版本 `2.1.13-test`

- [ ] **Step 1: 写失败的共享法律文本测试**

在网站合同测试中增加：

```ts
const legalSource = read("src/content/legal-content.tsx");
assert.doesNotMatch(legalSource, /Wardora/i);
assert.match(legalSource, /siteConfig\.productName/);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm run test:logic:website`

Expected: FAIL，`src/content/legal-content.tsx` 仍包含 Wardora。

- [ ] **Step 3: 用产品名统一法律内容**

将法律文本中的品牌引用改为 `siteConfig.productName`，例如：

```tsx
<p>
  本政策适用于{siteConfig.productName}的网站、Android App 和微信小程序中与账号、衣橱数据、图片及 AI 辅助能力有关的处理活动。
</p>
```

注销邮件主题改为：

```tsx
主题注明“{siteConfig.productName}账号注销”
```

- [ ] **Step 4: 将版本递增至 2.1.13-test**

Run: `npm version 2.1.13-test --no-git-tag-version`

Expected: `package.json` 与 `package-lock.json` 的根版本均为 `2.1.13-test`。

- [ ] **Step 5: 更新版本历史**

在 `VERSION_HISTORY.md` 顶部新增 2026-07-11 记录，写明网站名、产品名、manifest、法律文本、版本、测试、APK 与未验证项；最终验证完成后将命令结果补齐，不保留“待补充”字样。

- [ ] **Step 6: 运行合同、类型和 App 构建检查**

Run:

```bash
npm run test:logic:website
npm run typecheck
npm run build
```

Expected: 全部退出 0，默认 `out` 仍为衣橱穿搭助手 App。

- [ ] **Step 7: 提交法律内容与版本**

```bash
git add src/content/legal-content.tsx scripts/test-wardora-compliance-site.ts package.json package-lock.json VERSION_HISTORY.md
git commit -m "v2.1.13-test align public legal names"
```

### Task 4: 官网静态产物与响应式验收

**Files:**
- Modify: `VERSION_HISTORY.md`
- Generated, not committed: `out-website/`
- Generated, not committed: `test-results/wardora-website/`

**Interfaces:**
- Consumes: Tasks 1–3 的公开页面和配置
- Produces: 通过名称、安全、构建与响应式门禁的官网静态产物

- [ ] **Step 1: 构建官网**

Run: `npm run build:website`

Expected: 静态导出成功到 `out-website`。

- [ ] **Step 2: 扫描公开产物**

Run:

```bash
rg -n '个人内网穿透及衣橱小站|衣橱穿搭助手|鲁ICP备2026037404号-1|公安备案信息办理中' out-website
! rg -n 'Wardora|8f2e1965a58e30ef741b87314de74140|望城街道|133[0-9]{8}|3702[0-9]+' out-website --glob '*.html' --glob '*.txt' --glob '*.webmanifest'
```

Expected: 新名称和备案信息存在；旧公开名称、备案数据码及实名认证敏感信息无命中。

- [ ] **Step 3: 运行响应式验证**

Run: `npm run test:website:visual`

Expected: 375、390、430、768、1024、1440px 全部通过，无横向溢出、控制台错误或失败请求。

- [ ] **Step 4: 人工检查关键截图**

检查 `test-results/wardora-website/home-390.png` 和 `home-1440.png`，确认长中文站名在手机与桌面均无裁切、遮挡或异常断行。

- [ ] **Step 5: 将官网验收结果补入版本历史并提交**

```bash
git add VERSION_HISTORY.md
git commit -m "docs: record website rebrand verification"
```

### Task 5: 构建固定签名 APK 并完成 Android 回归

**Files:**
- Modify: `VERSION_HISTORY.md`
- Generated, not committed: `衣橱穿搭助手-v2.1.13-test.apk`
- Generated, not committed: Android build、同步和验证结果目录

**Interfaces:**
- Consumes: App 版本 `2.1.13-test` 与共享法律文本
- Produces: 固定签名 APK 和 Android 验证证据

- [ ] **Step 1: 检查固定签名文件**

Run:

```bash
test -f android/signing/wardrobe-fixed.jks
test -f android/signing/wardrobe-signing.properties
```

Expected: 两条命令均退出 0；缺失则停止，不生成替代签名。

- [ ] **Step 2: 构建 APK**

Run: `npm run android:apk`

Expected: 根目录生成 `衣橱穿搭助手-v2.1.13-test.apk`。

- [ ] **Step 3: 核验 APK 元数据与签名**

Run:

```bash
BUILD_TOOLS="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)"
"$BUILD_TOOLS/aapt" dump badging "$PWD/衣橱穿搭助手-v2.1.13-test.apk" | sed -n '1,3p'
"$BUILD_TOOLS/apksigner" verify --print-certs "$PWD/衣橱穿搭助手-v2.1.13-test.apk"
```

Expected: 包名 `com.wardrobe.outfit`、versionName `2.1.13-test`、固定签名主体含 `CN=fangzheng`。

- [ ] **Step 4: 在 Android 设备或 wardrobe-test 模拟器验证**

若没有状态为 `device` 的目标设备，启动 `wardrobe-test` AVD；随后运行：

```bash
APK_PATH="$PWD/衣橱穿搭助手-v2.1.13-test.apk" \
APK_EXPECTED_SIGNER_CN=fangzheng \
ANDROID_SERIAL=emulator-5554 \
RESULTS_DIR="$PWD/test-results/android-v2.1.13-test-site-name" \
npm run android:verify:full
```

Expected: 安装、启动、前台窗口、返回键、竖屏、清数据重启和崩溃日志检查全部通过。

- [ ] **Step 5: 检查法律页面与日志**

在 App 中打开隐私政策或用户协议，确认显示“衣橱穿搭助手”且不显示 Wardora；保存截图并检查：

```bash
adb -s emulator-5554 logcat -d -t 1000 | rg 'FATAL|AndroidRuntime|com.wardrobe.outfit'
```

Expected: 无本次变更导致的崩溃或严重错误。

- [ ] **Step 6: 关闭模拟器并更新版本历史**

Run: `adb -s emulator-5554 emu kill`

将设备、Android 版本、APK 元数据、安装方式、已测路径和日志摘要写入 `VERSION_HISTORY.md`。

- [ ] **Step 7: 最终提交**

```bash
git add VERSION_HISTORY.md
git diff --cached --check
git commit -m "v2.1.13-test verify website and Android delivery"
```

### Task 6: 最终审计与本地基线集成

**Files:**
- No new source files

**Interfaces:**
- Consumes: 全部任务提交
- Produces: 可安全 fast-forward 集成的 clean 分支

- [ ] **Step 1: 运行最终门禁**

Run:

```bash
npm run test:logic:website
npm run typecheck
npm run build
npm run build:website
git diff --check
git status --short
```

Expected: 命令全部通过，工作区无 tracked/staged 修改；仅允许明确列出的生成产物或预先存在未跟踪文件。

- [ ] **Step 2: 审查提交范围**

Run: `git log --oneline 00c3e676..HEAD && git diff --stat 00c3e676..HEAD`

Expected: 仅包含本设计、实施、测试、版本和验证所需文件，不包含密钥、环境文件、APK 或其他 Session 改动。

- [ ] **Step 3: 串行 fast-forward 合入本地 main**

在正式集成目录确认无 tracked/staged 修改及未完成 Git 操作后运行：

```bash
git merge --ff-only codex/closet-site-rebrand
```

Expected: 本地 `main` fast-forward 成功。除非用户另行授权，不推送远程、不部署官网、不修改 DNS 或备案状态。
