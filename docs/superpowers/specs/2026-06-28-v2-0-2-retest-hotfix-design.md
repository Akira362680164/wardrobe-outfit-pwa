# v2.0.2-test 复测缺陷热修设计

## 目标

修复 v2.0.2-test 真机复测中仍阻断发布的交互与服务可用性问题，同时按用户最新决策下线当前本地长期备份入口。当前备份恢复链路不再作为发布门禁，跨设备/重装数据迁移以账号线上数据同步为准。

## 范围

本轮拆成 5 个独立提交：

1. 隐藏设置页“数据备份与恢复”入口。
2. 修复“安排套装”选择后未出现在日历/详情的问题。
3. 修复衣物详情编辑状态保存后详情页和首页统计不刷新的问题。
4. 修复远程诊断上传使用过期 access token 导致 `AUTH_TOKEN_INVALID` 的问题。
5. 修复注册页进入法律页后 Android 返回键回到登录页的问题。

不做 APK 版本号调整，不删除底层备份代码，不重构云同步数据模型，不修改 Android 签名或构建配置。

## 设计

### 1. 本地备份入口下线

在设置页隐藏“数据备份与恢复”用户入口，让用户无法触发当前不可靠的导出/恢复流程。底层长期备份模块和测试暂时保留，避免删除代码带来额外风险。验收标准从“备份恢复成功”改为“正式 UI 不再暴露失效备份恢复入口”。

### 2. 计划安排写入刷新

“安排套装”选择器当前会在旧 Dexie 写入和 workspace bridge 完成前关闭并刷新，导致 workspace 读取路径看不到新计划。修复为选择后等待完整链路：旧 Dexie 写入 → workspace bridge 完成 → `refreshState()` → 关闭选择器/提示成功。`bridgeWearSyncResult` 内部的计划、套装、衣物 bridge 调用也应从 fire-and-forget 改为可等待。

### 3. 衣物编辑状态刷新

详情编辑保存已通过 repository 写入 Dexie 并 bridge workspace，但保存后只更新局部 `viewingItem`，没有刷新全局衣物数组。修复为保存成功后 `await refreshState()`，并确保详情页展示的 item 与刷新后的全局状态一致。验收标准是状态保存后详情页立即变更，首页 chip 计数同步变化。

### 4. 诊断 token refresh

远程诊断上传前不只检查 access token 是否存在，还要检查是否新鲜。若 access token 过期且 refresh token 可用，先刷新会话再创建诊断工单；刷新失败或 refresh token 不可用时，提示“登录已过期，请重新登录”，不再把 `AUTH_TOKEN_INVALID` 显示成“稍后重试”。

### 5. 法律页返回

法律页是 auth gate 内部 view，不再依赖 Android WebView 对同 URL `history.back()` 的栈行为。从注册页打开用户协议/隐私政策时记录来源为 register；Android 返回键和法律页返回按钮直接回到 register view，保留注册表单状态。

## 验证

每个提交前执行 `git status --short` 并只提交本步相关文件。实现完成后运行：

- 相关逻辑测试：备份入口/设置页覆盖、outfit planning、garment edit/status、auth client shell、diagnostic events。
- 全量基础验证：`npm run typecheck`、`npm run test:logic:all`。
- 涉及 UI/状态变更，最终运行 `npm run build`。

## 风险

隐藏备份入口会改变用户可见功能，但这是用户明确决策；底层代码保留，后续如果需要可重新设计云同步导出方案。计划和诊断修复涉及异步顺序，重点风险是等待 bridge 后 UI 响应变慢，需要保持提示与错误处理清晰。
