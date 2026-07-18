# Wardora 新首页 P3 实施证据

日期：2026-07-18

版本：`2.1.31-test`

原型 SHA-256：`30c97e315d2efd0d9bfcf10125177d58cf9edb479b8d9310476752277cbe37db`

## 生产边界

- 今日且新鲜 forecast 才运行 Canvas；明日、`998/999`、任意未知 code、locationless、weather fallback、stale 和 Canvas 失败都静态。
- 绘制模块直接移植原型 `wardora-v023` hash/seed、完整场景参数、绘制顺序和事件相位；原型 DOM、Fixture、debug 面板和 localStorage 未进入运行时。
- 位置仅请求 Android 前台 `ACCESS_COARSE_LOCATION`，`enableHighAccuracy=false`；不自动请权限，不保存坐标，不请求后台/精确位置。

## 固定 code / clock 视觉矩阵

证据目录：`test-results/home-feed-p3-visual/20260718/`。左为 v0.2.3，右为生产 Canvas，使用固定 code/seed/clock、DPR `1`，并隐去文字只比较天气层；304 另覆盖雷光和冰雹事件时钟。

| code | 场景 | 归一化像素 MAE | 结构 |
| --- | --- | ---: | --- |
| 304 | 静帧、雷光 0.03/0.32、冰雹 0.4/0.7/0.9 | 0.05292–0.05837 | 今日 Canvas 1，明日 0 |
| 403 | 暴雪 clock 0/2.5 | 0.03353–0.03397 | 今日 Canvas 1，明日 0 |
| 508 | 强沙尘暴 clock 0/4 | 0.06749–0.06770 | 今日 Canvas 1，明日 0 |
| 512 | 重度霾 clock 0/8 | 0.03891–0.03897 | 今日 Canvas 1，明日 0 |
| 998 | 未知静态 | 0.01689 | 今日/明日 Canvas 均 0 |

全部场景横向溢出为 0；并排图未出现雪墙、玻璃竖板或沙墙回归。`comparison.json` 保留每个场景的诊断和图片路径。

## 自动化

- `npm run test:logic:home-feed-p3`：62/62 字典、确定性 seed/clock、today-only、静态回退、29 FPS 节流、恢复不补帧、reduced-motion、权限分类和坐标删除通过。
- `npm run test:visual:home-feed-p3`：13 个固定 code/clock 对照全部低于硬阈值（主要场景 `MAE≤0.08`、998 `≤0.03`），今日/明日结构通过。
- `npm run test:browser:home-feed-p3`：真实 rAF `28 FPS`、DPR `2`、离屏停止、运行时 reduced-motion 归零、恢复不补帧、用途确认前坐标解析请求 0、确认后 1，360/390/430px + 130% 无溢出，嵌套 Sheet Escape/Back 通过。
- `npx cap sync android && ./gradlew assembleDebug`：Capacitor Geolocation 与自有系统设置插件编译通过，使用正式固定签名配置，未回退 debug keystore。

## Android API35

- `wardrobe-test` / Android 15 / API35 安装 `2.1.31-test`（versionCode `20131`），WebView 等效宽度 391px、设备 DPR 2.625、Canvas 实际 DPR 限制为 2。
- 模拟器多轮 Canvas 实测 `18–26 FPS`，最终证据轮为 26 FPS；浏览器同一调度器实测 28 FPS。reduced-motion 为 `fps=0/clock=0`，恢复不补帧。该模拟器性能值如实保留，不以浏览器数值冒充 Android。
- 前后台、锁屏、静态故障回退、130% 字体、横纵滚动、系统 Back、旅行/stale/删除快照/部分天气重试通过；运行时异常、加载失败和 Android fatal 均为 0。
- 权限链路覆盖：首页和地点入口不自动请求、用途说明前不请求、永久拒绝、打开系统设置、返回后授予大致位置、解析并确认“上海”；P2 覆盖采用、断网写入保持原卡、重试确认已穿、撤销已穿、取消安排。
- 证据：`test-results/home-feed-p14-android/20260718/manifest.json`、同目录截图和 `logcat.txt`。本机没有可用物理 Android 设备，物理机性能与权限分支尚未验证。

独立只读视觉 subagent 将在修正提交冻结后复审；P0/P1 未清零前不合入。
