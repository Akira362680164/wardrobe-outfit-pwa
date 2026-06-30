# 新录入衣物裁切参数与首页取图统一设计

## 背景与根因

衣物数据中，`imageDataUrl` 是完整原图，`thumbnailDataUrl` 是首页卡片使用的缩略图，`cropBox` 表示原图上的归一化取景范围。当前有两个问题：

1. 未裁切的新衣物不保存 `cropBox`，导致下游需要同时处理“有裁切框”和“无裁切框”两种参数形态。
2. 首页的 `SwipeImageCarousel` 在 `variant="card"` 时优先使用 `displaySrc`，而该字段是完整原图；因此已裁切衣物在首页显示成原图。

## 范围

- 只影响修复上线后新录入的衣橱单品。
- 不迁移、不回填、不批量修改现有衣物数据。
- 不改变 `imageDataUrl` 保存完整原图的数据模型。
- 不改 Dexie / Workspace schema，不新增依赖。
- 不处理用户主动删除之前的历史异常单品。

## 方案选择

### 采用：新衣物保存边界统一

在新录入衣物转换为 `WardrobeItem` 时统一 `cropBox`：

- 用户已裁切：保留实际 `cropBox`。
- 用户未裁切：写入 `{ x: 0, y: 0, width: 1, height: 1 }`。
- 未裁切的默认全图保持 `cropRevision = 0`。
- 用户实际裁切的新图保持现有 `cropRevision = 1`语义。
- `thumbnailCropRevision` 与对应的 `cropRevision` 一致。

这是最小改动：只在新数据的持久化边界补齐参数，不扩散到历史读取和迁移链路。

### 不采用：读取时临时补齐

读取时补齐会让现有旧数据在运行时改变语义，且无法保证云端、本地和 UI 快照一致。

### 不采用：批量迁移现有数据

迁移会放大旧图片、旧缩略图和云资产之间的兼容风险，与用户明确的“只对今后录入生效”冲突。

## 取图规则

| 界面 | 图片来源 | 裁切规则 |
|---|---|---|
| 首页卡片 | `thumbnailDataUrl` | 缩略图已按 `cropBox` 生成，卡片不再读完整原图 |
| 详情大图 | `imageDataUrl` | 通过 `cropBox` 渲染取景范围 |
| 录入确认 | 当前录入图 | 已裁切显示裁切结果；未裁切显示全图 |

`SwipeImageCarousel` 的卡片模式应只选择 `slide.imageDataUrl`（首页调用方已将它设为 `thumbnailDataUrl`）。`detail` / `review` 模式继续保留现有原图选择。

## 数据流

1. 用户选择图片。
2. 如果用户裁切，录入草稿保留实际 `cropBox`；否则草稿仍可不带 `cropBox`。
3. 保存边界将缺失的 `cropBox` 规范化为全图范围。
4. 缩略图使用原图和当前裁切范围生成。
5. 完整原图、缩略图和裁切参数按现有 Workspace / 云资产链路保存。
6. 首页只读缩略图；详情只用原图加裁切参数。

## 错误处理

- 保留现有“缩略图生成失败则阻止新衣物保存”规则，不让新数据进入“只有原图、首页无正确小图”状态。
- 全图 `cropBox` 使用固定归一化值，不接受动态尺寸、像素坐标或超出 `0..1` 的值。
- 不对旧数据的缺失或异常 `cropBox` 做自动修复。

## 验证与验收

### 逻辑回归

- 未裁切新衣物保存为全图 `cropBox`，`cropRevision = 0`。
- 已裁切新衣物保留用户 `cropBox`，`cropRevision = 1`。
- 两者的 `thumbnailCropRevision` 均与 `cropRevision` 一致。
- 卡片模式使用缩略图；详情和审核模式不改取图行为。
- 测试不执行任何旧数据迁移或回填。

### 本地门禁

- `npm run typecheck`
- 相关图片、录入和详情逻辑测试
- `npm run test:logic:all`
- `npm run build`
- `git diff --check`

### Android 验证

改动会进入 APK，因此实施时必须递增版本，构建固定签名 APK，并在 Android 模拟器或真机完成：

1. 录入一张已裁切图片，核对首页和详情。
2. 录入一张未裁切图片，核对首页和详情。
3. 横屏复查两类图片无拉伸、无空白、无错位。
4. 采集 logcat，确认无 App `FATAL EXCEPTION`。

## 预计修改文件

- `src/lib/intake-save-adapters.ts`：新衣物保存时补齐全图 `cropBox`。
- `src/components/swipe-image-carousel.tsx`：修正卡片模式的取图条件。
- 现有相关测试脚本：增加已裁切/未裁切和 card/detail 取图回归。
- `package.json` / `package-lock.json`：实施阶段递增 APK 版本。
- `VERSION_HISTORY.md`：记录实施、验证和未覆盖风险。
