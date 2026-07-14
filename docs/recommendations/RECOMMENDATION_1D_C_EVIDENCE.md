# Wardora 推荐后端 1D-C 脱敏证据

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
