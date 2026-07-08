# 微信小程序 UI 可行性与降级矩阵

| UI 要求 | 支持度 | 小程序实现 | 降级 / 注意事项 |
|---|---:|---|---|
| 颜色 token、圆角、阴影 | 高 | `styles/tokens.wxss` + CSS 变量 | 业务页只引用 token |
| `background.appAmbient` | 高 | `page` 复刻 radial + linear gradient | 低端机仍有 `mist` 纯色兜底 |
| 3:4 单品媒体 | 高 | 固定容器比例 + `image mode` | 基础组件不绑定业务图片 |
| 自定义顶部导航 | 高 | `navigationStyle: custom` + safe area | 本批不写页面导航逻辑 |
| 自定义底部 tab | 高 | `custom-tab-bar` + `ui-icon` | 依赖 `app.json` 开启 custom tabBar |
| Sheet / Dialog | 高 | `ui-sheet` 蒙层 + 底部面板 | 复杂焦点管理后续补 |
| 骨架屏、空状态 | 高 | 本批提供 `ui-empty-state` | 骨架按业务列表/详情后续补 |
| 毛玻璃 | 中 | `backdrop-filter` + 半透明背景 + 边框 + 阴影 | 不支持 blur 时仍有层级 |
| Motion token | 中 | WXSS transition / animation | 不照搬 Framer Motion |
| `lucide-react` 图标 | 低 | 本地 SVG mask + `ui-icon` | 当前为自绘占位，正式导出后替换 |
| Web grid / masonry | 中 | flex 双列或稳定瀑布流 | 避免复杂 CSS grid 依赖 |
| reduced-motion | 中低 | `.motion-reduced` 类禁用动画 | 提供应用级开关接口 |
| 安全区 | 高 | `env(safe-area-inset-*)` + fallback | 页面壳和 tab bar 必须使用 |
| 窄屏防溢出 | 高 | `min-width: 0`、截断、换行 | 主按钮优先短文案 |

## 本批边界

- 不实现业务页面逻辑。
- 不修改 `apps/wechat-miniprogram/package.json`。
- 不引入第三方 UI 框架或图标包。
- 不上传体验版、不做云写入。
- 原项目要求改动后更新 `VERSION_HISTORY.md`，但本任务明确限制写入范围，本批不修改。
