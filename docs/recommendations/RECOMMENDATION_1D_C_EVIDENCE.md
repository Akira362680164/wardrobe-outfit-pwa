# Wardora 推荐后端 1D-C 脱敏证据

## 1D-C.1：重算一致性与今日天气聚合

### 红绿证据与冻结边界

- 所有新增 expected 人工手写。首轮纯逻辑专项为 15 tests / 4 failed：过去 hourly 污染今日风、now 天气代码未进入 evidence、mixed freshness 错误保持高置信、重叠行程借用旧 weatherLocation；首轮 PostgreSQL 专项为 7 tests / 3 failed：trigger-first 重放冲突、today 未自动组成 home pair、无 lease claim 边界。实现后相关纯逻辑 56/56 转绿，真实 PostgreSQL覆盖扩展为 pair/竞争/lease/fencing/dirty/idempotency/backoff/升级回放。
- V1 24 个 Fixture/Golden expected 零修改；V2 同一 Fixture连续 100 次一致及输入乱序不变继续通过。不改推荐模板、权重、Beam、Jaccard、UI、PAW 或额外天气 API。

### 队列、原子发布与幂等

- 0023 为 `recommendation_regeneration_requests` 增加 `claim_token`、`lease_expires_at`、`generation_batch_id`、`trigger_version`、`claimed_trigger_version` 与受控 mutation fingerprint map。Worker 以 `FOR UPDATE SKIP LOCKED` claim，lease 到期可回收；publish 与 claim 完成在同一事务验证 token、lease、状态和 batch，过期 Worker 不能覆盖新结果。
- 对今天或明天的 due 请求，claim 会补齐并成组锁定 Shanghai home pair，两日共用 generationBatchId；两日均 prepare 成功后才单事务切换。失败、actual 或 confirmed primary 保护均保留既有 pair，读取不会出现混批或明日丢失。
- processing 期间的数据库触发不覆盖当前 claimed generation，而是递增 triggerVersion；当前完成后请求重新成为 pending。显式 reassess 在触发入队后写入 `clientMutationId → 内容 fingerprint`，相同重放返回同一请求，不同日期/内容冲突。
- Worker 全量跑批仍为 Asia/Shanghai 03:30；daemon 另以 15 秒周期检查 due 队列，正常请求 60 秒内开始，退避按 `next_attempt_at` 重新可见。

### 今日天气、置信度与时间

- 今日 evidence 只纳入实时 now、daily 与目标地点时区下当前时刻至当晚的 hourly；过去小时先过滤。now 的 precipitation、weatherCode、wind 参与今日摘要与 V2 evidence；明日不读取 now，避免跨日污染。
- `weatherConfidence` 由实际参与聚合的 endpoint freshness 共同决定；任一参与 endpoint 为 stale 时，混合证据不再伪装为全 fresh。fallback/locationless 仍清空天气值与 attribution。
- 普通首页日期、临时覆盖范围和 Worker 调度/业务日期固定 Asia/Shanghai；WeatherLocationRef.timezone 仅用于供应商目标日期、hourly 跨日过滤和旅行天气。重叠行程先选唯一权威行程，场景与天气地点来自同一行。

### 受控真实联调

- 新增 `qweather:smoke:1d-c1`：仅允许在明确隔离数据库中创建合成测试账号，最多调用 now/hourly/daily 三类各一次，然后证明标准城市 → shared PostgreSQL cache → WeatherOverview → V2 today/tomorrow 同批 current → read，并重复 Overview 证明上游计数不增长。
- 脚本仅输出 endpoint 请求数、cache 行数、contextMode、pair/read 一致性等聚合结果；不输出 JWT、PEM、项目/凭据 ID、坐标、LocationID、用户或上游 body。最终生产联调结果与缓存复用计数在完成恢复演练后追加。

### 1D-C.1 合并前全量门禁

- API full：32 files / 288 tests；其中 V1 49/49、V2 41/41（含 100 次确定性和乱序不变）、Worker 7/7、WeatherOverview 4/4。
- 真实 PostgreSQL：3 files / 39 tests（推荐持久化 24、地点天气 7、重算一致性 8），包含 fresh schema 与 0022→0023 升级、双 Worker、lease 回收、旧 claim fencing、dirty successor、丢响应幂等和退避到期。
- cloud contracts、API、根项目和小程序 typecheck、根 `test:logic:all`、24 fixture shadow、manifest、API/Next production build 与 `git diff --check` 全部通过。manifest 仅报告既有 Android/真机人工项未纳入自动 gate；本批明确不构建 APK。

### 1D-C.1 生产迁移、live smoke 与切换

- 开发提交 `45f460f`，QWeather smoke 72h 路径修复 `c20ef15`，runtime main merge=`8c343d4`。生产切换前为镜像 `wardrobe-api:9353c6d`、迁移 22、V2 current 146、队列 stuck/duplicate 0；跨过上海午夜后，旧批次口径使当前 today/tomorrow 混批为 18，作为本批必须归零的真实基线。
- 备份目录 `/opt/wardrobe-cloud/backups/recommendation-1d-c1-20260715-002652/`：数据库 3,445,849 bytes，SHA-256 `2476486c20fec59b66d71a1215c623bb1beebd506a3ef1b7448f71df3b5f1620`；部署环境 SHA `1b8c4b153befd0af6d7b7f780eed0394583565f6c34c82820c4a392c2e1c59ee`，compose SHA `fc16a1f40dcc69823e93bd28aaf9011ea0e26555de916ec5bc0c64f5c8ca0cd3`。隔离恢复保留 21 users / 856 recommendations，正式 migrator 22→23，6 个新增列和 lease index 齐全；旧 `9353c6d` migrator 可读取迁移后库。演练完成后隔离库已删除。
- 首次一次性容器因 compose 才注入的 key-file 路径缺失而 fail closed，上游 0；补齐同一只读 mount 后，smoke 的业务链成功请求 now+daily 各 1，但验收计数器把 Provider 的真实 `/v7/weather/72h` 误写为 `/24h`，在出网前拒绝 hourly，因此门禁停止、未部署 Worker。修正计数器后以手写 now/daily Fixture 预置 shared cache，只新增 hourly 1 次并得到：cache rows 3、重复 Overview 请求增量 0、forecast/forecast、today/tomorrow 同 batch、read pair consistent、Asia/Shanghai。整个 1D-C.1 实际新增上游严格为 now/hourly/daily 各 1、总计 3。
- 生产地点 profile/override/严格 trip weatherLocation 均为 0，cache 初始 0；生产 shadow 为 21 users / 146 dates，date ready/limited/not_ready=14/0/132，context forecast/locationless/weather_fallback=0/146/0，failed=0、唯一 location/cache key/预计上游上限=0。正式 run-once job `a8be7b2f-b71f-404f-8861-7b7db17bbfe2` 在约 2.17 秒完成 146 targets，ready=14、fallback=132、failed=0，未新增生产天气调用。
- 切换后 V2 current 167（包含保留的上一业务日 current），当前未来 7 日有效行 142，全部 locationless；V2 total 292，旧 V1 history 710。current duplicate、today/tomorrow mixed pair、stuck lease、active duplicate、pending、processing 均为 0。合成账号的单一 due 请求在 9 秒内开始，completed 后 today/tomorrow=2 rows / 1 batch；账号、衣物、推荐、请求残留均为 0。Worker 报告 `regenerationPollMs=15000` 且完整调度仍为 Asia/Shanghai 03:30。
- 正式 API/Worker 镜像 `wardrobe-api:8c343d4`，ID `sha256:defc31dbfb95a83d172a98304a04c93d58090feac5a245605a735603daea006f`；回滚镜像 `wardrobe-api:9353c6d`，ID `sha256:a0f07a2dde3741d4cf6acf26a98ccf71723eda56d4ce67c3f4d635f0e2ccfda4`。迁移 23；两容器重启 0，API Docker health healthy，内外 health/ready/version 200，Overview/read/reassess 无授权均 401。
- API/Worker 的 shadow/current/worker 三开关均 true；DAILY=true，三个 PAW、alerts、historical climate 均 false。QWeather Secret 为 root:root 0400，在两容器 mount RW=false；私钥/JWT、Project/Credential ID、fatal/unhandled/migration error 日志匹配均为 0。

## 范围与冻结项

本批完成 1D-C-A、1D-C-B、1D-C-C：日期地点解析、WeatherOverview、V2 shadow/Worker/current/read、持久化失效重算与 reassess。App/小程序 UI、APK、体验版、PAW、分钟降水、空气质量、天气指数、预警、辐照和历史气候均未进入本批；原 V1 模板、权重、Beam、Jaccard 与 24 个 Golden 未修改。

## 测试先行红绿证据

Expected 均人工手写，未从实现反向生成。

- 1D-B 缺口红灯：endpoint/payload 错配合同首次有 1 项失败，污染缓存行边界首次有 1 项失败；修复为 endpoint 判别 union，并在 repository/cache service 两层复验。
- A 红灯：resolver、Overview 与鉴权路由在实现前分别表现为模块不存在或 404；新增四级地点矩阵、旧 trip 自由文本、locationless 零天气调用、today/tomorrow/day3-7/out-of-range 与 freshness 测试后转绿。
- B 红灯：独立 V2 generation/Worker/read union 与 shadow/current 双开关在实现前不存在；转绿后 V2 引擎 40/40，其中包含连续 100 次字节一致和输入数组乱序不变，V1 引擎 49/49。
- C 红灯：0022 表、数据库幂等和 reassess 路由在实现前不存在；实现中真实 PostgreSQL 先后捕获 `digest` search_path、重试 SQL 参数类型、DATE 时区和 V2 未启用时错误消费队列问题，逐项修复后转绿。
- 首次生产恢复 shadow 正确阻断灰度：146 个 user-date 中 14 个因旧 payload 的中文/非法 style 枚举生成异常；定位后在 workspace adapter 使用共享 catalog normalizer，把旧非法枚举降为缺省证据而非令整日失败，并把 PostgreSQL 回归从“容忍 7+ 失败”收紧为失败必须为 0。
- 最终 API 全量 32 files / 284 tests；真实 PostgreSQL 3 files / 32 tests（推荐持久化 22、地点天气 7、重算 3）；原 24 个 V1 fixture shadow 完全匹配。

## A：地点、天气证据与 Overview

- `ResolvedRecommendationContext` 对每个 user-date 纯解析，优先级固定为：有效行程内严格 `weatherLocation` > 有效临时覆盖 > current 常驻城市 > locationless。查询始终带 userId，排除 tombstone、superseded、过期和越界日期。
- 旅行 payload 的 `weatherLocation` 使用严格 `WeatherLocationRef` 写入边界；旧 `destination` 仅保留展示和场景语义，绝不触发自动 Geo 搜索、猜测或历史回填。旧记录无标准地点时继续走后三级，不拒绝旧数据。
- API 与 Worker 共用 PostgreSQL `weather_cache`、single-flight 与 negative cache。今天使用 now+hourly+daily；明天 hourly+daily；第 3—7 日 daily；7 日外保留已解析旅行地点/来源/目标时区，但返回 `weather_fallback + forecast_out_of_range`。
- `forecast` 只在目标日存在完整 daily 温度证据时产生；降雨、风和体感仅在真实字段存在时填充。超过 max-stale 或证据不足时清空温度/雨/风/体感，不把 today now 串到 tomorrow。
- 新增严格鉴权 `GET /api/weather/overview?date=`，返回地点、来源、contextMode、目标时区、endpoint freshness/fetchedAt/expiresAt/staleUntil/providerUpdatedAt、可用性与受控 QWeather attribution；locationless 全链路零 QWeather 且无伪归因。

## B：V2 shadow、Worker 与读取

- V2 走独立 generation service；在构造 V2 输入时，以 resolver/Overview 的真实 evidence 覆盖 V1 workspace adapter 的季节/计划文本天气推断，V1 入口保持原样。
- `RECOMMENDATION_V2_SHADOW_ENABLED`、`RECOMMENDATION_V2_WORKER_ENABLED`、`RECOMMENDATION_V2_CURRENT_ENABLED` 三个开关独立且默认 false。shadow 只 prepare/计数；只有 worker 与 current 同时 true 才发布或消费重算队列。
- 今天/明天先 prepare 后同事务发布；任一日期失败不撤销旧 current。单日失败同样保留旧 current；actual/confirmed primary 日期继续跳过。
- read 返回严格 V1/V2 display union：V1 形状保持兼容，V2 增加实际地点、来源、contextMode、目标时区、解析时间、天气 freshness/归因和算法版本。关闭 V2 时已有 V1/current 仍可读取；今日即时规则回退仅在 V2 current 启用时切 V2，不在 API 内启动整批 Worker。
- 新增脱敏 production-like readiness 入口：在天气聚合前先计算唯一 location+endpoint cache key 和上游请求上限，超过硬限立即停止；输出仅含用户/日期状态与 context 分布，不含 userId、衣物、自由地址、JWT 或上游 body。

## C：持久化失效重算与 reassess

- 迁移 0022 新增 `recommendation_regeneration_requests`：user/date/reasons/status/attempt/retry/fingerprint/clientMutationIds/服务端时间戳/result，账户删除级联；partial unique active user-date 合并重复触发。
- 数据库触发器在地点 profile/override、旅行、衣物和结构化天气缓存变化时合并请求；显式 reassess 使用 clientMutationId，同键同内容幂等、不同内容 409 冲突。
- Worker 使用 `FOR UPDATE SKIP LOCKED` 原子 claim，有限次数指数退避和受控错误码；新记录成功事务提交前旧 current 保持可读。actual/confirmed primary 日期不被覆盖。
- 新增 `POST /api/recommendations/daily/:date/reassess`：鉴权、严格 body/date/clientMutationId、用户级限流，只排队规则模式，不调用 PAW；Overview/read/reassess 共用同一 resolver 与天气证据口径。

## 本地门禁

- cloud contracts、API、根项目、小程序 typecheck：通过。
- API full：284/284；真实 PostgreSQL fresh schema、0021→0022、并发/幂等/级联：32/32。
- 根 `test:logic:all`、穿搭计划 57+88+40、manifest、24 fixture shadow、production build：通过。
- domain catalog 未修改；现有 catalog 门禁随 root logic 通过，无需重新生成小程序字典。
- `QWEATHER_ALERTS_ENABLED=false`、`HISTORICAL_CLIMATE_ENABLED=false`，三个 PAW 开关保持 false；本地实现与验证新增真实 QWeather 上游请求 0 次。

## 生产证据

- 生产切换前核对旧镜像 `wardrobe-api:011e4d9`、迁移 21、V1 current 132、V2 total/current 0/0。备份目录 `/opt/wardrobe-cloud/backups/recommendation-1d-c-20260714-220702/`；数据库 2,898,984 bytes，SHA-256 `2d872b7a998aa850adc3a2358ec1b71dc1e458dceb2dcbb09f7fb17f6e226d6f`；脱敏部署环境与 compose SHA 分别为 `7d7f1846f87e599c32b466311efc5f96b0a49a3b74931cf734a95d9aeeca61cc`、`5e6229bb8d173e438cc141c6734b474465e623271aa6ffbc2edc5d77691c54ee`。
- 生产备份恢复到 `wardrobe_restore_1dc_20260714`，正式 migrator 成功 21→22；新表、4 个索引、5 个触发器存在，21 个用户和 710 条推荐记录保持。旧镜像 `011e4d9` 能直接读取迁移后库，证明加法迁移的镜像回滚路径可用。
- 首次 `ccba6dc` 暗部署保持 V2 三开关 false；隔离 shadow 的 14 个旧 style 失败触发门禁，未写 current。修复提交 `0ede447` 后，隔离恢复与受控生产报告均为：21 用户、146 user-date、user ready/not_ready=2/19、date ready/not_ready=14/132、failed=0、locationless=146、唯一 location/cache key=0、上游请求上限=0。
- 全门禁复跑后启用 V2 shadow/worker/current 并运行一次受控批次：job `completed`，targets=146、ready=14、fallback=132、failed=0；V2 total/current=146/146，context 全为 locationless，V1 710 条历史行保留、V1 current=0。current 重复组 0；today/tomorrow home pair 20 组、混批 0；重算请求 total/stuck/active-duplicate 均为 0。
- 正式代码镜像 `wardrobe-api:0ede447`，镜像 ID `sha256:a0f07a2dde3741d4cf6acf26a98ccf71723eda56d4ce67c3f4d635f0e2ccfda4`；回滚镜像 `wardrobe-api:011e4d9`，镜像 ID `sha256:24a0c94d6d26a9a7f46a711e32c7dd36aab505f35e027c91bc63de42fcd11b30`。API/Worker 重启数 0，内外网 health/ready/version 通过，version=`0ede447`；Overview/read/reassess 无凭据均 401。
- API/Worker 的 V2 三开关均 true；三个 PAW、alerts、historical climate 均 false。两容器各持 6 个 QWeather 配置键，私钥在宿主/API/Worker 均为 root:root 0400、mount RW=false。秘密/JWT/坐标/Project ID/Credential ID/fatal 日志匹配均为 0。
- 生产没有标准地点记录，因此本批真实新增 QWeather 上游请求严格为 0，天气 cache 行保持 0；费用硬上限预计算为 0。未用无意义的重复上游调用制造验收证据。
- 共享合同先入 `main`；首轮正式同步后 `wechat/miniprogram=25b8181`，小程序 typecheck 通过，未上传体验版。最终文档提交、分支同步与临时 worktree/分支清理在同一任务最后执行。

## 未覆盖范围

未做 App/小程序新首页或地点权限 UI、推荐接受/正式套装保存 UI、PAW、额外 QWeather API、历史气候、APK 或小程序体验版；未对旧旅行自由目的地做自动标准化。
