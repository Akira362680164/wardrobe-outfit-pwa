# 微信小程序完整版执行看板

> 分支：`feature/wechat-miniprogram-v1`
> 工作区：`/Users/fangzheng/Documents/wardrobe-wechat-miniprogram`
> 任务书：`/Users/fangzheng/Downloads/CODEX_WECHAT_MINIPROGRAM_ZERO_START_TASK_V5_IDE_CLI_ONLY.md`

## 主控边界

- 小程序代码只写入 `apps/wechat-miniprogram/**`。
- 共享契约只写入 `packages/cloud-contracts/**`。
- 后端新增能力只写入 `services/wardrobe-api/src/auth/**`、`services/wardrobe-api/src/ai/**`、`services/wardrobe-api/src/db/**`、相关测试和迁移。
- 业务读写复用现有 `/api/workspace/*`、`/api/assets/*`，不新增重复的 `/api/wardrobe/items`、`/api/outfits`、`/api/wishlist/items`。
- 任何云写入、云函数部署、体验版上传、Android APK 打包、生产迁移必须先获用户明确授权。
- 所有 agent 不得删除文件；如确需删除，必须走项目回收站规则。

## 并行泳道

| 泳道 | Owner | 状态 | 可改路径 | 验收 |
|---|---|---|---|---|
| 平台/CLI | subagent-wechat-platform | todo | `docs/wechat-mini/*wechatide*`, `apps/wechat-miniprogram/scripts/**` | `wechatide` help/open/preview 脚本可运行 |
| 小程序脚手架 | subagent-miniapp-architecture | todo | `apps/wechat-miniprogram/app.*`, `project.config.json`, `pages/**`, `services/**`, `stores/**`, `utils/**` | 小程序 TypeScript 基础检查可运行 |
| UI 系统 | subagent-miniapp-ui-system | todo | `apps/wechat-miniprogram/styles/**`, `components/ui/**`, `custom-tab-bar/**`, `assets/icons/**`, `docs/wechat-mini/ui-*`, `icon-license.md` | UI digest、可行性矩阵、基础组件完成 |
| 微信登录后端 | subagent-auth-backend | todo | `packages/cloud-contracts/src/auth/**`, `services/wardrobe-api/src/auth/**`, migrations/tests | 微信手机号登录契约和测试完成 |
| 小程序业务页 | subagent-miniapp-business-pages | blocked | `apps/wechat-miniprogram/pages/{home,wardrobe,outfits,wishlist,settings}/**`, business services/stores | 等脚手架和 UI 基础稳定 |
| AI 后端 | subagent-ai-proxy-backend | blocked | `packages/cloud-contracts/src/ai/**`, `services/wardrobe-api/src/ai/**`, migrations/tests | 等认证和资产链路稳定 |
| 小程序 AI | subagent-miniapp-ai | blocked | `apps/wechat-miniprogram/pages/intake/**`, `pages/settings/ai-key/**`, `services/ai.ts`, `stores/ai-jobs.ts` | 等 AI 契约稳定 |
| Android AI | subagent-android-ai-client | blocked | `src/lib/**`, `src/components/**`, docs | 等 AI 后端稳定 |
| 质量验收 | subagent-quality-release | todo | `docs/wechat-mini/qa-report.md`, `release-checklist.md` | 阶段性记录验证证据 |

## 当前批次

- [ ] 平台/CLI：实现 `wechatide:*` 脚本和 help 文档。
- [ ] 小程序脚手架：创建完整原生小程序目录和页面占位。
- [ ] UI 系统：提炼 UI 规范并建立 token / 基础组件 / tab bar。
- [ ] 微信登录后端：新增契约草案、服务端接口骨架和测试。

