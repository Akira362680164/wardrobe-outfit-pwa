# 打包清单自动同步调用点草案

> 本文件由 Subagent E 在多 Agent 修复计划（`outfit_plan_navigation_packing_multisubagent_fix_prompt.md`）中产出。
> 用途：列出 `syncPackingChecklistForPlan(planId)` / `syncPackingChecklistForDate(dateKey)` 的所有同步点、输入/输出、事务与刷新顺序约束。
> 本文件**不**改源码，**不**运行测试；最终整合由母 Agent 完成。

## 1. 调用点清单

| # | 触发场景 | 调用方 | 函数 | 备注 |
|---|---|---|---|---|
| 1 | 月历页「安排套装」sheet 内选套装后，写入 entry 成功 | `handleAddOutfitToDate` | `syncPackingChecklistForDate(dateKey)` | 只同步该日期所属的若干 plan（一个日期可能落在多个 plan 区间）。 |
| 2 | 计划详情页「更换套装」/「安排套装」内选套装后 | `handleAddOutfitToDate`（同一函数） | `syncPackingChecklistForDate(dateKey)` | 同上。 |
| 3 | 计划新增/编辑弹层保存后（新建 plan / 改 startDate/endDate/packingEnabled） | `handleSaveCalendarPlan` | `syncPackingChecklistForPlan(plan.id)` | 新建 plan 时旧清单为空，写入空→重新生成；改 packingEnabled false 时只保留 manual。 |
| 4 | 计划详情页顶部点击「打包清单」按钮 | `onOpenPackingList` 链 | 进入 packing_list 前先 `syncPackingChecklistForPlan(activeCalendarPlanId)` | 保证页面渲染时已与 entry 同步。 |
| 5 | 月历页点击「查看计划」进入 `plan_detail` | `openPlanDetail` | 同步 `syncPackingChecklistForPlan(planId)`（可选；plan_detail 自身不展示清单，调用仍可避免 packing_list 第一次进入时延迟） | 计划详情页本身不依赖同步结果。 |
| 6 | 用户在 packing_list 内勾选/重置/全部标记 | `handleTogglePackingItemChecked` / `handleMarkAllPacked` / `handleResetAllPacking` | **不调用** `syncPackingChecklist*` | 这些动作只改 `checked`，不应触发全量重建。 |

注：旧版 `handleRegeneratePackingList` 与顶部「重新生成」按钮在本计划中删除。`PlanPackingChecklistView` 的 `onRegenerate` prop 也被删除。

## 2. syncPackingChecklistForPlan(planId) 设计

### 输入

- `planId: string`，目标 `OutfitCalendarPlan.id`。

### 行为

1. 从 Dexie 重新读：
   - `outfitCalendarPlans.where({id: planId}).first()` → 拿到最新 `calendarPlan`。
   - `outfitPlanEntries.where({calendarPlanId: planId}).toArray()` + 没有 `calendarPlanId` 但日期落在范围内的 entries（兼容老数据）。
   - `outfits.toArray()`。
   - `items.toArray()`。
   - `planPackingChecklistItems.where({calendarPlanId: planId}).toArray()`。
2. 调用 `buildPackingItemsFromPlan({ calendarPlan, entries, outfits, items, existingChecklistItems, now })` 生成目标清单（保留 manual / 保留 checked / 删除已不在套装内的 wardrobe 项）。
3. 在 Dexie transaction `"rw", planPackingChecklistItems` 内：
   - `db.planPackingChecklistItems.where({calendarPlanId: planId}).delete()`
   - `db.planPackingChecklistItems.bulkPut(newItems)`
4. 事务结束后调用方触发一次 `onPlanDataChange()` 刷新页面状态（不要在事务内 await 业务回调，避免阻塞）。

### 输出 / 副作用

- Dexie `planPackingChecklistItems` 表内 `calendarPlanId === planId` 的所有行被替换为最新 `newItems`。
- 调用方负责调用 `onPlanDataChange()`。

### 错误处理

- 任意读 / 写失败 → catch 抛回调用方，调用方展示「打包清单同步失败，请重试」。
- 不弹 alert / modal，保持当前页面状态。

## 3. syncPackingChecklistForDate(dateKey) 设计

### 输入

- `dateKey: string`，形如 `YYYY-MM-DD`。

### 行为

1. 从 Dexie 读 `outfitCalendarPlans.toArray()`，过滤出包含 `dateKey` 的所有 plan（即 `startDate <= dateKey <= endDate`）。
2. 对每个 plan 串行调用 `syncPackingChecklistForPlan(plan.id)`，但**只调用一次** `onPlanDataChange()`（在最后一个 plan 之后）。
3. 若该日期不落在任何 plan 内，跳过（不报错）。

### 输出 / 副作用

- 同 `syncPackingChecklistForPlan`，但可能同步 0~N 个 plan。

## 4. 事务与刷新顺序约束

- 所有 Dexie 写必须在 `db.transaction("rw", planPackingChecklistItems, ...)` 内部完成。
- 同一 plan 的删除 + bulkPut 必须放在同一 transaction，避免「删除成功但 bulkPut 失败」留下空清单的半残状态。
- 多 plan 串行同步时，每个 plan 单独一个 transaction；不强制单一大 transaction 跨多 plan（避免锁过长）。
- 所有同步完成后只触发一次 `onPlanDataChange()`，不要每个 plan 一次。

## 5. 兼容性 / 风险

- 老数据：entry 没有 `calendarPlanId` 字段时按 `enumerateDateRange(plan.startDate, plan.endDate)` + `entries.filter(e => e.date === date)` 收集，保留 v1.1.0 已有兼容逻辑。
- `packingEnabled=false` 时 `buildPackingItemsFromPlan` early return 只保留 manual 项，调用方不需要特殊处理。
- 同步过程中用户可能正在勾选 / 添加 manual：transaction 是串行的，最终一致性 OK；新加 manual 不会被覆盖（manual 项 id 不变）。

## 6. 与现有逻辑的关系

- `handleAddOutfitToDate`（v1.1.0 fix 引入）已通过 `addOutfitToDate` 写入 entry 并触发 `onPlanDataChange()`。**追加** `syncPackingChecklistForDate(dateKey)` 调用。
- `handleSaveCalendarPlan` 已写入 plan。**追加** `syncPackingChecklistForPlan(plan.id)` 调用。
- `handleDeleteCalendarPlan`（事务化级联删除）已删除 plan/entries/checklist。**不需要**追加 `syncPackingChecklist*`（计划已删）。
- `handleSelectOutfitForPlan` 调用 `handleAddOutfitToDate`，触发链路同上。

## 7. 删除项

- `PlanPackingChecklistView` 顶部「重新生成」按钮。
- `PlanPackingChecklistView` `onRegenerate` prop 与 `regenerating` state。
- `handleRegeneratePackingList` 母 Agent 函数（同步逻辑已下移到 `syncPackingChecklist*`，但原函数可保留作为兼容 fallback，由子视图调用前同步覆盖即可）。
- 顶部副标题「根据已安排穿搭自动汇总」改为「根据已安排套装自动同步」。
