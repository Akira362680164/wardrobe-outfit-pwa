# Component Reuse Refactor Implementation Plan

> **For agentic workers:** Execute inline task-by-task. Do not start subagents unless the user explicitly requests one.

**Goal:** 接通已有共享 UI、删除重复实现，并在独立阶段完成线上图片按需加载与局部重试。

**Architecture:** UI 收口只改变渲染结构，不改变领域状态和 Repository 写入。图片加载作为独立数据边界改造，使用现有 `OnlineImageClient` 和服务端 asset refs，不新增缓存。

**Tech Stack:** Next.js 15、React、TypeScript、Tailwind、Capacitor、Fastify/PostgreSQL。

## Global Constraints

- 线上服务器仍是唯一正式数据源。
- 写成功后读回；失败保留当前页面内存草稿。
- 不新增依赖、持久缓存、Outbox、乐观更新或后台同步。
- 每个任务更新 `VERSION_HISTORY.md` 并独立提交。

### Task 1: 页面壳、顶部栏、瀑布流与区块卡片

**Files:** `garment-detail-3.0.tsx`、`outfit-list-view.tsx`、`wishlist-view-2.0.tsx`、`item-edit-page-shell.tsx`、`app-sub-page-top-bar.tsx`、`item-shell/*section-card*`、相关测试。

- [ ] 先增加页面真实接入断言并确认失败。
- [ ] 三类详情接入 `ItemDetailPageShell`，种草编辑接入 `ItemEditPageShell`。
- [ ] `ItemEditPageShell` 复用 `AppSubPageTopBar`。
- [ ] 套装列表接入 `CatalogWaterfallGrid/CardShell`，安全移除旧卡片。
- [ ] 抽取 `ItemSectionCard`，保留两个薄包装导出。
- [ ] 运行 `npm run typecheck && npm run test:logic:shared-item-shells && npm run test:logic:detail-shell && npm run build`。
- [ ] 更新版本历史并提交 `refactor(ui): wire shared page and card shells`。

### Task 2: 弹窗、菜单和异步按钮

**Files:** `src/components/dialogs/*`、`async-action-button.tsx`、三类详情、`wardrobe-app.tsx`、相关测试。

- [ ] 增加固定遮罩、原生 confirm、种草菜单真实接入的失败断言。
- [ ] 用 `MotionSheet` 实现公共确认/提示组件；提交中禁止关闭和重复提交，错误保留。
- [ ] 种草详情改用锚定 `MotionPopoverMenu`。
- [ ] 删除 `window.confirm()`；只迁移语义一致的确认场景。
- [ ] 接入统一异步按钮，复用现有 Spinner。
- [ ] 运行定向逻辑测试、typecheck、build 和移动端弹窗检查。
- [ ] 更新版本历史并提交 `refactor(ui): unify dialogs menus and async actions`。

### Task 3: 首屏读取与复用契约测试

**Files:** `wardrobe-app.tsx`、`use-wardrobe-data-controller.ts`、`scripts/test-component-reuse-contract.ts`、`package.json`。

- [ ] 增加 Overview 启动只调用一次的可执行测试。
- [ ] 删除 `WardrobeApp` 挂载后无条件 `refreshState()`，保留无 Gate fallback。
- [ ] 测试真实 import/JSX 引用，不用注释或文件存在性通过。
- [ ] 运行线上逻辑测试、全量逻辑测试和 build。
- [ ] 更新版本历史并提交 `refactor(online-ui): remove duplicate overview fetch`。

### Task 4: 图片按需加载与局部重试

**Files:** `online-repository.ts`、`online-image-client.ts`、业务类型映射、`online-asset-image.tsx`、卡片与详情图片入口、相关测试/E2E。

- [ ] 先用测试证明 Overview 不应等待 original、错误不能伪装成无图。
- [ ] 在业务实体映射中保留只读 asset ref 元数据；不写入服务器 payload。
- [ ] 列表只加载 thumbnail，详情挂载后加载 original。
- [ ] `OnlineAssetImage` 显示稳定占位、错误和局部重试；卸载释放 Object URL。
- [ ] 失败不阻断文字结构，不引入持久缓存。
- [ ] 运行 typecheck、线上逻辑、API 测试、真实 PostgreSQL E2E 和 build。
- [ ] 更新版本历史并提交 `refactor(online-images): load assets on demand with retry`。

### Task 5: 发布验证

- [ ] 运行 `npm run typecheck`、`npm run test:logic:all`、`npm run api:typecheck`、`npm run api:test`、`npm run test:e2e`、`npm run build`。
- [ ] 递增到下一测试版本，构建固定签名 APK。
- [ ] Android 模拟器验证详情、编辑、菜单、弹窗、横竖屏、返回键、图片失败重试和失败写入保留草稿；筛查致命 logcat。
- [ ] 更新 `VERSION_HISTORY.md` 和执行报告，提交最终验收记录。
