# Wardora 新首页 P2 实施证据

日期：2026-07-18

版本：`2.1.31-test`

## 冻结边界

- 复用既有 Recommendation accept 事务、workspace plan mark-worn/cancel-worn 与正式套装创建；没有平行接口。
- 新增 `CancelPrimaryPlan` 服务与 `/api/recommendations/plans/cancel-primary`；新增受控拒绝 action 合同与路由，不新增数据库迁移。
- App 写成功只在服务端事务完成并刷新工作区后展示；失败保留内存草稿与稳定 mutation ID。没有 localStorage、IndexedDB、Outbox 或乐观更新。
- 本批不含 Canvas、系统定位、微信小程序页面或生产默认首页切换。

## 手写与事务 Fixture

- P2 App Fixture：采用、replace-one、cancel-only、cancel+promote backup、wear/unwear、save outfit 独立失败承载与稳定 mutation ID。
- 真实 PostgreSQL：cancel+promote、cancel-only、worn 拒绝、同 ID 重放、不同 ID 双设备竞争、`afterPrimaryCancel` 故障全回滚。
- API：accept/cancel/reject 功能开关、鉴权设备转发、严格 body 与受控 reason。

## 交付门禁

- `npm run test:logic:home-feed-p2`：通过。
- `npm run test:logic:home-feed-p1`：P1/P1.1/P1.2/P1.3 全部通过。
- P2 严格合同 + Recommendation 路由：7/7 通过；既有 accept 合同回归同时通过。
- 真实 PostgreSQL accept 22/22、cancel/reject 4/4 通过，含并发、幂等、变更 payload 拒绝和故障回滚。
- API full：39 个测试文件、343/343 通过。
- `npm run typecheck`、`npm run cloud:contracts:typecheck`、`npm run api:typecheck`：通过。
- 共享目录兼容：domain catalog、miniprogram catalog `--check`、catalog consistency 与小程序 typecheck 均通过；检查未修改小程序文件。
- UI：motion/preview/token/overlay/Back/overflow/reuse 合同均通过，`docs:ui-spec:check` 通过。
- `npm run build`：通过，运行时版本 `2.1.31-test`、versionCode `20131`。
- `git diff --check`：通过。

浏览器/Android 完整业务链与 P3 一并在最终候选 APK 上执行，不用浏览器结论冒充 Android。
