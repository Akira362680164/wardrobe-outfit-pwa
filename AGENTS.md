# AI Agent 编辑约定

本文件是本项目所有 AI agent 修改代码前必须读取并遵守的主约束文件。已知会参与编辑的 agent 包括 Codex、Claude Code、MiniMax Code；三者都遵守同一份规则。它放在项目根目录，Codex 类 agent 会自动加载；`README.md`、`CLAUDE.md` 和 `MINIMAX.md` 只作为入口提示，具体规则以本文件为准。任何 agent 如果没有先读完本文件，不允许修改项目文件。

## 读取顺序

1. 先读本文件。
2. 再读用户的通用协作偏好：`/Users/fangzheng/Documents/Codex/2026-05-28/codex-ui-codex-agent-codex/codex_experience_profile.md`。
3. 再读 `README.md`、`package.json`、`VERSION_HISTORY.md`，以及本次任务相关的源码文件。
4. 只有任务明确涉及时，才读取历史交接文档，例如 `HANDOFF_TO_CLAUDECODE.md`、`CLAUDECODE_*.md`、`MINIMAX_*.md`。

读取 `VERSION_HISTORY.md` 时必须做历史接力检查：

- 先阅读最新一条版本记录，确认上一位编辑 agent、版本、改动范围、验证结果和未验证风险。
- 如果最新记录就是当前 agent 身份写的，可以继续按任务范围读取相关历史。
- 如果最新记录是其他 agent 写的，必须继续向更早版本阅读，逐条理解其他 agent 在此期间做过的改动、验证和风险，直到读到当前 agent 身份上一次写入的版本记录为止。
- 如果一直读不到当前 agent 身份的历史记录，必须至少读到历史基线，并对本次任务相关模块的所有跨 agent 改动形成上下文后再编辑。
- 不允许只看 `package.json` 版本号或 APK 文件名就直接继续开发；跨 agent 期间的历史记录是接手上下文的一部分。

如果用户的当前指令、本文件、历史交接文档存在冲突，以用户当前指令优先，其次是本文件，最后才是历史文档。

## 项目定位

这是一个手机优先的衣橱识别、穿搭推荐、买前评估和 AI 试穿预览 App。技术栈是 Next.js / React / TypeScript / Tailwind / Capacitor / Fastify / PostgreSQL，最终要能打成 Android APK。服务器是正式业务数据和图片的唯一权威数据源，客户端只保留当前页面会话中的内存状态。

默认原则：

- App 必须手机优先，不接受只适合桌面网页的交互。
- Android 本机运行是正式交付目标；业务读写必须连接已配置的线上 API，不依赖家里电脑或局域网服务。
- 衣橱数据、参考照片和正式图片只保存到当前用户的服务器空间；MiniMax Key 仍只保存在用户设备。不要把密钥写进源码、日志、README、APK 或测试数据。
- MiniMax 相关功能要有本地规则或清晰失败提示作为兜底，不允许让主要流程卡死。
- 不要为单个地点、单次旅行或单个案例硬编码特例；目的地、季节、时间、天气和活动要抽象成可复用场景理解。

## 线上唯一数据源规则

- 单品、衣橱位置、套装、套装关联、种草、旅行计划、穿搭计划、穿着记录、收藏状态、图片和试穿档案只以服务器返回为准。
- 客户端不得把正式业务数据或图片写入 IndexedDB、SQLite、Cache Storage、文件系统或其他持久缓存。
- 客户端只允许在当前 React 页面会话内保留选图、裁切结果、缩略图、AI 识别结果、未提交表单和当前请求的 `clientMutationId`；App 被关闭或系统杀死后允许丢失。
- 写操作必须等待服务器事务提交并重新读取成功后才显示成功；禁止乐观更新、Outbox、后台自动同步和隐藏的本地回退。
- 写失败必须停留当前页面并保留内存草稿；草稿未变化时重试复用同一 `clientMutationId`，草稿变化后生成新 ID。
- 图片按“临时资产会话 → 上传原图和缩略图 → 业务事务绑定 → 服务端读回”的顺序保存，不得先显示实体成功再后台补图。
- 登录会话、MiniMax Key 和不含业务数据的一次性迁移标记不属于业务缓存，继续遵守各自安全规则。

## 修改边界

- 不要改 `node_modules`。
- 不要把 `.next`、`out`、`android/app/src/main/assets/public` 当作源码手工改；这些目录通常由构建或 `npm run android:sync` 生成。
- 修改 Android 原生资源或版本信息时，要确认是否需要重新同步、重新构建 APK。
- 不要删除或重命名本文件。新增任何 agent 专用入口文件时，必须指向本文件，不能复制一份规则另起炉灶。
- 不要执行破坏性操作，例如清空数据库、删除用户备份、重置工作区、覆盖 APK 历史文件，除非用户明确要求。
- 不要回滚不属于本次任务的改动；如果遇到其他 agent 或用户留下的变更，先理解并与之兼容。

## 文件删除安全规则

本节适用于参与本项目的所有 agent、subagent、worker 和人工委派任务。任何删除文件或目录的操作都必须先遵守本节，再遵守具体任务说明。

- 禁止执行 `rm -rf`、`rm -r`、`rm -f`、`sudo rm`，以及任何包含等效递归删除、强制删除语义的命令。
- 禁止使用 `find ... -delete`、`git clean -f`、`git clean -fd`、`git clean -fdx`、脚本递归删除、Node.js `fs.rm(..., { recursive: true, force: true })` 等方式绕过本规则。
- 删除任何文件或目录时，必须将目标移动到操作系统回收站，不得永久删除。
- macOS 环境优先使用 `trash <路径>`。如果系统没有安装 `trash` 命令，使用 Finder、系统回收站接口或其他明确执行“移到废纸篓”的安全方式。
- 不得为了完成任务自行安装删除工具。缺少可靠的回收站操作能力时，停止删除操作，保留目标文件，并在最终回复中说明。
- 删除前必须执行 `git status --short`，确认目标文件及目录不包含用户或其他 agent 的未提交改动。
- 删除多个目标前必须逐项列出并核对路径。禁止使用未经展开确认的通配符删除，例如 `*`、`**`、变量拼接路径和根目录相对路径。
- 移入回收站后必须再次执行 `git status --short`，确认只删除了本次任务明确要求删除的文件。
- 对 Git 跟踪文件，不得使用 `git checkout -- <file>`、`git restore <file>`、`git reset --hard` 等命令伪装成删除或回滚。
- 构建工具自身清理其专属生成目录不视为 agent 手工删除，但 agent 不得额外执行永久删除命令清理 `.next`、`out`、Android build、缓存目录或测试产物。
- 用户明确要求永久删除时，agent 仍必须先说明风险并获得用户对具体路径的再次明确确认，之后才允许执行。

## API Key 存储与隐私

- MiniMax API Key 当前以**明文**形式存在 `window.localStorage`（key: `wardrobe-minimax-settings`）。这符合"本机优先"原则——数据不离开用户手机——但 Android WebView 的 localStorage 在 `/data/data/<pkg>/app_webview/` 下以明文 SQLite 落盘，root / adb backup 可读。
- 风险等级：普通用户**无风险**；root 设备或物理拿到手机的用户，Key 会以明文裸奔。
- 未来改进方向：迁移到 Android Keystore（通过 Capacitor Secure Storage 插件或自写 Native 插件）。**v0.9.15 暂缓**——优先修其他 critical。
- 用户须知：不要在 root / 共享手机 / 借出手机上使用本 App；MiniMax Key 仍可能被 root 或物理调试读取。

## 远程诊断与隐私边界

本 App 支持用户主动上传诊断数据到云端，用于排查疑难问题。诊断数据包含应用状态、导航路径、网络环境、事件日志和数据量统计，**不包含**用户衣物照片原图、MiniMax Key、密码或备份文件内容。

- **用户主动触发**：诊断上传必须由用户在设置页点击"上传诊断数据"并确认问题描述后才能发起；不允许静默上传、后台自动上报或崩溃强制上传。
- **数据脱敏**：上传前所有字符串字段经过 `sanitizeValue` 处理，自动遮盖 API Key、Bearer Token、JWT、手机号、邮箱、URL 查询参数中的敏感 token，以及文件系统路径中的用户主目录。
- **图片摘要化**：诊断日志中的图片字段只记录 MIME 类型、长度、格式标记和指纹哈希，不传输图片内容。
- **不落本地**：诊断事件只保存在当前进程的有界内存缓冲；用户确认后直接上传，不写入 IndexedDB、localStorage、Cache Storage 或文件系统。App 被关闭后未上传事件允许丢失。
- **过期清理**：云端诊断工单 30 天后自动过期删除，pending 状态超过 24 小时未上传的工单也会被清理。
- **Agent 调试工作流**：开发者/Agent 可通过 CLI 工具下载和分析已上传的诊断数据：
  - `npm run diagnosis:list` — 列出远程诊断工单。
  - `npm run diagnosis:latest` — 查看最新工单摘要。
  - `npm run diagnosis:pull <caseId>` — 下载原始诊断 JSON 到 `.diagnostics/`。
  - `npm run diagnosis:inspect <caseId>` — 检查已下载的诊断数据摘要。
  - 以上命令需要 `DIAGNOSTIC_READER_TOKEN` 环境变量，下载结果保存在 `.diagnostics/`（已加入 `.gitignore`，不进入版本控制）。

## Git 版本管理

本项目从 `v0.9.9` 起使用 Git 管理源码版本。Git 是代码回滚和差异审查工具，`VERSION_HISTORY.md` 仍是人类可读的版本与交付说明，两者都要维护。

- 修改前先查看 Git 状态，理解当前未提交变更；不要覆盖、回滚或删除其他 agent/用户留下的变更。
- 任何 agent 只要实际编辑了项目文件，最终回复前必须完成 Git commit；除非用户明确说“不要提交”或本次只是只读调查、方案讨论、审查报告且没有改文件。
- 每次完成一组小而完整的修改后，先更新 `VERSION_HISTORY.md`，再提交 Git commit；commit 必须包含本次任务的全部必要文件。
- commit 只能包含当前 agent 本次任务的改动。如果工作区已有其他 agent/用户的未提交改动，必须只暂存自己的文件或自己的 hunk；不要把别人的改动混进本次提交。
- 如果同一个文件里混有当前任务改动和他人未提交改动，优先使用分块暂存；如果无法安全拆分，停止并向用户说明，不能为了提交而覆盖或夹带他人改动。
- 提交前必须检查 `git status --short` 和 staged 文件清单；最终回复要给出 commit hash，并说明是否仍有非本次遗留的未提交改动。
- commit 信息要包含版本号或任务名，例如 `v0.9.9 git baseline`、`docs: update agent rules`。
- 不要提交生成产物和本机文件，包括 `node_modules`、`.next`、`out`、`android/app/src/main/assets/public`、Gradle build 目录、`*.apk`、`.env*`、`android/local.properties`、签名 keystore 和签名 properties。
- 固定签名文件仍是本机交付 APK 的必要文件，但它们是敏感凭据，不进入 Git；备份位于 `~/Documents/wardrobe-signing-backup/`。构建 APK 前仍必须检查 `android/signing/wardrobe-fixed.jks` 和 `android/signing/wardrobe-signing.properties` 是否存在。
- 禁止使用 `git reset --hard`、`git checkout -- <file>`、强制清理、强推等会丢失改动的操作，除非用户明确要求。

## 代码约定

- 使用 TypeScript，优先复用现有类型、工具函数和组件。
- 主要业务类型在 `src/lib/types.ts`；线上共享契约在 `packages/cloud-contracts/src/workspace/`；服务端业务接口在 `services/wardrobe-api/src/workspace/`；客户端线上数据层在 `src/lib/online/`；推荐逻辑在 `src/lib/recommendations.ts`；MiniMax 调用和解析在 `src/lib/device-minimax.ts`；主界面在 `src/components/wardrobe-app.tsx`。
- `wardrobe-app.tsx` 体量很大，修改时要控制范围。可以抽小组件或纯函数，但不要无任务理由地大规模重写。
- 数据结构或 PostgreSQL schema 变化必须提供迁移、旧客户端边界、revision 兼容和事务回滚验证。
- 图片在提交前可以是当前页面内存中的 Data URL；只能按用户主动提交动作上传到本项目服务器或用户主动选择的 AI 服务。
- 推荐穿搭时默认发送结构化标签、地点、状态、收藏套装和近期穿着记录，不发送衣物图片。
- AI 试穿或买前评估只发送用户主动选择的图片，并在界面文案中保持清楚。
- UI 图标优先用 `lucide-react`，动效优先用 `src/lib/motion-tokens.ts` 和 `src/components/motion-common.tsx`。
- 新依赖要谨慎。能用现有依赖解决的，不要引入新的包。

## 移动端体验硬规则

- 默认数据要克制：默认只保留一个基础衣橱位置，其他地点让用户自己添加。
- 批量录入和保存套装必须允许逐件确认、选择和取消，数量文案必须跟真实选中数量一致。
- 滑条必须只在按住滑块小圆点时拖动；点击轨道或纵向滚动不能意外改变数值。
- 弹窗、底部面板、图片预览、设置页必须同时检查竖屏和横屏。
- 操作入口要节省空间，例如收藏套装卡片上的更多操作优先用右下角三点菜单，不要无故撑高卡片。
- 动效要克制但有质感；不能闪烁、跳动、遮挡文字，也要遵守 reduced-motion。
- 所有按钮、标签、卡片和弹窗内文字在窄屏上不能溢出或互相覆盖。
- 页面第一屏应直接是可用 App，不要改成营销落地页。

## AI 与提示词约定

- AI 功能先设计判断链，再写 prompt。不要只写”接入大模型”。
- 输出尽量要求结构化 JSON，并保留健壮解析和错误兜底。
- 场景推荐要理解目的地类型、活动、天气、温度、季节、时间和正式程度。
- 不要针对”伊犁””邮轮””餐厅”等具体词写单点补丁；要把它们归入通用场景机制。
- 任何会发送图片或个人信息的能力，都要确保是用户主动触发，并明确发送目的、失败状态和重试入口。

## 版本与 APK 交付

项目根目录的 `VERSION_HISTORY.md` 是统一版本与变更记录文件。所有对项目文件的修改都必须追加写入该文件，包括代码、文档、配置、资源、Android 工程和 APK 交付相关变更。

记录要求：

- 每次修改完成前，都要在 `VERSION_HISTORY.md` 新增一条记录，放在最新记录最上方。
- 记录当前 `package.json` 版本；如果本次修改递增版本，也要写明从哪个版本升到哪个版本。
- 写清楚修改日期、执行 agent、修改目的、改动文件、验证结果、未验证风险。
- 文档治理类改动也必须记录；不要因为“只是改文档”而省略。
- 自动生成目录如 `.next`、`out`、`android/app/src/main/assets/public` 不需要逐文件列出，但如果它们是交付结果的一部分，要说明由什么命令生成。

当任务要求交付 APK 或改动会进入 APK：

- 必须递增 `package.json` 的 `version`。
- Android `versionName` 和 `versionCode` 由 `android/app/build.gradle` 从 `package.json` 推导，不要手工写死不一致版本。
- Android APK 必须使用方正的固定个人签名 `CN=fangzheng`，不允许使用每台机器默认的 debug keystore，也不允许不同 agent 自行生成新 key。固定签名配置为 `android/signing/wardrobe-signing.properties`，固定签名文件为 `android/signing/wardrobe-fixed.jks`，alias 为 `wardrobe-fixed`；`android/app/build.gradle` 的 debug/release 构建都必须使用它。
- 不要删除、替换、重命名、重新生成 `android/signing/wardrobe-fixed.jks`，也不要修改 `android/signing/wardrobe-signing.properties` 的路径、alias 或口令字段，除非用户明确要求重置签名。若固定签名文件缺失，必须停止并询问用户，不得临时改用默认 debug 签名打包。
- 如果手机上已安装的是历史 MiniMax/Codex/Claude 用其他 key 签出来的 APK，Android 会提示签名冲突；这是一次性历史问题，必须先导出备份、卸载旧 App，再安装固定签名版。固定签名版安装后，后续同包名同固定 key 的 APK 才能覆盖升级。
- 应用名保持 `衣橱穿搭助手`，除非用户明确要求改名。
- 构建后把 APK 以 `衣橱穿搭助手-vX.Y.Z.apk` 的格式放在项目根目录，方便用户识别。
- 交付前确认 APK 文件存在、大小合理，并说明版本号。

## 验证要求

根据改动范围选择验证，不能只凭代码阅读判断完成。

- 逻辑、类型、数据结构改动：运行 `npm run typecheck` 和 `npm run test:logic`。
- UI、路由、构建或 Capacitor 同步相关改动：运行 `npm run build`。
- Android 交付：运行 `npm run android:apk`，必要时再复制/重命名 APK 到根目录。
- 动画、触摸、弹窗、横屏、图片预览相关改动：必须做实际视觉或交互检查，至少覆盖手机窄屏和横屏风险点。
- MiniMax 现场调用如果没有用户 Key 或网络条件，必须说明未做 live 验证，并用本地解析、兜底逻辑或单元脚本验证可验证部分。

### Android 测试流程（模拟器 / 真机 + ADB）

当本次任务涉及 Android、移动端交互、APK 验证、图片显示、网络恢复或裁切/同步等高风险链路时，agent **必须**在模拟器或真机上安装真实 APK 并完成验证，**不得只使用浏览器模拟操作**。浏览器 Dev Server 仅用于快速迭代开发阶段；最终验证必须走 Android 环境。

若本机无可用物理设备，必须启动 Android Emulator 完成以下流程。模拟器验证同样有效，结果记入 `VERSION_HISTORY.md`。

**模拟器启动流程**（本机已验证）：

```bash
# 0. 前置条件：ANDROID_HOME 已设置，模拟器和系统镜像已安装
# 本机 AVD：wardrobe-test（Pixel 6 / API 35 / arm64-v8a / Google APIs）
# 确认 AVD 存在
"$ANDROID_HOME/emulator/emulator" -list-avds

# 1. 启动模拟器（headless，适合 agent 自动化）
"$ANDROID_HOME/emulator/emulator" -avd wardrobe-test \
  -no-window -no-audio -no-boot-anim &

# 2. 等待 adb 设备就绪（约 10-15s）
until adb devices 2>/dev/null | grep -q 'device$'; do sleep 2; done

# 3. 等待系统引导完成（冷启动约 20-25s）
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n')" = "1" ]; do sleep 2; done

# 4. 确认设备信息
adb devices -l
adb shell getprop ro.build.version.release   # Android 版本
adb shell getprop ro.build.version.sdk        # SDK 级别
```

- 本机 `ANDROID_HOME` 为 `/Users/fangzheng/Library/Android/sdk`。
- 若无 AVD，可通过 `avdmanager create avd -n wardrobe-test -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_6` 创建。
- 若缺少模拟器或系统镜像：`sdkmanager "emulator" "system-images;android-35;google_apis;arm64-v8a"`。
- 冷启动约 21s（本机 M-series + Lavapipe 软件渲染）；后续启动可用 `-snapshot default_boot` 加速。
- 测试完成后用 `adb -s emulator-5554 emu kill` 关闭模拟器。

1. 连接检查：先运行 `adb devices -l`。只有目标设备状态为 `device` 时才继续；`unauthorized` / `offline` 或同时连接多台设备时，优先选模拟器或明确指定 `-s <serial>`。
2. 本地门禁：先按改动范围完成 typecheck、逻辑测试和 build；需进入 APK 的改动仍须遵守本文的版本号、固定签名和 `npm run android:apk` 规则。
3. 安装 APK：使用 `adb install -r <apk_path>` 安装。如果设备上已有旧版本且签名一致，`-r` 保留数据覆盖安装；如果需要验证"全新安装"流程（如首次启动、数据恢复、云端拉取），必须按步骤 7 先清除数据或卸载。
4. 启动与调试：安装成功后使用 `adb shell monkey -p com.wardrobe.outfit -c android.intent.category.LAUNCHER 1` 启动 App。通过 `adb logcat`、截图（`adb exec-out screencap -p > <file>`）和必要的 ADB 输入操作复现问题。调试时不得主动读取或导出手机中的 MiniMax Key、用户照片、衣橱数据和备份文件。
5. 功能验证：按任务风险至少验证启动、本次改动的主路径、Android 返回键、窄屏和横屏风险点；崩溃或网络问题应保留相关 logcat 摘要。
6. 日志采集：每次测试必须采集 logcat 并筛出崩溃和严重错误：
   - 启动前清空日志缓冲：`adb logcat -c`
   - 操作完成后导出：`adb logcat -d -t 1000 | rg 'FATAL|AndroidRuntime|com.wardrobe.outfit' > <log_file>`
   - 不使用 `rg -v` 大面积排除后再交人工判断；筛出的日志附在验证记录中。
7. 清除数据 / 卸载重装测试（涉及数据恢复、首次启动、线上读取或登录流程时必须执行）：
   - 清除 App 数据（保留安装）：`adb shell pm clear com.wardrobe.outfit`
   - 完全卸载：`adb uninstall com.wardrobe.outfit`
   - 重装：`adb install <apk_path>`
   - 验证：重新登录后确认全部数据和图片直接从服务器恢复，且没有创建本地业务数据库、Outbox 或持久图片缓存。
8. 结果记录：在 `VERSION_HISTORY.md` 写明设备类型（模拟器/真机）、型号/AVD、Android 版本、APK 版本、安装方式、已测路径、日志摘要和未覆盖风险。如果本次任务涉及 Android 但未执行模拟器/真机验证，必须作为"未验证风险"明确标注。
9. 关闭模拟器：测试完成后必须关闭模拟器释放资源。真机不执行此步骤。
   - `adb -s emulator-5554 emu kill`

已验证的具体安装方法：

```bash
# 1. 确认序列号和授权状态
adb devices -l
SERIAL="从上一条命令复制的目标设备序列号"
APK="项目内待安装 APK 的绝对路径"
BUILD_TOOLS="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)"

# 2. 不只信文件名，先核对包名、versionCode、versionName 和固定签名
"$BUILD_TOOLS/aapt" dump badging "$APK" | sed -n '1,3p'
"$BUILD_TOOLS/apksigner" verify --print-certs "$APK"

# 3. 多设备环境始终带 -s；-r 表示覆盖安装并保留 App 数据
adb -s "$SERIAL" install -r "$APK"

# 4. 启动并确认实际安装版本、前台 Activity 和进程
adb -s "$SERIAL" shell monkey -p com.wardrobe.outfit -c android.intent.category.LAUNCHER 1
adb -s "$SERIAL" shell dumpsys package com.wardrobe.outfit | rg 'versionCode=|versionName='
adb -s "$SERIAL" shell dumpsys window | rg 'mCurrentFocus|mFocusedApp'
adb -s "$SERIAL" shell pidof com.wardrobe.outfit

# 5. 只筛启动崩溃，避免在交付记录中复制整份用户日志
adb -s "$SERIAL" logcat -d -t 500 | rg 'FATAL EXCEPTION|Process: com\.wardrobe\.outfit'
```

本机已验证的坑与处理（MEIZU 21 Pro / Android 16）：

- `adb devices -l` 显示 `device` 只代表 USB 调试已授权，不代表“通过 USB 安装应用”已授权。
- 首次安装可能长时间停在 `Performing Streamed Install`，实际是手机锁屏或安装确认弹窗正在等待用户。此时应提醒用户保持解锁并点击“允许/继续安装”，不要反复改 ADB 配置。
- 本次首次安装返回 `INSTALL_FAILED_USER_RESTRICTED`。读取系统设置发现 USB 安装总开关已开，但 `usb_install_item_com.wardrobe.outfit=衣橱穿搭助手:0`，说明是该包的单独授权被拒绝。保持手机解锁、重新运行同一条 `adb install -r` 并在手机上选择允许后即安装成功，该值变为 `:1`。
- 可用 `adb shell settings get secure usb_install_item_com.wardrobe.outfit` 只读核对单包授权；不要用 `settings put` 绕过手机安全确认。
- 相机、通知等 Android 运行时权限与 USB 安装权限是两件事。安装成功后仍应在用户实际打开相应功能时由系统弹窗申请，agent 不得为省步骤批量授权。
- 如果 `dumpsys package com.wardrobe.outfit` 安装前没有版本输出，只表示手机当前未安装该包，不是 ADB 连接故障。

subagent 独立审查只在用户明确通知或要求时触发。默认情况下，agent 不要因为风险等级、改动规模或自身判断自动启动 subagent；如需独立审查，必须先看到用户明确说“启动 subagent 审查”“独立审核”“让审查专家看一下”等同等意思的指令。

风险门禁仍用于决定本地验证强度和历史记录口径，但不再自动触发 subagent。完成修改后，可运行 `node scripts/review-gate.mjs --staged` 检查本次待提交改动，或运行 `node scripts/review-gate.mjs` 检查整个工作区改动。

高风险场景：必须加强本地验证；只有用户明确通知时才启动 subagent 独立审查。

- 数据结构、PostgreSQL schema、事务、revision、临时资产、旧本地数据清理或线上 Repository 变化。
- MiniMax Key、图片上传、AI prompt、网络调用、隐私边界、错误兜底或模型解析变化。
- Android 原生代码、签名、Manifest、Gradle、Capacitor、APK 交付、版本号或构建链路变化。
- 裁切器、图片处理、触摸手势、动画、弹窗、横屏、底部导航、沉浸式详情页等高风险移动端交互变化。
- 单次改动跨 5 个及以上文件，或 Git diff 超过约 250 行，或涉及 `wardrobe-app.tsx` 等核心大文件的大范围改动。
- 当前工作区已有其他 agent/用户的未提交代码改动，并且本次修改需要基于这些改动继续开发。
- 用户反馈来自真机回归、安装失败、数据异常、AI 误用、隐私风险或发布前验收。

中风险场景：建议增加针对性本地验证；只有用户明确通知时才启动 subagent 独立审查。

- 改 2-4 个源码文件，或 Git diff 约 80-250 行。
- UI 文案、布局、状态流或组件抽象有实际用户可见变化，但不涉及上面的高风险项。
- 修复测试失败、lint/typecheck 警告，或改测试覆盖范围。

低风险场景：通常只需只读检查或基础验证；不启动 subagent。

- 纯文档、版本历史、README、AGENTS、任务说明、`.gitignore` 或提示词任务包修改。
- 小范围文案、注释、非行为性格式整理。
- 只读调查、方案设计、代码审查报告，不直接修改业务代码。

每次修改都必须在 `VERSION_HISTORY.md` 写明风险门禁结论：`high / medium / low`，并说明本地验证方式。若用户明确通知启动 subagent，则记录 subagent 审查结果；若用户没有通知，则写明“未触发 subagent：用户未通知”。

推荐审查 subagent 提示词：

```text
你是本项目的独立审查专家。请先读取 AGENTS.md、README.md、package.json 和本次改动涉及的文件。你的任务不是继续开发，而是挑出会影响用户使用、移动端体验、数据安全、Android APK 交付、MiniMax 调用兜底、类型/逻辑正确性和视觉表现的问题。

请重点检查：
1. 是否违反 AGENTS.md 的移动端、隐私、版本、APK 和验证规则。
2. 是否存在数据迁移、Dexie 本地库、导入导出、旧衣橱数据兼容风险。
3. 是否存在窄屏/横屏文字溢出、遮挡、弹窗不可用、触摸误触、动画闪烁或 reduced-motion 问题。
4. 是否存在 MiniMax Key 泄露、图片误上传、prompt 单点硬编码、AI 失败无兜底的问题。
5. 是否遗漏必要验证命令或视觉检查。

输出格式：
- 先列问题，按严重程度排序，包含文件和行号。
- 再列未验证风险。
- 最后给出是否建议交付。
```

最终回复用户时，只说清楚改了什么、产物在哪里、跑了哪些验证、哪些风险没有验证。不要输出大段过程日志。

## 多 agent 协作

- 每次修改都要尽量小而完整，避免把不相关重构混进功能修复。
- 交接给其他 agent 时，必须写清楚目标、已改文件、验证结果、未完成风险和下一步建议。
- Claude Code、MiniMax Code 或其他 agent 的专用说明文件只能作为入口跳转；长期规则必须回写到本文件。
- 不要让多个文档保存互相冲突的长期规则；长期规则只维护在本文件。
- 如果发现本文件规则已经过时，先根据用户当前指令更新本文件，再继续改代码。

## ChatGPT 审查用代码库导出流程

仅在用户明确说"给 ChatGPT 打包代码""导出 ChatGPT 审查包""更新桌面 ChatGPT 导出目录"或同等意思的指令时才执行本流程。**默认不执行，不要因为完成了开发/修复/验证就自动跑这个脚本。** 风险等级 low（仅生成本机桌面文件，不修改源码）。

固定脚本：`scripts/export-chatgpt-codebase.mjs`
固定 npm script：`npm run export:chatgpt`
固定输出目录：`$HOME/Desktop/wardrobe-chatgpt-codebase`（不进入 Git，不打 ZIP）

输出 8 个 Markdown：

```text
00-PROJECT_MAP.md            项目结构总览（分支 / HEAD / 最近 10 commit / 包含与排除清单 / 阅读指引）
01-CODEBASE_MERGED.md        全量代码合并包（35 个核心文件，固定头部 // FILE / BYTES / LINES / SHA256）
02-CODEBASE_MAP.md           01 的索引（序号 / 路径 / 起止行 / 行数 / 字节 / SHA256 / 分类 / 审查重点）
03-GIT_STATE.md              git branch / status / log / diff main...HEAD + 声明性检查
04-VALIDATION_REPORT.md      typecheck / 各 logic 套件 / build 的实际结果（脚本只生成模板，验证流程负责覆盖）
05-CHANGED_FILES_MERGED.md   git diff --name-only main...HEAD 的合并包，已应用排除规则
06-CHANGED_FILES_MAP.md      05 的索引 + 变更类型（A/M/D/R/C）
README_FOR_CHATGPT.md        给 ChatGPT 看的阅读说明
```

执行顺序（每次重跑都重复一遍，不要省略）：

1. 读 `AGENTS.md`、`README.md`、`VERSION_HISTORY.md`、`package.json` 顶部条目，确认当前任务上下文。
2. `git status --short`：导出前先看清工作区是否有未提交改动；导出本身不会动 Git，但 `03-GIT_STATE.md` 会反映此刻状态。
3. `node scripts/export-chatgpt-codebase.mjs`：生成除 `04-VALIDATION_REPORT.md` 实际数据外的全部 7 个文件；如果 `04-VALIDATION_REPORT.md` 已存在，脚本会保留不覆盖（保留上一次验证流程写入的真实结果）。
4. 跑 7 条验证命令并记录每条命令的开始/结束时间、退出码、stdout/stderr 摘要、是否通过、失败原因，写入 `$HOME/Desktop/wardrobe-chatgpt-codebase/04-VALIDATION_REPORT.md`：
   - `npm run typecheck`
   - `npm run test:logic:data-repo`
   - `npm run test:logic:wishlist-management-followup`
   - `npm run test:logic:followup-navigation`
   - `npm run test:logic:app-route`
   - `npm run test:logic:all`
   - `npm run build`
5. 验证 8 个文件均存在：`ls -lh "$HOME/Desktop/wardrobe-chatgpt-codebase"`，并对两个合并包跑 `wc -l` 确认非空。
6. 在 `VERSION_HISTORY.md` 顶部新增条目：当前日期、当前 agent、目的（重跑或更新 ChatGPT 审查导出）、本次改动文件（如果只是重跑导出脚本，没有源码改动，仍要记录）、验证结果、风险门禁 low、未触发 subagent 标注。

提交规则：

- **可提交**：`scripts/export-chatgpt-codebase.mjs`、`package.json`（新增/修改 `export:chatgpt`）、`VERSION_HISTORY.md`。
- **禁止提交**：`$HOME/Desktop/wardrobe-chatgpt-codebase/**`、任何合并包、任何 APK、任何签名文件、任何构建产物。桌面目录不在仓库里，不需要写 `.gitignore`。
- 仅当 `scripts/export-chatgpt-codebase.mjs` 或 `package.json export:chatgpt` 本身有改动时才需要 commit；纯重跑导出（只更新桌面目录）不需要 Git commit，但仍要在 `VERSION_HISTORY.md` 留一条记录说明本次只是刷新导出目录。
- commit message 模板：`v<X.Y.Z> add ChatGPT codebase export`（首次创建脚本）/`v<X.Y.Z> refresh ChatGPT codebase export config`（修改清单或排除规则）。

最终回复必须包含：当前分支、commit hash（或"无新 commit，仅刷新桌面导出"）、导出目录、导出文件清单、typecheck 结果、是否存在未提交改动、是否存在生成产物待提交。

复用到其他子项目时只需调整三处：`scripts/export-chatgpt-codebase.mjs` 中的 `CODEBASE_FILES` 清单、`focusForChangedFile()` 文案匹配、`buildGitState()` 中 `refactor/app-route-4a` 与 `POST_4B_HOTFIX_` 等本项目硬编码字段。

## GitHub 公开仓库上传流程

仅在用户明确说"上传到 GitHub""整理公开仓库""准备公开 GitHub 版本"或同等意思的指令时才执行本流程。默认不执行，不要因为完成开发、打包 APK、导出审查包或创建 commit 就自动上传。

公开上传固定原则：

- 只上传 `main` 的公开版，不上传 `codex/*`、`fix/*`、`refactor/*` 等工作分支。
- 不复用当前仓库 `.git` 历史上传公开仓库。历史中曾出现 APK、`.claude/settings.json`、Codex turn-diff 引用、review artifacts、浏览器 profile、IndexedDB/Local Storage 和备份文件等对象；公开仓库必须重新初始化 Git 历史。
- 公开版目录只包含项目代码和历史文件。默认保留源码、Android 工程源码、资源、`README.md`、`VERSION_HISTORY.md`、`package.json` / lockfile、配置文件和测试脚本；不保留 agent 协作入口或本机工具配置。
- `AGENTS.md`、`CLAUDE.md`、`MINIMAX.md` 不进入公开版目录，除非用户明确要求公开 agent 协作规则。公开上传规则仍以本文件为本地长期规则。
- `VERSION_HISTORY.md` 可以作为历史文件进入公开版；不要把 `VERSION_HISTORY.md.precompact*.bak` 等临时备份带入公开版。

公开版必须排除：

```text
.git/
.claude/
.mavis/
.opencode/
.env
.env.*
android/signing/
android/local.properties
node_modules/
.next/
out/
dist/
coverage/
android/.gradle/
android/app/build/
android/build/
android/app/src/main/assets/public/
apk-archive/
*.apk
*.aab
*.aar
review-artifacts/
FULL_CODE_REVIEW*
deliverable-commit*.md
VERSION_HISTORY.md.precompact*.bak
```

执行顺序（前置准备 / 导出脱敏 / 核验 / 推送 / 主仓库记一笔，五阶段）：

**阶段 1：前置准备（在主仓库做）**

1. 确认主仓库状态干净：
   - `git -C <main-repo> branch --show-current` 必须是 `main`，否则停止（只能从 `main` 导出）。
   - `git -C <main-repo> status --short` 无未提交改动；如有，先按本项目 Git 规则 commit 或 stash。
   - `git -C <main-repo> worktree list` 确认没有额外 worktree 在用。
2. **关键**：在主仓库先跑一遍 `npm run typecheck` 和 `npm run test:logic:all`，确认所有断言和代码现状一致。staging 跑测试时最容易暴露主仓库代码已经改了但测试断言没跟上的 stale 断言（例如 `scripts/test-diagnostic-events.ts` 里 `dbTransactionWrapCount >= 7` 实际只有 5）。在主仓库修完、commit 完，再走下面流程，避免 stage → 发现 → 改主仓 → re-archive 的反复。
3. 决定 staging 目录路径：默认 `$HOME/Documents/wardrobe-github-public-main`，与历史 v1.1.28 push 一致，可复用。
4. 决定推送策略（看远端是空还是非空）：
   - 远端是空的（首次推送）：直接 `git push -u origin main`。
   - 远端有内容、要覆盖：`git push --force-with-lease origin main`。**注意**：fresh staging repo 没有记住远端 ref，第一次 `force-with-lease` 会报 `stale info`，必须先 `git fetch origin`（见阶段 5）。

**阶段 2：导出公开版目录到 staging**

1. 准备 staging 目录（用 `mavis-trash` 不用 `rm -rf`）：
   - 如果 staging 目录已存在（之前 push 留下的）：`mavis-trash <staging>/.git`（只删 `.git`、保留 working tree，省掉一次 archive 导出时间），不要动 working tree。
   - 如果 staging 目录不存在：`mkdir -p <staging>`。
   - 在 staging 目录里：`git init -b main && git remote add origin <user-specified-github-url>`。staging 是独立 git repo，**没有** `main` ref 也**没有** `origin/main` ref。
2. 从主仓库导出 tree（**必须用 `-C` 指定主仓库目录**，staging 是独立 repo 跑 archive 会报 `fatal: not a valid object name: main`）：
   - `git -C <main-repo> archive main | tar -x -C <staging>`
3. 删除 staging 里属于排除清单的本地文件（用 `mavis-trash`，**不要**把 `mavis-trash` 跟 `heredoc` 拼同一行）：
   - `mavis-trash <staging>/.DS_Store <staging>/.eslintrc.json <staging>/AGENTS.md <staging>/CLAUDE.md <staging>/MINIMAX.md <staging>/STRICT_INTAKE_FIELD_CONTRACT_VALIDATION_REPORT.md`
   - `node_modules/` / `.next/` / `out/` / `dist/` / `coverage/` / `apk-archive/` / `*.apk` / `*.aab` / `*.aar` / `review-artifacts/` / `FULL_CODE_REVIEW*` / `deliverable-commit*.md` / `VERSION_HISTORY.md.precompact*.bak` / `.claude/` / `.mavis/` / `.opencode/` / `.env*` / `android/signing/` / `android/local.properties` 这些已经在主仓库 `.gitignore` 里，archive 出来的 tree 本来就没有，**不需要在 staging 手动删**。

**阶段 3：staging 核验**

1. 在 staging 配 local git user（fresh repo 没 user，配 `--local` 不要碰 `--global`）：
   - `git -C <staging> config user.name "<user-name>"`
   - `git -C <staging> config user.email "<user-email>"`
   - 这个 name/email 跟主仓库最后一次 commit 作者一致即可。
2. 列出 staging 根目录 + `ls <staging>/android/`，**手动确认**没有 `.git/`（除 staging 自己的）、APK、签名文件、`.env*`、agent 配置目录、review artifacts。
3. 跑 staging 依赖 + 测试：
   - `cd <staging> && npm install --prefer-offline --no-audit --no-fund`
   - `cd <staging> && npm run typecheck`（必跑）
   - `cd <staging> && npm run test:logic:all`（有时间就跑，能抓出阶段 1 没抓到的 stale 断言）
   - 如失败：**回主仓库修代码、commit、再 re-archive 一次**（从阶段 2 第 2 步开始重做）。

**阶段 4：推送**

1. 提交 staging：
   - `git -C <staging> add -A && git -C <staging> commit -m "v<X.Y.Z>: push to public GitHub"`
2. **远端非空 + 用 force-with-lease 覆盖**（最常见情况）：
   - 先 `git -C <staging> fetch origin` —— **必须**，否则 force-with-lease 报 `! [rejected] ... (stale info)`。
   - 再 `git -C <staging> push --force-with-lease origin main`。
   - 期望输出：`+ <old-tip>...<new-tip> main -> main (forced update)`。
3. **远端空（首次 push）**：`git -C <staging> push -u origin main`。
4. 验证推送结果：
   - `git -C <staging> log -1 --format='%h %s'` 看本地 commit。
   - `git -C <staging> fetch origin && git rev-parse origin/main` 应等于本地 main tip。

**阶段 5：主仓库记一笔**

1. 回到主仓库：`git -C <main-repo> status --short` 确认没有意外未提交改动。
2. 编辑 `VERSION_HISTORY.md`，**在最顶部新增一条**记录本次推送，标题格式 `## YYYY-MM-DD / v<X.Y.Z> / <agent> — push to public GitHub (force-with-lease)` 或 `(...init)`，条目必含：
   - 推送前主仓库 main tip（commit hash + 短描述）
   - 推送前远端 main tip（commit hash + 短描述）
   - 推送后远端 main tip（commit hash）
   - 推送策略（force-with-lease / 首次 `-u`）
   - 阶段 3 期间修过的任何 stale 断言（主仓库 commit hash + 一句话说明）
   - 未验证风险：未在远端 `git clone` 二次校验 / 签名密钥 `android/signing/wardrobe-fixed.jks` 没公开（属预期）
3. 提交到主仓库：
   - `git -C <main-repo> add VERSION_HISTORY.md`
   - `git -C <main-repo> commit -m "v<X.Y.Z>: record public GitHub push"`

提交与记录：

- 阶段 1 第 2 步如果修了 stale 断言并 commit 到主仓库，那是**主仓库的一个真 commit**，按本项目 Git 规则登记到 `VERSION_HISTORY.md`。
- 阶段 5 第 3 步的 `record public GitHub push` commit 是**主仓库元数据 commit**，不入公开仓库（公开仓库推送发生在它之前），但要进 `VERSION_HISTORY.md`。
- 公开仓库初始化 commit 不应包含 APK、签名、构建产物、本机 agent 配置、审查产物或旧 Git 历史。
