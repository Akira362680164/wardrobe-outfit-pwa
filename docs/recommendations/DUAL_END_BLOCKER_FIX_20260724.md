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

受控 8 件衣物的 Workspace `assetRefs.imageDataUrl`、original/thumbnail 服务器内容和详情 original 均已证明有效，根因不在 binding。首版修复 APK 的 WebView CDP 证据进一步显示 8 个 `<img>` 均为 `complete=true`、`naturalWidth=384–453`、`naturalHeight=512`，但实际布局矩形统一为 `width=0`、`height=210`：`CatalogWaterfallCardShell` 的媒体框在 flex 卡片内使用 `w-auto`，唯一媒体子项又是绝对定位，Android WebView 因没有内在宽度把父框折叠为边框宽度，正好对应验收截图中的细竖线。同时，列表的单主图被包装进支持多页弹簧轨的通用 Carousel，图片订阅在重复挂载的最后释放时也不会取消 pending 请求。修复分三层：

1. 媒体框宽度固定为卡片宽度减左右 `0.75rem` 边距，不再依赖绝对定位子项贡献内在宽度；CDP 现场覆写同一计算值后 8 张正式图片立即可见。
2. 单图衣橱卡直接使用 `OnlineAssetImage` 请求 thumbnail；只有真实多图时使用 Carousel。
3. `OnlineImageClient.release` 在最后一个订阅者释放时取消并移除 pending 请求，后续挂载建立独立下载，不复用将被撤销的结果。

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

## Android 与独立视觉门禁

- 最终 APK：`衣橱穿搭助手-v2.1.33-test.apk`，构建提交 `02e55a3dd01924478eccb2de14256b389e73cb6e`，`com.wardrobe.outfit` / `versionName=2.1.33-test` / `versionCode=20133` / `CN=fangzheng`，SHA-256 `009fbcd1392883f073ebc9e9d4389561e13b8b6d48859d18ef436e2c14d73bee`。
- 构建显式设置 `NEXT_PUBLIC_WARDORA_HOME_FEED_P1=true` 与正式 `https://api.zhengfangapps.cloud`；设置页真实显示“Wardora 新首页预览 / 内部只读入口，不改变默认首页”。冷启动仍进入旧 `wardrobe_home`，只有点击隐藏入口才进入新首页；未实现 P5。
- 受控正式账号登录后，Android 15 / Pixel 6 AVD 冷启动成功，无目标进程 fatal。CDP 逐一核对 8 个正式 `<img>`：全部 `complete=true`、自然尺寸非 0，布局尺寸统一约 `157.05 × 210`，不再是宽度 0；首屏截图可见夹克、鞋和短裤真实图片。
- 独立只读视觉 Agent 对冻结提交、权威 UI spec、原失败图及新截图审查：P0/P1/P2/P3 均无，判定“缩略图真实可见 + 隐藏入口真实可见”门禁通过，可进入集成。它保留的边界是：截图只直观看到首屏 4 件（其余 4 件由 CDP 数据证明）、未覆盖物理设备/多字号/其他屏宽，且部署前预览页仍显示旧生产 API 的推荐输入错误。

## main 集成与生产部署

- 功能提交经串行合入形成 `main@7ba22acd1dd2a2d0eb98a42ea0a46d839f606007`，已推送 `origin/main`。正式 main 原有 5 组未跟踪文件保持原状，小程序源码与外部正式小程序目录均未进入提交。
- 部署前 API/worker 均为 `wardrobe-api:88e2ef76`，0 次重启。数据库备份为 `/opt/wardrobe-cloud/backups/postgres/wardrobe-20260724-161738.sql`，4,727,004 bytes，SHA-256 `365aca8df464527729dde61ec7cce37867afcc28b306d166a614bdab29f60db5`；环境备份为 `/opt/wardrobe-cloud/backups/env/.env.20260724-162854.bak`，SHA-256 `ec2a6df392aeed02bb791b08629d8ab4645855df7ea6f9c5e74a2ed48d5b99f4`。
- 备份恢复到隔离库 `wardrobe_restore_dualend_20260724` 后，users/garments/assets/migrations 分别为 22/63/135/26；新运行时代码迁移通过且仍为 26 条。隔离库验证后已删除，正式数据库未清空，受控 8 件衣物和遗留计划未修改。
- API 与 recommendation worker 已从同一 `wardrobe-api:7ba22acd` / image ID `sha256:d0aab440206ea54c7b310dc7d68f0369771e624b17d2bc9dee128b6b08726730` 重建，均 0 次重启；API health 为 healthy。保留 `wardrobe-api:88e2ef76` 作为明确回滚镜像。
- 外部 `health` / `ready` / `version` 均为 200，版本返回完整提交 `7ba22acd1dd2a2d0eb98a42ea0a46d839f606007`；未鉴权 workspace 与 POST resolve 为 401，未知路由为 404，生产迁移数仍为 26。
- 受控正式账号真实登录后，2026-07-24 与 2026-07-25 located resolve 均为 200 / `forecast` / `上海` / 3 candidates，随后 current read 返回 2 项且 `pairConsistent=true`。正式工作区读取仍为 8 件衣物；16/16 thumbnail binding 均经鉴权下载并匹配服务端 SHA，抽样 original 也为 200 且 SHA 匹配。

## 已知边界

- 生产宿主在全新 Dockerfile 构建时停在 Debian `apt-get`，为避免无界等待，本次基于已验证的 `wardrobe-api:88e2ef76` 系统/依赖层，仅覆盖当前 `packages/cloud-contracts/dist` 与 `services/wardrobe-api/dist`，并写入当前 OCI revision。运行时代码与共享合同是本次 main 的精确产物，但不是从基础镜像开始的干净重建；下一次依赖镜像可用时仍应补做 clean rebuild。
- Android 视觉证据来自 Android 15 / Pixel 6 AVD，不等同于物理设备、多字号或其他屏宽覆盖。用户因重要 OCR 工作主动退出模拟器后未再启动；部署后 App 页面未复截，但生产 located/current 与实际 original/thumbnail 下载已分别用同一受控正式账号重验。
- 仓库缺失 README 引用的根 `AGENTS.md`，本轮无法核验其未入库内容。小程序 P0/P2/P3 属于并行任务，本证据不声明其已修复。
