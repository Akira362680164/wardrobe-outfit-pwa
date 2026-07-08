# 微信小程序平台配置清单

## 账号与成员

- [ ] 注册微信小程序账号。
- [ ] 完成主体信息、名称、头像、简介和服务类目配置。
- [ ] 完成微信认证，确认具备微信认证手机号登录能力。
- [ ] 配置管理员、开发者成员和体验成员。
- [x] 记录 AppID：`wx14a1a85b7b3844d0`。
- [ ] 配置 AppSecret；AppSecret 只进入本机或服务端 Secret，不写入仓库。

## 登录与协议

- [ ] 小程序端采用 `button open-type="getPhoneNumber"` 获取 `phoneCode`。
- [ ] 后端使用微信手机号能力换取手机号。
- [ ] 手机号匹配现有账号则登录，未匹配则注册。
- [ ] 登录页展示用户服务协议与隐私政策入口。
- [ ] 隐私保护指引覆盖手机号、图片、衣物信息、AI 识别结果、设备信息和诊断日志。

## 合法域名

- [ ] `request` 合法域名：后端 API 域名。
- [ ] `uploadFile` 合法域名：图片上传域名。
- [ ] `downloadFile` 合法域名：图片/CDN 域名。
- [ ] `socket` 合法域名：仅在后续启用 WebSocket 时配置。

## 本地 IDE

- [ ] 安装微信开发者工具 Stable 版。
- [ ] 登录管理员或开发者微信。
- [ ] 开启「设置 / 安全设置 / 服务端口」。
- [ ] 确认 `wechatide` 在 PATH 中可用，或配置 `WECHATIDE_BIN`。
- [ ] 设置统一 clientName：`wardrobe-mini`。
- [ ] 导入 `apps/wechat-miniprogram`。

## 本地验证命令

当前阶段优先使用 help 和 dry-run，脚手架未完成或 DevTools 未登录时只记录阻塞原因：

```bash
node apps/wechat-miniprogram/scripts/wechatide-status.mjs --help
node apps/wechat-miniprogram/scripts/wechatide-help.mjs --help
node apps/wechat-miniprogram/scripts/wechatide-open.mjs --help
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --help
node apps/wechat-miniprogram/scripts/wechatide-page.mjs --help
node apps/wechat-miniprogram/scripts/wechatide-debug.mjs --help
node apps/wechat-miniprogram/scripts/wechatide-preview.mjs --help
node apps/wechat-miniprogram/scripts/wechatide-upload.mjs --help

node apps/wechat-miniprogram/scripts/wechatide-status.mjs --dry-run
node apps/wechat-miniprogram/scripts/wechatide-help.mjs --dry-run
node apps/wechat-miniprogram/scripts/wechatide-open.mjs --dry-run
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --refresh --dry-run
node apps/wechat-miniprogram/scripts/wechatide-page.mjs --page pages/home/index --dry-run
node apps/wechat-miniprogram/scripts/wechatide-debug.mjs --runtime currentPage --dry-run
node apps/wechat-miniprogram/scripts/wechatide-preview.mjs --dry-run
node apps/wechat-miniprogram/scripts/wechatide-upload.mjs --version 0.1.0 --desc "dry run only" --confirm-upload --dry-run
```

脚手架和 AppID 就绪后，再执行真实 DevTools 验证：

```bash
node apps/wechat-miniprogram/scripts/wechatide-status.mjs
node apps/wechat-miniprogram/scripts/wechatide-open.mjs --import-only
node apps/wechat-miniprogram/scripts/wechatide-open.mjs
node apps/wechat-miniprogram/scripts/wechatide-page.mjs --page pages/home/index
node apps/wechat-miniprogram/scripts/wechatide-debug.mjs --console "grep -i error"
node apps/wechat-miniprogram/scripts/wechatide-debug.mjs --network "grep -n ."
node apps/wechat-miniprogram/scripts/wechatide-preview.mjs
```

## 禁止动作

未获得用户明确授权前，不执行：

- 体验版上传、提审、发布。
- 云数据库写入、云存储写入、云函数部署。
- 生产数据迁移、生产配置改写。
- 把 AppSecret、AI Key、数据库连接串写入仓库或日志。
