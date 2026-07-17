# Wardora 新首页 P0 / P0.1 Evidence

本文档只记录新首页生产前置合同的脱敏证据索引。不包含 Secret、Token、坐标、用户数据、用户图片或生产请求体。

## 代码与双主线

- P0 共享合同实现提交：`68273f6`；App/API/共享主线合并提交：`320bf3d`。
- P0 生产收口记录：`05fb39b`，为 P0.1 开始时 `main` / `origin/main` 基线。
- 小程序串行合入提交：`8f2b0c4`，为 P0.1 开始时 `wechat/miniprogram` / `origin/wechat/miniprogram` 基线。
- P0.1 在独立 worktree 和 `codex/wardora-home-p01-p1-20260717` 分支开发；两个 PAW PoC worktree 不在本任务范围。

## 本地测试证据

P0 已记录的完整门禁（P0.1 未重跑时均视为历史证据）：

- API full：`338/338`；P0 专项：`20/20`。
- cloud contracts、API、root 与小程序 typecheck 通过。
- domain catalog / 小程序生成一致性、App production build、UI spec build/check/render 和 `git diff --check` 通过。

P0.1 当前轮已重新执行：

- WeatherOverview 部分 endpoint、天气未知 code、取消 primary 合同专项：`33/33`。
- UI spec preview build/check/contract/render 通过，已冻结四种正常状态、三种错误、单一地点入口、七日取消、today/tomorrow、rAF/FPS/DPR、reduced-motion 与计划保护。

## 备份、迁移与生产镜像

以下是 `05fb39b` 中已经记录的 P0 生产现场证据，本文档创建时未重新执行：

- 脱敏备份标识：`wardrobe-20260717-114624.sql`；已在隔离数据库完成恢复。
- 新旧镜像 migrator 均能读取迁移 26；没有执行逆向迁移。
- 当时 API 与 recommendation worker 运行 `wardrobe-api:320bf3d`，零非预期重启。
- 当时保留的单一已验证回滚镜像为 `wardrobe-api:3db5335`。
- 生产变更只保留当前镜像和一个已验证回滚镜像；不将 PostgreSQL 镜像、volume、备份或 Secret 纳入清理。

P0.1 如以新的服务端/共享代码进入 `main`，上述历史证据不代替新一轮备份、隔离恢复/兼容门禁、部署与镜像留存复核。

## 生产 HTTP 与开关

以下为 P0 已记录、P0.1 文档创建时未重新执行的现场结果：

- 内部与公网 `health`、`ready`、`version` 均为 HTTP 200，version 指向 `320bf3d`。
- 未鉴权的受保护路由返回 401；不存在的路由返回 404，不泄漏内部详情。
- recommendation V2、realtime、accept 保持启用；PAW、天气预警与历史气候保持关闭。

## QWeather 受控证据

以下为 P0 已记录、P0.1 文档创建时未重新执行的受控调用：

- `now`、`hourly`、`daily` 各调用 1 次，共写入 3 条共享缓存证据。
- 相同 Overview 重复读取的上游增量为 0，证明缓存复用。
- 未调用分钟降水、空气质量、天气指数、预警、辐照或历史气候 API。
- 旧 C1 全链脚本的天气证据通过，但合成推荐未产出 current；该项不影响 P0 天气合同结论，仍作为推荐全链未重验风险保留。

## 向后兼容结论

- `WeatherOverviewSchema` 能接受旧 payload，只证明“新 schema 接受旧 payload”。
- 该断言不能证明“旧已发布客户端能解析新响应”；后者需要冻结的旧客户端 parser/binary 或真实旧版集成测试。
- P0.1 不把方向相反的 schema 断言写成旧客户端实测证明。

## 未重新执行的证据

文档创建时，以下项目仍只是 `05fb39b` 记录的历史证据：生产备份/恢复、迁移 26、镜像 migrator、生产部署、内外 health/ready/version、401/404、功能开关、零重启和 QWeather 受控上游调用。只有在 P0.1 代码进入正式 `main` 后现场重跑，才可以把它们更新为本轮当前证据。
