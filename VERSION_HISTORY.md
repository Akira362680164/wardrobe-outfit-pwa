# VERSION HISTORY

本文件只保留当前接力事实、近期关键变更和阶段索引。完整历史由 Git 保存，不在主文件重复堆积。

- 查看本次压缩前的 1609 行完整快照：`git show 98e69b4:VERSION_HISTORY.md`
- 查看本文件历次变化：`git log --follow -- VERSION_HISTORY.md`
- 查看某次提交详情：`git show <commit>`
- 新记录继续置顶，默认控制在 3–5 条短 bullet；原始测试日志、命令输出和长证据写入专项 evidence 文档或交由 Git 保存。

## 2026-07-27 / v2.1.33-test / Codex — 小程序 P5-C 发布门禁修复（第一阶段）

- 单品详情“今天已穿”状态移除可见 Unicode 对勾，改用既有共享 `ui-icon/check` SVG，同时保留完整中文文案、动态无障碍标签和服务器确认后才切换状态的点击行为。
- 手写详情合同覆盖正常/已穿/提交状态、共享图标引用、文本语义、点击绑定及 mark/cancel 分支；shell 图标门禁不放宽、不删除、不跳过。
- 首轮独立视觉审查 P0/P1=0、P2=3；按报告最小补齐首页系统字体 token、冻结“当日穿搭/今天已穿”状态文案，以及详情穿着按钮和地点 Sheet 次级操作的 44px 命中高度，等待重拍复审。
- 风险等级 Medium（可见状态控件与发布门禁）；第一阶段冻结验证与独立视觉审查完成后补录证据。最终 build-info 必须等待 P5-A+B 的正式 `origin/main` 版本确定后由脚本生成，本阶段不手工修改。

## 2026-07-27 / v2.1.33-test / Codex — 小程序最终验收 P2 收口

- 首页推荐风险码建立显式中文映射，覆盖当前 V3 与兼容风险枚举；未知码统一安全兜底，空值继续沿用 forecast/generic 原文案，上海实际推荐卡不再泄露内部 `snake_case`。
- 通用次级页顶部栏按微信胶囊动态计算操作区与标题区；详情 slot 固定 96rpx 布局/点击面，标题在返回与右侧操作之间视觉居中，旅行计划和套装编辑等实际右侧调用方声明操作宽度。
- 冻结实现 `cd18dd55` 通过小程序 typecheck、P2 手写测试、详情/首页/Canvas/组件复用/导航回归及 catalog/home-shared 检查；WeChat DevTools WXML/WXSS、console 与真实上海页面通过。
- 新证据覆盖 360/390/430 详情、390 上海首页和旅行计划代表页；独立 GPT-5.6 Sol / Medium 只读审查 P0–P3 全为 0、两个原 P2 均关闭并建议交付。证据位于 `/Users/fangzheng/Downloads/Wardora_cross_end_acceptance_20260727/p2-mini-fix-evidence/`；未预览、上传或部署。

## 2026-07-24 / v2.1.33-test / Codex — 双端验收 App/API 功能阻断首轮修复

- 推荐输入合同严格接纳 `WeatherOverview` 已批准的当前温度/体感与日夜天气码，同时继续禁止 locationless/fallback 携带天气值及任意未知字段；旧 payload 保持兼容读取。
- 衣物主图 binding 统一以正式客户端 `imageDataUrl` 为权威，并兼容 `primaryImage/image/cover`；workspace eligibility、accept 竞态重验、计划快照与绑定链路使用同一字段集合。
- Android 衣橱单图列表绕开不必要的通用轮播轨并直接请求正式 thumbnail；Android 15 AVD 的 WebView 进一步确认图片已成功解码但绝对定位媒体子项令父框宽度折叠为 0，现固定媒体框为卡片宽度减左右边距；图片客户端同时保留重复挂载取消、401 恢复与显式重试。
- 版本递增至 `2.1.33-test`；固定签名 APK 与 Android 15 冷启动通过，8/8 正式缩略图均解码并获得非 0 布局宽度，隐藏入口可见且默认仍是旧首页；独立视觉审查 P0–P3 均无。专项天气 46/46、API 单 worker 全量 348/348、真实 PostgreSQL 72/72、App 图片/首页专项及 root/cloud/API typecheck/build 已通过。
- `main@7ba22acd` 已推送并将同一新运行时镜像部署到 API+worker；隔离恢复/迁移、health/ready/version/401/404、上海真实 resolve/current 及 16/16 thumbnail + original 鉴权下载通过。生产使用已验证旧系统/依赖层覆盖本次精确 dist 的镜像，clean base rebuild 作为已知边界记录于 `docs/recommendations/DUAL_END_BLOCKER_FIX_20260724.md`。

## 2026-07-24 / v2.1.33-test / Codex — 小程序双端验收 P0/P2/P3 修复

- workspace 分页统一限制单次 `limit<=200` 并跟随 `nextCursor` 完整读取；重复游标、重复实体和异常页数显式失败，关闭生产首页 `Workspace 请求格式不正确`。
- 单品详情补齐服务器权威的“标记今天穿了”及取消读回，复用稳定 `clientMutationId`，不做乐观成功或本地队列；受控 POLO 往返后恢复未穿，8 件衣物未编辑、未删除。
- 详情 hero 按 3:4 图片语义收敛 `aspectFit`、明确 686×914.67rpx 容器、缩略图与标题层级；“版型倾向/版型说明”拆分并支持长文案，衣橱筛选统一为全部/上衣/裤子/鞋。
- TypeScript、分页/穿着/系统字号手写测试、详情/衣橱/首页回归与正式源码 WeChat DevTools 360/390/430、实际约 144% 字号证据通过；首轮视觉审查问题修复重拍后，第二轮独立只读审查 P0/P1/P2/P3 全为 0、建议交付，详见 `apps/wechat-miniprogram/evidence/dual-end-fixes-20260724/REPORT.md`。
- 第二阶段按 main-first 顺序以双亲 merge 同步 `main@8db6794a`，人工保留双方接力并采用根版本 `2.1.33-test`；同步发现并更新过期的天气 generated bridge，workspace `imageDataUrl` 映射保持通过。
- 共享 catalog/cloud/API/root/小程序 typecheck、分页/穿着/字号/详情/衣橱/首页 P4、线上 workspace 映射、root build 与 WeChat DevTools 隔离正式源码编译通过；已审 UI 源码零漂移，复用独立视觉审查结论。未上传小程序、未部署 API，详见专项证据。

## 2026-07-18 / v2.1.31-test / P4 — 微信小程序新首页完整对齐

- 小程序休眠首页替换为与 App P1.4.1 同构的服务器权威首页：时间问候、今日/明日天气、推荐/衣橱、七日按需、远期出行，以及计划/已穿/blocked/历史快照；不增加业务缓存、Outbox、隐藏队列或乐观更新。
- 串行同步 `main@88e2ef76` 的 P2/P3：接通采用/替换一件/不喜欢/保存套装、取消并原子恢复备选、确认/撤销已穿；稳定 `clientMutationId`、提交与服务端读回、409/超时/幂等/并发均沿用共享正式合同。
- 同源生成 App P3 Canvas 内核并仅增加微信 Canvas 2D 宿主：29 FPS、DPR≤2、单调度器、后台/离屏暂停、恢复不补帧、异常静态和 reduced-motion；62 个 QWeather code 与 304/403/508/512/998 固定场景保持同源。
- 地点 Sheet 不自动申请权限；用户看完用途并主动点击后才请求一次粗略位置，坐标只发 `resolve-device` 且不持久化，候选确认后才设临时/常驻，永久拒绝仍可手工搜索并使用 locationless 推荐。
- WeChat DevTools Nightly 覆盖 360/390/430、100%/131%、完整状态与 P2 Sheet；关闭地点对齐、整卡 Canvas/双卡圆角、分段与日期条、三套横向卡、正式操作按钮和四 Tab + 中央加号偏差，并删除旧右下 FAB。证据见 `docs/recommendations/WARDORA_NEW_HOME_P4_WECHAT_EVIDENCE.md`；未 preview/upload、云写入或部署，物理微信真机仍列为发布前风险。
- 首轮独立视觉审计发现的静态天气空白与 Sheet 底栏遮挡已修复：当前温度和最高温与 App 对齐，Canvas failure/stale/locationless 保留原生文案，地点、详情、取消和中央创建 Sheet 均隐藏四 Tab；关键状态重新覆盖 360/390/430 与 131% 字体。
- 第二轮审计进一步把天气合法文案全部移回原生控件，Canvas 只保留同源透明装饰；stale 补最高温、较早状态和缓存时间，无城市今日/明日同时移除供应商天气。第三轮关键状态覆盖 360/390/430，冻结提交 `af912a2` 经独立只读审计 P0/P1/P2 全为 0，建议集成；仅保留物理微信真机 P3 风险。

## 2026-07-18 / v2.1.31-test / Codex — 新首页 P3 天气 Canvas 与大致位置

- 今日天气卡直接移植验收原型 v0.2.3 的 `wardora-v023` seed/clock、完整场景参数、绘制顺序和雷光/冰雹事件；固定 code/clock 像素门禁覆盖动态事件，明日、未知、fallback、stale 和故障均静态。
- 单调度器目标 29 FPS、DPR≤2，离屏/后台/锁屏/卸载停止且恢复不补帧；reduced-motion 保留 clock 0 静帧，Canvas 例外自动回退当前静态卡。
- 地点 Sheet 只在用户阅读用途并确认后请求 Capacitor 前台大致位置；坐标仅当次解析城市候选，用户再确认临时/常驻；界面移除“主计划、保护、服务端、事务、不会自动更换”等实现说明和底层英文错误。
- 原型 SHA、固定 code/clock 并排像素、浏览器调度/定位与 Android 证据见 `docs/recommendations/WARDORA_NEW_HOME_P3_EVIDENCE.md`；独立视觉 subagent 结论在冻结提交后补录。

## 2026-07-18 / v2.1.31-test / Codex — 新首页 P2 计划与穿着闭环

- App 推荐卡接通采用、最多替换一件、受控不喜欢与独立保存套装；当日事实卡接通更换主计划、确认/撤销已穿和原子取消/恢复备选，全部等待服务端提交与工作区读回，不做乐观更新。
- 补齐 `CancelPrimaryPlan` 真实服务、鉴权路由和事务：日期锁、revision、worn 保护、幂等重放、双设备竞争、同步审计与故障注入均由真实 PostgreSQL 覆盖；补最小严格 rejected action 合同，不写本地假记录。
- P2 使用稳定草稿 mutation ID，失败保留原组合并原 ID 重试；保存套装失败不回滚已成功计划。共享合同先进入 main，小程序由 P4 从最新 main 串行同步，本批不修改 `apps/wechat-miniprogram`。
- 风险 High；P2 本地合同、API 路由、真实 PostgreSQL、App 逻辑/typecheck/build、UI spec 与旧 P1 回归见 `docs/recommendations/WARDORA_NEW_HOME_P2_EVIDENCE.md`。P3 Canvas 尚未进入本提交。

## 2026-07-18 / v2.1.30-test / P1.4.1 — 新首页验收缺陷收口

- 首页按所选业务日期保留服务端 `resolvedLocation/locationSource`，无常驻城市的旅行日仍显示“城市 · 行程”；推荐来源同时保留地点来源，不再只显示泛化天气标签。
- QWeather 归属、更新时间和 stale 缓存语义进入只读 ViewModel；今日/明日各自按显式日期重试，不依赖当前选中日期。
- 计划/已穿投影保留衣物快照与可用性：删除衣物继续显示当时名称，blocked 风险明确提示；事实卡之后保留七日日期条，可继续浏览未来日期。
- 本批仅修 App 只读投影与受影响视觉状态，不改服务端、共享合同、推荐算法、PAW、P2 写事务、Canvas、定位或小程序。

## 2026-07-18 / v2.1.28-test / Codex — 视觉修复独立 subagent 验收门禁

- 用户已给予本项目后续 UI/视觉/动效修复的常驻明确授权：执行 Session 必须在冻结待审 commit 后自行启动独立只读视觉验证 subagent，不再每次询问。
- 审查 subagent 仅获取权威原型/规范、冻结 commit、验收矩阵和实际证据，不承接执行 Session 的实现推理与自我评价；默认只读，按 P0–P3 出具是否建议交付的结论。
- 新首页 PRD 更新为 `v0.7.5.2-integrated`，将该门禁纳入 App Canvas、页面视觉与小程序对齐的正式验收；P0/P1 未关闭不得合入。
- 本次为 Low 风险纯文档/流程规范修订；未另行启动 subagent，当前 P1.4 执行 Session 已收到并将执行新门禁。

## 2026-07-18 / v2.1.28-test / Codex — PRD 天气 Canvas 迁移口径收口

- 将新首页生产 PRD 更新为 `v0.7.5.1-integrated`：App 必须直接提取已验收 v0.2.3 HTML 的视觉参数、场景/粒子生成、事件时序和绘制顺序，不得另起炉灶重画天气动画。
- 明确只将原型 DOM、Fixture 和调试外壳替换为 React/Capacitor 生产宿主；小程序复用同源参数与时序，仅做微信 Canvas 2D 和页面生命周期适配。
- 新增固定 code/seed/clock 并排对照验收，冻结 `304/403/508/512/998` 标志性效果、今日动态/明日静帧、后台/离屏停止和 reduced-motion 降级。
- 本次为 Low 风险纯文档修订，不修改运行时、服务端、数据库、App 版本或小程序；未触发 subagent：用户未通知。

## 2026-07-18 / v2.1.29-test / P1.4 — 新首页视觉骨架对齐

- 新首页按 v0.2.3 恢复时间语义问候、天气模块内唯一地点入口、今日/明日双卡、推荐/衣橱分栏，并将七日选择收进推荐工具栏；天气静态色取自原型 ambient/fallback 参数，不引入 Canvas、rAF、粒子或定位。
- 推荐 ready 态改为真实服务端衣物图片与名称组成的原生横向卡轨，保留稳妥/变化/舒适、理由、风险和来源层级；计划/已穿事实优先，严格只读且不提前加入 P2 写操作。
- 视觉门禁覆盖 360/390/430px、100%/130% 与 ready/locationless/weather fallback/protected/actual-wear；v0.2.3 对照图和专项 manifest 见 `artifacts/home-feed-p14/`。风险等级 High（首页主路径、Android 与签名 APK）。
- 冻结 commit `fca8489` 经独立只读视觉 subagent 复审，P0/P1/P2 均为 0，结论建议交付；本轮不改算法、服务端、数据库、生产部署、PAW 或小程序，Canvas/定位/P2 写事务/P4 小程序仍未实现。

## 2026-07-18 / v2.1.28-test / P1.3.1-C — 证据补强与稳定态清理

- 修正 locationless Fixture 的非法天气码，并以 `WeatherOverviewSchema` 在响应边界校验；新增只含方法、固定路径、状态码与序号的测试 trace，浏览器/Android manifest 均以真实服务端流水核对。
- 浏览器与 `wardrobe-test` Android 15/API 35 重新覆盖首次地点失败→用户重试→上海恢复、清除城市真实 DELETE `503→409→200`、pending Back/遮罩保护、人类可读错误、合法 locationless 空天气卡、前后台恢复及稳定 130% 截图；runtime/loading/fatal 与非预期浏览器失败均为 0。
- `test:logic:home-feed-p1`、`test:logic:home-feed-p13`、`typecheck`、UI contracts、browser P1.3、Android Fixture 均通过。风险等级 High（Android/网络故障证据）；未触发 subagent：用户未通知。
- 正式 APK 未重建或覆盖；仅复核 `com.wardrobe.outfit` / `2.1.28-test` / `20128` / `CN=fangzheng` / SHA-256 `c0dd62291a60ecf892715dbf45c66ea33ede48c0addef4bb391e85b8ad7ebf54`，业务 API URL 仅为生产域名，未发现指向 Fixture/回环地址的业务 API URL。本批不改 `src/**`、服务端、共享合同、小程序、数据库或生产部署。

## 2026-07-18 / v2.1.28-test / P1.3.1-B — 浏览器与 Android Fixture 收口

- 保留并复核 `scripts/test-home-feed-p13-browser.mjs`：360/375/390/412/430px、130% 字体、地点重试及清除常驻城市 503→409→200 全链通过，`pageErrors`/`consoleErrors`/`requestFailures` 均为 0。
- 隔离 Fixture APK 在 `wardrobe-test` Android 15/API 35 通过：`2.1.28-test` / `20128` / `CN=fangzheng`，ADB 系统 Back 和遮罩在 pending 时不关闭，网络失败/409 保留 Sheet 且可重试，成功后关闭并读回“未设置城市”；前后台、130% 字体和 fatal=0 通过。
- 本批不改服务端、共享合同、小程序或新首页产品范围。正式 APK 已从合入后 `main@9cdba05` 使用正式目录现有 `.env` 重建：`com.wardrobe.outfit` / `2.1.28-test` / `20128` / `CN=fangzheng`，只含生产域名，根目录产物为 `衣橱穿搭助手-v2.1.28-test.apk`。

## 2026-07-18 / v2.1.28-test / P1.3.1-A — 首页推荐重读闭环

- 统一服饰写入后服务器快照刷新入口，避免局部 `setItems` 导致首页继续使用陈旧 `serverRevision`。
- 手写 Fixture 覆盖 `workspaceRevision` 不变不重读、提升后重读且清理旧 candidate，以及天气/current-read/resolve 同 key 迟到响应不覆盖新结果。

## 2026-07-18 / v2.1.28-test / P1.3 — 缓存与地点错误承载收口

- 地点重试强制联动刷新天气/未采用推荐；缓存写入校验 account/location/workspace/ticket，`workspaceRevision` 消费服务器 `serverRevision`，迟到响应不污染当前上下文。
- 设置页清除常驻城市的网络失败与 409 改在确认 `alertdialog` 内承载；保存期间不可关闭，失败后保留同层重试/取消。
- 默认首页仍为 `wardrobe_home`，未新增定位、Canvas、计划写事务、业务持久缓存或小程序页面。

## 2026-07-17 / v2.1.27-test / Codex — Wardora 新首页 P1.2 地点一致性与设置收口

- 地点成功/409/前台恢复统一应用服务端快照；天气缓存按账号、有效地点 revision/key、日期隔离，未采用推荐再叠加 workspaceRevision，地点或衣橱 revision 变化不会展示旧城市天气/推荐。地点 mutation 与读取 effect 分离，日期/工作区刷新不再锁死保存状态；UUID fallback 优先随机源并覆盖冻结时间碰撞回归。
- 首页地点 Sheet 移除清除常驻城市命令；设置页新增天气地点管理与明确二次确认，Android Back 先关确认层。保留临时城市恢复流程、44px 点击目标、reduced-motion 与窄屏/字体放大约束；默认旧首页、P2 写事务、定位、Canvas 和小程序均未改变。
- P1.2 手写 Fixture、Strict Mode 资源上限复测、真实浏览器与 `wardrobe-test` Android Fixture 通过；正式 APK 以 `https://api.zhengfangapps.cloud` 重建为 `2.1.27-test` / versionCode `20127` / 固定 `CN=fangzheng`。本批仅 App 客户端，不部署 API、不迁移、不调用 QWeather、不合入小程序。

## 2026-07-17 / v2.1.26-test / Codex — Wardora 新首页 P1.1 并发与交互收口

- 城市写入按账号/会话、动作、地点与 revision 复用稳定 `clientMutationId`；响应丢失可原样重放，409 读取最新服务端快照并显示冲突，route/账号失活后旧响应不得回写。写入期间显示明确保存状态。
- GeoAPI 搜索增加约 400ms 防抖、IME 保护、至少 2 字触发、规范化 query 会话缓存、账号/清空清理与 429 `Retry-After` 提示；不会立即自动重试或把 Abort 当作免计费证明。
- 今日/明日天气改为逐日期独立结算与缓存，预取失败不再连坐当前成功日期；衣橱能力树首次进入分栏才挂载，之后保留内部状态，并补齐 tab/tabpanel 关联语义。
- 风险等级 High（网络写入幂等、隐藏首页 UI 与 Android APK）；手写行为 Fixture 覆盖重放/冲突、搜索控制、部分日期失败、旧请求失效与懒挂载。本批未修改服务端或共享合同，不部署 API、不调用 QWeather、不合入小程序；未触发 subagent：用户未通知。

## 2026-07-17 / v2.1.25-test / Codex — Wardora 新首页 P1 只读骨架与手工城市

- 新建隐藏 `home_feed` route、独立 controller/ViewModel、线上 client 与页面组件；生产默认仍是旧衣橱首页，P5 前保留回退。新首页显示四 Tab 与无选中态的中央创建按钮，推荐卡严格只读。
- 工作区先决、天气/推荐独立状态、AbortController + generation、上海业务日期/前后台/跨午夜、账号切换清屏及计划/已穿事实优先均由手写 Fixture 冻结；客户端不增加业务持久缓存、不重排推荐、不覆盖已采用计划。
- 手工城市复用服务端搜索、常驻/临时/清除/恢复合同，稳定 mutation ID + revision，提交并读回后更新；未申请定位权限、未实现 Canvas 或 P2 计划写事务。静态天气仅展示 WeatherOverview 的合法证据。
- 真实浏览器覆盖 360/375/390/412/430px、字体放大、城市 Sheet、明日证据、请求取消与模块断网；Android Fixture APK 覆盖隐藏入口、城市读回、系统 Back、前后台、断网独立错误和账号切换清屏，固定签名基础门禁无 fatal。
- 风险等级 High（新首页数据编排与 Android 路径）；正式 main `15bdd9c`、小程序共享同步 `2b14e4d` 已推送，生产 API/Worker 已部署 `15bdd9c`，固定签名 `2.1.25-test` APK 已验证。生产默认入口保持关闭；P2/P3/P4 仍明确未实现，详见 P0/P1 evidence。

## 2026-07-17 / v2.1.24-test / Codex — Wardora 新首页 P0.1 合同小收口

- WeatherOverview 今日 daily 单点失败时保留合法 now/hourly 实时证据，不泄漏无证据的日高低温或日夜 code；明日/远期仍不使用今日 now 冒充。
- 官方 `999` 和未来三位天气 code 统一进入中性静态降级；小程序生成字典同步。取消 primary Fixture 显式冻结 cancel-only/提升前后态、ID 对应、revision 递增、幂等重放与全部冲突码。
- UI spec 与生成 preview 补齐单一地点入口、天气卡跳转、四种正常状态、模块错误、七日 abort/generation、单 rAF/29 FPS/DPR2、后台/离屏、reduced-motion、Canvas 故障和计划保护的可视 DOM Fixture。
- 新增脱敏 P0 evidence，纠正旧“当前接力基线”为历史快照，并区分“新 schema 接受旧 payload”与“旧已发布客户端解析新响应”；后者未冒充已证明。
- 风险等级 High（共享天气字典与服务端降级）；专项 `33/33`、API full `341/341`、root/cloud/API typecheck、domain catalog/小程序生成一致性、UI spec build/check/render 通过。生产备份/隔离恢复/新旧 migrator、内外 HTTP、开关与零重启均通过；QWeather 各 endpoint 严格 1 次且缓存复用增量 0，附带推荐未产出 current 的非天气风险保留。未触发 subagent：用户未通知。

## 2026-07-17 / v2.1.24-test / Codex — Wardora 新首页生产实施 P0 合同收口

- WeatherOverview 向后兼容增加当前温度/体感与日夜天气码，真实映射 QWeather now/daily；locationless、weather fallback、超出最大 stale 均不泄漏伪天气字段。
- 从已验收原型 SHA-256 `30c97e315d2efd0d9bfcf10125177d58cf9edb479b8d9310476752277cbe37db` 冻结 62/62 纯数据视觉字典、`998` 静态降级和小程序生成输出；未复制 Canvas、假数据或 localStorage。
- App/小程序 HTTP 错误层保留 status/code/retryable/Retry-After/reasonCode/requestId；新增 Asia/Shanghai 业务日期纯函数，以及取消 primary + 可选提升 backup 的严格合同、冲突码和手写事务不变量 Fixture，未提前实现 P2 UI 或服务端事务。
- UI 唯一规范与生成预览冻结未来五入口、推荐/衣橱分栏、四种正常状态、模块级错误、today 动态/tomorrow 静态、reduced-motion 与计划保护；P0 未切路由、未实现可见 UI/Canvas、未构建 APK 或上传体验版。
- 风险等级 High（共享合同、服务端天气与跨端 HTTP）；API full `338/338`、专项 `20/20`、cloud/API/root/小程序 typecheck、domain catalog/生成一致性、App production build、UI spec build/check/render 与 diff check 通过。生产备份 `wardrobe-20260717-114624.sql`、隔离恢复、新旧镜像 migrator 与迁移 26 通过；API/Worker 已切 `wardrobe-api:320bf3d`，内外 health/ready/version、401/404、开关和零重启通过，保留 `3db5335` 回滚镜像。QWeather 专项严格为 now/hourly/daily 各 1 次、缓存 3 行、重复读取上游增量 0；旧 C1 全链脚本的同一天气证据通过，但合成推荐未产出 current，保留为非 P0 天气风险。未触发 subagent：用户未通知。

## 2026-07-17 / v2.1.24-test / Codex — 新首页生产构建与业务闭环 PRD

- 新增 v0.7.5 新首页生产实施文档，收口首页信息架构、模块交互、地点/天气/推荐数据流、七日按需加载和跨端 Canvas 边界。
- 明确新注册、换手机、重装、多设备并发、会话过期、跨午夜、天气/推荐/图片失败等状态，以及空状态与真实错误的区分。
- 将“设为当日穿搭、更换、取消安排、确认已穿、撤销已穿、保存正式套装”拆为独立业务事务，并确定下一步先做生产前置合同收口。
- 本次为 Low 风险纯文档，不修改运行时代码、数据库、生产环境、App 版本或小程序；本轮未新增 subagent，复用上一轮 App/小程序只读盘点结果。

## 历史快照（2026-07-15，不是当前生产锚点）

- **版本与平台**：`package.json` 为 `2.1.24-test`；正式开发基线为 App/API/共享代码 `main` 与小程序 `wechat/miniprogram`。App 仍以 Android 竖屏、线上唯一数据源和固定签名 APK 为交付边界。
- **当时生产 API**：本快照当时运行 `3db5335`，随后被 P0 的 `320bf3d` 取代；当前生产与回滚事实已再次变化，必须读取 `docs/recommendations/WARDORA_NEW_HOME_P0_EVIDENCE.md`，不得把本历史段当现场状态。数据库迁移数仍为 `26`。
- **生产能力**：推荐 V2 与 QWeather 保持启用，V3 realtime/accept 已分阶段启用；PAW、天气预警和历史气候保持关闭。当前推荐链覆盖只读 GET、实时 resolve、今日/明日 worker 预热、事务 accept、原子双日发布、lease/fencing、上海业务日期和共享天气缓存。
- **最近交付**：自动裁切双路线与 Android 真机闭环、全量动效/浮层/返回栈修复、App/小程序跨端一致性审计、微信登录与账号注销、固定签名 APK 和小程序体验版均已有历史验证记录。
- **接手要求**：编辑前仍须结合 Git、任务相关 evidence、真实源码与生产现场复核；本摘要不是跳过迁移、部署、Android 或小程序验证的依据。

## 2026-07-15 / v2.1.24-test / Codex — 实时推荐 2A-5.1 accept 失效错误边界

- 默认 accept validator 对已清洗/归档、blocked、缺主图或其他当前硬过滤失效改抛明确领域错误；service 只将该错误映射为 `409 conflict` 和 `details.reasonCode=recommendation_no_longer_valid`。
- 取消事务内 validator 的 blanket catch；数据库、天气、解析等非业务异常保持原有 5xx/重试语义，失效采用仍不产生计划、action、mutation、资产 binding 或 primary 变更。
- 红灯为 `5 failed / 17 passed`；修复后真实 PostgreSQL accept `22/22`、推荐合同/路由/实时专项 `20/20`、API full `327/327`及 API/root typecheck 通过。风险等级 High；未触发 subagent：用户未通知。
- 生产备份、部署及 Bearer+device 合成账号 HTTP 验证通过：失效 accept 为 409 且零半状态，恢复后合法 accept/幂等不退化，清理残留为 0；realtime/accept 仍为 `true`。

## 2026-07-15 / v2.1.24-test / Codex — 实时推荐 2A-5 accept/readiness 收口

- accept 在事务锁后重验当前模板/场景、required slots、阻塞风险与全量硬过滤字段；预校验后材质、颜色、季节、主图 binding、状态或 blocked 发生竞态变更时 409 且零半状态。
- 稳定指纹规范化衣物内部集合并排除展示 summary；协调器先查 current，同指纹复用的引擎调用为 0，prepare/天气/输入/引擎失败纳入合法 current 的 served_stale 边界。
- App/小程序现有计划页面改为直接展示无 outfitId 推荐快照和未来不可用提示；无需伪造 SavedOutfit 即可确认/取消已穿，事务写入 actualGarmentIds/snapshots 并同步衣物统计。
- 新增当前上下文、指纹/复用、跨端展示状态和真实 PostgreSQL 竞态/穿着回滚回归；本批不包含新首页、推荐详情、动画、APK、体验版或 PAW。
- 代码主线 `6fb576e`与小程序 `0e2b81d` 已推送；生产保持 realtime/accept 双开关为 `true`，真实 Bearer+device HTTP 链的生成/复用/采用/幂等/无 outfitId 计划读回/已穿统计与零残留清理通过。

## 2026-07-15 / v2.1.24-test / Codex — 实时推荐生产清理边界

- 受控合成账号烟测发现：账号删除级联衣物时，衣物 AFTER DELETE 触发器会给已删除用户重新写 dirty 请求并触发外键失败；先以真实 PostgreSQL 回归测试稳定复现，再新增 0026 加法迁移。
- `enqueue_recommendation_regeneration` 现在会在用户已不存在时直接返回，保留正常衣物/旅行 dirty 行为，同时允许账号数据和 recommendation dirty 请求安全级联清理。
- 增加可清理的 V3 生产烟测脚本，覆盖今日/明日生成与复用、accept 提交/幂等读回、无 outfitId 快照及图片 binding；烟测同时补出并修复默认 accept 硬过滤缺失上下文规则版本的问题，不包含坐标、密钥或真实用户数据。

## 2026-07-15 / v2.1.24-test / Codex — 实时推荐 2A 生产收口

- main `4148541` 与小程序 `c98a2c1` 已推送；生产备份、隔离恢复 25→26、旧镜像兼容、真实 QWeather 计费上限/缓存复用、合成账号 resolve/accept/读回/清理均通过。
- 生产 API/Worker 运行 `wardrobe-api:4148541`、迁移 26、零重启；realtime 与 accept 已按顺序启用，PAW/预警/历史气候仍关闭，详细证据见 `docs/recommendations/RECOMMENDATION_REALTIME_V074_EVIDENCE.md`。
- 生产仅保留当前镜像与已验证回滚镜像 `wardrobe-api:3d1634d`；隔离库和合成账号已清理，根盘约 24% 已用、51 GiB 可用。本批未实现新首页/详情 UI、天气动画、APK 或小程序体验版。

## 2026-07-15 / v2.1.24-test / Codex — 实时推荐 2A-3 计划采用事务

- 新增独立 accept 合同、路由与 0025 加法迁移；同一事务内完成幂等、日期锁、旧 primary 降 backup、无 outfitId 计划、衣物/推荐快照、图片 binding、action 和 sync change，提交后再按主键读回。
- 采用时重读当前衣物并重跑硬过滤；允许仍合法的 superseded 候选，拒绝跨用户/失效衣物、模板变化和超过一件的替换。App/小程序读合同已支持 `garmentIds` 且无 `outfitId`，旅行打包 UUID 优先。
- 删除衣物不再从推荐计划中删 UUID/快照；未来计划标记 blocked，历史计划保留展示语义。真实 PostgreSQL 双连接并发、幂等、降级与四阶段故障注入 `7/7`；accept 开关仍默认关闭。

## 2026-07-15 / v2.1.24-test / Codex — 实时推荐 2A-4 本地门禁与性能基线

- 双 Node 进程同时加压近似双核：同指纹复用 P95 `0.20ms`，缓存天气+规则 `12.10ms`，天气降级后规则 `12.06ms`，500 件内核 `12.10ms`，均通过任务书建议阈值。
- 可执行基准与本地/生产证据入口见 `docs/recommendations/RECOMMENDATION_REALTIME_V074_EVIDENCE.md`；此时 realtime/accept 仍默认关闭，生产备份、恢复、旧镜像兼容、受控账号和 QWeather 计费缓存证据需在 main 集成后补齐。

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
