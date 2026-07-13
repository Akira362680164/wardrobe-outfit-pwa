---
title: 衣橱穿搭助手 UI 规范
version: v0.2-final
status: final
appVersion: 2.1.7-test
validatedAgainstAppCommit: 46e1aabf6a94da22406915a3fcbd35936dec6801
sourceOfTruth: docs/designs/wardrobe-ui-spec.md
generatedPreview: docs/designs/wardrobe-ui-spec.html
previewGenerator: scripts/generate-ui-spec-preview.mjs
appliesTo:
  - PWA mobile web
  - Capacitor Android WebView
  - mobile portrait only
  - 3:4 garment media
lastReviewedAt: 2026-07-07
---

# 衣橱穿搭助手 UI 规范

本文件是当前 UI 规范的唯一事实源。`docs/designs/wardrobe-ui-spec.html` 必须由 `scripts/generate-ui-spec-preview.mjs` 从本文件生成，禁止手工编辑 HTML 预览页。修改本文件后必须执行 `npm run docs:ui-spec:build`，提交前必须执行 `npm run docs:ui-spec:check`。

本规范从原型说明升级为生产 UI 契约，约束页面框架、令牌、组件复用、路由状态、覆盖层、无障碍、系统状态和验收脚本。后续如果修改 Tailwind 色值、全局 CSS、Motion token、路由枚举或核心 UI 组件，必须同步更新本文件。

## 1. 产品与平台边界

- 只做手机竖屏版；Android 已固定 portrait。横屏不单独设计，只要求可返回、可退出、不丢失未保存草稿。
- 图片展示比例统一为竖向 `3:4`；单品图、详情主图、瀑布流图片、录入裁切默认框都按这个比例收敛。
- 业务数据与图片以服务器为唯一事实源；录入中的图片、裁切、AI 草稿只存在当前页面会话内。
- UI 图标优先使用 `lucide-react`，不要用文字替代图标。设置必须使用齿轮图标。
- 页面第一屏直接是可用 App，不做营销式落地页。

## 2. Design Tokens

### 2.1 颜色

| Token | 规范值 | 当前代码事实 | 用途 |
| --- | --- | --- | --- |
| `color.ink` | `#1d2228` | `tailwind.config.ts` `ink` | 主文字、深色图标 |
| `color.paper` | `#fbfbf8` | `globals.css` body 渐变、局部裸值 | 页面底色、全屏流底色 |
| `color.mist` | `#f4f5f3` | Tailwind `rgb(244 245 243)` | 次级背景、分段控件底色 |
| `color.surface` | `#fffffc` | `.surface` 使用 `rgba(255,255,252,0.86)` | 卡片和浮层 |
| `color.line` | `rgba(29,34,40,0.10)` | 多处 `border-ink/10` | 边框线 |
| `color.muted` | `rgba(29,34,40,0.56)` | 多处 `text-ink/55` / `text-ink/60` | 辅助文字 |
| `color.primary` | `#355c7d` | Tailwind `denim` | 主操作、选中态、导航激活 |
| `color.success` | `#5f7058` | Tailwind `moss` | 成功、查看、次要确认 |
| `color.ai` | `#b97155` | Tailwind `clay` | AI 入口、高亮操作 |
| `color.shopping` | `#8c4a62` | Tailwind `berry` | 种草、酒红内容色 |
| `color.danger` | `#dc2626` | Tailwind red 系列 | 删除、清空、不可恢复操作 |
| `background.appAmbient` | `radial-gradient(circle at 18% 8%, rgba(185,113,85,0.16) 0, rgba(185,113,85,0) 34%), radial-gradient(circle at 82% 92%, rgba(95,112,88,0.14) 0, rgba(95,112,88,0) 36%), linear-gradient(180deg, #fbfbf8 0%, #f4f5f3 100%)` | 当前登录/注册页视觉基准，需沉淀到全局 Shell | 所有页面底层背景 |

旧原型中的 `Mist #f0f2ee` 不再作为生产 token。若后续确实需要更深背景，新增 `mistDeep`，不要复用 `mist` 旧值。

所有页面的最底层必须使用 `background.appAmbient`。它来自当前登录/注册页的低饱和暖灰、纸白、青灰渐变：左上角保留很淡的 clay 暖光，右下角保留很淡的 moss 冷光，中间以 `paper` 到 `mist` 过渡。顶部毛玻璃、底部导航、Toast、一级卡片和二级卡片都叠在该背景之上；不要把页面底层改回纯白、纯灰或单色渐变。

### 2.2 圆角与同心关系

| 对象 | 半径 | 规则 |
| --- | ---: | --- |
| 手机容器 | `32px` | 预览画板使用，生产容器不强制包一层手机壳 |
| 一级卡片 | `28px` 目标 / 当前代码多为 `rounded-2xl` | 主要内容容器，后续应逐步统一 |
| 一级卡片内图片 | `卡片半径 - 内边距` | 图片与外框保持同心圆角，不同半径但弧度一致 |
| 二级卡片 | `18px-20px` | 一级卡片内部的选择块、空状态、预览块 |
| 普通控件 | `12px-14px` | 筛选、输入、普通按钮 |
| 底部菜单外框 | `26px` | 悬浮毛玻璃圆角矩形 |
| 底部菜单选中项 | `外框半径 - 内边距` | 不使用圆形激活按钮；选中项色块弧线必须与外框同心 |
| 缩略图 | `8px-12px` | 详情胶片栏、录入缩略图、队列图 |

判断标准：外框和内层按钮的弧线要像同一组同心圆。不要把外框做圆角矩形、内层做正圆，除非是明确的 FAB。

底部 4 个功能切换按钮的预览与实现都按同一公式：`activeRadius = outerRadius - inset`。例如外框 `28px`、内边距 `8px` 时，选中项为 `20px`；不得使用 `rounded-full` 或固定圆形激活态。

### 2.3 Glass、阴影与层级

| Token | 目标规范 | 当前代码事实 |
| --- | --- | --- |
| `glass.top.bg` | `rgba(251,251,248,0.75)` | 多处仍为 `#fbfbf8/95` 或实色 |
| `glass.top.blur` | `blur(30px) saturate(1.5)` | `backdrop-blur-xl` / `.surface blur(18px)` |
| `glass.bottom.bg` | `rgba(255,255,252,0.75)` | 底部导航当前 `#fbfbf8/94` |
| `glass.toast.bg` | `rgba(255,255,252,0.88)` | Toast 应比页面卡片更浮，但不能变成实心白卡 |
| `shadow.soft` | `0 18px 50px rgba(29,34,40,0.10)` | Tailwind `shadow.soft` |
| `shadow.card` | `0 18px 50px rgba(29,34,40,0.08)` | `.surface` |

新组件不要裸写新的 glass 参数；如果当前代码未统一，规范记录为“目标契约”，后续改代码时逐步收敛。

### 2.4 Motion

`src/lib/motion-tokens.ts` 是动效事实源。

| Token | 数值 / 用途 |
| --- | --- |
| `duration.fast` | `0.12s`，按钮、轻反馈 |
| `duration.normal` | `0.22s`，普通显隐 |
| `duration.panel` | `0.32s`，Sheet、页面推进 |
| `duration.slow` | `0.45s`，大面积过渡 |
| `ease.app/out` | `[0.2, 0.8, 0.2, 1]` |
| `spring.snappy` | 按钮、Toast、checkmark |
| `spring.soft` | 面板、卡片进入 |
| `spring.gentle` | 大面积转场 |
| 变体 | `fade`、`slideUp`、`toastDrop`、`slideRight`、`slideRightExit`、`scaleModal`、`tabFade`、`staggerReveal`、`pop` |

所有动画必须遵守 reduced-motion；减少大位移，保留必要的显隐和状态反馈。

#### 2.4.1 动效修复目标契约（Wave 0 冻结）

本节是 2026-07-13 动效修复批次的公共接口契约。并行 Session 只能实现或消费这些语义，不得在各页面另造一套 token、速度投影或返回优先级。

| 语义 | 目标行为 |
| --- | --- |
| `spring.control` | 无弹跳、临界阻尼；按钮、选中指示器和普通状态反馈 |
| `spring.panel` | 无弹跳、可中断；Sheet、Dialog 和页面层级运动 |
| `spring.momentum` | 仅用于真实 drag/flick 释放，继承手指速度并允许轻微回弹 |
| `motionDistance` | `near=4px`、`page=12px`、`panel=24px`；禁止单页新增随意位移档位 |
| `projectGesture` | 使用释放前短历史速度投影终点，再选择 snap point；不得只看释放位置 |
| `rubberBand` | 越界阻力随距离渐增；不得固定比例硬折损或直接硬停止 |

手势驱动表面必须从当前屏幕呈现值接管，Pointer Events 使用 pointer capture，横纵意图阈值为 `8–10px`，拖动阶段由 MotionValue/transform 驱动而不是逐帧 React state。释放动画继承真实速度；快速反向必须从当前 x/y 与 velocity 重定向。

reduced-motion 下取消大位移、spring、stagger、smooth scroll 和 `height:auto` 补间，保留 `120–160ms` cross-fade 或即时状态反馈。reduced-transparency、高对比或不支持 backdrop-filter 时，浮动材料改为近实心背景和清晰边界。

### 2.5 Icon

图标事实源是 `lucide-react`，开发时只能从该库选择图标；不得用文字、emoji、特殊符号、CSS 伪元素或临时手绘 SVG 替代图标。若库内没有合适图标，先调整语义或登记设计债务，不允许直接造一个只在单页使用的新图标。

| 场景 | lucide 图标 | 尺寸 |
| --- | --- | ---: |
| 搜索 | `Search` | `20px` |
| 统计 | `BarChart3` | `20px` |
| AI / 诊断 | `Sparkles` 或当前代码已用的 `WandSparkles` | `18px-20px` |
| 衣橱 Tab | `Shirt` | `20px` |
| 套装 Tab | `Sparkles` / `Layers`，按当前产品语义二选一并保持全局一致 | `20px` |
| 种草 Tab | `ShoppingBag` | `20px` |
| 设置 Tab | `Settings` | `20px` |
| 返回 | `ChevronLeft` | `20px-24px` |
| 删除 | `Trash2` | `18px-20px` |
| 裁切 | `Crop` | `18px-20px` |

Icon-only 按钮必须有 `aria-label`；图标与文字组合时图标使用 `aria-hidden="true"`。

## 3. Viewport 与 Safe Area

| 尺寸 | 用途 |
| --- | --- |
| `390 x 844` | 当前真实业务流截图源，作为结构事实源 |
| `360 x 780` | 小屏 Android 验收 |
| `375 x 812` | 小屏 iPhone / 刘海屏验收 |
| `412 x 915` | 大屏 Android 验收 |
| `430 x 932` | 大屏 iPhone 验收 |

规则：

- 页面结构以 `docs/designs/v03-alpha-real-screenshots/` 的真实业务流截图为准；截图只证明页面结构和真实状态，不代表最终视觉标准。
- 规范预览不得手绘重排页面结构，也不得把生产截图原样当作合格视觉终稿。
- 只允许在结构不变的前提下优化颜色、圆角、字体、字重、字间距、Icon、阴影和毛玻璃效果。
- 如果需要 2K/高分辨率导出，只能基于真实结构等比输出，不得改变布局层级。
- 顶部固定区使用 `env(safe-area-inset-top)`。
- 底部导航、FAB、Toast、底部操作栏使用 `env(safe-area-inset-bottom)`。
- 录入流、裁切器、Lightbox 使用 `100dvh` 或等价动态视口。
- 360px 宽度不得出现横向滚动；按钮文案必须截断、换行或缩短。
- 软键盘弹出时，当前输入框和主操作按钮不得同时不可操作。

## 4. App Shell

每个页面由以下层组成：

1. 基础页面容器。
2. 独立顶部层：状态栏安全区、标题、返回/关闭、必要筛选或统计。
3. 可滚动内容区。
4. 可选 FAB。
5. 可选底部导航或底部操作栏。
6. 可选覆盖层：Toast、Popover、Sheet、Dialog、Lightbox、Cropper。

顶部层不加硬边框和额外渐变过渡区。滚动内容可经过顶部层下方，但应被 glass 背景遮住。

二级和三级页面的 `AppSubPageTopBar` 必须是透明底 + 毛玻璃层：只保留页面顶部整体 glass，不允许在标题区域下方再画独立矩形条、固定高度色带、实心白色矩形或白色条块；返回、关闭、更多按钮可以保留自己的圆角按钮背景。录入流顶部同样遵守该规则，标题、步骤说明和进度条叠在 glass 层上。

底部导航固定 4 项：

| Tab key | 显示 | 图标语义 | 首页 route |
| --- | --- | --- | --- |
| `wardrobe` | 衣橱 | 衣物 | `wardrobe_home` |
| `recommend` | 套装 | 套装/推荐 | `outfit_home` |
| `shopping` | 种草 | 购物袋 | `wishlist_home` |
| `settings` | 设置 | 齿轮 | `settings_home` |

## 5. Route 与页面状态矩阵

代码事实源是 `src/lib/app-route.ts` 的 `AppRouteName`。画板可覆盖更多“页面级状态”，但不能替代路由事实。

| Route | 所属 Tab | 类型 | 底部导航 | 顶部栏 | 全局创建 | 默认返回 |
| --- | --- | --- | --- | --- | --- | --- |
| `wardrobe_home` | 衣橱 | 主页面 | 是 | 主页面自有顶部区 | 是 | 停留 / 退出确认 |
| `garment_detail` | 衣橱或种草来源 | 详情 | 否 | `AppSubPageTopBar` | 否 | `returnRoute` 或来源页 |
| `outfit_home` | 套装 | 主页面 | 是 | 主页面自有顶部区 | 是 | 停留 / 退出确认 |
| `outfit_detail` | 套装 | 详情 | 否 | `AppSubPageTopBar` | 否 | `outfit_home` 或 `outfit_calendar` |
| `outfit_calendar` | 套装 | 子页面 | 否 | `AppSubPageTopBar` | 否 | `outfit_home` |
| `wishlist_home` | 种草 | 主页面 | 是 | 主页面自有顶部区 | 是 | 停留 / 退出确认 |
| `wishlist_purchased` | 种草 | 子页面 | 否 | `AppSubPageTopBar` | 否 | `wishlist_home` |
| `wishlist_rejected` | 种草 | 子页面 | 否 | `AppSubPageTopBar` | 否 | `wishlist_home` |
| `wishlist_archived` | 种草 | 子页面 | 否 | `AppSubPageTopBar` | 否 | `wishlist_home` |
| `settings_home` | 设置 | 主页面 | 是 | 主页面自有顶部区 | 否 | 停留 / 退出确认 |
| `account_management` | 设置 | 子页面 | 否 | `AppSubPageTopBar` | 否 | `settings_home` |
| `account_deletion` | 设置 | 子页面 / 最终确认 Sheet | 否 | `AppSubPageTopBar` | 否 | `account_management`；处理中不可返回业务页 |
| `change_password` | 设置 | 子页面 | 否 | `AppSubPageTopBar` | 否 | `account_management` |
| `intake_single_item` | 衣橱 | 录入流 | 否 | `IntakeFlowShell` | 否 | `returnTo` |
| `intake_outfit` | 套装 | 录入流 | 否 | `IntakeFlowShell` | 否 | `returnTo` |
| `intake_wishlist` | 种草 | 录入流 | 否 | `IntakeFlowShell` | 否 | `returnTo` |

| Route 类型 | 顶部栏 |
| --- | --- |
| 主页面 | 主页面自有顶部区 |
| 详情页 | `AppSubPageTopBar` |
| 子页面 | `AppSubPageTopBar` |
| 录入流 | `IntakeFlowShell` |
| 覆盖层 | Overlay 自带标题栏 |

视觉画板可以按“页面级状态”覆盖约 36 个状态：衣橱首页、搜索、统计、衣物详情、编辑衣物、裁切/旋转、单品录入两步、套装首页/详情/编辑/实图、套装录入两步、月历、计划增改查、打包清单、种草首页/详情/编辑/录入/加入衣橱/已买/不感兴趣/归档、设置、试穿画像、参考照片、MiniMax、位置、账号、注销、改密。它们是视觉覆盖清单，不是 route 枚举。

账号注销入口固定在账号安全页内容最底端，位于退出登录之后，以红色下划线文字呈现，不使用边框、背景或圆角按钮外观；语义控件仍保留至少 44px 点击热区。注销流程依次为风险告知、已有身份任选一种核验、最终永久注销 Sheet。App 只展示邮箱验证码和当前密码，小程序可额外展示当前已绑定微信。最终确认后的处理中与成功状态不得返回业务页面，且只有服务端确认数据库及图片删除完成后才能展示“账号已注销”。

## 6. Overlay / Sheet / Dialog

当前层级事实：

| 层 | z-index | 规则 |
| --- | ---: | --- |
| 底部导航 | `30` | 固定底部，safe area |
| FAB | `40` | 高于导航，低于 Sheet |
| Sheet / 图片来源 | `50` | 遮罩 + 底部面板 |
| Popover | `70` | 菜单、更多操作 |
| Toast | `75` | 高于 Sheet/Popover，低于 Lightbox |
| Lightbox | `80` | 全屏图片预览 |
| Intake shell | `90` | 全屏录入流 |
| 关键全屏/更多分类 | `100` | 全屏裁切、分类弹层等 |
| 部分保存确认 | `110` | 录入流确认 |
| 录入退出确认 | `120` | 最高确认层 |

返回键 / Escape 优先级：

1. 关闭 Lightbox。
2. 关闭创建 Sheet、图片来源 Sheet。
3. 关闭裁切器。
4. 录入流内部处理返回。
5. 二级页面按 `getBackRoute(route)` 返回。
6. 主 Tab 弹退出确认。

覆盖层契约：

- Toast 不拦截返回，不挤压文档流，关闭按钮命中区 44px。
- Sheet 和 Lightbox 打开时必须锁定底层滚动。当前 `MotionSheet`、`MotionImageLightbox` 和 `WardrobeImageSourceSheet` 均已使用共享锁滚与 Sheet 契约。
- 遮罩点击是否关闭必须逐组件声明。
- 危险操作必须有取消和结果明确的确认按钮，例如“删除 3 件”，不要只写“确定”。

#### 6.1 OverlayRoot / OverlayStack 公共接口

- `OverlayRoot` 在 App 壳层只挂载一次，所有 Sheet、Dialog、Popover、Lightbox、Cropper 都 portal 到该根；不得继续受路由 transformed ancestor 限制。
- `OverlayStack` 的 entry 至少包含 `id/kind/dismissible/onDismiss/restoreFocusTo`。注册返回注销函数；只有 topmost entry 能消费 Escape、Android Back、Tab trap 和 backdrop。
- Toast 不注册进 OverlayStack；不可取消的保存、删除、重置事务保留在栈顶，但 `dismissible=false`，关闭请求只反馈“操作进行中”。
- Back/Escape 只有一个全局协调入口。一次事件最多发生一次状态转移；页面私有监听器必须迁移后删除。
- 打开顶层覆盖层时，底层覆盖层及 App 内容设置 inert/不可被辅助技术浏览；关闭后焦点返回原触发器。

`MotionSheet` 的冻结 props：`open/onClose/children`、`variant: action | form | confirm | destructive`、`role`、`ariaLabel | ariaLabelledBy`（二选一）、`closeOnBackdrop`、`closeOnEscape`、`dismissible`、`panelClassName`。共享实现必须保持迁移期向后兼容，业务 Session 不得修改该接口。

`MotionPopoverMenu` 必须持有真实 trigger ref，按 anchor 计算 transform origin，打开后聚焦首项，支持 Arrow/Home/End/Escape，关闭后恢复触发器。`MotionImageLightbox` 和 Cropper 使用相同 topmost/focus/scroll-lock 生命周期。

##### 6.1.1 A1 运行时基线

- `src/components/overlay-root.tsx` 在 `MotionProvider` 内只挂载一次，并在 `document.body` 下创建 `#wardrobe-overlay-root`；注册的 Sheet 通过 `OverlayPortal` 进入该根。
- `src/lib/overlay-stack.ts` 是浮层注册顺序、topmost、关闭拒绝和焦点恢复的唯一状态源。只有 topmost 能处理 Back、Escape、backdrop 和 Tab；下层浮层与 App 内容同步设置 `inert`、`aria-hidden`。
- `src/lib/back-coordinator.ts` 先请求关闭 topmost overlay，再按 `priority + registration order` 查询页面 handler；浮层关闭或拒绝关闭后均不得继续执行页面返回。`useStableBackHandler` 只登记回调，不再创建 Capacitor listener。
- `dismissible=false` 或 `closeOnEscape/closeOnBackdrop=false` 的关闭请求保持当前层，触发 `onDismissBlocked`，并提供“操作进行中”读屏状态；Toast 继续留在栈外。
- A1 只建立共享 Sheet 与顶层返回基线；Lightbox、Popover、Cropper 和遗留页面私有 Back listener 的全面迁移属于 A2，不得把 A1 的局部接入误报为全 App 浮层迁移完成。

##### 6.1.2 A2-Core 共享浮层组件

- `MotionSheet` 延续 A1 冻结接口，Portal、OverlayStack、退出期锁滚和 topmost 焦点圈保持同一生命周期；居中 Dialog 只使用轻微缩放与透明度，不使用弹跳。`dismissible=false` 同时暴露 `aria-busy` 和关闭拒绝播报，不得在事务进行中被 backdrop、Escape 或 Android Back 打断。
- `MotionImageLightbox` 统一进入 `OverlayPortal` 和 `OverlayStack(kind=lightbox)`，使用 `100dvh`、`role=dialog`、`aria-modal`、可访问名称、首焦点与 Tab 圈；关闭动画完成前持续锁滚，低层 Lightbox 必须 `inert/aria-hidden`。
- `MotionPopoverMenu` 统一进入 `OverlayPortal` 和 `OverlayStack(kind=popover)`；真实 trigger ref 同时用于定位、按锚点中心计算 `transform-origin` 和关闭后焦点恢复。打开即聚焦首个可用菜单项，支持 ArrowUp/ArrowDown/Home/End，并由 OverlayStack 消费 Escape。
- Popover 外点关闭在 pointerdown capture 阶段完成。防点击穿只绑定当前 `pointerId`，并在对应 click、pointercancel 或 pointerup 后首帧释放；禁止再使用 400ms 等全局定时点击抑制窗口。
- 共享 Notice Dialog 必须提供可访问名称；危险确认使用 `alertdialog`，异步提交期间必须不可取消。A2-Core 不引入 Sheet 拖拽，拖拽关闭仍由后续手势 Wave 按速度投影和 rubber-band 契约实现。

##### 6.1.3 A2-App 壳层、设置与账号迁移

- App 全局“新建 / 退出”、Auth 登录壳邮箱验证码与退出确认、设置诊断描述 / 成功 / 失败，以及设置内衣橱增删改统一使用冻结 `MotionSheet` 变体；这些区域不得再创建私有 `fixed inset-0` 对话框。
- Auth、设置首页、穿衣画像、参考照片、MiniMax、衣橱列表、账号安全、改密和注销页只通过 `useStableBackHandler` 登记页面决策；`OverlayRoot` 仍是唯一原生 Android Back / document Escape listener。Overlay 优先于页面，页面优先于 App 根退出 fallback。
- 表单、确认和危险确认必须提供可访问名称；打开时焦点进入 topmost，底层 App 与下层浮层保持 `inert/aria-hidden`，关闭后恢复原触发器。诊断遮罩按既有产品语义不关闭，Back / Escape 仍只关闭当前诊断层。
- 衣橱新增、编辑、迁移、删除，画像 / 参考照 / MiniMax 保存，账号改绑 / 改密与最终注销在请求完成和服务端读回前保持当前页面或 Sheet；busy 时 `dismissible=false`，Back、Escape、backdrop、取消和重复提交均不得中断事务。
- 本小节只声明 A2-App 独占区域完成迁移；衣橱列表 / 详情、套装、种草、录入、Lightbox、Popover 与 Cropper 的遗留 listener 或私有覆盖层由 A2-Core / A2-Flows 及后续命名 Wave 负责，不得据此宣称全 App 已无遗留层。

##### 6.1.4 A2-Flows 业务流浮层迁移

- 详情、穿搭计划、打包清单、种草和录入流程的操作面板、表单面板与危险确认统一使用 `MotionSheet`、`MotionPopoverMenu`、`ConfirmActionSheet`；业务组件不再用私有 `fixed inset-0` 遮罩模拟 Dialog/Sheet，也不自行抢占 Back/Escape。
- `IntakeFlowShell` 以 `kind=fullscreen`、全屏 `ImageCropEditor` 以 `kind=cropper` 注册到 OverlayStack，并复用共享 Portal、滚动锁、topmost、焦点圈定、`inert/aria-hidden` 与触发器焦点恢复生命周期；嵌入式裁切仍属于录入 Shell 内容，不重复注册。
- 上传、保存、删除、重置、种草转衣橱或裁切应用进行中时，当前层保持 `dismissible=false`；Android Back、Escape、遮罩和显式关闭不得中断事务，关闭请求提供“操作进行中”反馈。失败后保留当前确认层、输入草稿与重试入口，成功仅在服务器提交并读回后关闭。
- Popover 的 `anchorRef` 必须指向当前可见的触发按钮。种草首页菜单、种草详情菜单、套装详情菜单与穿搭实图菜单不得复用不可见页或无关表单控件的 ref。
- 页面级 `useStableBackHandler` 只负责选择模式、未保存草稿和子页导航；OverlayStack 先处理 Sheet、Dialog、Popover、Lightbox、Cropper。一次返回事件只关闭或拒绝一个 topmost 状态，不继续穿透到页面导航。
- 本节只迁移浮层生命周期和 busy 安全，不改轮播/日历轨道、裁切阻尼、手势物理或路由导航结构；相关连续性与手势优化仍由后续专属 Wave 实施。

##### 6.1.5 B3 周计划 / 月历直接操控

- 周计划条与月历都常驻“上一页 / 当前页 / 下一页”三页轨道。拖动和释放阶段只更新横向 `MotionValue/transform`；提交单页后再更新父级日期事实并无缝回中，五行与六行月份都不得先卸载当前页或闪空。
- 轨道固定 `touch-action: pan-y`，横纵意图阈值为 `9px`；纵向或纵向占优的斜向手势不得抢占页面滚动，只有横向意图成立后才 pointer capture。拖动阶段保持手指与轨道 `1:1`，仅在三页外缘使用随越界距离渐增的 nonlinear rubber-band。
- 周计划与月历共用 `calendar-track-gesture.ts` 的短历史速度和 snap 计算：只采最近 `110ms`，按 `0.2s` 投影终点，并把结果限制为上一页 / 当前页 / 下一页，单次 flick 不得跨两页。释放使用无弹跳、可中断 spring；新 pointerdown 从当前呈现 x 接管，途中反向不得先跳回旧目标。
- 左右箭头与拖动必须进入同一 snap 状态机。连续同向点击按顺序执行且不吞步；动画中点击反向箭头先重定向当前轨道，不能并发启动第二套月 / 周切换动画。
- 日期选中态使用共享 `layoutId` 的背景层移动，不以旧背景消失、新背景重新淡入伪装连续性。月历日期详情使用位置布局、透明度与裁切显隐；不得补间 `height:auto`。reduced-motion 下切页、选中和详情展开即时完成，不运行 spring 或大位移。
- `monthDate/selectedDate` 与周计划对应日期仍由父级持有；组件重挂载时从父级选中日期恢复展开详情，不增加模块级缓存、隐藏持久化或第二份返回上下文。日卡按钮、busy 写入和服务器读回边界保持原有业务语义。

#### 6.2 并行 Wave 规范所有权

并行 Session 对运行时文件实行独占所有权；规范只允许修改下列命名小节。生成的 HTML 与 `VERSION_HISTORY.md` 在每个 Wave 合入后由主 Agent 保全并重生成。

| Wave | 规范小节所有者 |
| --- | --- |
| A1 | OverlayRoot、OverlayStack、BackCoordinator 公共契约 |
| A2-Core / App / Flows | 共享浮层组件 / App 壳与账号 / 业务流浮层 |
| B1 / B2 / B3 | 即时反馈 / 图片手势 / 周历月历手势 |
| B4 / C1 / C2 | 录入手势 / 路由运动 / 详情连续性 |
| C3-Outfit / Settings / Wishlist | 穿搭计划 / 设置账号 / 种草深层流程 |
| D1-Runtime / Contracts / Android | 偏好与性能 / 防回归合同 / Android 验收 |

## 7. 核心组件 Contract

生产 UI 优先复用下列组件；重复私有实现视为设计债务。

| 组件 | 事实源 | 契约 |
| --- | --- | --- |
| `AppSubPageTopBar` | `src/components/app-sub-page-top-bar.tsx` | 二级页顶部；`title/subtitle/onBack/rightAction/onMore`；无右侧操作时不渲染无意义白框 |
| `DetailShell` / `DetailHeroGallery` | `src/components/detail-shell.tsx` | 详情媒体、胶片栏、标题元信息、快捷操作；名称与 meta 不放进一级卡片 |
| `CatalogWaterfallCardShell` | `src/components/item-shell/catalog-waterfall-card-shell.tsx` | 固定 `h-[304px]`，媒体 `210px`，文本 `94px`；普通点击打开，多选点击切换 |
| `CatalogWaterfallGrid` | `src/components/item-shell/catalog-waterfall-grid.tsx` | 移动端 2 列，`md` 3 列，`xl` 4 列 |
| `ItemColorFields` | `src/components/item/color-fields.tsx` | 颜色展示和编辑唯一入口 |
| `TemperatureRangeSlider` | `src/components/temperature-range-slider.tsx` | 温度范围编辑唯一入口 |
| `MotionToast` | `src/components/motion-common.tsx` | 动画和播报语义；视觉由调用方提供 |
| `MotionSheet` | `src/components/motion-common.tsx` | 移动端底部抽屉、锁滚、最高 92vh |
| `MotionImageLightbox` | `src/components/motion-common.tsx` | 全屏图片预览、锁滚、关闭按钮 44px |
| `IntakeFlowShell` | `src/components/intake-flow-shell.tsx` | 录入全屏容器、步骤文案、底部操作、安全区 |

### 7.1 详情媒体

| Slide kind | 标签 | 用途 | 胶片栏 |
| --- | --- | --- | --- |
| `garment_main` | 主图 | 衣物主图 | 是 |
| `garment_reference` | 灵感 | 衣物灵感图 | 是 |
| `outfit_cover` | 主图 | 套装封面 | 是 |
| `outfit_real` | 套装示意 | 套装实拍/示意 | 是 |
| `wishlist_product` | 商品图 | 种草商品图 | 当前否 |

空图必须保持 hero 框架稳定并显示 fallback。

### 7.2 瀑布流与多选

- 列表卡片统一使用 `CatalogWaterfallGrid` + `CatalogWaterfallCardShell`。
- 标题、meta、summary 必须单行截断，不能折行或撑高卡片；超出内容使用省略号。
- 选中态必须同时有 Denim 边框/环、勾选图标和 `aria-pressed`。
- 多选模式由 `selectedIds.size > 0` 派生。
- 普通模式点击打开详情；多选模式点击切换选中；长按/右键进入或切换多选。
- 批量操作栏只在有选中项时出现，底部固定并考虑 safe area；删除必须先弹确认 Sheet，删除中禁止关闭。

## 8. 领域 UI 映射

### 8.1 分类与细分

一级分类事实源是 `src/lib/types.ts`：

| 值 | 中文 |
| --- | --- |
| `tops` | 上衣 |
| `pants` | 裤子 |
| `skirts` | 半身裙 |
| `one_piece` | 连体装 |
| `shoes` | 鞋 |
| `bags` | 包 |
| `hats` | 帽子 |
| `jewelry` | 首饰 |
| `accessories` | 配饰 |

二级细分事实源是 `src/lib/garment-category-catalog.ts`。分类和细分在 UI 上属于同一张一级卡片，不拆成两个孤立矩形。

### 8.2 颜色

颜色事实源是 `src/lib/color-catalog.ts`。

- 标准色共 26 个。
- 常用色 12 个：黑、白、灰、米白、米、卡其、棕、蓝、牛仔蓝、绿、红、粉。
- 扩展色 14 个，分为中性与大地色、红橙黄色系、蓝绿色系、特殊色。
- 颜色模式只能是 `single`、`main_with_accent`、`multicolor`。
- 未知颜色归一返回 `null`，不得用 `includes` 模糊匹配。
- 详情展示必须按色卡显示，不用“白色 · 藏蓝”纯文本替代。

`ItemColorFields` view 模式显示主色、必要时显示辅助色、颜色模式；edit 模式显示模式切换、已选颜色、12 常用色、展开 14 扩展色。

### 8.3 温度

`TemperatureRange` 为 `{ minC?: number; maxC?: number }`。

- 编辑 / 录入滑条范围事实源为 `-20℃ ~ 40℃`，步进 `1℃`。
- 详情展示按温度条，不用纯文本框；展示态只显示选中区间及其约 `±10%` 上下文，不展示 `-20℃` 和 `40℃` 全域端点。
- 温度条轨道使用蓝到红渐变，低温端为蓝，高温端为红。
- 编辑滑条命中区不小于 44px，视觉手柄 20px。
- 点击轨道不改变数值；只有按住 handle 才拖动。
- 键盘支持 Arrow / Home / End。
- 两个 handle 使用 `role="slider"` 和 `aria-valuemin/max/now`。

### 8.4 季节、风格、状态

季节、风格、状态必须从 `src/lib/types.ts` 和显示标签工具派生。新增枚举时同步：类型、显示 label、AI prompt、测试、规范。

## 9. 录入流程状态机

用户可见只允许两步：

| Step | ID | 标题 | 用户目标 | 主按钮 |
| ---: | --- | --- | --- | --- |
| 1 | `select_photo` | 选择照片 | 拍照/图库选择，可裁切旋转 | 下一步（AI 识别） |
| 2 | `confirm_params` | 确认信息 | 复核 AI 结果、修改字段、保存 | 保存 N 件单品/种草 |

内部子状态不是新步骤：

| 子状态 | 属于 | UI 要求 |
| --- | --- | --- |
| `idle_empty` | Step 1 | 空状态、拍照、图库入口 |
| `image_queue` | Step 1 | 缩略图队列，当前图 Denim 边框 |
| `crop` | Step 1 子状态 | 裁切/旋转，返回先退出裁切 |
| `recognizing` | Step 1 -> Step 2 | 过渡态，不显示第三步 |
| `recognized` | Step 2 | 字段预填，显示来源和置信度 |
| `recognition_failed` | Step 2 | 失败草稿，可手动补全/重新识别 |
| `retrying` | Step 2 | 仅当前件局部 loading |
| `retry_failed` | Step 2 | 保留旧草稿并提示失败 |
| `partial_save_confirm` | Overlay | 说明未完成项不会入库 |
| `saving` | Step 2 | 禁止重复提交 |
| `save_failed` | Step 2 | 草稿保留，可重试 |

页面标题不得出现 `3 / 3`。保存按钮数量必须等于真实可保存数量。

规范预览必须使用真实业务流截图展示录入实际状态；截图包未捕获的子页面不得手绘补位。

Step 1 顶部必须使用透明底 + 毛玻璃层，不得在标题、步骤说明或进度条后方绘制实心白条。拍照、从图库选择、继续拍照和继续从图库选择入口全部使用最新圆角矩形控件：外框与内部图标槽保持同心圆角，按钮之间不使用旧版直角白卡或大面积实心白底。

## 10. AI 与系统状态

### 10.1 AI 状态

| 状态 | UI |
| --- | --- |
| `recognizing` | 显示识别中，不新增步骤 |
| `recognized_high_confidence` | 正常预填 |
| `recognized_low_confidence` / `needsReview` | 字段待确认，不只靠颜色提示 |
| `recognition_failed` | 失败 banner + 手动补全 + 重新识别 |
| `retrying` | 当前件局部 loading |
| `retry_failed` | 保留旧草稿 |
| `partial_save_confirm` | 明确“未完成的 N 件不会入库” |
| `save_failed` | 当前页保留草稿，可重试 |

### 10.2 系统状态

| 状态 | 当前事实 / 目标 |
| --- | --- |
| `auth_initializing` | `AuthGate` 初始化 |
| `unauthenticated` | 登录/注册入口 |
| `auth_blocked` | 账号阻断/退出确认 |
| `workspace_loading` | `WorkspaceGate` 加载 |
| `workspace_error` | `OnlinePageError` + 重试 |
| `sync_refreshing` | 页面内轻提示 |
| `sync_refresh_error` | `OnlineInlineNotice` + 重试 |
| `offline/no_network` | 现有能力分散，规范目标是统一 banner/Toast |
| `camera_permission_denied` | 文案提示前往系统设置开启 |
| `ai_key_missing` | 引导到设置页 |
| `diagnostic_uploading/success/failed` | 设置页诊断上传状态，失败码要可读 |

## 11. 通知 Toast

- Toast 悬浮在所有页面内容之上，不参与文档流。
- 宽度与底部操作栏同一内容宽度，底部定位在导航上方：`env(safe-area-inset-bottom) + 5.25rem`。
- 当前层级 `z-[75]`；Lightbox 或裁切器打开时隐藏。
- Error 使用 `role="alert"` + `aria-live="assertive"`；success/info 使用 `role="status"` + `aria-live="polite"`。
- 关闭按钮命中区 44px。
- 样式：圆角矩形、毛玻璃背景、左侧语义图标槽、右侧关闭/动作按钮。
- Toast 只有正文，不区分标题和正文；不得再使用 `title + description`、`strong + small` 或两套字重表达层级。
- 一行 Toast：最常见成功反馈，正文单行截断，整体高度约 `52px-56px`。
- 两行 Toast：用于带动作的提醒，例如缺少 MiniMax Key；正文最多两行，操作按钮仍在右侧。
- 三行 Toast：只用于较长错误或权限说明；正文最多三行，超出时改用 Sheet 或页面内提示，不继续撑高 Toast。
- 左侧语义图标槽和右侧关闭按钮都按 Toast 总高度上下居中；一行、两行、三行使用同一居中规则，三行错误态不得让图标贴近顶部。
- 不使用满高竖条、粗色条或顶部窄条表达状态；状态由 `lucide-react` 图标、轻 tint 图标槽和细边框表达。
- Success 图标槽用 `moss` tint，Info / Key 缺失用 `denim` tint，Error 用 `danger` tint。
- 有动作时按钮放右侧，例如 MiniMax Key 缺失使用 `前往设置` 主按钮；按钮与 Toast 外框保持同心圆角。
- MiniMax Key 缺失 Toast 只在每次 App 启动后检测到未输入 Key，或首次登录后检测到未输入 Key 时弹出一次；点击 `前往设置` 必须直达 MiniMax Key 输入页，不是泛化设置首页。
- Toast 允许覆盖 FAB 和底部内容，不得把页面内容往上挤。

相关未改代码约束：二级/三级页面 TopBar 不得出现实心白条；录入页顶部同样使用透明底毛玻璃；拍照/从图库选择入口必须使用最新圆角矩形控件。

## 12. 无障碍

- 所有可点控件命中区不小于 44px；若视觉尺寸更小，必须通过外层区域补足。
- Icon-only 按钮必须有 `aria-label`。
- 选择态不能只靠颜色，必须有勾选、边框、文本或 `aria-pressed`。
- 表单 focus 必须可见。
- 错误、低置信、待确认必须有文字提示。
- Sheet / Lightbox / 裁切器打开时锁定底层滚动；目标是补齐 `role="dialog"`、`aria-modal` 和焦点管理。

当前事实：`AppSubPageTopBar` 外层按钮命中区为 `48x48`，内层视觉圆为 `40x40`；后续改动不得回退成只有 `40x40` 命中区。

## 13. 文字规范

- 步骤数必须跟真实流程一致：单品/种草录入显示 `步骤 1 / 2`、`步骤 2 / 2`。
- 按钮文案写结果：`保存 3 件单品`、`删除 2 件`、`下一步（AI 识别）`。
- 危险操作必须写影响范围，不用“确定”替代结果。
- 页面内不解释 UI 形式，不写“这是毛玻璃”“点击这里进入下一页”。
- 错误文案要说明草稿是否保留、能否重试、下一步做什么。

## 14. Known Deviations / UI Debt

本节只登记 v0.2-final 已知差异。所有差异必须有编号、文件、当前事实、目标契约、处理版本和验收方式。新增差异不得无编号进入代码。

| ID | 文件 | 当前事实 | 目标契约 | 处理版本 | 验收 |
| --- | --- | --- | --- | --- | --- |
| UI-DEBT-001 | `src/app/globals.css` | `.surface` 仍使用局部 glass 参数 | 统一到 token 命名 | v0.3 | `test:logic:ui-token-contract` |
| UI-DEBT-002 | `src/components/motion-common.tsx` | `MotionSheet` 已在 v0.2-final 补齐 dialog 语义与焦点管理 | `role/dialog`、`aria-modal`、锁滚、焦点进入和恢复 | closed in v0.2-final | `test:logic:ui-overlay-contract` |
| UI-DEBT-003 | `src/components/wardrobe-image-source-sheet.tsx` | 图片来源弹层已在 v0.2-final 委托 `MotionSheet` | 统一 Sheet 行为 | closed in v0.2-final | `test:logic:ui-overlay-contract` |
| UI-DEBT-004 | `src/components/app-sub-page-top-bar.tsx` | 顶部栏按钮已在 v0.2-final 对齐外层 48px 热区、内层 40px 视觉圆 | 外层 48px 热区，内层 40px 视觉圆 | closed in v0.2-final | `test:logic:ui-a11y-contract` |
| UI-DEBT-005 | `src/components/intake-flow-shell.tsx` | 旧 6 步常量已删除或标记为 legacy debug-only | 正式录入只保留两步事实源 | closed in v0.2-final | `test:logic:intake-fullscreen-layout` |

## 15. 文档治理

| 文件 | 状态 | 说明 |
| --- | --- | --- |
| `docs/designs/wardrobe-ui-spec.md` | final source | 唯一事实源 |
| `docs/designs/wardrobe-ui-spec.html` | generated preview | 可视预览，必须同步 MD |
| `docs/designs/six-page-unified-item-pages-v2.md` | legacy reference | 历史设计参考，不覆盖本规范 |

PR 规则：

- 新增 route：同步 `Route 与页面状态矩阵` 和 `npm run test:logic:app-route`。
- 新增核心 token：同步本规范、Tailwind/CSS/Motion。
- 新增或改核心组件：同步组件 Contract 和对应测试映射。
- 新增 overlay：登记 z-index、关闭方式、是否锁滚、是否拦截返回。

## 16. 产品视觉方案实操

本节用上面的规范拼出主要页面小稿，作为开发前快速对齐用。它不是新路由，也不替代 `Route 与页面状态矩阵`。

- 衣橱首页：顶部 glass、筛选、瀑布流、底部导航、FAB。
- 衣物详情：3:4 主图、胶片栏、名称属性直接落在底层、色卡、温度条。
- 单品录入：两步流程、选图、缩略图、裁切/旋转入口、底部操作栏。
- 套装首页：周历横滑、套装缩略图、计划入口。
- 种草首页：商品图、状态、加入衣橱/已买/不感兴趣入口。
- 设置页：账号、MiniMax、试穿画像、位置、诊断等列表入口。
- 本节必须用真实业务流截图作为结构底图，覆盖衣橱、套装、种草、设置及其已捕获的详情/子页面；每张图都要标明页面识别和视觉优化参考，不得用自画卡片替代生产结构。

## 17. 验收与测试映射

### Android edge-to-edge 与安全区

- Android 15+ 与异形屏统一使用系统 `WindowInsetsCompat.Type.systemBars()`，由原生层发布 `--android-safe-area-top`、`--android-safe-area-bottom`；禁止按品牌、机型或固定像素补丁适配。
- Web 页面取 `max(env(safe-area-inset-*), var(--android-safe-area-*))`。顶部玻璃壳位于状态栏下方，底部页面背景延伸到手势区，固定操作栏内容位于导航 inset 之上。
- 冷启动、页面直达、系统相册返回和后台恢复均重新申请 inset；状态栏与导航栏保持透明并使用适合浅色页面的深色系统图标。

| 变更范围 | 必跑脚本 / 检查 |
| --- | --- |
| 路由/返回 | `npm run test:logic:app-route` |
| 详情框架/媒体 | `npm run test:logic:detail-shell` |
| 组件复用 | `npm run test:logic:component-reuse` |
| 色卡 | `npm run test:logic:color-catalog` |
| 温度范围 | `npm run test:logic:temperature-confidence` |
| 录入流程 | `npm run test:logic:garment-intake-multi-image`、`npm run test:logic:intake-entry-crop-regression`、`npm run test:logic:intake-fullscreen-layout` |
| 多选/批量删除 | `npm run test:logic:catalog-multi-select`、`npm run test:logic:catalog-multi-select-integration` |
| 设置页窄屏 | `npm run test:logic:ui-overflow` |
| 静态 HTML 规范 | Playwright 打开 `docs/designs/wardrobe-ui-spec.html`，检查桌面和 390px 无横向溢出 |

人工视觉检查至少覆盖：

- 360px / 390px / 430px 宽度。
- 顶部 glass、底部导航、Toast 同屏。
- 瀑布流滚动时顶部遮罩。
- 录入两步、裁切/旋转、失败草稿、部分保存确认。
- 详情页颜色色卡、温度条、媒体胶片栏。
