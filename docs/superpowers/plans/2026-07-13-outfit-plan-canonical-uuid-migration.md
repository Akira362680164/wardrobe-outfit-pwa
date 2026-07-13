# 套装与穿搭计划 Canonical UUID 收口完整修复方案

> 日期：2026-07-13
>
> 状态：待评审
>
> 范围：App、微信小程序、`packages/cloud-contracts`、Wardrobe API、PostgreSQL、自动化测试与发布流程
>
> 目标：修复穿搭计划存在但日历无法解析套装、无法显示缩略图的问题，并彻底删除套装/计划链路中的旧标识运行时依赖。

## 1. 结论

本缺陷不是单纯的缩略图渲染问题，而是 App、小程序和服务端对同一个套装使用了两套 ID：

- 服务端权威 ID：`outfits.id`，UUID。
- App 旧 ID：`outfits.payload.legacyOutfitId`，格式通常为 `outfit-<uuid>`。

App 当前优先把 `legacyOutfitId` 暴露为 `SavedOutfit.id`，小程序则把 `entity.id` 暴露为套装 ID。两端向同一张 `outfit_plans` 表写入不同格式的 `outfitId`，日历又使用字符串严格相等查找套装，因此跨端写入后会形成“计划记录存在、套装解析失败”的状态。

本方案采用硬收口：

1. `outfits.id` 是套装唯一业务 ID。
2. `outfit_plans.id` 是日计划唯一业务 ID。
3. `trip_plans.id` 是范围计划唯一业务 ID。
4. 计划关系只通过数据库 UUID 外键表达，不再依赖 JSON payload 中的旧 ID。
5. 新客户端和新 API 不接收、不返回、不生成 `legacyOutfitId`、`legacyPlanEntryId`。
6. 无法迁移的脏数据必须显式阻断发布，不允许客户端通过多 ID 回退掩盖。

## 2. 用户可见现象与证据链

用户在 2026-07-13 提供的 Android 截图中，7 月 15 日同时出现：

- 日期格显示“计划”；
- 日期格没有套装缩略图；
- 展开日卡显示“尚未安排当天穿搭”；
- 选择套装后 Toast 显示“已加入穿搭计划”，但页面仍未恢复。

这四个现象可以由当前代码完整解释：

1. 日历能找到 `OutfitPlanEntry`，所以显示“计划”。
2. 日历用 `entry.outfitId === outfit.id` 查找套装。
3. ID 不一致时 `outfit` 为 `null`，缩略图和套装卡都无法生成。
4. 普通“安排套装”入口可能将新记录写成备选，旧的失联主记录仍优先展示。
5. 当前成功 Toast 只证明请求完成，没有验证服务端读回后主计划是否仍可解析。

因此，“计划”文字不是缩略图加载失败的占位，而是失联计划记录仍存在的证据。

## 3. 当前实现盘点

### 3.1 App

- `src/lib/online/online-repository.ts`
  - 套装映射使用 `legacyOutfitId`，缺失时才回退 `entity.id`。
  - 计划映射使用 `legacyPlanEntryId`，缺失时才回退 `entity.id`。
- `src/lib/repository/wardrobe-repository.ts`
  - App 创建套装时主动生成并写入 `legacyOutfitId`。
  - 更新套装时继续把 `outfit.id` 写回 `legacyOutfitId`。
- `src/lib/outfit-wear-sync.ts`
  - 创建计划时把 App 层 `outfit.id` 原样写入 payload。
- `src/components/outfit-weekly-plan-strip.tsx`
- `src/components/outfit-planning-calendar-view.tsx`
- `src/components/outfit-plan-detail-view.tsx`
  - 都通过字符串严格相等匹配计划与套装。
- `src/components/outfit-list-view.tsx`
  - 空日期“安排套装”和已有计划“添加备选”没有完全隔离语义。
  - 计划详情中的“更换套装”仍可能走普通选择模式。

### 3.2 微信小程序

- `apps/wechat-miniprogram/services/workspace.ts`
  - 套装始终使用服务端 `entity.id`。
  - 计划仍从自由格式 payload 读取 `outfitId` / `actualOutfitId`。
  - 创建计划时把小程序套装 UUID 写入 payload。
- `apps/wechat-miniprogram/pages/outfits/index/index.ts`
- `apps/wechat-miniprogram/pages/outfits/calendar/index.ts`
- `apps/wechat-miniprogram/pages/trips/detail/index.ts`
  - 都通过 `entry.outfitId === outfit.id` 解析套装。

小程序自身新建的套装和计划通常使用同一种 UUID，因此单端测试可能正常；但读取 App 旧计划、或者小程序给 App 创建的旧套装安排计划时，会出现跨端失联。

### 3.3 服务端与数据库

- `outfits.id` 已经是 UUID 主键。
- `outfit_plans.id` 已经是 UUID 主键。
- `outfit_plans.outfit_id` 已经存在 UUID 外键，但当前写入逻辑只在 payload 的 `outfitId` 本身是 UUID 时才能填充。
- App 写入的 `outfit-<uuid>` 不能通过 `uuidOrNull`，因此 `outfit_plans.outfit_id` 为空。
- `actualOutfitId` 只存在 payload，没有规范的 `actual_outfit_id` 外键。
- 穿着事务仍大量使用 `legacyOutfitId ?? entity.id` 比较计划。

本机测试库检查结果显示，现存有效计划的规范 `outfit_id` 大量为空，证明数据库虽已预留规范字段，但没有真正成为权威关系。

## 4. 目标数据合同

### 4.1 套装

```ts
interface SavedOutfit {
  id: string; // UUID，等于 outfits.id
  revision: number;
  itemEntityIds: string[]; // 后续衣物 UUID 收口目标
  // 其他展示字段
}
```

禁止出现：

- `legacyOutfitId`
- `outfit-<uuid>`
- 使用 `clientMutationId` 拼接业务实体 ID

### 4.2 日计划

数据库权威字段：

```text
outfit_plans.id                 UUID PRIMARY KEY
outfit_plans.user_id            UUID NOT NULL
outfit_plans.plan_date          DATE/TEXT NOT NULL
outfit_plans.trip_plan_id       UUID NULL FK trip_plans(id)
outfit_plans.outfit_id          UUID NULL FK outfits(id)
outfit_plans.actual_outfit_id   UUID NULL FK outfits(id)
outfit_plans.status             planned | worn | skipped | changed
outfit_plans.is_primary         BOOLEAN
outfit_plans.is_primary_actual  BOOLEAN
outfit_plans.role               primary | backup | morning | afternoon | evening | other
outfit_plans.sort_order         INTEGER
outfit_plans.payload            JSONB，仅保存备注、场景、天气及展示快照
```

API 返回对象可以继续使用 `outfitId`、`actualOutfitId` 作为 JSON 字段名，但值只能来自规范数据库列，且必须是 UUID。不得再从 payload 读取同名字段作为权威值。

### 4.3 计划展示快照

为解决历史记录与当前套装生命周期冲突，payload 只保留轻量展示快照：

```ts
interface OutfitPlanDisplaySnapshot {
  outfitName: string;
  coverAssetId?: string;
  itemNames?: string[];
  capturedAt: string;
}
```

规则：

- 今天和未来的 `planned` 计划必须关联真实 `outfit_id`。
- 历史 `worn` 记录允许原套装被删除，但必须保留展示快照。
- 快照不是另一套业务实体，不参与编辑、打包和穿着统计。
- 旅行打包只读取旅行日期内仍有效、已确认的规范计划关系。

## 5. 数据不变量

上线后必须持续满足：

1. 新建套装、日计划和范围计划的业务 ID 都是 UUID。
2. 同一用户的计划只能关联该用户的套装和范围计划。
3. `status = planned` 的有效记录必须有非空、可解析的 `outfit_id`。
4. `status = changed` 必须有原计划 `outfit_id`，并在存在实际穿搭时有 `actual_outfit_id`。
5. `status = worn` 必须至少有 `actual_outfit_id` 或有效历史展示快照。
6. 同一用户、同一日期最多一个 `planned + is_primary`。
7. 同一用户、同一日期最多一个 `worn + is_primary_actual`。
8. 服务端不得接受 `outfit-*` 格式的计划关联 ID。
9. API 概览返回后，客户端不需要任何 legacy 回退即可解析全部有效计划。
10. 成功 Toast 只能在写入提交、服务端读回且目标状态可解析后显示。

## 6. 数据迁移设计

### 6.1 上线前只读审计

迁移前生成审计报告，至少包含：

- 有效套装总数；
- 含 `legacyOutfitId` 的套装数；
- 重复 `legacyOutfitId` 数；
- 有效计划总数；
- `outfit_id` 为空的计划数；
- payload `outfitId` 是 UUID 的计划数；
- payload `outfitId` 是旧格式的计划数；
- 无法匹配套装的计划数；
- 匹配多个套装的计划数；
- `actualOutfitId`、`calendarPlanId` / `tripPlanId` 的同类统计；
- 按用户列出受影响记录，但日志不得输出邮箱、手机号、图片 URL 或其他隐私数据。

审计结果只允许三种分类：

1. `canonical`：已经是同用户规范 UUID。
2. `migratable`：能通过同用户唯一 `legacyOutfitId` 转成 UUID。
3. `blocked`：零匹配或多匹配，必须人工决策。

存在任何 `blocked` 记录时禁止执行删除旧字段步骤。

### 6.2 数据库备份

生产迁移前必须完成：

- PostgreSQL 完整备份；
- 当前 API 镜像 tag 和 Git commit 记录；
- 当前 compose 配置备份；
- 迁移审计结果落盘；
- 回滚 SQL 或回滚迁移准备；
- 恢复演练至少在隔离数据库通过一次。

### 6.3 迁移步骤

建议新增独立 migration，例如：

`services/wardrobe-api/migrations/0017_outfit_plan_canonical_uuid.sql`

步骤：

1. 给 `outfit_plans` 增加 `actual_outfit_id UUID NULL` 外键。
2. 必要时把状态、主备和排序字段提升为规范列；若本批不提升，至少 ID 关系必须先收口。
3. 对 payload `outfitId`：
   - 若是 UUID，验证同用户 `outfits.id` 存在后写入 `outfit_id`；
   - 若是旧格式，仅允许通过同用户唯一 `payload.legacyOutfitId` 匹配后写入；
   - 否则记录为 blocked 并中止事务。
4. 对 payload `actualOutfitId` 执行相同迁移，写入 `actual_outfit_id`。
5. 对 `calendarPlanId` / `tripPlanId` 迁移到 `trip_plan_id`。
6. 从 payload 删除 `outfitId`、`actualOutfitId`、`legacyPlanEntryId`、重复的 `tripPlanId` 等关系字段。
7. 从套装 payload 删除 `legacyOutfitId`。
8. 更新 revision、`updated_at` 和 sync change 记录，确保在线客户端重新读取到迁移后的实体。
9. 添加约束和索引。
10. 在同一事务末尾重新运行不变量查询，任何失败都回滚。

迁移伪代码：

```sql
UPDATE outfit_plans p
SET outfit_id = resolved.id
FROM LATERAL (
  SELECT o.id
  FROM outfits o
  WHERE o.user_id = p.user_id
    AND o.deleted_at IS NULL
    AND (
      o.id::text = p.payload->>'outfitId'
      OR o.payload->>'legacyOutfitId' = p.payload->>'outfitId'
    )
) resolved
WHERE p.deleted_at IS NULL;
```

正式 SQL 必须在更新前验证每条记录的匹配数恰好为 1，不能直接使用可能产生多匹配的 UPDATE。

### 6.4 已失联数据的处理

不能自动猜测：

- 若计划 title 与某个套装同名，不足以作为自动关联证据。
- 若同用户存在多个同名套装，不得按更新时间选择。
- 若旧套装已删除：
  - 未来 `planned` 计划应删除或由用户重新选择；
  - 历史 `worn` 记录应生成展示快照并保留；
  - 处理结果写入迁移审计报告。

## 7. 服务端改造

### 7.1 合同

在 `packages/cloud-contracts/src/workspace/contracts.ts` 新增或收紧：

- 创建/更新计划 payload 使用专用 Schema，不再接受任意 `z.record(z.unknown())` 表达核心关系。
- `outfitId`、`actualOutfitId`、`calendarPlanId` 必须是 UUID。
- `status`、`role`、`isPrimary`、`sortOrder` 使用明确类型。
- 对 `outfit-*` 返回 HTTP 400 `invalid_outfit_id`。
- 对不存在或不属于当前用户的 UUID 返回 HTTP 409 `outfit_reference_invalid`。

### 7.2 写入服务

在 `services/wardrobe-api/src/workspace/command-service.ts`：

- 删除 `legacyOutfitId ?? input.entityId`。
- 所有套装比较使用 `outfits.id`。
- 创建计划前查询并锁定同用户套装。
- 规范写入 `outfit_id`、`actual_outfit_id` 和 `trip_plan_id`。
- payload 不再保存关系 ID。
- 标记已穿、取消已穿、设置主计划、删除套装级联全部使用 UUID 外键。
- 主计划切换必须在服务端单事务完成。

### 7.3 查询服务

在 `services/wardrobe-api/src/workspace/query-service.ts`：

- API 响应中的 `outfitId` 来自 `outfit_plans.outfit_id`。
- `actualOutfitId` 来自 `actual_outfit_id`。
- `calendarPlanId` 来自 `trip_plan_id`。
- 查询到违反不变量的记录时返回可诊断错误或隔离记录，不能静默拼接旧 payload。

### 7.4 删除套装事务

删除套装前按计划状态处理：

- 未来/当天 `planned`：删除对应计划，或阻止删除并提示先替换；产品默认建议事务内删除并返回清理数量。
- 历史 `worn`：先确保展示快照完整，再允许外键按既定策略置空。
- 打包清单：重新计算受影响旅行计划，只读取仍有效的规范 UUID 计划。
- API 返回真实删除、保留和重算数量。

## 8. App 改造

### 8.1 数据映射

`src/lib/online/online-repository.ts`：

- `SavedOutfit.id = entity.id`。
- `OutfitPlanEntry.id = entity.id`。
- `OutfitCalendarPlan.id = entity.id`。
- 删除所有 legacy ID 回退。
- 若 API 返回非 UUID 关系，抛出数据合同错误，不生成半可用 UI 对象。

### 8.2 Repository

`src/lib/repository/wardrobe-repository.ts`：

- 创建/更新套装不再写 `legacyOutfitId`。
- 创建/更新计划只提交 UUID。
- mutation 的实体定位继续使用 `serverEntityId`，最终应与领域 `id` 合并，减少双 ID 表达。

### 8.3 日历交互语义

`src/components/outfit-list-view.tsx`：

- 空日期“安排套装”使用 `makePrimary: true`。
- “更换套装”独立调用 replace 主计划逻辑。
- “添加备选穿搭”才使用 `role: backup`。
- 若当前主计划无法解析，不允许继续追加备选，应提示刷新或修复主计划。
- 写入后强制服务端读回，确认目标日期存在且主套装可解析，再关闭选择器并显示成功 Toast。

### 8.4 日历展示

周历、月历和计划详情：

- 正常运行时只按 UUID 匹配。
- 发现计划存在但套装不存在时，显示明确错误态“计划关联的套装已失效”，提供“重新选择套装”，不要伪装成“尚未安排”。
- 该错误态用于暴露数据问题，不是 legacy 兼容入口。

## 9. 微信小程序改造

### 9.1 数据服务

`apps/wechat-miniprogram/services/workspace.ts`：

- 保留 `MiniOutfit.id = entity.id`。
- `MiniOutfitPlanEntry.outfitId` 只读取服务端规范 UUID 字段。
- 删除 `firstString(payload.outfitId, payload.actualOutfitId)` 这类关系字段回退。
- 创建/更新计划继续提交 UUID，但使用收紧后的共享合同。
- 服务端读回后验证主计划可解析，失败不显示成功 Toast。

### 9.2 页面

同步修改：

- `pages/outfits/index/index.ts`
- `pages/outfits/calendar/index.ts`
- `pages/trips/detail/index.ts`

规则与 App 一致：

- 空日期安排主穿搭；
- 更换主计划；
- 单独添加备选；
- 失联关系展示错误态并要求重新选择；
- 不通过名称、title 或图片猜测套装。

### 9.3 小程序发布约束

- 服务端迁移完成但小程序尚未上传前，不得切断旧小程序兼容入口。
- 新体验版必须完成编译、模拟器定向验证和真机预览。
- 正式发布后确认活跃客户端均已使用 UUID 合同，再删除临时兼容入口。

## 10. 旧客户端策略

直接删除服务端兼容而不处理已安装旧 APK/旧小程序，会导致旧客户端继续发送 `outfit-*` 或直接保存失败。因此采用短期、显式、可删除的迁移窗口：

### 阶段 A：迁移发布

- 新服务端数据库只存 UUID。
- API 边界可以临时接收旧 `outfit-*`，但必须立即解析为同用户唯一 UUID。
- 旧 ID 不进入数据库、不进入响应、不参与业务判断。
- 每次旧格式请求记录匿名计数和客户端版本，不记录用户敏感内容。
- 未知旧 ID 返回明确错误，不能保存空关联。

### 阶段 B：新客户端发布

- 发布 UUID-only App APK。
- 上传 UUID-only 小程序体验版并完成验证，再正式发布。
- 在 `/api/version` 或独立兼容配置中设置最低支持版本。

### 阶段 C：硬删除

- 确认迁移窗口内旧格式请求为 0。
- 删除旧请求转换器。
- 服务端永久拒绝 `outfit-*`。
- 删除全部 legacy 字段、代码、测试夹具和文档说明。

如果产品确认只有单一测试用户且可以同步升级 App/小程序，可以压缩窗口，但数据库备份、迁移审计和硬拒绝门禁仍不可省略。

## 11. 衣物数字旧 ID 的边界

当前 App 仍大量使用数字 `legacyItemId` / `itemIds`，小程序已部分使用 `itemEntityIds`。这与本次套装—计划失联属于同类技术债，但一次性同时迁移会显著扩大风险。

本方案的硬边界：

- 本批必须彻底删除套装/计划关系中的 `legacyOutfitId`、`legacyPlanEntryId`。
- 本批新增的计划展示快照和外键只使用 UUID。
- 不在本批强行改写整个 `WardrobeItem.id: number` 体系。
- 另立后续 migration，把套装组成、打包清单和推荐链从数字 `itemIds` 收口到 garment UUID。
- 在后续迁移完成前，禁止新增新的数字 ID 字段或扩大 legacy 使用面。

这样既保证本缺陷真正关闭，也避免把一次计划修复扩大为全领域高风险重写。

## 12. 测试方案

### 12.1 迁移测试

至少覆盖：

1. 规范 UUID 计划保持不变。
2. 唯一旧 ID 成功迁移。
3. 未匹配旧 ID 阻断迁移。
4. 重复旧 ID 阻断迁移。
5. 跨用户同值旧 ID 不得串联。
6. `actualOutfitId` 正确迁移。
7. 范围计划 ID 正确迁移。
8. 历史已穿套装删除后展示快照保留。
9. 迁移失败事务完整回滚。
10. 迁移重复执行幂等。

### 12.2 服务端测试

- 创建计划只接受 UUID。
- UUID 必须属于当前用户。
- `outfit-*` 被拒绝或仅在有时限的迁移适配器中转换。
- 设置主计划保证同日唯一。
- 标记已穿和取消已穿只使用 UUID。
- 删除套装正确清理未来计划并保留历史快照。
- overview、detail 和 checklist 响应不含 legacy ID。

### 12.3 App 单元与组件测试

- App 套装映射固定使用 `entity.id`。
- 计划映射拒绝非 UUID。
- 失联计划展示错误态，不显示“尚未安排”。
- 空日期安排产生主计划。
- 添加备选不覆盖主计划。
- 更换主计划原子替换。
- 保存后读回失败不显示成功 Toast。

### 12.4 小程序测试

- 小程序套装与计划都使用 `entity.id` UUID。
- 删除 payload fallback 后读回正常。
- 周历、月历、旅行详情都显示缩略图。
- 失联计划进入错误态。
- 更换/备选/标记已穿语义与 App 一致。

### 12.5 跨端 E2E

以下四条是发布硬门禁：

1. App 创建套装并安排计划，小程序读回后显示同一套装、缩略图和计划详情。
2. 小程序为 App 创建的套装安排计划，App 读回后显示同一套装、缩略图和计划详情。
3. App 更换主计划，小程序刷新后主备顺序一致。
4. 小程序确认已穿并取消，App 刷新后状态、统计和计划恢复一致。

每条都必须验证：

- UI 截图；
- API overview/readback；
- 数据库规范外键；
- App/小程序重启后恢复；
- 无错误 Toast、无 FATAL、无未处理 Promise；
- 不读取或输出用户密钥、图片原文和认证凭证。

## 13. 推荐验证命令

实现阶段至少执行：

```bash
npm run cloud:contracts:typecheck
npm run api:typecheck
npm --workspace @wardrobe/wardrobe-api run test
npm run typecheck
npm run test:logic:outfit-planning
npm run test:logic:outfit-plan-primary
npm run test:logic:outfit-calendar-state-regression
npm --prefix apps/wechat-miniprogram run typecheck
npm run test:logic:miniprogram-outfit-flow
npm run build
```

还必须新增并运行：

```bash
npm run test:logic:outfit-plan-canonical-uuid
npm run test:logic:cross-platform-outfit-plan-id
npm run test:migration:outfit-plan-canonical-uuid
```

涉及 Android 交付时：

```bash
npm run android:apk
npm run android:e2e:critical
npm run android:verify:full
```

小程序需使用微信开发者工具 CLI 完成 WXML/WXSS 编译、模拟器关键路径和真机预览。上传体验版和正式发布必须另有用户明确授权。

## 14. 分批实施建议

### 批次 1：合同、审计和迁移基础

- 新增专用 UUID 合同。
- 新增迁移审计 CLI。
- 新增数据库 migration 和回滚验证。
- 新增服务端规范列读写。
- 暂不删除旧字段，仅用于迁移输入。

完成标准：测试库迁移后所有可迁移计划都有规范外键，blocked 为 0。

### 批次 2：App UUID-only

- App 套装、日计划、范围计划全部使用 entity UUID。
- 修正主计划、备选和更换语义。
- 增加失联错误态。
- 完成 App 定向 E2E。

### 批次 3：小程序 UUID-only

- 删除 payload ID 回退。
- 对齐计划交互和错误态。
- 完成小程序编译、模拟器和真机预览。

### 批次 4：跨端回归与生产迁移

- 生产只读审计。
- 备份与恢复演练。
- 数据库迁移。
- 部署服务端。
- 发布 App 与小程序。
- 执行四条跨端 E2E。

### 批次 5：删除 legacy

- 确认旧请求计数归零。
- 删除临时适配器。
- 删除 `legacyOutfitId`、`legacyPlanEntryId` 及其 fixture、测试和文档。
- 增加源码扫描门禁，禁止重新引入。

建议每个批次独立提交，数据库迁移、App、小程序和最终删除不要压成一个不可审查的大提交。

## 15. 部署与回滚

### 15.1 部署顺序

1. 测试环境执行迁移和完整回归。
2. 生产数据库只读审计。
3. 生产备份。
4. 部署支持规范 UUID 的服务端。
5. 执行生产迁移。
6. 验证 `/api/health`、`/api/ready`、`/api/version`。
7. 使用隔离测试账号执行 App/小程序跨端烟测。
8. 发布新 App 和小程序。
9. 观察旧格式请求计数。
10. 执行 legacy 硬删除批次。

### 15.2 回滚条件

任一情况立即停止或回滚：

- migration 出现 blocked 记录；
- 有效计划数量异常减少；
- 计划主备唯一约束失败；
- App 或小程序无法读取 overview；
- 跨端计划无法互相解析；
- 打包清单被异常清空；
- 标记已穿或取消已穿产生重复事件；
- 生产 health/readiness 失败。

### 15.3 回滚方式

- legacy 字段未删除阶段：回滚 API 镜像并恢复数据库备份或执行已验证的逆迁移。
- legacy 硬删除后：只能从备份恢复或使用迁移前保留的映射表重建，因此硬删除必须在观察窗口结束后执行。
- 不允许通过客户端重新加入旧 ID 回退作为紧急修复。

## 16. 可观测性与长期门禁

增加以下非敏感指标：

- `outfit_plan_reference_invalid_total`
- `legacy_outfit_id_request_total`
- `outfit_plan_unresolvable_read_total`
- `outfit_plan_primary_conflict_total`
- `outfit_plan_migration_blocked_total`

增加 CI/source scan：

- 禁止运行时代码出现 `legacyOutfitId`、`legacyPlanEntryId`。
- 禁止测试 fixture 生成 `outfit-<uuid>` 作为套装业务 ID。
- 禁止客户端对关系 ID 使用 `firstString(old, new)` 或多 ID fallback。
- 允许 migration 和历史说明文件在明确 allowlist 中引用旧字段。

诊断上传继续遵守用户主动触发、脱敏和不传图片内容的既有边界。

## 17. 验收标准

### 数据

- [ ] 所有有效未来/当天计划都有同用户有效 `outfit_id`。
- [ ] `outfit_id`、`actual_outfit_id`、`trip_plan_id` 均为规范 UUID 外键。
- [ ] 新写入 payload 不再含 legacy 关系字段。
- [ ] blocked 迁移记录为 0，或每条都有明确人工处理结果。

### App

- [ ] 安排套装后周历、月历和日卡立即显示缩略图及套装名称。
- [ ] 重启 App 后显示一致。
- [ ] 更换主计划和添加备选语义正确。
- [ ] 失联计划显示明确错误，不伪装为空日期。

### 小程序

- [ ] App 创建的计划可正常显示。
- [ ] 小程序创建的计划可被 App 正常显示。
- [ ] 周历、月历、旅行详情状态一致。
- [ ] 编译、模拟器和真机预览通过。

### 服务端

- [ ] UUID 合同、用户归属校验和主计划事务约束通过。
- [ ] 旧 ID 在观察窗口结束后被永久拒绝。
- [ ] 套装删除、历史快照、穿着事件和打包清单一致。

### 发布

- [ ] 数据库备份、恢复演练和迁移报告齐全。
- [ ] Android 固定签名 APK 完成真机验证。
- [ ] 小程序体验版/正式版按授权完成上传和验证。
- [ ] `VERSION_HISTORY.md` 记录设备、版本、验证路径和未覆盖风险。

## 18. 非目标

本批不做：

- 全量重写日历 UI；
- 调整推荐算法；
- 改变线上唯一数据源规则；
- 新增本地缓存、Outbox 或乐观更新；
- 用名称、图片或更新时间猜测套装关联；
- 一次性重写全部 garment 数字 ID 链路；
- 未经授权上传小程序体验版、正式发布或部署生产服务。

## 19. 最终完成定义

只有同时满足以下条件，缺陷才能关闭：

1. 生产数据已迁移到规范 UUID。
2. App 和小程序都不再生成、返回或依赖套装/计划旧标识。
3. 本次截图路径在 Android 真机复测通过。
4. App→小程序、小程序→App 两个方向的计划读回均通过。
5. 服务端拒绝无法解析的关系，不产生新的失联计划。
6. legacy 观察窗口结束并完成硬删除。
7. 所有验证、风险、版本和提交记录已写入 `VERSION_HISTORY.md`。

任何仅修改日历展示、增加客户端 fallback、补一条特定数据或重新上传缩略图的方案，都不算完成。
