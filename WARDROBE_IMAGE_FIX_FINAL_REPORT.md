# 衣橱图片已知缺陷与 Android 云恢复最终报告

- 日期：2026-06-30
- 分支：`codex/image-thumbnail-cloud-root-debug`
- 版本：`2.0.17-test` / Android `versionCode 20017`
- 设备：Android Emulator `wardrobe-test`，Pixel 6 AVD，Android 15 / API 35
- 根因修复提交：`58406f1bab97fdb38582033910bea1a152928206`
- 验证报告提交：本文件所在的最终 HEAD（精确 SHA 见 Git 历史与最终交付回复）

## 提交顺序

1. `708b0cc` `fix: complete garment thumbnail generation and thumbnail-first display`
2. `706e568` `chore: add garment cloud asset end-to-end diagnostics`
3. `58406f1` `fix: repair garment asset android upload and card layout`
4. `test: verify garment images across android reinstall`（本报告提交）

## 已确认并修复的问题

### 1. 首页图片已解码但卡片空白

修复前两张 JPEG 在 WebView 中均已成功解码：

- 719×828，DOM 布局尺寸 `0×210`。
- 551×722，DOM 布局尺寸 `0×210`。

资产记录、original Data URL 和 thumbnail Data URL 均存在，因此首个失败阶段是 CSS 布局而不是图片存储或解码。`CatalogWaterfallCardShell` 的媒体槽只有绝对定位子内容，Android WebView 在 flex button 中将其宽度收缩为 0。

修复：`src/components/item-shell/catalog-waterfall-card-shell.tsx` 的 210px 媒体槽增加 `w-full`。修复后两张图的 DOM 尺寸均为 `182.57×210`，竖屏和横屏都能显示。

### 2. Android 云端二进制上传损坏

确认的错误演进：

1. 旧实现直接把 Blob 传给 `CapacitorHttp.request`，原生端不支持该数据类型，本地只留下 `ASSET_UPLOAD_VALIDATION_ERROR`。
2. 改用 patched `fetch` 后，服务端返回精确的 `asset_size_mismatch`。
3. Capacitor fetch patch 会把 Blob/ReadableStream 按 UTF-8 解码再写回，二进制字节被改变；其 File 路径则使用 base64 传输并在原生端还原原始字节。

修复：

- `src/lib/cloud-sync/cloud-assets-api.ts`：二进制请求走 patched `fetch`；Android PUT 将 Blob 包装成 File。
- `src/lib/cloud-sync/asset-upload-coordinator.ts`：保留服务端精确错误 code；对旧版本遗留的首次 generic validation 失败补重试一次。

## App 真实上传证据

| 衣物 | Entity ID | Asset ID |
|---|---|---|
| 藏青色针织POLO衫 | `019f1468-fcca-7a20-ba09-d7a24d7a6d28` | `019f1468-fccb-74e1-8b46-f745ddf775b9` |
| 黑色抽绳休闲短裤 | `019f1468-fdbc-7b83-ade2-abe2dee39bc8` | `019f1468-fdbd-731c-9be3-48a1748e7c06` |

| Asset | Variant | 本地状态 | GET | 字节 | SHA-256（本地 / 响应 / 实际） |
|---|---|---:|---:|---:|---|
| `019f...f775b9` | original | uploaded | 200 | 62706 | `4ea25b2b84bf043d98d1ea228e9282c6fc5680e6a1fe0b14aff5b048d7cd630d` |
| `019f...f775b9` | thumbnail | uploaded | 200 | 13940 | `84cb30b537e4a39432d5587e111bfd0e93f16b33483174181597552614e36479` |
| `019f...e39bc8` | original | uploaded | 200 | 31871 | `ff32b0740563119845da675ebe0527b11718ac51ad4195912ae33e99de09bfe5` |
| `019f...e39bc8` | thumbnail | uploaded | 200 | 9392 | `367cf7147f4ed6b84d57a14f182c87abff2d4892347866ae5b3f3e8f5f8f95a8` |

每一行的三个 SHA 都完全相同，不是仅依赖文件名或上传状态判断。

## 卸载重装恢复证据

因原取证账号密码不在需求文档或环境中，未读取或导出其 token。为避免卸载后无法登录，另建一次性云端测试账号，写入两件同结构衣物和四个远端 variant。卸载前四次 GET 均为 HTTP 200，响应 SHA 和实际字节 SHA 均匹配。

恢复用资产：

| Entity ID | Asset ID | SHA-256 | 字节 |
|---|---|---|---:|
| `9cf55154-1262-48d0-8181-9c989f625a4e` | `5ea5ea2a-1574-4e0c-9b11-c8bccd71ab9a` | `ee701861eb826d93377de59de7190316589d12e766bd607a0d44fd4e72cf0ff2` | 61155 |
| `02fcb7f5-f0d9-42dd-8265-18f272d9bb05` | `9422917c-a6b3-47e4-b297-74e91ec70df1` | `0b240549c210ebcbd69cffd3877ff27f8e3c86a09708498b8ea9f47397df3297` | 31084 |

时间线：

1. `adb uninstall com.wardrobe.outfit`：完整移除 App 数据。
2. 安装当前 APK，冷启动约 0.9–1.1 秒。
3. 登录同一次性账号；15 秒取证窗口内，两件衣物与两张首页图全部显示。
4. workspace 衣物 payload 不含 Data URL，仅含 `cloudAssetRefs`。
5. 持久缓存中存在两个 asset 的 original/thumbnail 四个二进制条目与四个 MIME 元数据条目；四个二进制条目的字节数和 SHA 与远端一致。
6. 同样流程重复执行，第二次仍恢复成功。
7. 在精确根因提交 `58406f1` 构建的 APK 上再执行一次完整卸载重装，两张图仍恢复。

## 自动与构建验证

- `npm run typecheck`：通过。
- `npm run test:logic:all`：通过。
- `npm run build`：通过。
- `npm run android:apk`：通过。
- 固定签名：`CN=fangzheng`。
- 包名：`com.wardrobe.outfit`。
- logcat：多次冷启动、上传、两次以上卸载重装后无 App `FATAL EXCEPTION`。

## 推测但未证实的问题

无。最终修复的两个阶段均有 DOM、IndexedDB、HTTP 状态、字节数和 SHA-256 证据。

## 尚未完成的测试与风险

- 本轮使用 Android 15 Pixel 6 模拟器，未在物理真机复测；项目规则明确允许模拟器作为 Android 最终验证环境。
- 远端 API 仍为临时 HTTP 地址，正式发布前需切换 HTTPS。
- 没有使用原取证账号执行卸载后登录，因其密码不在本次可用资料中；该账号的 App 真实上传和四次远端 GET 已单独通过，卸载恢复由另一次性账号完成。
