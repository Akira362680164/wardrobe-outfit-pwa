# 衣橱识别与穿搭推荐 PWA

AI agent 修改本项目代码前，必须先读取并遵守根目录 `AGENTS.md`。Claude Code 看 `CLAUDE.md`，MiniMax Code 看 `MINIMAX.md`，二者都只作为入口提示。

手机优先的衣橱管理、穿搭推荐和买前评估 App。登录后的衣橱数据和图片只保存到项目服务器，客户端不持久化业务缓存；MiniMax Key 由用户在 App 内填写并保存在手机本机。

## 功能

- 拍照或上传衣物照片
- 在手机本机调用 MiniMax 生成衣物标签候选
- 手动确认衣物类别、颜色、季节、风格、地点和状态
- 按地点、类别、季节筛选衣橱
- 输入目的地、活动、天气和风格偏好后生成 3 套穿搭
- AI 推荐优先接入实时天气检索；实时天气不可用时使用用户手动确认的天气和温度
- AI 衣橱诊断：识别重复、缺口、闲置和可复用套装
- 买前评估：上传淘宝图、商品截图或试穿自拍，判断是否重复、是否值得买、适合什么场景
- AI 试穿预览：由 M3 规划画面、image-01 生成图片，并用 M3 做结果质检
- 登录后从服务器读取完整衣橱，写入等待服务器事务确认
- Android WebView 本机运行，通过配置的线上 API 读写，不依赖家里电脑或局域网服务

## 本地运行

```bash
npm install
npm run dev
```

同时启动 `services/wardrobe-api`，并通过 `NEXT_PUBLIC_WARDROBE_API_BASE_URL` 指向 API；打开 `http://localhost:3000`。

## Android 本机运行

Android 版本使用 Capacitor 打包静态前端到 APK。业务数据和图片只从线上 API 读写；选图、裁切、缩略图和 AI 识别结果在提交前仅存在当前页面内存。MiniMax Key 在 App 的「设置」页填写并保存在手机本机，不写进 APK。

```bash
npm run android:sync
npm run android:open
```

生成调试 APK：

```bash
npm run android:apk
```

构建 APK 需要本机安装 Android Studio、Android SDK 和 JDK。

## MiniMax 设置

在 App 的「设置」页填写：

- API Host：`https://api.minimaxi.com`
- 推荐模型：`MiniMax-M3`
- 回退模型：`MiniMax-M2.7`
- API Key：你的 MiniMax Key

衣物打标优先使用 M3 多模态 Chat，旧 VLM 仅作为失败回退。穿搭推荐会调用 `chat/completions`，发送衣物名称、标签、地点、状态和收藏套装等结构化字段，不发送衣物图片。买前评估会发送用户主动上传的商品图或试穿图用于评估，默认不会写入正式衣橱。

## 验证

```bash
npm run typecheck
npm run test:logic
npm run build
```
