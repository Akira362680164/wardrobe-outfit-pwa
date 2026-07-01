# v2.1.3-test 执行报告

日期：2026-07-01  
执行者：Codex 母 Agent（串行执行，未启动 subagent）  
开发分支：`codex/v2.1.3-asset-model-reset`  
基线：本地 `main@f421bf7`

## 结论

v2.1.3-test 已完成正式图片资产引用、显式服务器元数据、资产共享绑定、线上图片运行时、画像读回、连续写入与 revision 冲突收口。测试服务器已经受保护地清空全部用户级数据库记录和 Storage 对象，并部署兼容迁移。固定签名 APK 已完成 Android 15/API 35 模拟器真实线上回归。

## 核心结果

- 正式领域对象不再持有 Data URL/Base64/Blob URL；本地图片只存在页面会话草稿。
- Overview 只返回结构、revision 和资产引用；图片由统一在线图片客户端按需读取。
- `asset_bindings` 支持衣物、种草、套装和画像共享同一 canonical asset；解除最后一个 binding 后才进入延迟回收。
- 创建、替换、缩略图更新、复用、移除均通过资产 mutation 与业务事务提交，写成功后使用服务器读回对象。
- 衣物、种草和套装的连续写入具备实体级互斥；revision 冲突读取最新实体、保留用户草稿并提示。
- 测试服务器清理前完成 dry-run；数据库用户级数据归零，37/37 Storage 对象删除并复核，旧账号和会话失效。
- 线上 API 当前部署镜像为 `wardrobe-api:b7f03fb`；健康、就绪和版本端点通过，数据库已应用 `0012_relax_canonical_asset_field`。

## 验证

- `npm run typecheck`：通过。
- `npm run cloud:contracts:typecheck`：通过。
- `npm run api:typecheck`：通过。
- `npm run api:test`：8 个文件、58 项通过。
- `npm run test:logic:all`：通过，未使用 `assert.ok(true)` 或 `|| true` 绕过迁移断言。
- `npm run build`：通过。
- `npm run test:e2e`：核心 36 项通过；MiniMax 现场识别项首次因模型返回截断 JSON 失败，使用同一代码和环境单独重跑后通过。线上 PostgreSQL、图片读回、双设备、500、断网、超时后提交、幂等重试和草稿保留均通过。
- `npm run android:apk`：通过。

## Android 与 APK

- AVD：`wardrobe-test`，Pixel 6，Android 15 / API 35。
- 覆盖：全新安装、注册登录、系统 Photo Picker、图片裁切/预览、无 MiniMax Key 手工兜底、原图和缩略图上传、服务器读回、返回键、横屏、强制停止冷启动、完全卸载重装、重新登录恢复服务器衣物和图片。
- 最终 logcat：未发现 `FATAL EXCEPTION` 或本应用进程崩溃。
- APK：`衣橱穿搭助手-v2.1.3-test.apk`。
- 包名：`com.wardrobe.outfit`；versionName `2.1.3-test`；versionCode `20103`；targetSdk `36`。
- 签名：`CN=fangzheng`。
- SHA-256：`1b1ab266aa9952e850a5b4188d233896ab6ae24ef0d321ea8f7b387e349198ca`。

## 未验证风险

- 本轮没有可用厂商真机，未执行厂商相册、相机和权限差异测试。
- MiniMax 输出属于外部不稳定依赖；截断 JSON 会进入现有失败提示与手工补全路径。
- API 镜像提交号早于最终客户端提交；最终后续提交只涉及客户端交互、测试记录和文档，不改变服务端运行代码。

## 公开发布

- 工作分支已 fast-forward 合并到本地 `main@cb21f35`。
- 公开仓库使用无旧历史安全快照覆盖 `main`，公开提交为 `d5de583`。
- 公开快照排除了 agent 规则、环境文件、签名、APK、用户图片、本机路径和真实服务器地址，并通过全新安装、类型、逻辑、API 类型和生产构建验证。
