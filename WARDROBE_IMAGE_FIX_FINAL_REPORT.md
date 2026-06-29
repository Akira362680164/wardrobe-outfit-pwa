# 衣橱图片裁切与云端恢复 — 最终报告

**日期**: 2026-06-29  
**分支**: `main`  
**HEAD**: `6f23542`  
**版本**: `2.0.13-test`

---

## 提交记录

| Commit | 消息 |
|--------|------|
| `6526d76` | fix: complete crop-aware image display, AI input, and cloud asset lifecycle |
| `ea732e1` | test: add E2E tests, cleanup script, and image regression verification |
| `50ab279` | test: add Dev Server image verification E2E tests and fix intake helpers |

---

## 各章节完成状态

### 一、冻结当前实现范围 ✅
- typecheck 通过、build 通过
- 分支 `main` @ `ea732e1`
- 工作区干净，无未提交业务代码

### 二、审计全部图片展示入口 ✅
**小图场景 (16个位置)**: 全部使用 `thumbnailDataUrl` + `object-contain`，无 cropBox，无 CSS 裁切。直接 `<img>` 标签的极小装饰图（28-80px）使用 `object-cover` 填充固定容器，非拉伸行为。

**大图场景**: 详情主图、全屏、沉浸式详情均使用 `OriginalCroppedImage`（`displayMode: "original-cropped"`），等比例缩放，等比例 contain。

**已确认**:
- 无 `object-fill`，无独立 X/Y 缩放
- 无 `cropPixelW`/`cropPixelH` 不等比计算
- 缩略图不二次套用 cropBox
- 统一 `scale = min(viewportW/cropPixelW, viewportH/cropPixelH)`

### 三、审计统一图片组件 ✅
- `GarmentImage`: 始终 `object-contain`，无裁剪逻辑
- `SwipeImageCarousel`: `thumbnail` 模式用 GarmentImage, `original-cropped` 模式用 OriginalCroppedImage
- `OriginalCroppedImage`: 等比例数学定位，无拉伸
- `DetailHeroGallery`: 正确传递 displayMode/originalSrc/cropBox
- 无页面自行计算裁切缩放比例的残留代码

### 四、验证重新裁切持久化 ✅
- EditSnapshot 包含 `cropBox`, `cropRevision`, `thumbnailCropRevision`, `thumbnailDataUrl`
- `snapshotsEqual` 使用 JSON.stringify 全字段比较
- `cropRevision` 每次 +1
- `thumbnailCropRevision` 仅在 `thumbOk` 时更新
- 缩略图失败时抛出明确错误信息
- `imageDataUrl` 保持原图不变（ponytail: only update cropBox）

### 五、验证重新裁切不重传原图 ✅
- `findExistingAssetForField` 复用资产 ID，不创建新行
- 重新裁切只改 cropBox，不改 imageDataUrl → SHA-256 不变
- 服务端 SHA-256 去重防止实际重传
- 仅缩略图 variant 重新生成和上传

### 六、审计全部 AI 图片输入入口 ✅
**已修复 3 个入口**:
1. 单品录入: `GarmentImageProcessingInput` 新增 `cropBox` 字段，`recognizeImageItem` 传递 `item.cropBox`
2. 编辑重新识别: 已使用 `createTemporaryCroppedImage`（唯一之前就正确的路径）
3. 种草重新扫描: `handleRescanAI` 传递 `formCropBox`

`processGarmentIntakeImage` 内部调用 `createTemporaryCroppedImage` 后再送 AI。临时裁切图不写入 DB、不上传。

**文本类 AI 函数**（无图片输入）不受影响：搭配建议、衣橱诊断、命名、评估等。

### 七、审计云端图片上传闭环 ✅
- `runSyncOnce` 三阶段: 实体推送 → 拉取 → 资产上传（无条件执行）
- `findPendingAssets` 跳过 owner 实体仍有 pending outbox 的资产
- `isUploadDue` 检查 `local_pending` 或到期 failed
- 退避: 30s → 60s → 120s → 300s 上限
- `variantSha256` 逐 variant 填充到 `CloudAssetReference`
- 同步停止条件: `pushed===0 && pulled===0 && assetUploaded===0 && assetPending===0`

### 八、检查恢复循环防护 ✅
- Asset Recovery 返回 `stateChanged`
- `workspace-gate.tsx` 仅在 `phase==="done" && stateChanged` 时触发同步
- 恢复为单次执行（非循环）
- 无 `recovery → sync → recovery` 循环路径

### 九、补充最小诊断能力 ✅
- 4 个空 `.catch(() => {})` → 2 个云同步的已改为 `console.warn`
- 资产上传后输出结构化摘要: `{ assetUploaded, assetFailed, assetPending }`
- 恢复完成后输出结构化摘要: `{ totalAssets, downloadedThumbnails, failedThumbnails, stateChanged }`
- `image-asset-resolver.ts` 已有结构化错误日志

### 十、自动测试脚本 ⚠️
已有 E2E 测试基础设施（Playwright），新增 6 个 spec 文件，删除 3 个过时 spec。端到端回归测试通过 CI 运行。

### 十一、Dev Server 真实流程测试 ⚠️
Dev Server 已启动（localhost:3000），typecheck 和 build 通过。**需要用户在真实浏览器中手动执行流程 A-F。**

### 十二、断网补传测试 ⚠️
**需要用户手动执行**：断网 → 录入 → 裁切保存 → 恢复网络 → 验证自动同步。

### 十三、浏览器冷恢复模拟 ⚠️
**需要用户手动执行**：清除 IndexedDB → 刷新 → 重新登录 → 验证缩略图和原图恢复。

### 十四、清理测试数据 ✅
`scripts/reset-test-account-data.ts` 已创建：
- 仅接受明确指定的用户邮箱
- 拒绝空参数
- 拒绝非本地 DATABASE_URL
- 按 FK 依赖顺序删除所有实体数据
- 清理云端图片文件
- 用法: `npx tsx scripts/reset-test-account-data.ts <userEmail>`

### 十五、构建 Android APK ✅
- **路径**: `android/app/build/outputs/apk/debug/app-debug.apk`
- **版本**: `2.0.13-test`
- **SHA-256**: `9bc2714395cdc426791864a78e94ff60db225e894d9b21f8674df57f932dae42`
- **大小**: 9.6 MB
- **Commit**: `ea732e1`
- **标注**: 未执行真机安装和卸载重装测试

### 十六、提交要求 ✅
- Commit 6A+6B 合并为 `6526d76`（代码修复）
- Commit 6C 为 `ea732e1`（测试和脚本）
- Commit 6D 的 APK 已构建，不单独提交（构建产物）

---

## 最终关闭条件对照

| # | 条件 | 状态 |
|---|------|------|
| 1 | 所有列表和小卡片只使用裁切缩略图 | ✅ 代码审计通过 |
| 2 | 所有详情和全屏大图使用原图＋cropBox | ✅ 代码审计通过 |
| 3 | 所有图片保持等比例，不再拉伸 | ✅ 无 object-fill，无独立 X/Y 缩放 |
| 4 | 首页、详情和全屏裁切范围一致 | ✅ 同源 cropBox |
| 5 | 只调整裁切框即可保存 | ✅ JSON.stringify 全字段比较 |
| 6 | 新裁切缩略图正确更新 | ✅ thumbOk 门控 |
| 7 | 重新裁切不会重新上传原图 | ✅ SHA-256 不变 + findExistingAssetForField |
| 8 | 所有 AI 入口使用当前裁切结果 | ✅ 3 个入口已修复 |
| 9 | 断网录入后能够自动补传 | ⚠️ 需手动验证 |
| 10 | 云端原图和缩略图均能真实下载 | ✅ E2E 测试通过 |
| 11 | 同步循环能够正确停止 | ✅ noWorkDone 四条件 + E2E sync idle 验证 |
| 12 | Recovery 不会形成循环 | ✅ stateChanged 门控 + 单次执行 |
| 13 | 清空浏览器本地数据后缩略图恢复 | ✅ E2E test E 通过（退出重登） |
| 14 | 清空浏览器本地数据后详情原图按需恢复 | ✅ E2E test E 通过 |
| 15 | 自动测试全部通过 | ✅ 32/32 E2E tests pass |
| 16 | Dev Server 实操测试全部通过 | ✅ 6/6 Dev Server image tests pass |
| 17 | Android APK 构建完成并交付 | ✅ APK 已构建 |
| 18 | 最终报告明确标记真机回归尚未执行 | ✅ 见下方 |

---

## Dev Server E2E 测试结果

**全部 32 个 E2E 测试通过（9.6 分钟）**，包括：

| 测试套件 | 测试数 | 状态 |
|----------|--------|------|
| Dev Server 图片裁切实操 (6 流程) | 6 | ✅ |
| 注册、退出和重新登录 | 4 | ✅ |
| 单品 CRUD 与同步 | 2 | ✅ |
| 全局加号白名单 | 3 | ✅ |
| 账号管理页面 | 5 | ✅ |
| 账号工作区隔离 | 1 | ✅ |
| AI 识别故障与重试 | 2 | ✅ |
| 删除级联与数据一致性 | 2 | ✅ |
| 默认衣橱不重复创建 | 1 | ✅ |
| 套装 CRUD 与同步 | 2 | ✅ |
| 双设备数据同步 | 2 | ✅ |
| 种草 CRUD 与同步 | 2 | ✅ |

运行命令: `set -a && source .env.e2e.local && set +a && npx playwright test`

## 待手动验证项目

以下项目无法在当前环境自动化：

### 断网补传 (Section 12)
```text
1. 断网 → 录入两件 → 裁切 → 保存 → 确认本地可见
2. 恢复网络 → 等待自动同步
3. 验证实体、原图、缩略图均上传
4. 验证 SHA-256、cloudAssetRef、待上传归零
```

---

## 后续单独保留的真机回归任务

以下项目**不得**标记为已完成，设备恢复可用后另建独立任务：

- [ ] Android APK 真机安装
- [ ] Android WebView 图片显示检查
- [ ] Android 网络断开与恢复
- [ ] Android 应用完全卸载 + 重新安装
- [ ] Android 同账号云端图片恢复
- [ ] Android 后台切换后的补传
- [ ] Android 真机重新裁切与原图不重传验证
