# 小程序图标来源与 License

本批在 `apps/wechat-miniprogram/assets/icons/` 放入首批自绘线性 SVG mask 资产，用于 `ui-icon` 和 `custom-tab-bar` 骨架验证。资产语义参考 Web 端当前 `lucide-react` 图标用法，但未复制 lucide 源文件。

当前自绘资产版权归本项目，可随项目使用和修改。

若后续改为从 lucide 导出正式 SVG：

- 来源：`lucide-icons/lucide` 或 npm 包 `lucide-react` 对应图标。
- License：ISC License。
- 必须记录 lucide 版本和导出方式。
- 资产命名保持语义名，不暴露 React 组件名到业务 WXML。
- 业务层只能通过 `components/ui/icon` 使用图标，不直接引用文件路径。

首批语义名：`home`、`wardrobe`、`camera-plus`、`sparkles`、`user`、`settings`、`chevron-right`、`x`、`check`、`loader`。
