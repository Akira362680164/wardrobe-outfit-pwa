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
