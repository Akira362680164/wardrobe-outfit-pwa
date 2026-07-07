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

旧原型中的 `Mist #f0f2ee` 不再作为生产 token。若后续确实需要更深背景，新增 `mistDeep`，不要复用 `mist` 旧值。

### 2.2 圆角与同心关系

| 对象 | 半径 | 规则 |
| --- | ---: | --- |
| 手机容器 | `32px` | 预览画板使用，生产容器不强制包一层手机壳 |
| 一级卡片 | `28px` 目标 / 当前代码多为 `rounded-2xl` | 主要内容容器，后续应逐步统一 |
| 一级卡片内图片 | `卡片半径 - 内边距` | 图片与外框保持同心圆角，不同半径但弧度一致 |
| 二级卡片 | `18px-20px` | 一级卡片内部的选择块、空状态、预览块 |
| 普通控件 | `12px-14px` | 筛选、输入、普通按钮 |
| 底部菜单外框 | `26px` | 悬浮毛玻璃圆角矩形 |
| 底部菜单选中项 | `外框半径 - 内边距` | 不使用圆形激活按钮 |
| 缩略图 | `8px-12px` | 详情胶片栏、录入缩略图、队列图 |

判断标准：外框和内层按钮的弧线要像同一组同心圆。不要把外框做圆角矩形、内层做正圆，除非是明确的 FAB。

### 2.3 Glass、阴影与层级

| Token | 目标规范 | 当前代码事实 |
| --- | --- | --- |
| `glass.top.bg` | `rgba(251,251,248,0.75)` | 多处仍为 `#fbfbf8/95` 或实色 |
| `glass.top.blur` | `blur(30px) saturate(1.5)` | `backdrop-blur-xl` / `.surface blur(18px)` |
| `glass.bottom.bg` | `rgba(255,255,252,0.75)` | 底部导航当前 `#fbfbf8/94` |
| `glass.toast.bg` | `rgba(255,255,252,0.95)` | 当前 Toast `bg-white/95 backdrop-blur-md` |
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

## 3. Viewport 与 Safe Area

| 尺寸 | 用途 |
| --- | --- |
| `390 x 844` | 主视觉基准 |
| `360 x 780` | 小屏 Android 验收 |
| `375 x 812` | 小屏 iPhone / 刘海屏验收 |
| `412 x 915` | 大屏 Android 验收 |
| `430 x 932` | 大屏 iPhone 验收 |

规则：

- 主内容宽度按手机竖屏设计，建议最大内容宽度不超过 `430px`，桌面预览只用于规范走查。
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

视觉画板可以按“页面级状态”覆盖约 36 个状态：衣橱首页、搜索、统计、衣物详情、编辑衣物、裁切/旋转、单品录入两步、套装首页/详情/编辑/实图、套装录入两步、月历、计划增改查、打包清单、种草首页/详情/编辑/录入/加入衣橱/已买/不感兴趣/归档、设置、试穿画像、参考照片、MiniMax、位置、账号、改密。它们是视觉覆盖清单，不是 route 枚举。

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
- 标题、meta、summary 必须截断，不能撑高卡片。
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

- 范围事实源为 `-20℃ ~ 40℃`，步进 `1℃`。
- 详情展示按温度条，不用纯文本框。
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
- 样式：圆角矩形、毛玻璃背景、左侧语义标记；不要做顶部窄条或普通页面卡片。

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

## 16. 验收与测试映射

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
