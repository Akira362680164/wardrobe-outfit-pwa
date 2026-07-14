# 代码审查导出与公开仓库发布

本文承接本机根 `AGENTS.md` 的 ChatGPT 审查包和公开 GitHub 仓库操作细则。这两类流程都只能在用户明确要求时执行，不属于普通开发收口。

## 1. ChatGPT 审查用代码库导出

触发语义包括“给 ChatGPT 打包代码”“导出 ChatGPT 审查包”“更新桌面 ChatGPT 导出目录”等。默认不执行。

固定入口：

- 脚本：`scripts/export-chatgpt-codebase.mjs`
- npm：`npm run export:chatgpt`
- 输出：`$HOME/Desktop/wardrobe-chatgpt-codebase`
- 输出不进 Git，也不打 ZIP。

预期文件：

```text
00-PROJECT_MAP.md
01-CODEBASE_MERGED.md
02-CODEBASE_MAP.md
03-GIT_STATE.md
04-VALIDATION_REPORT.md
05-CHANGED_FILES_MERGED.md
06-CHANGED_FILES_MAP.md
README_FOR_CHATGPT.md
```

执行流程：

1. 读取根治理、README、package、最新版本历史和本次范围。
2. 用 `git status --short` 记录导出时的真实工作区状态。
3. 运行 `node scripts/export-chatgpt-codebase.mjs`。脚本应保留已有 `04-VALIDATION_REPORT.md`，避免覆盖真实验证记录。
4. 按任务风险运行验证；完整审查包默认记录 `typecheck`、相关逻辑测试、`test:logic:all` 和 `build` 的命令、时间、退出码和摘要。
5. 检查 8 个文件存在，并用 `wc -l` 确认合并包非空。
6. 在 `VERSION_HISTORY.md` 记录刷新目的、源码是否变化、验证和 low 风险门禁。

可提交脚本、npm 配置和版本历史；禁止提交桌面导出目录、合并包、APK、签名文件和构建产物。纯刷新桌面目录不需要源码 commit，但仍需按用户任务记录交付状态。

## 2. 公开 GitHub 仓库发布原则

只有用户明确要求上传或更新公开仓库时执行。

- 只从本地正式 `main` 导出，不上传开发分支。
- 不复用私有仓库 `.git` 历史；公开版使用独立 staging 仓库重新初始化。
- 默认保留源码、Android 工程源码、资源、README、版本历史、package/lockfile、必要配置和测试脚本。
- 默认排除本机 Agent 入口、密钥、环境文件、签名、APK、备份、浏览器资料、审查产物和旧 Git 对象。

必须排除：

```text
.git/
.claude/
.mavis/
.opencode/
.env
.env.*
AGENTS.md
CLAUDE.md
MINIMAX.md
android/signing/
android/local.properties
node_modules/
.next/
out/
dist/
coverage/
android/.gradle/
android/app/build/
android/build/
android/app/src/main/assets/public/
apk-archive/
*.apk
*.aab
*.aar
review-artifacts/
FULL_CODE_REVIEW*
deliverable-commit*.md
VERSION_HISTORY.md.precompact*.bak
```

用户明确要求公开 Agent 规则时才可例外包含入口文件；即使包含，也必须重新做敏感扫描。

## 3. 公开版五阶段流程

### 阶段 A：正式基线检查

1. 正式目录必须检出 `main`，tracked/staged 状态干净，没有未完成 Git 操作。
2. 检查 `git worktree list`，不能在其他 Session 尚未收口时误用其成果。
3. 在私有仓库先运行 `npm run typecheck` 和 `npm run test:logic:all`；发现 stale 断言应先回私有仓库修复、提交，再导出。
4. 默认 staging 路径为 `$HOME/Documents/wardrobe-github-public-main`，但最终以用户指定路径和远端为准。

### 阶段 B：导出 staging

现有 staging 的删除仍遵守根治理的废纸篓规则，不得使用 `rm -rf`。从正式仓库导出：

```bash
git -C <main-repo> archive main | tar -x -C <staging>
git -C <staging> init -b main
git -C <staging> remote add origin <user-specified-github-url>
```

逐项核对并把排除项移到废纸篓。不要使用未经展开确认的通配符做永久删除。

### 阶段 C：脱敏与验证

1. 检查 staging 根目录、Android 目录和 Git 索引，确认不存在签名、环境文件、APK、Agent 配置、诊断下载、备份和审查产物。
2. 在 staging 中配置仓库级 Git name/email，不修改全局配置。
3. 安装依赖并运行 `npm run typecheck`、`npm run test:logic:all`；需要时补 build。
4. 如果失败，回私有仓库修复并重新 archive，不在 staging 维护一套漂移源码。

### 阶段 D：提交与推送

```bash
git -C <staging> add -A
git -C <staging> commit -m "v<X.Y.Z>: push to public GitHub"
```

首次推送可使用 `git push -u origin main`。覆盖非空远端前必须先 `git fetch origin`，然后只在用户已授权覆盖策略时使用 `git push --force-with-lease origin main`；禁止普通 force push。

推送后确认 staging `main` 与 `origin/main` SHA 一致。

### 阶段 E：私有仓库记录

在私有仓库 `VERSION_HISTORY.md` 顶部记录：

- 推送前私有 main tip。
- 推送前和推送后公开远端 tip。
- 使用的推送策略。
- staging 验证结果和期间修复的 stale 断言。
- 未覆盖风险，例如没有再次从公开远端 clone 验证。
- 签名文件未公开属于预期安全边界。

只提交版本历史等私有仓库必要变更，不把 staging `.git`、公开构建产物或敏感材料带回私有仓库。
