// Delete cascade regression tests
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const wardrobeCascadeDelete = readFileSync(join(root, "src/lib/wardrobe-cascade-delete.ts"), "utf8");
const wishlistView = readFileSync(join(root, "src/components/wishlist-view-2.0.tsx"), "utf8");
const outfitListView = readFileSync(join(root, "src/components/outfit-list-view.tsx"), "utf8");

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

// 1. 单品详情删除必须 await deleteItemsWithCascade (via onDeleteItems wrapper)
const detailDeleteStart = wardrobeApp.indexOf("async function handleDetailDelete");
const detailDeleteEnd = wardrobeApp.indexOf("function toggleMultiSelect", detailDeleteStart);
const detailDeleteBlock = wardrobeApp.slice(detailDeleteStart, detailDeleteEnd);
check("单品详情删除 handleDetailDelete 调用 onDeleteItems", /await onDeleteItems/.test(detailDeleteBlock));
check("单品详情删除 handleDetailDelete 使用 await", /await onDeleteItems/.test(detailDeleteBlock));

// 2. 单品删除成功后必须清空 viewingItem
check("单品删除成功后 setViewingItem(null)", /handleDetailDelete[\s\S]{0,300}setViewingItem\(null\)/.test(wardrobeApp));

// 3. onDeleteItems 包含 refreshState 调用
const onDeleteItemsStart = wardrobeApp.indexOf("onDeleteItems={async (ids) =>");
const onDeleteItemsEnd = wardrobeApp.indexOf("}}", onDeleteItemsStart) + 2;
const onDeleteItemsBlock = wardrobeApp.slice(onDeleteItemsStart, onDeleteItemsEnd);
check("onDeleteItems 包含 refreshState 调用", /refreshState\(\)/.test(onDeleteItemsBlock));

// 4. 套装详情删除成功后必须清空 viewingOutfitId
const outfitDeleteStart = outfitListView.indexOf("async function handleDeleteOutfit");
const outfitDeleteEnd = outfitListView.indexOf("async function saveAiSuggestion", outfitDeleteStart);
const outfitDeleteBlock = outfitListView.slice(outfitDeleteStart, outfitDeleteEnd);
check("套装详情删除 handleDeleteOutfit 调用 deleteOutfitWithCascade", /await deleteOutfitWithCascade/.test(outfitDeleteBlock));
check("套装详情删除成功后 setViewingOutfitId(null)", /setViewingOutfitId\(null\)/.test(outfitDeleteBlock));

// 5. 种草详情删除成功后必须清空 selectedItem
const wishlistDeleteStart = wishlistView.indexOf("const handleDeleteRecord = useCallback");
const wishlistDeleteEnd = wishlistView.indexOf("/* ---- view detail ---- */", wishlistDeleteStart);
const wishlistDeleteBlock = wishlistView.slice(wishlistDeleteStart, wishlistDeleteEnd);
check("种草删除 handleDeleteRecord 调用 db.wishlistItems.delete", /wishlistItems\.delete/.test(wishlistDeleteBlock));
check("种草删除成功后 setSelectedItem(null)", /setSelectedItem\(null\)/.test(wishlistDeleteBlock));

// 6. 撤销购买删除失败不得恢复种草状态
const undoPurchaseStart = wishlistView.indexOf("const handleUndoPurchase = useCallback");
const undoPurchaseEnd = wishlistView.indexOf("const discardForm = useCallback", undoPurchaseStart);
const undoPurchaseBlock = wishlistView.slice(undoPurchaseStart, undoPurchaseEnd);
check("撤销购买失败时仅显示错误消息", /catch[\s\S]{0,100}onMessage\("撤销购买失败"/.test(undoPurchaseBlock));
check("撤销购买失败时不得 setSelectedItem(null)", !/catch[\s\S]{0,50}setSelectedItem\(null\)/.test(undoPurchaseBlock));

// 7. wardrobe-cascade-delete.ts 标记已买种草记录中的已删除单品引用
check("wardrobe-cascade-delete 保留 convertedItemId 并标记 convertedItemDeletedAt", /convertedItemId/.test(wardrobeCascadeDelete) && /convertedItemDeletedAt/.test(wardrobeCascadeDelete));
check("wardrobe-cascade-delete 返回 markedDeletedWishlistIds", /markedDeletedWishlistIds/.test(wardrobeCascadeDelete));
check("wardrobe-cascade-delete 有 wishlistItems 更新逻辑", /wishlistItems\.update/.test(wardrobeCascadeDelete));

// 8. wardrobe-cascade-delete.ts 清理失效套装 (删除 itemIds < 2 的套装)
check("wardrobe-cascade-delete 删除 itemIds < 2 的套装", /if \(nextItemIds\.length\s*>=\s*2\)/.test(wardrobeCascadeDelete) && /db\.outfits\.delete/.test(wardrobeCascadeDelete));
check("wardrobe-cascade-delete 同步刷新保留套装信息和封面", /buildSyncedOutfitPatch/.test(wardrobeCascadeDelete));

// 9. wardrobe-cascade-delete.ts 清理 outfitPlanEntries
check("wardrobe-cascade-delete 清理 outfitPlanEntries", /outfitPlanEntries/.test(wardrobeCascadeDelete));

// 10. wardrobe-cascade-delete.ts 清理自动打包清单
check("wardrobe-cascade-delete 清理 planPackingChecklistItems", /planPackingChecklistItems/.test(wardrobeCascadeDelete));

// 11. wardrobe-cascade-delete.ts 包含 deleteWardrobeItemsWithCascade 导出
check("wardrobe-cascade-delete 导出 deleteWardrobeItemsWithCascade", /export async function deleteWardrobeItemsWithCascade/.test(wardrobeCascadeDelete));

// 12. wardrobe-cascade-delete.ts 包含 WardrobeCascadeDeleteResult 类型
check("wardrobe-cascade-delete 定义 WardrobeCascadeDeleteResult", /interface WardrobeCascadeDeleteResult/.test(wardrobeCascadeDelete));

// 12b. Dexie transaction 必须保留 db 绑定, 不允许拆成 runTransaction 再调用
check("wardrobe-cascade-delete 直接调用 db.transaction 保留 Dexie this 绑定", /await db\.transaction\(/.test(wardrobeCascadeDelete));
check("wardrobe-cascade-delete 不再解构/赋值 db.transaction", !/runTransaction\s*=\s*db\.transaction/.test(wardrobeCascadeDelete));

// 13. deleteItemsWithCascade 从 data-repo 正确调用
const dataRepo = readFileSync(join(root, "src/lib/data-repo.ts"), "utf8");
check("data-repo 导出 deleteItemsWithCascade", /export.*deleteItemsWithCascade/.test(dataRepo));

console.log(`\ndelete cascade regression tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
