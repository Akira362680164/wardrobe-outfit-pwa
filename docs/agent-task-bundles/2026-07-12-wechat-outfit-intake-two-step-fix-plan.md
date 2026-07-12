# 微信小程序套装录入两步流程修复任务书

> 文档用途：供后续 Codex / Claude Code / MiniMax Code 会话直接接手实施，避免长对话被压缩后丢失产品边界、UI 层级、数据字段和验收要求。
>
> 当前状态：仅完成方案固化，尚未修改小程序运行时代码。

## 1. 任务目标

将微信小程序当前的“三步套装创建”改为与 App 一致的两步录入流程：

```text
第一步：从服务器当前衣橱中的已有衣物选择至少 2 件
                         ↓ 自动分析（过渡态，不是第三步）
第二步：校对套装信息并保存，保存成功后强制从服务器读回
```

完成后，小程序套装创建不得再出现“图片 / AI → 基础信息 → 逐件确认”的三步结构，也不得在套装创建流程中提供新增衣物或上传套装封面的入口。

## 2. 开工前必读与事实源优先级

后续实施会话必须按以下顺序读取：

1. 项目根目录 `AGENTS.md`。
2. 用户协作偏好：`/Users/fangzheng/Documents/Codex/2026-05-28/codex-ui-codex-agent-codex/codex_experience_profile.md`。
3. 本任务书。
4. UI 唯一事实源：`docs/designs/wardrobe-ui-spec.md`。
5. App 交互事实源：`src/components/outfit-intake-flow.tsx`、`src/components/intake-flow-shell.tsx`。
6. 小程序当前实现：`apps/wechat-miniprogram/pages/outfits/compose/`、`apps/wechat-miniprogram/services/workspace.ts`、`apps/wechat-miniprogram/services/ai.ts`。
7. 最新 `VERSION_HISTORY.md`，按 `AGENTS.md` 做跨 agent 历史接力检查。

出现冲突时采用以下优先级：

1. 用户当前指令。
2. `AGENTS.md`。
3. `docs/designs/wardrobe-ui-spec.md`。
4. App 当前两步流程和真实业务截图。
5. 小程序现有实现。

App 截图用于确认结构，不用于复制已知安全区或空白缺陷。颜色、圆角、毛玻璃、安全区和控件形状以 UI 规范 MD 为准；App 代码中尚未统一的历史 `rounded-lg` 等字面样式不是小程序的新标准。

## 3. 当前问题与根因

### 3.1 小程序当前实现

当前文件：

- `apps/wechat-miniprogram/pages/outfits/compose/index.ts`
- `apps/wechat-miniprogram/pages/outfits/compose/index.wxml`
- `apps/wechat-miniprogram/pages/outfits/compose/index.wxss`
- `scripts/parity/tests/mini-outfit-flow.test.ts`

当前流程被硬编码为三步：

1. 图片 / AI：允许拍照或从图库选择套装封面。
2. 基础信息：先填写套装名称。
3. 逐件确认：最后才从衣橱选择衣物，并手动点击 AI 生成元数据。

专项测试仍断言页面必须显示 `步骤 {{step+1}} / 3`，因此错误流程已同时固化在运行时和测试中。

### 3.2 与 App 的差异

App `OutfitIntakeFlow` 的正式流程固定为：

1. `select`：从已有衣物中选择至少 2 件。
2. `confirm`：校对自动生成的套装草稿并保存。

AI 或本地分析只是从第一步进入第二步时的过渡状态，不单独占步骤。App 还明确限制：

- 只展示 `status === "active"` 且具有正式数字 ID 的衣物。
- 不在套装录入中创建未知衣物。
- 无 MiniMax Key 或 AI 失败时使用本地规则，不阻塞主流程。
- 保存必须等待服务器写入和重新读取。

## 4. 本次范围

### 4.1 必须完成

- 小程序套装录入改为两步。
- 第一步只从服务器当前衣橱中的已有在用衣物选择。
- 增加衣橱位置、搜索、分类筛选和三列衣物宫格。
- 选择至少 2 件后自动生成本地草稿，并在可用时尝试 AI 增强。
- 第二步展示质量摘要、组成完整度、校对字段和条件问题卡片。
- 补齐小程序套装保存缺失的 `styleTags`、`pairingTags`、`temperatureRange` 透传。
- 保存成功后强制 `fetchOutfitDetail(created.id)` 读回。
- 保存失败保留草稿，草稿未变化时复用同一 `clientMutationId`。
- 退出未保存草稿使用项目 `ui-confirm-sheet`。
- 修改专项测试，防止流程恢复成三步。
- 更新 `VERSION_HISTORY.md` 并提交。

### 4.2 明确不做

- 不重做套装首页。
- 不重做套装详情页。
- 不删除详情页已有的实穿照片、封面展示或服务器资产能力。
- 不新增服务端接口。
- 不修改数据库或迁移。
- 不新增本地业务缓存、Outbox 或隐藏同步队列。
- 不上传衣物图片给套装元数据 AI。
- 不修改共享领域字典，除非实施中发现真实缺陷并由用户另行授权。
- 不新建设计体系、组件库或依赖。
- 不顺手修复 App UI。
- 默认不使用 subagent；如后续用户明确授权，仍须按文件隔离委派。

## 5. 目标状态机

```text
loading_wardrobe
  ├─ success → step_select
  ├─ logged_out → state_logged_out
  ├─ api_not_configured → state_api_not_configured
  └─ failure → state_load_failed

step_select
  ├─ select / unselect / filter / search → step_select
  ├─ selected < 2 + next → inline validation
  └─ selected >= 2 + next → analyzing

analyzing
  ├─ build local draft → optional AI enhancement
  ├─ AI success → step_confirm(ai)
  ├─ no key → step_confirm(local)
  └─ AI failure → step_confirm(local + non-blocking notice)

step_confirm
  ├─ edit fields → step_confirm(dirty)
  ├─ back → step_select，保留选择与草稿
  ├─ invalid + save → inline validation
  └─ valid + save → saving

saving
  ├─ create + readback success → success → outfit_home
  └─ failure → step_confirm，保留草稿并允许重试
```

用户可见步骤永远只有 `1 / 2` 和 `2 / 2`。

## 6. 公共录入壳与导航

小程序全局 `navigationStyle` 已是 `custom`。套装录入页应使用项目现有 token 和运行时胶囊信息构成录入壳，不复制 App Android 安全区数值。

目标结构：

```text
┌─────────────────────────────────┐
│ ‹              创建套装       ×  │  避让微信胶囊
│         步骤 1 / 2 · 选择衣物    │
│ █████████████░░░░░░░░░░░░░░░   │
├─────────────────────────────────┤
│                                 │
│ 当前步骤可滚动内容                │
│                                 │
├─────────────────────────────────┤
│        上一步    下一步（自动分析）│
└─────────────────────────────────┘
```

要求：

- 顶部为透明毛玻璃层，不绘制实心白条。
- 使用现有 `utils/capsule-layout.ts` 或等价既有模式避让微信胶囊，不写死截图坐标。
- 第一步左侧上一步禁用；右侧关闭退出录入。
- 第二步左侧返回第一步；右侧关闭退出录入。
- 有未保存选择或草稿时，关闭必须打开 `ui-confirm-sheet`。
- 进度底色 `--color-mist`，完成部分 `--color-primary`。
- 底部为固定毛玻璃操作栏并处理 `env(safe-area-inset-bottom)`。
- 左右按钮宽度约 `1 : 1.6`，高度不低于等效 48px，使用 `--radius-control`。
- 主内容只为真实底部操作栏高度预留滚动空间，不制造额外空白。

## 7. 第一步：选择衣物

### 7.1 页面层级

```text
┌─ 一级卡片：选择衣物组成套装 ─────────┐
│ [layers 图标槽] 选择衣物组成套装      │
│ 套装必须从已有衣物组合，请至少选择2件  │
│                                    │
│ [全部衣橱 4] [默认衣橱 4] [...]      │
│                                    │
│ [搜索图标  搜索名称、颜色或分类      ] │
│                                    │
│ [全部 4] [上衣 2] [鞋 2] [...]       │
│                                    │
│ ┌──────┐ ┌──────┐ ┌──────┐       │
│ │ 3:4图 │ │ 3:4图 │ │ 3:4图 │       │
│ │名称   │ │名称   │ │名称   │       │
│ │分类   │ │分类   │ │分类   │       │
│ └──────┘ └──────┘ └──────┘       │
└───────────────────────────────────┘

┌─ 低层级已选摘要 ────────────────────┐
│ 已选 3 件                           │
│ [白鞋 ×] [衬衫 ×] [长裤 ×]          │
└───────────────────────────────────┘
```

### 7.2 数据范围

调用现有 `fetchGarments()` 后，只保留：

- `status === "active"`。
- `legacyItemId` 为有效数字。

不得展示或创建：

- 洗衣、维修、归档衣物。
- 未获得正式 ID 的临时衣物。
- 新衣物录入入口。
- 拍照、图库或套装封面入口。

### 7.3 衣橱位置筛选

- 横向滚动 Chip。
- 显示“全部衣橱（数量）”和真实衣橱位置。
- 默认选中当前默认衣橱；用户可切换全部衣橱或其他位置。
- 选中：`--color-primary` 10% 背景、Primary 文字和边框。
- 未选中：Paper/Mist 背景、Muted 文字、透明等宽边框。
- 切换位置不得清除此前选择。

若当前 `fetchGarments()` 返回结构缺少位置名称，优先复用现有位置读取函数；不要新建服务端接口。

### 7.4 搜索与分类

搜索：

- 单行圆角矩形。
- 搜索名称、颜色、一级分类。
- 左侧使用现有 `ui-icon` 的搜索图标。
- 输入变化只影响展示，不影响已选集合。

分类：

- 横向滚动 Chip。
- 只显示当前衣橱范围内数量大于 0 的分类。
- 分类和值从现有生成目录或分类适配层读取，不新建平行枚举。

### 7.5 衣物宫格

- 三列布局。
- 图片框固定 `3:4`。
- 显示名称和一级分类。
- 名称与分类单行省略，不能撑高卡片。
- 点击整张卡片切换选中状态。
- 未选中：Paper 背景、`--color-line` 边框。
- 选中：Primary 边框和 Primary 淡色背景。
- 不增加编辑、删除、新建或更多按钮。

### 7.6 已选摘要

- 位于一级卡片之后，是低层级面板，不是另一张同等级大卡片。
- 显示真实选择数量。
- 少于 2 件时显示“至少选择 2 件”。
- 每件衣物以名称胶囊展示，右侧可取消选择。
- 衣物即使因当前筛选条件隐藏，也必须继续出现在已选摘要中。

### 7.7 底部按钮

- 左按钮：“上一步”，第一步禁用。
- 右按钮：“下一步（自动分析）”。
- 少于 2 件时禁用右按钮。
- 点击后进入分析过渡态，不新增页面步骤。

## 8. 自动分析与本地兜底

进入第二步前必须先同步构造本地草稿，保证没有 MiniMax Key 或 AI 失败时主流程仍可完成。

本地草稿至少包含：

- `name`：根据已选衣物名称生成可编辑的基础名称。
- `seasons`：合并已选衣物季节并去重。
- `styleTags`：合并已选衣物风格并去重。
- `temperatureRange`：根据已选衣物已有范围生成可保存值。
- `sceneTags`：无法可靠推断时允许空数组。
- `pairingTags`：默认空数组。
- `notes`：默认空字符串。

实现约束：

- 优先在 `pages/outfits/compose/index.ts` 内保留一个小型纯函数，不为单页逻辑创建新框架或 service。
- 若配置 MiniMax Key，则调用现有 `generateOutfitMetadata()` 增强本地草稿。
- AI 输入只发送已选衣物结构化字段，不发送图片。
- 使用 `item.seasons` 和 `item.styles`，不得继续把 `seasonText` 整段作为单个季节值，也不得继续把 `styles` 固定为空数组。
- AI 结果只覆盖返回的字段，不清空本地已有值。
- 无 Key：直接进入第二步，提示“已使用本地规则生成”。
- AI 失败：保留本地草稿进入第二步，提示“AI 生成失败，已使用本地规则生成”。
- 不再弹出“请先在设置中填写 MiniMax Key”阻塞套装创建。

## 9. 第二步：确认套装

### 9.1 页面层级

```text
┌────────┐ ┌────────┐ ┌────────┐
│ 字段 6  │ │待确认 2 │ │可保存 是│
└────────┘ └────────┘ └────────┘

┌─ 一级卡片：组成完整度 ───────────────┐
│ [package-check] 组成完整度            │
│ [上装 已覆盖] [下装 已覆盖] [鞋 未覆盖]│
│ [包 未覆盖]  [外套 未覆盖] [配饰 已覆盖]│
│ 已选择3件，基础组成还缺鞋。            │
└───────────────────────────────────┘

┌─ 一级卡片：校对套装草稿 ─────────────┐
│ [tag] 校对套装草稿                   │
│ 套装名称  [通勤基础套装             ] │
│ 季节      [春] [夏] [秋] [冬] [四季] │
│ 场景标签  [通勤、日常               ] │
│ 风格标签  [简约、休闲               ] │
│ 搭配标签  [基础款、低饱和           ] │
│ 备注      [三行文本框               ] │
└───────────────────────────────────┘

┌─ 条件一级卡片：需要留意 ─────────────┐
│ [alert-triangle] 需要留意             │
│ [需确认] 具体问题说明                 │
└───────────────────────────────────┘
```

### 9.2 质量摘要

三个并列紧凑指标块，不再外套一级卡片：

- 字段：当前展示字段总数。
- 待确认：仍需人工确认的字段数。
- 可保存：是 / 否。

颜色：

- 默认：Primary 文字和 8% 背景。
- 正常 / 可保存：Success 文字和 8% 背景。
- 待确认 / 不可保存：AI/Clay 文字和 8% 背景。

### 9.3 一级卡片一：组成完整度

只展示结构分析，不放表单字段。包含：

- 上装
- 下装
- 鞋
- 包
- 外套
- 配饰
- 动态总结

已覆盖使用 Success 淡底；未覆盖使用 Paper/Mist 淡底。基础组成是否完整不作为保存硬阻塞，至少 2 件和名称非空才是保存硬条件。

### 9.4 一级卡片二：校对套装草稿

以下字段必须全部放在同一张一级卡片中，不拆成多张大卡片：

1. 套装名称：单行输入，必填。
2. 季节：共享目录中的多选 Chip。
3. 场景标签：顿号分隔文本。
4. 风格标签：顿号分隔文本。
5. 搭配标签：顿号分隔文本。
6. 备注：三行文本框。

控件要求：

- 输入框、搜索框和普通按钮使用 `--radius-control`。
- 输入背景为 Paper，边框为 `--color-line`。
- 聚焦或选中状态使用 Primary。
- 季节选中 Chip 使用 Primary 实心和 Surface 文字。
- 未选中 Chip 使用 Paper 背景、Muted 文字和 Line 边框。
- 文字、按钮和标签在窄屏不能溢出。

`temperatureRange` 可由分析结果保存，但本批不新增温度滑条，以 App 当前套装确认页的可见字段为准。

### 9.5 条件卡片：需要留意

仅存在问题时渲染，例如：

- 名称为空。
- 选择不足 2 件。
- 部分衣物缺少正式 ID。
- AI 失败但本地草稿已保留。
- 保存或服务器读回失败。

使用 AI/Clay 淡色提示。除不可恢复删除外，不使用危险红色。

### 9.6 底部按钮

- 左按钮：“上一步”。
- 右按钮：“保存 N 件套装”，N 必须等于真实选择数量。
- 名称为空、选择少于 2 件、正在保存时禁用保存。
- 保存中禁止重复提交。

## 10. 保存合同与幂等

现有小程序 `CreateOutfitInput` 只支持：

- `name`
- `legacyItemIds`
- `seasons`
- `sceneTags`
- `notes`
- `assetMutations`
- `clientMutationId`

本次需补齐：

- `styleTags?: string[]`
- `pairingTags?: string[]`
- `temperatureRange?: { minC?: number; maxC?: number }`

保存 payload 继续包含：

- `source: "manual"`
- `favorite: false`
- `createdAt`
- `updatedAt`

套装创建流程不再提交封面 `assetMutations`；保留 `createOutfit()` 的通用可选 `assetMutations` 参数，以免影响其他调用者。

幂等规则：

- 进入录入时生成初始 `clientMutationId`。
- 选择衣物或编辑任一草稿字段后生成新 ID。
- 保存失败但草稿未变化时重试，复用同一 ID。
- 保存成功必须执行 `await fetchOutfitDetail(created.id)`。
- 创建成功但读回失败，页面不得显示最终成功或直接离开；提示“已保存，但重新读取失败，请稍后重试”，保留当前页面状态供重新确认。

## 11. 视觉 token

只使用 `apps/wechat-miniprogram/styles/tokens.wxss` 现有变量：

| 对象 | Token / 数值 |
| --- | --- |
| 页面背景 | `--app-ambient` |
| 主文字 | `--color-ink` = `#1d2228` |
| 次级文字 | `--color-muted` |
| 表面 | `--color-surface` = `#fffffc` |
| 次级背景 | `--color-mist` = `#f4f5f3` |
| 边框 | `--color-line` |
| 主操作 / 选中 | `--color-primary` = `#355c7d` |
| 成功 / 已覆盖 | `--color-success` = `#5f7058` |
| AI / 待确认 | `--color-ai` = `#b97155` |
| 危险 | `--color-danger` = `#dc2626` |
| 一级卡片 | `--radius-card` = `56rpx` |
| 一级卡片内部块 | `--radius-card-inner` = `40rpx` |
| 二级卡片 | `--radius-card-secondary` = `36rpx` |
| 普通控件 | `--radius-control` = `28rpx` |
| 缩略图 | `--radius-thumb` = `20rpx` |

不得在本页新增另一组颜色、圆角、阴影或玻璃参数。若 UI 规范与现有 token 发生真实冲突，先停止并说明，不自行创建平行 token。

## 12. 预计修改文件

| 文件 | 预期修改 |
| --- | --- |
| `apps/wechat-miniprogram/pages/outfits/compose/index.ts` | 两步状态机、筛选、选择、本地草稿、AI 降级、字段编辑、退出确认、幂等状态 |
| `apps/wechat-miniprogram/pages/outfits/compose/index.wxml` | 两步页面、衣物宫格、质量摘要、组成完整度、校对卡片、问题卡、底部操作栏 |
| `apps/wechat-miniprogram/pages/outfits/compose/index.wxss` | 按 UI token 重写布局、选中态、卡片、控件、滚动和安全区 |
| `apps/wechat-miniprogram/pages/outfits/compose/index.json` | 注册现有 `ui-icon` 与 `ui-confirm-sheet` |
| `apps/wechat-miniprogram/services/workspace.ts` | 扩展 `CreateOutfitInput` 和 payload 字段 |
| `scripts/parity/tests/mini-outfit-flow.test.ts` | 删除三步断言，增加两步、字段、无封面入口、读回与幂等合同 |
| `VERSION_HISTORY.md` | 记录范围、验证和未验证风险 |

原则上不需要修改 `services/ai.ts`、`services/assets.ts`、服务端代码或共享字典。

## 13. 最小实现顺序

### Task 0：独立 Session

- [ ] 检查 `git branch --show-current`、`git status --short`、`git worktree list`。
- [ ] 从本地 `wechat/miniprogram` 最新已提交状态建立独立分支和 worktree。
- [ ] 确认基线没有 tracked/staged 修改和未完成 Git 操作。

### Task 1：状态机与数据

- [ ] 删除 compose 页封面选择、上传和三步状态。
- [ ] 过滤在用且有有效 ID 的衣物。
- [ ] 增加位置、搜索、分类和选中集合派生状态。
- [ ] 实现小型本地草稿纯函数。
- [ ] AI 改为可选增强和非阻塞降级。
- [ ] 增加字段修改及 `clientMutationId` 变化规则。

### Task 2：保存合同

- [ ] 扩展 `CreateOutfitInput`。
- [ ] 提交 `styleTags`、`pairingTags`、`temperatureRange`。
- [ ] 保持创建后详情读回。
- [ ] 保证失败时草稿保留、未变化重试复用 mutation ID。

### Task 3：WXML / WXSS

- [ ] 实现两步顶部和进度条。
- [ ] 实现第一步一级选择卡和已选摘要。
- [ ] 实现第二步质量摘要、组成完整度、校对卡和条件问题卡。
- [ ] 实现固定底部操作栏、安全区和滚动预留。
- [ ] 接入 `ui-confirm-sheet`。

### Task 4：测试与历史

- [ ] 更新专项流程测试。
- [ ] 增加本地草稿和 AI 降级的最小可运行断言。
- [ ] 更新 `VERSION_HISTORY.md`。
- [ ] 检查 staged 文件只包含本任务修改。
- [ ] 提交 Git commit。

## 14. 自动验证

至少运行：

```bash
npm --prefix apps/wechat-miniprogram run typecheck
npm run test:logic:miniprogram-outfit-flow
npm run test:logic:miniprogram-asset-lifecycle
git diff --check
```

若修改了共享目录或生成目录，再补充共享字典完整验证；本任务正常情况下不应触发。

微信开发者工具：

```bash
node apps/wechat-miniprogram/scripts/wechatide-open.mjs
node apps/wechat-miniprogram/scripts/wechatide-compile.mjs --refresh
```

若 worktree 尚未导入微信开发者工具，不得把 `PROJECT_IMPORT_NOT_IN_LIST` 误判成代码错误；先按项目规则导入或打开真实 worktree。

## 15. 交互与视觉验收

必须覆盖：

- [ ] 无 MiniMax Key 仍能完成套装创建。
- [ ] AI 请求失败仍能完成创建，并显示本地兜底提示。
- [ ] 衣橱只展示在用且具有正式 ID 的已有衣物。
- [ ] 页面没有拍照、图库、套装封面和新增衣物入口。
- [ ] 少于 2 件不能进入第二步。
- [ ] 切换位置、分类和搜索不会丢失已选集合。
- [ ] 返回第一步后选择和草稿不丢失。
- [ ] 第二步字段全部处于同一张“校对套装草稿”一级卡片。
- [ ] 组成完整度是独立一级卡片。
- [ ] 条件问题卡没有问题时完全不渲染。
- [ ] 保存按钮数量与真实选择数一致。
- [ ] 保存失败保留草稿。
- [ ] 保存成功后服务器读回一致。
- [ ] 退出未保存草稿使用项目 Sheet，不使用微信原生业务确认框。
- [ ] 360 / 390 / 430 等效宽度无横向溢出和文字覆盖。
- [ ] 微信胶囊、状态栏和底部安全区无遮挡。
- [ ] 不复制 App 修复前上下大面积空白的旧截图问题。

建议留存五个截图证据：

1. 第一步默认状态。
2. 第一步已选择至少 2 件。
3. 自动分析中过渡状态。
4. 第二步完整校对页面。
5. 保存失败保留草稿或保存成功读回页面。

## 16. 专项测试必须防止的回归

`scripts/parity/tests/mini-outfit-flow.test.ts` 至少应断言：

- 显示 `步骤 {{step+1}} / 2`。
- 不出现 `/ 3`。
- 不出现“图片 / AI”“套装图片”“拍照或从图库选择”。
- compose 运行时代码不再导入或调用 `chooseImages`、`uploadPreparedImageAssets`。
- 第一步包含选择衣物、搜索、分类、真实已选数量。
- 第二步包含名称、季节、场景、风格、搭配标签、备注。
- 保存按钮显示真实 `selectedCount`。
- `createOutfit()` 透传 `styleTags`、`pairingTags`、`temperatureRange`。
- 创建后调用 `fetchOutfitDetail(created.id)`。
- 无 Key 不会阻塞进入确认页。
- 退出确认使用 `ui-confirm-sheet`。

不要只做字符串存在测试；本地草稿、过滤和幂等分支至少保留一个可运行的逻辑断言。

## 17. 完成定义

只有同时满足以下条件才算完成：

1. 小程序用户可见套装录入只有两步。
2. 创建过程完全移除封面/新衣物语义。
3. 无 Key 和 AI 失败均有可用闭环。
4. 第二步全部字段、卡片层级和视觉 token 与本任务书一致。
5. 服务端保存字段完整且强制读回。
6. 自动测试、微信开发者工具编译和关键交互验证通过。
7. `VERSION_HISTORY.md` 已记录验证方式与未覆盖风险。
8. 本任务全部有效修改已提交，commit 只包含本任务文件。

## 18. 实施边界复述

最小闭环是：删除错误三步与封面上传，复用现有衣物、AI、保存接口和 UI token，完成“选择衣物 → 自动分析 → 校对保存”的两步流程。不要借此重构小程序全局表单、创建新组件库或重做套装其他页面。
