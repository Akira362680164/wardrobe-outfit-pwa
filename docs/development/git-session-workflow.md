# Git Session 与 Worktree 操作手册

本文是根目录 `AGENTS.md` 中“Git Session 隔离规则”的操作说明。强制边界以 `AGENTS.md` 为准；本文只说明如何执行，不建立第三个长期基线。

## 1. 长期基线与正式目录

| 范围 | 本地正式基线 | 正式集成目录 | GitHub 备份 |
| --- | --- | --- | --- |
| App、服务端、共享代码 | `main` | `/Users/fangzheng/Documents/衣柜识别+根据要去的地方和活动自动搭配穿搭的APP` | `origin/main` |
| 微信小程序 | `wechat/miniprogram` | `/Users/fangzheng/Documents/wardrobe-wechat-miniprogram` | `origin/wechat/miniprogram` |

普通开发 Session 不能在这两个正式目录中编辑。正式目录只用于检查基线、串行合并、集成验证、推送和清理。

## 2. 开始任务前

先在对应正式目录确认真实状态：

```bash
git worktree list
git status --short --branch
git branch --show-current
git rev-parse HEAD
```

可作为新 Session 基线的状态必须满足：

- 当前分支是对应本地正式基线；
- 没有 tracked 或 staged 修改；
- 没有未完成的 merge、rebase、cherry-pick 或 revert；
- HEAD 是已提交状态。

已知的本机未跟踪文件可以留在正式目录，但必须先看清路径，不能复制到新 worktree、不能暂存，也不能把它们当成基线成果。出现来源不明的 tracked 或 staged 修改时停止创建，先确认归属。

## 3. 创建独立 Session

分支名应带平台、任务简称和足以区分 Session 的后缀，例如：

- `codex/app-online-image-20260710`
- `codex/wechat-calendar-plan-20260710`
- `codex/integration-domain-catalog-20260710`

App Session 示例：

```bash
git worktree add \
  '/Users/fangzheng/Documents/wardrobe-app-online-image-20260710' \
  -b 'codex/app-online-image-20260710' \
  main
```

小程序 Session 示例：

```bash
git worktree add \
  '/Users/fangzheng/Documents/wardrobe-wechat-calendar-plan-20260710' \
  -b 'codex/wechat-calendar-plan-20260710' \
  wechat/miniprogram
```

创建后立即进入新目录并记录基线：

```bash
git status --short --branch
git rev-parse HEAD
git merge-base HEAD main
```

小程序任务将最后一条中的 `main` 换为 `wechat/miniprogram`。任务记录至少保留：来源分支、base SHA、Session 分支名和 worktree 绝对路径。

## 4. Session 开发期间

- 始终在创建时的 worktree 中工作，不切换正式分支或其他 Session 分支。
- 只提交本任务文件或本任务 hunk；环境文件、构建产物和他人修改不得混入。
- 如果基线在开发期间前进，当前 Session 的 base SHA 仍保持不变。
- 依赖另一个 Session 时，先让前置成果进入正式基线或明确的批次分支，不复制对方未提交文件。
- 已共享的 Session 分支不 rebase、不强推。需要追赶基线时优先合并最新本地基线并重新测试。

提交前检查：

```bash
git status --short
git diff --cached --name-status
git diff --check
git log -1 --oneline
```

Session 完成意味着：任务范围内修改已提交、相应测试已通过、`VERSION_HISTORY.md` 已更新，并且最终 commit SHA 与未验证风险都已记录。

## 5. 串行合入本地基线

同一基线同一时间只允许一个集成操作。集成者先确认没有其他 Session 正在修改对应正式目录，再检查正式目录：

```bash
git status --short --branch
git branch --show-current
git worktree list
```

在 App 正式目录合并 App Session：

```bash
git merge --no-ff codex/app-online-image-20260710
```

在小程序正式目录合并小程序 Session：

```bash
git merge --no-ff codex/wechat-calendar-plan-20260710
```

如果发生冲突，先理解双方语义再解决，不使用笼统的 `ours`、`theirs`、强制 checkout 或硬重置覆盖一侧。多个 Session 同时修改 `VERSION_HISTORY.md` 时，保留各自有效记录并整理顺序。

合并后必须在正式目录重新运行与风险匹配的集成验证，不能只引用 Session 分支上的结果。

## 6. 跨 App、小程序和服务端的共享改动

以下改动按共享任务处理：

- `packages/domain-catalog`；
- `packages/cloud-contracts`；
- 服务端接口、数据库契约或统一 payload；
- 同时影响 App 和小程序的数据结构、认证或图片规则。

推荐收口顺序：

1. 从本地 `main` 创建独立共享 Session；
2. 完成共享包、服务端、App和必要的小程序适配；
3. 跑完跨包验证并提交；
4. 在 App 正式目录合入本地 `main`；
5. 从小程序基线创建独立小程序集成 Session，并合入最新本地 `main`；
6. 更新生成文件，完成小程序 typecheck、编译和必要的平台验证；
7. 在小程序正式目录合入 `wechat/miniprogram`。

共享源码以 `main` 为上游，小程序基线消费已合入的共享成果，不在两个基线分别维护平行实现。

## 7. 推送 GitHub 备份

只有本地正式基线合并并验证通过后才推送。推送前先刷新远程引用并检查 ahead/behind：

```bash
git fetch origin
git status --short --branch
git rev-list --left-right --count origin/main...main
```

小程序将最后一条替换为：

```bash
git rev-list --left-right --count origin/wechat/miniprogram...wechat/miniprogram
```

如果远程一侧领先，停止推送并调查来源，不通过 force push 覆盖。确认本地只领先预期提交后，推送对应正式基线：

```bash
git push origin main
```

或：

```bash
git push origin wechat/miniprogram
```

推送后再次检查 ahead/behind，应为 `0 0`。普通短期 Session 分支默认不推送。

## 8. 安全清理 Session

清理前逐个核对 Session worktree 的绝对路径、分支、HEAD 和状态：

```bash
git -C '/Users/fangzheng/Documents/wardrobe-app-online-image-20260710' status --short --branch
git -C '/Users/fangzheng/Documents/wardrobe-app-online-image-20260710' rev-parse HEAD
git merge-base --is-ancestor codex/app-online-image-20260710 main
```

小程序把最后一条的基线替换为 `wechat/miniprogram`。只有以下条件全部满足才能继续：

- worktree 没有未提交的任务修改；
- Session tip 已被对应本地基线包含；
- 集成测试通过；
- 正式基线已推送并与远程同步；
- 没有其他 Session 依赖该分支；
- 未跟踪文件已逐项确认无需保留。

如果 `merge-base --is-ancestor` 失败，先检查是否经过 squash、cherry-pick 或等价补丁进入基线。仍有独有提交时禁止强删；必要时保留分支、创建本地归档 tag或保存 patch。

本项目禁止永久删除 worktree。确认安全后，使用明确的绝对路径移入废纸篓：

```bash
trash '/Users/fangzheng/Documents/wardrobe-app-online-image-20260710'
git worktree prune
git branch -d codex/app-online-image-20260710
```

不得使用通配符、`rm -rf`、`git clean` 或 `git worktree remove` 绕过废纸篓规则。移入废纸篓后仍占用磁盘空间；永久清空前必须再次取得用户对具体路径的明确确认。

## 9. 最终稳定状态

任务全部收口后应满足：

- 长期本地分支只保留 `main` 和 `wechat/miniprogram`；
- 只保留两个正式集成 worktree；
- 正式目录检出正确基线且没有 tracked/staged 修改；
- 本地正式基线已验证，并与 GitHub 备份同步；
- 未完成 Session 的分支、worktree、base SHA 和依赖关系清晰可查。
