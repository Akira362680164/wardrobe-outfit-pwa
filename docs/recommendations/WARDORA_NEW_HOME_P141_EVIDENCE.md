# Wardora 新首页 P1.4.1 验收证据

日期：2026-07-18

基线：`main@99196c271d5292eb18b3a1fd0b3bfed65c7a97bf`

版本：`2.1.30-test`

视觉事实源：`Wardora_新首页_天气Canvas_高级动效验证_v0.2.3.html`
事实源 SHA-256：`30c97e315d2efd0d9bfcf10125177d58cf9edb479b8d9310476752277cbe37db`

## 修复与证据映射

| 验收缺陷 | App 修复 | 手写/浏览器证据 |
| --- | --- | --- |
| 行程地点与来源 | 按所选业务日期优先投影 Weather/Recommendation 的 `resolvedLocation/locationSource` | `travel-390-font100.png`；无常驻城市仍为 `home-ready-forecast` |
| QWeather、更新时间与 stale | 保留 attribution、weatherUpdatedAt、endpointFreshness；stale 显示“缓存” | `stale-360-font130.png` |
| 计划快照与可用性 | 保留 snapshots、availability、unavailable IDs；当前实体图片与删除快照名称合并展示 | `protected-plan-with-date-strip-390.png` |
| 事实卡后浏览未来日期 | 事实卡优先，七日日期条紧随其后；第 3–7 天按需读取 | `protected-plan-future-day-390.png` |
| 单日天气定向重试 | `retryWeather(date)` 显式锁定卡片日期 | HomeFeed P1.3 `directedWeatherRetryFixture`；`partial-weather-error-430-font130.png` |

浏览器完整清单与错误统计见 `artifacts/home-feed-p141/browser-manifest.json`。travel、stale、protected-plan-with-date-strip、partial-weather-error 四个受影响状态均分别覆盖 `360/390/430px × 100%/130%`；计划态逐一点击第 3–7 天，partial weather 实际点击明日重试并证明今日成功卡不变、明日单独恢复。其中 Fixture 衣物图是服务器资产与缩略图 join 链路的可控 SVG 证据，不代表生产照片质量。

API 35 / Android 15 Fixture APK 的清单、受影响状态截图与 logcat 见 `artifacts/home-feed-p141/android-fixture/`。其 WebView 等价宽度为 391px，覆盖今日/明日切换与滚动、推荐横滑/页面纵滑、地点 Sheet 系统 Back、130% 字体、前后台恢复，以及 travel、stale、blocked snapshot、计划后第 3 天切换和 partial weather error；明日卡实际重试后单独恢复，今日卡保持不变。runtime exception、loading failure、fatal 均为 0。

## 已通过门禁

- `npm run test:logic:home-feed-p1`
- `npm run test:logic:home-feed-p13`
- `npm run typecheck`
- `npm run test:logic:ui-contracts`
- `npm run docs:ui-spec:build && npm run docs:ui-spec:check`
- `npm run test:browser:home-feed-p13`
- `npm run test:browser:home-feed-p14`
- `npm run test:android:home-feed-p14`（固定签名 Fixture APK，API 35）
- `npm run build`

## 明确未扩展

本批不实现天气 Canvas、系统定位、P2 写操作或微信小程序；不修改服务端、数据库、共享合同、推荐算法、PAW 或生产 API。

## 独立视觉审查

独立只读审查在冻结 commit `43a5add8c50282b7d6f3673ed7f0dd81eeedfd6b` 上完成。审查确认四张初始状态截图无可见 P0/P2/P3，但将“新增状态没有各自跑满响应式矩阵、第 4–7 天和实际重试未逐项点击”列为 P1 证据缺口；该缺口已通过上述完整矩阵和交互断言关闭。审查原始结论与关闭映射见 `artifacts/home-feed-p141/INDEPENDENT_VISUAL_REVIEW.md`。
