# Wardora 新首页 P3 实施证据

日期：2026-07-18

版本：`2.1.31-test`

原型 SHA-256：`30c97e315d2efd0d9bfcf10125177d58cf9edb479b8d9310476752277cbe37db`

## 生产边界

- 今日且新鲜 forecast 才运行 Canvas；明日、`998/999`、任意未知 code、locationless、weather fallback、stale 和 Canvas 失败都静态。
- 绘制模块使用原型 `wardora-v023` hash/seed、参数、固定顺序和事件相位；原型 DOM、Fixture、debug 面板和 localStorage 未进入运行时。
- 位置仅请求 Android 前台 `ACCESS_COARSE_LOCATION`，`enableHighAccuracy=false`；不自动请权限，不保存坐标，不请求后台/精确位置。

## 固定 code / clock 视觉矩阵

证据目录：`test-results/home-feed-p3-visual/20260718/`。左为 v0.2.3，右为生产 Canvas，均使用 reduced-motion、clock `0`、DPR `1`，并隐去文字只比较天气层。

| code | 场景 | 归一化像素 MAE | 结构 |
| --- | --- | ---: | --- |
| 304 | 雷阵雨伴冰雹静帧 | 0.07216 | 今日 Canvas 1，明日 0 |
| 403 | 暴雪 | 0.03617 | 今日 Canvas 1，明日 0 |
| 508 | 强沙尘暴 | 0.04839 | 今日 Canvas 1，明日 0 |
| 512 | 重度霾 | 0.02288 | 今日 Canvas 1，明日 0 |
| 998 | 未知静态 | 0.01689 | 今日/明日 Canvas 均 0 |

全部场景横向溢出为 0；并排图未出现雪墙、玻璃竖板或沙墙回归。`comparison.json` 保留每个场景的诊断和图片路径。

## 自动化

- `npm run test:logic:home-feed-p3`：62/62 字典、确定性 seed/clock、today-only、静态回退、29 FPS 节流、恢复不补帧、reduced-motion、权限分类和坐标删除通过。
- `npm run test:visual:home-feed-p3`：304/403/508/512/998 并排图、像素指标、今日/明日结构通过。
- `npm run test:browser:home-feed-p3`：真实 rAF `28–29 FPS`、DPR `2`、离屏停止、Canvas 初始化故障静态回退、reduced-motion `fps=0/clock=0`、用途确认前服务端坐标解析请求 0、确认后 1，360/390/430px + 130% 无溢出。截图与 `canvas-location-flow.webm` 位于浏览器证据目录。
- `npx cap sync android && ./gradlew assembleDebug`：Capacitor Geolocation 与自有系统设置插件编译通过，使用正式固定签名配置，未回退 debug keystore。

Android API35 安装/E2E、后台/锁屏与独立视觉 subagent 证据在 P3 冻结提交后补录。
