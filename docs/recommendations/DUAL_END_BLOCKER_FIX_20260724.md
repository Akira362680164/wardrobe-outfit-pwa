# Wardora 双端验收 App/API 功能阻断修复证据

日期：2026-07-24（Asia/Shanghai）

## 范围与冻结点

- 起点：`main@88e2ef768b5d3b58a35910c30b5fbd797f1e42ab`。
- Session：`codex/dual-end-blockers-20260724`，独立 worktree。
- 只修改共享合同、wardrobe-api、App 在线图片/衣橱列表、测试、版本与证据。
- 未修改 `apps/wechat-miniprogram/**`，未修改外部正式小程序目录，未实现 P5，默认首页仍为旧衣橱首页。
- 正式 main 既有 5 组未跟踪文件仅做只读核对，未复制、暂存或修改。
- 仓库与 Git 树均未包含 README 所引用的根 `AGENTS.md`；本轮遵守任务注入规则、用户体验档案和现存 Git/生产/API/Android/审查专项文档。

## 根因与修复

### Located recommendation

`WeatherOverviewSchema` 已合法输出 `currentTemperatureC`、`currentFeelsLikeC`、`dayWeatherCode`、`nightWeatherCode`，但推荐侧 `WeatherEvidenceSchema` 仍是旧严格对象，导致 forecast 在生成输入边界被拒绝。修复在共享合同边界补齐四个受控字段；locationless 和 weather fallback 仍逐字段禁止全部天气值，严格对象仍拒绝未知字段。

### 推荐图片 binding

正式 App 资产 mutation 使用 `imageDataUrl`，推荐 workspace adapter、accept 竞态重验和快照选择仅识别历史 `primaryImage/image/cover`。修复增加共享、有序的主图 binding 字段集合，以 `imageDataUrl` 为权威首选并保留三个历史字段；新计划快照 binding 写为 `garment:<id>:imageDataUrl`。

### Android 衣橱列表缩略图

受控 8 件衣物的 Workspace `assetRefs.imageDataUrl`、original/thumbnail 服务器内容和详情 original 均已证明有效，根因不在 binding。列表的单主图仍被包装进支持多页弹簧轨的通用 Carousel，同时图片订阅在重复挂载的最后释放时不会取消 pending 请求；请求可能在引用数为 0 时生成并立即撤销 URL，再把该失效 URL 返回给新挂载。修复分两层：

1. 单图衣橱卡直接使用 `OnlineAssetImage` 请求 thumbnail；只有真实多图时使用 Carousel。
2. `OnlineImageClient.release` 在最后一个订阅者释放时取消并移除 pending 请求，后续挂载建立独立下载，不复用将被撤销的结果。

没有新增本地业务缓存、图片持久缓存或离线队列。

## 本地门禁

- cloud contracts typecheck：通过。
- API typecheck：通过。
- root typecheck：通过。
- 推荐 V2/天气专项：46/46。
- 图片在线链路脚本：通过，覆盖 original/thumbnail、共享引用、重复挂载取消、401 恢复和重新获取。
- App 图片/首页专项：component reuse、online auth、garment image source、P1/P2/P3 全部通过。
- API 全量：并行运行受机器争用影响出现密码哈希/100 次循环超时与 crop sidecar ready 失败；按发布配置单 worker 复跑 39 files / 348 tests 全部通过。
- 真实 PostgreSQL：6 files / 72 tests 全部通过；其中 accept 26/26，覆盖纯 `imageDataUrl` 候选、采用、快照及历史 binding。
- root production build（默认 feature gate 关闭）：通过。

## 待收口

- 以 `NEXT_PUBLIC_WARDORA_HOME_FEED_P1=true` 构建固定签名 APK，并核验元数据、生产域名、安装启动、隐藏入口与真实 8 件缩略图。
- 对冻结 commit 启动独立只读视觉审查；P0/P1 清零后再集成。
- 真实正式账号 located resolve/current/accept 回归。
- main 串行集成、推送；生产备份、隔离恢复/迁移门禁、API+worker 同镜像部署与 HTTP 边界回归。
