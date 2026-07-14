# D1-Android 动效验收证据索引

## 运行身份

- 冻结提交：`99af582da5537b7d400878d0ecc56aca5131a2c9`
- 分支：`codex/motion-d1-android-20260713`
- App 版本：`2.1.18-test`（未递增）
- 目标视口：`390 × 844` 竖屏
- 最终 Wave 6 APK 验收：**未声明；主 Agent 最终复测**

## 环境与 APK 控制面

| 检查 | 结果 | 证据边界 |
| --- | --- | --- |
| ADB | 通过 | platform-tools 可执行；不记录设备序列号 |
| AVD | 通过 | API 35 验收 AVD 入口可用 |
| 固定签名配置 | 通过 | 正式集成目录的 jks/properties 存在；敏感文件未复制或提交 |
| Gradle 固定签名门禁 | 通过 | debug/release 均引用 `wardrobeFixed`，缺配置即中止 |
| APK metadata 入口 | 通过 | `android-emulator-regression.sh metadata` 可核对包名、版本、签名和 SHA-256 |
| v2.1.18-test 控制面样本 | 通过 | 包名 `com.wardrobe.outfit`、versionCode `20118`、固定签名 CN 匹配；它早于 Wave 动效，只算控制面证据 |
| API 35 模拟器控制面 | 通过 | `wardrobe-test` / Android 15：覆盖安装、冷启动、前台 `MainActivity`、系统 Back 注入、重新启动、竖屏截图和进程检查通过，两次目标 fatal 筛选均为空；脚本已关闭模拟器 |

## 冻结源码 390px 矩阵

原始日志和截图只保存在忽略目录 `test-results/motion-repair-android/`，不纳入 Git。本轮冻结报告位于 `frozen-99af582d/`，控制面报告位于 `control-plane-pre-wave-interaction/20260714-004521/`；任何浏览器/逻辑通过都不能替代最终 APK 行。控制面竖屏截图已目检为无账号内容的登录壳，无明显裁切或横向溢出。

| 行 | 冻结源码检查 | 状态 | 最终 APK |
| --- | --- | --- | --- |
| 浮层 Back | BackCoordinator store + Overlay 合同 | 2/2 通过 | 主 Agent 最终复测 |
| 图片反向接管 | Carousel / Lightbox / C2 390px harness | Carousel 稳定通过；C2 严格首帧断言 6/8 通过、2/8 定时波动 | 主 Agent 最终复测 |
| 日历斜滑 | B3 轴意图、速度投影、反向接管合同 | 冻结合同通过；真实 WebView 滚动待最终 | 主 Agent 最终复测 |
| 滑条纵向滚动 | B4 390px touch harness | 纵滑不改值通过；真实 WebView 页面滚动待最终 | 主 Agent 最终复测 |
| 路由中断 | C1 + C3 深层流程 390px harness | 4/4 通过 | 主 Agent 最终复测 |
| reduced-motion | Carousel / C1 / C2 / C3 reduced contexts | 通过（由对应 harness 覆盖） | 主 Agent 最终复测 |

冻结 runner 的 10 个检查中，9 项在三轮完整矩阵均稳定通过；C2 `test-detail-continuity-browser.mjs:330` 的“退出动画首 keyframe transform 字符串严格等于 Escape 前采样”存在定时波动。两轮完整矩阵曾全绿，最新完整矩阵为 `9/10`；连同 5 次隔离复测，C2 合计 `6/8` 通过、`2/8` 失败。两次失败都采到相邻但不相等的进入矩阵（例如 `matrix(0.729375, ..., -46.7857, -134.561)` 对 `matrix(0.66528, ..., -57.8665, -166.43)`），符合跨帧采样竞态特征，但 D1-Android 不据此修改 C2 runtime 或既有 harness，也不以自动重试吞掉红灯。主 Agent 已确认在 Wave 6 合流后改为同一事件帧的确定性连续性断言，并复跑最终矩阵。

控制面 APK SHA-256 为 `dcbc995a059e1974ce740f681642cf0abe0ccbdc394b4be618976e1edb03a256`；该哈希只标识旧 APK 样本，不是最终 Wave 6 产物。

本机忽略目录中的取证文件完整性：

| 文件 | SHA-256 |
| --- | --- |
| `frozen-99af582d/summary.json` | `71cab5629b00d91be977574c3f0cd42b4485d4a6c4c47e64b54cfa8e69a184a0` |
| `frozen-99af582d/summary.md` | `1e044df48a6840589a250f3013bd0f5c75e793477d7171927a21426626fea4dd` |
| `frozen-99af582d/logs/detail-lightbox-takeover.log` | `f36a35e415e07e5a00aed442d9fa0efe3e26eef7679967ed311460b052e88dae` |
| `control-plane-pre-wave-interaction/20260714-004521/summary.md` | `9a5b487cae658fc63018d54f5774b694954ec703e5016384bf092f79180b2653` |
| `control-plane-pre-wave-interaction/20260714-004521/logcat-after-interaction.log` | `8f3e03201fe1690d7c1fad5e60b543bcf76e879ff59026fa0012b1f948a4cd63` |
| `control-plane-pre-wave-interaction/20260714-004521/portrait.png` | `c3e0daf9089cd70cef272eb327d2ab5a183880112bc384e643891b7839e47120` |

## 本 Session 门禁

| 命令 / 检查 | 结果 |
| --- | --- |
| `npx tsx scripts/android-motion-acceptance.ts --phase frozen ...` | 最新 9/10；C2 定时敏感严格相等断言保留为失败证据 |
| `npm run docs:ui-spec:build` / `check` / `test:logic:ui-spec-preview` | 通过 |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过，Next 静态导出成功 |
| `git diff --check` | 通过（提交前再次执行） |

## 隐私与仓库检查

- 本索引不含 APK、签名材料、设备序列号、用户账号、Token、MiniMax Key、正式图片或业务数据。
- 未修改运行时代码、API、业务字段、存储策略、小程序或版本号。
- 最终复测必须使用 Wave 6 合流后新构建的固定签名 APK；不得复用本索引中的控制面样本结论。
