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

这是一个手机优先的衣橱识别、穿搭推荐、买前评估和 AI 试穿预览 App。技术栈是 Next.js / React / TypeScript / Tailwind / Capacitor / Dexie，最终要能打成 Android APK，在手机本机运行。浏览器本地数据库和 Android WebView 本地数据库是核心数据存储。

默认原则：

- App 必须手机优先，不接受只适合桌面网页的交互。
- Android 本机运行是正式交付目标，不要做成必须依赖家里电脑、局域网或公网服务的方案。
- 衣橱数据、MiniMax Key、用户参考照片默认只保存在用户本机；不要把密钥写进源码、日志、README、APK 或测试数据。
- MiniMax 相关功能要有本地规则或清晰失败提示作为兜底，不允许让主要流程卡死。
- 不要为单个地点、单次旅行或单个案例硬编码特例；目的地、季节、时间、天气和活动要抽象成可复用场景理解。

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
- 用户须知：不要在 root / 共享手机 / 借出手机上使用本 App；备份文件未加密（`Documents/WardrobeBackups/wardrobe-backup-*.json`），含完整衣橱数据和 tryOnProfile 全身照，请妥善保管。

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
- 主要业务类型在 `src/lib/types.ts`；推荐逻辑在 `src/lib/recommendations.ts`；MiniMax 调用和解析在 `src/lib/device-minimax.ts`；本地数据库在 `src/lib/db.ts`；主界面在 `src/components/wardrobe-app.tsx`。
- `wardrobe-app.tsx` 体量很大，修改时要控制范围。可以抽小组件或纯函数，但不要无任务理由地大规模重写。
- 数据结构或 Dexie schema 变化必须考虑旧数据兼容、导入导出备份和 Android WebView 本地数据迁移。
- 图片通常是本地 data URL 或用户主动上传内容；不要把用户衣物图片上传到非必要服务。
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

- AI 功能先设计判断链，再写 prompt。不要只写“接入大模型”。
- 输出尽量要求结构化 JSON，并保留健壮解析和错误兜底。
- 场景推荐要理解目的地类型、活动、天气、温度、季节、时间和正式程度。
- 不要针对“伊犁”“邮轮”“餐厅”等具体词写单点补丁；要把它们归入通用场景机制。
- 任何会发送图片或个人信息的能力，都要确保是用户主动触发，并保留本地优先原则。

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

subagent 独立审查只在用户明确通知或要求时触发。默认情况下，agent 不要因为风险等级、改动规模或自身判断自动启动 subagent；如需独立审查，必须先看到用户明确说“启动 subagent 审查”“独立审核”“让审查专家看一下”等同等意思的指令。

风险门禁仍用于决定本地验证强度和历史记录口径，但不再自动触发 subagent。完成修改后，可运行 `node scripts/review-gate.mjs --staged` 检查本次待提交改动，或运行 `node scripts/review-gate.mjs` 检查整个工作区改动。

高风险场景：必须加强本地验证；只有用户明确通知时才启动 subagent 独立审查。

- 数据结构、Dexie schema、导入导出、备份恢复、旧数据兼容或本地数据库写入逻辑变化。
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

执行顺序：

1. 先确认当前仓库状态：`git branch --show-current`、`git status --short`、`git worktree list`。如当前不在 `main`，必须从 `main` 导出，不要从工作分支导出。
2. 使用 `git archive main` 或等价的只读导出方式生成公开版目录，例如 `$HOME/Documents/wardrobe-github-public-main`；不要复制 `.git`。
3. 在公开版目录中删除上述排除项，尤其是 `.claude/`、`AGENTS.md`、`CLAUDE.md`、`MINIMAX.md`、`*.apk`、`android/signing/`、`.env*`、`review-artifacts/`。
4. 运行公开目录核验：
   - 确认不存在 `.git` 历史、APK、签名文件、`.env*`、agent 配置、review artifacts、浏览器 profile、IndexedDB/Local Storage、备份文件。
   - 确认 `README.md`、`VERSION_HISTORY.md`、源码和必要配置存在。
   - 在公开目录运行 `npm install` 后，至少执行 `npm run typecheck`；如时间允许再执行 `npm run test:logic:all` 和 `npm run build`。
5. 只有核验通过后，才在公开目录 `git init`、创建新的首个 commit，并按用户指定的 GitHub 仓库地址添加 remote 和 push。

提交与记录：

- 如果只是生成公开版目录，不修改本项目源码或规则，不需要提交当前仓库。
- 如果修改本文件、`.gitignore`、`README.md`、`VERSION_HISTORY.md` 或公开上传脚本，必须按本项目 Git 规则更新 `VERSION_HISTORY.md` 并提交。
- 公开仓库初始化 commit 不应包含 APK、签名、构建产物、本机 agent 配置、审查产物或旧 Git 历史。
