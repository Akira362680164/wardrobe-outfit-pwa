# Wardora 新首页 P0 / P0.1 Evidence

本文档只记录新首页生产前置合同的脱敏证据索引。不包含 Secret、Token、坐标、用户数据、用户图片或生产请求体。

## 代码与双主线

- P0 共享合同实现提交：`68273f6`；App/API/共享主线合并提交：`320bf3d`。
- P0 生产收口记录：`05fb39b`，为 P0.1 开始时 `main` / `origin/main` 基线。
- 小程序串行合入提交：`8f2b0c4`，为 P0.1 开始时 `wechat/miniprogram` / `origin/wechat/miniprogram` 基线。
- P0.1 实现提交：`ef9e59d`；P1 实现提交：`15bdd9c`；正式 `main` 已串行推送，小程序共享同步提交为 `2b14e4d`。
- 实施使用独立 worktree；两个 PAW PoC worktree 未读取、修改或清理。

## 本地测试证据

P0.1 当前轮已重新执行：

- WeatherOverview 部分 endpoint、天气未知 code、取消 primary 合同专项：`33/33`。
- UI spec preview build/check/contract/render 通过，已冻结四种正常状态、三种错误、单一地点入口、七日取消、today/tomorrow、rAF/FPS/DPR、reduced-motion 与计划保护。
- API full `341/341`，cloud contracts、API/root/小程序 typecheck、root logic/build、domain catalog、小程序生成一致性、review gate 与 `git diff --check` 通过。

## 备份、迁移与生产镜像

- 当前脱敏备份标识：`wardrobe-20260717-192148.sql`，大小 `4,550,897` bytes、权限 `0600`；摘要只在部署日志留存。
- 备份已恢复到隔离数据库；旧镜像 `320bf3d` 与新镜像 `15bdd9c` 的 migrator 均读取迁移 `26`，未执行逆向迁移。隔离数据库已删除。
- API 与 recommendation worker 当前共同运行 `wardrobe-api:15bdd9c`，镜像 ID `d4aa5fe91380`，均为 running、零重启。
- 单一回滚镜像为部署前当前版本 `wardrobe-api:320bf3d`；更旧 `3db5335` 已在确认无容器引用后精确移除。PostgreSQL 镜像、volume、备份和 Secret 未纳入清理。

## 生产 HTTP 与开关

- 内部与公网 `health`、`ready`、`version` 均为 HTTP 200，version 指向 `15bdd9c`。
- 未鉴权的受保护路由返回 401；不存在的路由返回 404，不泄漏内部详情。
- recommendation V2 shadow/current/worker、realtime、accept 与 QWeather 保持启用；三项 PAW、天气预警与历史气候保持关闭。

## QWeather 受控证据

- 本轮生产严格只执行一次受控脚本：`now`、`hourly`、`daily` 各调用 1 次，共写入 3 条隔离 schema 缓存证据。
- 相同 Overview 重复读取的上游增量为 0，证明缓存复用。
- 未调用分钟降水、空气质量、天气指数、预警、辐照或历史气候 API。
- 脚本的 forecast/缓存/调用上限证据通过；附带的合成推荐仍未产出 current，因此整体退出码为 2。没有为改变结果重复计费调用；该项作为非 P0 天气风险保留。

## 向后兼容结论

- `WeatherOverviewSchema` 能接受旧 payload，只证明“新 schema 接受旧 payload”。
- 该断言不能证明“旧已发布客户端能解析新响应”；后者需要冻结的旧客户端 parser/binary 或真实旧版集成测试。
- P0.1 不把方向相反的 schema 断言写成旧客户端实测证明。

## 未重新执行的边界

- 没有用真实用户账号、坐标或图片做生产业务烟测；P1 的城市/首页交互在浏览器与 Android 合成 Fixture 中验证。
- 没有冻结旧已发布二进制或 parser，因此仍不宣称“旧客户端实际解析新响应”已证明。
- 没有上传小程序体验版，也没有启用额外收费天气 API。
