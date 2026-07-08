# 微信小程序完整版执行看板

> 分支：`feature/wechat-miniprogram-v1`
> 工作区：`/Users/fangzheng/Documents/wardrobe-wechat-miniprogram`
> 任务书：`/Users/fangzheng/Downloads/CODEX_WECHAT_MINIPROGRAM_ZERO_START_TASK_V5_IDE_CLI_ONLY.md`

## 主控边界

- 小程序代码只写入 `apps/wechat-miniprogram/**`。
- 本轮用户明确要求不修改服务器后端代码；`services/wardrobe-api/**`、`packages/cloud-contracts/**`、migration 只读。
- 历史上已完成的微信手机号登录后端基础保留，但后续小程序开发先消费现有接口，不继续改后端契约。
- 业务读写复用现有 `/api/workspace/*`、`/api/assets/*`，不新增重复的 `/api/wardrobe/items`、`/api/outfits`、`/api/wishlist/items`。
- 任何云写入、云函数部署、体验版上传、Android APK 打包、生产迁移必须先获用户明确授权。
- 所有 agent 不得删除文件；如确需删除，必须走项目回收站规则。

## 并行泳道

| 泳道 | Owner | 状态 | 可改路径 | 验收 |
|---|---|---|---|---|
| 平台/CLI | subagent-wechat-platform | done | `docs/wechat-mini/*wechatide*`, `apps/wechat-miniprogram/scripts/**` | wrapper help/dry-run 通过，真实 DevTools 状态检查通过，项目已导入 |
| 小程序脚手架 | subagent-miniapp-architecture | done | `apps/wechat-miniprogram/app.*`, `project.config.json`, `pages/**`, `services/**`, `stores/**`, `utils/**` | 27 个页面占位齐全，小程序 TypeScript 检查通过 |
| UI 系统 | subagent-miniapp-ui-system | done | `apps/wechat-miniprogram/styles/**`, `components/ui/**`, `custom-tab-bar/**`, `assets/icons/**`, `docs/wechat-mini/ui-*`, `icon-license.md` | UI digest、可行性矩阵、token、基础组件和 tab bar 完成 |
| 微信登录后端 | subagent-auth-backend | done | `packages/cloud-contracts/src/auth/**`, `services/wardrobe-api/src/auth/**`, migrations/tests | 微信手机号登录契约、服务端 mock 测试和 SQL migration 完成 |
| 小程序登录前端 | subagent-miniapp-auth-frontend | done | `apps/wechat-miniprogram/pages/login/**`, `services/auth.ts`, `stores/session.ts` | getPhoneNumber + wx.login + 现有后端登录接口完成 |
| 小程序业务页 | subagent-miniapp-business-pages | in_progress | `apps/wechat-miniprogram/pages/{home,wardrobe,outfits,wishlist,settings}/**`, business services/stores | 首页摘要和衣橱列表已接现有 workspace 只读接口 |
| AI 后端 | subagent-ai-proxy-backend | blocked | `packages/cloud-contracts/src/ai/**`, `services/wardrobe-api/src/ai/**`, migrations/tests | 等认证和资产链路稳定 |
| 小程序 AI | subagent-miniapp-ai | blocked | `apps/wechat-miniprogram/pages/intake/**`, `pages/settings/ai-key/**`, `services/ai.ts`, `stores/ai-jobs.ts` | 等 AI 契约稳定 |
| Android AI | subagent-android-ai-client | blocked | `src/lib/**`, `src/components/**`, docs | 等 AI 后端稳定 |
| 质量验收 | subagent-quality-release | todo | `docs/wechat-mini/qa-report.md`, `release-checklist.md` | 阶段性记录验证证据 |

## 当前批次

- [x] 平台/CLI：实现 `wechatide:*` 脚本和 help 文档。
- [x] 小程序脚手架：创建完整原生小程序目录和页面占位。
- [x] UI 系统：提炼 UI 规范并建立 token / 基础组件 / tab bar。
- [x] 微信登录后端：新增契约、服务端接口、测试和 `wechat_accounts` migration。
- [x] AppID 配置：`project.config.json` 写入 `wx14a1a85b7b3844d0`。
- [x] 小程序登录前端：登录页接 `getPhoneNumber`、`wx.login` 和 `/api/auth/wechat/phone-login`。
- [x] 小程序只读业务闭环：首页摘要和衣橱列表复用现有 `/api/workspace/overview`、`/api/workspace/garments`。
- [x] CLI 补缺：新增 `wechatide-help`、`wechatide-preview`、`wechatide-upload`；上传脚本默认拒绝，必须显式确认。

## 当前验证记录

- `npx tsc --noEmit -p apps/wechat-miniprogram/tsconfig.json`：通过。
- `npm --prefix apps/wechat-miniprogram run typecheck`：通过。
- 小程序 JSON 解析、27 个页面文件齐全、组件引用检查、WXSS 文本防溢出静态检查：通过。
- `node apps/wechat-miniprogram/scripts/wechatide-status.mjs --no-projects`：真实 DevTools 状态检查通过，skill `0.1.18`。
- `node apps/wechat-miniprogram/scripts/wechatide-open.mjs --import-only`：项目导入成功。
- `node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --refresh`：通过。
- `compile_wxml` 覆盖 `pages/login/index.wxml`、`pages/home/index.wxml`、`pages/wardrobe/index/index.wxml`：通过。
- `simulator_open_page` 覆盖 `pages/login/index`、`pages/home/index`、`pages/wardrobe/index/index`：通过。
- `get_app_console_content` grep `Error|Cannot|未找到|TypeError|ReferenceError`：无命中。
- `get_app_network_content` grep `api/auth|api/workspace|failed|error|403|401|500`：无命中。
- `node --check` 覆盖 `apps/wechat-miniprogram/scripts/wechatide-*.mjs`：通过。
- `npm run wechatide:preview`：通过，预览二维码以 window 方式展示。
- `npm run wechatide:upload -- --version 0.1.0 --dry-run`：按预期拒绝上传；带 `--confirm-upload --dry-run` 仅打印命令，未上传。
- `git diff -- services/wardrobe-api packages/cloud-contracts | wc -l`：`0`，本轮未改后端和共享契约。
- `npm run cloud:contracts:typecheck`、`npm run api:typecheck`、`npm --workspace @wardrobe/wardrobe-api run test -- tests/wechat-phone-auth.test.ts`、`npm run typecheck`：通过。

## 当前未完成

- 真实手机号登录 live 验证：依赖微信平台手机号能力、合法域名、AppSecret 和小程序 API baseURL 配置。
- 小程序图片资产显示：当前衣橱页只读 payload 里的图片 URL；正式资产下载/缩略图 URL 还未接。
- 小程序上传、录入确认、套装、种草、AI、设置页业务仍未完成。
- AI 后端代理与 Android AI 共享改造因用户要求本轮不改后端，保持待办。
- 预览二维码和体验版上传未执行；体验版上传必须用户明确授权。
