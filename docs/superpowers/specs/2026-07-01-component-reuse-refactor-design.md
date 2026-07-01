# v2.1.1-test 组件复用收口设计

## 目标

在不改变线上唯一数据源、业务规则、API 合约和草稿重试语义的前提下，删除已经出现的重复 UI 实现，并让已有共享组件真正接入业务页面。

## 审查结论

ChatGPT 报告的 R1-R6、R8-R12 与当前源码基本一致：详情/编辑页壳未接入，套装仍使用旧瀑布流卡片，确认弹窗和种草菜单重复，首屏 Overview 被再次请求，现有共享组件测试主要验证文件存在。R7 中“图片按需加载和局部重试”也成立，但它会改变 Repository 到 UI 的图片数据边界，属于独立高风险改造，不与普通组件重构混成一个提交。

## 方案

1. **页面壳与卡片**：接入现有 `ItemDetailPageShell`、`ItemEditPageShell`、`AppSubPageTopBar`、`CatalogWaterfallCardShell/Grid`；抽取一个 `ItemSectionCard`，原 Detail/Edit 名称保留为薄包装。
2. **交互公共件**：复用现有 `MotionSheet`、`MotionPopoverMenu` 和 Spinner，新增最小 `ConfirmActionSheet`、`NoticeSheet`、`AsyncActionButton`；只迁移语义一致的确认/提示场景，不把选择器、编辑器强塞进确认弹窗。
3. **首屏读取**：保留 `WorkspaceGate` 的 `initialSnapshot`，删除 `WardrobeApp` 挂载后的无条件 `refreshState()`；写后读回、用户重试和登录切换保持不变。
4. **图片加载**：业务实体保留服务端资产引用；列表只请求 thumbnail，详情按需请求 original；单图组件管理 loading/error/retry，失败不再被映射成普通空图。该段单独提交、单独做真实服务器与 Android 验证。
5. **测试**：新增真实 import/JSX 接入断言，禁止存在性绿灯；保留类型、逻辑、API、E2E、构建和 Android 门禁。

## 明确不做

- 不合并单品、套装、种草的领域内容或表单状态。
- 不新增缓存、离线队列、乐观写入、后台同步或依赖。
- 不为“统一”改动 API、数据库 schema 或 MiniMax 业务逻辑。

## 验收

共享页面壳/卡片/弹窗/菜单真实接入；原生 `confirm()` 清零；Overview 冷启动仅请求一次；列表 thumbnail、详情 original、图片失败局部重试；失败写入留在原页面并保留草稿；全量测试、E2E、Android 模拟器和固定签名 APK 通过。
