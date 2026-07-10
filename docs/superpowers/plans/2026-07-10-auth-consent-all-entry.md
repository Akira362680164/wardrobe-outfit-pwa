# 全入口协议主动同意整改 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Android App、衣橱 Web App 与微信小程序所有认证入口默认不替用户同意协议，并在未勾选提交时显示固定红色页面内错误。

**Architecture:** App 与 Web 继续共用 `AuthGate`，登录和注册分别维护页面内 `accepted` 状态并在 API 调用前校验。微信小程序三个认证页面各自维护非持久化 `accepted` 状态；同意状态不跨页面传播，也不改变服务端契约。

**Tech Stack:** React 19、TypeScript、Next.js、微信小程序 WXML/WXSS/TypeScript、Capacitor Android、现有源码合同测试。

## Global Constraints

- 固定错误文案：`请先阅读并同意《用户服务协议》和《隐私政策》`。
- 未勾选时只显示页面内红色错误，不使用 Toast 或系统弹窗。
- 未勾选时不得调用登录、注册、微信授权或注册验证码 API。
- 勾选状态默认 `false`，只存在当前页面内存，不写入持久存储。
- Wardora 合规官网不新增登录或注册入口。
- 不修改服务端认证契约，不新增依赖。
- 本 Session 使用 inline execution，不触发 subagent。

---

### Task 1: 建立失败的全入口合规合同测试

**Files:**
- Create: `scripts/test-auth-consent-all-entry.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: App `AuthGate` 和小程序三个认证页面源码。
- Produces: `npm run test:logic:auth-consent` 回归门禁。

- [ ] **Step 1: 写入合同测试**

测试读取 `src/components/auth/auth-gate.tsx`、`src/lib/auth-form-validation.ts` 和三个小程序页面，断言：固定错误文案存在；登录状态含 `accepted`；每个网络处理器先校验 `accepted`；所有页面都有协议复选控件与两份可点击协议；旧自动同意文案不存在。

- [ ] **Step 2: 注册测试命令**

在 `package.json` 增加：

```json
"test:logic:auth-consent": "tsx scripts/test-auth-consent-all-entry.ts"
```

并将其加入 `test:logic:all` 的认证测试段。

- [ ] **Step 3: 运行测试并确认先失败**

Run: `npm run test:logic:auth-consent`

Expected: FAIL，指出 App 登录和小程序认证入口缺少主动同意状态或仍包含自动同意文案。

### Task 2: 改造 App 与衣橱 Web App 共用认证组件

**Files:**
- Modify: `src/lib/auth-form-validation.ts`
- Modify: `src/components/auth/auth-gate.tsx`
- Test: `scripts/test-auth-consent-all-entry.ts`

**Interfaces:**
- Consumes: 现有 `LoginFormState`、`RegisterFormState`、`AuthGate` 认证回调与法律页导航。
- Produces: `LoginFormState.accepted: boolean`，以及登录/注册统一主动同意行为。

- [ ] **Step 1: 扩展登录状态并分离表单有效性与协议同意**

`LoginFormState` 增加 `accepted: boolean`。`isLoginFormValid` 与 `isRegisterFormValid` 只判断账号、密码、验证码等字段，不把 `accepted` 混进基础表单有效性；协议由提交前独立校验，以便未勾选时按钮可响应并显示红色原因。

- [ ] **Step 2: 增加统一错误常量和 API 前置校验**

在 `auth-gate.tsx` 定义：

```ts
const AUTH_CONSENT_ERROR = "请先阅读并同意《用户服务协议》和《隐私政策》";
```

登录、注册和注册验证码入口在调用认证 API 前检查 `accepted`，失败时设置页面内错误并返回。

- [ ] **Step 3: 渲染登录页协议控件和按钮视觉**

登录与注册表单使用原生 checkbox；协议按钮继续打开现有内嵌法律页。表单字段有效但未同意时按钮使用低饱和背景，勾选后恢复 `var(--color-denim, #156596)`；输入无效或请求中仍使用原生 disabled。

- [ ] **Step 4: 运行 App 合同测试与类型检查**

Run: `npm run test:logic:auth-consent && npm run test:logic:app-email-auth-flow && npm run test:logic:auth-client-shell && npm run typecheck`

Expected: 全部退出 0。

### Task 3: 改造微信小程序三个认证页面

**Files:**
- Modify: `apps/wechat-miniprogram/pages/login/index.ts`
- Modify: `apps/wechat-miniprogram/pages/login/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/login/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/login/password/index.ts`
- Modify: `apps/wechat-miniprogram/pages/login/password/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/login/password/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/login/register-email/index.ts`
- Modify: `apps/wechat-miniprogram/pages/login/register-email/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/login/register-email/index.wxss`
- Test: `scripts/test-auth-consent-all-entry.ts`
- Test: `scripts/test-wechat-email-auth-flow.ts`

**Interfaces:**
- Consumes: 现有微信登录、密码登录、邮箱验证码和邮箱注册服务函数。
- Produces: 三个页面各自的 `accepted: false`、`handleAgreementChange` 和 API 前置校验。

- [ ] **Step 1: 微信登录首页增加主动同意**

`onWechatLogin` 在设置 `submitting` 或调用 `loginWithWechatOpenId` 前检查 `accepted`。WXML 使用 checkbox-group 和独立协议链接；按钮通过 `login-action--consent-pending` 呈现未同意视觉，但保持可点击显示 `login-error`。

- [ ] **Step 2: 密码登录页增加主动同意**

账号密码有效但未同意时，点击登录只写入 `errorMessage`。勾选后清除仅由协议产生的错误，协议链接不触发 checkbox 切换。

- [ ] **Step 3: 邮箱注册页覆盖验证码和注册提交**

`sendCode` 和 `submit` 的第一项业务校验都是 `accepted`。发送验证码按钮与注册按钮在未同意时显示低饱和视觉但仍可点击；字段本身无效时维持现有 disabled 行为。

- [ ] **Step 4: 运行小程序验证**

Run: `npm run test:logic:auth-consent && npm run test:logic:wechat-email-auth-flow && npm --prefix apps/wechat-miniprogram run typecheck && node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --refresh`

Expected: 合同测试、TypeScript 和微信开发者工具编译全部退出 0。

### Task 4: 版本、Android APK、实际交互与双基线集成

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `VERSION_HISTORY.md`
- Generated delivery: `衣橱穿搭助手-v2.1.13-test.apk`（不提交 Git）

**Interfaces:**
- Consumes: Task 2 与 Task 3 的双端实现和验证结果。
- Produces: `2.1.13-test` 固定签名 APK、App Session 提交、`main` 与 `wechat/miniprogram` 本地正式基线集成结果。

- [ ] **Step 1: 递增版本并完成全量本地门禁**

将根版本从 `2.1.12-test` 升为 `2.1.13-test`，同步 lockfile。运行：

```bash
npm run test:logic:auth-consent
npm run test:logic:app-email-auth-flow
npm run test:logic:wechat-email-auth-flow
npm run typecheck
npm --prefix apps/wechat-miniprogram run typecheck
npm run build
```

- [ ] **Step 2: 构建并验证 Android APK**

确认固定签名文件存在，运行 `npm run android:apk`，把产物复制为根目录 `衣橱穿搭助手-v2.1.13-test.apk`。使用 Android 模拟器安装、启动并验证默认未勾选、红色错误、协议页返回、勾选后蓝色按钮、返回键和 logcat 无 FATAL。

- [ ] **Step 3: 在微信开发者工具模拟器验证**

打开微信登录、密码登录、邮箱注册三个页面，逐一检查默认未勾选、未勾选红色错误、协议可打开、勾选后主按钮视觉和 360px 等价窄屏无溢出。本次不上传体验版。

- [ ] **Step 4: 更新版本历史并提交 Session**

`VERSION_HISTORY.md` 记录文件、自动验证、Android 设备/版本/APK/签名、微信开发者工具验证及未覆盖风险。检查 `git diff --check`、staged 文件清单后提交任务范围修改。

- [ ] **Step 5: 串行合并回两个正式基线**

在 App 正式目录确认 tracked clean 后将 `codex/consent-all-entry-20260710` 合入 `main` 并重跑集成验证。从 `wechat/miniprogram` 创建独立小程序集成 worktree，合入最新 `main`，重跑小程序合同测试、typecheck 和微信开发者工具编译，再合入正式 `wechat/miniprogram`。确认两个正式基线均包含最终提交；如远端未领先，则推送并核验远端引用。
