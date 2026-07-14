# Wardora 推荐后端 1D-B 脱敏证据

## 范围

本批只建设地点与 QWeather 基础设施：严格共享合同、常驻城市/当日设备覆盖持久化、GeoAPI 搜索与坐标解析、QWeather Provider、PostgreSQL weather_cache 与鉴权 API。未进入 1D-C，未修改推荐 V1/V2 算法、Worker 生成路径、推荐读取 DTO、App/小程序 UI、PAW 或其他天气 API。

## 官方技术依据

- 鉴权：QWeather 官方 Authentication，JWT header 使用 alg=EdDSA 与 kid=Credential ID，payload 使用 sub=Project ID、iat、exp，Ed25519 签名后以 Bearer 发送：<https://dev.qweather.com/en/docs/configuration/authentication/>
- 城市查询/坐标解析：GET /geo/v2/city/lookup，location 支持模糊地名、LocationID 或“经度,纬度”，坐标最多两位小数：<https://dev.qweather.com/en/docs/api/geoapi/city-lookup/>
- 实时天气 GET /v7/weather/now：<https://dev.qweather.com/en/docs/api/weather/weather-now/>
- 72 小时 GET /v7/weather/72h：<https://dev.qweather.com/en/docs/api/weather/weather-hourly-forecast/>
- 7 天 GET /v7/weather/7d：<https://dev.qweather.com/en/docs/api/weather/weather-daily-forecast/>
- 天气图标代码：严格接受官方已分配代码，并将官方 999 Unknown 按本批“未知 code 拒绝”要求处理为 invalid_response：<https://dev.qweather.com/en/docs/resource/icons/>

## 测试先行红绿证据

Expected 全部手写，未由实现生成。

- 红灯 1：合同/Provider/cache 三个专项文件全部失败；4 个合同断言因 Schema 未存在失败，Provider/cache 模块未存在。
- 红灯 2：4 个地点 API 断言全部失败，当时端点均返回 404。
- 红灯 3：真实 PostgreSQL 专项因地点服务模块未存在无法收集。
- 实现中回归：JWT 时钟边界、Asia/Shanghai 日期解析与 tombstone 时间戳曾分别被专项和 PostgreSQL 测试捕获，修复后转绿。
- 最终专项：合同/cache/API/Provider 32/32；真实 PostgreSQL 29/29，覆盖 fresh schema、0020→0021、地点冲突/幂等/级联及连接池规模并发单飞。

## 合同、表与 API

- 共享 Zod：复用 WeatherLocationRef，新增地点候选、profile/override command/response、normalized now/hourly/daily、attribution、cache key/entry/freshness 与结构化 Provider 错误；公开对象严格拒绝未知字段。
- 迁移 0021 新增 user_location_profiles、location_date_overrides、weather_cache。profile/override 采用 revision、mutation fingerprint 与 tombstone，保留清除操作的幂等重试语义。
- 鉴权 API：GET/PUT/DELETE /api/settings/location-profile，GET/PUT/DELETE /api/settings/location-override，GET /api/weather/locations/search?q=，POST /api/weather/locations/resolve-device。
- PUT 只接收 locationId，服务端经 GeoAPI 复核并仅保存 QWeather 标准地点中心。设备原始坐标只在单次 resolve 请求内存中存在，发出前粗化为 2 位小数，不进入数据库、普通日志、诊断或 job summary。

## Provider、缓存、并发与费用保护

- Node 标准 crypto 生成 Ed25519 JWT，15 分钟有效、提前 120 秒轮换、时钟可注入。生产只从 QWEATHER_PRIVATE_KEY_FILE 读取私钥；配置缺失 fail closed，不实例化 Mock/Fixture。
- 仅允许 HTTPS 专属 *.qweatherapi.com Host，拒绝共享 Host、非 HTTPS、端口/路径注入与重定向；请求有硬超时和 AbortSignal。
- PostgreSQL 缓存键为 provider + locationId + endpoint + lang + unit。TTL/max-stale：now 20m/2h，hourly 60m/6h，daily 3h/12h；daily 在目标时区跨日后强制重验。
- fresh 不请求上游；stale 先刷新，失败可返回明确 stale；超过 max-stale 为 unavailable。429/timeout/5xx 使用 60s 默认负缓存，Retry-After 限定 30—300s，不覆盖仍合法的 stale 数据。
- 跨 API/Worker 使用 PostgreSQL transaction advisory lock，锁内复用持锁连接二次读缓存。真实 PostgreSQL 以 16 个并发冷 miss 验证仅 1 次 loader 调用。搜索/坐标解析另有每用户固定时窗费用限流。

## 真实 QWeather 受控烟测

使用配置的 HTTPS 专属 Host、Project/Credential ID 与仓库外私钥文件；不记录 JWT、PEM、完整上游 body 或自由地址。单次脚本硬限制最多 5 次上游请求，实际为 5：

| 请求 | HTTP | 耗时 | 受控结果 |
| --- | ---: | ---: | --- |
| GeoAPI 搜索“上海” | 200 | 778.3ms | 10 个候选，首个 LocationID 101020100 |
| GeoAPI 粗坐标解析 | 200 | 203.9ms | 1 个候选，LocationID 101020400 |
| now | 200 | 145.5ms | 1 条 normalized DTO |
| 72h | 200 | 231.8ms | 72 条 normalized DTO |
| 7d | 200 | 119.0ms | 7 条 normalized DTO |

now/hourly/daily 各再走一次 repository 读取，均为 fresh + cacheHit=true，上游请求总数仍为 5。

## 生产迁移与部署

- 首次隔离恢复演练发现迁移 journal 未登记 0021；正式 migrator 保持 20，生产尚未切换。补齐 journal 与测试断言后重建镜像，生产转储在隔离库由正式 migrator 成功 20→21，三张表均存在，演练库随后清理。
- 备份目录：/opt/wardrobe-cloud/backups/recommendation-1d-b-20260714-201914/。数据库转储 2,888,751 bytes，SHA-256 为 74ff7a2012b97d3975a5e579a561dc09e757bd1abd830b5d44a0cbdfab222dbe。
- 生产镜像 wardrobe-api:011e4d9，镜像 ID sha256:24a0c94d6d26a9a7f46a711e32c7dd36aab505f35e027c91bc63de42fcd11b30；旧镜像 wardrobe-api:2bb2b8b 保留回滚。API/Worker 重启数均为 0，迁移记录 21，新三表初始行数为 0/0/0。
- QWeather 在生产仅对 API 启用，alerts=false；Worker QWeather 环境键计数为 0。私钥宿主与容器内均为 root:root 0400，Docker mount RW=false；容器内仅验证 JWT 可签名，未输出 token，也未增加上游调用。
- 本机/公网 health、ready 均为 200，version gitCommit=011e4d9；8 个新地点端点无凭据均为 401。日志秘密匹配与 fatal/unhandled/migration error 匹配均为 0。
- V2 total/current=0/0，V1 current=132；现有 V1 Worker 正常等待 Asia/Shanghai 03:30，三个 PAW 开关为 false。QWeather 不属于 readiness 依赖，瞬时故障只会令本能力 unavailable，不会令整体 ready 失败。

## 未覆盖范围

未实现行程>临时>常驻>无城市 resolver、Worker V2/V2 current、推荐读取 DTO/失效重算/行动、WeatherOverview/reassess、App/小程序位置 UI、PAW；也未调用分钟降水、空气质量、天气指数、预警或辐照 API。
