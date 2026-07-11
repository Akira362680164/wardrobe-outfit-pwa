# APP / 微信小程序一致性审计规则

## 本地代码

- 只使用本地 `main` 和 `wechat/miniprogram` HEAD；禁止 `git fetch`、`git pull` 或使用 `origin/*` 覆盖本地结果。
- 正式集成目录只用于基线检查、串行集成和集成验证。任何代码修改必须在独立 `codex/` 分支和独立 worktree 中完成。
- 根工作区未提交修改不得删除、覆盖或夹带提交。每轮运行必须生成 `baseline-lock.json`，运行期间任一 SHA 或 tree hash 变化时立即失败。
- 删除 worktree 或测试目录必须逐项检查后移动到系统废纸篓；禁止 `rm -rf`、`git clean`、`git worktree remove` 和脚本递归强制删除。

## 基准

- APP 是唯一功能和视觉基准。首次正式审计与最终回归使用同一 APP SHA。
- 审计期间禁止修改业务样式和功能；默认只允许在修复阶段修改小程序。
- APP 基准截图在同一 `runId` 内不可更新。框架建设、首次审计、小程序修复和最终回归使用不同 `runId`。

## 覆盖

- 不得只测试主流程。所有非登录 Screen、State、Overlay、Action、Transition 和 Side Effect 必须进入库存。
- 静态发现和运行时发现的交互元素都必须执行；三点菜单、无文字图标、AI、上传、长按、滑动、返回均不得遗漏。
- 新展开的菜单项和弹窗按钮必须递归加入状态图。没有证据的用例必须标记 `NOT_EXECUTED`，不得标记 `PASS`。

## 服务端

- 所有写操作必须有客户端请求证据和服务端结果证据；HTTP 200 不能单独视为成功。
- 上传必须验证服务端收到、对象存在、大小和 checksum。AI 必须验证真实请求、响应契约、失败与重试；不得声称存在服务端 job，除非接口实际返回 jobId。
- 取消操作必须验证没有产生非预期写请求。测试数据只能写入明确隔离的测试环境和 fixture 命名空间。

## 截图

- 每个 Action 保存 before、immediate、settled 和 return/close；每个视觉检查保存 APP、mini、overlay、pixel diff 和 geometry diff。
- 禁止用整屏总差异比例掩盖关键控件差异。

## 微信平台例外

- 只允许遮罩运行时胶囊矩形和经批准的安全边距；禁止遮罩整个顶部栏。
- 返回按钮白框和缺少毛玻璃不是平台例外。Agent 不得新增或扩大 `platform-exceptions.yaml`。

## 结果

- 结果只能是 `PASS`、`DEFECT`、`ALLOWED_PLATFORM_DIFFERENCE`、`BLOCKED`、`NOT_EXECUTED`。
- `unmapped`、`notExecuted`、`blocked`、`missingEvidence`、`unclassified` 中任一非零，审计门禁失败。
- 审计完整性门禁通过前禁止开始自动修复。

## 修复

- 修复只以 `defects.json` 为输入，默认只修改小程序。
- 不得修改 APP 基准、阈值、fixture 或平台遮罩来隐藏缺陷。
- 每条缺陷必须定向复测、影响面回归并重新生成证据。
