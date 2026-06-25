import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * v1.1.37 共享多选 Hook 静态契约测试。
 *
 * 验证 useCatalogMultiSelect:
 *   - selectionMode 由 selectedIds.size > 0 派生 (不单独维护 boolean)
 *   - enter 清空旧集合只选当前 id
 *   - toggle 加入/移除，集合为空自动退出
 *   - clear 清空集合
 *   - handleSelectionBack 选择模式关闭时返回 false，开启时清空并返回 true
 *   - isSelected 正确判断
 */

const root = join(__dirname, "..");
const src = readFileSync(
  join(root, "src/components/catalog-selection/use-catalog-multi-select.ts"),
  "utf8",
);
const bulkDeleteSrc = readFileSync(
  join(root, "src/components/catalog-selection/use-catalog-bulk-delete.ts"),
  "utf8",
);

// ---- useCatalogMultiSelect ----

// 1. selectionMode 从 selectedIds.size 派生
assert.ok(
  src.includes("selectedIds.size > 0"),
  "selectionMode 必须由 selectedIds.size > 0 派生",
);
assert.ok(
  !src.includes("selectionMode, setSelectionMode") &&
    !src.includes("const [selectionMode"),
  "禁止单独维护 selectionMode boolean state",
);

// 2. enter 实现
assert.ok(
  src.includes("setSelectedIds(new Set([id]))"),
  "enter 必须清空旧集合并只选中当前 id",
);

// 3. toggle 实现
assert.ok(
  src.includes("next.has(id)") && src.includes("next.delete(id)"),
  "toggle 必须支持加入和移除",
);

// 4. clear 实现
assert.ok(
  src.includes("setSelectedIds(new Set())"),
  "clear 必须清空集合",
);

// 5. handleSelectionBack
assert.ok(
  src.includes("handleSelectionBack") &&
    src.includes("return false") &&
    src.includes("return true"),
  "handleSelectionBack 必须返回 boolean",
);

// 6. isSelected
assert.ok(
  src.includes("isSelected") && src.includes("selectedIds.has(id)"),
  "isSelected 必须检查 selectedIds.has(id)",
);

// 7. 泛型支持
assert.ok(
  src.includes("<TId extends string | number>"),
  "useCatalogMultiSelect 必须支持 string | number 泛型",
);

// 8. selectedCount 从 size 派生
assert.ok(
  src.includes("selectedIds.size"),
  "selectedCount 必须从 selectedIds.size 派生",
);

// ---- useCatalogBulkDelete ----

// 9. deleteOpen / deleting / deleteError 三个状态
assert.ok(
  bulkDeleteSrc.includes("deleteOpen") &&
    bulkDeleteSrc.includes("deleting") &&
    bulkDeleteSrc.includes("deleteError"),
  "useCatalogBulkDelete 必须有 deleteOpen / deleting / deleteError",
);

// 10. executeDelete 接受 deleteAction 参数 (不直接访问 Dexie)
assert.ok(
  bulkDeleteSrc.includes("deleteAction") &&
    bulkDeleteSrc.includes("(ids: readonly TId[]) => Promise<void>"),
  "executeDelete 必须接受外部 deleteAction 函数",
);

// 11. deleting 时禁止取消
assert.ok(
  bulkDeleteSrc.includes("deleting") &&
    bulkDeleteSrc.includes("cancelDelete"),
  "cancelDelete 必须在 deleting 时禁止关闭",
);

// 12. 泛型支持
assert.ok(
  bulkDeleteSrc.includes("<TId extends string | number>"),
  "useCatalogBulkDelete 必须支持 string | number 泛型",
);

console.log("catalog multi-select tests passed");
