# VERSION HISTORY

本文件只保留当前接力事实、近期关键变更和阶段索引。完整历史由 Git 保存，不在主文件重复堆积。

- 查看本次压缩前的 1609 行完整快照：`git show 98e69b4:VERSION_HISTORY.md`
- 查看本文件历次变化：`git log --follow -- VERSION_HISTORY.md`
- 查看某次提交详情：`git show <commit>`
- 新记录继续置顶，默认控制在 3–5 条短 bullet；原始测试日志、命令输出和长证据写入专项 evidence 文档或交由 Git 保存。

## 当前接力基线（2026-07-15）

- **版本与平台**：`package.json` 为 `2.1.24-test`；正式开发基线为 App/API/共享代码 `main` 与小程序 `wechat/miniprogram`。App 仍以 Android 竖屏、线上唯一数据源和固定签名 APK 为交付边界。
- **生产 API**：运行提交 `3d1634d`，API/Worker 镜像 ID `sha256:defc31db...`，回滚镜像 `wardrobe-api:9353c6d` / `sha256:a0f07a2d...`；数据库迁移数 `23`。最近核验内外网 health/ready/version 200、鉴权边界 401、API/Worker 零重启。
- **生产能力**：推荐 V2 shadow/current/worker 与 QWeather 已启用；PAW、天气预警和历史气候保持关闭。当前推荐链覆盖确定性规则、版本化持久化、原子双日发布、重算 lease/fencing、上海业务日期和共享天气缓存。
- **最近交付**：自动裁切双路线与 Android 真机闭环、全量动效/浮层/返回栈修复、App/小程序跨端一致性审计、微信登录与账号注销、固定签名 APK 和小程序体验版均已有历史验证记录。
- **接手要求**：编辑前仍须结合 Git、任务相关 evidence、真实源码与生产现场复核；本摘要不是跳过迁移、部署、Android 或小程序验证的依据。

## 2026-07-15 / v2.1.24-test / Codex — 实时推荐 2A-3 计划采用事务

- 新增独立 accept 合同、路由与 0025 加法迁移；同一事务内完成幂等、日期锁、旧 primary 降 backup、无 outfitId 计划、衣物/推荐快照、图片 binding、action 和 sync change，提交后再按主键读回。
- 采用时重读当前衣物并重跑硬过滤；允许仍合法的 superseded 候选，拒绝跨用户/失效衣物、模板变化和超过一件的替换。App/小程序读合同已支持 `garmentIds` 且无 `outfitId`，旅行打包 UUID 优先。
- 删除衣物不再从推荐计划中删 UUID/快照；未来计划标记 blocked，历史计划保留展示语义。真实 PostgreSQL 双连接并发、幂等、降级与四阶段故障注入 `7/7`；accept 开关仍默认关闭。

## 2026-07-15 / v2.1.24-test / Codex — 实时推荐 2A-0 Fixture 冻结

- 手写冻结 Recommendation V3 的 forecast/locationless/weather_fallback 场景、三目标精确 expected、0/7/30/90/180/365 天轮换边界及“从未穿过/久未穿”口径；保留 V1/V2 兼容读取断言。
- 新增 V3 rule-only、无 `pawEvaluation`、确定性风险、100 次字节一致和输入乱序不变的红灯测试；真实红灯为 `20 failed / 1 passed`，失败点均为 V3 合同、计分与生成入口尚未实现。
- 风险等级 High（推荐共享合同与算法）；未触发 subagent：用户未通知。当前未修改生产、数据库、App/小程序 UI 或功能开关。

## 2026-07-15 / v2.1.24-test / Codex — 实时推荐 2A-1 规则 V3

- 新增只写 `rule_only` 的 Recommendation Payload V3：候选删除 `pawEvaluation/longUnwornValue`，改用 `rotationValue`、受控确定性风险分级和归一化后三目标；V1/V2 继续原样只读兼容。
- 冻结 T1–T8、Beam/候选上限和 Jaccard 0.50/0.67；V3 使用 0/20/40/60/80/100 轮换阶梯，只有 365 天进入 `long_unworn`，从未穿过单独标记。
- 专项合同、V1/V2/V3 引擎、路由与 API typecheck 通过（`126/126`）；风险等级 High，未触发 subagent：用户未通知。生产与功能开关尚未变更。

## 2026-07-15 / v2.1.24-test / Codex — 实时推荐 2A-2 resolve 与 worker 收口

- 新增稳定 `inputFingerprint`、V3 生成服务和共享协调器；GET 推荐严格只读，POST resolve 支持同指纹复用、force 幂等、今日/明日同批发布、旧 current 保留和前台/worker 同锁发布。
- 迁移 0024 增加输入指纹/生成来源与索引，天气 dirty 只覆盖今日、明日及已有 current；worker 只预热今日/明日，远期旅行改为按需 resolve，功能开关 `RECOMMENDATION_REALTIME_ENABLED/RECOMMENDATION_ACCEPT_ENABLED` 默认关闭。
- 真实 PostgreSQL fresh/0018→0024、双连接并发、force 冲突、pair 原子、lease/fencing、故障注入与天气缓存门禁 `41/41`，realtime/路由/worker 专项 `87/87`，API typecheck 通过。风险等级 High；未触发 subagent：用户未通知。

## 2026-07-15 / v2.1.24-test / Codex — VERSION_HISTORY 二次压缩

- 将 `VERSION_HISTORY.md` 从 `1609` 行、约 `304 KB` 收敛为当前基线、近期关键记录和分阶段索引，纠正旧记录在文件尾部再次倒序追加的问题。
- 不另建冗长 archive；压缩前全文固定保存在 Git 提交 `98e69b4`，需要逐条文件、测试、APK、生产命令和风险时从 Git 读取。
- 本次只改文档，不修改代码、版本号、生产环境、App、小程序或 APK；通过标题顺序、版本覆盖、关键生产事实、链接/命令和 diff 检查。

## 2026-07-15 / v2.1.24-test / Codex — 生产 Docker 生命周期收口

- 定位根盘占用来自连续 Docker 构建链而非备份：清理前 `46G used / 21G available / 69%`，备份仅 `32M`。
- 保留当前与一个已验证回滚 Wardora 镜像、PostgreSQL、Node 基础镜像和生产数据卷；精确清除 39 个旧标签、两个失败构建容器和未引用中间链，未使用带 volumes 的全局 prune。
- 清理后 `14G used / 53G available / 20%`，释放约 `32GB`；迁移 23、内外 health/ready/version、401/404 边界和备份完整性复验通过。证据提交：`98e69b4`。

## 2026-07-15 / v2.1.24-test / Codex — Agent 治理与任务路由

- 根 `AGENTS.md` 从 541 行收敛为约 150 行任务路由；Git、Android、协作审查和公开 GitHub 流程拆到专项文档，完整硬边界继续由根入口统领。
- UI 设计/审查/响应式/无障碍先使用 `impeccable`；涉及动画、手势、弹簧、可中断转场和 reduced-motion 时同时使用 `apple-design`，但项目 UI spec、真实截图和 motion token 仍是事实源。
- 删除治理中的 ChatGPT 审查包部分，仅保留公开 GitHub 仓库脱敏发布流程；生产文档加入当前镜像 + 单一回滚镜像的精确生命周期规则。提交：`1a6a294`、`fb9fcd2`。

## 2026-07-13 至 2026-07-15 / v2.1.18-test–v2.1.24-test / Codex — 推荐、天气与自动裁切

- **推荐 1A–1D-C.1**：从手写 Fixture/Golden、确定性规则内核、严格共享合同和 PostgreSQL 幂等持久化，推进到 Worker 批次、V2 shadow/current、地点优先级、QWeather 缓存、重算队列、双日原子发布、lease/fencing 与 trigger generation。
- **生产迁移**：依次完成 0019–0023 迁移、生产备份与隔离恢复演练；最终运行提交 `3d1634d`、迁移 23，V2 三开关与 QWeather 开启，PAW/alerts/historical 关闭。最近已验证回滚镜像为 `9353c6d`。
- **自动裁切**：服务端 ONNX 主路线 + MiniMax 回退路线落地，覆盖无 Key 状态、图片资产生命周期、Android 真机流转和生产 imageCrop ready；用户仍可手工调整裁切。
- **范围边界**：推荐后端阶段未用单点地点特例替代通用场景；未把生产业务数据改成本地持久缓存。详细算法、迁移、shadow 和受控天气证据从 Git 中对应的 1A–1D 与 QWeather 记录读取。

## 2026-07-13 至 2026-07-14 / v2.1.16-test–v2.1.19-test / Codex — 动效、浮层与 UUID 一致性

- 完成 OverlayStack、统一 Android Back/Escape、共享 Dialog/Popover/Lightbox、方向化路由、首帧滚动恢复、轮播/下拖/日历手势、按压/Toast/Progress/Shimmer 和 reduced-motion/性能门禁。
- App、设置、账号、录入、单品、种草、套装、计划与月历深层流程完成空间连续性和可中断交互修复；经主集成、构建、浏览器/Android 定向验证和固定签名 APK 交付。
- 套装、穿搭计划和穿着记录统一到 canonical UUID，完成生产迁移、会话续期、工作区并发一致性、撤销购买语义、App/小程序入口同步和生产 API 部署。

## 2026-07-10 至 2026-07-12 / v2.1.11-test–v2.1.15-test / Codex — 跨端一致性与账号闭环

- 建立 App/小程序 parity fixture、Screen/Action manifest、静态缺陷库、真机执行器和 BFS 证据门禁；修复录入、详情、搜索统计、套装、旅行、诊断、AI 试穿与推荐等跨端差异。
- 完成 Android Smoke/Critical/Full E2E、图片 mutationId、删除引用级联、长会话续期、401 自动续期、动态安全区与 edge-to-edge 回归。
- App 与小程序完成账号注销三次确认、法律文本同步、微信注册/登录合同、生产 Secret 注入、固定签名 APK 和体验版交付；共享领域字典成为跨端唯一来源。

## 2026-06-26 至 2026-07-09 / v2.0.x–v2.1.10-test / Codex、Mavis — 云端化与正式发布基础

- 从本地数据模式迁移到 Fastify/PostgreSQL 线上唯一数据源，建立共享 cloud contracts、事务写入、`clientMutationId`、图片临时资产会话、服务端重读和账号隔离。
- 完成生产服务器、Caddy/TLS、正式 API 域名、数据库备份/恢复、诊断上传、邮件认证、Android 固定签名、APK 自动构建及小程序基础工程。
- 图片语义统一为原图、缩略图和裁切信息可恢复闭环；修复 Android 原生图片下载解码、裁切与云端恢复。该阶段逐项细节以 Git 快照和相关部署/evidence 文档为准。

## 2026-06-23 至 2026-06-24 / v1.1.19–v1.1.22 / Codex、Mavis — 字段模型与移动端回归

- 统一单品/种草 ColorInfo、分类与材质字段，修复识别、套装组成、已买种草、返回链路、详情边距、首页卡片和 56px header。
- 补齐 temperatureRange 控件，删除录入死代码并更新逻辑测试；完成多轮真机回归、诊断事件扩展及 v1.1.19–v1.1.22 APK 集成。

## 2026-06-15 及更早 / v0.9.9–v1.1.18 / Codex、Mavis、MiniMax — 历史基线

- 建立 Git 版本基线、移动端衣橱/种草/套装/旅行/日历/AI 识别与试穿主流程，并逐步形成线上数据、隐私、删除安全、Android 签名和文档治理规则。
- 历史高频修复集中在录入选择、滑条误触、裁切入口、详情返回、图片恢复、衣橱卡片、删除确认、窄屏/横屏弹窗和 APK 版本交付。
- 旧版本逐条记录不再常驻主文件；需要复盘时使用 `git show 98e69b4:VERSION_HISTORY.md`，再结合目标提交和当期源码验证，禁止仅凭本阶段摘要回滚或部署。
