# 微信开发者工具 IDE 与 CLI

## 本机约定

- CLI：`wechatide`
- 默认 clientName：`wardrobe-mini`
- 小程序项目路径：`apps/wechat-miniprogram`
- 小程序 AppID：`wx14a1a85b7b3844d0`
- 本机 skill 目录：`/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/miniprogram-dev-skill`
- 当前已知 skill 版本：`v0.1.18`

可用环境变量覆盖：

```bash
WECHATIDE_BIN=/usr/local/bin/wechatide
WECHATIDE_CLIENT=wardrobe-mini
WECHATIDE_PROJECT=/absolute/path/to/apps/wechat-miniprogram
WECHATIDE_SKILL_DIR=/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/miniprogram-dev-skill
```

## 首次准备

1. 安装微信开发者工具 Stable 版。
2. 使用管理员或开发者微信扫码登录。
3. 打开「设置 / 安全设置 / 服务端口」。
4. 确认小程序 AppID 已写入 `apps/wechat-miniprogram/project.config.json`。
5. 用 CLI 做只读状态检查：

```bash
node apps/wechat-miniprogram/scripts/wechatide-status.mjs
```

如果返回未登录、授权失败、DevTools 未启动或 skill 版本 warning，先按提示完成扫码、授权或更新，不绕过。

## 常用本地流程

查看脚本帮助：

```bash
node apps/wechat-miniprogram/scripts/wechatide-status.mjs --help
node apps/wechat-miniprogram/scripts/wechatide-help.mjs --help
node apps/wechat-miniprogram/scripts/wechatide-open.mjs --help
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --help
node apps/wechat-miniprogram/scripts/wechatide-page.mjs --help
node apps/wechat-miniprogram/scripts/wechatide-debug.mjs --help
node apps/wechat-miniprogram/scripts/wechatide-preview.mjs --help
node apps/wechat-miniprogram/scripts/wechatide-upload.mjs --help
```

只读检查：

```bash
node apps/wechat-miniprogram/scripts/wechatide-status.mjs
```

导入或打开项目：

```bash
node apps/wechat-miniprogram/scripts/wechatide-open.mjs --import-only
node apps/wechat-miniprogram/scripts/wechatide-open.mjs
```

刷新模拟器或检查单文件编译：

```bash
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --refresh
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --file pages/home/index.ts
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --file pages/home/index.wxml
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --file pages/home/index.wxss
```

打开指定页面：

```bash
node apps/wechat-miniprogram/scripts/wechatide-page.mjs --page pages/home/index
node apps/wechat-miniprogram/scripts/wechatide-page.mjs --page pages/wardrobe/index/index --query "locationId=default"
```

读取 console、network 或运行时：

```bash
node apps/wechat-miniprogram/scripts/wechatide-debug.mjs --runtime currentPage
node apps/wechat-miniprogram/scripts/wechatide-debug.mjs --console "grep -i error"
node apps/wechat-miniprogram/scripts/wechatide-debug.mjs --network "grep -n ."
```

预览二维码：

```bash
cd apps/wechat-miniprogram
npm run wechatide:preview
```

## 当前禁止动作

以下动作执行前必须先获得用户对具体动作的明确授权：

- `miniprogram_upload`、体验版上传、提审、发布。`wechatide-upload.mjs` 默认拒绝执行，只有带 `--confirm-upload` 才会调用上传。
- `cloud_db_write_*`、`cloud_stor_write`、`cloud_fn_deploy`。
- 删除 DevTools 项目列表项、关闭/退出 DevTools、更新项目配置。
- 任何生产迁移、云资源写入、真实发布链路。

当前 wrapper 覆盖本地状态、帮助、导入/打开、编译/刷新、页面打开、日志读取、预览二维码和显式确认后的体验版上传。
