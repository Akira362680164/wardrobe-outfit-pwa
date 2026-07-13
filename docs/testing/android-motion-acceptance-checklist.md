# Android 动效验收清单

本清单用于 Wave 6 冻结源码取证与最终集成 APK 复测。它不替代业务 E2E，也不允许用 Wave 6 之前构建的 APK 宣称最终动效已验收。

## 1. 安全边界与产物来源

- 默认只使用 Android Emulator。若未得到用户明确授权，不向物理设备安装 APK。
- APK 必须先核对包名 `com.wardrobe.outfit`、`versionName/versionCode` 和固定签名 `CN=fangzheng`；文件名不能作为证据。
- `pre-wave-control` APK 只验证 ADB、安装、启动、前台窗口、返回键入口和 crash 日志链路；六项动效结论必须来自 `final-wave6` APK。
- 使用测试账号、测试 API 和非敏感图片。截图、CDP 输出与 logcat 不得包含 MiniMax Key、密码、Token、用户照片或正式衣橱数据。
- 原始日志和截图保存在 `.gitignore` 已覆盖的 `test-results/`；Git 只提交 `artifacts/motion-repair-*` 下的非敏感索引，不提交 APK、设备序列号或生成目录。

## 2. 冻结源码检查

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"

npx tsx scripts/android-motion-acceptance.ts \
  --phase frozen \
  --signing-root <正式集成目录> \
  --apk <v2.1.18-test 控制面 APK> \
  --apk-provenance pre-wave-control \
  --results-dir test-results/motion-repair-android/frozen
```

通过条件：脚本的 390×844 源码矩阵全绿；报告仍将六项最终设备行标为“主 Agent 最终复测”。冻结源码检查不能证明尚未合入的 D1-Runtime / D1-Contracts，也不能证明最终 APK。出现定时敏感失败时保存首次失败日志并记录重复运行的完整通过/失败次数，禁止用静默自动重试把红灯改写成通过。

## 3. 最终集成 APK 前置门禁

1. Wave 6 三个分支按 `Runtime → Contracts → Android` 合入，工作区干净。
2. 主 Agent 统一递增版本并使用固定签名构建 APK。
3. 运行 `npm run typecheck`、`npm run build` 和适用的 D1 契约测试。
4. 启动 `wardrobe-test` 等 API 35 模拟器，等待 `sys.boot_completed=1`，记录 Android 版本与 AVD 名，不记录设备序列号到 Git。
5. 运行安全控制面验证：

```bash
npx tsx scripts/android-motion-acceptance.ts \
  --phase final \
  --signing-root <最终集成目录> \
  --apk <最终 Wave 6 APK> \
  --apk-provenance final-wave6 \
  --serial emulator-5554 \
  --run-device-control-plane \
  --results-dir test-results/motion-repair-android/final
```

`--run-device-control-plane` 只接受显式 `emulator-*` 序列号，防止误装到物理设备。它覆盖安装、启动、前台窗口、系统 Back 注入、重新启动、竖屏截图与 fatal logcat 扫描；下面六行仍须人工或 WebView CDP 实际操作。

## 4. 390×844 竖屏矩阵

每行至少保存“操作前、接管中、收口后”三帧或短视频、一个结构化结果和筛选后的 logcat。若画面含测试数据，证据索引只记录相对文件名与结论。

| 行 | 操作 | Apple 动效通过标准 | 冻结源码证据 | 最终 APK |
| --- | --- | --- | --- | --- |
| 浮层 Back | 依次打开页面 → Sheet → Lightbox/确认层；按一次 Android Back；busy 时再按一次 | 每次只关闭或拒绝 topmost；不穿透页面、不双重退栈；退出层完成前持续锁滚 | store + overlay 合同 | 主 Agent 最终复测 |
| 图片反向接管 | 轮播拖过中点后释放，在收口途中反向拖；Lightbox 下拖后立刻反向 | 新手势从当前呈现位置接管；轨道不闪回旧目标；单次 flick 最多一张；缩放/平移时不误触下滑关闭 | Carousel + C2 harness | 主 Agent 最终复测 |
| 日历斜滑 | 45° 纵向占优斜滑、明显横向斜滑、切页收口中反向 | 纵向占优保持页面滚动且不切月；横向只切相邻一页；反向无白屏、无旧月份跳回 | B3 物理合同 | 主 Agent 最终复测 |
| 滑条纵向滚动 | 从 44px knob 命中区按下后纵滑页面，再执行横向拖出轨道 | 纵滑不改值、不产生 `onChange` 且页面能滚；横拖保留 grab offset、越界仍跟手、整数去重 | B4 touch harness | 主 Agent 最终复测 |
| 路由中断 | Tab 四连切；列表 push 详情后立即 pop；深层页连续 Back；Sheet 退出和 intake push 重叠 | 同时只有一个 current page；退出页 inert；方向不反；返回恢复滚动；无白帧、双动画或点击穿透 | C1/C3 harness | 主 Agent 最终复测 |
| reduced-motion | 在模拟器开启“移除动画”，用 WebView/CDP 确认 `matchMedia('(prefers-reduced-motion: reduce)').matches` 为真，再重复上述路径 | 直接操控仍跟手；释放即时收口；路由、选中和展开无大位移/spring；内容与操作仍完整 | 多个 reduced harness | 主 Agent 最终复测 |

## 5. Android Back、日志与证据命名

- Back 必须使用 `adb -s <emulator> shell input keyevent KEYCODE_BACK` 或真实系统手势，不用页面内 Escape 代替。
- 每行操作前 `adb logcat -c`，操作后保存 `adb logcat -d -t 1000`，并额外筛选 `FATAL|AndroidRuntime|com.wardrobe.outfit`。原始日志留在 `test-results/`，索引只写“无 fatal”或精确失败摘要。
- 推荐命名：`01-overlay-back-before.png`、`01-overlay-back-takeover.png`、`01-overlay-back-after.png`；其余行按 `02` 至 `06` 编号。
- reduced-motion 测试完成后恢复模拟器动画设置，避免污染后续常规速度验收。

## 6. 最终判定

仅当最终 APK 的六行全部通过、包名/版本/固定签名正确、启动和交互后无目标进程 fatal、证据来自同一个最终 APK SHA-256，才可由主 Agent 把“主 Agent 最终复测”改为通过。任一行只在浏览器或旧 APK 验证，都必须保留为未验证风险。
