# 图片自动裁切双路线验证记录（2026-07-14）

## 范围与隐私

- App / 微信小程序 × 衣橱 / 种草四入口共用同一归一化坐标合同与裁切状态模型。
- 本地语料共 28 个文件、SHA-256 去重后 26 张；本次选 10 张。原图、Base64、本机路径和 MiniMax Key 均未写入仓库或日志。
- 有 Key 的步骤 1保持现有 UI；无 Key 仅增加逐张进度文本和“下一步（填写属性）”。步骤 2没有结构性 UI 改动。

## 真实 10 图 ONNX 路线

本地受控环境先以 3 并发验证真实 CPU u2netp sidecar：10 张全部 HTTP 200，失败率 `0/10`，墙钟 `7481.5ms`，P50 `2182.3ms`、P95 `4108.8ms`。正式环境按 3.6 GiB 主机容量配置为 1 并发、20 队列、45 秒单图超时后，再经生产鉴权 API `POST /api/workspace/images/crop-suggestion` 实测：严格合同成功 `10/10`、失败率 `0%`、墙钟 `62700.6ms`、P50 `4076.4ms`、P95 `46404.5ms`。首两张为模型冷启动与排队（`44.472s`、`46.405s`），随后单张为 `3.914–4.145s`。完成顺序独立计数，进度从 `1/10` 到 `10/10` 单调增长。

| imageId | SHA-256 | 覆盖 |
| --- | --- | --- |
| real-01-backpack | 69f89741519250e36569b923a5949ac537fec5ff95af06a5f6af54608471fe4d | 背包、商品图、浅背景 |
| real-02-denim-belt | bc4a8d45cd61da92ad344aba66e62f4dec4055ba1dae8bb8e66391155de86bba | 小主体配饰、广告字 |
| real-03-sling-bag-on-model | 47ff21059fda4bb476b87ea9cb6238a768db7a89368fea46a3f820ff85e1c0b8 | 真人、复杂背景、遮挡 |
| real-06-light-jacket | d1e088170a721260f3c75a85a8dfb0be2af12ace7730087a3b3da0733a1647b4 | 外套、低对比 |
| real-09-gold-earrings | 1cf537bc7deb0590e0caee2bc2219ba84a4292dee7b58f8c6b308b4e2e2c65ce | 多件小配饰 |
| real-12-running-shoes | e08cae24144203b8057a453d2370c1ec424909d175e26d72678d74cefcc36600 | 鞋、多主体 |
| real-15-plaid-skirt | 628a4c12a8c355b7033863ce80fd1c84740a955ae4fb58d1fa8d9072eab7c486 | 下装、真人、遮挡 |
| real-16-wide-brim-hat | 2ace4f11b75de21722791f604e0854fd4bcd61f1bf1eebc4add75aa94b10df05 | 帽子、细带 |
| real-21-blue-dress | 52a651dd96843ea19d1cb79216e268bab6bade16d6a7fc2dce06583bf8ceb57e | 连衣裙、真人、近色背景 |
| real-25-long-floral-dress-a | 1e36ae5ce7352855716ad77e03d59ca225600452730253b98a9bed825c9373c7 | 长裙、真人、长主体 |

## 真实 MiniMax 预裁切路线

安全读取现有环境 Key，Key 未打印、未落盘。三张均先按原图坐标手工预裁切，再生成 10×10 网格并把预裁切后的高质量图发送给 MiniMax：

| imageId | 发送像素 | latency | 属性 | 二级框 | 映射结果 |
| --- | ---: | ---: | --- | --- | --- |
| real-03-sling-bag-on-model | 570×710 | 17078.8ms | 有效 | 接受 | final `{x:.1876,y:.2936,w:.5928,h:.5041}` |
| real-06-light-jacket | 1056×1360 | 13904.0ms | 有效 | 接受 | final `{x:.1216,y:.14,w:.8008,h:.85}` |
| real-21-blue-dress | 912×1216 | 21343.0ms | 有效 | 全预裁切框 | final 保留 preCropBox |

属性与框独立解析；框无效或低置信时保留用户 preCropBox，不丢弃有效属性。共享 10 组坐标 Fixture 覆盖 full-frame、中心/贴边、每侧 20% 外扩、clamp、浮点、非法 secondary、EXIF 归一与 90/180/270 度旋转，App 与小程序运行同一组向量。

## 客户端与构建

| 客户端/入口 | 有 Key | 无 Key | 结果 |
| --- | --- | --- | --- |
| App 衣橱 | 现有文案/UI、预裁切后识别 | 逐张裁切、填写属性 | 自动合同通过；Android 真实 10 图无 Key 流程通过 |
| App 种草 | 现有文案/UI、预裁切后识别 | 逐张裁切、填写属性 | 自动合同与逻辑测试通过 |
| 小程序衣橱 | 现有文案/UI、几何可记录裁切层 | 逐张裁切、填写属性 | typecheck、等价 JS 开发者工具编译通过 |
| 小程序种草 | 现有文案/UI、几何可记录裁切层 | 逐张裁切、填写属性 | typecheck、等价 JS 开发者工具编译通过 |

- 固定签名 APK：`衣橱穿搭助手-v2.1.22-test.apk`；包名 `com.wardrobe.outfit`，versionCode `20122`。最终提交后构建的文件摘要在交付回复中记录。
- Android 15 / API 35 `wardrobe-test`：使用测试账号真实选择 10 张。初始 10 张原图立即显示，随后截图记录 `1/10`、`4/10`、`8/10`，完成态为 `10/10` 后进度消失；生产访问日志对应 10 次 HTTP 200。证据仅留本机 `/tmp/wardora-intake-10-*.png`，不提交原图或截图。现场发现并修复无 Key 项目误显示“失败”的状态耦合，`manual` 与识别失败现已正交。
- 用户截图指出的录入页顶部留白和图片来源控件已在共享层修复：运行时测得旧 header `padding-top=56px`（其中 Android inset 为 48px，WebView viewport 已避开状态栏），修后步骤 1/步骤 2共用单次安全区；“拍照 / 从图库选择”改为 64px 横向系统圆角矩形。最终本机证据 `/tmp/wardora-v2.1.22-intake-step1.png`、`/tmp/wardora-v2.1.22-intake-step2.png`；真实裁切请求后敏感 logcat 与 fatal 均 0 命中。
- 微信开发者工具 Nightly `2.02.2607132`：仓库 TS 项目因工具未生成入口 JS 而报缺文件；在 `/tmp/wardora-mini-compile.AEi8E8` 生成等价 JS 副本后普通编译成功、问题面板 0，并进入登录页。控制台只有工具自身 `appid missing`/安全信息超时。

## 生产门禁与未覆盖风险

- 不提交或再分发模型权重。项目所有者已明确批准在个人、非商业 Wardora 部署中原样使用该上游 u2netp 权重；固定 SHA-256 为 `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`。部署通过只读挂载注入，并配置私有 sidecar、无公网、硬超时、并发/队列与健康检查。
- API 已部署为 `wardrobe-api:0e3165a5`；部署前备份 `/opt/wardrobe-cloud/backups/postgres/wardrobe-20260714-081950.sql`，保留前序镜像用于回滚。`/api/health`、`/api/ready`（含 `imageCrop`）和 `/api/version` 通过；容器复测无重启/OOM，10 图后日志无 Base64、Bearer、本机路径或 5xx。
- 长驻 worker 后续批次把原“每请求启动并加载模型”改为“容器启动加载一次并预热”：Python 通过私有 stdio NDJSON循环处理，API 只有在收到 ready 握手后才报告 `imageCrop=ready`；崩溃/超时自动重启并重新预热。生产 healthcheck 改为 `/api/ready`，并发/队列/单图超时保持 `1/20/45s`。最终部署镜像、重启后首张、连续 10 张和内存数据在本 Session 部署复测后补入交付回复。
- 长驻批次已部署为 `wardrobe-api:32c60f9b`：容器重启到模型预热 ready 为 `5259ms`，ready 后首张真实图 `2450.1ms`，不再出现 44–46 秒用户可见冷启动。10 个独立请求同时在途、逐张回复的实测为 HTTP/合同成功 `10/10`、墙钟 `8090.6ms`、P50 `4965.1ms`、P95 `8052.2ms`、失败 `0`；压力重复峰值 `837MiB / 3.637GiB`，`restart=0`、`OOM=false`。人工杀死内部 Python worker 后 `/ready` 确认降级，`2369ms` 自动拉起并重新预热，恢复后 10 图再次 `0` 失败。回滚镜像为 `wardrobe-api:0e3165a5`。
- 自动测试覆盖 App/小程序 × 衣橱/种草 × Key/无 Key、乱序/失败/删除/追加/重试/手工抢占。Android 已补齐衣橱无 Key 10 图现场证据；其余 UI 现场项和小程序模拟器结果按本记录最终收口状态报告，不以自动合同冒充真机通过。物理 Android、微信真机 OffscreenCanvas、相机入口与弱网仍是独立风险。
