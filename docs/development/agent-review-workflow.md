# Agent 审查与协作工作流

本文承接本机根 `AGENTS.md` 的风险门禁、独立审查和多 Agent 操作细则。强制边界仍以 `AGENTS.md` 为准。

## 1. 是否启动 subagent

- 只有用户明确要求“启动 subagent”“独立审核”“并行 Agent”或同等意思时，才允许启动 subagent。
- 不得因为风险等级、改动规模或 Agent 自己的判断自动委派。
- 用户没有明确通知时，所有风险等级都由当前 Agent 通过本地验证收口，并在版本历史中写明“未触发 subagent：用户未通知”。

## 2. 风险门禁

### High

- 数据结构、PostgreSQL schema、事务、revision、资产生命周期、线上 Repository 或旧数据清理。
- MiniMax Key、图片上传、AI prompt、网络调用、隐私边界、错误兜底或模型解析。
- Android 原生代码、签名、Manifest、Gradle、Capacitor、APK、版本号或构建链。
- 裁切、图片处理、触摸、动画、弹窗、底部导航和沉浸式详情。
- 跨 5 个及以上文件、diff 约 250 行以上或核心大文件的大范围改动。
- 需要依赖其他 Agent/用户未提交改动继续开发。
- 真机回归、安装失败、数据异常、AI 误用、隐私风险或发布前验收反馈。

High 必须加强本地验证；只有用户明确通知时才启动独立审查。

### Medium

- 修改 2–4 个源码文件或 diff 约 80–250 行。
- 用户可见 UI 文案、布局、状态流或组件抽象变化。
- 修复测试失败、lint/typecheck 警告或调整测试覆盖。

Medium 应增加针对性验证；只有用户明确通知时才启动独立审查。

### Low

- 纯文档、版本历史、README、本机 AGENTS、任务说明、`.gitignore` 或提示词任务包。
- 小范围文案、注释和非行为性格式整理。
- 只读调查、方案设计或代码审查报告。

Low 通常只需文档检查、链接检查、`git diff --check` 和范围核对。

## 3. 本地审查

完成修改后可运行：

```bash
node scripts/review-gate.mjs --staged
# 或检查整个工作区
node scripts/review-gate.mjs
```

每次修改都要在 `VERSION_HISTORY.md` 写明风险等级、本地验证和 subagent 状态。

## 4. 用户明确要求独立审查时

审查 Agent 必须使用自己的分支、worktree 和目录；主 Agent 提供目标、冻结提交、文件所有权、已运行验证和明确禁止事项。审查任务默认只读，除非用户明确要求审查 Agent 同时修复。

推荐任务说明：

```text
你是本项目的独立审查专家。请先读取 AGENTS.md、README.md、package.json、VERSION_HISTORY.md 最新接力记录和本次改动涉及的文件。你的任务不是继续开发，而是挑出影响用户使用、移动端体验、数据安全、Android APK、MiniMax 兜底、类型/逻辑正确性和视觉表现的问题。

输出顺序：
1. 按严重程度列问题，给出文件和行号。
2. 列出未验证风险。
3. 给出是否建议交付。
```

## 5. 多 Agent 交接

- 每组修改保持小而完整，不把无关重构混入修复。
- 交接必须写清目标、基线/冻结提交、已改文件、验证结果、未完成风险和下一步。
- Agent 专用入口只能跳转到根 `AGENTS.md`，不得复制长期规则形成平行事实源。
- 共享成果必须先提交并进入约定基线，其他 Session 不得依赖未提交工作区。
- 合入、推送和临时 worktree 清理遵守 `docs/development/git-session-workflow.md`。

## 6. 最终回复

只说明改了什么、产物路径、验证结果、commit/集成状态和未验证风险。不要复制大段过程日志，也不要把未现场验证的内容写成已通过。
