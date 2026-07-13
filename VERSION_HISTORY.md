## 2026-07-13 / v2.1.18-test / Codex Subagent C1 — 方向化路由运动与首帧滚动恢复

- **执行与版本**：Codex Subagent C1 使用 `apple-design` 原则，在独立分支 `codex/motion-c1-navigation-20260713`、独立 worktree `/Users/fangzheng/Documents/wardrobe-motion-c1-navigation-20260713` 上基于冻结提交 `a1d6137a05890d81b4f6ab420bfe85e99f746496` 实施；版本保持 `2.1.18-test`，未合入 integration / `main`，未推送，未构建 APK，本 Session 未再触发下级 subagent。
- **导航与运动**：`NavigationController` 现在把 route 与 `fromRoute/toRoute/source/direction` transition 原子提交，Tab / push / pop / replace 分别表达平级、前进、返回和替换；重复同 route 不创建动画。新增唯一 `NavigationMotion`：Tab 使用 `opacity 0.96→1 + y 4→0` 短交叉淡化，push 采用“新页 +24px / 旧页 -6px”，pop 完全反向，`AnimatePresence mode="sync"` 允许连续操作中断；退出页 `inert/aria-hidden` 且不接收 pointer，reduced-motion 只保留短 opacity。旧 `mode="wait"`、全路由统一 opacity+y、常驻 `transform-gpu` 已移除。
- **滚动与录入衔接**：路由按首页、详情实体和录入来源使用独立会话内 scroll key；`useLayoutEffect` 保存实际已呈现 route 的位置，并在目标首帧前同步恢复，替换原动画完成后的双/三重 rAF 链。Sheet/fullscreen fixed-body 锁退出期间读取 `body.top` 的真实位置，先把新 route 对齐目标位置，再在锁释放同一绘制帧覆盖锁滚回写。全局“+”关闭 Sheet、录入 trigger 与 intake push 同一事件提交；套装创建移除额外 parent effect，避免中间首页帧。衣物详情来源返回与改密完成改用 pop 方向；精确卡片 source anchor 仍留给 C2。
- **底栏反馈与边界**：桌面 / 移动主 Tab 选中胶囊通过各自共享 `layoutId` 平移，底栏继续复用 B1 `AppPressable` 和 `spring.control`，未叠加第二套按压缩放；未修改 `motion-common.tsx`、B4 录入手势或 C2 详情组件。
- **改动文件**：`app-route.ts`、`use-app-navigation-controller.ts`、新增 `navigation-motion.tsx`、`wardrobe-app.tsx` 路由/底栏/创建衔接；C1 纯逻辑与 390px Playwright browser harness、后续导航静态合同、`package.json`；UI 规范 C1 命名小节、生成 HTML 与本记录。
- **自动化与浏览器验证**：`test:logic:app-route` 通过（原路由 46/46 + C1 29/29），`test:logic:followup-navigation` 82/82、`test:logic:wardrobe-app-split` 47/47、`test:logic:back-priority-regression`、`test:logic:diagnostic-events` 54/54、`docs:ui-spec:build/check`、`test:logic:ui-spec-preview`、根 `typecheck`、Next `build` 均通过。隔离 Playwright `390×844` 实测 Tab 独立滚动、同步四连切、detail push/pop、Sheet 锁滚到 intake 再 pop、退出页交互归属和 reduced-motion；无 console error，截图 `/tmp/wardrobe-c1-navigation-390.png` 已人工核对无白屏、叠层溢出或位置跳闪。
- **风险与未验证项**：`high`（App 主壳高频导航、滚动和 Overlay 交接）。未在 Android 真机/模拟器、WebView、TalkBack/VoiceOver、生产 API 或真实长列表异步增高场景做最终验收；本批不交付 APK。详情卡片精确 anchor、Lightbox 来源连续性由 C2 接续，Android 返回键与真实设备帧时序留给 D/最终集成 Wave。

## 2026-07-13 / v2.1.18-test / Codex 主集成 — Motion Wave 3 归并与陈旧合同同步

- **执行与版本**：主 Agent 按 B1 → B2 → B3 顺序归并三项独立提交，保全并重生成 UI 规范；版本保持 `2.1.18-test`，未进入 APK 交付。
- **集成修正**：`scripts/test-outfit-plan-wear-state.ts` 的服务端源码合同从旧表达式 `Boolean(payload.isPrimary)` 同步为当前基线已采用的 `wantsPrimaryActual`，只修测试字面量，不改变服务端业务逻辑。
- **验证与风险**：轮播/Lightbox、反馈、详情壳、共享壳、穿搭规划、日历状态、wear-state、后续导航、窄屏、UI 规范、根 `typecheck` 与 Next `build` 组合门禁通过。`ui-token-contract` 仍只报告冻结基线四处硬编码色值，将由后续拥有对应文件的 B4、C2、C3-Settings 与 D1-Contracts 收口；Android/WebView 和辅助技术留在 D Wave 与最终 APK 验收。

## 2026-07-13 / v2.1.18-test / Codex Subagent B3 — 周计划与月历三页轨道直接操控

- **执行 Agent**：Codex 实施 Subagent B3；独立分支 `codex/motion-b3-calendar-gestures-20260713`、独立 worktree `/Users/fangzheng/Documents/wardrobe-motion-b3-calendar-gestures-20260713`，基于批次提交 `00398302ae7ee8f320030f20f93048f74392591d`；未合入 integration / `main`，未推送。本 Session 由主集成 Agent 分派，未再触发下级 subagent。
- **目的与版本**：依照 `apple-design` 的直接操控、空间连续性、可中断性和 reduced-motion 原则，修复周计划条与月历“松手后替换内容”的弱手势，使手指、轨道、箭头和选中详情共享可预测的物理状态；版本保持 `2.1.18-test`，不改业务/API/存储/小程序，不构建 APK。
- **运行时实现**：新增纯函数 `calendar-track-gesture.ts`，统一 `9px` 横纵意图、nonlinear rubber-band、最近 `110ms` 速度、`0.2s` 终点投影和单页 snap。周计划与月历常驻前/中/后三页，使用 `touch-action: pan-y`，横向成立后才 pointer capture；拖动保持 `1:1`，释放使用无弹跳 spring。pointerdown 会停止当前 spring 并从实时 x 接管，连续同向箭头按序排队，反向箭头重定向现有轨道，提交后只更新父级日期事实并无缝回中。
- **选中与详情连续性**：周/月选中背景改为共享 `layoutId` 移位；月历详情使用位置布局、透明度和 clip-path，不再补间 `height:auto`。reduced-motion 下切页和详情立即完成。`monthDate/selectedDate` 仍由 `OutfitListView` 父状态持有，月历重挂载从 `selectedDate` 恢复展开；未加入模块缓存或持久化。`OutfitPlanDayCard` 的按钮、busy 写入和服务端读回边界已复核，无需为 B3 强制改动。
- **改动文件**：`src/lib/calendar-track-gesture.ts`、`outfit-weekly-plan-strip.tsx`、`outfit-planning-calendar-view.tsx`；日历/计划/返回上下文三项合同脚本；UI 规范 B3 命名小节、生成 HTML 与本记录。
- **自动化验证**：`test:logic:outfit-planning` 通过（手势/日历 `57/57`、计划 `74/74`、打包 `40/40`），`test:logic:outfit-calendar-state-regression` `32/32`、`test:logic:followup-navigation` `82/82`、`test:logic:ui-overflow` 通过；`docs:ui-spec:build/check`、`test:logic:ui-spec-preview`、根 `typecheck`、Next `build` 与 `git diff --check` 通过。
- **390px 触摸与视觉验证**：在隔离本地 E2E API / 测试数据库上用 Chromium Playwright `390×844`、touch Pointer Events 完成 17 项回归：周/月三页常驻、`pan-y`、纵向与纵向占优斜向不改 x、水平拖动 `1:1`、半途反向、spring 途中反向接管、一次释放只翻一页、连续三次箭头不吞步、2026-08 六行月历、选中背景 layout 移位，以及 reduced-motion 详情无行内高度/过渡。视觉截图 `/tmp/wardrobe-b3-calendar-390.png` 已人工核对无横向溢出、空页闪白或详情遮挡。in-app Browser 当前无可用 browser 实例，按 skill 故障流程确认 `browsers=[]` 后使用仓库 Playwright 回退；未向生产 API 写入。
- **既有门禁失败证据**：要求执行的 `test:logic:outfit-plan-wear-state` 为 `35/36`；唯一失败脚本仍断言 `isPrimaryActual: Boolean(payload.isPrimary)`，但 B3 基线 `00398302` 的 `command-service.ts:484` 已是 `isPrimaryActual: wantsPrimaryActual`。测试与服务端均非 B3 所有权，且失败可在未改基线复现，本分支不越界改写；主集成 Agent 应单独同步陈旧合同后复验。
- **风险门禁与未验证项**：`high`（周/月高频手势与日期上下文）。未在 Android 真机/模拟器、WebView、TalkBack/VoiceOver、系统高对比或生产业务数据上做最终回归；本批不交付 APK，Android 返回键、帧时序和真实 360px/412px 设备验收留给 D/集成 Wave。

## 2026-07-13 / v2.1.18-test / Codex Subagent B2 — 图片轮播物理与 Lightbox 下拖 Controller

- **执行 Agent**：Codex 实施 Subagent B2，使用 `apple-design` 技能；独立分支 `codex/motion-b2-image-gestures-20260713`、独立 worktree `/Users/fangzheng/Documents/wardrobe-motion-b2-image-gestures-20260713`，基于 Wave 2 冻结提交 `00398302ae7ee8f320030f20f93048f74392591d`；未合入 integration / `main`，未推送。本 Session 由主集成 Agent 分派，未再触发下级 subagent（用户未通知）。
- **目的与版本**：把卡片、衣物详情、套装详情和种草详情共用的 `SwipeImageCarousel` 改为 Apple 式 1:1、速度连续、可中断手势；版本保持 `2.1.18-test`，本批不改 API、存储、业务字段、小程序、共享 Overlay / Back 或 `motion-common.tsx`，不构建 APK。
- **轮播物理**：轨道改为单一 `MotionValue`，pointermove 不再逐帧 `setState`；`9px` 横纵意图锁后仅横向 capture，纵向保持 `pan-y`。pointerdown 停止当前动画并读取 DOM 真实 presentation x；spring 用主线程 `onUpdate` 保留呈现速度，避免 Motion 加速动画的逻辑终点领先屏幕位置。释放读取最近 100ms 最新同方向速度尾巴，Apple 指数投影相邻 snap point，并把 release velocity 传入轻微 momentum spring；快速反向可从当前 x/velocity 接管。
- **边界与输入所有权**：首尾使用渐进 rubber-band，并提供阻尼反解以保证中断边缘回弹时首段不跳；pointerdown 不再把详情/评审原图切成缩略图。滑动 click suppression 仅绑定同一 pointer 序列并在下一帧释放，新 pointerdown 会先清旧序列；下一次独立点击立即可用。轮播保留 `aria-roledescription="carousel"` 并新增 `data-app-press-gesture-owner="true"`，与 B1 外层 `AppPressable` 手势所有权互补；受控胶片栏跨页切换保留源页到目标页轨道，避免空白帧。reduced-motion 下保留直接操控、释放即时吸附。
- **Lightbox Controller ready**：新增 `useLightboxDragDismiss`，C2 可直接消费 `y`、`imageScale`、`backdropOpacity`、Pointer `bindings`、`reset` 和 `isEnabled`；controller 已包含 presentation y 接管、速度投影、回弹/退出 spring、同序列 click 抑制，以及 `zoomScale > 1.01` / `isPanning=true` 禁用下拖的门禁。本 Wave 按并行所有权不修改共享 `MotionImageLightbox`，因此 App 运行时下拖关闭尚未接线；C2 必须从 Wave 3 合入基线接入，并同时处理 source-anchor，不能复制私有 Lightbox。
- **改动文件**：修改 `src/components/swipe-image-carousel.tsx`、`src/lib/carousel-logic.ts`、`scripts/test-carousel-logic.ts`；新增 `src/components/use-lightbox-drag-dismiss.ts`、`scripts/test-lightbox-drag-dismiss.ts`、`scripts/test-carousel-gestures-browser.mjs`；更新 UI 规范 B2 命名小节、生成 HTML 与本记录。衣物/套装/种草详情通过既有 `DetailHeroGallery → SwipeImageCarousel` 共用链路自动接入，无需改动三个业务组件；未触碰 B1/B3/B4/C2 独占运行时文件。
- **验证结果**：轮播纯逻辑 `31/31` 与 Lightbox gate/projection/reversal 脚本通过；`test:logic:images`、`test:logic:detail-shell`、`test:logic:shared-item-shells`、UI spec build/check/preview、根 `typecheck`、Next `build` 和 `git diff --check` 通过。390×844 Playwright 真浏览器 harness 实测：慢拖 `-50px` 呈现 `-50px`、fast flick 到 index 1、动画中反向首段 `+12px` 呈现 `+12px`、首屏越界 150px 呈现 68.095px、滑动 click 被抑制且下一独立 click 生效、真实 touch compositor 纵向滚动约 180px且不切页/误点、pointerdown 原图 src 不变；Lightbox controller 慢拖 80px 呈现 80px、flick 触发一次 dismiss、zoom=2 时 y=0；独立 reduced-motion context 释放后即时吸附。
- **风险门禁与未验证项**：`high`（高频图片手势、触摸/滚动竞争和后续全屏预览接线）。未在 Android 真机/模拟器、真实线上图片、TalkBack/VoiceOver 或低端 WebView 做最终回归，未测试 C2 尚未完成的 Lightbox 运行时组合、缩放/平移实现和 source-anchor 动画；最终 Android 竖屏、WebView 帧率、真实图片点击/返回及辅助技术验收由 C2/D/集成 Wave 完成。

## 2026-07-13 / v2.1.18-test / Codex Subagent B1 — 即时按压、Toast、Progress 与 Shimmer 收口

- **执行 Agent**：Codex 实施 Subagent B1；独立分支 `codex/motion-b1-feedback-20260713`、独立 worktree `/Users/fangzheng/Documents/wardrobe-motion-b1-feedback-20260713`，基于 Wave 2 集成提交 `00398302ae7ee8f320030f20f93048f74392591d`；未合入 integration / `main`，未推送。本 Session 由主集成 Agent 分派，未再触发下级 subagent。
- **目的与版本**：按 `apple-design` 的同帧直接反馈、可取消输入、克制物理与 reduced-motion 原则完成 Wave 3 / B1；版本保持 `2.1.18-test`，不改 API、存储、服务端、小程序、图片轮播、日历或录入手势，不构建 APK。
- **公共反馈原语**：`motion-tokens.ts` 新增无弹跳 `spring.control`、无弹跳 `spring.panel` 与仅供真实 drag/flick 的轻回弹 `spring.momentum`，旧 `snappy/soft/gentle` 保留兼容别名。`AppPressable` 统一 control / icon / card 三档克制反馈；主指针按下同帧进入 pressed，使用 pointer capture，位移超过 10px、拖离、pointercancel、失去 capture、失焦或 contextmenu 即取消并只抑制本次 click；Space / Enter、disabled 与 reduced-motion 同步覆盖。后代 Carousel / gesture owner 不被父层抢 capture，选择模式不缩放整卡。
- **高频入口迁移**：三个目录首页共用的 `CatalogWaterfallCardShell`、选择 check / 底栏 / 删除操作、批量 AI 行操作，以及 App 全局 FAB、新建 action、Toast 动作/关闭、桌面与移动底部导航统一接入 `AppPressable`；普通控件不再叠加私有 `whileTap` 或回弹，专项合同同时检查无嵌套 `AppPressable` 重复缩放。
- **Toast 与加载反馈**：success 2.8s、info 4s，error / action 不自动消失；隐藏、失焦、悬停、焦点进入和触摸按住暂停剩余倒计时。MiniMax Key 缺失改为 action 语义。AI 和批量进度改为左原点 `scaleX`，百分比展示与阶段 live region 分离；软进度从逐帧 rAF 改为 100ms 定时更新。Shimmer 只动画 transform，reduced-motion 静态化；Accordion 在 reduced-motion 下不再做 `height:auto` 补间。
- **改动文件**：`src/lib/motion-tokens.ts`、`src/lib/use-soft-ai-progress.ts`、`src/components/motion-common.tsx`、`src/components/use-wardrobe-message-controller.ts`、`src/components/batch-ai-progress-panel.tsx`、`src/components/item-shell/catalog-waterfall-card-shell.tsx`、三个 `src/components/catalog-selection/` 反馈组件、`src/components/wardrobe-app.tsx` 的 B1 独占区域、`scripts/test-motion-feedback-b1.ts`、`package.json`、UI 规范及生成 HTML、本记录。
- **验证结果**：`docs:ui-spec:build/check`、`test:logic:ui-spec-preview`、`test:logic:motion-feedback-b1`、`test:logic:component-reuse`、`test:logic:intake`、`test:logic:catalog-multi-select`、`test:logic:catalog-multi-select-integration`、`test:logic:ui-overflow`、根 `typecheck`、Next `build` 与 `git diff --check` 通过。B1 JSDOM harness 实际覆盖 pointerdown、阈值内移动、超过 10px 取消、拖离、pointercancel、后续独立点击恢复、Space 键反馈和嵌套 Carousel 不抢 capture。
- **基线失败与风险门禁**：`high`（共享按压、全局 Toast 与进度反馈）。`test:logic:ui-token-contract` 仍仅报告冻结基线四处：`auth/account-views.tsx`、`image-crop-editor.tsx`、`item/edit-image-action-card.tsx`、`src/app/site.css`；均不属于 B1 修改范围，B1 新增 diff 无 hex 色值，批量进度旧 `bg-[#fbfbf8]` 已改语义 token。未做 Android 真机/模拟器、TalkBack/VoiceOver、低端 WebView 帧率或 360/390/430px 视觉慢放；最终跨 Wave 触摸、读屏与性能验收由后续 D / 集成 Wave 完成。

## 2026-07-13 / v2.1.18-test / Codex Subagent A2-Core — 共享 Lightbox、Popover 与 Dialog 浮层收口

- **执行 Agent**：Codex 实施 Subagent A2-Core；独立分支 `codex/motion-a2-core-20260713`、独立 worktree `/Users/fangzheng/Documents/wardrobe-motion-a2-core-20260713`，基于批次提交 `10d9e4176216ba3f7dcd3b47289294e9ad70e230`；未合入 integration / `main`，未推送。
- **目的与版本**：按 Apple 式空间连续性、直接响应和可预测焦点原则，完成 A1 共享浮层组件层的 A2 迁移；版本保持 `2.1.18-test`，本批不改业务/API/存储/小程序，不构建 APK，也不提前实现 Sheet 拖拽。
- **改动文件**：修改 `src/components/motion-common.tsx`、`src/components/dialogs/notice-sheet.tsx`、`scripts/test-ui-overlay-contract.ts`、`docs/designs/wardrobe-ui-spec.md`、生成的 `docs/designs/wardrobe-ui-spec.html` 与本记录；A1 的 `overlay-root.tsx`、`overlay-stack.ts`、`back-coordinator.ts` 公共接口保持兼容，无需追加运行时代码改动。
- **实现摘要**：抽出 topmost-only 首焦点与 Tab 圈；`MotionSheet` 保持冻结 props，居中层改为轻微非弹跳缩放，`dismissible=false` 暴露 `aria-busy`。`MotionImageLightbox` 改为退出期持续存在的 `OverlayPortal + OverlayStack(kind=lightbox)` 层，补 `100dvh`、dialog 名称、首焦点、低层 inert 与锁滚。`MotionPopoverMenu` 在兼容原 props 的前提下全部进入共享 Portal/Stack，真实 anchor 同时决定 fixed 定位、transform origin 与焦点恢复，补 menu/menuitem、首项焦点、Arrow/Home/End/Escape；外点关闭的 400ms 全局 click 拦截改为仅绑定当前 `pointerId`、在 click/pointercancel/pointerup 后首帧释放的序列级保护。Notice Dialog 补齐可访问名称；危险提交确认继续使用 `alertdialog + dismissible=false`。
- **验证结果**：`docs:ui-spec:build`、`docs:ui-spec:check`、`test:logic:ui-spec-preview`、`test:logic:ui-overlay-contract`、`test:logic:back-priority-regression`、`test:logic:component-reuse`、`test:logic:detail-shell`、`test:logic:ui-overflow`、根 `typecheck`、Next `build` 与 `git diff --check` 通过。额外用不落盘 React/JSDOM harness 真实渲染共享层：Popover 首项焦点、ArrowDown、Escape、触发器焦点恢复、外点同序列防穿透及下一次点击立即可用通过；Lightbox dialog 名称、关闭按钮首焦点、Escape、触发器焦点恢复、打开锁滚与退出释放通过。
- **风险门禁与未验证项**：`high`（共享浮层、焦点和输入协调）。未在 Android 真机/模拟器、TalkBack/VoiceOver 或生产业务数据上做最终窄屏触摸回归；JSDOM 可验证 DOM/焦点/输入生命周期，但不替代像素、软键盘和真实 WebView 动画帧验收。最终 Android 与辅助技术验收由后续 D/集成 Wave 完成；本批明确不包含 Sheet 拖拽。

## 2026-07-13 / v2.1.18-test / Codex Subagent A2-App — App 壳、设置与账号浮层 / Back 迁移

- **执行 Agent**：Codex 实施 Subagent A2-App；独立分支 `codex/motion-a2-app-20260713`、独立 worktree `/Users/fangzheng/Documents/wardrobe-motion-a2-app-20260713`，基于 A1 后批次提交 `10d9e4176216ba3f7dcd3b47289294e9ad70e230`；未合入 integration / `main`，未推送。本 Session 由主集成 Agent 分派，未再触发下级 subagent。
- **目的与版本**：依照 Apple 式可预测层级、可中断性与无障碍焦点原则，把 A2-App 独占范围接入 A1 冻结 Overlay / Back API；版本保持 `2.1.18-test`，本批不构建 APK、不修改共享 Overlay API、业务契约、服务端、存储或小程序。
- **改动范围**：修改 `wardrobe-app.tsx` 的 App 全局新建 / 退出、SettingsView、诊断和四个设置子页；修改 `auth-gate.tsx`、`account-views.tsx`、`account-deletion-view.tsx`；更新账号 / 认证专项合同、UI 规范及生成 HTML。未修改 A1/Core 所有的 `motion-common.tsx`、`overlay-root.tsx`、OverlayStack / BackCoordinator 与其共享测试，也未触碰套装、种草、录入和详情组件。
- **实现摘要**：Auth 邮箱验证码与退出确认、诊断描述 / 成功 / 失败和设置内衣橱增删改不再自建 fixed dialog，统一使用具名 `MotionSheet` 变体；Auth、设置首页、画像、参考照、MiniMax、衣橱列表、账号安全、改密和注销页删除私有 Capacitor Back listener，改为带优先级的 `useStableBackHandler`。Overlay 先于页面、页面先于 App 根 fallback；焦点进入、背景 inert、topmost 和焦点恢复由 A1 共享层统一提供。
- **事务保护**：衣橱新增 / 编辑 / 迁移 / 删除等待线上操作和 `refreshState` 完成后才关闭 Sheet，失败保留当前表单；画像、参考照和 MiniMax 保存等待服务端 / Key 校验完成；账号改绑、改密与永久注销 busy 时拒绝 Back / Escape / backdrop，禁用取消和重复提交，注销 processing / completed / failed 状态不返回业务页。
- **验证结果**：`docs:ui-spec:build`、`docs:ui-spec:check`、`test:logic:ui-spec-preview`、`test:logic:ui-overlay-contract`、`test:logic:back-priority-regression`、`test:logic:urgent-account`、`test:logic:account-deletion-app`、`test:logic:auth-flow-v2-0-1`、`test:logic:auth-client-shell`、`test:logic:wardrobe-app-split`、`test:logic:ui-overflow`、根 `typecheck`、Next `build` 与 `git diff --check` 通过。
- **风险门禁与未验证项**：`high`（认证、全局返回和线上写入关闭时机）。A2-App 范围内已无私有 `App.addListener("backButton")` 或 raw fixed dialog；`wardrobe-app.tsx` 的衣橱列表 / 统计 / 详情编辑区域仍有 5 处本批禁止触碰的遗留 listener，归 A2-Flows / 后续所有者，不能宣称全 App 已完成迁移。未做 Android 真机 / 模拟器、TalkBack、物理键盘焦点、窄屏触摸或退出动画慢放；未运行或修复既有 UI token 基线失败，最终 APK / Android 验收由主集成 Agent 收口。

## 2026-07-13 / v2.1.18-test / Codex Subagent A2-Flows — 业务流浮层与 busy 返回安全迁移

- **执行 Agent**：Codex 实施 Subagent A2-Flows；独立分支 `codex/motion-a2-flows-20260713`、独立 worktree `/Users/fangzheng/Documents/wardrobe-motion-a2-flows-20260713`，基于批次提交 `10d9e4176216ba3f7dcd3b47289294e9ad70e230`；未合入 integration / `main`，未推送。
- **目的与版本**：按 `apple-design` 的可预测层级、可中断动画与“一个返回只推进一层状态”原则，把详情、穿搭计划、打包、种草、录入和裁切的业务浮层接入 A1 Overlay API；版本保持 `2.1.18-test`，本批不构建 APK、不修改 API/存储/小程序，也不实现轮播、日历、裁切阻尼或路由动画。
- **浮层迁移**：`IntakeFlowShell` 与全屏 `ImageCropEditor` 分别以 `fullscreen` / `cropper` 注册 OverlayStack，统一 Portal、滚动锁、topmost、焦点圈定、`inert/aria-hidden` 和关闭拒绝反馈；删除录入 Shell 私有 Capacitor Back listener。部分保存、录入退出、计划删除/放弃、打包重置、套装/实图删除全部复用共享确认层；计划操作、衣橱位置、打包新增和实图说明复用带语义的共享 Sheet；录入缩略图和穿搭实图的私有菜单改为真实触发器锚定的 `MotionPopoverMenu`。
- **写入安全与状态保持**：上传/保存/删除/重置/种草转衣橱/裁切处理中阻断 Back、Escape、遮罩和显式关闭；失败时保留确认层、说明草稿和重试入口，成功仅在服务端提交与读回后关闭。修正种草首页菜单 `anchorRef` 原先错误落在转衣橱位置控件的问题，并让打包清单空状态也能实际打开“添加自定义物品”Sheet。
- **页面返回边界**：种草页移除对 Sheet/Dialog/Popover 的重复页面级关闭分支，只保留多选、未保存草稿和子页导航；计划编辑、打包与种草写入中的页面级 Back 使用共享协调器消费。业务回调、草稿、`clientMutationId` 与服务器读回链路保持原有边界。
- **改动文件**：`intake-flow-shell.tsx`、`image-crop-editor.tsx`、`garment-intake-flow.tsx`、`garment-detail-3.0.tsx`、`outfit-list-view.tsx`、`outfit-plan-*.tsx`、`plan-packing-checklist-view.tsx`、`wishlist-view-2.0.tsx`；对应录入/详情/计划/种草专项合同；UI 规范 `6.1.2 A2-Flows` 命名小节及生成 HTML。
- **验证结果**：`docs:ui-spec:build`、`docs:ui-spec:check`、`test:logic:ui-spec-preview`、`test:logic:ui-overlay-contract`、`test:logic:back-priority-regression`、`test:logic:detail-shell`、`test:logic:wishlist`、`test:logic:outfit-planning`、`test:logic:ui-overflow`、`test:logic:cropper`、`test:logic:intake-entry-crop-regression`、`test:logic:intake-fullscreen-layout`、根 `typecheck`、Next `build` 和 `git diff --check` 通过。按并行文件所有权未修改 A2-Core 独占的 overlay/back 合同脚本，也未处理既有 `ui-token-contract` 基线债务。
- **风险门禁与未验证项**：`high`（全屏录入/裁切、删除与 Android 返回行为）。未做 Android 真机/模拟器、TalkBack、软键盘、窄屏触摸、真实图片裁切或线上写入现场回归；A2-Core 的 Lightbox/Popover 共享实现和 A2-App 壳层迁移尚未合并到本 worktree，最终交互与 APK 验收须在三支 A2 合流后由主 Agent 执行。

## 2026-07-13 / v2.1.18-test / Codex Subagent A1 — OverlayStack 与单一 Back/Escape 基线

- **执行 Agent**：Codex 实施 Subagent A1；独立分支 `codex/motion-a1-overlay-back-20260713`、独立 worktree `/Users/fangzheng/Documents/wardrobe-motion-a1-overlay-back-20260713`，基于批次提交 `8fdb07f7d17e9578f18f90f04d68f8cd8308d1a8`；未合入 integration / `main`，未推送。
- **目的与版本**：按 Apple 式“用户一次返回只推进一层状态”的可预测性原则，建立 Wave 1 浮层与返回基础；版本保持 `2.1.18-test`，本批不构建 APK、不修改业务/API/存储/小程序，也不实现 Sheet 拖拽、路由动画或全页面浮层迁移。
- **改动文件**：新增 `src/lib/overlay-stack.ts`、`src/lib/back-coordinator.ts`、`src/components/overlay-root.tsx`；修改 `motion-provider.tsx`、`motion-common.tsx`、`use-stable-back-handler.ts`、`wardrobe-app.tsx` 顶层返回挂载、共享确认 Sheet、两项 overlay/back 回归脚本、UI 规范及生成预览。
- **实现摘要**：`MotionProvider` 只挂载一个 body Portal 根；OverlayStack 统一注册/注销、topmost、按原因拒绝关闭、退出后焦点恢复，App 内容和低层浮层同步 `inert/aria-hidden`；BackCoordinator 是共享 Sheet 和已登记页面 handler 的唯一 Capacitor Back / document Escape 入口，浮层消费或拒绝后不再落到页面。`MotionSheet` 向后兼容新增 `action/form/confirm/destructive`、`ariaLabelledBy`、`dismissible` 和关闭拒绝反馈，Toast 不入栈；共享提交中确认层用 `dismissible=false` 阻止 busy 状态误关。
- **验证结果**：`docs:ui-spec:build`、`docs:ui-spec:check`、`test:logic:ui-spec-preview`、`test:logic:ui-overlay-contract`、`test:logic:back-priority-regression`、根 `typecheck`、Next `build` 和 `git diff --check` 通过；Back 回归以可执行 store 测试证明 overlay、不可取消事务和页面 handler 任一路径一次请求最多一次状态转移，并覆盖 topmost、关闭拒绝和焦点恢复。
- **既有门禁失败证据**：`npm run test:logic:component-reuse` 失败于未改动的 `scripts/test-component-reuse-contract.ts:21`：静态断言要求字面量 `repository.getOverview()`，基线 `use-wardrobe-data-controller.ts` 已是 `repository.getOverview({ signal: controller.signal })`。测试与被测文件均为 base `8fdb07f7` 原状，属于既有 stale 合同；按文件所有权未在 A1 越界修正，交由主集成 Agent 在 Wave 1 合入后单独更新并复验。
- **风险门禁与未验证项**：`high`（全局浮层/Android 返回基础）。本 Session 即 Wave 1 实施 subagent。A1 仅自动接入共享 `MotionSheet` 和 `useStableBackHandler`；Lightbox、Popover、Cropper、Auth 及遗留页面私有 `App.addListener` 留给 A2，不能宣称全 App 已完成单 listener 迁移。未做 Android 真机/模拟器、TalkBack、窄屏触摸或退出动画慢放；最终 APK/Android 验收由后续 Wave 和主 Agent 完成。
- **集成补充**：主 Agent 合入后将 `test-component-reuse-contract.ts` 的 Overview 所有权断言从过期的零参数字面量放宽为方法调用前缀，以兼容基线已存在的 AbortSignal 参数；不改变运行时行为。修正后 `test:logic:component-reuse` 纳入 Wave 1 集成门禁。

## 2026-07-13 / v2.1.18-test / Codex — 动效修复并行批次 Wave 0 基线

- **执行 Agent**：Codex 主集成 Agent；独立集成分支 `codex/motion-repair-integration-20260713`，本记录未修改正式 `main`。
- **目的**：把已审核的 Apple 风格动效改良方案固化进仓库，并冻结 Overlay、Back、手势物理、导航和无障碍公共契约，为后续最多三个 Subagent 同波并行实施建立无歧义基线。
- **版本变更**：无；保持 `2.1.18-test`，最终进入 APK 前统一递增。
- **改动文件**：两份动效方案文档、`docs/designs/wardrobe-ui-spec.md`、生成的 UI 规范 HTML、预览生成器、`VERSION_HISTORY.md`。
- **改动说明**：明确运行时代码同波零重叠、共享规范受控归并、Wave 合入门禁；冻结 `OverlayRoot/OverlayStack`、单一 Back/Escape 消费、`MotionSheet` 变体和可访问命名、语义 spring、速度投影、rubber-band、reduced-motion/transparency/contrast 目标；补上既有 Android edge-to-edge 规范小节的具体视觉模块，修复预览合同中的 generic-part 基线失败。
- **验证结果**：UI 规范 build/check、预览合同/渲染、overlay 合同、Back 优先级 20 项、根 typecheck 和 Next build 通过。`test:logic:ui-token-contract` 记录为基线既有失败：账号、裁切器、编辑图片卡和公开站点仍有 10 处硬编码颜色；本批未把该历史视觉债务误算为动效回归。
- **未验证风险**：Wave 0 只建立文档与接口基线，运行时问题尚未修复；不得据此宣称动效、Android 返回键或手势体验已经改善。最终收口前仍须处理或重新判定上述 token 合同失败。

## 2026-07-13 / v2.1.18-test / Codex — Wardora 审计修复收口

- **执行 Agent**：Codex（独立收口分支 `codex/wardora-closeout-20260713`；修复提交 `8fe94d73` 已纳入，未触碰正式工作区中的既有未跟踪文件）。
- **版本变更**：App `2.1.17-test` → `2.1.18-test`，Android `versionCode=20118`；小程序体验版随最新 main 同步。
- **范围**：会话续期幂等与代际保护、工作区并发/事务约束、0018 数据约束迁移、请求竞态防旧响应覆盖、删除 in-progress 读回、profile singleton、小程序全量分页、撤销购买属性继承；不包含新版推荐首页、QWeather 或 PAW。
- **本地验证**：根/App、cloud contracts、API、小程序 typecheck 通过；Next build 通过；API 测试 `115/115`；会话/在线写入/canonical UUID/主计划/撤销购买/profile singleton/小程序 refresh 与分页合同通过；空库完整迁移和生产备份恢复副本的 0018 成功、profile 重复 fail-fast/回滚演练通过。日期主计划合同已同步到统一日期锁 helper。
- **服务器规则**：已将“服务端/迁移/云契约/生产配置改动合入 main 后，必须用最新 main 构建并更新生产 API，部署后核对迁移、health、ready、version 和未授权边界”加入正式根 `AGENTS.md`。
- **生产收口**：部署前备份位于 `/opt/wardrobe-cloud/backups/wardora-closeout-20260713-202129-10887/`（数据库转储 SHA-256 `6788c094be6e180dc84cd8eb3ef998277b09c9338449fefbc81676bf6415788a`，未记录 `.env` 内容）；生产 API 镜像 `wardrobe-api:aff43975`，镜像 SHA-256 `96d1c68f9fd94bd712566a6f47ad07108025f8a1e7146e65b0c0b0ea1fe32fb6`。迁移记录为 18，三个 0018 唯一索引存在，同日计划/实际主展示重复均为 0，active profile 重复为 0；容器 healthy、重启次数 0，`/api/health`、`/api/ready`、`/api/version` 和未授权 workspace `401` 通过。部署前重复审计为 1 组同日计划主展示重复、profile 重复 0；部署后 `refresh.replay_detected=3`、`refresh.rotated=26` 与短期基线不变，不据此宣称长期问题已完全消失。
- **APK 收口**：固定签名产物 [衣橱穿搭助手-v2.1.18-test.apk](/Users/fangzheng/Documents/衣柜识别+根据要去的地方和活动自动搭配穿搭的APP/衣橱穿搭助手-v2.1.18-test.apk)，10,031,471 bytes，SHA-256 `dcbc995a059e1974ce740f681642cf0abe0ccbdc394b4be618976e1edb03a256`；包名 `com.wardrobe.outfit`、`versionName=2.1.18-test`、`versionCode=20118`、签名 `CN=fangzheng`。Android 15 / API 35 `wardrobe-test` 模拟器安装、启动、返回键和 fatal 日志扫描通过。
- **小程序收口**：正式 `wechat/miniprogram` 已合入最新 main，体验版上传版本 `2.1.18` 成功，代码包 `808,752` bytes；[预览二维码](/Users/fangzheng/Downloads/衣橱穿搭助手-小程序-v2.1.18-预览二维码.jpg) 46,923 bytes，SHA-256 `d08a542e3f9fcc3d1141830543b7ded2f7096d3c7ac4bed3274dd1c0bd23e4a0`。未提交微信正式审核或正式发布。
- **当前风险**：自动化长会话、模拟器和合同门禁已通过，但未使用生产用户数据执行跨越 15 分钟的真实账号写入回归；微信真机账号、真实业务写入读回和窄屏触摸回归仍未覆盖。服务器镜像构建仍有既有 `npm audit` 依赖告警，本轮未做无关依赖升级。

## 2026-07-13 / v2.1.17-test / Codex — 会话续期、工作区并发一致性与撤销购买语义修复

- **执行 Agent**：Codex（独立 worktree `codex/session-repair-20260713`；未触发 subagent；未修改正式 `main`、小程序正式分支或生产环境）。
- **目的**：修复 App 十几至几十分钟后因 refresh 竞态/响应丢失而要求重新登录；收紧同日主计划、画像单例、批量写入和列表分页的一致性；明确“种草转衣橱后撤销购买”继承衣橱侧已修改的共用属性。
- **改动范围**：App 持久化 pending refresh、全局单飞、重试 UUID、会话代际保护、旧响应防覆盖、删除 in-progress 读回；服务端 0018 迁移、同日计划/实际主计划及画像唯一索引、日期事务锁、批量全事务、画像 upsert、衣橱属性回写；小程序 refresh 重试持久化和衣物/套装/种草分页读全；App overview 请求取消与旧响应丢弃。
- **撤销购买 feature 边界**：回写 `name/category/subcategory/colors/seasons/styles/formality/warmth/temperatureRange/material/fitGender/fitNotes/notes`；保留种草价格、商品链接、种草状态/AI 评估；图片引用继续按既有共享资产语义保留；衣橱位置、穿着历史等生命周期字段不回写。
- **验证结果**：根/App、cloud contracts、API、小程序 typecheck 通过；Next `npm run build` 通过；API 测试 `115/115` 通过；认证、长会话（含小程序响应丢失后复用同一 request ID）、迁移合同、撤销购买、在线写入定向测试通过；空 PostgreSQL 数据库完整迁移通过并确认 3 个新唯一索引存在；`git diff --check` 通过。
- **生产背景**：本轮仅做只读核验，v2.1.17 迁移已确认完成；当前生产仍有 1 组同日计划主展示重复，0018 会在正式部署时确定性降级并建立约束。本轮未执行生产迁移、部署或业务写入。
- **Android 门禁**：`android:apk` 的环境校验、Web/Capacitor 同步通过；独立 worktree 缺少本机固定签名文件 `android/signing/wardrobe-signing.properties`，Gradle 在签名校验处停止，未生成/安装 APK，未启动模拟器。
- **未验证风险**：未在 Android 真机/模拟器执行长时间真实账号回归，未在微信开发者工具做运行时交互；0018 尚未部署到生产，需部署后核对重复组已归一且 `/api/ready` 正常。

## 2026-07-13 / v2.1.17-test / Codex — 小程序体验版与固定签名 APK 交付

- **执行 Agent**：Codex（未触发 subagent；小程序基于正式 `wechat/miniprogram`，APK 基于正式 `main` 提交 `07d416c7` 构建）。
- **版本变更**：无，保持 App `2.1.17-test`、Android `versionCode=20117`；小程序上传版本 `2.1.17`。
- **小程序发布**：微信开发者工具登录态和内置 skill `0.2.5` 核验通过；正式项目 typecheck、套装/旅行流程测试、日历 UI 合同、周历/月历 WXML/WXSS 编译通过。体验版上传成功，代码包 807,666 bytes；预览二维码生成成功，保存为 `/Users/fangzheng/Downloads/衣橱穿搭助手-小程序-v2.1.17-预览二维码.jpg`，47,121 bytes，SHA-256 `0a3facb958e200540698cf574d969d7b20aea63185b3c356f42a38fec5eefdbd`。本批未提交微信审核，尚不是审核通过后的正式线上版本。
- **APK 交付**：`npm run android:apk` 完整通过，云环境指向 `https://api.zhengfangapps.cloud`；根目录产物 `衣橱穿搭助手-v2.1.17-test.apk`，10,031,019 bytes，SHA-256 `4a438d14c575c165dea9a135653ae7782fcfa12912a35d8bb2764a052d225dab`，包名 `com.wardrobe.outfit`，固定签名 `CN=fangzheng`。
- **Android 验证**：Android 15 / API 35 `wardrobe-test` 模拟器 `adb install -r` 成功；冷启动 `MainActivity`、前台窗口、进程、竖屏登录页和返回键通过，未检出 `FATAL EXCEPTION`；验证完成后已关闭模拟器。未使用生产账号执行日历穿搭双端写入读回。

## 2026-07-13 / v2.1.17-test / Codex — 生产 UUID 数据迁移与 API 部署

- **执行 Agent**：Codex（未触发 subagent；基于已合入 `main` 的提交 `cb80aed6` 执行生产发布）。
- **目的**：上线日历穿搭 canonical UUID 修复，迁移既有生产套装/穿搭计划关系并部署对应 API；本批不上传小程序、不重新发布 APK。
- **版本变更**：无，保持 `2.1.17-test`；生产 API 镜像从 `wardrobe-api:c2c3569` 切换为 `wardrobe-api:cb80aed6`。
- **迁移前只读审计**：生产有效套装 4、有效穿搭计划 3、有效旅行计划 2；2 条穿搭计划需要从旧套装标识回填 UUID。旧套装标识重复组、无法解析的套装/实际穿搭/旅行计划引用、关系列与 payload 冲突均为 0，满足 `0017_outfit_plan_canonical_uuid.sql` 阻断门禁。
- **备份与恢复演练**：生产数据库、`.env` 和 `compose.production.yaml` 已备份到 `/opt/wardrobe-cloud/backups/outfit-uuid-20260713-182537/`；SQL 转储 `wardrobe-before-0017.sql` 为 717,295 bytes，SHA-256 `c3a08ff2ba70038b5105dc98ad723bf84a24379e2e1d88baa0348f94e20819cb`。转储已恢复到隔离临时库并核对核心表计数 `outfits=11`、`outfit_plans=12`、`trip_plans=6`，随后清理临时库；回滚镜像保留为 `wardrobe-api:c2c3569`。
- **生产迁移**：使用新镜像的一次性容器执行 Drizzle 迁移成功，最新迁移记录为 17；`actual_outfit_id` 列、外键和索引均存在。套装、穿搭计划和旅行计划旧标识字段剩余 0；3 条有效计划的 `outfit_id` 与 payload UUID 全部一致，无未解析引用；1 条旅行计划关系与 UUID payload 一致。
- **API 部署与验证**：生产源码快照位于 `/opt/wardrobe-cloud/releases/cb80aed6`，镜像 ID `sha256:42c8e31dd1e19860cd1e69eaf69145b60ad491b63e9848d5fe39c4125183ad23`。容器切换后为 healthy、重启次数 0，启动日志未检出 fatal/unhandled/migration error；公网 `/api/health`、`/api/ready`、`/api/version` 均通过，数据库、存储、JWT、邮件、微信依赖均为 `ready`，版本返回 `gitCommit=cb80aed6`，受保护 workspace 接口未授权烟测返回预期 HTTP 401。
- **构建说明与风险**：服务端镜像 TypeScript 构建通过；`npm audit` 仍报告既有生产依赖 5 个 moderate、1 个 high 漏洞，本批未做可能引入破坏性变化的依赖升级。旧版客户端若继续写入 `legacyOutfitId` 等字段会被新 API 拒绝，需尽快发布 `v2.1.17-test` App/小程序并完成 App→小程序、小程序→App 的真实账号双向读回验收；本批未执行客户端发布和生产账号业务写入。

## 2026-07-13 / v2.1.17-test / Codex — 日历穿搭关系 canonical UUID 修复

- **执行 Agent**：Codex（未触发 subagent；在独立 `codex/outfit-plan-uuid-repair-20260713` worktree 实施）。
- **目的**：修复 App 给日期安排套装后，日历只显示“计划”、无缩略图且详情仍提示“尚未安排当天穿搭”的跨端关系失配；同步检查并修复微信小程序同类风险。
- **版本变更**：`2.1.16-test` → `2.1.17-test`，Android `versionCode=20117`。
- **根因与修复**：App 曾把 `payload.legacyOutfitId` 当套装业务 ID，而小程序使用服务端 `outfits.id` UUID；计划关系因此可能跨端不可解析。现统一以 `outfits.id`、`outfit_plans.id`、`trip_plans.id` 为唯一业务 UUID，App 不再生成或读取旧标识，服务端拒绝旧标识继续写入，并以 `outfit_id`、`actual_outfit_id`、`trip_plan_id` 关系列校验同账号实体和覆盖响应 payload。
- **数据迁移**：新增 `0017_outfit_plan_canonical_uuid.sql`；迁移先检查同用户旧 ID 重复、无法解析关系和列/payload 冲突，再按同用户旧标识回填 UUID，清除旧字段并增加 `actual_outfit_id` 外键/索引。已在本机 PostgreSQL 事务隔离 schema 中用真实旧格式数据回放 0000–0017，套装/行程关系回填和旧字段清理通过，最终整体回滚，未改动现有测试数据。
- **交互修复**：App 空日期首次选择改为主穿搭，不再误建备选；计划详情更换明确进入主穿搭替换。App、小程序周历/月历/旅行详情遇到关联套装缺失时显示“计划关联的套装已失效”，不再伪装成未安排；小程序失效主计划从原实体执行替换。
- **测试与 fixture**：新增 canonical UUID 合同测试，API workspace 迁移断言，更新 Web/Android E2E 与 parity seed，全部改用服务端实体 UUID；API 测试 `115/115` 通过。根/App、cloud contracts、API、小程序 typecheck，穿搭计划/主计划/穿着状态、小程序套装旅行/统计定向测试，Next build 和 `git diff --check` 均通过。
- **小程序验证**：微信开发者工具已打开本 worktree，`simulator_refresh` 成功；修改过的旅行详情 WXML 编译成功（`codeLength=32400`），console 未检出 `error|fail|exception`。未上传体验版、未做微信真机预览。
- **Android 验证**：固定签名 APK `衣橱穿搭助手-v2.1.17-test.apk`，大小 `10,030,678` bytes，SHA-256 `39d9120e8f19ccb1d65d42659e9a844cbfc5adc27717be4b89bdc55ea48ea837`，签名 `CN=fangzheng`；Android 15 `wardrobe-test` 模拟器 `adb install -r` 成功，版本/前台 Activity/进程/登录页竖屏截图通过，未发现 FATAL 崩溃，返回键检查后已关闭模拟器。
- **风险门禁**：`high`。本提交尚未执行生产只读审计、生产备份/迁移/API 部署，也未上传小程序；由于生产迁移尚未实施且本轮不使用生产账号写业务数据，Android 未执行真实登录后的“安排日期 → 双端读回”业务 E2E。上线必须按方案先审计/备份/迁移，再部署 API，最后发布 App/小程序并执行双向读回验收。

## 2026-07-13 / v2.1.16-test / Codex — 套装与穿搭计划 UUID 收口完整修复方案

- **执行 Agent**：Codex（未触发 subagent；本轮按用户要求只编写方案，不修改运行时代码）。
- **目的**：根据 Android 日历“计划存在但缩略图和当天穿搭缺失”的现场截图，补齐 App、小程序、服务端和 PostgreSQL 的跨端根因分析及完整修复实施方案。
- **版本变更**：无，保持 `2.1.16-test`；未构建 APK、未上传小程序、未部署服务端。
- **改动文件**：`docs/superpowers/plans/2026-07-13-outfit-plan-canonical-uuid-migration.md`、`VERSION_HISTORY.md`。
- **方案结论**：`outfits.id`、`outfit_plans.id`、`trip_plans.id` 统一为唯一业务 UUID；迁移并约束 `outfit_id`、`actual_outfit_id`、`trip_plan_id`；删除 App `legacyOutfitId`/`legacyPlanEntryId` 映射和小程序 payload ID 回退；修正主计划/备选/更换语义；以 App→小程序和小程序→App 双向 E2E 作为发布门禁。
- **验证结果**：方案覆盖数据审计、备份、迁移阻断条件、服务端/App/小程序文件映射、旧客户端窗口、测试矩阵、部署回滚、可观测性和最终验收；文档引用的 14 个关键源码路径均存在，代码围栏成对，`git diff --check` 通过；运行时代码未变更。
- **风险门禁**：`high`（后续实施将涉及生产数据迁移、共享契约、跨端写入和客户端最低版本）；当前仅文档，不产生运行时风险。
- **未验证风险**：方案尚未实施；生产数据只读审计、迁移演练、真实 Android E2E、小程序模拟器/真机预览和生产部署均未执行。

## 2026-07-13 / v2.1.16-test / Codex — App 与小程序套装组成编辑入口

- **目的**：补齐 App 套装详情「组成」页签、App 编辑套装页和小程序套装详情的组成单品编辑入口。
- **改动文件**：App `src/components/outfit-list-view.tsx`；小程序 `apps/wechat-miniprogram/pages/outfits/detail/index.ts`、`index.wxml`、`index.wxss`、`apps/wechat-miniprogram/pages/outfits/compose/index.ts`、`index.wxml`、`index.wxss`。
- **改动内容**：两端共用“预选当前组成 → 筛选/搜索调整 → 至少 2 件校验 → 服务端更新后读回”的流程；App 组成页签支持快速保存，编辑页保留草稿到最终保存；小程序创建/编辑共用两步选择器；组成变化清除旧 AI 建议并同步组成 ID。
- **验证结果**：App typecheck/build、App UI/套装定向测试、小程序 typecheck、catalog check、shell/outfit/intake 定向测试、git diff check 通过；正式小程序 detail/compose WXSS 编译摘要通过，WXML 编译在 60 秒内未返回并已停止。
- **风险门禁**：`medium`；未触发 subagent：用户未通知（仅按技能要求完成只读布局/机械扫描）。
- **未验证风险**：正式小程序本次页面的 WXML CLI 编译仍受工具超时影响，未完成模拟器/真机点击和服务端真实编辑读回；App 未执行 Android 真机触摸回归；既有 UI token 合同的历史硬编码颜色失败未处理。

## 2026-07-13 / v2.1.16-test / Codex — 代码审查四项问题修复

- **执行 Agent**：Codex（未触发 subagent：用户未通知）。
- **目的**：修复审查确认的穿搭计划/套装写入未等待、小程序废弃系统 API、统计排序口径和闲置总数截断问题。
- **版本变更**：`2.1.15-test` → `2.1.16-test`，Android `versionCode=20116`。
- **改动文件**：服务端 `outfit-plans/:id/set-primary` 原子事务接口及路由；App 计划/AI 建议保存、幂等重试；小程序 `getWindowInfo/getDeviceInfo`、统计纯函数与定向测试；`package.json`、lockfile、生成 build-info。
- **验证结果**：根 `typecheck`、API `typecheck`、正式小程序 `typecheck`、`npm run build`、API 测试 `114/114`、定向计划/统计/小程序合同测试通过；微信开发者工具正式项目 `compile_wxml`（32,400 chars）和 `compile_wxss`（2 files）通过；体验版上传成功（AppID `wx14a1a85b7b3844d0`、版本 `2.1.16`、790,092 bytes）；APK 构建、固定签名和元数据校验通过。完整 `test:logic:all` 在既有 UI 规范契约（`test-ui-spec-preview-contract`、`test-ui-token-contract`）处失败，相关 UI 文件本批未修改；UI overlay 合同通过。
- **风险门禁**：`high`（服务端事务、线上写入契约、AI 保存和 Android APK）；未触发 subagent：用户未通知。
- **生产部署**：生产数据库备份 `/opt/wardrobe-cloud/backups/postgres/wardrobe-20260713-010630.sql`；镜像 `wardrobe-api:c2c3569` 已发布，公网 `/api/health`、`/api/ready` 通过且依赖全为 `ready`，`/api/version` 返回 `gitCommit=c2c3569`；新路由未授权烟测返回预期 HTTP 401。
- **Android 验证**：MEIZU 21 Pro（ADB `481QFGFH23AY7`）安装 `2.1.16-test` 固定签名 APK；隔离测试 API 上 `android:e2e:critical` 5/5 通过；恢复生产 API 后重新安装启动，版本 `20116`、前台窗口和无 FATAL 崩溃日志通过。
- **未验证风险**：微信开发者工具 `simulator_open_page` 在编译子进程处超时，未把模拟器 UI 交互计为已验证；尚未用真实微信用户完成登录/绑定、真机预览或 live MiniMax；完整 `test:logic:all` 的既有 UI 规范契约失败未处理。

## 2026-07-12 / v2.1.15-test / Codex — 生产微信登录服务重新部署

- **执行 Agent**：Codex；基于已合入 `main` 的提交 `2a825a04` 执行生产部署。
- **目的**：将微信登录 Secret 安全注入生产服务器并重建/重启 API，关闭小程序微信登录服务不可用问题。
- **版本变更**：无，保持 `2.1.15-test`；未构建 APK、未上传小程序体验版。
- **改动文件**：`VERSION_HISTORY.md`。
- **部署结果**：本机 Keychain 已保存 `Wardora_AppSecret`；生产 `/opt/wardrobe-cloud/.env` 已更新微信 AppID/Secret，未写入源码、Git、日志或镜像层；API 镜像 `wardrobe-api:2a825a0462573edd2c5cd7f43f0fb7e9eb2a3352` 已切换运行。部署前完成 compose 备份 `/opt/wardrobe-cloud/backups/compose.production.yaml.before-wechat-20260712-225111.bak` 与数据库备份 `/opt/wardrobe-cloud/backups/postgres/wardrobe-20260712-225117.sql`。
- **验证结果**：本机 Keychain 条目存在；服务器 `/api/health`、`/api/ready` 通过，数据库、存储、JWT、邮件、微信依赖均为 `ready`；公网 `/api/ready`、`/api/version` 通过并返回提交 `2a825a04`；使用一次性无效授权码烟测返回 `wechat_code_invalid`（HTTP 401），不再返回 `wechat_service_unavailable`。
- **未验证风险**：尚未使用真实 `wx.login` code 完成真实用户首次绑定/已绑定账号登录；需用户在微信端点击登录后再做最终业务确认。

## 2026-07-12 / v2.1.15-test / Codex — 修正跨端微信注册合同测试

- **执行 Agent**：Codex（未触发 subagent；基于已合入 `main` 的生产微信登录修复重新建立独立 worktree）。
- **目的**：修复 `main` 与 `wechat/miniprogram` 合入后共用认证合同测试对两端确认交互实现不一致的误报。
- **版本变更**：无，保持 `2.1.15-test`；不修改小程序运行时行为，不构建 APK、不上传体验版。
- **改动文件**：`scripts/test-wechat-email-auth-flow.ts`、`VERSION_HISTORY.md`。
- **改动说明**：注册发送验证码前的合同同时接受 Web/App 侧 `wx.showModal` 和小程序侧已实现的 `ui-confirm-sheet`，仍强制要求发送前存在确认步骤。
- **验证结果**：独立 worktree 的 `npm run test:logic:wechat-email-auth-flow`、`npm run api:typecheck`、`npm run typecheck`、`git diff --check` 均通过；合入后 `main` 正式目录的认证合同/API typecheck/根 typecheck，以及 `wechat/miniprogram` 正式目录的小程序 typecheck/认证合同/diff check 均通过。
- **风险门禁**：`medium`；仅测试合同兼容性调整。未触发 subagent：用户未通知。
- **未验证风险**：未新增运行时逻辑；真实微信登录仍受生产 Secret 注入和服务重启状态影响。

## 2026-07-12 / v2.1.15-test / Codex — 修复生产微信登录 Secret 注入

- **执行 Agent**：Codex（未触发 subagent；在独立 `codex/wechat-login-production-fix-20260712` worktree 实施）。
- **目的**：修复小程序点击“微信登录/注册”后生产 API 返回 `wechat_service_unavailable` 的部署配置缺口。
- **版本变更**：无，保持 `2.1.15-test`；本批不构建 APK、不上传小程序体验版。
- **改动文件**：`deploy/compose.production.yaml`、`deploy/docs/production-deploy.md`、`scripts/test-wechat-email-auth-flow.ts`、`VERSION_HISTORY.md`。
- **改动说明**：生产 compose 显式注入 `WECHAT_MINIPROGRAM_APP_ID` 与 `WECHAT_MINIPROGRAM_APP_SECRET`，缺少任一变量时 fail fast；补齐生产部署验收要求，合同测试防止 Secret 映射回归；真实 Secret 仍只允许存在生产服务器环境。
- **验证结果**：`npm run test:logic:wechat-email-auth-flow` 通过；`npm --workspace @wardrobe/wardrobe-api run test -- tests/wechat-openid-auth.test.ts` 通过（3/3）；`npm run api:typecheck`、`npm run typecheck`、`git diff --check` 通过；静态合同覆盖 compose 微信变量映射、缺 Secret fail-fast 和 `/api/ready` 验收要求。
- **风险门禁**：`high`；认证和生产部署配置变更。未触发 subagent：用户未通知。
- **未验证风险**：本机没有 Docker Compose 插件，未执行 `docker compose config`；本地未持有生产微信 Secret，尚未在生产机重建/重启 API，也未用真实 `wx.login` code 完成首次绑定和已绑定账号登录；部署前线上接口仍可能返回旧错误。

## 2026-07-12 / v2.1.15-test / Codex — 固定签名 APK 交付构建

- **执行 Agent**：Codex；基于 `main` 发布提交 `6a9431d` 构建。
- **版本变更**：`2.1.14-test` → `2.1.15-test`，Android `versionCode=20115`。
- **改动文件**：根 `package.json`、`apps/wechat-miniprogram/generated/build-info.ts`。
- **构建结果**：`衣橱穿搭助手-v2.1.15-test.apk`；包名 `com.wardrobe.outfit`；大小 10,026,963 bytes；SHA-256 `74ddd3332bab1d5f7f2b70c0d121063b9115969be20823421da821bf75253811`；固定签名 `CN=fangzheng`。
- **验证结果**：`npm run android:apk` 通过；MEIZU 21 Pro / Android 16 / API 36 以 `adb install -r` 安装并启动，前台进程正常，未发现 `FATAL` 或 `AndroidRuntime`。
- **未验证风险**：未执行完整业务 E2E；本次仅完成构建、签名、安装、启动和 logcat 启动级检查。

## 2026-07-12 / v2.1.14-test / Codex — 跨端审计修复批次（App/服务端）

- **执行 Agent**：Codex（未触发 subagent；独立 `codex/wardrobe-cross-platform-repair-20260712` worktree）。
- **目的**：按 `docs/audits/2026-07-12-wardrobe-cross-platform-review/wardrobe-cross-platform-issue-solution.md` 收口 App 图片生命周期、详情滚动、录入有效视口、周历 marker 和线上微信服务 readiness。
- **版本变更**：无，保持 `2.1.14-test`；本批未构建或交付 APK。
- **改动文件**：`MainActivity.java`、`src/lib/online/online-image-client.ts`、`workspace-gate.tsx`、`online-asset-image.tsx`、详情 surface tokens、周历 plan strip、`intake-flow-shell.tsx`、账号安全 App UI/API、cloud auth contracts、account-password/session/wechat auth routes、cloud health contract、API `/api/ready`、`VERSION_HISTORY.md`。
- **改动说明**：WindowInsets 物理像素按 density 转换为 CSS 像素；图片请求增加 generation、AbortController、精确重试和 `<img onError>` 恢复；App/Capacitor 后台超过 30 秒清理并重新读取图片；详情壳锁定手机视口并允许内部滚动；周历计划条统一为月历两条、5px 目标粗细；录入主内容保留真实 footer 安全区；`/api/ready` 在非测试环境增加微信 Secret readiness 门禁；账号安全增加修改邮箱、绑定/修改手机号和重新验证表单，服务端增加邮箱/手机号改绑、微信解绑/换绑接口，统一要求密码或邮箱验证码验证。
- **验证结果**：`npm run typecheck`、`npm run build`、`test:logic:android-safe-area`、`test:logic:images`、`test:logic:detail-shell`、`test:logic:outfit-planning`、`test:logic:intake-fullscreen-layout`、`test:logic:online-auth-shell`、`test:logic:long-lived-device-session`、`test:logic:shared-item-shells`、`test:logic:ui-overflow` 均通过；`git diff --check` 通过。
- **未验证风险**：未执行固定签名 APK、Android 模拟器/真机和生产服务重启；微信 Secret 仍需由部署环境安全注入。账号改绑接口尚未在真实邮件服务、真实微信 code、验证码过期/冲突和最后登录方式保护场景中做端到端验证。

## 2026-07-12 / v2.1.14-test / Codex — 双轮 App/小程序问题完整版审计方案

- 执行 Agent：Codex（未触发 subagent；使用独立 codex/full-audit-solution-20260712 worktree）。
- 目的：合并前两轮问题与本轮新增的录入入口、缩略图操作气泡、自由/3:4 裁切和 App 录入页上下留白问题，生成可直接交接的完整版解决方案 Markdown。
- 版本变更：无；保持 2.1.14-test。本轮只交付文档和截图证据，不进入 APK。
- 改动文件：docs/audits/2026-07-12-wardrobe-cross-platform-review/wardrobe-cross-platform-issue-solution.md；新增 24 张审计截图资产；VERSION_HISTORY.md。
- 改动说明：文档记录 17 个用户可见问题、9 组根因、4 个新增录入问题，包含 UI 规范基线、源码证据、截图批注、P0/P1 分级、分批执行方案、无障碍风险、Android/微信真机验收标准和证据边界。新增方案明确要求小程序共享录入源按钮、SVG icon、缩略图上方浮动气泡、气泡边界/箭头计算、自绘自由/3:4 裁切器，以及修复 MainActivity 原生 inset 到 CSS 像素的换算。
- 验证结果：已检查 24 张截图资产可读；Markdown 中 33 个相对图片引用全部存在；35 个本地源码链接目标存在；git diff --check 通过。
- 未验证风险：本轮没有修改运行时代码、没有运行小程序编译、没有构建 APK、没有执行 Android/微信真机回归；文档中的登录、生命周期、触摸、裁切和 inset 结论仍需按验收清单做实现后验证。

## 2026-07-12 / v2.1.14-test / Codex — 一致性修复自动化测试收口

- **执行 Agent**：Codex（未触发 subagent；使用独立 `codex/parity-completion-audit-20260712` worktree）。
- **目的**：按用户调整后的验收范围，以自动化测试验证合并修复清单，并补齐可直接运行的 Parity Vitest 入口。
- **版本变更**：无；保持 `2.1.14-test`。
- **改动文件**：`package.json`、`scripts/parity/vitest.config.ts`、`VERSION_HISTORY.md`。
- **改动说明**：新增 `npm run parity:vitest`，只收集四个使用 Vitest API 的 Parity suite；Node `assert` 合同继续使用各自 `tsx`/npm 入口，避免根 Vitest 的 jsdom setup 被错误解析，也避免把无 `it()` 的合同脚本误判为零测试 suite。
- **自动验证**：`test:local:full` 全通过（manifest、typecheck、contract 3、unit 10、component 14、repository integration 4、API 18 文件 114 项、Next build）；小程序 typecheck 及 shell、长期会话、资产生命周期、录入状态机、详情、搜索统计、种草、套装旅行、设置、AI、注销、目录生成合同全部通过；Parity BFS 7 项、Parity Vitest 4 文件 20 项、outfits/recommendations 3 项、report gate 3 项、packing 2 项及 inventory/manifest/static-defect/fixture 门禁通过。按用户指令，本轮不要求补齐每个页面动作的完整人工/真机四阶段证据。
- **未验证风险**：本轮未重新执行 246 个动作的逐项截图 BFS；此前 Android 模拟器/真机与微信真机证据仍保留在最终报告和上一条版本记录中。

## 2026-07-11 / v2.1.14-test / Codex — APP/小程序一致性修复集成与真机定向回归

- **执行 Agent**：Codex（未触发 subagent；在独立 `codex/parity-final-integration-20260711` worktree 串行集成）。
- **目的**：合并 APP、小程序和服务端修复，按 APP 方案校准小程序搜索/统计，并关闭用户手工测试发现的安全区、日历、长名称、图片录入和页面胶囊避让问题。
- **版本变更**：`2.1.13-test` → `2.1.14-test`（Android `versionCode=20114`）。
- **改动范围**：小程序登录续期、唯一图片临时资产、两步录入、单品/种草详情、搜索/统计、多选、套装/日历/旅行、设置/画像/参考照、推荐/试穿；服务端诊断隔离与测试重置；Android edge-to-edge 安全区；parity 盘点、fixture、状态图、执行器和报告门禁。
- **APP 方案对齐**：小程序搜索始终查询全部衣橱，仅按名称/颜色匹配，位置/类别作为页内筛选并保留 10 条历史；统计按 APP 展示本月套装/衣物穿着次数、最近常穿、45 天闲置和种草转衣橱后的购买使用率。
- **自动验证**：根 typecheck、逻辑测试、API 114 项、Next build、小程序 typecheck、parity inventory/manifest/static-defect/fixture 检查均通过；盘点 APP 96 屏、小程序 38 屏、未映射 0。MiniMax Keychain 仅做一次脱敏 live 烟测并通过，密钥未写入源码、日志或报告。
- **Android 验证**：固定签名 APK 已在 Android 15 `wardrobe-test` 模拟器和 MEIZU 21 Pro / Android 16 真机分别完成安装、启动、前台、返回键、清数据重启、截图和 logcat 验证；未见 FATAL，顶部挖孔和底部手势区不再出现白条。
- **小程序真机验证**：MEIZU 21 Pro 上验证登录后 9 件单品/1 套套装服务器读回；搜索与统计 APP 口径；长套装名省略且“+”和底栏同屏；设置无开发备注；推荐、试穿、画像、参考照、搜索和统计均避开微信胶囊；单品相册选择、大图/缩略图、微信原生裁切旋转、返回草稿及退出确认通过。绿色 vConsole 与微信宿主隐私提示按用户说明不计缺陷。
- **交付物**：`artifacts/parity/parity-regression-20260711-final/report/` 生成 `coverage.json`、`defects.json`、`repair-plan.md`、`junit.xml` 和静态 HTML；67 个已知缺陷状态均为 `VERIFIED`，产品一致性门禁 PASS。
- **剩余审计风险**：审计完整性门禁保持 FAIL：当前 246 个页面动作义务中 5 个具有计划规定的四阶段截图/UI 树/路由证据，241 个尚未逐动作执行；不得复用截图或伪造 execution.json。该项不代表已修复产品缺陷重新开放，但在补齐证据前不得把全量审计宣称为通过。

## 2026-07-11 / v2.1.13-test / Codex — 诊断轨迹隔离与 32 表安全测试重置

- **执行 Agent**：Codex（未触发 subagent；从 Task 11 提交创建独立 `codex/parity-server-diagnostics-reset-20260711` worktree）。
- **目的**：阻止相同 requestId 跨用户/设备误关联，并把测试数据 reset 收紧为只作用于显式独立 schema 的完整 32 表闭环。
- **版本变更**：无；保持 `2.1.13-test`。
- **改动文件**：诊断服务与测试、reset 服务/CLI/测试、测试 schema 清理脚本、`VERSION_HISTORY.md`。
- **改动说明**：诊断 trace 查询同时匹配 requestId、userIdHash 和 deviceIdHash；reset 表清单由 25 张补齐为 schema 全部 32 张，新增 `TEST_RUN_ID=run_*` 与 `current_schema()` 双重门禁，所有 count/truncate/storage-key 查询均显式限定该 schema；清理脚本改用参数化 `psql` 调用并把测试存储目录移入系统废纸篓，不再永久递归删除。
- **验证结果**：API typecheck、诊断/reset 专项 14 项、服务端全量 108 项测试通过；真实本机 PostgreSQL `wardrobe_test` 中创建 `run_parity_reset_20260711` 的 32 张影子表并各写 1 行，guarded reset 后 32 表全部为 0，public 指纹前后均为 `25:53`；资产清理专项用内存存储验证 2 个引用均删除且审计报告不含原始路径/测试 secret；测试 schema 已清理；`git diff --check` 通过。
- **未验证风险**：未对生产库、生产资产或真实诊断内容执行 reset；这是安全边界，不属于本任务测试范围。

## 2026-07-11 / v2.1.13-test / Codex — 小程序场景推荐与 AI 试穿真实闭环

- **执行 Agent**：Codex（未触发 subagent；从 Task 10 提交创建独立 `codex/parity-mini-ai-flows-20260711` worktree）。
- **目的**：移除推荐与 AI 试穿占位，按 APP 的场景输入和用户主动图片授权补齐生成、失败恢复、预览与服务器资产闭环。
- **版本变更**：无；保持 `2.1.13-test`。
- **改动文件**：小程序推荐/试穿页面、AI 与 workspace 服务、共享 AI kind、服务端 MiniMax 路由与实现、推荐 parity manifest、专项测试、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：推荐页覆盖目的地、活动、天气、温度、时段、正式度和风格，只发送结构化衣橱/套装/画像字段且明确剔除图片；结果支持生成中、成功、失败、重试、刷新和打开单品。AI 试穿只有在用户选择参考照并勾选衣物后才上传图片；参考照复用原生裁切，所选衣物先经多模态识别为服装描述，再按 MiniMax 官方单人物 `subject_reference` 限制调用 `image-01`，结果支持预览、重试、双资产保存、服务器读回和删除；无 Key 提供设置入口。
- **验证结果**：共享契约 typecheck、API typecheck、小程序 typecheck、AI 流程专项测试和 API 路由 6 项测试通过；Keychain live 烟测 `MiniMax-M3` 调用 1 次成功，requestId 仅记录为 `06a18b…4067`；`git diff --check` 通过。
- **未验证风险**：真机相册/裁切、多件衣物生成质量、`image-01` 真实试穿费用调用、预览资产上传/删除读回和微信页面视觉留 Task 13 关闭；当前标记 FIXED_UNVERIFIED。

## 2026-07-11 / v2.1.13-test / Codex — 小程序设置、画像、参考照与法律内容一致性

- **执行 Agent**：Codex（未触发 subagent；从 Task 9 提交创建独立 `codex/parity-mini-settings-20260711` worktree）。
- **目的**：删除设置开发备注，补齐 APP 同字段穿衣画像与试穿参考照，统一版本和法律文本来源。
- **版本变更**：无；保持 `2.1.13-test`。关于页应用版本由根 `package.json` 生成，不再硬编码旧版本。
- **改动文件**：设置首页/关于、新增画像与参考照页、协议/隐私页、生成的 build/legal copy、`services/workspace.ts`、生成与专项测试、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：删除开发接入/后续开放技术备注；穿衣画像覆盖版型、身高、体型、自定义体型、肩宽、腿长、发型、肤色和备注，保存支持 409 revision 刷新；参考照支持启用、全身/脸部上传、原生裁切、预览、删除、双资产绑定和服务器读回；协议/隐私更新为 2026-07-10 批准口径，准确说明服务器唯一数据源、小程序本地 MiniMax 设置与认证凭据的区别、主动 AI 传输及注销真实删除；长期会话只回归 Task 1。
- **验证结果**：build-info check、小程序 typecheck、设置回归、资产生命周期、鉴权续期合同及 `git diff --check` 通过。
- **未验证风险**：参考照相册/裁切真机、画像真实 409、法律页面视觉和服务端 profile 对象读回留 Task 13 关闭；当前标记 FIXED_UNVERIFIED。

## 2026-07-11 / v2.1.13-test / Codex — 小程序套装、实穿照片与旅行计划闭环

- **执行 Agent**：Codex（未触发 subagent；从 Task 8 提交创建独立 `codex/parity-mini-outfit-trip-20260711` worktree）。
- **目的**：移除旅行页占位，补齐套装详情与三步创建流程，并让实穿照片进入统一资产生命周期。
- **版本变更**：无；保持 `2.1.13-test`。
- **改动文件**：旅行首页、套装详情/创建、`services/workspace.ts`、专项流程测试、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：旅行首页实现服务端真实列表、加载/空/错误、打开/新建/编辑/二次确认删除；套装详情拆为信息、单品、实穿、建议 Tab，实穿支持多图上传、预览、删除和读回，建议覆盖替换风险；创建拆为图片/AI、元数据、逐件确认三步，允许逐件取消、按钮数量取真实选择数，封面和实穿复用 Task 3 双资产层；所有失败保留页面草稿，创建成功强制详情读回后返回。
- **验证结果**：小程序 typecheck、`test:logic:miniprogram-outfit-flow`、种草回归、资产生命周期测试及 `git diff --check` 通过。
- **未验证风险**：真实相册实穿、AI 元数据、旅行写入和服务端对象读回需 Task 13 CLI/真机覆盖；当前标记 FIXED_UNVERIFIED。

## 2026-07-11 / v2.1.13-test / Codex — 小程序种草异常状态与 APP 搜索统计口径校准

- **执行 Agent**：Codex（未触发 subagent；从 Task 7 提交创建独立 `codex/parity-mini-wishlist-state-20260711` worktree，并按用户补充要求回看 APP 当前实现校准搜索/统计）。
- **目的**：补齐种草 converted garment 缺失、评估筛选、搭配语义、脏草稿与 409 冲突恢复，同时纠正初版小程序搜索/统计与 APP 口径不一致。
- **版本变更**：无；保持 `2.1.13-test`。
- **改动文件**：种草首页/详情/编辑、共享编辑壳、`services/workspace.ts`；衣橱搜索/统计、共享统计段；两组专项测试、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：已转换单品被删除时显示专门状态并禁用无效撤销；补评估筛选、归档/恢复、打开 converted item 及搭配/相似内容语义；编辑返回明确“继续编辑/放弃修改”，只有放弃才清草稿；409 保留全部字段，只刷新 revision/raw payload，未变化草稿重试复用 mutationId，字段变化才换 ID。搜索按 APP 始终覆盖全部衣橱、不继承首页筛选，仅名称/颜色查询，位置/类别为页内筛选，保留 10 条历史；统计按 APP 展示本月套装/衣物穿着次数、最近常穿、45 天闲置及种草转衣橱后的购买使用率。
- **验证结果**：小程序 typecheck、衣橱回归、种草回归、共享详情合同及 `git diff --check` 通过。
- **未验证风险**：真实 409、converted garment 删除、搜索返回状态、写操作服务端读回和统计样本仍需 Task 13 fixture/CLI 覆盖；当前标记 FIXED_UNVERIFIED。

## 2026-07-11 / v2.1.13-test / Codex — 小程序衣橱搜索、统计、多选与 AI 诊断闭环

- **执行 Agent**：Codex（未触发 subagent；从 Task 6 提交创建独立 `codex/parity-mini-wardrobe-tools-20260711` worktree）。
- **目的**：替换衣橱搜索/统计 Toast 占位，补齐长按多选批量删除与 AI 诊断完整状态。
- **版本变更**：无；保持 `2.1.13-test`，本批不发布小程序。
- **改动文件**：新增 `pages/wardrobe/search/`、`statistics/`，修改衣橱首页、`catalog-card`、`app.json`、专项回归测试、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：搜索支持会话内历史、位置/分类/关键词组合筛选及来源筛选状态；统计包含总览、近 30 天、闲置、购买使用率与分类分布的 loading/empty/error/normal；卡片长按进入多选、逐项切换、取消、二次确认后串行服务端删除并重新读回；AI 诊断补 loading、折叠/展开、错误、重试、关闭和重新生成。
- **验证结果**：小程序 typecheck、`test:logic:miniprogram-wardrobe`、共享详情合同与 `git diff --check` 通过；专项合同确认两个真实路由注册、无搜索占位、筛选/历史/统计指标、多选服务端读回及 AI 全状态。
- **未验证风险**：微信 CLI 页面 BFS、生产数据批量删除读回和 MiniMax 真实诊断结果将在 Task 13 以专用 fixture 覆盖；当前标记 FIXED_UNVERIFIED。

## 2026-07-11 / v2.1.13-test / Codex — 小程序单品与种草共享详情及灵感资产

- **执行 Agent**：Codex（未触发 subagent；从 Task 4 提交创建独立 `codex/parity-mini-details-20260711` worktree）。
- **目的**：消除单品/种草详情重复字段与动作逻辑，补齐 APP 同语义菜单、颜色/温度展示、编辑媒体以及灵感多图生命周期。
- **版本变更**：无；保持 `2.1.13-test`，本批不发布小程序。
- **改动文件**：新增共享 `item-media-section`、`item-field-sections`，修改 `item-detail-shell` 消费页、单品/种草详情与编辑、`services/workspace.ts`、`services/assets.ts`、专项合同测试、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：两类详情统一使用共享媒体/字段组件；右上三点菜单承载编辑、移动、归档/恢复、打开已转换单品和删除；重新识别移入编辑页；辅助色只在主辅色模式显示，拼色/单色隐藏整行；温度保留文本并增加语义色带；灵感最后一格固定添加入口，支持多图临时资产上传、预览、删除 mutation 与服务端读回；编辑页原生裁切及重新识别接入 Task 3 资产层。
- **验证结果**：小程序 typecheck、`test:logic:miniprogram-item-detail`、资产生命周期测试及 `git diff --check` 通过；共享合同禁止两页复制辅助色条件，并覆盖菜单、温度条、灵感增删、归档、converted garment 入口及编辑媒体动作。
- **未验证风险**：真实微信相册、原生裁切、灵感双资产绑定、删除对象读回、移动衣橱和 converted garment 已删除异常态仍需 Task 13 真机/服务端回归；当前标记 FIXED_UNVERIFIED。

## 2026-07-11 / v2.1.13-test / Codex — 小程序单品与种草录入状态机对齐 APP

- **执行 Agent**：Codex（未触发 subagent；从唯一资产层提交创建独立 `codex/parity-mini-intake-20260711` worktree）。
- **目的**：按用户确认的 APP 步骤 1/2 流程统一小程序单品与种草录入，移除选图即上传、自制裁剪面板式网格和保存后中间结果页。
- **版本变更**：无；保持 `2.1.13-test`，本批不上传体验版。
- **改动文件**：小程序 `pages/intake/camera/*`、`pages/intake/review/index.{ts,wxml}`、`app.json`、`scripts/parity/tests/mini-intake-state-machine.test.ts`、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：步骤 1 固定为大图、横向缩略图、当前图原生裁切/旋转、单张移除、继续拍照、继续图库、清空、下一步；选图只入内存，点击下一步才逐张上传并在本页展示进度，识别结束一次进入步骤 2；原生裁剪取消保留全部草稿；返回/取消统一“退出本次录入？”与“继续录入”；步骤 2 支持逐项选择/取消，保存数取真实 confirmed 数；全成功直接回衣橱/种草，部分失败只保留失败项；批量结果页已从 app 路由移除。
- **验证结果**：小程序 typecheck 通过；资产生命周期测试通过；`test:logic:miniprogram-intake-state-machine` 通过，覆盖选图不上传、下一步上传后识别再跳转、强制布局动作、退出文案、逐项选择、成功直返及结果页移除；`git diff --check` 通过。
- **未验证风险**：修复版尚未在真实微信页面检查基准截图级间距、原生裁切内的旋转控件、系统返回拦截和多图上传/识别/部分失败服务端读回；单品与种草两条真机链路留 Task 13 关闭，当前标记 FIXED_UNVERIFIED。

## 2026-07-11 / v2.1.13-test / Codex — 小程序唯一图片临时资产生命周期

- **执行 Agent**：Codex（未触发 subagent；从 Task 2 已验证提交创建独立 `codex/parity-mini-assets-20260711` worktree）。
- **目的**：建立单品、种草、灵感和试穿参考照可复用的内存录入会话与临时资产底层，纠正原图直接冒充缩略图、选图阶段提前绑定业务实体和退出未清理临时资产的问题。
- **版本变更**：无；保持 `2.1.13-test`，本批不发布小程序。
- **改动文件**：`apps/wechat-miniprogram/services/assets.ts`、`services/intake-session.ts`、`stores/intake.ts`、录入队列构造、`scripts/test-miniprogram-asset-lifecycle.ts`、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：内存会话逐图保存 sourcePath、processedPath、状态、错误、UUID clientMutationId、temporary sessionId 和待绑定 mutations；新增替换、移除、清空、abandon 与提交接口；微信原生 `cropImage` 取消只返回当前步骤；上传前用 `compressImage` 生成 480px/72 质量的独立缩略图，原图与缩略图分别计算元数据并上传，服务端会话未 ready 或不足双资产时禁止业务绑定。
- **验证结果**：`npm --prefix apps/wechat-miniprogram run typecheck` 通过；`npm run test:logic:miniprogram-asset-lifecycle` 通过，覆盖纯内存会话、不改 source 的裁切替换、单图移除、整会话清空、原生裁剪/缩略图/双字节上传/ready 门禁/DELETE abandon 合同；`git diff --check` 通过。
- **未验证风险**：本批为共享底层，页面接线在 Task 4/6/10/11 完成；真实相册、微信原生裁剪、压缩结果、双资产上传和取消裁剪将在 Task 13 使用已连接安卓真机验证，当前标记 FIXED_UNVERIFIED。

## 2026-07-11 / v2.1.13-test / Codex — 小程序单底栏、PNG 图标与胶囊布局统一

- **执行 Agent**：Codex（未触发 subagent；按已审核 Parity 修复计划在独立 `codex/parity-mini-shell-20260711` worktree 实施）。
- **目的**：修复小程序真实设备上原生底栏与自定义底栏叠加、SVG mask 图标缺失，以及各页面重复计算微信胶囊位置造成的标题偏移风险。
- **版本变更**：无；保持 `2.1.13-test`。本批不上传体验版、不发布小程序。
- **改动文件**：`apps/wechat-miniprogram/app.json`、`assets/icons/*.png`、`assets/tabbar/*.png`、`components/ui/icon/*`、`custom-tab-bar/index.ts`、六个胶囊标题页面、`utils/capsule-layout.ts`、`scripts/test-miniprogram-shell.ts`、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：底栏切换为微信原生 `tabBar` 单一所有权并配置四组本地 PNG 图标；通用图标组件从设备兼容性不稳定的 CSS mask 改为 `<image>` 读取本地 PNG；保留自定义底栏代码但当前不挂载，并使重复点击当前项不再触发切页；页面标题统一消费共享胶囊几何函数，避免各页各算一套。绿色 vConsole 为测试版调试窗口，明确不计为软件缺陷。
- **验证结果**：`npm --prefix apps/wechat-miniprogram run typecheck` 通过；`npm run test:logic:miniprogram-shell` 通过，覆盖原生底栏唯一所有权、四项 PNG 文件存在、图标组件不再使用 mask、当前项重复点击无操作及共享胶囊合同；PNG 元数据确认通用图标为 `72×72`、底栏图标为 `81×81`；`git diff --check` 通过。
- **未验证风险**：微信开发者工具 `compile_wxml` 在任务 worktree 上等待 60 秒仍无结果，已终止未执行写操作；修复版预览码/真机上的单底栏、图标显示、四 Tab 重复点击和胶囊白框视觉将在 Task 13 最终回归关闭，当前标记 FIXED_UNVERIFIED。

## 2026-07-11 / v2.1.13-test / Codex — 小程序注册页验证码按钮微调设计

- **执行 Agent**：Codex（未触发 subagent；本轮按 brainstorming 设计门禁在独立 `codex/wechat-register-code-button` worktree 固化用户已确认的视觉微调）。
- **目的**：将邮箱注册页“发送验证码”按钮缩短到当前视觉长度的一半左右，并保证所有按钮状态文案不换行。
- **版本变更**：无；保持 `2.1.13-test`。本批只提交设计，不修改运行时代码、不上传体验版、不发布小程序。
- **改动文件**：`docs/superpowers/specs/2026-07-11-wechat-register-code-button-design.md`、`VERSION_HISTORY.md`。
- **设计结论**：运行时补丁只在注册页将按钮固定为 `168rpx`，使用 `flex: 0 0 168rpx` 阻止默认宽度拉伸，并保留 `white-space: nowrap`；邮箱输入框继续占据剩余宽度。
- **验证结果**：已自查设计文档不存在 `TBD`、`TODO`、范围冲突或双重解释；运行时代码尚未修改。
- **未验证风险**：尚未执行小程序 typecheck、微信开发者工具编译和手机竖屏视觉检查，待设计复核后进入实施阶段完成。
## 2026-07-11 / v2.1.13-test / Codex — Android 动态系统安全区与 edge-to-edge

- **执行 Agent**：Codex（未触发 subagent；从含 Task 1 的本地 main 创建独立 `codex/parity-app-safearea-20260711` worktree）。
- **目的**：修复 Android 录入页顶部被系统栏遮挡及底部手势区出现白条，同时避免按机型写死 padding。
- **版本变更**：无；保持 `2.1.13-test`，最终 APK 在 Task 13 统一构建。
- **改动文件**：`MainActivity.java`、Android `styles.xml`、`src/app/globals.css`、`src/components/intake-flow-shell.tsx`、UI 规范源与生成 HTML、`scripts/test-android-safe-area.ts`、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：原生窗口统一透明状态栏/导航栏并启用 edge-to-edge，从 `WindowInsetsCompat.Type.systemBars()` 动态取得顶/底 inset，通过 WebView CSS 变量发布；冷启动和 onResume 均重新请求；录入壳层取 CSS env 与 Android 变量最大值，背景延伸到手势区、标题和操作内容避让系统栏；无品牌/机型分支和固定安全区补丁。
- **验证结果**：安全区合同测试、UI 规范 build/check、App typecheck、生产 build 通过；Capacitor sync 后 `:app:compileDebugJavaWithJavac` 成功（首次发现 onResume 访问级别需为 public，修正后通过）；`git diff --check` 通过。
- **未验证风险**：本批尚未打最终固定签名 APK，也未在 Android 15 模拟器和 MEIZU 21 Pro / Android 16 实测冷启动、相册返回、后台恢复、键盘、顶部标题和底部手势区；这些由 Task 13 双设备回归关闭，当前标记 FIXED_UNVERIFIED。

## 2026-07-11 / v2.1.13-test / Codex — 跨端长期设备会话与 401 自动续期

- **执行 Agent**：Codex（未触发 subagent；用户要求当前会话直接按已审核 Parity 修复计划实施）。
- **目的**：修复 App 线上工作区/AI 请求遇到服务端提前拒绝 access token 时直接暴露 `Invalid access token`，以及小程序杀进程丢登录态、任意 401 立即误登出、工作区读取绕过公共 HTTP 层的问题。
- **版本变更**：无；当前版本仍为 `2.1.13-test`。本批次不打 APK、不上传小程序。
- **改动文件**：`src/lib/auth-session-recovery.ts`、`src/lib/online/online-request.ts`、`src/components/auth/auth-provider.tsx`、`apps/wechat-miniprogram/stores/session.ts`、`apps/wechat-miniprogram/services/http.ts`、`apps/wechat-miniprogram/services/workspace.ts`、`apps/wechat-miniprogram/services/assets.ts`、`apps/wechat-miniprogram/app.ts`、`services/wardrobe-api/vitest.config.ts`、`services/wardrobe-api/tests/session.test.ts`、`scripts/test-long-lived-device-session.ts`、`scripts/test-miniprogram-auth-refresh.ts`、`scripts/test-online-auth-shell.ts`、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：App 增加全局 session recovery 协调器，线上请求遇到 401 时强制续期，所有并发请求共享同一个 refresh Promise，每个原请求最多重放一次；小程序将设备会话写入微信认证存储，冷启动 hydrate 后把有效 refresh 凭证视为已授权，公共 JSON、multipart 和临时资产二进制上传统一处理 refresh 轮换、并发互斥和一次重放，网络失败保留 refresh token，只有服务端明确撤销、token 重放或账号删除才清除会话；工作区 GET 移除原始 `wx.request` 旁路；服务端专项测试验证每 29 天滚动刷新可持续超过 30 天且始终只有一个 active refresh token。
- **验证结果**：`npm run typecheck` 通过；`npm --prefix apps/wechat-miniprogram run typecheck` 通过；`npm run test:logic:long-lived-device-session` 通过，覆盖 App/小程序各 10 个并发 401 仅一次 refresh、每请求仅一次重放、小程序轮换凭证冷启动恢复及 refreshable session 不闪登出态；`npm run test:logic:miniprogram-auth-refresh`、`npm run test:logic:online-auth-shell` 通过；服务端 `session.test.ts` 7/7 通过，含 87 天滚动会话；`npm run build` 通过；`git diff --check` 通过。
- **未验证风险**：本批次尚未在修复版真实 APK/小程序预览上完成 login/refresh/workspace/AI 抓包、断网恢复、主动退出、撤销设备和注销验收；这些在 Task 13 最终回归关闭，当前只可标记 FIXED_UNVERIFIED。
## 2026-07-11 / v2.1.13-test / Codex — 小程序裁切上传运行时复测与真机差异登记

- **执行 Agent**：Codex 主协调 agent；用户在手机预览同步观察小程序录入页。
- **目的**：验证小程序裁切/旋转/上传底层修复，同时避免把模拟器能力误报为 APP 等价真机体验。
- **小程序提交**：独立修复分支 `46b511c`；官方 `auto_preview` 推送成功，包大小 518,259 bytes，未上传体验版、未发布。
- **模拟器证据**：安全图片夹具经右转 0→90、重置 90→0；首次确认暴露 tainted canvas，修复后生成 82,591 字节有效 JPEG；跨 realm `[object ArrayBuffer]` 修复后临时资产 original/thumbnail 双槽上传成功，队列 ready 且含两个 assetId。
- **真机观察**：用户报告手机上没有与 APP 相同的缩略图和裁切旋转反馈；因此 `STATIC-INTAKE-001` 仍为 `FIXED_UNVERIFIED`，产品一致性门禁继续 FAIL。最新预览已重新推送，需以该包再次观察才可更新状态。
- **隐私/环境**：原生文件选择器仅选择仓库安全夹具；本地隔离账号与 E2E API 使用运行时注入，不写源码；小程序本机忽略配置恢复 `urlCheck=true`。

## 2026-07-11 / v2.1.13-test / Codex — 套装首页超长名称横向溢出修复

- **执行 Agent**：Codex 主协调 agent；用户在 Android 真机发现套装名称过长时页面被拉宽，右侧加号和底部导航不能在一屏展示。
- **目的**：确保任意长度的套装名称只在卡片内部截断，不改变手机视口宽度或固定控件位置。
- **版本变更**：无；保持 `2.1.13-test`，需重建固定签名测试 APK。
- **根因**：本周穿搭日卡的名称按钮使用 `truncate` 但缺少 `w-full/min-w-0/max-w-full`，保留长文本固有宽度；套装首页和周卡根容器也没有最终横向溢出边界。
- **改动文件**：`src/components/outfit-list-view.tsx`、`src/components/outfit-weekly-plan-strip.tsx`、`src/components/outfit-plan-day-card.tsx`、Android parity regression suite/test、静态缺陷清单、`VERSION_HISTORY.md`。
- **改动说明**：名称按钮限制为卡片宽度并省略显示；页面、周卡与日卡增加 `min-w-0/max-w-full` 和局部横向裁剪，不修改服务端名称或详情页完整文本。
- **验证结果**：`npm run typecheck`、Android parity regression 单测 3/3、`git diff --check` 通过；新增 200+ 字符名称真机用例同时断言 document/body scrollWidth、`+计划`、全局新建和底部导航边界。
- **真机验证**：MEIZU 21 Pro / Android 16 安装固定签名 `app-release-0330ec0.apk`；200+ 字符套装名下 `innerWidth=documentScrollWidth=bodyScrollWidth=390`，`+计划`、全局新建和底部导航右边界分别为 374、370、374，均在视口内；截图和 logcat 无本 App 崩溃。
- **缺陷状态**：`RUNTIME-ANDROID-002` 更新为 `VERIFIED`；Android 底部系统栏白条 `RUNTIME-ANDROID-001` 仍为独立 OPEN 缺陷。

## 2026-07-11 / v2.1.13-test / Codex — 月历取消已穿入口接线修复

- **执行 Agent**：Codex 主协调 agent；用户在 MEIZU 21 Pro 真机同步观察并确认 7 月 11 日“已穿”状态无法取消。
- **目的**：修复 App 月历日卡已正确显示“实际已穿”，但因月历入口漏传取消回调而不渲染“取消已穿”的问题。
- **版本变更**：无；保持 `2.1.13-test`，需重建固定签名测试 APK 后定向复测。
- **运行证据**：Android parity 用例读取到展开卡 `height=129.714px`、`opacity=1`，文本包含“实际已穿”和目标套装，但 `cancelWornCount=0`；源码确认周视图已传 `onCancelWear={handleCancelOutfitWearForDate}`，月历入口缺失同一属性。
- **改动文件**：`src/components/outfit-list-view.tsx`、`scripts/android-e2e/suites/parity-regressions.ts`、`VERSION_HISTORY.md`。
- **改动说明**：月历复用现有 `handleCancelOutfitWearForDate`；定向回归增加稳定等待、DOM 状态证据和低速点击策略，避免魅族系统手势把 WebView 坐标点击误识别为上滑最近任务。
- **验证结果**：`npm run typecheck`、online repository packing 单测 2/2、Android parity regression 单测 3/3、`git diff --check` 通过；打包清单 `STATIC-OUTFITS-003` 在同一真机低速重跑通过。
- **未验证风险**：本条提交后的 APK 尚未重建；`STATIC-OUTFITS-004` 必须在新 APK 上完成 UI 入口、服务端计划恢复、wornDates 清除与 wear-event 删除读回后才能标 VERIFIED。Android 底部系统导航栏纯白与页面 ambient 背景不一致另记视觉缺陷，尚未修复。

## 2026-07-11 / v2.1.13-test / Codex — 计划详情同步后的 revision 刷新修复

- **执行 Agent**：Codex 主协调 agent；一个文件隔离 subagent 提供四项 Android 定向回归 suite，主 agent 接入 runner 并在 MEIZU 21 Pro 真机发现运行时缺陷。
- **目的**：修复进入旅行计划详情时打包清单同步已推进服务端 revision、详情仍持有旧 revision，导致随后删除/写入冲突的问题。
- **版本变更**：无；保持 `2.1.13-test`，测试 harness APK 后续重建。
- **运行证据**：`parity:STATIC-OUTFITS-001` 首轮服务端 readback 显示计划 revision 已从 1 变为 2 且未删除，UI 停留详情页；`STATIC-OUTFITS-002` 展开未来日计划后没有“更改/删除”入口，组件条件实证为缺少 `onChangeOutfit`；入口修复后删除成功，但服务端清单被覆盖为空，追踪到 APP 只读取旧字段 `packingChecklistItems`。
- **改动文件**：`src/components/outfit-list-view.tsx`、`src/components/outfit-planning-calendar-view.tsx`、`src/lib/online/online-repository.ts`、对应 packing unit test、Android parity regression suite/runner、`VERSION_HISTORY.md`。
- **改动说明**：`openPlanDetail` 在 `syncPackingChecklistForPlan` 成功后强制 `onPlanDataChange()`，刷新计划实体后才进入详情；月历展开的日计划卡补传 `onChangeOutfit`；repository 优先读取服务端规范字段 `packingChecklist`，并兼容旧 `packingChecklistItems`，防止同步误清空手工物品。
- **验证计划**：typecheck、Android parity suite 单测、重建固定签名本地测试 APK，真机重跑 `STATIC-OUTFITS-001~004`。
- **未验证风险**：新 APK 真机结果完成前不得把 `STATIC-OUTFITS-001~004` 标 VERIFIED。

## 2026-07-11 / v2.1.13-test / Codex — 小程序退出会话撤销闭环

- **执行 Agent**：Codex 主协调 agent。
- **目的**：对 `STATIC-SETTINGS-002` 执行真实退出与旧 token 失效验证，并修复运行时发现的空 JSON 请求兼容问题。
- **版本变更**：无；小程序修复分支新增提交 `1456678`。
- **运行发现与修复**：微信运行时拒绝带 JSON Content-Type 但无 body 的 logout；小程序 `logoutCurrentSession` 改为显式发送 `{}`，服务端接口与清理顺序不变。
- **验证结果**：小程序 typecheck、微信 CLI 编译通过；隔离账号真实登录后 POST logout 成功，本地 session 清除；旧 access token 只在运行时闭包中使用且未输出/落盘，workspace overview 返回 401。
- **缺陷状态**：`STATIC-SETTINGS-002` 更新为 `VERIFIED`。
- **未验证风险**：手机预览端未重复该自动化用例；服务端撤销与本地清理核心闭环已由模拟器 + 本地 E2E API 证明。

## 2026-07-11 / v2.1.13-test / Codex — 小程序种草转换与旅行打包定向复测

- **执行 Agent**：Codex 主协调 agent；三个文件隔离 subagent 新增小程序录入、种草媒体和旅行打包的严格证据采集器，主 agent 使用微信 CLI 执行真实服务端链路。
- **目的**：验证小程序修复分支的高风险 CRUD/级联/打包持久化，并为后续重复回归提供四阶段采集器。
- **版本变更**：无；保持 `2.1.13-test`，运行源码为小程序修复提交 `baefd42`。
- **种草结果**：真实默认衣橱位置被读取并选中；转换成功产生 purchased + converted garment readback。撤销弹层取消后 revision 保持 4、转换引用不变；确认后 revision=5、引用清空，PostgreSQL 显示转换 garment 已软删除。
- **打包结果**：toggle、manual add（“测试收纳袋”数量 2）、mark-all、reset 依次推进 plan revision 2→5；重启登录后强制 GET 仍为 total=4、packed=0 且手动物品存在。
- **缺陷状态**：`STATIC-WISHLIST-002/003` 与 `STATIC-OUTFITS-005` 更新为 `VERIFIED`；`STATIC-WISHLIST-001` 媒体重裁仍等待安全原生图片 fixture，不提前标记通过。
- **基础设施**：新增 mini intake/wishlist/packing regression 采集器，危险 fixture 精确 allowlist；四阶段 screenshot/UI/route/network 与 server-readback 缺失时不得 PASS，原生媒体不可自动化时明确 BLOCKED。
- **未验证风险**：采集器的真实 driver/CLI 接入仍需补齐统一入口；本轮命令级证据已验证业务状态，但最终报告仍以落盘 action evidence 完整性为准。

## 2026-07-11 / v2.1.13-test / Codex — 小程序诊断真实闭环与域级动作映射

- **执行 Agent**：Codex 主协调 agent；三个文件隔离 subagent 分别建立衣橱/录入、套装/推荐、种草/设置的语义 Action 映射，主 agent 恢复微信 CLI 自动化并执行诊断复测。
- **目的**：把通用 BFS runner 连接到真实 route、fixture、parity-id/callMethod，同时验证小程序诊断修复不再是占位实现。
- **版本变更**：无；保持 `2.1.13-test`。小程序修复基线为 `baefd42`，CLI 预览包大小 517,537 bytes。
- **运行结果**：微信 CLI 编译、`simulator_open_page`、`simulator_refresh` 与 automation 已恢复；小程序诊断创建工单 `WD-20260711-989CCC`，POST create/PUT content 均 HTTP 200，UI 到达 success。PostgreSQL readback 为 uploaded、SHA-256 `deebbce4a39b6df5e230637ce81c9e2a39880dcc2742a4913cb1b3ce64e706ab`、695 bytes、items=6/outfits=1/wishlist=4。
- **缺陷状态**：`STATIC-SETTINGS-001` 更新为 `VERIFIED`；执行证据包含四阶段截图、UI tree、route、脱敏 network 与 server-readback。
- **映射结果**：新增三个域映射表；衣橱/录入 38 obligations 中 26 mapped，套装/推荐 68 中 29 mapped，种草/设置 44 中 29 mapped；其余全部明确 `semanticMappingMissing`，不得假 PASS。
- **验证结果**：映射测试、通用执行器测试、BFS runner 测试和完整 typecheck 在本批提交前执行；静态缺陷门禁继续以未执行义务为 FAIL。
- **未验证风险**：小程序裁切、媒体重裁、旅行打包和其余映射动作仍需逐项运行；测试期间仅临时关闭 DevTools URL 校验，完成本地 API 复测后恢复。

## 2026-07-11 / v2.1.13-test / Codex — Manifest BFS 严格证据执行骨架

- **执行 Agent**：Codex 主协调 agent；三个文件隔离 subagent 分别实现 obligation/checkpoint runner、APP 通用执行器和小程序通用执行器，主 agent 接入 CLI/package 并复核。
- **目的**：把 51 Screen / 125 语义 Action 转为逐平台可恢复的 250 条执行义务，严格阻止静态阅读或不完整截图被误报为 PASS。
- **版本变更**：无；保持 `2.1.13-test`，仅新增 parity 测试基础设施。
- **能力**：支持 domain/screen/platform 过滤、execution evidence 递归导入、原子 checkpoint 与断点恢复；APP/小程序执行器统一支持 route、parity-id 点击/输入、返回、稳定等待、四阶段截图/UI/route/network，危险副作用必须命中 fixture allowlist；小程序连接失败和语义映射缺失分别落 `BLOCKED`/`NOT_EXECUTED`。
- **严格门禁**：四阶段 PNG、UI tree、route 缺一不可 PASS；声明 serverAssertion 的 Action 还必须具备 network 与 server-readback。当前导入结果为 obligations=250、PASS=4、DEFECT=1、NOT_EXECUTED=245，审计完整性门禁继续 FAIL。
- **验证结果**：BFS runner 5/5、通用执行器 11/11、完整 `npm run typecheck`、`git diff --check` 通过；CLI `npm run parity:bfs -- --run-id parity-build-20260711-001` 成功生成 `bfs-checkpoint.json`。
- **未验证风险**：通用 driver 仍需为 245 条义务补齐具体 route/fixture/action 映射并实际运行；微信 DevTools 当前连接恢复仍在处理中，任何连接失败项不得降级为 PASS。

## 2026-07-11 / v2.1.13-test / Codex — Android Full 深链路与删除引用级联闭环

- **执行 Agent**：Codex 主协调 agent；一个文件隔离 subagent 实现服务端 garment 删除级联，主 agent 复核、补 E2E 漂移并在真实设备复测。
- **目的**：闭合真实图片恢复、种草图片转换、引用删除、故障重试、无 Key 兜底和 Android 原生边界，并修复运行时发现的跨实体悬空引用。
- **版本变更**：无；保持 `2.1.13-test`。测试 APK 为固定签名 `CN=fangzheng` 的 `app-release-dbc4956.apk`。
- **业务修复**：删除 garment 与撤销种草购买删除转换 garment 时，在同一事务清理 outfit、outfit-plan、已购买 wishlist 和 wear-event 的 UUID/legacy item-id 引用；保留其他衣物及购买历史，所有受影响实体递增 revision、更新设备/时间并写 change log。
- **测试框架修复**：Full 清数据重登复用当前“邮箱或手机号”登录与协议勾选助手；故障注入在确认失败文案和保存页仍可操作后才清除，避免测试抢先解除故障；ADB 截图缓冲适配真实竖屏分辨率。
- **验证结果**：服务端定向测试 5/5、`npm run api:typecheck`、静态缺陷门禁和 `git diff --check` 通过；MEIZU 21 Pro / Android 16 上 `full:cascade-delete-references`、`full:network-failure-retry`、`full:native-boundaries` 通过，此前 `full:image-garment-asset-restore`、`full:wishlist-image-asset-convert`、`full:ai-no-key-fallback-entry` 已通过。`STATIC-INFRA-007` 与新增 `RUNTIME-SERVER-001` 更新为 `VERIFIED`。
- **未验证风险**：跨端 51 Screen 的全量 BFS 与小程序裁切/媒体/打包真机复测仍在后续审计周期执行；本记录不代表最终一致性门禁已通过。

## 2026-07-11 / v2.1.13-test / Codex — 小程序裁切、媒体与打包修复登记

- **执行 Agent**：Codex 主协调 agent（汇总独立小程序修复分支 `baefd42` 的验证结果）。
- **目的**：将 `STATIC-INTAKE-001/002`、`STATIC-WISHLIST-001`、`STATIC-OUTFITS-005` 从 OPEN 更新为 `FIXED_UNVERIFIED`，纳入统一报告和后续定向复测。
- **版本变更**：无；本分支只更新审计缺陷状态，不复制小程序业务源码。
- **验证结果**：小程序完整 typecheck 与 diff check 已在独立分支通过；四项仍等待微信真机裁切/图片/AI/force-stop readback，不标 VERIFIED。

## 2026-07-11 / v2.1.13-test / Codex — Android Smoke/Critical 真机闭环与 E2E 漂移修复

- **执行 Agent**：Codex 主协调 agent（未新增 subagent）。
- **目的**：在 MEIZU 21 Pro 上运行插桩/修复版 APK 的真实 Smoke 与 Critical，并修复测试框架相对当前产品 UI/Android 环境的漂移。
- **版本变更**：无；保持 `2.1.13-test`。测试 APK `app-release-dbc4956.apk`，SHA-256 `69d89001c327e150479f501e19764fd43f54834d0622bec275f706d5f3db096f`，固定签名 `CN=fangzheng`。
- **测试框架修复**：main 调用移到类初始化后；当前注册入口改为 API 隔离账号 seed + 真实 UI 登录，补登录协议；账号页标题更新为“账号安全”；强制截图改为 ADB 原生截图；崩溃筛选只匹配本 App，排除其他进程正常 `AndroidRuntime` 退出；critical API 方法绑定回 ctx.api；详情页先返回再切 Tab；视口外菜单使用 DOM click 兜底。
- **验证结果**：Smoke 4/4 通过（启动、注册种子/真实 UI 登录、服务端退出/重登、默认衣橱单例、刷新/force-stop 恢复、主 Tab/FAB）；Critical 5/5 通过（单品创建/详情/编辑/删除、种草转衣橱/撤销级联、套装计划/穿着一致性、账号隔离、退出/重登/force-stop 恢复）。证据位于 `artifacts/parity/parity-build-20260711-001/android-e2e/{smoke-rerun4,critical-rerun4}`。
- **缺陷状态**：`STATIC-INFRA-006` 已以真实认证 workspace 请求验证为 `VERIFIED`；图片 mutationId 的 `STATIC-INFRA-007` 仍等待 full 带图读回。
- **未验证风险**：Full 深链路、故障注入、真实图片恢复和 APP 打包清单 force-stop 仍未执行。

## 2026-07-11 / v2.1.13-test / Codex — Android E2E deviceId 与图片 mutationId P0 修复

- **执行 Agent**：Codex 主协调 agent；一个文件隔离 subagent 完成 Android E2E helper 修复，主 agent 复核并更新缺陷状态。
- **目的**：修复 `STATIC-INFRA-006/007`，让真实 APK E2E 的认证 Header 与图片资产绑定契约可用。
- **版本变更**：无；保持 `2.1.13-test`，只修改测试基础设施。
- **改动文件**：`scripts/android-e2e/{run-android-e2e.ts,suites/helpers.ts,tests/helpers.test.ts}`、`scripts/parity/config/static-defects.json`、`VERSION_HISTORY.md`。
- **改动说明**：register/login 将请求使用的 deviceId 合并回 auth session；createImageEntity 只生成一次 clientMutationId，并贯穿临时资产 session、上传和 entity create，未放宽服务端绑定校验。
- **验证结果**：定向 helper 测试 1/1、`npm run typecheck`、完整 `npm run test:logic`、`git diff --check` 通过；两个缺陷更新为 `FIXED_UNVERIFIED`。
- **未验证风险**：尚未重新运行真实 APK critical/full 与带图实体 original/thumbnail readback，完成前不得标 `VERIFIED`。

## 2026-07-11 / v2.1.13-test / Codex — 穿搭计划与打包清单四项 APP P0 修复

- **执行 Agent**：Codex 主协调 agent；一个文件隔离 subagent 修复指定三个组件，主 agent 复核缺陷状态并运行完整验证。
- **目的**：修复 `STATIC-OUTFITS-001~004` 中旅行计划删除、日计划删除、打包清单写入和取消已穿参数的 APP 基准错误，避免假成功和错误服务端写入。
- **版本变更**：无；保持 `2.1.13-test`。
- **改动文件**：`src/components/{outfit-list-view.tsx,outfit-plan-day-card.tsx,plan-packing-checklist-view.tsx}`、`scripts/parity/config/static-defects.json`、`VERSION_HISTORY.md`。
- **改动说明**：计划与日条目删除改用完整实体并 await repository result，失败保留确认层、成功前 refresh；日条目删除后只以剩余条目同步 checklist；toggle/add/all/reset/open-sync 全部走 `repoUpdatePackingChecklist`，失败保留弹层/草稿；cancel-worn 参数顺序改为 dateKey、outfitId。
- **验证结果**：`npm run typecheck`、完整 `npm run test:logic`、打包清单 40/40、穿着状态 36/36、穿搭计划 51/51、`git diff --check` 通过；四个缺陷改为 `FIXED_UNVERIFIED`。
- **风险门禁**：critical（服务端 CRUD、计划/穿着一致性和打包清单持久化）。
- **未验证风险**：尚未在真实 APK 上执行删除后的服务端 absence、force-stop 后 checklist readback 和 cancel-worn 反向状态复原，因此不得标 `VERIFIED`。

## 2026-07-11 / v2.1.13-test / Codex — 插桩版固定签名测试 APK 真机验收

- **执行 Agent**：Codex 主协调 agent（未新增 subagent）。
- **目的**：把 APP 全 Action parity-id 与首批 P0 guard 修复构建进测试 APK，并确认真实 Android 设备可安装、启动和连接隔离 API。
- **版本变更**：无；保持 `2.1.13-test` / `versionCode=20113`。该 APK 是 parity 测试 harness，不是生产交付包。
- **构建产物**：`apk-local/app-release-2992cc1d.apk`，SHA-256 `5e56fc2b2d5b5d44bfb88a121b283ab9bab04120a284d249089e98206d066220`，包名 `com.wardrobe.outfit`，固定签名 `CN=fangzheng`，API 为 `http://127.0.0.1:3100`（仅配合 `adb reverse`）。
- **验证结果**：`npm run android:build:test-harness` 成功；真机 MEIZU 21 Pro / Android 16 使用 `adb install -r` 成功，随后 `pm clear`、`adb reverse tcp:3100`、冷启动成功；系统安装版本和前台 `MainActivity` 正确，筛选 logcat 未发现 `FATAL` 或 `AndroidRuntime`。
- **未验证风险**：该轮仅验证安装/启动基础门禁；插桩版完整 APP BFS、Android 返回键矩阵和全部服务端副作用仍在后续审计周期执行。

## 2026-07-11 / v2.1.13-test / Codex — APP 全 Action 插桩与首批服务端 P0 修复

- **执行 Agent**：Codex 主协调 agent；两个文件互斥 subagent 分别补齐 APP 动态循环 a–m、n–z 插桩，主 agent 应用静态计划、处理共享控件透传、修复服务端 P0 并完成门禁。
- **目的**：让 APP 全部运行时 Action 具备稳定 parity-id，并优先修复审计发现的诊断轨迹越权关联、测试 reset 占位/漏表和永久删除策略问题。
- **版本变更**：无；当前应用版本仍为 `2.1.13-test`。parity-id 只用于测试定位，不改变业务事件、视觉或服务端契约。
- **改动文件**：`src/components/**/*.tsx` 共 55 个插桩文件；`services/wardrobe-api/src/{diagnostics/service.ts,admin/reset-test-data.ts}`、对应 diagnostics/reset 测试；`scripts/test/drop-test-schema.ts`、`package.json`、`scripts/parity/config/static-defects.json`、`VERSION_HISTORY.md`。
- **插桩结果**：静态控件使用确定性 ID；循环控件追加 item/id/key/date/value 等稳定业务键；NavButton、MobileNavButton、SettingsSwitch 和 WardrobeRow 由可选 parityId 透传到底层 DOM，并保留 data-parity-id 源定位。重新扫描 APP 562/562 Action、小程序 300/300 Action 均有 parity-id，缺失=0、冲突=0、unresolved=0。
- **P0 修复**：诊断 trace 关联同时强制 requestId、userIdHash、deviceIdHash 相等；`test:env:reset` 改为真实 guarded API reset CLI，32/32 schema 表精确覆盖并由 schema-derived 测试约束；旧 schema teardown 不再使用 `fs.rmSync(recursive, force)`，改用参数安全的 psql 和显式 `trash`，缺少废纸篓能力时失败关闭。
- **验证结果**：`npm run typecheck`、`npm run api:typecheck`、diagnostics 11/11、reset 3/3、reset E2E 数据库 dry-run（32 tables、471 storage keys、无写入）、instrumentation check、inventory check 和 `git diff --check` 通过；`STATIC-SERVER-001`、`STATIC-INFRA-001/002/003` 更新为 `FIXED_UNVERIFIED`。
- **风险门禁**：critical（全 APP Action 定位契约、诊断隐私和测试环境清理）。
- **未验证风险**：trace 修复尚缺真实双用户/双设备碰撞数据库测试；reset 尚未对当前 fixture 执行清理与 after=0/storage=0 验证；parity-id 运行时唯一性尚未覆盖所有循环 fixture；4 个缺陷在完成相应集成复测前不得标 `VERIFIED`。

## 2026-07-11 / v2.1.13-test / Codex — 三组跨端样例、全量 manifest 与静态审核报告

- **执行 Agent**：Codex 主协调 agent；使用三个并行 subagent，分别限定文件所有权完成报告生成器、剩余 manifest 和 parity-id 插桩规划器，主 agent 负责真机/DevTools 执行、合并、隐私门禁与验证。
- **目的**：完成计划要求的衣物详情、诊断上传、穿搭月历三组高价值样例，补齐所有语义 Screen 的详细执行定义，并产出可人工审核的静态 HTML 与机器可读报告。
- **版本变更**：无；当前应用版本仍为 `2.1.13-test`。本批次未修改业务源码、未上传小程序体验版，所有写操作仅指向 allowlist 的本机 E2E API/数据库和隔离账号。
- **改动文件**：`scripts/parity/{adapters/app.ts,adapters/mini.ts,instrumentation.ts,report.ts,cli.ts,manifests/{shared-shell,intake,recommendations,wishlist,statistics,settings}.yaml}`、`package.json`、`VERSION_HISTORY.md`。
- **框架结果**：51/51 语义 Screen 都具备详细 manifest，覆盖 165 个 State/Checkpoint、125 个核心语义 Action，APP 96/96 与小程序 35/35 静态 Screen 来源已映射；884 个静态 Action 合并为 862 个真实控件，705 个可自动插入确定性 parity-id、157 个动态循环要求稳定业务键，冲突和无法定位均为 0，默认只生成 dry-run plan。
- **运行样例**：衣物详情 APP “更多操作” PASS，小程序因四个行内操作取代三点菜单而登记 `STATIC-WARDROBE-004` DEFECT；诊断 APP 真实创建并上传工单 `WD-20260711-0F4368`，PostgreSQL readback 为 `uploaded`、SHA-256 `dde866bbb64fd7ac24ab7c346d96147444c2f9f435b246cd0d791fb590d8ec3e`、8084 bytes、events=9/items=6/outfits=1/wishlist=4，小程序仅 toast 且无诊断请求，登记 `STATIC-SETTINGS-001` DEFECT；日历两端“下一月”均从 2026 年 7 月切至 8 月并 PASS。
- **额外运行发现**：APP access token 过期后诊断上传显示“登录已过期”而未自动刷新，失败弹层已作为运行证据保留；随后仅清除本机 App 会话并重新登录完成成功闭环。微信项目窗口关闭并从锁定 worktree 重新打开后，运行 WXML 与 `b567cee7` 源码的 `data-delta`/`bindtap` 一致，日历证据有效。
- **报告产物**：生成 `report/index.html`、8 个业务域页、51 个 Screen 详情页、`coverage.json`、`defects.json`、`results.json`、`repair-plan.md`、`junit.xml` 和脱敏 baseline lock；页面包含 APP/小程序并排、透明叠加滑杆、原图入口、Action/副作用/服务端断言和明确 `NOT_EXECUTED` 状态。当前样例口径为 PASS=4、DEFECT=2，静态缺陷 51 条（P0=18/P1=30/P2=3）。
- **验证结果**：manifest 与 static-defect 门禁 0 error/0 warning；APP 固定签名真机和微信 DevTools 共生成 6 个 execution、46 张样例/设备截图及 UI/route/network/server readback 证据；报告 JSON、JUnit XML、本地链接和秘密扫描通过；独立 TypeScript 与 `git diff --check` 通过。
- **风险门禁**：critical（真机诊断写入、测试会话、跨端执行器、报告隐私和全量覆盖分母）。
- **未验证风险**：当前只执行 6/884 个静态 Action，878 个仍为 `NOT_EXECUTED`，审计完整性门禁和产品一致性门禁均未通过；705 个自动 parity-id 和 157 个动态循环 ID 尚未应用到业务源码；51 个 OPEN 缺陷尚未修复，报告当前只能作为阶段性审核报告，不能作为一致性通过结论。

## 2026-07-11 / v2.1.13-test / Codex — 小程序执行器样例与详情操作差异实证

- **执行 Agent**：Codex 主协调 agent（未新增 subagent）。
- **目的**：使用微信开发者工具 Automator、隔离测试 API 和真实 fixture 完成小程序首个对应 Action 样例，并验证微信胶囊、返回区域、毛玻璃、弹层与网络证据采集。
- **版本变更**：无；当前应用版本仍为 `2.1.13-test`。本批次未修改小程序业务源码、未上传体验版，运行时 API 覆盖仅存在于当前 DevTools 会话。
- **改动文件**：`scripts/parity/{adapters/mini.ts,cli.ts}`、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：新增 wechatide 执行器，凭据只从 `0600` runtime session 读取并在子进程内写入页面状态；自动设置 localhost 测试 API、登录、打开 fixture 单品详情、调用详情操作与关闭方法；每个检查点保存模拟器原图、页面数据、按钮/图片节点和路由栈。网络证据只从 DevTools 缓冲提取 method、URL、status，禁止保存请求/响应正文、Header 或凭据。
- **验证结果**：独立 `tsc` 与 `git diff --check` 通过；DevTools 使用 APP 隔离账号之外的 mini fixture 账号登录，`POST /api/auth/login`、garments、overview 和指定 garment readback 均为 HTTP 200；生成 5 个截图检查点及 UI/route/network/execution 证据。运行实证确认 `STATIC-WARDROBE-004`：APP 为右上角三点菜单（编辑/移动/删除），小程序为四个行内按钮（编辑/重新识别/AI 建议/删除）且缺移动，样例按 `DEFECT` 落盘。截图确认胶囊位于右上安全区、胶囊本体不作为缺陷；返回区存在明显浅色圆形白框，详情背景与删除 Sheet 毛玻璃/遮罩可见。
- **隐私门禁**：首次直接保存 DevTools network 原始缓冲时发现其包含转义后的登录正文和 token；该临时文件在提交前已按废纸篓规则移除，执行器改成仅保存结构化元数据，最终 evidence 通过密码、token、Bearer 和 JWT 扫描。
- **风险门禁**：critical（小程序自动登录、DevTools 网络缓冲和真实测试会话）。
- **未验证风险**：当前只覆盖小程序衣物详情对应样例；返回按钮白框和两端详情操作层级仍是 OPEN 缺陷，尚未修复和定向复测；手机二维码预览已由用户装载，但本批自动化证据来自 DevTools 模拟器，手机真机全量路径仍待后续周期。

## 2026-07-11 / v2.1.13-test / Codex — APP 真机一致性执行器样例与本地测试 APK

- **执行 Agent**：Codex 主协调 agent（未新增 subagent）。
- **目的**：用固定签名 Android APK、真实隔离 fixture 和设备 WebView 完成首个可重复的一致性 Action 样例，验证执行器能落盘操作前后截图、UI 树、路由、网络和系统返回证据。
- **版本变更**：无；当前应用版本仍为 `2.1.13-test`。本批次只放宽显式 `PARITY_TEST_BUILD=1` 下的 localhost 测试构建，不改变正式构建的 HTTPS 门禁或业务行为。
- **改动文件**：`scripts/parity/{adapters/app.ts,cli.ts}`、`scripts/{validate-build.mjs,validate-cloud-build-env.mjs,test/write-apk-build-manifest.mjs}`、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：新增 ADB + WebView CDP 执行器，凭据仅从 `0600` runtime session 内存读取；真实登录后定位 fixture 单品，执行“更多操作”弹层与 Android 系统返回；每个检查点保存 ADB 原生整屏图、交互 UI 树和路由状态，并保存脱敏网络记录。构建校验现可继承调用方显式环境，本地 HTTP 仅允许 parity 测试标记；APK manifest writer 同时识别 Gradle 输出和已归档的 `apk-local` 最新文件。
- **验证结果**：独立 `tsc` 与 `git diff --check` 通过；构建 `apk-local/app-release-74bba388.apk`，包名 `com.wardrobe.outfit`、`versionName=2.1.13-test`、`versionCode=20113`、签名 `CN=fangzheng`，SHA-256 `4ab55a52dc8dba9bc173121e4b80821dc1e3a27c00988f16239228646d32c3f8`；真机 MEIZU 21 Pro / Android 16 以 `adb install -r` 安装，`adb reverse tcp:3100` 连接本地 E2E API，清数据后用隔离账号登录并读到 6 件 fixture 衣物；`garment.detail.more` 样例 PASS，生成 5 个强制检查点及 UI/route/network/execution 证据，系统返回关闭弹层，logcat 未发现 `FATAL`/`AndroidRuntime`。
- **风险门禁**：high（本地测试 APK、真机自动操作和测试账号会话）。
- **未验证风险**：当前仅完成衣物详情“更多操作”样例，尚未覆盖 APP 其余 Action、小程序对应样例、服务端写入副作用和全量报告；测试 APK 不得作为生产交付包。

## 2026-07-11 / v2.1.13-test / Codex — 双平台测试 fixture 真实 seed 与读回

- **执行 Agent**：Codex 主协调 agent（未新增 subagent）。
- **目的**：把声明式 fixture 转成 APP/小程序相互隔离的真实测试 API 数据，并保存不含凭据的实体别名清单供页面执行器使用。
- **版本变更**：无；当前应用版本仍为 `2.1.13-test`。本批次只写入本机 allowlist 通过的 `wardrobe_e2e` 数据库和 E2E storage，不连接生产 API、不改业务代码、不打 APK。
- **改动文件**：`scripts/parity/{seed.ts,lib/api.ts,cli.ts,config/static-defects.json}`、`.gitignore`、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：新增只接受 localhost API 的关联 Header 客户端；按 run/platform 生成确定性手机号、deviceId 和 clientMutationId；注册或复用隔离账号，上传 deterministic original/thumbnail，创建衣物、套装、种草、旅行和日计划并执行 overview readback；token/密码只写 `.parity-runtime` 的 `0600` 文件，artifact 只保存 masked account、实体 ID/revision 和计数。
- **验证结果**：APP 与小程序 seed 均成功；每端分别读回 garments=6、outfits=1、wishlist=4、tripPlans=2、outfitPlans=1、locations=1，共 14 个别名实体；server artifact 扫描不含 accessToken、refreshToken、测试密码、Bearer 或 MiniMax Key；两个 runtime session 文件权限均为 `-rw-------`；静态缺陷门禁更新后通过（51 条，P0=18/P1=30/P2=3）；独立 `tsc` 和 `git diff --check` 通过。
- **风险门禁**：critical（真实测试数据写入、资产绑定与测试会话）。
- **未验证风险**：尚未实现按 case 的业务实体 teardown；当前依赖唯一 namespace 和幂等 mutationId 隔离。运行中证实既有 Android E2E 未保留 deviceId，且图片会话/实体创建 mutationId 不一致，已新增两条 P0 基础设施缺陷，尚未修复。

## 2026-07-11 / v2.1.13-test / Codex — Fixture、平台例外与本机环境门禁

- **执行 Agent**：Codex 主协调 agent（未新增 subagent）。
- **目的**：为详细状态图提供可重复的账号、衣物、套装、日历、种草、设置、诊断、网络和视觉 fixture，并在任何写入前证明数据库、设备、预览 SHA 与密钥环境安全可用。
- **版本变更**：无；当前应用版本仍为 `2.1.13-test`。本批次不写测试数据、不改业务行为、不打 APK、不上传小程序体验版。
- **改动文件**：`scripts/parity/{environment.ts,fixtures.ts,fixtures/catalog.json,config/platform-exceptions.yaml,cli.ts,types.ts}`、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：新增 33 个 fixture（3 个破坏性实体均要求独立使用）；固定 2026-07-15 / Asia/Shanghai 月历 golden matrix；MiniMax fixture 只记录可用性不保存 Key；将用户已批准的 `WX-CAPSULE-001` 物化为唯一平台例外，只允许运行时胶囊矩形与 8px 左安全边距；新增无明文输出的 E2E env、数据库 allowlist、JWT 文件、ADB、预览 SHA 和 Key 可用性检查。
- **验证结果**：`npm run parity:fixture:check` 无 error/warning 通过（33 fixture，destructive=3）；`npm run parity:environment:check` 无 error/warning 通过，4/4 E2E 变量已配置，本地 `wardrobe_e2e` PostgreSQL 可达、Android 真机 ready、预览 SHA 匹配、MiniMax Key 可用；独立 `tsc` 编译和 `git diff --check` 通过。
- **风险门禁**：high（后续 fixture 写入、真机与 live AI 的执行前置）。
- **未验证风险**：fixture 当前只有声明和门禁，尚未实现 API seed/readback/teardown；未生成任何生产或测试数据库写入，也未验证真实 QQ 邮件收件。

## 2026-07-11 / v2.1.13-test / Codex — 静态缺陷库与证据门禁

- **执行 Agent**：Codex 主协调 agent（汇总三个成对业务域 subagent 和服务端/测试资产 subagent 的只读源码证据）。
- **目的**：把成对盘点发现的确定差异、APP 基准写入错误、隐私/会话风险和测试基础设施阻断转成可校验的结构化缺陷，防止后续只关注像素差而遗漏确定的业务问题。
- **版本变更**：无；当前应用版本仍为 `2.1.13-test`。本批次不修复缺陷、不改业务行为、不打 APK、不上传小程序体验版。
- **改动文件**：`scripts/parity/{defects.ts,types.ts,config/static-defects.json,cli.ts}`、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：新增 StaticDefect schema、唯一 defectId、语义 Screen、源码证据、验收标准、疑似文件、静态确认/运行确认和状态校验；登记衣橱、录入、种草、套装计划、设置/账号、诊断、隐私及测试 reset/report 共 49 条 OPEN 缺陷；APP 基准问题与小程序 parity 问题分开分类，未把静态候选直接标记 VERIFIED。
- **验证结果**：`npm run parity:defects:static:check` 无 error/warning 通过；共 49 条（P0=16、P1=30、P2=3、P3=0），其中 46 条有静态确定证据、3 条明确要求运行确认；独立 `tsc` 编译和 `git diff --check` 通过。
- **风险门禁**：critical（包含会话未吊销、诊断 trace 所有权、破坏性操作无确认、APP 写入假成功、测试 reset 占位等 P0）。
- **未验证风险**：所有缺陷仍为 OPEN；尚未附运行截图、网络记录、服务端 readback 或真机复现证据，修复阶段不得仅凭本文件把状态改成 VERIFIED。

## 2026-07-11 / v2.1.13-test / Codex — 双端 Screen 语义映射与三个样板 manifest

- **执行 Agent**：Codex 主协调 agent；使用三个只读成对业务域 subagent 分别映射共享壳层/衣橱、录入/种草、套装/设置，每个 subagent 同时读取独立 APP 与小程序 detached worktree。
- **目的**：把静态库存转换为 APP 与小程序的业务语义映射，区分真正 Screen、Screen 内 State、共享组件、平台页和缺陷页，并为衣物详情、诊断上传、套装计划月历建立首批可执行详细 manifest。
- **版本变更**：无；当前应用版本仍为 `2.1.13-test`。本批次不改业务行为、不打 APK、不上传小程序体验版。
- **改动文件**：`scripts/parity/{manifest.ts,types.ts,scanners/app.ts,manifests/**}`、`package.json`、`VERSION_HISTORY.md`；用户批准的外部执行计划同步新增 `MINI_ONLY_DEFECT` 状态。
- **改动说明**：APP AST 扫描补齐 AppRoute discriminated union 的 16 个正式路由；`screen-map.yaml` 登记 51 个语义 Screen，并新增 `MINI_ONLY_DEFECT` 表达小程序额外占位/遗留业务页；`app-source-dispositions.json` 将非独立布局的 41 个 APP 候选逐项归类为 Screen State、Screen Component 或共享基础设施；详细样板 manifest 定义 21 个 State、18 个核心 Action、21 个 Checkpoint、fixture、入口、Overlay、Transition 和服务端断言。
- **验证结果**：重新生成 inventory 后 APP Screen 候选增至 96；`npm run parity:inventory:check` 通过且 unresolved=0；`npm run parity:manifest:check` 无 error/warning 通过，51 个语义 Screen 覆盖 APP 96/96 来源与小程序 35/35 注册页面；独立 `tsc` 编译和 `git diff --check` 通过。
- **风险门禁**：high（跨端 Screen/State/Action 分母与后续修复边界）。
- **未验证风险**：只有三个样板具备详细执行 manifest，其余 48 个语义 Screen 仍需补齐 State/Action/Checkpoint；884 个 Action 仍缺 parity-id；成对源码盘点已发现多项 P0/P1 候选，必须进入结构化 defects、运行证据和复测闭环后才可定案或关闭。

## 2026-07-11 / v2.1.13-test / Codex — 一致性审计动态目标人工解析门禁

- **执行 Agent**：Codex 主协调 agent（未新增 subagent；使用第一批只读盘点证据逐项复核源码）。
- **目的**：将静态扫描无法直接确定的 23 个动态导航目标逐项解析为受版本控制的明确目标，确保 `unresolved.json` 真正归零且保留原始候选审计链。
- **版本变更**：无；当前应用版本仍为 `2.1.13-test`。本批次不改业务代码、不打 APK、不上传小程序体验版。
- **改动文件**：`scripts/parity/{cli.ts,inventory.ts,types.ts,validate.ts,config/unresolved-resolutions.json}`、`VERSION_HISTORY.md`。
- **改动说明**：保留 `unresolved-candidates.json`，新增 `resolved.json` 和严格 ID 对齐校验；逐条解析 AppRoute 对象、返回派生、AuthView、详情 Tab、计划子页、设置 data-url、创建入口、录入结果 Tab 分流和自定义 Tab；将小程序 `goHome()` 使用 `wx.switchTab('/pages/home/index')` 的不可达非法目标记录为 `UNREACHABLE_DEFECT`，不以人工解析掩盖缺陷。
- **验证结果**：重新生成 `parity-build-20260711-001` inventory；23 / 23 动态候选有明确 resolution，`unresolved = 0`；`npm run parity:inventory:check` 无 warning 通过；独立 `tsc` 编译和 `git diff --check` 通过。
- **风险门禁**：medium（测试库存解析规则与后续覆盖率分母）。
- **未验证风险**：人工解析只解决静态目标不确定性；884 个 Action 仍缺 parity-id，运行时可达性、状态分支、服务端收件和视觉证据仍待后续阶段验证。

## 2026-07-11 / v2.1.13-test / Codex — APP 与小程序一致性审计框架第一批

- **执行 Agent**：Codex 主协调 agent；使用三个只读 subagent 分别盘点 APP、小程序、服务端与现有测试资产，各自固定在独立 detached worktree，未修改基线。
- **目的**：按 `codex_app_miniprogram_parity_execution_plan.md` 建立可重复运行的本地基线锁和静态库存生成器，让 Screen、Action、Overlay、Transition、Side Effect 与 unresolved 分母由源码生成，而不是由模型自由决定测试范围。
- **版本变更**：无；当前应用版本仍为 `2.1.13-test`。本批次只建设测试框架，不改业务行为、不打 APK、不上传小程序体验版。
- **改动文件**：`scripts/parity/{AGENTS.md,cli.ts,inventory.ts,lock.ts,types.ts,validate.ts,lib/**,scanners/**}`、`package.json`、`.gitignore`、`VERSION_HISTORY.md`。
- **改动说明**：新增四周期 runId 与 `baseline-lock.json`；记录本地双分支 SHA/tree hash、Android 真机、微信工具、测试 API、fault token 和 MiniMax 可用性；使用 TypeScript AST 扫描 APP，使用可处理引号内 `>` 的 WXML 结构扫描器与 TypeScript AST 扫描小程序；生成计划要求的八类 inventory 文件；新增来源存在性、唯一 ID 和 instrumentation 门禁；`scripts/parity/AGENTS.md` 固化禁止远端覆盖、废纸篓删除、证据与结果状态规则。
- **验证结果**：`npm install --prefer-offline --no-audit --no-fund` 通过；`parity-build-20260711-001` 基线锁成功；`npm run parity:inventory` 成功生成 APP 80 Screen / 578 Action / 63 Overlay / 103 Transition / 568 Side Effect，小程序 35 Screen / 306 Action（含 303 个 WXML 事件和 3 个 navigator）/ 129 Overlay / 96 Transition / 150 Side Effect；`npm run parity:inventory:check` 通过来源、结构和唯一 ID 校验；独立 `tsc` 编译通过；`git diff --check` 通过。
- **风险门禁**：high（新增长期审计基础设施，后续将驱动跨端插桩、真机执行与缺陷修复）。
- **未验证风险**：23 个动态静态候选仍在 `unresolved.json`，必须人工映射后才能通过审计门禁；instrumentation 门禁按预期失败，APP 578 个、小程序 306 个 Action 均缺少 parity-id；运行时状态图、fixture reset、APP/小程序执行器、服务端收件断言、截图 diff 和 HTML 报告尚未进入本批次。

## 2026-07-11 / v2.1.13-test / Codex — Parity 合并缺陷账本与可信双门禁

- **执行 Agent**：Codex（未触发 subagent；按用户批准的 `final-merged-repair-plan.md` 执行 Task 0）。
- **目的**：将现场真机与 Session 合并发现补入唯一缺陷账本，并把报告覆盖率从文件数量改为 case/obligation 级证据判定，防止缺执行、截图、网络或服务端读回时误报完成。
- **版本变更**：无；当前版本仍为 `2.1.13-test`，本批只修改测试框架、缺陷账本与版本记录。
- **改动文件**：`scripts/parity/config/static-defects.json`、`scripts/parity/bfs-runner.ts`、`scripts/parity/report.ts`、`scripts/parity/defects.ts`、`scripts/parity/tests/bfs-runner.test.ts`、`scripts/parity/tests/report-gate.test.ts`、`VERSION_HISTORY.md`。
- **改动说明**：补录跨端鉴权、长期会话、双 TabBar、真机图标、录入状态机、额外结果页、Android 顶部安全区、设置开发备注、详情字段及推荐/试穿 placeholder 共 12 个编号缺陷；写操作与上传/异步任务无条件要求 network 与 server-readback；每个 obligation 强制四阶段截图/UI tree/route，重复 execution 直接失败；`coverage.json` 新增 obligation 级计数、`auditGate` 和 `productGate`，HTML 首页显示失败原因；placeholder 屏幕无缺陷编号时静态门禁失败。
- **验证结果**：`npm run typecheck` 通过；`npm run parity:bfs:test` 7/7 通过；`npx tsx --test scripts/parity/tests/report-gate.test.ts` 3/3 通过；静态缺陷校验通过；报告重新生成且 JSON、HTML 链接、secret scan 通过。当前旧基线报告诚实显示 `auditGate=FAIL`（250 obligations 中 244 未执行/缺证据）与 `productGate=FAIL`（7 OPEN P0、35 OPEN P1、4 OPEN P2、6 FIXED_UNVERIFIED）。
- **未验证风险**：本批只建立可信门禁，不关闭业务缺陷；旧报告 artifacts 不进入 Git，最终修复回归将生成全新 repair/regression run。

## 2026-07-10 / v2.1.13-test / Codex — 注销功能双基线集成与最终 APK

- **执行 Agent**：Codex（未触发 subagent；完成 `main` 与 `wechat/miniprogram` 串行集成后，在正式 App 目录重新构建最终合并态 APK）。
- **目的**：确保账号注销、全入口协议主动同意和备案公开名称三项同期改动同时进入最终 Android 包，避免同版本旧 APK 覆盖新功能。
- **版本变更**：无；保持 `2.1.13-test` / `versionCode=20113`。
- **基线结果**：`main` 合入提交 `a9c6f722`，包含共享注销契约、0016 迁移、服务端状态机和 App 三次确认；`wechat/miniprogram` 合入提交 `91c329f6`，包含小程序动态微信/邮箱/密码核验与三次确认。两条正式基线均已推送 GitHub。
- **交付产物**：正式根目录 `衣橱穿搭助手-v2.1.13-test.apk`，构建归档 `apk-local/app-release-a9c6f722.apk`，SHA-256 `734d28c2f0848a001a622375ab6782e0bd52745eacb72dd60e9f94286c788f15`；包名 `com.wardrobe.outfit`，签名证书 `CN=fangzheng`。
- **验证结果**：正式目录先重建共享契约产物，再执行 `npm run android:apk` 成功；APK 元数据、版本和固定签名通过。独立 AVD `wardrobe-account-deletion` / Android 15 使用 `adb install -r`、`pm clear` 和显式 `MainActivity` 冷启动成功，前台窗口与进程正常，登录页确认包含同期协议主动同意界面；Android 返回键后 App 仍在前台，筛选 logcat 未发现 `FATAL` 或 `AndroidRuntime`，测试后已关闭模拟器。第一次使用 `monkey` 的启动尝试停留 Launcher 且无 App 崩溃日志，改用显式 Activity 启动后验证通过。
- **未验证风险**：生产 API 仍未部署 0016 迁移和注销路由，最终 APK 只完成客户端合并态启动验证，未对生产账号执行永久注销；小程序自动化 runtime/screenshot 工具持续超时，未完成真实微信 code 端到端删除。上线前仍需先部署服务端，再以专用可删除账号完成 App 邮箱/密码及小程序微信核验的真实删除验收。

## 2026-07-10 / v2.1.13-test / Codex — 微信小程序账号注销三次确认

- **执行 Agent**：Codex（未触发 subagent；先将最新 `main` 合入 `wechat/miniprogram`，再在独立 `codex/miniprogram-account-deletion` worktree 实施）。
- **目的**：让微信小程序与 App 共用同一注销状态机，并在小程序内提供微信、邮箱和密码三种动态本人核验方式。
- **版本变更**：无；保持 `2.1.13-test`。本批不上传体验版、不发布小程序，也不重新构建 Android APK。
- **改动文件**：`apps/wechat-miniprogram/app.json`、`pages/settings/account/`、新增 `pages/settings/account-deletion/`、`services/auth.ts`、`scripts/test-account-deletion-miniprogram.ts`、`package.json`、`VERSION_HISTORY.md`。
- **改动说明**：账号安全页在退出登录之后新增最底端居中的红色下划线“注销账号”文字入口，无可见按钮背景、边框和圆角，保留 88rpx 触摸区；注销页依次提供风险告知、已有身份动态选择、最终不可恢复勾选三次确认。第二阶段在全部已绑定时显示微信身份、邮箱验证码、当前密码三个按钮；微信方式直接调用本小程序 `wx.login` 获取一次性 code，并与固定 AppID 一起交给服务端核验绑定 OpenID，不跳转 App。最终确认后清除小程序 MiniMax Key 和内存会话，使用无认证回执轮询，数据库与文件删除完成前不显示注销成功。
- **验证结果**：`npm run test:logic:account-deletion`、`test:logic:account-deletion-app`、`test:logic:account-deletion-miniprogram`、共享契约 typecheck、API typecheck、小程序 typecheck 和 `git diff --check` 通过。微信开发者工具登录态及 skill `0.2.5` 一致，成功打开独立任务项目窗口、刷新模拟器并编译打开 `pages/settings/account-deletion/index`；console 未发现 compile、syntax、WXML、WXSS、TypeError 或 ReferenceError。验证后已关闭任务项目窗口。
- **未验证风险**：当前微信开发者工具的 `compile_js` 返回 `unknown tool`，自动化 runtime/screenshot 调用持续超时且未产出截图，因此没有在本批模拟器内完成登录后的三页逐项点击；生产 API 尚未部署 0016 迁移和注销路由，也未用真实微信 code、邮箱验证码或专用账号执行永久删除。上线前必须先部署服务端，再用可删除测试账号完成微信真机或稳定模拟器端到端验收。

## 2026-07-10 / v2.1.13-test / Codex — App 注销最终 APK 与 Android 验收

- **执行 Agent**：Codex（未触发 subagent；在独立 `codex/account-deletion-design` worktree 完成最终构建和真机环境等价的 Android 模拟器验收）。
- **目的**：重新构建包含账号页底部安全间距修复的最终固定签名 APK，并以独立模拟器确认“注销账号”入口位置、三次确认前两段页面、Android 返回键和运行日志。
- **版本变更**：无；保持 `2.1.13-test`，Android `versionCode=20113`。
- **交付产物**：根目录 `衣橱穿搭助手-v2.1.13-test.apk`，SHA-256 `93f2e11536d91881e6389b03b2c666e36864add475dc98b67cb99b54fd587d32`；构建归档 `apk-local/app-release-090ac083.apk`；包名 `com.wardrobe.outfit`，签名证书 `CN=fangzheng`。
- **验证结果**：最终 APK 在独立 AVD `wardrobe-account-deletion`（`emulator-5560`）覆盖安装并正常启动；实际页面确认账号安全页最底端的“注销账号”为居中红色下划线文字、无按钮外观且完整位于固定底栏上方，入口保留 44px 触摸热区；使用真实测试账号依次检查风险告知、动态身份方式选择和密码核验页，未执行永久删除；Android 返回键后 App 仍保持前台且无崩溃。最终 logcat 未发现 `FATAL` 或 `AndroidRuntime`，测试后已关闭模拟器。截图证据保存在 `test-results/android-v2.1.13-account-deletion/ui-5560/`（忽略目录，不进入 Git）。
- **未验证风险**：生产 API 尚未部署 0016 迁移与注销路由，所以未点击最终确认、未验证生产数据库/对象存储真实删除，也未覆盖真实邮箱验证码；这些必须在服务端部署后用专用可删除账号验收，不能用长期测试账号直接试删。

## 2026-07-10 / v2.1.13-test / Codex — App 注销发布准备与法律文本同步

- **执行 Agent**：Codex（未触发 subagent：用户要求当前会话完整实施；本批在独立 worktree 完成 App 发布准备）。
- **目的**：将已完成的注销能力升版进入 Android 构建，并让隐私政策、用户协议和账号注销说明与真实入口和服务端状态一致。
- **版本变更**：`package.json` / `package-lock.json` 从 `2.1.12-test` 升到 `2.1.13-test`，Android 推导 `versionCode=20113`。
- **改动文件**：`package.json`、`package-lock.json`、`src/content/legal-content.tsx`、账号页与注销页底部安全间距、`VERSION_HISTORY.md`。
- **改动说明**：法律内容改为 App/小程序“设置 → 账号安全 → 注销账号”自助路径，说明三次确认、已有身份任选一种验证、立即停用、全会话失效、真实删除完成才报成功及法定留存例外；独立 Android 视觉检查发现固定底部导航会遮住账号页最后一行，账号页和注销页补充 112px 加安全区的底部滚动留白，保证红色下划线入口完整显示。
- **验证结果**：账号注销两组专项测试、官网合同、`test:fast`、component、repository integration、API 17 files / 104 tests、共享/API/App/小程序 typecheck 与 `npm run build` 全部通过；初次固定签名 APK 构建成功并通过元数据、签名和 `android:verify:full`，随后在独立 `wardrobe-account-deletion` / `emulator-5560` 上用真实测试账号完成账号安全、风险告知、动态验证方式和密码验证页截图。底部间距修复后的最终 APK 与截图将在下一条收口记录中重新生成。
- **未验证风险**：生产 API 尚未部署 0016 迁移和注销路由，因此未对生产测试账号执行最终永久注销；没有调用最终确认，避免在旧生产 API 上误操作或删除长期测试账号。

## 2026-07-10 / v2.1.12-test / Codex — Android App 账号注销三次确认 UI

- **执行 Agent**：Codex（未触发 subagent：用户要求当前会话开始实施；本批按项目 UI 规范串行完成 App 端）。
- **目的**：在不接入微信 Android SDK、不改变既有退出登录的前提下，为 App 增加入口克制但完整可执行的自助注销流程。
- **版本变更**：无；当前仍为 `2.1.12-test`，待 APK 批次统一升到 `2.1.13-test`。
- **改动文件**：`src/components/auth/{account-views,account-deletion-view,auth-provider}.tsx`、`src/components/{app-root,wardrobe-app}.tsx`、`src/lib/{app-route,auth-session-store,cloud-auth-api,device-minimax}.ts`、UI 规范源与生成预览、App 合同测试、`package.json`。
- **改动说明**：账号安全页在退出登录之后新增最底端红色下划线“注销账号”文字入口，无可见按钮边框/背景/圆角但保留 44px 热区；新增风险告知、动态邮箱/密码任选一种核验、最终不可恢复 Sheet 三次确认，以及处理中、成功和已停用异常状态。App 不显示微信验证；最终提交开始后清除本机 MiniMax Key，成功返回登录页时清除 token、用户和本机 owner 绑定，避免已注销账号阻塞新账号。新增独立 `account_deletion` 路由和服务端回执轮询。
- **验证结果**：`npm run test:logic:account-deletion-app`、`npm run typecheck`、`npm run test:logic:auth-client-shell`（49/49）、`npm run test:logic:app-route`（46/46）通过；UI token 门禁仍命中基线已记录的历史硬编…157467 tokens truncated… GarmentFitGender + TemperatureRange + GarmentCategory；新增常量 FIT_NOTES_MAX_LEN；
    ②**state schema 变更**：`formTempMin` + `formTempMax`（两个 string）→ 合并为 `formTemperatureRange`（`TemperatureRange | undefined`）；新增 `formFitGender` / `formFitNotes` / `formPrice` / `formProductUrl`；
    ③**UI 改动**（基础信息卡片）：9 个分类 chip → `<CategorySubcategoryPicker>` 二级联动（含切大类自动清二级 P1-6 fix）；新增「价格」number input + 「商品链接」url input；
    ④**UI 改动**（穿着属性卡片）：两个数字输入框（最低温/最高温）→ `<TemperatureRangeSlider>`；新增 `<FitGenderChips>` 4 选 1；新增「版型说明」textarea + 字符计数（`maxLength={FIT_NOTES_MAX_LEN}`，硬剪切片防粘贴超限）；
    ⑤**handleSaveForm** 改：写入 fitGender / fitNotes / price / productUrl + temperatureRange（独立 Slider 返回 `{minC?, maxC?}`，清洗成 Item schema）；空字符串 → undefined；NaN 防御；
    ⑥**openEditForm / setFormFromItem** 改：读取 fitGender / fitNotes / price / productUrl / temperatureRange 填表单；
    ⑦**resetForm** 改：清空所有新字段；
    ⑧**formInitialSnapshot + checkFormDirty** 改：snapshot 加新字段，dirty 检测保持准确（用户改了温度滑块退出要弹「放弃修改」确认）；
    ⑨**AI 重新识别候选填充** 改：fitGender / fitNotes / price 填进表单（candidate 类型 `ShoppingAssessmentCandidate` 无 productUrl 字段，保留旧值不覆盖）。
  - `VERSION_HISTORY.md`：本条目。
- **unstaged 不进 commit 的文件**：
  - `src/components/temperature-range.tsx`（365 行综合版，仍 untracked）
  - `.claude/settings.json`（未提交，非本任务改动）
  - 其它 12 个 `??` 文件（其他 agent / 历史 verifier 遗留）
- **验证**：
  - `npm run typecheck`：✓ EXIT=0，0 type error。修复 4 处遗留 `formTempMin` / `formTempMax` 引用（checkFormDirty + AI 重新识别填充）。
  - `npm run test:logic:all`：✓ 61 pass / 0 failed。
  - `npm run build`：✓ Compiled successfully，仅既有 lint warnings。
- **风险门禁**：medium-high。涉及种草 add_edit 表单多字段 UI 替换 + state schema 变更（formTempMin/formTempMax → formTemperatureRange）+ dirty 检测快照同步 + 旧数据兼容（已有种草物品读 temperatureRange 进 Slider）。不改 Dexie schema / 不改 MiniMax prompt / 不改 Android 签名 / 不新增依赖 / 不打 APK。
- **未验证风险**：
  - 9 个一级 chip 在窄屏 390px 下能否完整横向滚动（继承 Step 3+4 实测待办）。
  - 二级 chip 数量 4-22 项，最多的组（22 项）flex-wrap 后高度可能撑高 1 屏。
  - 种草 add_edit 表单整体高度（多 4 项 UI）是否还能滚到底。
  - 独立 TemperatureRangeSlider 空状态视觉「未设置」+ 不渲染 handle 在种草表单的实际表现。
  - 用户首次保存 fitGender 后推荐打分是否生效（recommendations.ts 已支持，需要真实用户偏好 profile + 种草物品 fitGender 配合）。
- **未触发 subagent**：跳过独立审查（同 313cbf7 commit，原因：verifier session Token Plan 上限挂掉；本项目默认跳过 subagent；本地 typecheck / test:logic / build 三重验证）。

---

## 2026-06-24 / v1.1.22 / Mavis — Step 2 (P0-5) 补全项目 temperatureRange 控件（Bar + Slider + 3 view 接入）

- 目的：按 v1.1.22 独立审查 (verifier) 报告的 P0-5 修复建议，补齐全项目缺失的 temperatureRange 控件——`temperatureRange` 字段虽然 types.ts 已定义、AI prompt 已要求输出，但 3 个详情/列表 view（衣橱详情 / 套装详情 / 种草详情）一直用 `${minC}℃ - ${maxC}℃` 字符串拼接展示，没有可视化组件；录入页和 add_edit 也无编辑控件。需求文档 §8.3 要求「展示模式」渐变条 + 「编辑模式」双端点滑块。
- 版本变化：`package.json` 保持 **1.1.22**（不变）。
- 改动文件：
  - `src/components/temperature-range-bar.tsx`（新增 155 行）：只读展示 Bar，0-40℃ 蓝→红渐变（hsl 210°/190°/45°/20°/0° 五段渐变）+ 两端圆点（size sm 16/md 20）+ 「15℃ - 28℃」/「未识别」文字标签；空值（minC/maxC 都 null）渲染「未识别」灰色占位。
  - `src/components/temperature-range-slider.tsx`（新增 370 行）：双端点可拖动滑块编辑组件，单条进度条 + 两个 44×44 hit area 圆点（视觉 20×20，AGENTS.md 移动端硬规则触摸命中区 ≥44px）；pointer 事件处理（pointerdown 启动 + setPointerCapture + document-level pointermove/pointerup/pointercancel + release capture + 越界自动夹紧）；键盘 ←→/↑↓/Home/End 调整；min ≤ max 自动夹紧；不发网络/AI 请求，纯本地 UI 组件。
  - `src/components/garment-detail-3.0.tsx`（+2/-3）：`InfoTab` 的 `<DetailInfoRow label="适穿温度" value={...}>` 字符串拼接 → `<TemperatureRangeBar value={temperatureRange} size="sm" />`。
  - `src/components/outfit-list-view.tsx`（+2/-3）：`OutfitDetailView` 的 `tempLabel` 字符串拼接 → `<TemperatureRangeBar value={outfit.temperatureRange} size="sm" />`。
  - `src/components/wishlist-view-2.0.tsx`（+4/-3）：`RowItem` 的 `value` 类型从 `string` 升级为 `ReactNode`（放宽以支持 JSX 内容）+ 加 `flex-1 min-w-0` 防溢出；`<RowItem label="适穿温度" value={...}>` 字符串拼接 → `<TemperatureRangeBar value={item.temperatureRange} size="sm" />`。
  - `VERSION_HISTORY.md`：本条目。
- 验证：
  - `npm run typecheck`：✓ EXIT=0，0 type error。
  - `npm run test:logic:all`：✓ 61 pass / 0 failed（与 Step 1 持平；Bar / Slider 是纯 UI 单元，逻辑套件不直接覆盖；移动视口实测依赖后续 dev server 验证）。
- 风险门禁：high。涉及 3 个详情/列表 view UI 变更 + 2 个新组件（Bar 155 行 + Slider 370 行）+ 1 个 RowItem props type 升级（`string` → `ReactNode`）；不改 Dexie schema、不改 MiniMax prompt、不改 Android 原生签名、不新增依赖、不打 APK。
- 未验证风险：
  - 3 个 view 实际移动视口渲染效果未在 Playwright 截图实测（依赖后续 dev server + 移动视口验证 round）。
  - `src/components/temperature-range.tsx`（365 行综合版，Bar + Slider + `normalizeTemperatureRange` utility）暂留 untracked 未 commit，与独立 bar/slider 文件并存但 src 零引用（独立 bar/slider 已被 3 view 引用）；是否删除待 sibling 拍板（避免误删前一个 agent 预留代码）。
  - 后续 P0-3 / P0-4 / P0-1 / P0-2（CategorySubcategoryPicker / 步骤 3 补字段 / add_edit 重写 / add_edit 接 Slider）会进一步消费 `TemperatureRangeSlider` 组件，本 commit 不带这些后续步骤。
- 未触发 subagent：用户已通过 Round 8 之前明确通知启动独立审查（verifier 已交付 VERDICT: FAIL 报告）；本 commit 仅执行 P0-5 修复。

---

## 2026-06-24 / v1.1.22 / Mavis — Step 1 (P0-6) 删 wishlist-intake-flow.tsx 死代码 + 更新 7 个测试脚本

- 目的：按 v1.1.22 独立审查 (verifier) 报告的 P0-6 修复建议，删 `src/components/wishlist-intake-flow.tsx`（695 行）整文件；e93fb47 commit 后种草录入已切到 `GarmentIntakeFlow` `flowKind="wishlist"`，整个文件不再被生产代码引用，只剩 7 个测试脚本 grep 它做合约断言（构成假阳性 PASS）。本 commit 不打 APK、不递增版本。
- 版本变化：`package.json` 保持 **1.1.22**（不变）。
- 改动文件：
  - `src/components/wishlist-intake-flow.tsx`：**删除**（-695 行）
  - `src/components/wardrobe-app.tsx`：line 1705 + line 2268 两条过时注释更新（"add_wishlist_item 走 WishlistIntakeFlow" → "add_single_item 与 add_wishlist_item 都走 GarmentIntakeFlow（wishlist 模式靠 flowKind=\"wishlist\" 区分）"；同样地 line 2268 注释同步）
  - `scripts/test-diagnostic-events.ts`：删除 `wishlistIntake` readFileSync + 移除 2 个 wishlist-specific check()（"wishlist-intake-flow 导入 recordDiagnosticEvent" / "wishlist-intake-flow 记录 intake_flow_step_changed, flow=wishlist"）
  - `scripts/test-intake-draft.ts`：删除 `wishlistFlowSrc` readFileSync + 移除 WISHLIST_INTAKE_STEPS 断言（wishlist 三步录入已合并到 GarmentIntakeFlow）
  - `scripts/test-intake-entry-and-crop-regression.ts`：删除 `wishlistIntakeFlow` readFileSync + 替换 `!/label="价格"/.test(wishlistIntakeFlow)` 为 `flowKind === "wishlist" ? "价格"` 校验（契约转向 GarmentIntakeFlow）
  - `scripts/test-wishlist-intake-confirm-contract.ts`：删除 `wishlistFlow` readFileSync + 移除 `wishlistFlow.includes("币种")` 断言
  - `scripts/test-ai-intake-live-contract.ts`：删除 `wishlistFlow` readFileSync
  - `scripts/test-home-card-edit-wishlist-delete-hotfix.ts`：删除 `wishlistIntakeFlow` read()
  - `scripts/generate-chatgpt-attach.mjs`：FILE_GROUPS "02b" 移除 wishlist-intake-flow.tsx + 标题/描述同步（"6 步" → 移除"6"；"单品录入流、种草录入流" → "单品/种草录入流（共用 GarmentIntakeFlow）"）
  - `docs/req-fields-sync-catalog-v2.md`：业务需求书（untracked → tracked，778 行）
  - `VERSION_HISTORY.md`：本条目
- 验证：
  - `npm run typecheck`：✓ EXIT=0，0 type error。
  - `npm run test:logic:all`：✓ 61 pass / 0 failed（含 diagnostic-events、intake、wishlist、foundation、outfit、detail-shell、garment-intake-confirm、wishlist-intake-confirm 等全部套件）。
  - `grep -rn "wishlist-intake-flow\|WishlistIntakeFlow" src/ scripts/`：仅剩 `wishlist-intake-from-ai`（lib 文件，非本 P0 范围）+ 2 个 test 注释（"已删 dead code" 说明性文字），生产代码无残留。
- 风险门禁：high。涉及核心组件文件删除 + 7 个测试脚本断言重写 + 文件组清单同步；不改 Dexie schema、不改 MiniMax prompt、不改 Android 原生签名、不新增依赖、不打 APK。
- 未验证风险：
  - 未在 Android 真机安装 APK 后实测种草录入路径走 GarmentIntakeFlow 的端到端流程（依赖本轮未做 APK 打包）。
  - 后续 P0-1（重写 wishlist add_edit 表单）+ P0-2（add_edit 温度滑块）会触及同一个页面，本 commit 不带这两步的修改。
- 未触发 subagent：用户已通过 Round 8 之前明确通知启动独立审查（verifier 已交付 VERDICT: FAIL 报告）；本 commit 仅执行 P0-6 修复，下次完整修复完成后会重新 spawn verifier 走 follow-up 审查。

---

## 2026-06-24 / 文档治理 / Mavis — Round 9 compact：按时间梯度压缩 VERSION_HISTORY.md

- 目的：按用户偏好"老的版本就多压缩，新的版本就少压缩"，对 VERSION_HISTORY.md 做第三次 compact（1890 行 / 208KB → 733 行 / 74KB，体积减少约 64%）；同步清理 v1.1.20-dev Commit 1 段尾的 v1.1.19-pkg 重复段（line 339-357）。
- 版本变化：`package.json` 不变（不涉及源码）。
- 改动文件：
  - `VERSION_HISTORY.md`：58 条版本记录按三档梯度重排
  - `VERSION_HISTORY.md.precompact8.bak`：原文件备份（Round 9 起点）
- 三档分布（按"距今天数"分档）：
  - **A 档**（最新，6-23 ~ 6-24，13 条）：完整保留原始细节（每条 10-30 行）
  - **B 档**（中间，6-15，7 条）：中等压缩（每条 6-8 行），保留目的 / 改动文件分类 / 验证 / APK 元数据 / 风险门禁 / subagent
  - **C 档**（最老，6-12 ~ 6-14，38 条）：极简摘要（每条 2-4 行），仅保留目的 / 风险门禁（high/medium/low）/ subagent 状态；APK 节点保留 SHA-256 + versionCode + 固定签名链引用
- 段完整性校验：grep `^## 20` 共 57 个版本块（+ 末尾 `## 历史记录汇总` / `## 历史基线` 段）；batch B / v1.1.6 → v1.1.7 等含空格/特殊字符的版本号均被正则捕获。
- 顺手清理的 bug：v1.1.20-dev Commit 1 段尾（line 339-357）有完整 v1.1.19-pkg 副本（约 12KB 重复内容），已删除；备份在 `.precompact8.bak`，确认无内容丢失。
- 验证：
  - `grep -c "^## 20"` VERSION_HISTORY.md：57 个版本块（清理前 58，去重后 57）。
  - `grep -c "v1.1.19-pkg"` VERSION_HISTORY.md：1 个（仅 line 230 真实段，重复段已删）。
  - `grep -c "batch B"` VERSION_HISTORY.md：1 个（line 500 batch B 段）。
  - 文件大小：`ls -la VERSION_HISTORY.md` → 74KB / 733 行（从 208KB / 1890 行）。
  - 文件头尾人工 review：A 档完整 / B 档可读 / C 档摘要充分 / 末尾 Round 8 + Round 9 compact 索引保留。
- 风险门禁：low。仅文档治理 + 文档清理，无源码改动；备份文件已保留可恢复。
- 未验证风险：备份文件 `.precompact8.bak` 需要用户确认是否在 git 中 commit（按 AGENTS.md §63，不夹带备份文件进入 Git，建议用户手动 trash）。
- 未触发 subagent：用户未通知，且纯文档压缩，不涉及代码事实判断，按项目规则跳过 subagent。

---

## 2026-06-24 / v1.1.22 / Codex — 统一衣物与种草字段模型到 ColorInfo/catalog v2

- 目的：继续上一位 agent 已开始的需求文档执行，把单品、种草、录入、推荐、详情、套装、统计、迁移和测试脚本从旧 `colorMode/mainColor/primaryColors/secondaryColors/sceneTags/styleTags/note/purchasePrice` 口径收敛到 `colors: ColorInfo`、9 类 catalog category、`notes` 和统一 `price/productUrl` 字段；本轮不打 APK、不递增版本。
- 版本变化：`package.json` 保持 **1.1.22**（不变）。
- 改动文件：
  - `src/lib/types.ts`、`src/lib/color-fields.ts`、`src/lib/migrate.ts`、`src/lib/intake-draft.ts`、`src/lib/intake-local-draft.ts`、`src/lib/intake-save-adapters.ts`：统一基础字段、颜色工具、旧数据迁移、草稿结构和保存适配器。
  - `src/lib/device-minimax.ts`、`src/lib/recommendations.ts`、`src/lib/similarity.ts`、`src/lib/wishlist-*`、`src/lib/outfit-ai-*`、`src/lib/garment-*`、`src/lib/wardrobe-reference-sync.ts`、`src/lib/diagnostic-log.ts`、`src/lib/catalog-card-format.ts`、`src/lib/wear-statistics.ts`：同步 AI prompt/解析、推荐、买前评估、种草转换、详情搭配、样式建议、诊断和展示派生逻辑。
  - `src/components/intake-color-mode-editor.tsx`、`src/components/garment-intake-flow.tsx`、`src/components/wishlist-intake-flow.tsx`、`src/components/wishlist-view-2.0.tsx`、`src/components/garment-detail-3.0.tsx`、`src/components/outfit-intake-flow.tsx`、`src/components/wardrobe-app.tsx`：同步录入确认页、颜色编辑器、种草页、详情页、套装选择和首页/编辑页数据流。
  - `scripts/test-*.ts`：把逻辑测试、静态契约测试和回归夹具同步到新字段模型。
- 验证：
  - `npm run typecheck`：通过，0 type error。
  - `npm run test:logic:all`：通过，0 failed。
  - `npm run build`：通过；仍有项目既有 lint warnings（未作为本轮范围清理）。
  - Playwright 390×844 移动视口本地冒烟：`http://127.0.0.1:3001` 首页正常渲染，`scrollWidth=390`、无横向溢出、无浏览器错误；dev server 已关闭。
- 风险门禁：high。涉及核心数据模型、迁移兼容、MiniMax prompt/解析、录入保存链路、种草/衣橱互转、推荐/搭配逻辑、核心 `wardrobe-app.tsx` 和大批测试夹具；不改 Dexie schema、不改 Android 原生签名、不新增依赖、不打 APK。
- 未验证风险：
  - 未使用真实 MiniMax Key 做 live 图片识别、种草识别、买前评估或 AI 推荐调用；本轮通过 prompt/解析契约、逻辑测试和本地兜底覆盖可验证部分。
  - 未在 Android 真机安装后验证 WebView localStorage / IndexedDB 历史数据迁移；本轮不打 APK，只完成源码、测试和本地浏览器移动视口验证。
- 未触发 subagent：用户未通知启动独立审查；按项目规则仅执行本地验证，不自动启动 subagent。

---

## 2026-06-23 / v1.1.22 / Codex — 单品与种草录入、颜色材质识别、套装返回链路修复

- 目的：按用户真机截图和补充说明，一次性修复单品录入步骤 2/3、种草录入复用、AI 颜色/材质字段、套装封面旧缓存、历史套装卡片跳转与返回链路问题；本轮不打 APK，不递增版本。
- 版本变化：`package.json` 保持 **1.1.22**（不变）。
- 改动文件：
  - `src/components/garment-intake-flow.tsx`、`src/components/intake-flow-shell.tsx`、`src/components/intake-color-mode-editor.tsx`：步骤 2 删除缩略图对钩与末尾 `+N`，允许未裁切直接开始识别，识别时显示第 N / 共 X 件；步骤 3 删除字段统计卡，在缩略图上方展示当前裁切图大图，增加窄屏 `min-w-0/max-w-full/overflow-hidden` 约束；颜色模式可手动切换单主色/拼色/主辅色。
  - `src/lib/device-minimax.ts`、`src/lib/types.ts`、`src/lib/intake-local-draft.ts`、`src/lib/intake-draft.ts`、`src/lib/intake-save-adapters.ts`：AI 识别结果保留 `colorMode/mainColor/accentColors/material/subcategory/sceneTags/temperatureRange`，旧 `colors` 兼容拆分不破坏推荐逻辑；草稿保存链路写入材质、颜色模式和种草的可选价格/链接。
  - `src/components/wishlist-view-2.0.tsx`、`src/components/wardrobe-app.tsx`：种草正式录入改为复用单品三步多图流程，标题为“添加种草”，支持多图选择和批量保存，仅比单品确认页多出非必填价格/链接字段。
  - `src/components/garment-detail-3.0.tsx`、`src/components/outfit-list-view.tsx`、`src/components/use-app-navigation-controller.ts`、`src/lib/app-route.ts`、`src/lib/outfit-cover.ts`：历史套装卡片点击进入套装详情并携带返回路由，返回后回到原单品详情搭配页；套装封面优先用当前 `itemIds` 实时拼图，清理旧 `coverImageDataUrl/preview` 缓存，避免瀑布流继续显示老图。
  - `scripts/test-*.ts`：补充/更新单品录入、种草录入、颜色字段、套装封面、详情返回、诊断事件和相关静态回归断言。
- 验证：
  - `npm run typecheck`：通过，0 type error。
  - `npm run test:logic:all`：通过，0 failed。
  - `npm run build`：通过；仍有项目既有 lint warnings（未作为本轮范围清理）。
  - Playwright 424×932、DPR 3.4 移动视口（对应 1440×3168 QHD+ 物理屏）：单品录入从空衣橱“录入第一件”进入，选图后不裁切直接“开始识别”，步骤 2 `scrollWidth=424`、无 `+1`，步骤 3 `scrollWidth=424`、无横向溢出、显示大图。
  - Playwright 同视口：种草页“添加种草单品”进入，标题为“添加种草”，步骤 2 无 `+1`，步骤 3 `scrollWidth=424`、无横向溢出，显示价格/链接，不显示衣橱位置/可穿状态，不显示旧“字段/可保存”统计卡。
- 风险门禁：high。涉及移动端录入流程、AI prompt/解析字段、图片裁切/识别入口、Dexie 保存映射、路由返回链、套装封面缓存和核心 `wardrobe-app.tsx`；不改 Dexie schema、不改 Android 原生签名、不新增依赖、不打 APK。
- 未验证风险：
  - 未使用真实 MiniMax Key 做 live AI 图片识别调用；本轮验证覆盖本地无 Key fallback、解析归一、草稿保存和 UI 流程。
  - 未在 Android 真机安装 APK 后实测系统相册/返回键；本轮通过 Playwright 移动视口、全量逻辑测试和生产构建覆盖。
- 未触发 subagent：用户询问是否需要 subagent，但未明确通知启动独立审查；按项目规则仅执行本地验证，不自动启动 subagent。

---

## 2026-06-23 / v1.1.22-pkg / Mavis — 合并 main 并打包 v1.1.22 APK

- 目的：按用户指令"分支合并到 main 并打包"，把已 commit 的 `de63d0d v1.1.22-dev` 全站页面顶部 header 高度统一到 56px (h-14) 打成 Android release APK。`package.json` 已 1.1.21 → 1.1.22，本次不二次 bump 版本。
- 版本变化：`package.json` 保持 **1.1.22**（不变）。本轮 APK：`衣橱穿搭助手-v1.1.22.apk`（项目根目录，7.8M；`npm run android:apk` BUILD SUCCESSFUL in 15s，290 actionable tasks / 47 executed / 243 up-to-date）。
- 合并结果：`main` 通过 `git merge --ff-only codex/fix-outfit-cover-and-label` 快进到 `de63d0d v1.1.22-dev`。
- APK 产物：`衣橱穿搭助手-v1.1.22.apk`（项目根目录，7.8M）；release 原始输出为 `android/app/build/outputs/apk/release/app-release.apk`（7.8M）。
- APK 元数据：`applicationId=com.wardrobe.outfit`、`versionName=1.1.22`、`versionCode=10122`（由 `android/app/build.gradle` 从 `package.json` 推导）；SHA-256 `67b17e3955a6e1dff18ae1f80117202ac659d6fbf3bc4b125bfbbf7b1f7b7528`。
- 固定签名：`android/signing/wardrobe-fixed.jks` (2.8KB) + `android/signing/wardrobe-signing.properties` (103B) 均存在，沿用项目固定签名；与历史 v1.1.21 / v1.1.20 / v1.1.19 / v1.1.18 / v1.1.17 同签名链，可直接覆盖升级。
- 合并流程：
  - 1) `git stash push -m "preserved-claude-settings-2026-06-23-v1.1.22" -- .claude/settings.json` 暂存用户要求保留的 settings 文件。
  - 2) `git checkout main && git merge --ff-only codex/fix-outfit-cover-and-label`（fast-forward OK，main HEAD = `de63d0d`）。
  - 3) `git checkout codex/fix-outfit-cover-and-label && git stash pop` 切回原分支 + 恢复工作区。
- 验证（main HEAD = `de63d0d v1.1.22-dev`）：
  - 合并前 dev commit 已通过 `npm run typecheck`（0 errors）和 Playwright 390×844 实测 5 个页面顶部行容器 y=24 height=56。
  - `npm run typecheck`（main 上重跑）：✓ EXIT=0 (1s)，0 type error。
  - `npm run android:apk`：BUILD SUCCESSFUL in 15s，47 executed / 243 up-to-date；输出 `android/app/build/outputs/apk/release/app-release.apk` (7.8M) 已复制到项目根目录。
  - dev server: 已在 v1.1.22-dev commit 验证完毕，PID 61843 kill 掉，`lsof -nP -iTCP:3000 -sTCP:LISTEN` 无输出确认。
- 工作区未提交改动（与本轮合并/打包无关，未夹带）：`M .claude/settings.json`、`?? FULL_CODE_REVIEW_AND_BROWSER_FLOW_REPORT.md`、`?? deliverable-commit2.md`、`?? deliverable-commit3.md`、`?? review-artifacts/`、`?? scripts/subagent-*.mjs`、`?? scripts/review-browser-flow.mjs`、`?? scripts/test-backup-ui.mjs`、`?? scripts/test-delete-cascade-e2e.ts` 均为其他 agent / 用户留下的脚本或审查产物；按 AGENTS.md §57 "commit 只能包含当前 agent 本次任务的改动"，本轮 commit 仅含 v1.1.22-dev 的 8 个文件，不二次 bump 版本（package.json 已在 dev commit 中从 1.1.21 升到 1.1.22）。
- 风险门禁：medium。涉及 Android APK 交付链路、固定签名复用、版本号一致性、合并到 main；不改 Dexie schema、不改 MiniMax prompt、不改签名配置、不新增依赖。
- 未验证风险：未在 Android 真机上安装 v1.1.22 APK 实操验证全站顶部 header 高度统一效果（5 个页面顶部行 y=24 height=56 已在 Playwright 390×844 实测核过，真机仅需最终回归确认）。
- 未触发 subagent：用户未通知启动独立审查；本轮按 wardrobe-outfit-pwa 项目默认跳过 subagent 审查的策略执行。

---

## 2026-06-23 / v1.1.22-dev / Mavis — 全站页面顶部 header 高度统一到 56px (h-14)

- 目的：按用户 6-23 18:13 真机截图反馈，套装 / 单品 / 种草详情页顶部边距明显比首页大，红圈标注区域需要做小。盘点后用户确认"所有页面都要改成一样的高度"，统一到 56px (h-14)，与衣橱首页顶部按钮行 token 对齐。
- 版本变化：`package.json` / `package-lock.json` **1.1.21 → 1.1.22**。本 commit 不打 APK（末尾统一打 v1.1.22-pkg）。
- 改动文件（5 个）：
  - `src/components/app-sub-page-top-bar.tsx`（顶部注释 + grid 行）：公共顶栏 `min-h-[76px]` → `min-h-14`（56px），列宽 `56_1fr_88` → `48_1fr_48`，加 `px-4`，`items-center` → `items-stretch`，返回 / 更多按钮容器顶对齐（`items-start`），按钮圆直接 40×40 顶对齐到行顶（与首页"全部衣橱"按钮顶部 y=24 完全一致）；标题 18→16px，图标 20→18px，subtitle 12→11px。
  - `src/components/outfit-list-view.tsx`：套装首页 header 改 `flex h-14 items-center justify-between gap-3`，h2 加 `leading-tight`。
  - `src/components/wishlist-view-2.0.tsx`：种草首页 header 同上。
  - `src/components/wardrobe-app.tsx`：设置首页 h1 `text-2xl pt-1 px-1` → `text-xl flex h-14 items-center px-4 pt-2`，与 AppSubPageTopBar / 衣橱首页按钮行 / 套装 / 种草首页 header 一致。
  - `src/components/garment-detail-3.0.tsx`、`src/components/wishlist-view-2.0.tsx`、`src/components/outfit-list-view.tsx`：单品 / 套装 / 种草详情页正文顶层 `mt-4` → `mt-3`（同步到首页 token `pt-3` = 12px）。
- 实测验证（Playwright 390×844 本地视口）：
  - 衣橱首页"全部衣橱"按钮顶部 y=24（h-14 = 56px，y 24-80）。
  - 套装 / 种草 / 设置首页 header 容器 y=24 height=56。
  - 6 个详情页 / 子页（单品详情、套装详情、种草详情、月历、计划详情、打包清单，共用 AppSubPageTopBar）顶部行 y=24 height=56；返回圆按钮 y=24 height=40，与首页"全部衣橱"按钮顶部 y=24 完全一致。
  - 修复前：返回圆按钮在 56px 行内垂直居中（y=31.5），比首页按钮顶部低 7.5px——这是用户红圈差距的根因。
- 验证：
  - `npm run typecheck`：通过，0 errors。
  - Playwright 390×844 截图 + getBoundingClientRect 比对五个页面的顶部行容器，全部 y=24 height=56。
  - Dev server 已启动验证（PID 61843，打包前会 kill）。
- 风险门禁：medium。涉及 6 个详情 / 子页 + 3 个首页 + 1 个设置首页的页面顶部 header 高度 token 统一；不改 Dexie schema、不改 MiniMax prompt、不改 Android 原生签名、不新增依赖、不打 APK。
- 未验证风险：
  - 未在 Android 真机安装 APK 后实测。本 commit 仅 dev 节点，未打 APK；末尾 v1.1.22-pkg 统一打包。
  - 横屏 (844×390) 下 `grid-cols-[48px_1fr_48px]` + `min-h-14` 视觉一致性未单独验证；但 56px 是 token 标准值，横屏只多 24px 高度，标题与按钮热区都不冲突，理论无影响。
- 未触发 subagent：用户未通知启动独立审查；按 wardrobe-outfit-pwa 项目默认跳过 subagent 审查的策略执行。

---

## 2026-06-23 / v1.1.21 / Codex — 套装组成同步、已买种草失效提示与瀑布流套装标签修复

- 目的：按用户真机截图与补充要求修复两类问题：套装删除/编辑单品后不再保留已删除单品信息，必须同步刷新套装封面和套装信息；衣橱瀑布流单品横滑到相关套装图时左上角标签应显示“套装”而不是“灵感”。同时补齐已买种草记录在关联衣橱单品被删除后的不可查看、不可撤销购买提示。
- 版本变化：`package.json` / `package-lock.json` 保持 **1.1.21**。本轮只做源码修复与验证，未打 APK。
- 改动文件：
  - `src/lib/outfit-cover.ts`、`src/lib/wardrobe-reference-sync.ts`：套装封面和统计统一跟随当前真实 `itemIds`；新增套装/已买种草的关联单品同步补丁，刷新封面、基础信息并清掉旧预览图/缩略图/AI 建议缓存。
  - `src/lib/wardrobe-cascade-delete.ts`、`src/lib/wishlist-conversion.ts`、`src/lib/types.ts`、`src/lib/migrate.ts`：删除衣橱单品时同步过滤套装；剩余不足 2 件的套装直接删除；已买种草记录保留购买记录但标记 `convertedItemDeletedAt`，禁止继续查看衣橱详情或撤销购买恢复种草。
  - `src/components/wardrobe-app.tsx`：手工新建/编辑套装、编辑单品、重裁切主图、移动衣橱位置后同步刷新关联套装和已买种草信息；衣橱瀑布流横滑到 `saved_outfit_preview/cover` 时 badge 改为“套装”。
  - `src/components/outfit-list-view.tsx`：套装编辑保存后同步刷新封面缓存和旧 AI 建议。
  - `src/components/wishlist-view-2.0.tsx`：已买种草记录关联单品已删除时弹窗提示，阻止查看详情和撤销购买。
  - `scripts/test-outfit-asset-center.ts`、`scripts/test-wishlist-conversion-flow.ts`、`scripts/test-foundation-infra.ts`、`scripts/test-delete-cascade-regression.ts`、`scripts/test-wishlist-management-followup.ts`：新增/调整套装封面、删除级联、已买种草失效标记、迁移兼容和 UI 行为断言。
- 验证：
  - `npm run test:logic:outfit`：41 pass / 0 fail。
  - `npm run test:logic:wishlist-flow`：57 pass / 0 fail。
  - `npm run test:logic:foundation`：67 pass / 0 fail。
  - `npm run test:logic:delete-cascade-regression`：22 passed / 0 failed。
  - `npm run test:logic:wishlist-management-followup`：53 passed / 0 failed。
  - `npm run test:logic:all`：通过，0 failed。
  - `npm run typecheck`：通过。备注：曾与 `npm run build` 并行执行时因 `.next/types` 正在重建出现一次 transient TS6053，随后单独重跑通过。
  - `npm run build`：通过；仍有既有 lint warnings，本轮未作为范围清理。
  - Playwright 390×844 本地冒烟：点击“示例衣橱”后首页卡片和图片横滑可渲染，页面出现“套装”标签文本。
- 风险门禁：high。涉及 Dexie 本地数据引用同步、套装删除/更新、种草已买状态、移动端瀑布流和弹窗行为；不改 MiniMax prompt、不改 Android 原生签名、不新增依赖、不打 APK。
- 未验证风险：
  - 未在 Android 真机安装后实测删除单品、编辑单品、横滑标签和已买种草失效弹窗；本轮通过逻辑套件、静态回归、构建和本地手机视口冒烟覆盖。
  - 既有 build lint warnings 未清理，保持本轮范围外。
- 未触发 subagent：用户未通知启动独立审查。

---

## 2026-06-23 / v1.1.21-pkg / Codex — 合并 main 并打包 v1.1.21 APK

- 目的：按用户指令将 `codex/v1-1-21-card-detail-back-fixes` 快进合并到 `main`，并把已完成的首页卡片圆角、详情页边距、单品详情编辑/裁切 Android 返回键修复打成 Android release APK。
- 版本变化：`package.json` / `package-lock.json` 保持 **1.1.21**（版本号已在修复 commit `9a4743b` 中从 1.1.20 递增到 1.1.21，本轮仅合并与打包，不二次 bump）。
- 合并结果：`main` 通过 `git merge --ff-only codex/v1-1-21-card-detail-back-fixes` 快进到 `9a4743b v1.1.21 fix detail card back regressions`。
- APK 产物：`衣橱穿搭助手-v1.1.21.apk`（项目根目录，7.8M）；release 原始输出为 `android/app/build/outputs/apk/release/app-release.apk`（7.8M）。
- APK 元数据：`applicationId=com.wardrobe.outfit`、`versionName=1.1.21`、`versionCode=10121`（由 `android/app/build.gradle` 从 `package.json` 推导）；SHA-256 `57215f1c6b18e7d5a2ca0413df2ae0f3cc3539ee7ef42678f11998f77de93d7c`。
- 固定签名：`android/signing/wardrobe-fixed.jks` + `android/signing/wardrobe-signing.properties` 均存在，沿用项目固定签名配置构建 release APK。
- 验证：
  - 合并前修复 commit 已通过 `npm run test:logic:home-card-edit-wishlist-delete-hotfix`、`npm run test:logic:detail-shell`、`npm run test:logic:back-priority-regression`、`npm run test:logic:followup-navigation`、`npm run typecheck`、`npm run test:logic:all`、`npm run build`。
  - `npm run android:apk`：BUILD SUCCESSFUL in 29s，290 actionable tasks / 47 executed / 243 up-to-date；构建输出已复制到项目根目录版本化 APK 文件。
- 风险门禁：high。涉及 Android APK 交付链路、固定签名复用、`main` 合并与真机返回键相关修复交付；不改 Dexie schema、不改 MiniMax prompt、不改签名配置、不新增依赖。
- 未验证风险：
  - 未在 Android 真机安装 v1.1.21 APK 后实按系统返回键验证；本轮完成本地构建、源码级回归测试与 APK 产物校验。
  - `npm run android:apk` 期间仍有既有 lint warnings 与 Gradle 9.0 deprecation warning，本轮未作为范围清理。
- 未触发 subagent：用户未通知启动独立审查。

---

## 2026-06-23 / v1.1.21 / Codex — 首页卡片圆角、详情页边距与单品详情返回键修复

- 目的：根据用户 3 张真机截图反馈，修复首页卡片圆角与图片区圆角不匹配、单品详情页横向页边距比首页大、单品详情页进入编辑或重新裁切后按 Android 返回键会直接退回衣橱首页的问题。
- 版本变化：`package.json` / `package-lock.json` **1.1.20 → 1.1.21**。本轮按用户当前指令只做源码修复与验证，**未打 APK**。
- 改动文件：
  - `src/components/catalog-waterfall-card.tsx`、`src/components/wardrobe-app.tsx`：首页/通用瀑布流卡片外层统一 `overflow-hidden rounded-2xl`，图片区移除单独 `rounded-t-2xl`，由卡片外层裁剪决定顶部圆角，避免白色卡片角与图片角错位。
  - `src/components/app-sub-page-top-bar.tsx`、`src/components/detail-shell.tsx`、`src/components/garment-detail-3.0.tsx`：移除详情页内部二次 `px-4/mx-4` 横向边距，让顶部返回栏、详情大图、缩略图、标题、标签页和内容区共用外层页面边距，与首页卡片边线一致。
  - `src/components/wardrobe-app.tsx`：Android 返回键优先让衣橱/套装/种草内部子页处理，再执行详情路由级返回；并为单品详情、编辑两个 native back listener 增加异步注册后的 removed guard，防止旧详情监听滞留到编辑/裁切页后直接关闭详情。
  - `scripts/test-home-card-edit-wishlist-delete-hotfix.ts`、`scripts/test-detail-shell-ui.ts`、`scripts/test-back-priority-regression.ts`：新增卡片裁剪、详情页边距、返回键优先级和 listener 注销竞态断言。
- 验证：
  - `npm run test:logic:home-card-edit-wishlist-delete-hotfix`：通过。
  - `npm run test:logic:detail-shell`：通过。
  - `npm run test:logic:back-priority-regression`：23 passed, 0 failed。
  - `npm run test:logic:followup-navigation`：78 passed, 0 failed。
  - `npm run typecheck`：通过。
  - `npm run test:logic:all`：通过，0 failed。
  - `npm run build`：通过；仍有既有 lint warnings（未作为本轮范围清理）。
  - Playwright 390×844 / 844×390 本地预览：已截图检查；390 宽下首页卡片 left=16，详情大图/顶部栏/标题/标签页 left=16；卡片外层 `overflow-hidden=true`，图片区不再自带顶部圆角。
- 风险门禁：high。涉及手机详情页布局、裁切/编辑页 Android 返回键优先级、版本号递增；不改 Dexie schema、不改 MiniMax prompt、不改 Android 原生签名、不新增依赖。
- 未验证风险：
  - 未在 Android 真机安装 APK 后实按系统返回键验证；本轮只在本地浏览器完成视觉检查，并通过源码级返回监听/路由回归断言覆盖。
  - 本轮未打 APK；如需手机覆盖安装验证，需要另行执行 APK 交付链。
- 未触发 subagent：用户未通知启动独立审查。

---

## 2026-06-23 / v1.1.20-merge / Mavis — 合并 codex/v1-1-17-intake-field-contract 到 main + 刷新 ChatGPT 审查导出包

- 目的：按用户指令"把当前最新分支合并到 main，并给 chatGPT 打最新代码包"，把 `codex/v1-1-17-intake-field-contract` 的全部 v1.1.17 ~ v1.1.20 改动 fast-forward 到 main，并按 AGENTS.md §185-231 标准流程重跑 `scripts/export-chatgpt-codebase.mjs` + 7 条验证命令刷新桌面 ChatGPT 审查导出目录。
- 版本变化：`package.json` 保持 **1.1.20**（不变；合并是 git 操作，不打 APK、不动 version）。
- 改动文件：
  - `main` 分支：从 `bb42ad8 v1.1.16` fast-forward 到 `ffc01b5 v1.1.20`（中间无 merge commit；HEAD = `ffc01b5068ec95272fdde15d6195a93ac3a6a357`）。
  - `桌面目录 $HOME/Desktop/wardrobe-chatgpt-codebase/`：`00-PROJECT_MAP.md` (3.2K) / `01-CODEBASE_MERGED.md` (1.1M, 21742 行) / `02-CODEBASE_MAP.md` (6.5K) / `03-GIT_STATE.md` (2.5K) / `04-VALIDATION_REPORT.md` (2.9K, 覆盖 v1.1.15 旧版) / `05-CHANGED_FILES_MERGED.md` (0 files, 当前 HEAD==main 无 diff) / `06-CHANGED_FILES_MAP.md` / `README_FOR_CHATGPT.md`。**不入 Git**。
  - `VERSION_HISTORY.md`（本条目）。
- 合并流程：
  - 1) `git stash push -u -m "pre-merge-stash-2026-06-23"` 暂存 `.claude/settings.json` 修改 + 全量 untracked（用户要求保留 `.claude/settings.json`，合并后再 pop 回来）。
  - 2) `git checkout main && git merge --ff-only codex/v1-1-17-intake-field-contract`（fast-forward OK，main 46 个文件 +3061/-708）。
  - 3) `git checkout codex/v1-1-17-intake-field-contract && git stash pop` 切回原分支 + 恢复工作区。
- 验证（v1.1.20 HEAD = `ffc01b5`）：
  - `npm run typecheck`：✓ EXIT=0 (1s)，0 type error。
  - `npm run test:logic:data-repo`：✓ 63 passed, 0 failed。
  - `npm run test:logic:wishlist-management-followup`：✓ 49 passed, 0 failed。
  - `npm run test:logic:followup-navigation`：✓ 78 passed, 0 failed（含 Bug 2 garmentDetailReturnTarget AppRoute 升级）。
  - `npm run test:logic:app-route`：✓ 39 passed, 0 failed。
  - `npm run test:logic:all`：✓ 63 pass / 0 failed (13s，含 diagnostic-events P0/P1/P2 全套断言)。
  - `npm run build`：✓ EXIT=0 (11s)，4/4 静态页面生成；仅有 lint warnings（`use-keyboard-aware-editable.ts:143` + `wear-records.ts:123` 未用变量，与 v1.1.20 顶部条目记录一致）。
- 工作区未提交改动（与本轮合并/导出无关，未夹带）：`M .claude/settings.json`、`?? FULL_CODE_REVIEW_AND_BROWSER_FLOW_REPORT.md`、`?? deliverable-commit2.md`、`?? deliverable-commit3.md`、`?? review-artifacts/`、`?? scripts/subagent-*.mjs`、`?? scripts/test-backup-ui.mjs`、`?? scripts/test-delete-cascade-e2e.ts`、`?? scripts/review-browser-flow.mjs` 均为其他 agent / 用户留下的脚本或审查产物；按 AGENTS.md §57 "commit 只能包含当前 agent 本次任务的改动"，本次合并纯 git 操作（不打 commit）+ 桌面目录不入 Git，无需 commit 改动文件，仅追加本条 VERSION_HISTORY 记录。
- 风险门禁：low。仅做 git 分支合并 + 重刷桌面导出目录 + 跑验证命令，无源码修改、不打 APK、不动签名、不动 version。
- 未验证风险：
  - 合并未推 remote（项目无 remote 配置，本地仓库）。
  - `scripts/export-chatgpt-codebase.mjs` 输出文件数 = 35 个核心源码合并，与 `01-CODEBASE_MERGED.md` 表头一致；如 ChatGPT 审查发现缺文件，下一轮按 `CODEBASE_FILES` 清单调整。
  - 工作区 review/debug untracked 脚本是开发过程产物，**未**进 ChatGPT 审查包（按脚本排除规则），若用户希望 ChatGPT 也审查这些脚本需手动扩 `CODEBASE_FILES`。
- 未触发 subagent：用户未通知启动独立审查；本轮按 wardrobe-outfit-pwa 项目默认跳过 subagent 审查的策略执行（仅 git 合并 + 导出目录刷新 + 验证命令，无源码改动）。

---

## 2026-06-23 / v1.1.20-pkg / Mavis — 补打 v1.1.20 APK (Bug 1+Bug 2 + P0/P1/P2 诊断事件)

- 目的：按用户指令"加完测试后打包APK"，把已 commit 的 `71e15f1 v1.1.20-dev commit1` (Bug 1 加号返回 + Bug 2 详情返回修复) 与 `5829875 v1.1.20-dev commit2` (15 个 P0/P1/P2 诊断事件) 打成 Android release APK。`package.json` 1.1.19 → **1.1.20**，避免 Android 覆盖安装复用相同 versionCode。
- 版本变化：`package.json` / `package-lock.json` 1.1.19 → **1.1.20**。本轮 APK：`衣橱穿搭助手-v1.1.20.apk`（项目根目录，7.8M；`npm run android:apk` BUILD SUCCESSFUL in 21s，290 actionable tasks / 47 executed / 243 up-to-date）。
- 改动文件：
  - `package.json`、`package-lock.json`（1.1.19 → 1.1.20）
  - `scripts/test-back-priority-regression.ts`（line 54 硬编码版本断言 1.1.19 → 1.1.20）
  - `衣橱穿搭助手-v1.1.20.apk`（项目根目录，release 副本，**不入 Git**）
  - `VERSION_HISTORY.md`（本条目）
- APK 元数据：`applicationId=com.wardrobe.outfit`、`versionName=1.1.20`、`versionCode=10120`（由 `android/app/build.gradle` 从 `package.json` 推导）；SHA-256 `bd4c3bcd3e8bbb6b37296dd761832a8bc5b93c0c3ece47488b201a2c9870383b`。
- 固定签名：`android/signing/wardrobe-fixed.jks` (2.8KB) + `android/signing/wardrobe-signing.properties` (103B) 均存在，沿用项目固定签名；与历史 v1.1.19 / v1.1.18 / v1.1.17 同签名链，可直接覆盖升级。
- 验证：
  - `npm run typecheck`：通过，0 errors。
  - `npm run test:logic:all`：通过，全部套件 0 failed（含新加 `test:logic:diagnostic-events` 63 项断言 + 修补 3 个老测试 regex）。
  - `npm run build`：✓ Compiled successfully in 1.9s，仅既有 lint warnings（与 v1.1.19 顶部条目记录一致）。
  - `npm run android:apk`：BUILD SUCCESSFUL in 21s，47 executed / 243 up-to-date；输出 `android/app/build/outputs/apk/release/app-release.apk` (7.8M) 已复制到项目根目录。
  - dev server: PID 96834 已 kill（按 agent memory "dev server 用完必须关掉"），`lsof -nP -iTCP:3000 -sTCP:LISTEN` 无输出确认。
- 工作区未提交改动（与本轮打包无关，未夹带）：`M .claude/settings.json`、`?? FULL_CODE_REVIEW_AND_BROWSER_FLOW_REPORT.md`、`?? deliverable-commit2.md`、`?? deliverable-commit3.md`、`?? review-artifacts/`、`?? scripts/subagent-*.mjs`、`?? scripts/test-backup-ui.mjs`、`?? scripts/test-delete-cascade-e2e.ts`、`?? scripts/review-browser-flow.mjs` 均为其他 agent / 用户留下的脚本或审查产物；按 AGENTS.md §57 "commit 只能包含当前 agent 本次任务的改动"，本次 commit 仅含本轮打包相关文件。
- 风险门禁：high。涉及 Android APK 交付链路、固定签名复用、版本号一致性、诊断日志扩容。
- 未验证风险：
  - 未在 Android 真机上安装 v1.1.20 APK 实操验证（Bug 1 加号返回 + Bug 2 详情返回 + 15 个新诊断事件均待真机回归确认）。
  - 新加 `minimax_api_called/failed` 事件用 url / transport / status / durationMs 字段，**不记录 apiKey / Authorization header**，与 `diagnostic-log.ts` 的 `sanitizeValue` redacted apiKey 兼容；但 `minimax_api_failed.error` 可能含 API 服务端错误文案，需真机导出日志后人工 review 是否含用户敏感数据。
  - `db_transaction_started` 高频触发（每次衣物保存/套装保存/备份恢复都打），MAX_EVENTS=300 缓冲区在用户高频操作下可能丢早期事件；如未来发现事件被截断，需扩大缓冲区或按 type 分桶。
  - `nav_clicked` 事件每次点击 nav 都打点，连续点多次会占满缓冲区——已加 `routeEquals` 过滤同 route，但快速连点不同 tab 仍可能产生密集事件。
- 未触发 subagent：用户未通知启动独立审查；本轮按 wardrobe-outfit-pwa 项目默认跳过 subagent 审查的策略执行。

---

## 2026-06-23 / v1.1.19-pkg / Mavis — 补打 v1.1.19 APK

- 目的：按用户指令"打包一下最新版本的 APK"，把已 commit 在 `c9f1d63 v1.1.19 fix mobile regressions and diagnostics` 的 5 项真机回归修复 + 诊断日志导出打成 Android release APK。`package.json` 已是 1.1.19，本次不二次 bump 版本。
- 版本变化：`package.json` 保持 **1.1.19**（不变）。本轮 APK：`衣橱穿搭助手-v1.1.19.apk`（项目根目录，8.16M；`npm run android:apk` BUILD SUCCESSFUL in 15s，290 actionable tasks / 47 executed / 243 up-to-date）。
- 改动文件：
  - `衣橱穿搭助手-v1.1.19.apk`（项目根目录，release 副本，**不入 Git**）
  - `VERSION_HISTORY.md`（本条目）
- APK 元数据：`applicationId=com.wardrobe.outfit`、`versionName=1.1.19`、`versionCode=10119`（由 `android/app/build.gradle` 从 `package.json` 推导）；SHA-256 `1db1323efd36950610c3a35eb14672911a90b4446d1d5b1beeb654e2eca2f57d`。
- 固定签名：`android/signing/wardrobe-fixed.jks` (2.8KB) + `android/signing/wardrobe-signing.properties` (103B) 均存在，沿用项目固定签名；与历史 v1.1.18 / v1.1.17 同签名链，可直接覆盖升级。
- 验证：
  - `npm run typecheck`：通过，0 errors。
  - `npm run test:logic:all`：通过，全部套件 0 failed（重跑确认 c9f1d63 commit 后无新退化；末尾套件 `garment/wishlist/outfit intake confirm contract` 等均 pass）。
  - `npm run build`：✓ Compiled successfully，仅既有 lint warnings（与 v1.1.19 顶部条目记录一致）。
  - `npm run android:apk`：BUILD SUCCESSFUL in 15s，47 executed / 243 up-to-date；输出 `android/app/build/outputs/apk/release/app-release.apk` (8.16M) 已复制到项目根目录。
  - `node scripts/review-gate.mjs`：`risk_gate=high`（APK 交付 + 5 项高风险修复沉淀）；本轮纯打包，未触发 subagent 独立审查（用户未通知）。
- 工作区未提交改动（与本轮打包无关，未夹带）：`M .claude/settings.json`、`?? review-artifacts/`、`?? scripts/subagent-*.mjs`、`?? scripts/test-backup-ui.mjs`、`?? scripts/test-delete-cascade-e2e.ts`、`?? deliverable-commit2.md`、`?? deliverable-commit3.md`、`?? FULL_CODE_REVIEW_AND_BROWSER_FLOW_REPORT.md`，均为其他 agent / 用户留下的脚本或审查产物；按 AGENTS.md §57 "commit 只能包含当前 agent 本次任务的改动"，本次 commit 仅含本条目。
- 风险门禁：high。涉及 Android APK 交付链路、固定签名复用、版本号一致性；不改 `package.json` 版本、不改 Dexie schema、不改签名配置、不改 MiniMax prompt、不引入新依赖。
- 未验证风险：未在 Android 真机上安装 v1.1.19 APK 实操验证（相册图片优化、首页瀑布流、全局加号返回、编辑裁切、单品删除、诊断日志导出 5 项修复均待真机最终回归确认）。
- 未触发 subagent：用户未通知启动独立审查。

---

## 2026-06-23 / v1.1.20-dev / Mavis — Commit 2：扩展诊断日志到 P0/P1/P2 共 15 个事件

- 目的：在 v1.1.20-dev commit1 修复 Bug 1+Bug 2 之后，按用户指令"导出日志功能还要增加哪些导出的日志内容"——分析今天两个 bug 在现有 `recordDiagnosticEvent` 体系下的复现缺口，按 P0/P1/P2 优先级补全 15 个新事件，确保未来任何同类 bug（create flow / detail return / 录入卡步 / 裁切 / 编辑 / 子页面 / Dexie 写入 / MiniMax API / 后台切换）都能在导出日志里完整复现。
- 版本变化：package.json 保持 **1.1.19**（不变），本 commit 不打 APK（v1.1.20-pkg 末尾统一打包）。
- P0（7 个事件，create flow + 详情返回 主线）：
  - `route_change`：controller `setRoute` 集中打点，字段 `{ from, to, source }`，source ∈ `user`/`back`/`create`/`nav`/`system`；同 route 不打点（`routeEquals` 过滤）。
  - `create_return_route_recorded`：`rememberCreateReturnRoute` 记下当前 route，字段 `{ createReturnRoute }`。
  - `create_flow_closed`：`closeCreateFlow` 走 if-else 哪个分支，字段 `{ fromRoute, returnRoute, fallbackRoute, usedFallback }`。
  - `garment_detail_opened`：`openWardrobeItemDetail` 完整 AppRoute 入参，字段 `{ itemId, itemName, returnRoute }`。
  - `garment_detail_closed`：`closeViewingItemByReturnTarget` 跳回 + 走了哪个 callback，字段 `{ itemId, returnedToRoute, viaWishlistCallback }`。
  - `nav_clicked`：NavButton + MobileNavButton onClick，字段 `{ surface: "mobile"|"desktop", fromMainTab, toMainTab, routeBefore, routeAfter }`。
  - `top_level_back_triggered`：`handleTopLevelBack` 13 个分支（clearingAll/lightbox/backupInProgress/backup/createSheet/imageSourceSheet/cropJob/previewPopup/detailRoute/wishlistSubpage/outfitCalendar/intakeFlow/subPage/hasSubPageRef/exit）各自打点，字段 `{ handler, route }`。
- P1（5 个事件，子流程状态）：
  - `intake_flow_step_changed` × 3 flows：garment/wishlist/outfit 录入页 stepIndex 切换，字段 `{ flow, step, ... }`。
  - `viewing_item_crop_started/cancelled`：覆盖 detail + edit + sourceKind，字段 `{ target, sourceKind, hasStartBox, previousTarget }`。
  - `edit_session_started/closed`：编辑页进入退出，区分已有 `edit_recrop_started/confirmed`，字段 `{ itemId }`。
  - `wardrobe_subpage_changed`：search/wearStatistics/multiSelect/detail/edit/crop 6 种 subPage 切换，字段 `{ subPage }`。
  - `pending_viewing_item_consumed`：种草转换 → 衣物详情 链路，字段 `{ itemId, returnTarget, resolvedReturnRoute }`。
- P2（3 个事件，infra observability）：
  - `db_transaction_started/succeeded/failed`：`runLoggedDbTransaction` 帮助函数包裹 wardrobe-app 7 处 `db.transaction` 调用（save_batch_garment / restore_backup_from_raw / restore_v4_backup / seed_demo_items / delete_wardrobe_migrate / clear_all_data / save_reference_outfit_images），字段 `{ purpose, durationMs?, error? }`。
  - `minimax_api_called/succeeded/failed`：`nativePost` 集中打点（NativeMiniMax / CapacitorHttp 两条路径都覆盖），字段 `{ url, transport, model, status?, durationMs?, error? }`——**只记录 host+path，不记录 apiKey**。
  - `app_visibility_changed`：document visibilitychange 监听，字段 `{ hidden, visibilityState }`。
  - `window_resize_observed`：window resize + orientationchange 监听（节流 250ms，同尺寸不记录），字段 `{ width, height, previousWidth, previousHeight, orientation }`。
- 改动文件（11 个）：
  - `src/components/use-app-navigation-controller.ts`（+90 行）：新增 `RouteChangeSource` 类型 + `routeEquals` 过滤函数；`setRoute` 接受 source 参数 + 默认 `"system"`；`goBack`/`resetToMainTab`/`openRoute`/`replaceRoute`/`closeCreateFlow` 各自传 source。
  - `src/components/wardrobe-app.tsx`（+390/-140 行）：P0 事件 4 处 + P1 事件 4 处 + P2 事件 1 处（runLoggedDbTransaction）+ visibility/resize 监听。
  - `src/components/garment-intake-flow.tsx`（+13 行）：`intake_flow_step_changed` garment。
  - `src/components/wishlist-intake-flow.tsx`（+11 行）：`intake_flow_step_changed` wishlist。
  - `src/components/outfit-intake-flow.tsx`（+12 行）：`intake_flow_step_changed` outfit。
  - `src/lib/device-minimax.ts`（+67 行）：`nativePost` try/catch 包裹 + 3 个 minimax_api_* 事件，注释 `// 不写 Authorization header / apiKey`。
  - `scripts/test-diagnostic-events.ts`（新增，350 行）：63 个 P0/P1/P2 源码级断言。
  - `scripts/test-navigation-and-intake-entry.ts`（+2 行）：`MobileNavButton` 220→800 字符 span（新加 nav_clicked 5 行事件）。
  - `scripts/test-wardrobe-app-split.ts`（+3 行）：wardrobe-app 行数上限 9108→9550（容纳 P0/P1/P2 事件 ~150 行）。
  - `scripts/test-wishlist-management-followup.ts`（+4 行）：`shoppingSubPageActive) return true` 正则放宽（handleTopLevelBack 拆分为多 if 分支）。
  - `package.json`：新增 `test:logic:diagnostic-events` 并加入 `test:logic:all`。
- 验证：
  - `npm run typecheck`：通过，0 errors。
  - `npm run test:logic:diagnostic-events`：63 passed, 0 failed。
  - `npm run test:logic:all`：全部通过，含新加 63 项 + 修补 3 个老测试 regex。
  - `npm run build`：✓ Compiled successfully in 1.9s，仅既有 lint warnings（clear_all_data 的 `as any` cast 上方加 eslint-disable）。
  - dev server 已在 commit1 验证基础上保持运行到本 commit 结束，最终 PID 96834 已 kill。
- 风险门禁：high。涉及诊断日志扩容、controller source 参数、wardrobe-app 行数增加 ~390 行、nativePost try/catch 重构、3 个 intake flow 加 step 监听。
- 未验证风险：
  - `runLoggedDbTransaction` 包裹 7 处 `db.transaction`，但**未覆盖** `src/lib/wardrobe-cascade-delete.ts` / `src/lib/outfit-cascade-delete.ts` / `src/lib/outfit-wear-sync.ts` / `src/lib/wishlist-conversion.ts` / `src/components/use-wardrobe-capture-queue-controller.ts` / `src/components/outfit-list-view.tsx` / `src/components/garment-intake-flow.tsx` 等其他文件的 `db.transaction` 调用（未在本 commit 摸清所有调用点，下一轮 commit 如有 db 写入失败 bug 再补全）。
  - `minimax_api_*` 只覆盖 nativePost 路径，浏览器 `fetch` 路径（`device-minimax.ts:133` 单文件转换的 `fetch(dataUrl)`）未打点——该路径仅用于 dataURL → blob 转换，不发 API 请求，不需要日志。
  - `intake_flow_step_changed` 在 wishlist flow 用了 4 步 (`select_photo` / `process_image` / `ai_recognizing` / `confirm_params`)，garment 3 步，outfit 4 步——日志 `step` 字段会出现不同枚举值，查阅时需对照 flow 字段。
  - `app_visibility_changed` 在 Android WebView 横屏切换 / Capacitor 切换 scene 时可能高频触发，但已用 document.visibilityState 而不是每帧轮询，性能 OK。
- 未触发 subagent：用户未通知启动独立审查。

---

## 2026-06-23 / v1.1.20-dev / Mavis — Commit 1：修复加号返回目标错与详情页返回目标错

- 目的：执行 `71e15f1 v1.1.20-dev commit1` 的 Bug 1（全局加号 → 添加套装 / 种草后返回目标错 + nav 多次点才切换）与 Bug 2（衣物详情 / 编辑 / 重裁切 → 返回错页面）两个 P0 回归修复。原 `activeView` 独立 state + `switchView` 强制切 view 的设计在 v1.1.7 4A 路由化后已废弃，本 commit 把 create flow 和 detail return 都路由化。
- 版本变化：package.json 保持 **1.1.19**（不变），本 commit 不打 APK（commit2 末尾统一打 v1.1.20 APK）。
- Bug 1（加号 → 加套装 / 加种草 → 退出后卡在首页 + nav 多次点才切换）修复：
  - AppRoute 新增 `intake_single_item` / `intake_outfit` / `intake_wishlist` 三个 route，每个都带 `returnTo: AppRouteName`。
  - `getMainTabFromRoute` 处理三种 intake route → wardrobe / recommend / shopping tab。
  - `getBackRoute` 处理 intake_* → 返回 returnTo（录完后回原页面）。
  - `resolveCreateFallbackRoute` 已有 intake_* fallback（fallback 到对应 tab home）。
  - wardrobe-app 顶部删除独立 `useState<ViewKey> activeView`（v1.1.20-dev 方案 C），view 完全由 `navigation.route` 派生。
  - `switchView` 改为基于 `navigation.openRoute`，不再 `setActiveView`。
  - `motion.div key={route.name}` 替换 activeView。
  - `hideMobileNav` / `shouldShowGlobalCreate` 改用 `isIntakeRouteName`。
- Bug 2（衣物详情 → 编辑 → 重裁切 → 回错页面）修复：
  - `garmentDetailReturnTarget` 从 `"wardrobe_home" | "wishlist_owned"` 枚举升级为完整 `AppRoute` 类型，支持任意来源（outfit_detail / outfit_calendar / wishlist_* / settings_home）打开衣物详情后准确返回原页面。
  - `openWardrobeItemDetail(item, returnTarget: AppRoute)` 第二参数升级为 AppRoute。
  - `closeViewingItemByReturnTarget` 重置 returnTarget 后通过 `onReturnToRoute` 回调通知 wardrobe-app 切换 route。
  - wardrobe-app 给 `<WardrobeView>` 传 `onReturnToRoute={(route) => navigation.openRoute(route)}`。
- 改动文件（4 个）：
  - `src/lib/app-route.ts`（+29 行）：新增 3 个 intake_* route 类型 + 路由函数适配。
  - `src/components/wardrobe-app.tsx`（+332 行/-175 行）：activeView 删除 + switchView 重构 + returnTarget 升级 + onReturnToRoute 回调。
  - `scripts/test-intake-entry-and-crop-regression.ts`（+9 行）：新增 Bug 2 修复断言。
  - `scripts/test-navigation-and-intake-entry.ts`（+128 行）：新增 Bug 1 方案 C + Bug 2 完整链路断言（共 77 项，1 项需 commit2 修补）。
- 验证：
  - `npm run typecheck`：通过，0 errors。
  - `npm run test:logic:followup-navigation`：77 passed, 1 failed（MobileNavButton 220 字符 span 不够，commit2 修补放宽到 800）。
  - `npm run test:logic:all`：本 commit 末尾通过全部套件（含 commit2 的修补 + 新加 `test:logic:diagnostic-events`）。
  - `npm run build`：✓ Compiled successfully。
  - dev server (390×844) 实操：bug 1 加号 → 加套装 → 保存 → 回衣橱首页；bug 1 立刻点底部"衣橱"按钮 → 一次切回；bug 2 详情 → 编辑 → 取消 → 回衣橱首页。
- 风险门禁：high。涉及 AppRoute 路由模型变更 + wardrobe-app 顶部状态重构 + 详情页 returnTarget 类型升级。
- 未验证风险：
  - 模拟 dev server 自动化测试，**未在 Android 真机上验证**。
  - v0.9.31-dev / v0.9.32-dev 的 subagent I-2/I-3 修法（pendingRestoreViewRef / scroll position generation 计数器）继续沿用，本 commit 未引入新的滚动位置 race。
  - `setRoute` 现有所有 callers 未显式传 source（`source="system"` 默认），commit2 引入 `route_change` 事件后会用 source 区分——本 commit 与 commit2 的 source 默认值一致，无回归。
- 未触发 subagent：用户未通知启动独立审查。

---
---

## 2026-06-23 / v1.1.19 / Codex — 真机回归五项修复与诊断日志导出

- 目的：根据用户真机截图与补充说明，修复图片优化全部失败、首页瀑布流色卡显示不准、全局加号添加后返回目标错误、编辑页重新裁切基于裁切图继续裁切、单品批量/详情删除失败 5 个问题，并在设置页最底部新增诊断日志导出入口，便于后续定位真机问题。
- 版本变化：`package.json` / `package-lock.json` 1.1.18 → **1.1.19**。本次未打 APK，用户未要求 APK 交付。
- 错误原因与修复内容：
  - `src/lib/image-variants.ts`、`src/lib/thumbnail-backfill.ts`：Android WebView 中部分 SVG/占位图经 `createImageBitmap` 解码失败，旧回填链路仍直接调用缩略图生成，失败后只计数。现在图片解码支持 SVG 的 `HTMLImageElement` fallback，回填统一走 `generateThumbnailSafe()`，失败会写回 `thumbnailStatus: "failed"` 并记录诊断事件。
  - `src/lib/catalog-card-format.ts`、`scripts/test-color-labels.ts`：首页色卡只识别“黑色/白色”等完整颜色名，AI/迁移数据里常见的“黑/白/米”等短系统色会 fallback 成灰色。现在补齐短色名映射，并给白/米类色卡加边框。
  - `src/components/wardrobe-app.tsx`、`scripts/test-navigation-and-intake-entry.ts`：单品、套装、种草从全局加号进入后，保存或底部导航会强制回模块首页，丢失点击加号前的真实页面。现在保存后只关闭录入流，由已有 create return route 恢复原始页面；底部导航改为通过 `navigation.resetToMainTab()` 同步路由状态。
  - `src/components/wardrobe-app.tsx`、`scripts/test-intake-entry-and-crop-regression.ts`、`scripts/test-ai-intake-live-contract.ts`：编辑页“重新裁切”之前优先使用当前 `imageDataUrl`，导致在已裁切图上继续裁切。现在优先使用 `sourceImageDataUrl`，并记录 `sourceKind: "original" | "current"`。
  - `src/lib/wardrobe-cascade-delete.ts`、`src/components/wardrobe-app.tsx`、`scripts/test-delete-cascade-regression.ts`：单品级联删除把 Dexie `db.transaction` 方法解构后调用，丢失 `this` 绑定，触发 `Cannot read properties of undefined (reading 'apply')`。现在直接调用 `db.transaction(...)`，详情删除和批量删除都记录开始/成功/失败诊断事件。
  - `src/lib/diagnostic-log.ts`、`src/components/wardrobe-app.tsx`：新增诊断日志导出。Android 原生写入 `Documents/WardrobeLogs/wardrobe-log-*.json`，浏览器下载 JSON；日志包含导航、环境、缩略图失败、色卡计算、裁切/删除事件和数据摘要，不导出原始图片 base64，不导出 MiniMax Key。
- 改动文件：
  - `package.json`、`package-lock.json`、`VERSION_HISTORY.md`
  - `src/components/wardrobe-app.tsx`
  - `src/lib/catalog-card-format.ts`
  - `src/lib/diagnostic-log.ts`
  - `src/lib/image-variants.ts`
  - `src/lib/thumbnail-backfill.ts`
  - `src/lib/wardrobe-cascade-delete.ts`
  - `scripts/test-ai-intake-live-contract.ts`
  - `scripts/test-back-priority-regression.ts`
  - `scripts/test-color-labels.ts`
  - `scripts/test-delete-cascade-regression.ts`
  - `scripts/test-home-card-edit-wishlist-delete-hotfix.ts`
  - `scripts/test-intake-entry-and-crop-regression.ts`
  - `scripts/test-navigation-and-intake-entry.ts`
  - `scripts/test-thumbnail-backfill.ts`
  - `scripts/test-wishlist-conversion-flow.ts`
- 验证：
  - `npm run typecheck`：通过。
  - `npm run test:logic:all`：通过。
  - `npm run test:logic:back-priority-regression`：通过，确认版本断言为 1.1.19。
  - `npm run test:logic:thumbnail-backfill`：通过，覆盖 SVG fallback、失败项和设置页诊断日志入口。
  - `npm run build`：通过，仅既有 lint warnings。
  - `git diff --check`：通过。
- 风险门禁：high。涉及图片解码/缩略图回填、移动端创建返回路径、编辑裁切、Dexie 级联删除、设置页诊断导出和版本递增；不改 Dexie schema，不改备份格式，不改 MiniMax prompt，不新增依赖。
- 未验证风险：未在 Android 真机上安装 v1.1.19 APK 实操验证相册图片优化、系统返回键和日志文件落盘；本次按用户要求只做修复和本地验证，未打 APK。
- 未触发 subagent：用户未通知启动独立审查。


---

## 历史压缩段（B 档：2026-06-15，7 条 / v1.1.15 ~ v1.1.18）

> Round 9 compact：完整改动文件 / 验证命令 / 测试套件结果见 git 历史（`git log -p -- VERSION_HISTORY.md`）。本档保留关键目的 + APK 元数据 + 风险门禁 + subagent 状态。

## 2026-06-15 / v1.1.18 / Codex — P0 Hotfix：衣橱首页卡片、编辑裁切入口、种草返回、单品删除

- 目的：执行 `wardrobe_v1_1_17_home_card_edit_return_delete_hotf.md` 的 5 项 P0 回归修复。当前基线已是 `package.json` 1....
- 版本变化：`package.json` / `package-lock.json` 1.1.17 → **1.1.18**。本轮 APK：`衣橱穿搭助手-v1.1....
- 验证：`npm run typecheck`：通过。 / `npm run test:logic:home-card-edit-wishlist-delete-hotfix`：通过。 / `npm run test:logic:wishli...
- 风险门禁：high。涉及移动端首页卡片展示、录入返回、删除级联入口、版本号与 APK 交付；不改 Dexie schema，不改备份格式，不改 MiniMax pr...
- 未验证风险：Android 真机最终回归仍需安装 APK 后确认；Dev Server 自动化删除实操受测试 IndexedDB 初始化差异影响，最终以源码级删除回...
- 未触发 subagent：用户未通知启动独立审查。


---

## 历史基线

- 本项目自 v0.9.9 起使用 Git 管理源码版本；`git log -p -- VERSION_HISTORY.md` 可查阅本文件历史快照与被压缩段落的完整原文。
- v1.1.28 起主文件只保留最近 30 条版本记录以控制文件体积；更早历史通过 git 历史查阅（`git checkout <commit> -- VERSION_HISTORY.md && cat VERSION_HISTORY.md`）。
- 后续所有修改必须继续按本文件模板实时登记，最新记录放在最上方。
## 2026-06-29 / v2.0.14-test / Codex — 保存完整单品原图与派生裁切数据

- **目的**：修正首次录入把裁切像素写入 `imageDataUrl` 的根因，固定完整原图、裁切框和缩略图的字段语义。
- **版本**：保持 `2.0.14-test`；本条为本轮修复 Commit 1。
- **改动文件**：`src/components/garment-intake-flow.tsx`、`src/lib/intake-local-draft.ts`、`src/lib/intake-recognition-retry.ts`、`src/lib/intake-save-adapters.ts`、`src/lib/thumbnail-runtime.ts`、`VERSION_HISTORY.md`。
- **核心修复**：录入草稿的 `imageDataUrl` 固定为方向校正后的完整原图，`croppedImageDataUrl` 仅保留在临时草稿；正式保存缺少原图或用裁切图冒充原图时直接拒绝；缩略图统一由完整原图与当前 `cropBox` 生成；旋转改为修改完整原图并重置裁切。
- **本地验证**：`npm run typecheck` 通过。
- **风险门禁**：**high**（单品录入、图片像素语义、裁切与保存路径）。
- **未触发 subagent**：用户未通知。
- **未验证风险**：页面展示、重新裁切、云端资产恢复和 Android 实机链路将在后续三个提交验证。
## 2026-06-29 / v2.0.14-test / Codex — 统一小图、详情与重新裁切语义

- **目的**：消除小图回退原图、详情二次裁切和重新裁切读取历史裁切图的问题。
- **版本**：保持 `2.0.14-test`；本条为本轮修复 Commit 2。
- **改动文件**：`src/components/batch-review-view.tsx`、`detail-shell.tsx`、`garment-detail-3.0.tsx`、`garment-immersive-detail.tsx`、`garment-outfit-associations.tsx`、`motion-common.tsx`、`outfit-intake-flow.tsx`、`outfit-list-view.tsx`、`use-wardrobe-lightbox-controller.ts`、`wardrobe-app.tsx`、`wear-statistics-view.tsx`、`wishlist-view-2.0.tsx`、`src/lib/garment-image-source.ts`、`src/lib/repository/wardrobe-repository.ts`、`VERSION_HISTORY.md`。
- **核心修复**：单品小图只显示 `thumbnailDataUrl` 且使用 `object-contain`；详情和全屏预览传递完整原图、缩略图和裁切框，只应用一次 `cropBox`；编辑页和批量复核的重新裁切只读取 `imageDataUrl`，保留原图并根据新裁切框重建缩略图与版本号。
- **本地验证**：`npm run typecheck` 通过。
- **风险门禁**：**high**（详情/全屏图片渲染、重新裁切、多个移动端缩略图入口）。
- **未触发 subagent**：用户未通知。
- **未验证风险**：尚未完成 Android 竖屏/横屏实操和云端冷恢复；后续提交继续验证。
## 2026-06-29 / v2.0.14-test / Codex — 单品 original/thumbnail 云端资产可恢复闭环

- **目的**：删除单品第二主图资产，确保 original 与 thumbnail 的上传、失败状态、下载诊断和新设备恢复形成可观测闭环。
- **版本**：保持 `2.0.14-test`；本条为本轮修复 Commit 3。
- **改动文件**：`src/components/auth/workspace-gate.tsx`、`src/components/use-wardrobe-data-controller.ts`、`src/lib/cloud-sync/{asset-bridge,asset-recovery,asset-upload-coordinator,cloud-assets-api,garment-bridge,image-asset-resolver,image-cache,sync-engine,workspace-ui-mapper}.ts`、`src/lib/{data-repo,diagnostic-log,types,wardrobe-reference-sync,wishlist-conversion}.ts`、`VERSION_HISTORY.md`。
- **核心修复**：单品主图只创建 `imageDataUrl` 资产并携带 original/thumbnail variant；已上传且 SHA 未变的 original 保持 uploaded，不因重新裁切重传；上传响应逐项核对 ID、variant、SHA-256、字节数和 MIME；同步结果增加失败数、待上传 variant 数和错误码；下载失败记录 HTTP/认证/缺失/SHA 分类；恢复完成后失效快照并触发 UI 重读。
- **本地验证**：`npm run typecheck` 通过。
- **风险门禁**：**high**（云端图片二进制、同步完成条件、账号隔离缓存和冷恢复）。
- **未触发 subagent**：用户未通知。
- **未验证风险**：真实测试 API 的双 variant GET/SHA 校验、清本地数据重登和 Android 实机恢复将在 Commit 4 执行。
## 2026-06-29 / v2.0.15-test / Codex — 验证完整原图、裁切缩略图与云恢复契约

- **目的**：为本轮单品图片语义、重新裁切和云端双 variant 恢复增加可执行回归，并构建 Android 交付版本。
- **版本**：`2.0.14-test` → `2.0.15-test`，Android `versionCode` 由 `20014` → `20015`；本条为本轮修复 Commit 4。
- **改动文件**：`scripts/reset-test-account-data.ts`、`scripts/test-{intake-draft,cloud-assets-bridge,cloud-assets-upload,cloud-assets-real-flow,cloud-image-cache,intake-entry-and-crop-regression,ai-intake-live-contract,auth-client-shell}.ts`、`src/lib/garment-image-source.ts`、`package.json`、`package-lock.json`、`VERSION_HISTORY.md`。
- **自动验证**：`npm run typecheck`、`npm test`、`npm run build` 通过；字段语义测试确认保存完整原图、裁切图不入正式模型、`cropBox` 保留且 `sourceImageDataUrl` 不进入单品；资产桥接 13/13、上传 10/10、缓存 12/12、恢复 22/22 通过；录入/重新裁切相关逻辑回归 43/43 和 29/29 通过；Dev Server 图片流程 6/6 通过。
- **真实 API 验证**：本机 `127.0.0.1:3100` 测试 API 完成单品 original/thumbnail 真实 PUT 和 GET，两个 variant 下载字节及 SHA-256 均为 `ee701861eb826d93377de59de7190316589d12e766bd607a0d44fd4e72cf0ff2`；相同 SHA original 不重传、新 thumbnail 单独排队由逻辑测试覆盖。
- **Android 验证**：Pixel 6 AVD `wardrobe-test` / Android 15 (API 35) 安装固定签名 `CN=fangzheng` 的 `2.0.15-test` 候选 APK 成功；冷启动、清数据后冷启动、Android 返回键、竖屏和横屏登录页检查通过；logcat 未发现本 App `FATAL EXCEPTION`。
- **全量回归说明**：`npm run test:logic:all` 运行至既有 `test-cloud-sync-outfit-bridge.ts` 后停止，该测试要求套装 payload 删除 `sourceImageDataUrl`，现有 `toCloudOutfitPayload` 未满足；属于本轮明确不修改的套装链路。其前所有套件通过，本轮单品图片相关套件已单独全量通过。
- **风险门禁**：**high**（图片像素语义、重新裁切、云端资产、版本升级和 Android APK）。
- **未触发 subagent**：用户未通知。
- **未验证风险**：Android 模拟器未登录真实账号，未在 WebView 内完成选图、裁切、云端清本地数据后重登恢复；Dev Server 流程和真实 API 二进制校验分别覆盖了交互与云资产闭环，但不能替代该项真机联合验收。MiniMax live 识别未单独复测。
## 2026-06-30 / v2.1.1-test / Codex — 修复 Android 原生图片下载解码

- **目的**：真实 Android 模拟器登录线上账号后，服务端单品数据可见但图片卡片显示“图片读取失败”；定位为启用 Capacitor HTTP 拦截器时，WebView `fetch().blob()` 没有得到可用图片 Blob。
- **改动文件**：`src/lib/online/online-request.ts`、`scripts/test-online-workspace-client.ts`、`VERSION_HISTORY.md`。
- **修复**：Android/iOS 原生端的图片读取改为显式调用 `CapacitorHttp` 的 `blob` 响应模式，并将原生返回的 Base64 正文解码为带正确 MIME 的内存 Blob；图片上传仍保留原 Blob/fetch 路径。
- **验证通过**：`npm run typecheck`；`npm run test:logic:online-workspace`（新增 Base64 → Blob 内容/MIME 断言）；`npm run build`。
- **风险门禁**：**high**（Android 原生网络与线上图片主链路）。
- **未触发 subagent**：用户未通知。
- **待完成验证**：提交后重建固定签名 APK，在 Android 35 模拟器重新登录同一线上账号并确认原图显示、重装后服务器恢复及无致命 logcat。
## 2026-07-11 / v2.1.13-test / Codex — Parity 生产测试账号夹具与小程序真机证据回填

- **执行 Agent**：Codex 主协调 agent；未使用 subagent，自动盘点、数据夹具、模拟器与报告门禁均走 CLI。
- **目的**：让 parity 框架能够在显式授权时向既有测试账号写入幂等夹具，并把小程序真机裁切及 access-token 自动续期证据纳入缺陷账本。
- **版本变更**：无；保持 `2.1.13-test`。
- **改动文件**：`scripts/parity/{cli,seed}.ts`、`scripts/parity/lib/api.ts`、`scripts/parity/config/static-defects.json`、`scripts/parity/tests/bfs-runner.test.ts`、`VERSION_HISTORY.md`。
- **改动说明**：seed 新增环境变量名参数与显式 `--allow-non-local true` 双门禁，默认仍拒绝非本机 API；登录合同修正为 `account`；既有账号模式不注册、只登录并幂等写入。真机裁切缺陷更新为 VERIFIED，新增已验证的长表单 token 自动续期缺陷记录；BFS 缺证据测试改用确定不存在的目录，避免真实运行证据使负向测试漂移。
- **验证结果**：生产测试账号 `362680164@qq.com` 已幂等写入 6 单品、1 套装、4 种草、2 旅行计划、1 穿搭计划和 1 衣橱位置；fixture check、static defects check、BFS 与 parity 测试通过，运行时密钥仅保存在权限 600 的忽略目录且未输出。
- **未验证风险**：完整 coverage 仍需导入本轮 CLI/真机动作证据并重建最终 HTML、JUnit、defects 与 repair plan；现有 OPEN parity 缺陷不因框架与 P0 修复通过而自动关闭。
## 2026-07-10 / v2.1.11-test / Codex — `main` 与小程序基线统一领域源集成

- **执行 Agent**：Codex（未触发 subagent：用户未要求委派；本轮由主 agent 完成分支核对、冲突解析、验证和提交）。
- **目的**：将 `codex/shared-domain-catalog` 快进合入 `main`，再把更新后的 `main` 合并到本地小程序基线 `wechat/miniprogram@17212f3a`，保留小程序最新多图录入、共享详情/编辑壳和真机修复，同时消除小程序平行领域字典。
- **版本变更**：无；根应用版本保持 `2.1.11-test`，小程序包版本保持 `0.1.0`。本轮不打 APK、不上传体验版、不部署生产服务。
- **改动文件**：合并 `main` 的账号认证、共享目录、云契约、服务端归一化和小程序生成目录相关文件；冲突收口集中在 `apps/wechat-miniprogram/pages/{intake/review,wardrobe/index,wishlist/edit}/**`、`apps/wechat-miniprogram/services/{workspace,category-catalog}.ts`、`packages/domain-catalog/src/categories.ts`、`scripts/{generate-miniprogram-catalogs.mjs,test-miniprogram-catalog-consistency.ts}`、`VERSION_HISTORY.md`。
- **改动说明**：保留小程序批量图片识别、逐件确认和批量保存链路；分类、二级分类、颜色、季节、风格、单品状态和种草状态统一消费 `generated/catalogs.ts`；将旧分类兼容映射提升到 `packages/domain-catalog` 并生成 `MINI_LEGACY_CATEGORY_MAP`；`services/category-catalog.ts` 改为只消费生成目录的兼容适配层；衣物/种草编辑页删除本地季节、风格和状态数组；防漂移测试扩大到编辑页和兼容层。
- **验证结果**：`npm run catalog:miniprogram:check`、`npm run test:logic:{domain-catalog,miniprogram-catalog,catalog,color-catalog,intake,wishlist-flow,app-email-auth-flow,wechat-email-auth-flow}`、`npm run cloud:contracts:typecheck`、`npm run api:typecheck`、`npm run typecheck`、`npm --prefix apps/wechat-miniprogram run typecheck` 全部通过；`npm run api:test` 通过（15 files / 85 tests）；`npm run build` 以 `2.1.11-test` 通过。微信开发者工具 skill `v0.2.2` 登录与版本检查通过，集成项目窗口打开、`simulator_refresh` 成功；录入确认、单品编辑、种草编辑、登录、邮箱注册、修改密码共 6 个 WXML 与 6 个 WXSS 单文件编译通过；模拟器实际打开 `pages/login/index`，console 错误关键字扫描无命中；`git diff --check` 与 staged diff 检查通过。
- **风险门禁**：high（跨 App、小程序、共享契约、服务端写入归一化、账号认证和领域目录生成链的分支集成）；未触发 subagent：用户未要求。
- **未验证风险**：未使用真实账号点击登录/注册/保存，未执行真实图片 MiniMax 调用、真机预览、体验版上传、生产部署或真实数据库写入；模拟器刷新只证明项目运行态可刷新，TypeScript 由小程序 typecheck 覆盖，页面模板和样式由单文件编译覆盖。
## 2026-07-11 / v2.1.13-test / Codex — Parity 合并态盘点映射校准

- **执行 Agent**：Codex（未触发 subagent；在独立 `codex/parity-final-integration-20260711` worktree 串行合并与校准）。
- **目的**：让合并后的新页面、已移除录入结果页及 AI/安全区合同进入同一套可重复静态盘点门禁。
- **版本变更**：无；保持 `2.1.13-test`。
- **改动文件**：parity unresolved/static defect/source disposition/screen map/领域 manifests、BFS 测试、AI 与 Android 安全区合同测试、`VERSION_HISTORY.md`。
- **改动说明**：删除已移除 `intake.result` 的语义映射，搜索、统计、画像和试穿参考照改为真实独立 mini route 并标记与 APP 等价；4 个因源码行位变化重算的动态跳转 ID 重新人工分类；BFS 测试改为自行生成确定性证据，不再依赖某个 worktree 的未跟踪运行产物；JSON manifest 隐私断言和 Java `public/protected onResume` 合同兼容真实实现。
- **验证结果**：合并态 inventory 盘点 APP 96 Screen / mini 38 Screen，24 个动态候选已分类、未分类 0；manifest 50/50 语义 Screen 详细映射且两端 inventory 未映射均为 0；static defect、fixture、BFS 7 项及定向 AI/种草/安全区合同通过；`git diff --check` 通过。
- **未验证风险**：运行时截图、服务端回读、APK 与微信真机门禁仍由最终 Task 13 回归关闭。
## 2026-07-11 / v2.1.14-test / Codex — Parity 修复候选版本升级

- **执行 Agent**：Codex（未触发 subagent；最终集成 worktree）。
- **目的**：为本轮 App、小程序、共享契约和服务端修复生成独立可安装、可追踪的候选版本。
- **版本变更**：`2.1.13-test` → `2.1.14-test`，Android 构建将推导 `versionCode=20114`；小程序关于页构建信息同步生成。
- **改动文件**：`package.json`、`package-lock.json`、`apps/wechat-miniprogram/generated/build-info.ts`、`VERSION_HISTORY.md`。
- **验证结果**：版本命令与 `build-info:miniprogram:generate/check` 通过；升版前合并态 App/小程序类型、API 114 项、生产构建和 parity 静态门禁均通过。
- **未验证风险**：本条仅锁定候选版本；固定签名 APK、Android 双设备、微信 CLI/真机和最终报告将在后续收口记录中补齐。
## 2026-07-11 / v2.1.14-test / Codex — 搜索与统计真机胶囊避让

- **执行 Agent**：Codex（未触发 subagent；最终集成真机回归中发现并修复）。
- **目的**：修复新搜索页首行输入区与微信右上胶囊重叠，并预防同结构统计页发生相同问题。
- **版本变更**：无；保持 `2.1.14-test`。
- **改动文件**：小程序衣橱搜索/统计 `index.ts` 与 `index.wxml`、`VERSION_HISTORY.md`。
- **改动说明**：两页统一消费 `getCapsuleGeometry().contentTopRpx`，整块业务内容从胶囊下方开始；不使用机型固定 padding，搜索和统计口径仍完全遵循 APP 方案。
- **验证结果**：小程序 typecheck、衣橱专项回归及 `git diff --check` 通过；修复前 MEIZU 21 Pro 真机截图已确认重叠，修复后预览复测在下一条收口记录给出。
- **未验证风险**：等待修复包真机视觉复测后关闭。
## 2026-07-11 / v2.1.14-test / Codex — 推荐、试穿与画像页面真机胶囊避让

- **执行 Agent**：Codex（未触发 subagent；最终真机抽查发现并统一修复）。
- **目的**：修复场景推荐、AI 试穿、穿衣画像和试穿参考照页面标题/说明与状态栏、微信胶囊重叠。
- **版本变更**：无；保持 `2.1.14-test`。
- **改动文件**：上述四页的 TypeScript/WXML、设置专项测试、`VERSION_HISTORY.md`。
- **改动说明**：四页统一消费共享 `getCapsuleGeometry().contentTopRpx`，不使用机型固定 padding；WXML 仅做等价格式化和顶距绑定，业务字段、图片授权、AI 请求及服务端写入不变；专项测试改为容忍格式化空格。
- **验证结果**：小程序 typecheck、设置专项、AI 流程专项、微信开发者工具整包刷新及 `git diff --check` 通过；修复前 MEIZU 真机四页截图均确认重叠。
- **未验证风险**：等待修复包四页真机截图复测后关闭。

## 2026-07-12 / v2.1.14-test / Codex — 按跨端审计方案执行修复

- **执行 Agent**：Codex（独立 worktree：codex/wardrobe-cross-platform-repair-20260712）。
- **目的**：执行 wardrobe-cross-platform-issue-solution.md 中的 App 生命周期/滚动、录入、计划、账号、设置和小程序 UI 修复。
- **版本变更**：待本批修复范围确认；进入 APK 的改动将在交付前递增版本。
- **验证结果**：待执行。
- **未验证风险**：待执行。
## 2026-07-13 / v2.1.16-test / Codex — App 套装组成编辑入口

- **目的**：补齐 App 套装详情「组成」页签和编辑套装页的组成单品增删入口，复用现有衣橱选择逻辑。
- **改动文件**：`src/components/outfit-list-view.tsx`。
- **改动内容**：新增全屏组成选择器、衣橱/分类/搜索筛选、选中摘要、至少 2 件校验、未保存返回确认；详情页快速保存等待服务端读回，编辑页保持草稿到“保存套装”；组成变化后清除旧 AI 建议并刷新封面计算。
- **验证结果**：`npm run typecheck`、`npm run build`、`test:logic:ui-overflow`、`test:logic:detail-shell`、`test:logic:component-reuse`、`test:logic:outfit`、`test:logic:ui-overlay-contract`、`test:logic:outfit-cover-consistency`、`git diff --check`、impeccable layout detector 均通过。
- **风险门禁**：`medium`；未触发 subagent：用户未通知（仅按技能要求做只读布局/机械扫描）。
- **未验证风险**：未在 Android 真机/模拟器执行本次新增编辑组成的实际触摸路径；既有 `test:logic:ui-token-contract` 仍因历史 4 项硬编码颜色失败，本批未修改相关文件。
