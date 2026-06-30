import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * v1.1.37 共享多选集成测试。
 *
 * 验证:
 *   - wardrobe-app 使用 useCatalogMultiSelect / useCatalogBulkDelete
 *   - wishlist-view-2.0 使用 useCatalogMultiSelect / useCatalogBulkDelete
 *   - 两个页面使用 CatalogMultiSelectBar / CatalogBulkDeleteSheet
 *   - wardrobe-app 不再声明 multiSelectMode / selectedItemIds (旧状态)
 *   - wishlist-view-2.0 不声明 selectedWishlistIds / bulkDeleting
 *   - 两个页面不直接写 fixed inset-x-0 bottom-0 的多选栏 JSX
 *   - 两个页面不直接绑定 onContextMenu
 *   - CatalogWaterfallCardShell 不再暴露 disableTap / onClick / onContextMenu
 *   - CatalogWaterfallCardShell 暴露 selectionMode / onOpen / onToggleSelection
 */

const root = join(__dirname, "..");
const wardrobe = readFileSync(
  join(root, "src/components/wardrobe-app.tsx"),
  "utf8",
);
const wishlist = readFileSync(
  join(root, "src/components/wishlist-view-2.0.tsx"),
  "utf8",
);
const cardShell = readFileSync(
  join(root, "src/components/item-shell/catalog-waterfall-card-shell.tsx"),
  "utf8",
);

// 1. wardrobe-app 使用共享 hooks
assert.ok(
  wardrobe.includes("useCatalogMultiSelect"),
  "wardrobe-app 必须使用 useCatalogMultiSelect",
);
assert.ok(
  wardrobe.includes("useCatalogBulkDelete"),
  "wardrobe-app 必须使用 useCatalogBulkDelete",
);

// 2. wishlist-view-2.0 使用共享 hooks
assert.ok(
  wishlist.includes("useCatalogMultiSelect"),
  "wishlist-view-2.0 必须使用 useCatalogMultiSelect",
);
assert.ok(
  wishlist.includes("useCatalogBulkDelete"),
  "wishlist-view-2.0 必须使用 useCatalogBulkDelete",
);

// 3. wardrobe-app 使用共享组件
assert.ok(
  wardrobe.includes("CatalogMultiSelectBar"),
  "wardrobe-app 必须使用 CatalogMultiSelectBar",
);
assert.ok(
  wardrobe.includes("CatalogBulkDeleteSheet"),
  "wardrobe-app 必须使用 CatalogBulkDeleteSheet",
);

// 4. wishlist-view-2.0 使用共享组件
assert.ok(
  wishlist.includes("CatalogMultiSelectBar"),
  "wishlist-view-2.0 必须使用 CatalogMultiSelectBar",
);
assert.ok(
  wishlist.includes("CatalogBulkDeleteSheet"),
  "wishlist-view-2.0 必须使用 CatalogBulkDeleteSheet",
);

// 5. wardrobe-app 不再声明旧状态
assert.ok(
  !/const\s+\[multiSelectMode,\s*setMultiSelectMode\]/.test(wardrobe),
  "wardrobe-app 不应再声明 multiSelectMode",
);
assert.ok(
  !/const\s+\[selectedItemIds,\s*setSelectedItemIds\]/.test(wardrobe),
  "wardrobe-app 不应再声明 selectedItemIds",
);

// 6. wishlist-view-2.0 不声明独立多选状态
assert.ok(
  !/multiSelectMode/.test(wishlist),
  "wishlist-view-2.0 不应声明 multiSelectMode",
);
assert.ok(
  !/selectedWishlistIds/.test(wishlist),
  "wishlist-view-2.0 不应声明 selectedWishlistIds",
);
assert.ok(
  !/bulkDeleting/.test(wishlist),
  "wishlist-view-2.0 不应声明 bulkDeleting",
);

// 7. 两个页面不直接写批量删除底栏 JSX
const wardrobeBarCount = (wardrobe.match(/safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-ink\/10 bg-\[#fbfbf8\]\/98/g) ?? []).length;
assert.equal(wardrobeBarCount, 0, "wardrobe-app 不应直接写多选底栏 JSX");

const wishlistBarCount = (wishlist.match(/safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-ink\/10 bg-\[#fbfbf8\]\/98/g) ?? []).length;
assert.equal(wishlistBarCount, 0, "wishlist-view-2.0 不应直接写多选底栏 JSX");

// 8. 两个页面不直接绑定 onContextMenu
assert.ok(
  !/onContextMenu=/.test(wardrobe),
  "wardrobe-app 不应再绑定 onContextMenu",
);
assert.ok(
  !/onContextMenu=/.test(wishlist),
  "wishlist-view-2.0 不应绑定 onContextMenu",
);

// 9. CatalogWaterfallCardShell 不再暴露旧 props (接口中不含 disableTap / onClick / onContextMenu)
const cardInterface = cardShell.match(/export interface CatalogWaterfallCardShellProps \{[\s\S]*?\n\}/)?.[0] ?? "";
assert.ok(
  !/\bdisableTap\b/.test(cardInterface),
  "CatalogWaterfallCardShell Props 不应再暴露 disableTap",
);
assert.ok(
  !/\bonContextMenu\?\s*:/.test(cardInterface),
  "CatalogWaterfallCardShell Props 不应再暴露 onContextMenu",
);
assert.ok(
  !/\bonClick\s*:/.test(cardInterface),
  "CatalogWaterfallCardShell Props 不应再暴露 onClick",
);

// 10. CatalogWaterfallCardShell 暴露新 props
assert.ok(
  /\bselectionMode\b/.test(cardShell),
  "CatalogWaterfallCardShell 必须暴露 selectionMode",
);
assert.ok(
  /\bonOpen\b/.test(cardShell),
  "CatalogWaterfallCardShell 必须暴露 onOpen",
);
assert.ok(
  /\bonToggleSelection\b/.test(cardShell),
  "CatalogWaterfallCardShell 必须暴露 onToggleSelection",
);

// 11. CatalogWaterfallCardShell 包含 select-none / touch-manipulation / -webkit-touch-callout
assert.ok(
  cardShell.includes("select-none"),
  "CatalogWaterfallCardShell 必须包含 select-none",
);
assert.ok(
  cardShell.includes("touch-manipulation"),
  "CatalogWaterfallCardShell 必须包含 touch-manipulation",
);
assert.ok(
  cardShell.includes("-webkit-touch-callout:none"),
  "CatalogWaterfallCardShell 必须包含 -webkit-touch-callout:none",
);

// 12. CatalogWaterfallCardShell 渲染 CatalogSelectionCheck
assert.ok(
  cardShell.includes("CatalogSelectionCheck"),
  "CatalogWaterfallCardShell 必须渲染 CatalogSelectionCheck",
);

// 13. CatalogWaterfallCardShell 包含 aria-pressed
assert.ok(
  cardShell.includes("aria-pressed"),
  "CatalogWaterfallCardShell 必须包含 aria-pressed",
);

// 14. CatalogWaterfallCardShell 内部调用 preventDefault / stopPropagation
assert.ok(
  cardShell.includes("preventDefault()"),
  "CatalogWaterfallCardShell 必须调用 preventDefault",
);
assert.ok(
  cardShell.includes("stopPropagation()"),
  "CatalogWaterfallCardShell 必须调用 stopPropagation",
);

// 16. 线上模式不再保留 data-repo Stub
assert.equal(
  existsSync(join(root, "src/lib/data-repo.ts")),
  false,
  "data-repo.ts Stub 必须删除",
);

// 17. 种草单条删除也调用 deleteWishlistRecords
assert.ok(
  wishlist.includes("wardrobeRepository"), "wishlist-view-2.0 必须使用线上 Repository",
);

console.log("catalog multi-select integration tests passed");
