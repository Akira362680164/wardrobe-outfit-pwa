## 2026-07-09 / v2.1.8-test / Codex — 压缩 VERSION_HISTORY 主文件

- **执行 Agent**：Codex（未触发 subagent：用户未通知）。
- **目的**：按用户要求压缩过长的版本历史文档，把主文件从逐条长日志改为可接力的短摘要；完整旧文本保留在 Git 历史中，不再复制到本文件。
- **版本变更**：无；当前应用版本仍为 `2.1.8-test`。
- **改动文件**：`VERSION_HISTORY.md`。
- **压缩原则**：保留当前状态、最近关键变更、版本节点、交付物、验证口径和未验证风险；删除长篇过程日志、重复验证输出、过期执行细节和可从 Git diff 还原的文件清单。
- **验证结果**：`git diff --check` 通过。
- **风险门禁**：low（文档治理；不改运行时代码、不改线上 API、不改 Android、不打 APK）；未触发 subagent：用户未通知。
- **未验证风险**：旧条目的完整逐文件/逐命令细节需通过 Git 历史查阅，例如 `git show 3ae15e5^:VERSION_HISTORY.md`。

## 当前接力状态

- 当前版本：`2.1.8-test`。
- 当前分支：`codex/minimax-server-intake`。
- 当前长期规则：`AGENTS.md` 是本机忽略文件，已补充 UI 设计必须遵守 `docs/designs/wardrobe-ui-spec.md`，并补齐微信小程序目录确认、共享契约、线上数据源、隐私边界和验证要求。
- 当前 UI 标准：`docs/designs/wardrobe-ui-spec.md` 是唯一事实源，`docs/designs/wardrobe-ui-spec.html` 由脚本生成，真实结构以 `docs/designs/v03-alpha-real-screenshots/` 为基准。
- 当前 AI 边界：录入类和展示增强类 MiniMax 能力已迁移为后端代调；旧前端直连的推荐、天气判断、买前评估和试穿预览实现已删除或下线。
- 当前线上入口：App 构建 API 指向 `https://api.zhengfangapps.cloud`；小程序 API 由小程序侧 `app.ts` 的 `globalData.apiBaseUrl` 驱动。
- 当前 Android 交付要求：固定签名 `CN=fangzheng`，APK 文件名格式 `衣橱穿搭助手-vX.Y.Z.apk`，涉及 APK 的改动必须递增版本并做真机或模拟器验证。
- 既有未跟踪项：`.ai-bridge/`、`.env.production`、`deploy/.env.production.example`、`docs/agent-task-bundles/test-system-remodel-bundles.md`、`tmp/`；本次压缩不处理这些文件。

## 近期关键记录（2026-07-09 ~ 2026-07-08）

### 2026-07-09 / v2.1.8-test / Codex — AGENTS 补充 UI 设计规范与小程序规则

- 目的：将 UI 设计必须遵守项目设计规范、小程序共享线上数据源和共享契约等长期规则写入 `AGENTS.md`。
- 改动：本机 `AGENTS.md` 增加 `UI 设计与交互规则`，并扩充 `微信小程序开发工具`；`VERSION_HISTORY.md` 记录该文档治理动作。
- 验证：`git diff --check` 通过。
- 风险：low；`AGENTS.md` 被 `.gitignore` 忽略，提交只包含版本历史记录。提交：`3ae15e5`。

### 2026-07-09 / v2.1.8-test / Codex — 小程序 UI gap 执行方案

- 目的：把小程序 UI 差距修复收敛为可交给 subagent 的执行任务包，并追加衣橱首页卡片修复项。
- 改动：新增/更新 `docs/agent-task-bundles/2026-07-09-wechat-miniprogram-ui-gap-execution-plan.md`，覆盖胶囊避让、UI token、加号弹层、首页瀑布卡片 3:4、颜色色块和穿着摘要。
- 验证：只读核对相关 App/小程序文件；未运行小程序 typecheck 或微信开发者工具编译。
- 风险：low；方案尚未实施。提交：`23d5bde`、`c177eee`。

### 2026-07-08 / v2.1.8-test / Codex — MiniMax 调用迁移到后端

- 目的：把单品录入、编辑页重新识别、套装基础信息生成，以及当前仍在使用的展示增强类 AI 能力改为 wardrobe API 后端代调 MiniMax。
- 改动：新增/扩展 `packages/cloud-contracts` AI 契约、`services/wardrobe-api/src/ai/*` 路由与服务、前端 `online-ai-intake-client` / `online-ai-enhancement-client` 调用；删除旧前端直连死功能。
- 验证：cloud-contracts build、API typecheck、AI intake tests、`npm run typecheck`、`npm run build`、多条 intake/diagnostic 合同测试通过；部署后 `npm run v03-alpha:capture` 完成 live AI 录入识别复测。
- 风险：high；未对所有增强能力做真实 MiniMax live 验证，未打 APK。提交：`db6f43d`、`9faa819`、`4d8bcf1`。

### 2026-07-08 / v2.1.8-test / Codex — UI 规范与运行时视觉收口

- 目的：把 UI 规范从手绘结构切换为真实业务流截图基准，并把运行时全局背景、圆角、毛玻璃、Toast、TopBar、底部导航、录入入口等视觉规则落到代码。
- 改动：`docs/designs/wardrobe-ui-spec.md/html`、v03-alpha 截图资产、`src/app/globals.css`、`wardrobe-app.tsx`、`app-sub-page-top-bar.tsx`、录入/详情/卡片相关组件和 UI 合同测试。
- 验证：UI spec build/check、UI preview tests、v03-alpha capture/build、相关 UI token/overlay/detail/intake 测试、`npm run typecheck`、`npm run build` 通过。
- 风险：high；多轮运行时 UI 和截图资产更新，未在 Android APK 中做完整视觉回归。关键提交：`46b93e2`、`a585a15`、`554263d`、`216e6fb`、`3bd749a`、`acb0e5d`、`4251e3c`、`5c7f7b0`。

### 2026-07-08 / v2.1.8-test / Codex — App API 切换正式 HTTPS 域名

- 目的：将 App 构建 API 地址切到 `https://api.zhengfangapps.cloud`。
- 改动：`.env` / `.env.production` 本机文件、`deploy/.env.production.example`、生产部署说明、构建环境校验和服务端 health CORS 测试。
- 验证：live health/ready/version、TLS 证书、`node scripts/validate-cloud-build-env.mjs`、API health tests、`npm run typecheck` 通过。
- 风险：medium；未重新打 APK。提交：`d35f463`。

### 2026-07-08 / v2.1.8-test / Codex — 统一种草与衣物录入缩略图保存

- 目的：修复种草正式图片缺 `thumbnail`，收拢种草和衣物录入的非必要差异。
- 改动：共享图片保存 helper、种草/衣物保存链、相关合同测试、版本从 `2.1.7-test` 升到 `2.1.8-test`。
- 验证：typecheck、相关逻辑测试、Android release 构建和模拟器启动验证通过；APK 元数据为 `versionName 2.1.8-test`、`versionCode 20108`、签名 `CN=fangzheng`。
- 风险：high；交付 APK 为根目录 `衣橱穿搭助手-v2.1.8-test.apk`。提交：`07b86e3`。

## 阶段摘要

### 2026-07-07 / v2.1.4-test ~ v2.1.7-test

- 小程序：记录微信开发者工具 CLI `wechatide` 和小程序 skill 路径；后续小程序验证优先使用 CLI。
- 移动端方向：取消横屏版长期要求，固定 Android 竖屏，弹窗/底部面板/图片预览/设置页按手机竖屏验收。
- 交付：v2.1.4-test 固定签名 APK 重新打包；v2.1.6-test 合并 main 并交付固定签名 APK。
- 交互修复：录入页选图、裁切旋转、颜色色卡、确认页重新识别等回归修复。
- 关键提交：`7b73456`、`5d9bb2f`、`fcf7d97`、`c703be6`、`ef368fe`、`b84b8e9`。

### 2026-07-01 / v2.1.3-test

- 目的：执行 v2.1.3 remodel 合并、测试体系补齐、E2E/Integration/Component/API 套件验证、Android 自动化验证和公开 GitHub 推送。
- 验证：PostgreSQL 测试环境、Playwright E2E 17/17、component/API/contract 测试、APK + 模拟器验证、public staging 验证。
- 交付：公开 GitHub force-with-lease 推送；主仓库记录 public push；执行计划 close。
- 风险：high；涉及测试体系、发布链和公开导出。

### 2026-06-29 ~ 2026-06-30 / v2.0.14-test ~ v2.1.1-test

- 图片语义：固定完整原图、`cropBox`、缩略图和云端 original/thumbnail 双 variant 语义。
- 云恢复：补齐资产上传、下载、SHA 校验、缓存失效、恢复后 UI 重读和真实 API 二进制校验。
- Android：v2.0.15-test 固定签名 APK 在 Pixel 6 AVD / Android 15 安装和冷启动验证通过；v2.1.1-test 修复 Capacitor HTTP 图片 Blob 解码。
- 风险：high；WebView 内完整选图、裁切、云恢复仍需要真实联合验收。

### 2026-06-23 ~ 2026-06-25 / v1.1.19 ~ v1.1.28

- 重点：真机回归修复、诊断日志、加号/详情返回、温度控件、字段模型统一、相册返回、六页字段 UI、公开 GitHub 规则和 v1.1.28 release。
- v1.1.22：统一衣物与种草字段模型到 `ColorInfo` / catalog v2，涉及类型、迁移、AI prompt、推荐、种草转换、详情、统计和大批测试。
- v1.1.24：固化 GitHub 公开仓库上传规则，公开版默认排除 AGENTS/CLAUDE/MINIMAX、签名、APK、env、review artifacts 和旧 Git 历史。
- v1.1.28：修复嵌套 AI 颜色字段解析漏洞，交付 release APK 并推送公开版；同时曾执行一次 history 裁剪。
- 风险：多为 high；完整细节见 Git 历史。

### 2026-06-15 及更早 / v1.1.18 之前

- 已压缩为历史基线：主要包括 P0 hotfix、首页卡片、编辑裁切入口、种草返回、单品删除、早期 APK 交付、备份/导入导出和基础移动端体验修复。
- 查阅方式：使用 Git 历史查看本文件旧版本。

## 查阅完整旧历史

- 查看压缩前完整版本：`git show 3ae15e5^:VERSION_HISTORY.md`。
- 查看某次提交改了什么：`git show --stat <commit>` 或 `git show <commit> -- <path>`。
- 查看本文件历史：`git log --oneline -- VERSION_HISTORY.md`。
- 恢复旧文件到临时路径：`git show <commit>:VERSION_HISTORY.md > /tmp/VERSION_HISTORY.old.md`。

## 后续记录规则

- 新记录仍放在最顶部，保持短条目：目的、版本变更、改动范围、验证结果、风险门禁、未验证风险。
- 普通文档治理只需记录 `git diff --check`；不要粘贴长日志。
- 代码或 APK 改动只记录关键命令结果和产物元数据；详细 stdout/stderr 不写入主文件。
- 当主文件再次超过约 800 行时，继续按“最近少压缩、旧记录多压缩”的方式压缩，不新增大备份文件。
