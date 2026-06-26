## 2026-06-26 / v1.1.37 / Mavis — cloud 1B B5a garment create bridge to workspace outbox

- **目的**：按 V4 执行方案推进阶段 1B-B5a，把衣橱单品 **创建** 桥接到账号工作区 + Outbox，让 B4 同步引擎在 wardrobe-app.tsx 上跑通 garment create 端到端。读取仍走旧 Dexie db.ts，B8 才做完整迁移。update / delete 留到 B5d 或 B6。
- **改动文件**：
  - `src/lib/cloud-sync/garment-bridge.ts`（新增）：`bridgeGarmentCreate(item)` 单 helper；`loadBridgeContext` 校验 active user / db / generation / accessToken 三重一致 + 工作区开关 + 同步开关；写入走 B4 `writeGarment`，失败仅 console.warn，UI 永远先成功落旧 Dexie。
  - `src/components/wardrobe-app.tsx`（编辑）：import `bridgeGarmentCreate`；`saveGarmentIntakeDraft` 在 `db.items.add(item)` 之后 best-effort `void bridgeGarmentCreate({ ...item, id })`；`saveBatchGarmentIntakeDrafts` 在事务内每件 `db.items.add(item)` 之后 fire-and-forget 一条 bridge。bridge 异常全部吞掉，UI 流程不变。
- **范围说明**：本轮不切换单品读取路径（refreshState 仍读旧 db.items）；不接入 garment update / delete；不切业务到工作区为主源；生产开关 `NEXT_PUBLIC_CLOUD_SYNC_ENABLED` / `NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED` 仍保持 false（旧 db.items 路径为默认路径）。outfit-capture 路径里也有 `db.items.add`（line 880/898）暂不桥接，B5b 接入 outfit 时统一处理。
- **验证结果**：
  - `npm run typecheck`：✅ 通过（根 + 子 workspaces）。
  - `git diff --check`：✅ 通过。
  - bridge 函数特性门禁：`isAccountWorkspaceEnabled && isCloudSyncEnabled && active workspace + session + accessToken` 全部通过才执行；任一缺失静默 return `{ bridged: false }`，不抛错。
- **风险门禁**：**medium**。涉及业务写入路径和 workspace outbox 第一次消费；写入是 fire-and-forget + console.warn，失败不阻塞本地主流程，但首次接入 B4 同步引擎的消费路径；**未触发独立审查 subagent**：用户未通知 subagent 启动，按 AGENTS.md §96 守则本次由主 Mavis 实现。
- **未验证风险 / 下一步**：
  - 未在腾讯云生产镜像跑过真实 garment create → outbox → push → server bootstrap 端到端；下一步建议在 B6 状态机接通后用一次性本地 curl 验证 garment create 链路。
  - garment update / delete 暂未桥接，B5d 或 B6 接入；cascade-delete 涉及多表，单独处理。
  - `sync-engine.ts:264-272` `record = { ...ctx.payload }` 在 writeGarment 中会覆盖 record 字段（payload 含 `updatedAt`）；非本次改动范围，B9 1B 全量回归时统一清理。
  - 业务读取仍在旧 Dexie，桥接仅起"先镜像到工作区"的作用；B8 旧 Dexie 导入完成后才是真正的"以工作区为主源"。

## 2026-06-26 / v1.1.37 / Codex — cloud 1B B4 sync engine and outbox round trip