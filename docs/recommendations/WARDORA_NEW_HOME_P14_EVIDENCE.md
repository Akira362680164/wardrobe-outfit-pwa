# Wardora 新首页 P1.4 视觉骨架 Evidence

日期：2026-07-18

版本：`2.1.29-test`

风险：High
范围：App 只读首页视图、只读 ViewModel 投影、浏览器/Android 证据与固定签名 APK

## 事实源

- v0.2.3 HTML：`/Users/fangzheng/Downloads/Wardora_新首页_天气Canvas_高级动效验证_v0.2.3.html`
- v0.2.3 默认截图：`01_default_390x844.jpg`
- HTML SHA-256：`30c97e315d2efd0d9bfcf10125177d58cf9edb479b8d9310476752277cbe37db`
- 产品合同：`docs/recommendations/WARDORA_NEW_HOME_PRODUCTION_PRD_V075.md` §2.2–2.6、§13.2–13.4
- UI 合同：`docs/designs/wardrobe-ui-spec.md` §4.2

## 实现边界

- 今日/明日天气分别投影 `now/current` 与目标日 `daily` 证据；两卡独立 loading/error/fallback，不用今日证据冒充明日。
- 地点仍复用现有服务端 Sheet、pending、409、错误承载与 Android Back 优先级。
- 静态天气背景直接取 v0.2.3 的 `ambient` palette、降水 scale 与 fallback CSS；本阶段没有挂载原型 Canvas 脚本。
- 推荐卡只 join 真实服务器候选和衣物缩略图链路；缺图使用中性 fallback，不使用原型色块冒充真实图片。
- 七日条位于推荐工具栏；计划或已穿事实存在时不先显示日期条。横轨为原生滚动，不实现 drag controller。
- 启动时不再弹出与服务端推荐语义冲突、遮挡首屏的 MiniMax Key 全局提示；相关能力仍在用户实际触发入口按既有逻辑处理。

## 视觉门禁

- 严格 `390×844` viewport 对照：`artifacts/home-feed-p14/v023-vs-app-390x844.png`
- 自动化运行目录：`test-results/home-feed-p14-visual/20260718/`
- 自动化 manifest：`test-results/home-feed-p14-visual/20260718/manifest.json`
- 尺寸/字体：360、390、430px；100%、130%。
- 状态：ready forecast（真实候选与图片）、empty locationless、weather fallback、protected plan、actual wear。
- 检查项：问候、唯一地点、双天气卡、分栏、日期条从属位置、横向推荐卡、底栏、页面横向溢出、文字遮挡、纵向滚动优先、console/page/runtime unexpected error。
- 视觉几何附加断言：天气/推荐固定文字行轨道；地点文字与推荐目标标题相对各自一级卡顶边均为 `22px`；天气外框/内卡半径为 `28px/22px`，底座为不透明表面且无 box-shadow/backdrop-filter；一级推荐工具栏与首卡左边距 `17px`；底栏满足 `activeRadius = outerRadius - inset`。
- 独立只读视觉复审：冻结 commit `fca848986279a79dde87760d8f29a24325bfa49c` 的 P0/P1/P2 均为 0，结论建议交付；复审实际查看原型、对照图、全浏览器矩阵、状态图和当前 Android 截图/manifest/logcat。

## Android Fixture 门禁

- `wardrobe-test` Android 15 / API 35，WebView 等价 viewport `391×737`、DPR `2.625`。
- 安装固定签名 Fixture APK：`com.wardrobe.outfit` / `2.1.29-test` / versionCode `20129`；它只连接 `10.0.2.2:4184`，仅用于设备交互，不是正式交付包。
- 真实候选 3 张、服务端缩略图 9 张；今日/明日切换并滚到推荐区、横轨原生滚动、纵向页面滚动、地点 Sheet + 系统 Back、130% 字体、前后台恢复均通过。
- Android runtime exception、非取消 loading failure、logcat fatal 均为 0；脱敏截图、logcat 和 manifest 位于 `test-results/home-feed-p14-android/20260718/`。

## 明确未实现

- P3 Canvas、rAF、粒子、动态天气和系统定位。
- P2 采用/替换/取消/已穿等写事务与乐观更新。
- 客户端业务缓存、localStorage、Outbox。
- 微信小程序 P4 对齐。
- 推荐算法、服务端、数据库、云合同或生产部署变更。
