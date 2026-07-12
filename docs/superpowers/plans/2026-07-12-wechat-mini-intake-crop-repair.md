# 微信小程序录入与裁切修复执行方案

> 状态：Ready for implementation
>
> 日期：2026-07-12
>
> 适用基线：`wechat/miniprogram`，基线提交 `f6d79ba7`
>
> 当前应用版本：`2.1.15-test`
>
> 本文性质：实现任务书与验收事实源；本文不表示运行时代码已经修复

## 1. 使用方式

后续执行者在开始修改前必须依次读取：

1. 根目录 `AGENTS.md`。
2. 用户协作偏好 `/Users/fangzheng/Documents/Codex/2026-05-28/codex-ui-codex-agent-codex/codex_experience_profile.md`。
3. `README.md`、`package.json`、`VERSION_HISTORY.md` 最新交接记录。
4. `docs/designs/wardrobe-ui-spec.md` 中的 Viewport、Overlay、录入状态机和返回优先级。
5. 本执行方案。

执行前必须检查：

```bash
git branch --show-current
git status --short
git worktree list --porcelain
```

运行时代码不得在正式 `wechat/miniprogram` 集成目录直接修改，必须从最新小程序基线创建独立分支和 worktree。本文允许按批次拆为多个小提交，但每个提交必须是可验证的闭环。

## 2. 用户反馈与截图证据

用户报告以下八项问题：

1. 选图后裁切/删除气泡自动出现，而不是点击缩略图后出现。
2. 气泡不会随页面或缩略图移动。
3. 气泡过长，图标与文字没有在按钮内居中。
4. 需要删除“清空已选图片”，录入页必须一屏展示，禁止纵向滚动。
5. 大图与缩略图之间存在大面积空白。
6. 录入过程中返回没有自绘退出提示，再次进入还保留上次图片和裁切状态。
7. 裁切页标题、返回键错位，比例、旋转和底部按钮出框。
8. 应用裁切后输出区域与裁切框不一致；二次裁切错误地使用裁切结果作为新原图。

原始截图：

- `/Users/fangzheng/Downloads/S60712-23134950_com.tencent.mm.png`
- `/Users/fangzheng/Downloads/S60712-23135439_com.tencent.mm.png`
- `/Users/fangzheng/Downloads/S60712-23133562_com.tencent.mm.png`
- `/Users/fangzheng/Downloads/S60712-23130117_com.tencent.mm.png`

## 3. 已确认根因

### 3.1 气泡显示状态错误

`pages/intake/camera/index.ts` 将 `currentIndex` 同时用于“大图当前项”和“气泡打开项”。`currentIndex` 初始为 `0`，新增图片后第一张自然成为当前项；WXML 只要 `index === currentIndex` 就渲染气泡，因此气泡自动出现。

修复要求：增加独立的 `activePopoverItemId: string | null`，大图当前项和气泡显隐不得再复用同一状态。

### 3.2 气泡定位错误

气泡当前使用 `position: fixed`，只在刷新队列和点击缩略图时读取一次 `boundingClientRect`。页面滚动、缩略图横向滚动和窗口变化都不会更新位置。

修复要求：气泡改为“已选照片”卡片内部的绝对定位浮层，不使用 viewport fixed；缩略图横向滚动、目标变化和页面尺寸变化时重新计算。

### 3.3 气泡过长与内容靠左

代码把气泡宽度强制设置为最多 `250px`，按钮只设置 `align-items: center`，没有填满网格和水平居中。

修复要求：气泡目标宽度 `424rpx`，内部使用 `minmax(0, 1fr) 148rpx`；两个按钮都必须 `display:flex; align-items:center; justify-content:center; min-width:0`。

### 3.4 页面必然纵向溢出

当前页面叠加了固定顶部 padding、`720rpx` 大图、缩略图 `112rpx` 顶部留白、图片来源按钮、清空按钮、重复上限说明和固定底栏预留。总高度超过手机有效视口。

修复要求：根页面改为固定动态视口 Flex；大图区域消化剩余高度；删除清空按钮和底部重复上限说明；整页禁止纵向滚动。

### 3.5 大图和缩略图间空白

`.thumb-strip` 的 `padding-top: 112rpx` 为气泡预留了文档流空间，但气泡已经是浮层，因此形成空白。

修复要求：缩略图队列恢复 `8rpx-12rpx` 正常内边距，气泡覆盖在大图下缘/缩略图上方，不占文档流。

### 3.6 返回与会话清理缺失

自绘确认只在点击底部“取消”时打开；`syncExitGuard()` 和 `disableExitGuard()` 是空函数；页面没有可靠的离页拦截和清理。录入队列是模块级内存，同种类型再次进入时不会清空。

修复要求：建立录入 Session 和共享离页守卫；确认退出或保存成功后完整清理；重新从业务入口进入必须创建新 Session。

### 3.7 裁切页布局没有窄屏约束

裁切页全局使用自定义导航，但顶部仍用固定安全区和左右占位模拟居中，没有避开微信胶囊。按钮缺少统一 `box-sizing`、可收缩网格和宽度约束，长文案按原生 button 的固有尺寸撑出卡片。

修复要求：顶部根据 `statusBarHeight` 和 `wx.getMenuButtonBoundingClientRect()` 计算；所有按钮网格使用 `minmax(0, ...)`，按钮统一 `width:100%; min-width:0; box-sizing:border-box`。

### 3.8 裁切源与坐标体系错误

第一次应用裁切后同时覆盖 `processedPath`、`stablePath` 和 `imagePath`；再次打开时传入 `processedPath || stablePath`，导致以裁切图继续裁切。现有结构未保存 cropBox。

裁切换算还混用了：

- 裁切框百分比；
- 写死的 `650 × 720` 舞台；
- 原图像素；
- CSS `rpx` Canvas 尺寸；
- `720 × 960` 导出坐标。

真实舞台宽度没有测量，预览旋转也没有与导出旋转同步，最终裁切结果与用户看到的框不一致。

修复要求：原图路径不可变；保存 cropBox、旋转角和比例；所有显示/导出坐标基于实测图片矩形和明确 Canvas 像素尺寸。

## 4. 目标页面与文件范围

| 页面/模块 | 主要文件 | 必须完成的修改 |
| --- | --- | --- |
| 选择照片 Step 1 | `apps/wechat-miniprogram/pages/intake/camera/index.{ts,wxml,wxss,json}` | 一屏布局、气泡状态与跟随、来源按钮、退出入口 |
| 裁切子状态 | `apps/wechat-miniprogram/pages/intake/crop/index.{ts,wxml,wxss,json}` | 顶栏、按钮、真实坐标、旋转、应用/取消 |
| 确认信息 Step 2 | `apps/wechat-miniprogram/pages/intake/review/index.{ts,wxml,wxss,json}` | 内部返回、退出确认、Session 清理 |
| 录入状态 | `apps/wechat-miniprogram/stores/intake.ts` | 不可变原图、cropBox、rotation、ratio、Session |
| 裁切任务 | 建议新增 `apps/wechat-miniprogram/stores/crop-job.ts` | 共享 CropJob/CropResult，不再只传字符串路径 |
| 离页守卫 | 建议新增共享组件 `components/ui/intake-leave-guard/` | 自绘退出确认与系统返回优先级 |
| 衣物编辑 | `pages/wardrobe/edit/index.ts` | 原图 + 当前裁切框重新裁切 |
| 种草编辑 | `pages/wishlist/edit/index.ts` | 原图 + 当前裁切框重新裁切 |
| 试穿 | `pages/try-on/index/index.ts` | 复用统一 CropJob |
| 试穿档案 | `pages/settings/tryon-photos/index.ts` | 复用统一 CropJob |
| UI 合同测试 | `scripts/parity/tests/mini-intake-state-machine.test.ts` 等 | 从字符串存在性升级为行为/数据合同 |

非目标：

- 不修改服务端 API 契约。
- 不改 AI 提示词和识别字段。
- 不新增本地持久业务缓存。
- 不重做 Step 2 表单信息架构。
- 不顺手修改衣橱、套装、日历或账号页面。
- 不调用微信系统业务确认框。

## 5. Step 1 选择照片页设计

### 5.1 页面结构

```text
状态栏安全区
┌────────────────────────┐
│ ‹  添加单品          × │
│    步骤 1 / 2 · 选择照片 │
│    ━━━━━━━━━━━         │
├────────────────────────┤
│ 已选照片          2 / 10│
│                        │
│       当前大图          │  flex: 1
│                        │
│ [1] [2] [3] ...        │  仅横向滚动
├────────────────────────┤
│ [相机 继续拍照] [图库] │
├────────────────────────┤
│ [取消] [下一步 AI识别] │
└────────────────────────┘
底部安全区
```

根容器：

- `height: 100vh` 或小程序等价动态视口。
- `display:flex; flex-direction:column; overflow:hidden`。
- 顶部、来源按钮和底部操作栏不压缩。
- 主内容 `flex:1; min-height:0`。
- 大图 `flex:1; min-height:0`，删除固定 `720rpx`。
- 页面禁止纵向滚动；缩略图允许横向滚动。

### 5.2 顶部栏

- 左返回命中区：`80rpx × 80rpx`，图标 `40rpx`。
- 中间标题：`34rpx`、800 字重。
- 步骤说明：`24rpx`、Muted 色。
- 进度条：高 `8rpx`。
- 右关闭命中区：`80rpx × 80rpx`，图标 `32rpx`。
- 根据真实状态栏和胶囊计算，不再写死 `152rpx`。
- 单品标题“添加单品”；种草标题“新增种草”。

Step 1 左返回和右关闭：无草稿直接退出；有图片、裁切或未保存内容时打开自绘退出确认。

### 5.3 大图

- 使用 `aspectFit`，不可拉伸。
- 背景 `color.mist`。
- 圆角与外卡同心，目标 `36rpx-40rpx`。
- 点击大图只关闭气泡。
- 新增图片后第一张可成为大图，但气泡保持关闭。

### 5.4 缩略图

- `112rpx × 112rpx`。
- 圆角 `18rpx`。
- 当前图使用 `4rpx` Denim 边框。
- 编号位于右下角。
- 删除 `padding-top:112rpx`，保留正常 `8rpx-12rpx` 内边距。

交互：

1. 点击缩略图：切换大图并打开该图气泡。
2. 再点同一缩略图：关闭气泡。
3. 点击大图、空白、来源按钮或底部按钮：关闭气泡。
4. 横滑队列：气泡跟随目标；目标完全离开可视区时关闭气泡。

### 5.5 操作气泡

气泡在“已选照片”卡片内部使用 `position:absolute`，不得使用 `position:fixed`。

- 宽度：`424rpx`。
- 高度：约 `88rpx`。
- 内边距：`8rpx`。
- 圆角：`28rpx-32rpx`。
- 箭头：`16rpx × 16rpx`，指向缩略图顶部中心。
- 与缩略图间距：`12rpx`。
- 左右边缘始终限制在一级卡片内部。
- 层级使用 Popover 级别，不改变页面高度。

内部网格：`minmax(0,1fr) 148rpx`。

| 操作 | 图标 | 字号 | 颜色 | 行为 |
| --- | ---: | ---: | --- | --- |
| 裁切/旋转 | `26rpx` | `24rpx` | Denim | 打开当前图片裁切页，随后关闭气泡 |
| 删除 | `26rpx` | `24rpx` | Danger | 直接移除未保存图片，不弹二次确认 |

两个按钮统一：

```css
display: flex;
align-items: center;
justify-content: center;
min-width: 0;
box-sizing: border-box;
white-space: nowrap;
```

删除后选择相邻图片为当前大图，气泡关闭；删除最后一张后回到空状态。

### 5.6 图片来源按钮

彻底删除“清空已选图片”。“最多 10 张”只在步骤说明和计数中出现，不再在页面底部重复。

空状态：

- 两个按钮高约 `168rpx`。
- 图标 `48rpx`，文字 `28rpx`。
- 图标在上、文字在下。

已有图片：

- 两个按钮高 `96rpx`。
- 图标 `32rpx`，文字 `26rpx`。
- 图标和文字横排、整体居中。
- 两个按钮等宽。

文案：

| 状态 | 左按钮 | 右按钮 |
| --- | --- | --- |
| 无图片 | 拍照 | 从图库选择 |
| 已有图片 | 继续拍照 | 继续从图库选择 |
| 已达 10 张 | 两个按钮禁用；就近显示“已达到 10 张上限” | 同左 |

### 5.7 底部操作栏

- 外框左右边距 `20rpx`，内边距 `16rpx`。
- 两按钮间距 `16rpx-18rpx`。
- 按钮高 `88rpx`。
- 网格为 `minmax(0,1fr) minmax(0,1.6fr)`。
- 左“取消”：浅 Denim 背景、Denim 文字。
- 右“下一步（AI识别）”：Denim 背景、白色文字。
- 种草主按钮文案：“下一步（识别种草）”。
- 无图片、选图中、上传中时主按钮禁用。

## 6. 裁切页设计

### 6.1 一屏结构

```text
┌────────────────────────┐
│ ‹       裁切 / 旋转     │
├────────────────────────┤
│                        │
│       裁切工作区         │  flex: 1
│                        │
├────────────────────────┤
│ [自由]       [3:4]     │
│ [左转90°] [右转90°] [重置]│
│ [取消]        [应用]    │
└────────────────────────┘
```

- 根容器 `height:100vh; overflow:hidden; display:flex; flex-direction:column`。
- 顶栏、比例栏、旋转栏和底部按钮不压缩。
- 工作区 `flex:1; min-height:0`。
- 删除固定 `720rpx` 舞台高度。
- 整页不得纵向或横向滚动。

### 6.2 顶部栏

必须读取：

- `statusBarHeight`
- `windowWidth`
- `wx.getMenuButtonBoundingClientRect()`

规格：

- 返回命中区 `80rpx × 80rpx`。
- 标题 `32rpx-34rpx`。
- 标题只在返回按钮与胶囊安全区之间布局。
- 不再用左右两个固定 `64rpx` 占位模拟居中。
- 使用透明毛玻璃，不画独立实心白条。

返回/取消只关闭裁切子状态；未应用的本次手势丢弃，之前已经应用的裁切结果保留。关闭裁切不等于退出录入，不显示退出录入确认。

### 6.3 裁切工作区

- 始终加载不可变原图。
- 二次裁切加载上次 `rotationDeg`、`cropBox` 和 `cropRatio`。
- 裁切框限制在图片实际 `aspectFit` 矩形内，不得进入黑边。
- 图片旋转后，预览、裁切框和遮罩同步更新。
- 框内保持图片亮度，框外使用约 48% 黑色遮罩。
- 保留白色细边、九宫格、四角手柄。
- 整框可拖动；角手柄可缩放。
- 视觉手柄可小，但真实触摸命中区不得低于等价 48dp。

### 6.4 比例按钮

- 外层高 `92rpx`、内边距 `8rpx`。
- 两选项等宽，高 `76rpx`。
- 圆角 `18rpx-20rpx`。
- 字号 `28rpx`。
- 未选中：透明背景、Muted 文字。
- 选中：Denim 背景、白色文字。

选项为“自由”和“3:4”。首次进入默认 3:4；二次进入保留上次状态。自由切到 3:4 时以当前框中心收敛，不跳到图片角落。

### 6.5 旋转按钮

按钮：左转 90°、右转 90°、重置。

- `grid-template-columns:repeat(3,minmax(0,1fr))`。
- 高 `76rpx`。
- 图标 `28rpx-30rpx`，文字 `24rpx`。
- 图文整体水平和垂直居中。
- 每个按钮 `width:100%; min-width:0; box-sizing:border-box`。

左转/右转后立即更新预览并换算裁切框。重置恢复 0°、3:4 和图片内最大居中 3:4 框。

### 6.6 底部按钮

- 网格：`minmax(0,1fr) minmax(0,1.5fr)`。
- 高 `88rpx`。
- 取消：浅色次按钮。
- 应用：Denim 主按钮。
- 初始化完成前禁用应用。
- 点击后显示“处理中…”，禁止重复点击。
- 成功返回 Step 1，显示新预览，气泡保持关闭；允许显示短暂自绘提示“裁切已应用”。

## 7. 裁切数据模型与算法

### 7.1 IntakeQueueItem

目标字段：

```ts
interface IntakeQueueItem {
  sourcePath: string;       // 原图，当前录入 Session 内不可覆盖
  processedPath: string;    // 当前裁切后的展示/上传结果
  cropBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rotationDeg: 0 | 90 | 180 | 270;
  cropRatio: "free" | "3:4";
}
```

规则：

- `sourcePath` 选图后确定，任何裁切都不得覆盖。
- 裁切只更新 `processedPath/cropBox/rotationDeg/cropRatio`。
- `stablePath` 如继续保留，应表示稳定的原始临时文件，不再同时承担裁切结果含义。
- AI 和上传读取 `processedPath`；重新裁切读取 `sourcePath + crop metadata`。

### 7.2 CropJob/CropResult

裁切页不能继续依赖必须存在的 `clientItemId`，否则衣物编辑、种草编辑和试穿入口会出现“应用无反应”。

建议新增：

```ts
interface CropJob {
  target: "intake" | "garment-edit" | "wishlist-edit" | "tryon" | "profile";
  targetId?: string;
  sourcePath: string;
  cropBox?: CropBox;
  rotationDeg: 0 | 90 | 180 | 270;
  cropRatio: "free" | "3:4";
}

interface CropResult {
  processedPath: string;
  cropBox: CropBox;
  rotationDeg: 0 | 90 | 180 | 270;
  cropRatio: "free" | "3:4";
}
```

页面跳转只传轻量 job id，真实图片路径和裁切元数据保存在当前进程内存，不写入持久缓存。

### 7.3 统一坐标系

删除所有固定 `stageWidth=650`、`stageHeight=720` 和根据 windowWidth 猜舞台尺寸的换算。

算法顺序：

1. 使用 `boundingClientRect()` 读取裁切舞台实际尺寸。
2. 根据旋转后的原图尺寸计算舞台内真实 `aspectFit` 图片矩形。
3. 裁切框坐标相对图片矩形归一化到 `0-1`。
4. 导出时先把原图按 `rotationDeg` 绘制到旋转画布。
5. 再按 `cropBox` 从旋转后的像素表面取图。
6. 最后缩放到输出尺寸。

输出：

- 3:4 固定 `720 × 960`。
- 自由比例以宽 720 为基准，高度按比例计算并设置合理上限。
- Canvas 节点实际像素宽高必须显式设置。
- CSS `rpx` 只负责页面视觉尺寸，不得作为 Canvas 像素尺寸。
- 绘制、裁切和导出使用同一套像素单位。

## 8. 返回与录入 Session

### 8.1 返回优先级

1. 缩略图气泡打开：关闭气泡。
2. 退出确认打开：关闭确认层。
3. 裁切页：关闭裁切，返回 Step 1。
4. Step 2：返回 Step 1，保留草稿，不弹退出确认。
5. Step 1 且有草稿：打开退出确认。
6. Step 1 且无草稿：直接退出到来源页。

右上关闭按钮在 Step 1/Step 2 都表示退出整个录入；有草稿时打开退出确认。

### 8.2 自绘退出确认

文案：

- 标题：`退出本次录入？`
- 正文：`退出后，本次选择的图片、裁切结果和未保存内容都将清空。`
- 次按钮：`继续录入`
- 危险按钮：`退出并清空`

视觉：

- 使用项目底部 Sheet，禁止 `wx.showModal`。
- 遮罩约 `rgba(0,0,0,0.36)`。
- Sheet 顶部圆角约 28px。
- 标题 `32rpx`，正文 `26rpx`。
- 两按钮高 `88rpx`。
- “退出并清空”使用 Danger 红底白字。

确认退出必须：

1. 清空图片队列。
2. 清空裁切框、旋转和比例。
3. 清空 AI 结果和表单草稿。
4. 清空 CropJob/CropResult。
5. 标记当前 Session 结束。
6. 执行返回。
7. 下次从业务入口进入时创建全新 Session。

### 8.3 系统返回技术边界

建立共享 `MiniIntakeLeaveGuard`。优先用无视觉内容的 `page-container` 离页拦截，在真实微信返回时打开自绘 Sheet；只有程序已确认离开时才允许真正返回。

必须在 Android 真机微信验证系统返回键和边缘返回。如果目标微信版本不能可靠拦截，备用方案是把整个录入流作为来源页上的全屏 `page-container` 承载；不得退回微信系统业务确认框，也不得只靠 `onUnload` 事后清理冒充“已提示”。

## 9. Step 2 确认信息页

- 左上返回和系统返回：回 Step 1，保留图片、裁切、识别结果和字段草稿。
- 右上关闭：按退出录入规则处理。
- 保存成功：清空 Session 并返回来源页。
- 保存失败：停留当前页，保留草稿和 mutationId 重试语义。
- Step 2 不得重新创建 Session。
- 部分保存确认继续使用自绘 Sheet。

## 10. 其他裁切消费者

### 10.1 衣物编辑与种草编辑

重新裁切必须传递原始资产、当前 cropBox、旋转角和比例。应用后生成新的 processedPath 和裁切元数据，但不替换原始资产。保存时继续遵守原图、缩略图、裁切元数据和服务端事务边界。

### 10.2 试穿与试穿档案

改为统一创建 CropJob，应用后读取结构化 CropResult。不得继续只传一个路径字符串，也不得要求必须有 intake clientItemId。

## 11. 实施批次与提交边界

### 批次 1：录入 Session 与裁切数据模型

- 不可变原图。
- cropBox、rotationDeg、cropRatio。
- CropJob/CropResult。
- 修复二次裁切源图。

建议提交：`wechat mini preserve original crop session model`

### 批次 2：裁切算法与裁切页

- 实测舞台和图片矩形。
- 统一 Canvas 像素坐标。
- 旋转预览与导出一致。
- 顶栏、比例、旋转、底部按钮全部收口。

建议提交：`wechat mini fix crop export and viewport layout`

### 批次 3：Step 1 一屏布局与气泡

- 删除清空按钮与冗余提示。
- 大图改为弹性高度。
- 气泡默认隐藏、点击出现、滚动跟随。
- 来源按钮空/有图双形态。

建议提交：`wechat mini fix intake viewport and thumbnail popover`

### 批次 4：返回守卫与共享消费者

- Step 1/Step 2/裁切返回优先级。
- 自绘退出确认。
- Session 清理。
- 衣物、种草、试穿入口复用。

建议提交：`wechat mini align intake exit and shared recrop flows`

每批完成后先更新 `VERSION_HISTORY.md` 再提交。最终必须保证工作区无本次任务未提交修改。

## 12. 自动测试

### 12.1 裁切纯函数

必须覆盖：

- 竖图、横图、方图的 aspectFit 图片矩形。
- 自由和 3:4 坐标换算。
- 左转、右转、连续旋转。
- 裁切框四边和四角边界。
- 裁切整件衣物时输出完整区域。
- 二次裁切仍以原图为源。
- 相同 cropBox 重复应用结果稳定。

增加四色象限测试图：

```text
红 | 绿
───┼───
蓝 | 黄
```

分别裁切左上、右上、中央、全图，断言输出颜色区域，防止只验证“生成了文件”却漏掉坐标偏移。

### 12.2 页面与状态测试

- 选图后气泡默认隐藏。
- 点击第一/中间/最后缩略图后气泡出现。
- 再次点击同图关闭气泡。
- 横滑时气泡跟随，目标不可见时关闭。
- 气泡左右不越过照片卡片。
- 气泡图标和文字居中且不换行。
- 删除后相邻图片选择正确。
- 无纵向页面滚动。
- 裁切页全部按钮不出框。
- 应用中禁止重复点击。
- 二次裁切加载原图和旧框。
- Step 1 返回弹自绘确认。
- Step 2 返回 Step 1。
- 确认退出后重新进入为空 Session。

现有 `mini-intake-state-machine` 只验证源码字符串存在，必须补行为和数据合同；typecheck 与正则通过不能作为裁切已验收的证据。

## 13. 验证命令

最低本地验证：

```bash
npx tsc --noEmit --project apps/wechat-miniprogram/tsconfig.json
npx tsx scripts/parity/tests/mini-intake-state-machine.test.ts
npm run test:logic:miniprogram-asset-lifecycle
npm run test:logic:miniprogram-intake-state-machine
git diff --check
```

若新增了专用裁切测试，应加入正式 package script 和受影响测试映射，而不是只运行一次临时命令。

微信开发者工具：

```bash
node apps/wechat-miniprogram/scripts/wechatide-open.mjs
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --refresh
```

不得把 typecheck 或 CLI 编译通过写成“真机裁切已验证”。

## 14. 真机验收

至少在 MEIZU 21 Pro 的微信中执行：

1. 从图库选择两张真实衣物图片。
2. 确认选图后气泡没有自动出现。
3. 点击两张缩略图，检查气泡出现、居中、箭头和边界。
4. 横向滚动缩略图，检查气泡跟随或正确关闭。
5. 确认整个 Step 1 一屏展示，不能纵向滚动。
6. 裁切一张衣物图，框选整件衣服并应用。
7. 检查大图和缩略图都展示完整裁切结果，不是右上角局部。
8. 再次进入裁切，确认加载原图、上次旋转和上次框。
9. 验证自由、3:4、左转、右转、重置、取消、应用。
10. 在 Step 1 使用系统返回，确认显示自绘退出 Sheet。
11. 选择“继续录入”，确认草稿保留。
12. 再次返回并选择“退出并清空”。
13. 重新进入录入，确认图片、裁切和 AI 状态全部为空。
14. 重复验证新增种草流程。
15. 采集微信调试 console/network，确认无 Canvas、路径、页面栈异常。

视口至少覆盖：

- 360 × 780
- 390 × 844
- 412 × 915
- 430 × 932

## 15. 完成定义

只有同时满足以下条件才能宣告完成：

- 八项用户反馈全部有对应修复和验收证据。
- 单品和种草 Step 1 都通过一屏与气泡验收。
- 裁切输出像素与裁切框一致。
- 二次裁切以原图和旧框初始化。
- 自绘退出确认覆盖真实系统返回。
- 确认退出后再次进入是全新 Session。
- 衣物编辑、种草编辑、试穿和试穿档案没有因共享裁切页回归。
- 小程序 typecheck、定向测试、微信 CLI 编译通过。
- 微信真机完成真实图片裁切和返回验收。
- `VERSION_HISTORY.md` 记录设备、微信环境、已测路径和未覆盖风险。
- 所有有效修改已提交，提交不夹带其他 Session 文件。

以下情况不得标记完成：

- 只通过 TypeScript 类型检查。
- 只通过源码正则测试。
- 只确认页面能打开，没有检查裁切结果像素。
- 只在微信开发者工具模拟器验证，没有真机返回键和真实图片。
- 使用微信系统确认框替代自绘确认。
- 退出后靠 `onUnload` 清理，但没有在离开前向用户提示。

## 16. 中断后恢复检查点

上下文压缩或任务中断后，执行者只需按以下顺序恢复：

1. 读取本文和 `VERSION_HISTORY.md` 最新记录。
2. 执行 `git status --short` 和 `git log --oneline -8`。
3. 对照第 11 节确认当前停在批次 1、2、3 或 4。
4. 检查本批代码、测试和历史记录是否已经提交。
5. 运行本批定向测试，不依赖聊天中的“已经通过”描述。
6. 从第 14 节真机清单中继续尚未留下证据的步骤。
7. 只有第 15 节全部满足后才能进入集成与推送。
