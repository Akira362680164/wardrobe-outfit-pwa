# Wardora 新首页 P1 实施证据

日期：2026-07-17
范围：App 隐藏只读首页与手工城市；不包含生产默认入口、定位权限、Canvas、计划写事务或微信小程序新首页。

## 实施边界

- 正式数据源仍为服务器；客户端仅保留页面生命周期内的请求状态，不新增 IndexedDB、SQLite、localStorage 业务缓存、Outbox、后台队列或乐观写入。
- `home_feed` 是内部隐藏 route。默认 `wardrobe_home` 未切换，旧首页继续作为 P5 前回退。
- 手工城市写入必须携带稳定 `clientMutationId` 与当前 revision，等待提交并读回后才刷新；没有定位弹窗、权限申请或 watch。
- 推荐、主计划和已穿事实均为只读；没有采用、替换、取消、确认已穿或本地假成功。

## 自动化证据

- P1 手写 ViewModel/并发 Fixture：四种正常状态、工作区先决、独立模块错误、locationless/forecast、protected plan/actual wear、账号切换、上海跨午夜、旧请求取消、今日部分天气 endpoint 与明日证据边界。
- P0.1 与共享门禁：天气 Overview、取消 primary、向后兼容说明、QWeather 视觉字典、domain catalog、小程序生成一致性、cloud contracts、API full、root/API/cloud/小程序 typecheck、root logic/build、UI spec build/check/render。
- `git diff --check` 与 review gate 在提交前执行；日志保留在本次本地测试输出与 Git 历史，不写入密钥、坐标或用户数据。

## 浏览器证据

- 真实 App 页面使用脱敏 Fixture API 验证，而非静态 HTML：390px locationless、城市 Sheet、常驻城市 forecast、明日仅 daily、断网独立错误、请求取消和返回优先级。
- 360/375/390/412/430px 均无横向溢出；浏览器字体放大两级后仍可读、可滚动。控制台严重错误为 0。
- 截图位于线程可视化目录；不提交测试账号、token、坐标或真实衣橱数据。

## Android 证据

- 版本：`2.1.25-test` / versionCode `20125`；包名 `com.wardrobe.outfit`；固定签名主体 `CN=fangzheng`。
- 标准回归覆盖安装、启动、前台窗口、系统 Back、重新启动、清数据启动和 fatal log 扫描。
- 独立本地 Fixture APK 只用于设备交互，不连接生产数据：覆盖隐藏入口、无城市、常驻城市事务读回、临时城市事务读回、系统 Back 先关 Sheet、前后台恢复、断网时天气/推荐分别报错、切换账号后旧状态清屏。
- 原始脱敏截图与摘要位于忽略目录 `test-results/android-home-feed-p1/20260717/`。最终交付 APK 必须在 P1 提交后从生产 API 配置重建，不能把 Fixture APK 当交付件。

## 保留风险

- 本批无 Canvas 运行时，UI spec 中的单 rAF、约 29 FPS、DPR 上限、后台/离屏暂停与故障保护是后续 P4 合同，不是当前运行时结论。
- 一次性设备定位属于 P3；计划采用/替换/取消/已穿写事务属于 P2；生产默认首页切换与正式候选发布属于 P5。
- Android 业务交互来自模拟器和合成 Fixture 账号，不是物理真机或真实用户数据；正式生产 API 只执行部署后的受控健康/鉴权/功能开关门禁。

## P1.1 收口（2.1.26-test）

### 行为 Fixture

- 红灯：依赖恢复后，新增 P1.1 脚本因 `home-feed-operations` 尚不存在而以 `MODULE_NOT_FOUND` 失败；原 P1 Fixture 先通过，证明红灯来自新增行为而非旧基线。
- 绿灯：稳定 mutation ID 覆盖网络失败/响应丢失后的同命令重放、revision 改变、提交读回、409 后读取最新地点及账号/卸载 generation 失效。
- 城市搜索覆盖“上→上海”仅一次上游请求、IME composition 期间零请求、约 400ms 生产防抖、同一规范化 query 缓存命中、查询变化取消旧结果、账号切换清缓存以及 429 保留 `retryAfterSeconds` 且不自动重试。
- 天气读取覆盖 today 200 + tomorrow 503、反向失败、成功日期独立缓存，以及既有 `HomeRequestGate` 日期/账号 generation 晚到保护；衣橱分栏使用真实 React DOM Fixture 证明推荐首屏无衣橱树、首次切换才挂载、返回推荐后内部输入状态保留。

### 实现与边界

- 城市命令键只包含脱敏语义字段：账号 ID、设备会话 ID、动作、地点 ID 与 expected revision；不记录 token、坐标或用户数据。Abort 只用于使客户端等待和晚到回写失效，不作为服务端事务已撤销或 GeoAPI 未计费的证据。
- 409 会再次读取服务端地点快照并显示明确冲突；若最新快照也读取失败，保留原 pending mutation 供同 ID 重试，并显示“冲突且读回失败”，不降格为普通网络错误。
- `home_feed` 仍是 feature flag 隐藏 route，默认 `wardrobe_home` 未改变；没有新增定位、Canvas、计划/穿着写入、业务持久缓存或小程序页面。
- 本批仅 App 客户端与测试/文档变更：生产 API/Worker 保持既有镜像，本批不部署服务端、不执行 migration、不调用 QWeather、不合入 `wechat/miniprogram`。

### P1.1 验收证据

- 工程门禁：P1/P1.1 Fixture、root typecheck、App route/navigation、Back priority、UI overflow、UI spec build/check/render、production build、`git diff --check` 与 High-risk review gate 通过；完整命令输出保留在本任务运行记录。
- 真实浏览器：360/375/390/412/430px 页面级横向溢出为 0；125% 字体、推荐/衣橱懒挂载、城市 Sheet、保存中状态、同 query 缓存及账号 A 退出后账号 B 的“未设置城市”清屏均通过。截图位于忽略目录 `test-results/home-feed-p11-browser/20260717/`。
- Android：固定签名 Fixture APK 为 `2.1.26-test` / versionCode `20126` / `com.wardrobe.outfit` / signer `CN=fangzheng`。`wardrobe-test`（Android 15 / API 35）覆盖隐藏入口、`s→shanghai` 连续输入后的单次候选、保存中状态、系统 Back 先关 Sheet、前后台、断网独立错误、恢复联网、130% 字体及第二账号无旧城市；fatal scan 为 0。
- Android Fixture 通过回环测试地址验证交互，不能证明生产搜索成本、真实城市事务或生产账号切换；最终交付 APK 使用正式 API 配置、内部隐藏入口开启、默认首页不变。生产 API/Worker 仍保持既有镜像 `wardrobe-api:15bdd9c`，本批没有部署、migration 或 QWeather live 调用。
