# Wardora 新首页 P4 微信小程序实施证据

日期：2026-07-18

版本：`2.1.31-test`

P2/P3 依赖：`main@88e2ef768b5d3b58a35910c30b5fbd797f1e42ab`

## 实现边界

- `pages/home/index` 已替换休眠跳转页，生产读取只接受服务端 location/weather/recommendation/workspace 响应；不新增业务持久缓存、Outbox、隐藏队列或乐观成功态。
- 推荐采用、最多替换一件、不喜欢、保存套装、取消并原子恢复备选、确认/撤销已穿均复用 P2 共享 schema 与正式 API。草稿在当前页面会话中持有稳定 `clientMutationId`；成功必须再读 planning/outfit，超时只在读回可证明时收口。
- 天气 bridge 由生成器直接打包 App P3 `weather-canvas-engine` 与 scheduler；平台层只把 HTML texture canvas 适配为 `wx.createOffscreenCanvas`，不复制天气参数或绘制顺序。
- 首页和生命周期不自动请求位置。地点 Sheet 展示用途后，只有主动点击“使用当前位置”才请求隐私授权和 WGS84 非高精度位置；坐标只用于一次 `resolve-device`，不进入 storage、日志或测试包。

## 手写 Fixture 与合同门禁

- `npm run test:logic:miniprogram-home-p4`：业务日期、七日条、generation/底层 request task abort、账号切换、权限触发条件、稳定 mutation ID、replace-one、采用/取消恢复/已穿读回、409/超时用户文案与静态宿主合同通过。
- `npm run test:logic:miniprogram-home-p4-canvas`：62/62 官方视觉 code 加未知 code 的 today/tomorrow scene 与 App 深比较；304/403/508/512/998 固定 clock/event 深比较；today dynamic、tomorrow/static、unknown/fallback/stale eligibility 通过。
- API full：39 个测试文件、343/343 通过，覆盖 P2 PostgreSQL 幂等、双设备并发、revision 冲突、故障回滚与严格路由合同。
- `home-shared:miniprogram:check`、domain catalog/miniprogram catalog check、cloud/API/root/小程序 typecheck、App P1/P2/P3 逻辑回归、UI spec check、Next production build 均通过。
- 既有小程序 shell、runtime refresh、navigation/motion、auth refresh、微信邮箱登录回归通过；shell 门禁发现并修正 picker 可见字符，继续统一使用共享 SVG icon。

## WeChat DevTools

- 客户端：WeChat DevTools Nightly `2.02.2607132`，基础库 `3.15.2`，已登录真实客户端。
- 正式源码保持 TypeScript；验收生成器只向 `/tmp/wardora-p4-devtools-validation-*` 写机械 CJS 副本，避免 Nightly 对全新 worktree 不产出页面 JS 的工具缺陷。源码目录没有派生 JS。
- 手写 Fixture controller 仅在 `/tmp` 验收副本中临时替换真实 `pages/home/index.js`，因此截图仍运行正式首页 WXML/WXSS、真实四 Tab + 中央创建按钮和共享组件；生产 `app.json`、页面 controller 与网络服务不存在 Fixture 路由或 Fixture 分支。
- 全状态首轮截图使用 `*-final.png`；独立审计修复后的关键状态使用 `*-audit2.png` 与 `*-audit3.png`，位于 `artifacts/home-feed-p4-wechat/`。第三轮重新覆盖 normal、partial weather、stale、locationless、Canvas failure、permission/settings 与 center-create Sheet。
- 尺寸覆盖：iPhone 12/13 Pro `390×844`、iPhone 14 Pro Max `430×932`、Nexus 5 `360×640`；字体 `16` 与 `21`，即 `21/16=131.25%`。地点 Sheet、P2 Sheet、日期条、事实卡和长文案无横向裁切。
- Canvas 实测见 `artifacts/home-feed-p4-wechat/devtools-metrics.json`：DPR `2`，目标 `29 FPS`；暂停 0.9 秒帧数保持 `162`，恢复 1.2 秒增加 `35` 帧且不补跑暂停帧；reduced-motion 只绘制初始 1 帧。
- 今日同源 Canvas 覆盖完整天气卡，但只承担动态装饰：共享内核新增默认关闭的 `transparentAmbient` 宿主选项，App 默认绘制顺序与像素不变，小程序把环境底色交给卡片层并在透明 Canvas 上继续执行同源天气效果。当前温度、最高温、摘要和 meta 始终由原生 `cover-view` 承载；异常、stale、locationless 与 Canvas failure 使用同一原生文字层。宿主用 Canvas clip 固定 13px 四角，明日保持静态圆角卡。
- 用户指出的首轮视觉偏差已关闭：地点左对齐、天气壳移除渐变底座、双卡四角完整、分段控件 52/44px 与 14/11px 圆角、App 同排日期工具栏、三套横向推荐、主操作 + 48px 详情按钮、四 Tab + 中央加号；旧右下 FAB 已删除，Sheet 打开时底栏隐藏避免遮挡。
- 首轮独立视觉审计发现并关闭两项 P1：静态天气文案不可见，以及 permission/center-create Sheet 仍可能露出底栏。`360/390/430 × 100%` 与 `360 × 131.25%` 的 `*-audit2.png` 均使用稳定等待后重拍；partial weather 未再出现 Canvas 原生层错位。
- 第二轮独立审计继续发现并关闭动态文案仍由 Canvas 绘制、stale 缺最高温/缓存时间、locationless 明日卡与 QWeather 归属残留。`*-audit3.png` 证明动态文字已改为原生层，stale 同时显示最高温、较早状态和缓存时间；locationless 今日/明日均为中性卡且不显示供应商归属。

## 权限、生命周期与失败分支

- DevTools 视觉与逻辑 Fixture 覆盖：用途说明、主动请求、拒绝/设置入口、手工搜索、候选临时/常驻；设置返回不会自动再次定位。
- generation + request task abort 覆盖快速日期切换；账号 scope、跨午夜、onShow/onHide/onUnload 和会话清理由纯逻辑与页面合同覆盖。
- 断网、409、超时、部分天气失败、blocked/历史快照均不显示伪成功；无城市不阻塞通用推荐。

## 已知风险与禁止动作

- 未连接可用的物理微信真机；DevTools 不能替代真机的权限弹窗文案、系统设置往返、GPU/FPS、后台回收和弱网行为。体验版发布前仍需在 iOS 与 Android 微信各补一轮。
- Nightly 控制台曾出现基础库自身 `WAServiceMainContext timeout`，项目重新编译后无 WXML/WXSS/JS 编译错误；该 SDK 噪声不作为项目通过项隐藏。
- 未调用 `miniprogram_upload`、preview、云数据库/存储写入、云函数部署或生产 API 部署；没有上传体验版。
