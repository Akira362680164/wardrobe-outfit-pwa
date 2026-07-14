# 衣橱 App 动效全面审查与改良方案

审查日期：2026-07-13
审查基线：`main` / `aff43975` / `2.1.18-test`
审查范围：App 主端（不含微信小程序）、手机竖屏、现有信息架构与业务流程
审查方法：源码动效盘点 + 390×844 本地隔离数据走查 + 浮层/返回键现场复现 + Apple 式直接操控、连续性、可中断性与无障碍原则评估

方案细化日期：2026-07-13
细化内容：补充页面级修复总览、13 组页面/流程修复规格、共用组件依赖、10 个可拆分开发任务和逐页验收条件

## 结论先行

当前 App **不是缺少动效**，而是已经有一套不错的基础设施，却缺少统一的“运动语义”和“顶层交互仲裁”。`MotionConfig`、reduced-motion、防滚动穿透、指针捕获等基础已经存在；真正拉低质感与可靠性的，是下面四类系统问题：

1. **浮层和返回键没有唯一的顶层所有者。** 现场复现了“关闭新建 Sheet 的同一次 Escape 又打开退出确认”，属于 P0 行为错误，而不只是视觉问题。
2. **拖拽表面不是 1:1 跟手。** 图片轮播每次 pointermove 都走 React state；周/月历只跟手约 10% 后切换成固定 28/32px 的替换动画，手指与内容之间缺乏连续关系。
3. **所有导航共用同一套淡入上移。** Tab、详情 push、返回 pop 没有空间方向差异，用户难以从运动判断层级关系。
4. **动效参数按组件历史叠加，而非按意图统一。** 普通按钮、Toast、导航和大面积面板混用偏弹的 spring；Sheet 又是固定时长 tween，整体“有动画但不像同一个产品”。

建议按四批落地，先修行为正确性，再修高频手势，最后做空间连续性与性能精修。**不建议先做全局参数换皮，也不建议增加更多动画。**

## 现场证据与步骤健康度

### 1. 衣橱首页：基本健康

![衣橱首页](./02-wardrobe-grid.png)

- 视觉层级、卡片密度和主操作位置稳定，适合保留现有结构。
- 触摸反馈不统一：源码中约有 375 个原生 `button`，只有 5 个 `motion.button`，另有约 35 处各自定义的 `active:scale-*`，按压幅度从轻微到明显不等。
- 改良重点不是增加卡片入场，而是统一同帧按压反馈、避免列表大批量 stagger。

健康度：**基本健康，需统一微反馈。**

### 2. 全局新建 Sheet：需要改进

![全局新建 Sheet](./03-global-create-sheet.png)

- Sheet 视觉结构清楚，已有 backdrop、滚动锁定、焦点循环与 Escape 支持。
- 当前只从底部固定移动 24px、固定 0.32s；没有抓手、拖拽关闭、速度继承、投影或可中断弹簧。
- `MotionSheet` 的 `ariaLabel` 是可选参数，23 个调用中多数未提供可访问名称；本次 DOM 快照中的“新建”弹层确实只暴露为无名称 `dialog`。

健康度：**需要改进。**

### 3. 返回键与浮层栈：严重问题（P0）

![返回键叠层问题](./04-stacked-back-dialogs.png)

- 现场操作：打开“新建” Sheet → 按 Escape。
- 结果：Sheet 自己的 document 监听先关闭 Sheet，顶层 `WardrobeApp` 的 Escape/Back 监听在同一事件中继续执行，又打开“是否退出应用”确认。
- 源码同时存在顶层 back listener 和多个子页面 `useStableBackHandler` listener；`return true` 只结束自己的回调，不能阻止其他 Capacitor listener 接着执行。
- 这是动效系统必须先解决的基础：如果没有唯一浮层/返回栈，任何拖拽关闭、退出动画、焦点恢复都会出现竞态。

健康度：**严重，P0。**

### 4. 单品卡片 → 详情：需要改进

![单品详情](./05-garment-detail.png)

- 详情信息和 hero 图结构稳定，适合保留。
- 当前所有路由统一使用 `opacity + y: 6px`，且 `AnimatePresence mode="wait"`；从卡片进入详情时没有源对象连续性，返回也没有相反方向。
- 路由容器永久带 `transform-gpu`，会创建 containing block；仓库历史注释已经记录它会干扰内部 `position: fixed`。

健康度：**需要改进。**

### 5. 图片 Lightbox：严重问题（P0/P1）

- 现场打开 hero 原图后，DOM 中背景页面仍完整暴露，Lightbox 本身没有 `role="dialog"`、`aria-modal`、可访问名称、焦点圈定或独立 Escape 处理。
- 动画从屏幕中心 `scale: 0.92` 放大，既没有从被点图片的位置展开，也没有拖拽关闭、缩放/平移或边缘回弹。
- 这里应先完成 modal 语义与顶层栈接入，再做 source-anchor 连续过渡。

健康度：**严重。**

### 6. 套装周计划：需要改进

![套装周计划](./06-outfit-weekly.png)

- 页面结构和当天计划卡清晰。
- 横拖时 `dragElastic=0.12`，内容只移动手指距离的一小部分；松手后旧周退场、新周从固定 28px 进入，并使用 `mode="wait"`，不是连续的三页轨道。
- 周视图设置 `touch-none`，会吞掉从周条区域开始的竖向滚动手势；月历却使用 `touch-pan-y`，相同交互在两个表面行为不一致。

健康度：**需要改进，手势优先级高。**

### 7. 穿搭月历：需要改进

![穿搭月历](./07-outfit-calendar.png)

- 月历的视觉密度和选中日展开结构可保留。
- 月份横拖同样只跟手约 10%，松手后替换为固定 32px 动画；快速反向拖动无法自然接管当前速度。
- 日详情通过 `height: 0 → auto` 展开，在 reduced-motion 下仍会进行大面积布局动画。

健康度：**需要改进。**

## 做得好的基础

- 全局 `MotionConfig reducedMotion="user"` 已存在，CSS 也有 reduced-motion 防线。
- 图片轮播已经有 pointer capture、8px 意图阈值、横纵方向判定、相邻图片预载和边缘阻尼意识。
- `MotionSheet` 已有 body scroll lock、焦点恢复、Tab 循环与 backdrop 行为。
- 现有代码没有大量自建 `@keyframes`，继续使用 Framer Motion 即可，不需要新增动效库。
- 裁切器的 pointer capture 和增量坐标模型相对成熟，可以作为其他拖拽组件的参考。

## Apple 式运动原则差距

| 原则 | 当前状态 | 目标状态 |
|---|---|---|
| 即时响应 | 按钮反馈分散，部分只靠 CSS active | pointerdown 同帧反馈，统一 `AppPressable` |
| 直接操控 | 轮播/日历只部分跟手 | 内容与手指 1:1，边缘才出现阻尼 |
| 可中断性 | `mode="wait"` 与固定 tween 较多 | 新手势可从当前位移和速度接管 |
| 速度连续 | 轮播计算平均速度但未传给 spring | release velocity 进入投影与 spring |
| 空间连续 | Tab/push/pop 都是同一 y 淡入 | Tab 交叉淡化，push/pop 方向相反 |
| 边缘回弹 | 部分手势硬 clamp 或弱弹性 | 只在真实边界橡皮筋，释放回弹 |
| 模态层级 | 多套 raw fixed overlay / 多 listener | 唯一 OverlayStack + Portal + BackCoordinator |
| 减少动态效果 | 基础存在，但 smooth scroll/height auto 漏网 | 偏好贯穿 JS 滚动、布局与手势 |
| 材质与性能 | 多处 blur/常驻 GPU layer | 按层级使用材质，低端 Android 有降级 |
| 多模态反馈 | 主要只有视觉 | 仅在确认、错误、吸附点增加克制触觉 |

## P0 / P1 / P2 问题清单

### P0：先修正确性

1. **建立唯一的 OverlayStack / BackCoordinator。**
   - 所有 Sheet、Dialog、Lightbox、Popover、裁切器注册到同一栈。
   - Android Back / Escape 只由一个入口消费：先关 topmost overlay，再回退页面，最后才询问退出。
   - 同一次事件只能完成一个状态转移；增加回归测试覆盖 Sheet + Dialog、Lightbox + 详情、嵌套删除确认。

2. **统一 Portal 根并移除永久 `transform-gpu`。**
   - `MotionSheet`、Lightbox 与 raw fixed overlay 都渲染到 `document.body` 下的统一 overlay root。
   - 路由容器只在动画期间启用 compositing hint，不常驻 transform。

3. **补齐 modal 语义。**
   - `MotionSheet` 的名称改为必填（`aria-labelledby` 优先，`aria-label` 兜底）。
   - Lightbox、裁切器和 raw overlay 增加 dialog 语义、焦点初始位置、焦点圈定、背景 inert 与焦点返回。

### P1：高频体感

4. **重做 Sheet 的手势模型。**
   - 面板真实高度范围内 1:1 下拖；向上轻微阻尼。
   - 关闭条件结合 projected distance 与 release velocity，而不是只看固定距离。
   - 松手时从当前速度进入临界/轻微欠阻尼 spring；中途反向拖动可直接接管。
   - 输入表单、滚动内容与拖拽手柄分区，避免与 Android IME 和内部滚动冲突。

5. **图片轮播迁移到 MotionValue。**
   - pointermove 不再逐帧 `setState`；使用 `MotionValue` / transform 驱动合成层。
   - 保留横纵意图锁，但 pointerdown 不切换为缩略图，避免闪变。
   - 维护最近 80–120ms 速度历史，release 后按投影距离决定目标页，并把速度传给 spring。
   - 快速滑动后的 click suppression 绑定同一 pointer 序列，不保留宽泛的时间窗口。

6. **周/月历改成三页轨道。**
   - 前一周（或月）/当前/下一页常驻三页，拖动 1:1 跟手；提交后无缝重置中页。
   - 使用 `touch-action: pan-y`，只有确认横向意图后才 capture；竖向滚动始终可用。
   - 箭头点击复用同一页轨道动画，不单独跑另一套 fixed tween。

7. **统一按压与状态反馈。**
   - 新增 `AppPressable`：普通控制仅 0.98–0.99 + 透明度/高亮，图标按钮不随意缩到 0.94。
   - 支持 pointer cancel、drag threshold、disabled、keyboard 和 reduced-motion。
   - Toast 按语义决定时长：成功短暂；错误/带动作提示保持到处理或手动关闭；悬停/焦点暂停计时。

8. **AI 进度与加载动画降噪。**
   - 进度条用 `scaleX` 替代 width 布局动画。
   - 百分比本身不持续进入 `aria-live`；只在阶段切换时播报。
   - Shimmer 以 transform 移动伪层，避免 background-position 逐帧重绘。

### P2：空间连续性与精修

9. **按导航意图区分运动。**
   - Tab：4px 以内的交叉淡化，允许快速切换中断。
   - Push detail：新页从右侧 18–24px 进入，旧页轻微后退/淡出。
   - Pop：方向相反；使用已有 navigation source 与历史栈，不再丢弃来源信息。
   - 滚动位置应在首帧绘制前恢复，避免进入动画结束后三重 rAF 再跳回。

10. **Lightbox 做源对象连续过渡。**
    - 从被点 hero/card 图片的实际边界和圆角展开，关闭回到原位置；源对象不可见时退化为轻淡入。
    - 第二阶段再加下拖关闭、双击缩放和双指缩放，避免一次性扩大范围。

11. **Popover 从锚点生长。**
    - 根据弹层相对 anchor 的方向设置 `transform-origin`，进入 decelerate、退出 accelerate。
    - 增加 menu/menuitem 语义、方向键与焦点返回；修正“注释 100ms、实际 400ms”的全局 click 吞噬窗口。

12. **滑条与裁切边缘。**
    - 滑块 pointerdown 记录手指与 knob 中心偏移，不应瞬间跳到手指位置；相同整数值不重复触发 onChange。
    - 裁切边界加入短距离阻尼，松手再回到合法范围；不对最终裁切数据做超界写入。

## 页面级修复方案

本节把前面的系统结论落实到具体页面。原则是：**共享行为只在基础组件修一次，页面只配置空间关系和业务状态**。不要在每个页面重新写一套 spring、Back 监听或弹层动画。

### 页面修复总览

| 页面 / 路由 | 优先级 | 页面需要怎么修 | 主要批次 |
|---|---:|---|---|
| App 主壳、底部导航、全局“+” | P0 | 统一路由方向、Overlay/Back 栈、按压反馈和 Toast 层级 | A / B / C |
| 衣橱首页 `wardrobe_home` | P1 | 卡片/筛选即时反馈，选择模式与筛选结果平滑更新，不做瀑布式入场 | B |
| 衣物详情 `garment_detail` | P0/P1 | push/pop 空间方向、hero 轮播、Lightbox、更多菜单、Tab 切换统一 | A / B / C |
| 单品录入 `intake_single_item` | P0/P1 | 全屏流程导航、图片来源 Sheet、裁切、AI 进度、滑条和退出确认 | A / B / C |
| 套装首页 `outfit_home` | P1 | 周计划三页轨道、日期选择、计划卡状态与套装筛选反馈 | B |
| 套装详情/录入 `outfit_detail`、`intake_outfit` 及编辑/组成/实图子页 | P1 | 详情层级、创建步骤、子页 push/pop、Popover、图片预览和未保存确认 | A / C |
| 穿搭月历 `outfit_calendar` | P1 | 月份三页轨道、日详情展开、计划卡转场与返回来源 | B / C |
| 计划新增、详情、打包清单 | P1 | 页面层级、表单状态、删除/重置 Sheet 和保存反馈 | A / C |
| 种草首页与归档列表 `wishlist_*` | P1 | 顶部菜单锚点、列表状态切换、详情来源与批量删除反馈 | A / B / C |
| 种草详情、录入、转衣橱 | P0/P1 | Lightbox/Popover/确认 Sheet 归栈，状态变化保持对象连续 | A / C |
| 设置首页及画像/参考照/MiniMax/衣橱管理 | P0/P1 | 子页导航、嵌套 Sheet、参考照 Lightbox、诊断弹窗统一 | A / C / D |
| 账号管理、修改密码、注销账号 | P0 | alertdialog 顶层优先级、忙碌态锁定、焦点和 Back 行为 | A / D |
| 登录/注册、搜索、穿着统计 | P2 | 继承统一导航、按压、加载和 reduced-motion；不做专属大动画 | C / D |
| 全局 AI 进度、Skeleton、Toast | P1 | 阶段播报、合成层进度、语义化停留时长、减少循环动画 | B / D |

### 0. 共用基础设施：所有页面先依赖这一层

涉及文件：`src/components/motion-common.tsx`、`src/components/motion-provider.tsx`、`src/lib/motion-tokens.ts`、`src/components/use-app-navigation-controller.ts`、`src/lib/app-route.ts`、`src/lib/use-stable-back-handler.ts`、`src/components/wardrobe-app.tsx`。

具体修复：

1. 新建唯一 `OverlayRoot`，挂在 `document.body`。`MotionSheet`、确认弹窗、Lightbox、Popover、裁切器和诊断弹窗全部通过 Portal 进入该根节点，不再依赖页面内部 `fixed`。
2. 新建 `OverlayStack`，每个浮层注册 `id`、`type`、`dismissible`、`onDismiss`、`restoreFocusTo` 和层级。建议优先级：全屏裁切/录入 > Lightbox > alertdialog > Sheet > Popover；Toast 不消费 Back。
3. Android Back 与 Escape 只保留一个入口：
   - 有浮层：仅关闭 topmost overlay；
   - 无浮层且为详情/子页：只执行一次 `goBack()`；
   - 已在四个主 Tab 首页：才打开退出确认；
   - 保存中或不可取消事务：不关闭，只给明确的状态提示。
4. `NavigationController` 除 `route` 外暴露最近一次 `source`、`direction`、`fromRoute`、`toRoute`。当前 `RouteChangeSource` 只用于日志，页面动画无法使用，需要转成渲染状态。
5. 统一语义 token：`control`、`tab`、`push`、`pop`、`panel`、`momentum`、`feedback`。页面禁止再直接填写随意的 stiffness/damping/duration。
6. `MotionSheet` 增加明确变体：
   - `action`：短内容、可下拖关闭；
   - `form`：内容可滚动，仅抓手区开始拖拽；
   - `confirm`：不允许拖拽误关，使用轻 scale/fade；
   - `destructive`：同 confirm，但 Back/按钮受 submitting 状态约束。
7. `AppPressable` 统一 pointerdown、pointerup、pointercancel、键盘 Space/Enter 与拖离取消。普通按钮目标 scale `0.98–0.99`；纯图标按钮优先用背景/透明度变化，不做明显缩小。

共用验收：

- 任意组合下按一次 Back 只改变一层状态。
- 关闭浮层后焦点回到触发按钮，背景内容在浮层打开时不可聚焦。
- 快速连续打开/关闭或反向操作时，动画从当前屏幕位置继续，不跳回初始值。
- 360 / 390 / 430px 竖屏下不因 Portal 或键盘弹起出现定位偏移。

### 1. App 主壳、底部导航与全局“+”

页面范围：四个主 Tab、全局新建 Sheet、退出确认、全局 Toast。主要代码：`src/components/wardrobe-app.tsx`、`src/components/use-app-navigation-controller.ts`。

具体修复：

1. **底部 Tab 切换**：衣橱、套装、种草、设置属于平级，不使用详情页 slide。新旧内容做 `opacity 0.96 → 1` 与 `y 4px → 0` 的短交叉淡化；允许快速连续切换，不用 `mode="wait"` 阻塞下一次点击。
2. **Tab 图标反馈**：pointerdown 同帧改变背景/图标重量；选中胶囊从当前 Tab 位置平移到目标位置，可使用共享 `layoutId`，但不得让整个底栏弹跳。
3. **全局“+”**：按下时即时反馈；打开 `action` Sheet。背景只轻度变暗，不移动主页面。选择“单品/套装/种草”后，Sheet 先沿原路径退出，再由目标录入页执行 push；两段可重叠约 40–60ms，不能先完全消失再空等。
4. **退出确认**：仅四个主首页无浮层时出现；使用 `confirm` 变体，不下拖关闭。取消后只返回首页，不触发任何其他路由动作。
5. **路由容器**：移除常驻 `transform-gpu` 和所有页面统一 `opacity+y` 的逻辑；由 `NavigationMotion` 根据 tab/push/pop 选择变体。
6. **滚动恢复**：Tab 各自记忆滚动位置；在新页面首帧绘制前恢复，不等入场动画完成后再三重 rAF 跳转。详情 pop 回列表时，优先恢复被点卡片附近的位置。

页面验收：

- 快速依次点击四个 Tab，内容不白屏、不排队、不把旧页面短暂闪回。
- 新建 Sheet 打开后按一次 Back 只关 Sheet；第二次 Back 才出现退出确认。
- 从任一录入页取消后回到进入前的具体 Tab/子页，方向表现为 pop，而不是再次入场。

### 2. 衣橱首页 `wardrobe_home`

页面范围：衣橱范围、搜索、穿着统计、AI 衣橱诊断、分类筛选、单品卡片、批量选择。主要代码：`WardrobeView`、`CatalogWaterfallCardShell`、`SwipeImageCarousel`、`WearStatisticsView`。

具体修复：

1. **衣橱范围与分类 Chip**：只做颜色、边框和选中底层的 120–180ms 过渡；Chip 宽度变化使用 layout 动画，但筛选结果列表不做全量重新入场。
2. **单品卡片**：pointerdown 即轻压；用户开始纵向滚动或横向切图后立即取消卡片 press，避免滑图时卡片也缩放。松手仍在原卡片且位移未超过阈值才进入详情。
3. **卡片内图片轮播**：复用改造后的 MotionValue 轮播；卡片与轮播建立明确手势所有权，横向意图确认后卡片 click 失效，下一次独立点击必须正常。
4. **筛选结果变化**：保留仍存在卡片的屏幕位置；新增/消失卡片只做 100–160ms opacity，避免瀑布流大范围 layout 飞动。
5. **批量选择**：进入选择模式时复选标记和底部操作条同时出现；选中卡片只改变边框、遮罩和 check，不缩放整张瀑布卡。删除确认进入 OverlayStack。
6. **搜索与统计入口**：作为 push 子页进入，返回时回到原滚动位置。AI 诊断入口只在用户主动触发后显示进度，不让整个首页持续 pulse。

页面验收：

- 纵向滚动、卡片横向切图和点击进详情三种意图互不误触。
- 切换分类后列表不从顶部成批飞入，已有卡片不发生明显跳位。
- 批量选择 20 件以上时仍保持稳定帧率，选中计数与视觉状态同帧更新。

### 3. 衣物详情 `garment_detail`

页面范围：详情顶栏、hero 图组、缩略图、信息/灵感/搭配 Tab、编辑、移动衣橱、更多菜单、Lightbox。主要代码：`wardrobe-app.tsx`、`garment-immersive-detail.tsx`、`garment-detail-3.0.tsx`、`detail-shell.tsx`、`swipe-image-carousel.tsx`。

具体修复：

1. **进入详情**：从衣橱或已买种草进入时执行 push，新页从右侧 20–24px 和 `opacity 0.98` 到位；来源列表只轻微退后 4–6px。第一阶段不强制做卡片 shared-element，先保证方向和滚动恢复正确。
2. **返回详情来源**：pop 沿相反路径；从已买种草进入必须回到已买列表，而不是衣橱首页。动画方向由 route 的 `returnRoute` 决定。
3. **Hero 轮播**：拖动 1:1、边缘 rubber-band、release velocity 投影选页；快速反向可接管当前 x/velocity。pointerdown 不切缩略图，避免清晰度闪变。
4. **缩略图条**：点缩略图时复用轮播 snap，不另跑一套淡入；当前缩略图选中框使用 layout 动画平移。自动 `scrollIntoView` 在 reduced-motion 下改为 instant。
5. **详情 Tab**：信息、灵感、搭配属于同层内容，仅做短 cross-fade；内容高度变化使用 layout 测量，避免 `height:auto` 大面积补间。Tab 指示器从当前项平移。
6. **更多菜单**：从三点按钮方向生长，`transform-origin` 指向 anchor；菜单打开后方向键可移动，Escape 只关菜单并把焦点还给三点按钮。
7. **移动衣橱 Sheet**：使用 `form` 变体；内部滚动到顶后才允许继续向下拖，选择完成后先显示服务器保存状态，读回成功再关闭。
8. **Lightbox**：第一阶段完成 dialog 语义、topmost、焦点和 Back；第二阶段从被点 hero 图位置展开/收回。下拖关闭只在图片未放大时启用；放大后手势优先用于平移。

页面验收：

- 从衣橱、已买种草、套装关联三个来源进入后，都能沿正确方向回到正确列表位置。
- 快速连续滑 3 张图、反向拖回、立即打开 Lightbox，不闪缩略图、不误进编辑。
- 打开更多菜单后按 Back 只关菜单；再次 Back 才退出详情。

### 4. 单品录入 `intake_single_item`

页面范围：图片来源、批量选图、裁切、AI 识别、逐件确认、温度滑条、保存、退出确认。主要代码：`garment-intake-flow.tsx`、`intake-flow-shell.tsx`、`wardrobe-image-source-sheet.tsx`、`image-crop-editor.tsx`、`temperature-range-slider.tsx`。

具体修复：

1. **进入/退出流程**：录入是全屏任务页，使用 push/pop；步骤切换发生在流程内部，不重新播放整页入场。顶部进度只在步骤改变时平滑移动。
2. **图片来源 Sheet**：使用 `action` 变体；系统相册/相机接管前先停止 Sheet 动画并记录流程状态，回来后从当前状态恢复，不重播页面入场。
3. **裁切器**：作为最高层全屏 overlay；拖图保持现有 pointer capture，但边界改为渐进阻尼，release 后回到合法范围。确认/取消都沿当前 presentation value 收口；Back 只退出裁切，不退出整个录入。
4. **AI 识别进度**：图片卡保留位置，只更新状态层；进度用 `scaleX`，阶段变化才向读屏播报。失败时原位显示重试，不把卡片移出再插回。
5. **批量逐件确认**：切换当前图片时使用 8–12px 的轻横向提示，方向与上一张/下一张一致；不对整份表单做 40px slide。修改字段后只更新对应 review 标记。
6. **温度滑条**：只有按住 knob 才开始拖；记录 grab offset，pointerdown 不瞬移；纵向滚动不改变值。相同整数值不重复提交 React state。
7. **保存状态**：点击保存后按钮原位变为进度，表单不缩放、不消失；服务端提交并读回后用 check/Toast 确认，再 pop 回来源页。失败留在当前页并保留内存草稿。
8. **退出确认**：仅草稿有变化时显示 `confirm`；Back 优先级为裁切 > 图片来源 Sheet > 字段选择浮层 > 退出确认 > 页面返回。

页面验收：

- 相册返回、裁切取消、识别失败、保存失败四种中断都保留正确的当前步骤和内存草稿。
- 在温度滑条上方开始纵向滚动不改变温度；按住 knob 拖出控件边界仍持续跟手。
- 连续按两次 Back 分别关闭顶层工具和退出流程，不出现双弹窗。

### 5. 套装首页 `outfit_home`

页面范围：本周穿搭、日期选择、计划卡、筛选 Chip、套装卡片、添加计划 Sheet。主要代码：`outfit-list-view.tsx`、`outfit-weekly-plan-strip.tsx`。

具体修复：

1. **周计划**：改成“上一周 / 当前周 / 下一周”三页轨道，确认横向意图后 1:1 拖动；松手用 projected endpoint 选择目标周，完成后无缝把目标周归中。
2. **竖向滚动**：周条使用 `touch-action: pan-y`。首个 8–10px 内同时判断横/纵；纵向胜出后永不 capture 横向手势。
3. **日期选择**：选中背景/边框用 layout 动画在日期之间移动；当天计划详情在同一周内只做短 cross-fade，不重播整周动画。
4. **箭头切周**：复用三页轨道的同一 snap 行为；连续点下一周时从当前 presentation value 继续，不把输入锁到动画结束。
5. **套装筛选与卡片**：与衣橱首页统一 Chip 和 AppPressable；筛选结果不批量 stagger。收藏星、今天穿了等局部状态只更新局部，不让整卡 bounce。
6. **添加计划**：类型选择 Sheet 使用 `action` 变体；选中类型后 Sheet 与目标页面 push 连续衔接。

页面验收：

- 从周条区域起手竖滑可正常滚动；横滑只切一周，快速 flick 可切换但不能跨过多周。
- 拖到一半反向拖回，周内容跟手返回，不出现旧周消失、新周再飞入。
- 点击日期、标记今天穿了和滚动页面互不抢手势。

### 6. 套装详情、录入、编辑、组成与实图子页

页面范围：`outfit_detail`、`intake_outfit`，以及 `detail`、`edit`、`edit_composition`、`real_image_view`、`real_image_add`、`create_select`、`create_info` 等内部子页。主要代码：`outfit-list-view.tsx`、`detail-shell.tsx`。

具体修复：

1. 从套装首页或月历进入详情都使用 push，但返回目标不同；导航控制器必须保留 `returnRoute`，月历来源 pop 后仍保持原月份和展开日期。
2. 详情 Tab、hero 轮播、缩略图、Popover 和 Lightbox 完全复用衣物详情的共用实现，不另建套装专属参数。
3. `intake_outfit` 的“选择组成 → 填写信息”是同一创建任务的两个步骤：步骤指示器平滑移动，内容只做 8–12px 方向提示；返回从信息回到选择，不退出整个录入。
4. 详情 → 编辑、组成编辑、实图管理属于更深一层子页，使用 18–20px push；保存或取消用对应 pop。内部 `setSubPage` 需要接入同一 NavigationMotion，而不是静态替换 JSX。
5. 组成单品的勾选只做 check、边框和数量变化；大批量选择时不对所有卡片做 layout spring。保存成功后 pop 回编辑/详情，组成摘要原位更新。
6. 实图查看使用 Lightbox/全屏 viewer 的统一 topmost 行为；删除图片确认使用 `confirm`，编辑说明使用 `form`，两者不得同时抢 Back。
7. 未保存修改确认使用 `confirm`；`compositionEditDirty` 为真时第一次 Back 只开确认，确认退出后只 pop 一层。

页面验收：

- 从月历进入套装详情再返回，月份、选中日期和展开卡片保持不变。
- 套装录入从信息步骤返回选择步骤时，已选组成和表单草稿保持不变；再次 Back 才退出录入。
- 编辑组成后保存，页面只 pop 一层，详情组成区域原位刷新，不重新进入整个套装详情。
- 图片预览、说明编辑、删除确认叠加测试中一次 Back 只处理 topmost。

### 7. 穿搭月历 `outfit_calendar`

页面范围：月份切换、日期格、行内日详情、计划卡、进入套装/计划详情。主要代码：`outfit-planning-calendar-view.tsx`、`outfit-plan-day-card.tsx`。

具体修复：

1. **月份切换**：与周计划共用三页轨道和 axis intent lock；页面内容 1:1 跟手，边界才 rubber-band。箭头和手势走同一状态机。
2. **日期选择**：选中框在日期格之间用 layout 动画移动；切同一日期只展开/收起详情，不重播月份动画。
3. **行内日详情**：标准模式用 opacity + clip/轻 layout，避免直接 `height: auto` 大面积补间；reduced-motion 下瞬时布局，只保留 100ms opacity。
4. **跨行切换日期**：旧详情先保持高度，新详情测量完成后一次性更新容器，避免日历上下跳两次。
5. **进入套装/计划详情**：push 并记录月份、选中日期、展开行；返回 pop 后恢复同一上下文。
6. **添加计划**：顶部“+计划”进入计划类型 Sheet；选定后 push 到新增页。Sheet 关闭与页面进入不能出现中间空白帧。

页面验收：

- 月历上竖向滚动、横向切月、点击日期三者意图稳定。
- 快速切月后立刻反向，内容从当前 x 和 velocity 接管，不先完成旧动画。
- 在 31 天月与跨 6 行月份切换时，行内详情不抖动、不遮挡底部安全区。

### 8. 计划新增、详情与打包清单

页面范围：`plan_add`、`plan_edit`、`plan_detail`、`packing_list`。主要代码：`outfit-plan-add-view.tsx`、`outfit-plan-detail-view.tsx`、`plan-packing-checklist-view.tsx`、`outfit-plan-select-sheet.tsx`。

具体修复：

1. 月历 → 新增计划 → 计划详情 → 打包清单形成明确的连续 push 层级；每次 Back 只 pop 一层。
2. 日期、地点、类型等字段选择 Sheet 使用 `form`；简单二选一使用 `action`。字段选中后只更新对应表单行和摘要，不重播整页。
3. 保存按钮原位显示 pending；服务端读回成功后 pop 或进入详情。失败保留表单与当前滚动位置。
4. 删除计划、放弃修改、重置清单使用 `confirm/destructive`；提交期间不响应 backdrop、拖拽或 Back，完成后一次性关闭。
5. 打包勾选使用局部 check 和文字状态，不让整行 scale；“全部重置”完成后列表保持位置，避免所有行依次 stagger。
6. 手动添加物品 Sheet 打开输入法后保持底部安全区，关闭键盘不应触发 Sheet snap。

页面验收：

- 保存失败、删除失败、输入法弹起和 Back 连按不会丢失表单或越级返回月历。
- 100 项打包清单批量重置时不出现逐行动画或明显长帧。

### 9. 种草首页、已买、不感兴趣与已归档列表

页面范围：`wishlist_home`、`wishlist_purchased`、`wishlist_rejected`、`wishlist_archived`。主要代码：`wishlist-view-2.0.tsx`。

具体修复：

1. 顶部三点菜单从按钮锚点生长，菜单切换列表时先关闭 Popover，再 push 到目标列表；不使用 400ms 全局 click suppressor 阻塞下一次操作。
2. 首页筛选 Chip 与衣橱/套装统一；列表状态切换不整页重入，保留共同卡片的稳定位置。
3. 首页 → 已买/不感兴趣/已归档属于 push；Back pop 回种草首页。进入这些列表后再打开详情，要保存完整 `returnRoute`。
4. 批量选择与删除沿用衣橱首页规则；确认 Sheet 进入 OverlayStack，删除进行中禁用 Back，但保留清楚进度。
5. 列表卡片状态改变（恢复种草、归档、撤销购买）时先更新服务器并读回，再在当前位置做短 opacity/布局收口；不先乐观飞出列表。

页面验收：

- 点开菜单后选择已买列表，第一次点击即可生效；不存在需要再点一次的吞点击现象。
- 已买列表 → 衣橱单品详情 → 返回，仍回到已买列表原位置。
- 恢复/归档失败时卡片不先消失，错误提示可停留并提供重试。

### 10. 种草详情、录入与转衣橱

页面范围：种草详情、`intake_wishlist`、新增/编辑、`convert_confirm`。主要代码：`wishlist-view-2.0.tsx`、共享详情壳和录入组件。

具体修复：

1. 种草详情使用和衣物/套装一致的详情 push/pop、Tab 指示器、Hero/Lightbox 和 Popover；避免同类详情页面出现不同物理手感。
2. 详情中的“已买”“不想买”“恢复种草”“撤销购买”等操作只对受影响的状态胶囊和操作区做短过渡，不让整个详情页重挂载。
3. 转衣橱确认属于 `confirm/form` 组合：先确认关键字段，再显示服务器事务状态；读回成功后 pop 回明确目标，不能在多个 Sheet 间跳动。
4. 种草录入复用单品录入的图片来源、裁切、AI 进度、字段反馈与退出优先级，不复制手势实现。
5. 编辑表单有未保存内容时第一次 Back 只打开放弃确认；确认后回详情，取消后焦点回到原字段/按钮。

页面验收：

- 转衣橱失败时种草状态不提前改变，图片和表单草稿仍在。
- 详情 Popover、转衣橱 Sheet、删除确认和 Lightbox 任意组合都遵守 topmost 关闭。

### 11. 设置首页及画像、参考照、MiniMax、衣橱管理

页面范围：`settings_home` 内部 `profile`、`photos`、`minimax`、`wardrobes` 子页，以及诊断上传。主要代码：`SettingsView`、`wardrobe-app.tsx`。

具体修复：

1. 设置首页 → 画像/参考照/MiniMax/衣橱管理使用 push；内部 `subPage` 接入 NavigationMotion，不能继续静态替换后再由外层统一淡入。
2. 设置卡片按压统一为 AppPressable；开关仅移动 thumb 和改变 track，不让整行缩放。
3. 参考照 Lightbox、删除确认、编辑说明分别复用 Lightbox、`confirm`、`form`；关闭后回到具体图片按钮。
4. 衣橱管理新增/编辑使用 `form`；删除第一层解释影响，真正批量删除使用 `destructive`。两层确认进入同一栈，Back 每次只退一层。
5. MiniMax Key 保存只显示字段级 pending 和结果反馈；成功后 pop 回设置，失败保留输入值且错误提示不自动消失。
6. 诊断描述、上传成功、上传失败当前使用 raw fixed overlay，应全部迁入 Dialog/Sheet。上传中禁止误关；成功/失败操作完成后关闭一层。
7. 低端 Android 或 reduced-transparency 下，设置卡片、底栏、Toast 的 blur 改为更实的背景和清楚边框。

页面验收：

- 删除衣橱双层确认中，第一次 Back 只关最上层硬确认，第二次回到影响说明。
- 参考照 Lightbox 关闭后焦点返回对应缩略图，不跳到页面顶部。
- 输入法弹起时 MiniMax/衣橱表单 Sheet 不改变 snap 或被底栏遮挡。

### 12. 账号管理、修改密码、注销账号与登录注册

页面范围：`account_management`、`change_password`、`account_deletion`、登录/注册/验证码流程。主要代码：`auth/account-views.tsx`、`auth/account-deletion-view.tsx`、`auth/auth-gate.tsx`。

具体修复：

1. 设置 → 账号管理 → 修改密码/注销账号使用标准 push/pop；服务器 busy 时保留页面，不用全屏切换造成“是否已提交”的不确定感。
2. 最终注销确认保留 `alertdialog`，进入 OverlayStack 最高确认层；提交后 backdrop、Escape、Android Back 和下拖都不可关闭，完成或失败后再恢复控制。
3. 登录/注册步骤只做短 cross-fade 和焦点移动，不使用大幅 slide；验证码发送、登录、注册按钮在原位显示 pending。
4. 字段校验信息在字段附近出现；错误不通过 Toast 一闪而过。成功登录后主 App 第一次进入可短 fade，不做卡片逐项入场。
5. reduced-motion 下完全移除账号流程的位移动画，只保留状态和焦点反馈。

页面验收：

- 提交修改密码或注销期间连续按 Back 不会退出流程或重复提交。
- TalkBack 能读出 alertdialog 标题、后果、主操作与取消操作；关闭后焦点返回触发入口。

### 13. 搜索、穿着统计、AI 进度、Skeleton 与 Toast

页面范围：衣橱搜索、`WearStatisticsView`、AI 衣橱诊断、识别/推荐进度、全局在线状态与消息提示。

具体修复：

1. 搜索、统计作为普通 push 子页，继承 NavigationMotion；搜索结果不做逐项 stagger，历史记录删除只淡出当前行。
2. 统计图表首次出现可从基线轻微增长，但不从 0 逐项播放长动画；切时间范围时只更新数据形态和数值。
3. 进度条全部使用 transform `scaleX`，阶段文本单独 `aria-live`；百分比连续更新不重复播报。
4. Skeleton 只在真实网络等待时出现；超过短阈值再显示，避免快速请求产生闪烁。Shimmer 使用 compositor-friendly transform，reduced-motion 下静态占位。
5. Toast 分级：成功约 2.5–3s；普通信息约 4s；错误和含“前往设置/重试”等动作的提示不自动消失。焦点或触摸按住时暂停计时。
6. Toast 不参与 Back 栈，不遮住底部导航、FAB 和键盘；连续消息按队列替换/合并，不在屏幕上堆叠弹跳。

页面验收：

- 快速成功请求不闪 Skeleton；慢请求有稳定占位，不造成列表整体跳动。
- AI 进度从 0 到 100% 时 TalkBack 只播报阶段，不播报每个百分比。
- 带动作错误提示在用户处理前一直存在，且不会覆盖主要按钮。

## 页面与共用组件的实施依赖

```text
批次 A：OverlayRoot / OverlayStack / BackCoordinator / modal semantics
  ├─ 全局新建与退出确认
  ├─ 三类详情的 Lightbox / Popover
  ├─ 录入图片来源 / 裁切 / 退出确认
  ├─ 计划与打包确认
  ├─ 种草确认与批量删除
  └─ 设置、诊断、账号注销弹窗

批次 B：Gesture primitives / AppPressable / progress feedback
  ├─ 衣橱卡片轮播
  ├─ 详情 Hero 轮播
  ├─ 套装周计划
  ├─ 穿搭月历
  ├─ 单品录入滑条与裁切
  └─ 所有首页筛选、选择和局部状态反馈

批次 C：NavigationMotion / route context / source continuity
  ├─ 四个主 Tab
  ├─ 衣物、套装、种草详情
  ├─ 套装编辑、组成、实图子页
  ├─ 月历、计划详情、打包清单
  ├─ 设置与账号子页
  └─ 搜索、统计、录入进入与退出

批次 D：preferences / accessibility / Android performance
  └─ 覆盖所有页面，不单独在某页补丁式处理
```

实施时必须按依赖顺序推进。不能先在某个页面单独实现拖拽 Sheet 或 Back 逻辑，否则会把当前多 listener 问题复制到新组件里。

## 建议拆分的开发任务

1. **A1 — Overlay 与 Back 基线**：OverlayRoot、OverlayStack、BackCoordinator、Portal、焦点/inert、topmost 测试。
2. **A2 — 全部浮层迁移**：MotionSheet、Lightbox、Popover、裁切器、raw diagnostic dialogs、确认/删除 Sheet。
3. **B1 — 按压与反馈**：AppPressable、Toast、Progress、Shimmer；优先接衣橱/套装/种草三个首页。
4. **B2 — 图片手势**：SwipeImageCarousel MotionValue 化，接衣物/套装/种草详情和卡片轮播。
5. **B3 — 日历手势**：周计划、月历三页轨道与 axis intent lock。
6. **B4 — 录入手势**：裁切 rubber-band、温度滑条 grab offset、录入步骤反馈。
7. **C1 — 路由运动**：NavigationController 暴露 source/direction，完成 Tab/push/pop 与滚动恢复。
8. **C2 — 详情连续性**：三类详情、Lightbox source anchor、Popover anchor、返回来源恢复。
9. **C3 — 深层流程**：计划、打包、套装编辑、设置、账号子页接入统一导航。
10. **D1 — 偏好与性能**：reduced-motion/transparency/contrast、Android gfxinfo/Perfetto、TalkBack 回归和死代码清理。

每个任务必须做到：先改 `docs/designs/wardrobe-ui-spec.md` 对应规则，再改共享组件和页面，最后完成浏览器慢放与 Android 真机/模拟器验证；不要把所有页面改完后才第一次做触摸回归。

## 目标架构

```text
MotionPreferences
  ├─ semantic tokens: control / navigation / panel / momentum
  ├─ AppPressable
  ├─ NavigationMotion (tab / push / pop)
  ├─ OverlayRoot + OverlayStack + BackCoordinator
  │    ├─ Sheet
  │    ├─ Dialog
  │    ├─ Lightbox
  │    └─ Popover
  └─ Gesture primitives
       ├─ axis intent lock
       ├─ velocity history + projection
       ├─ rubber band
       └─ snap spring
```

建议的语义 token（最终参数要用 Android 录屏校准，不机械照抄）：

| Token | 用途 | 建议体感 |
|---|---|---|
| `control` | 按压、勾选、图标反馈 | 0.20–0.26s，临界阻尼，几乎无回弹 |
| `navigation` | Tab、push、pop | 0.22–0.30s，距离 4/20/24px |
| `panel` | Sheet、Dialog、Popover | 0.28–0.34s，临界阻尼；Modal 初始 scale 0.98 而非 0.92 |
| `momentum` | 轮播、日历、可拖 Sheet | 0.32–0.40s，仅手势释放允许 0.12–0.18 的轻回弹 |

原则：**弹性只服务于物理手势，不把 Toast、普通按钮、路由切换都做成弹簧玩具。**

## 分批实施计划

### 批次 A：P0 基础（2–3 天）

- 先更新 `docs/designs/wardrobe-ui-spec.md` 的运动语义、overlay/back 规则和 reduced-motion 契约。
- 实现 OverlayRoot、OverlayStack、BackCoordinator；迁移 MotionSheet、Lightbox 和现有顶层 raw overlay。
- `ariaLabel`/`aria-labelledby` 契约收紧；补 topmost、focus、Escape/Android Back 测试。
- 移除路由容器常驻 `transform-gpu`。

交付门禁：一次 Back 只关闭一层；无背景可聚焦；所有 dialog 有名称；不改变 API、存储或业务字段。

### 批次 B：高频手势（4–6 天）

- Sheet 拖拽与速度投影。
- 图片轮播 MotionValue 化。
- 周/月历三页轨道与 `pan-y` 意图锁。
- `AppPressable`、Toast、AI progress、Shimmer 统一。

交付门禁：手指与内容 1:1；快速反向可接管；竖向滚动不被周条吞掉；滑动后首个有效点击不丢失。

### 批次 C：导航与连续性（3–4 天）

- Tab / push / pop 分层；滚动位置在首帧前恢复。
- Lightbox source-anchor；Popover transform-origin。
- 滑条 grab offset、裁切软边界。

交付门禁：详情进入/返回方向一致；中途快速操作不跳帧；Lightbox 源对象不可见时有可靠降级。

### 批次 D：性能与偏好（2–3 天）

- reduced-motion 覆盖 smooth scroll、height:auto、stagger。
- 加 `prefers-reduced-transparency` / 高对比降级；低端 Android 减少大面积 blur。
- 清理未使用的动效 token/API，统一文档和自动化审计。

交付门禁：reduced-motion 下无大位移动画；背景模糊关闭后层级仍清楚；无新增长任务或布局抖动。

## 验收标准

### 行为

- pointerdown 到视觉反馈不超过 1 帧（目标 16ms 内）。
- 拖拽内容与手指最多落后 1 帧；中途反向不跳回预设起点。
- 任意时刻 Android Back / Escape 只完成一个动作，只关闭 topmost layer。
- 周/月历区域起手竖滑可正常滚动页面；横滑确认后才捕获。
- 快速滑动轮播后，下一次独立点击不会被 350–400ms 的全局窗口误吞。
- 所有 modal 有可访问名称、焦点圈定、背景 inert、关闭后焦点返回。

### 偏好与可访问性

- reduced-motion：取消大位移、spring、height:auto 和 smooth scroll，只保留必要的短淡化/状态反馈。
- TalkBack：Sheet、Lightbox、Popover 的打开、当前标题、关闭与焦点顺序可理解；进度只在阶段变化时播报。
- 触控目标不因缩放变小；键盘与触摸行为一致。

### Android 性能

- 在 Pixel 6 / API 35 模拟器和至少一台真机录制 0.25× 慢放：Sheet、轮播、周/月历、详情 push/pop。
- 使用 `adb shell dumpsys gfxinfo` / Perfetto 检查：关键路径 janky frames 目标 `<5%`，不出现 `>100ms` 长帧。
- 覆盖 360 / 390 / 430px 三种竖屏宽度、标准动效、reduced-motion、减少透明度/高对比降级。

## 明确边界

- 不重排现有信息架构，不改入口层级、业务字段、API 契约或线上唯一数据源规则。
- 不新增动画库；继续使用现有 Framer Motion、motion tokens 与组件体系。
- 首轮不把触觉反馈做成依赖；仅在后续原生环境中对确认、错误和吸附点做克制增强。
- 本轮只读审查，没有修改项目源码、`VERSION_HISTORY.md` 或 Git 历史，也没有构建 APK。

## 关键源码证据

- `src/components/wardrobe-app.tsx:438`：顶层 Back/Escape 仲裁与多个子 listener 并存。
- `src/components/wardrobe-app.tsx:1015`：全路由统一 `wait + opacity/y`，且常驻 `transform-gpu`。
- `src/components/motion-common.tsx:82`：MotionSheet 焦点/键盘基础、固定 tween、非 Portal。
- `src/components/motion-common.tsx:328`：Lightbox 缺 dialog/focus 语义，中心缩放。
- `src/components/motion-common.tsx:434`：Popover 定位与 400ms click suppressor。
- `src/components/swipe-image-carousel.tsx:352`：pointermove state、平均速度与未继承速度的 spring。
- `src/components/outfit-weekly-plan-strip.tsx:117`：周条弱跟手、`touch-none`、固定替换动画。
- `src/components/outfit-planning-calendar-view.tsx:182`：月历弱跟手与 `height:auto` 展开。
- `src/lib/motion-tokens.ts:7`：按时长/物理参数命名，尚未形成 control/navigation/panel/momentum 语义。
- `src/components/temperature-range-slider.tsx:137`：pointerdown 直接把滑块移动到手指位置。
