# 微信小程序 UI 规范消化摘要

事实源：`docs/designs/wardrobe-ui-spec.md`、`src/lib/motion-tokens.ts`、`src/components/motion-common.tsx`、`tailwind.config.ts`、`src/app/globals.css`、`docs/designs/v03-alpha-real-screenshots/`。

## 落地原则

- 手机竖屏优先，默认覆盖 360-430px 宽度；按钮、标签、卡片文字必须防溢出。
- 页面第一屏直接是可用 App，不做营销页。
- 底层背景统一使用 `background.appAmbient`：左上 clay 暖光、右下 moss 冷光、`paper -> mist` 纵向过渡。
- 本批只做 UI 规范、token 和基础组件骨架，不写业务页面逻辑。
- React Motion 不直接迁移到小程序；只迁移动效时长、层级和 reduced-motion 约束。

## Token 摘要

| Token | 值 | 用途 |
|---|---|---|
| `--color-ink` | `#1d2228` | 主文字、深色图标 |
| `--color-paper` | `#fbfbf8` | 页面底色 |
| `--color-mist` | `#f4f5f3` | 次级背景、分段控件 |
| `--color-surface` | `#fffffc` | 卡片、浮层 |
| `--color-line` | `rgba(29, 34, 40, 0.10)` | Hairline 边框 |
| `--color-muted` | `rgba(29, 34, 40, 0.56)` | 辅助文字 |
| `--color-primary` | `#355c7d` | 主操作、选中态 |
| `--color-success` | `#5f7058` | 成功、次要确认 |
| `--color-ai` | `#b97155` | AI 入口、高亮 |
| `--color-shopping` | `#8c4a62` | 种草 |
| `--color-danger` | `#dc2626` | 删除、危险操作 |

圆角：`control 24rpx`、`card 56rpx`、`card-inner 40rpx`、`sheet 52rpx`、`thumb 20rpx`、`pill 999rpx`。外框与内层图片/按钮保持同心圆角，不混用正圆激活态。

字体：页面标题 `44rpx/1.15/700`，区块标题 `34rpx/1.25/700`，正文 `28rpx/1.55/400`，辅助 `24rpx/1.45/400`，标签 `22rpx/1.2/600`。字体使用系统栈，不引入字体包。

间距：`4rpx` 步进，常用 `4/8/12/16/24/32/40/48rpx`；页面水平内边距默认 `32rpx`。

## 组件风格

- 卡片：半透明 `surface`、低对比边框、柔和阴影；密集列表少用强玻璃。
- 按钮：主 CTA 胶囊圆角，最小高度 `88rpx`；图标按钮命中区不小于 `80rpx`。
- 输入：`88rpx` 高，错误态只用 `danger` 描边和短说明。
- 空状态：图标 + 标题 + 一句说明 + 可选 CTA，不放大面积营销插画。
- Sheet：底部上滑、最高 `92vh`、蒙层、拖拽柄和底部 safe area。
- 分段控制/标签：单行截断，选中态用柔和底色 + 轻描边。

## 动效映射

Web 事实源：`fast 120ms`、`normal 220ms`、`panel 320ms`、`slow 450ms`，小程序用 WXSS transition/animation 映射。`motion-reduced` 类关闭动画和过渡，供后续设置页或系统偏好桥接。

## 图标迁移

Web 事实源是 `lucide-react`，小程序不能直接引用 React 包。本批采用 `ui-icon` 统一入口 + `assets/icons/*.svg` 本地 mask 资产，先覆盖 `home`、`wardrobe`、`camera-plus`、`sparkles`、`user`、`settings`、`chevron-right`、`x`、`check`、`loader`。后续可用正式 lucide SVG 替换同名文件，并更新 `icon-license.md`。

## v0.3-alpha 候选项

- P0：真实页面结构为事实源，不重排主流程。
- P0：`background.appAmbient` 进入 `styles/tokens.wxss`。
- P0：底部导航、Sheet、卡片层级统一 token，不允许业务页私写一套。
- P1：图标统一经 `ui-icon`；不得用 emoji/文字替代。
- P1：窄屏通过 `min-width: 0`、`text-overflow`、`word-break` 防止溢出。
- P2：骨架屏、AI 状态后续基于基础组件扩展，本批不写业务状态。
