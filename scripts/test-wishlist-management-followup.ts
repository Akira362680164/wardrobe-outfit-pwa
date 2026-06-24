// v1.1.6 followup Commit 2: 种草管理页确认弹窗 + 系统返回键静态断言
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const wishlist = readFileSync(join(root, "src/components/wishlist-view-2.0.tsx"), "utf8");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const wishlistCardStart = wishlist.indexOf('<div className="grid grid-cols-2 gap-3">');
const wishlistCardEnd = wishlist.indexOf("<WishlistGlobalDialogs", wishlistCardStart);
const wishlistCardBlock = wishlistCardStart >= 0 && wishlistCardEnd > wishlistCardStart
  ? wishlist.slice(wishlistCardStart, wishlistCardEnd)
  : "";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

// 1. purchased / rejected / archived 三个子页都通过同一个 <WishlistGlobalDialogs> 覆盖
const hasGlobalDialogs = /<WishlistGlobalDialogs\b/.test(wishlist);
check("WishlistView20 渲染唯一的 <WishlistGlobalDialogs> (跨子页共享)", hasGlobalDialogs);

// 2. <WishlistGlobalDialogs> 的 showUndoPurchaseConfirm / showDeleteRecordConfirm 在 props 中
const showFlags =
  /<WishlistGlobalDialogs[\s\S]+?showUndoPurchaseConfirm=\{showUndoPurchaseConfirm\}[\s\S]+?showDeleteRecordConfirm=\{showDeleteRecordConfirm\}/.test(wishlist);
check("<WishlistGlobalDialogs> props 显式传入 showUndoPurchaseConfirm 与 showDeleteRecordConfirm", showFlags);

// 3. useStableBackHandler 顺序关闭 4 种弹窗
// 用更简单的检测: 4 个 if (showXxxConfirm) 都在 useStableBackHandler 内
const backHandlerStart = wishlist.indexOf("useStableBackHandler(() => {");
const backHandlerEnd = wishlist.indexOf("}, isSubPage);");
const backHandler = wishlist.slice(backHandlerStart, backHandlerEnd);
const has4Order =
  backHandler.indexOf("if (showUndoPurchaseConfirm)") < backHandler.indexOf("if (showDeleteRecordConfirm)") &&
  backHandler.indexOf("if (showDeleteRecordConfirm)") < backHandler.indexOf("if (showRejectConfirm)") &&
  backHandler.indexOf("if (showRejectConfirm)") < backHandler.indexOf("if (showDiscardConfirm)");
check(
  "useStableBackHandler 顺序关闭 undoPurchase / deleteRecord / reject / discard 弹窗",
  has4Order,
);

// 4. 父级在 shoppingSubPageActive=true 时 return, 子级 useStableBackHandler 主动处理
// v1.1.20-dev commit2: handleTopLevelBack 拆分为多个 if 分支, 每个分支独立 logTopLevelBack,
// 这里兼容新旧两种写法 (新: `... shoppingSubPageActive) { logTopLevelBack(...) return true; }`)
const parentSwallows = /shoppingSubPageActive[\s\S]{0,80}return\s+true/.test(wardrobeApp);
check(
  "父级 backButton 在 shoppingSubPageActive=true 时进入 return 路径, 不会与子级处理冲突",
  parentSwallows,
);

// 5. WishlistGlobalDialogs 包含 4 个 ConfirmDialog
const component = /function WishlistGlobalDialogs[\s\S]+?<ConfirmDialog open=\{showRejectConfirm\}[\s\S]+?<ConfirmDialog open=\{showUndoPurchaseConfirm\}[\s\S]+?<ConfirmDialog open=\{showDeleteRecordConfirm\}[\s\S]+?<ConfirmDialog open=\{showDiscardConfirm\}/;
check("WishlistGlobalDialogs 覆盖 4 种 ConfirmDialog (reject / undo / delete / discard)", component.test(wishlist));

// 6. add_edit 子页不再内嵌 ConfirmDialog
const renderBranchStart = wishlist.indexOf("/*  ADD / EDIT FORM PAGE");
const addEditStart = wishlist.indexOf('if (subPage === "add_edit")', renderBranchStart);
const addEditEnd = wishlist.indexOf('if (subPage === "intake")', addEditStart);
const addEditBlock = wishlist.slice(addEditStart, addEditEnd);
check(
  "add_edit 子页不再内嵌 ConfirmDialog (全部由全局 <WishlistGlobalDialogs> 提供)",
  !/<ConfirmDialog\b/.test(addEditBlock),
);

// 7. detail 子页不再内嵌 ConfirmDialog
const detailStart = wishlist.indexOf('if (subPage === "detail" && selectedItem');
const detailEnd = wishlist.indexOf("WishlistGlobalDialogs", detailStart);
const detailBlock = wishlist.slice(detailStart, detailEnd);
check(
  "detail 子页不再内嵌 ConfirmDialog (全部由全局 <WishlistGlobalDialogs> 提供)",
  !/<ConfirmDialog\b/.test(detailBlock),
);

// 8. handler 顺序闭合 (Purchased / Rejected / Archived 都返回 home)
const subPageBack =
  /if \(subPage === "purchased" \|\| subPage === "rejected" \|\| subPage === "archived"\)[\s\S]{0,200}return true;/.test(wishlist);
check(
  "Android 返回键对 purchased / rejected / archived 子页统一返回种草首页",
  subPageBack,
);

/* ------------------------------------------------------------------ */
/*  v1.1.8 4B post-hotfix: 撤销购买全局刷新 & 详情可打开              */
/* ------------------------------------------------------------------ */

// 9. WishlistView20Props 包含 onDataChanged
check(
  "WishlistView20Props 包含 onDataChanged",
  /interface WishlistView20Props[\s\S]+?onDataChanged\?:\s*\(\)\s*=>\s*void\s*\|\s*Promise<void>;/.test(wishlist),
);

// 10. handleUndoPurchase 成功后调用 onDataChanged
const undoHandlerStart = wishlist.indexOf("const handleUndoPurchase = useCallback");
const undoHandlerEnd = wishlist.indexOf("}, [selectedItem", undoHandlerStart);
const undoHandler = undoHandlerStart >= 0 && undoHandlerEnd >= 0
  ? wishlist.slice(undoHandlerStart, undoHandlerEnd)
  : "";
check(
  "handleUndoPurchase 成功后调用 onDataChanged",
  /await\s+onDataChanged\?\.\(\)/.test(undoHandler),
);
check(
  "handleUndoPurchase 成功后 setSubPage(\"home\")",
  /setSubPage\("home"\)/.test(undoHandler),
);
check(
  "handleUndoPurchase 成功后 setSelectedItem(null)",
  /setSelectedItem\(null\)/.test(undoHandler),
);

// 11. 失败时不关闭撤销购买确认弹窗
{
  const catchIdx = undoHandler.indexOf("catch");
  const catchTail = catchIdx >= 0 ? undoHandler.slice(catchIdx) : "";
  check(
    "handleUndoPurchase 失败时不调用 setShowUndoPurchaseConfirm(false)",
    !/setShowUndoPurchaseConfirm\(false\)/.test(catchTail),
  );
}

// 12. WardrobeApp 渲染 WishlistView20 时传入 onDataChanged={refreshState}
check(
  "WardrobeApp 渲染 WishlistView20 时传入 onDataChanged={refreshState}",
  /<WishlistView20\b[\s\S]+?onDataChanged=\{refreshState\}[\s\S]+?\/>/.test(wardrobeApp),
);

/* ------------------------------------------------------------------ */
/*  P0 收口: 种草详情页打不开修复 — 单出口渲染 + homeNode 抽取 + 5 个子页分支不 return */
/* ------------------------------------------------------------------ */

// Test 13: WishlistView20 不存在裸 return; (裸 return 阻断统一出口)
// 仅校验子页分支末尾的 return; 已全部移除; 函数体最后的 return (出口) 仍保留。
{
  // 找出 5 个子页分支 (if (subPage === ...)) 的函数体, 确认没有以裸 return; 结尾。
  // 子页分支统一为: if (...) { subPageNode = (...); } (无 return)
  const subPageBranches = [
    'if (subPage === "add_edit")',
    'if (subPage === "intake")',
    'if (subPage === "convert_confirm" && selectedItem)',
    'if (subPage === "purchased" || subPage === "rejected" || subPage === "archived")',
    'if (subPage === "detail" && selectedItem)',
  ];
  let noBareReturn = true;
  for (const branchHeader of subPageBranches) {
    const start = wishlist.indexOf(branchHeader);
    if (start < 0) { noBareReturn = false; break; }
    // 找到下一个子页分支开头或最终 return 出口, 这之间的内容就是当前分支。
    let end = wishlist.length;
    for (const next of subPageBranches) {
      if (next === branchHeader) continue;
      const idx = wishlist.indexOf(next, start + branchHeader.length);
      if (idx > 0 && idx < end) end = idx;
    }
    // 跳过最后的 final return
    const finalReturnIdx = wishlist.indexOf('const homeNode: React.ReactNode = (', start);
    if (finalReturnIdx > 0 && finalReturnIdx < end) end = finalReturnIdx;
    const branchBody = wishlist.slice(start, end);
    // 旧模式: 子页分支末尾 `    return;\n  }` (4 空格缩进 + return; + 2 空格 + 闭合 })
    if (/^    return;\s*\n  \}/m.test(branchBody)) { noBareReturn = false; break; }
  }
  check("WishlistView20 5 个子页分支末尾不存在裸 return;", noBareReturn);
}

// Test 14: WishlistView20 存在 homeNode 常量
check(
  "WishlistView20 存在 homeNode 常量",
  /const homeNode:\s*React\.ReactNode\s*=/.test(wishlist),
);

// Test 15: 统一出口包含 {subPageNode ?? homeNode}
// 改用更稳的文本包含检查 (避免非贪婪匹配跨多个 } 报错)
check(
  "WishlistView20 最终统一出口包含 {subPageNode ?? homeNode}",
  /\{subPageNode\s*\?\?\s*homeNode\}/.test(wishlist),
);

// Test 16: 统一出口包含 <WishlistGlobalDialogs
check(
  "WishlistView20 最终统一出口包含 <WishlistGlobalDialogs",
  /\{subPageNode\s*\?\?\s*homeNode\}[\s\S]*?<WishlistGlobalDialogs/.test(wishlist),
);

// Test 17: detail 子页分支只赋值 subPageNode (不含裸 return)
{
  const start = wishlist.indexOf('if (subPage === "detail" && selectedItem)');
  const end = wishlist.indexOf('const homeNode: React.ReactNode = (', start);
  const block = wishlist.slice(start, end);
  check(
    "detail 子页分支只赋值 subPageNode (无 return; 阻断出口)",
    /subPageNode\s*=/.test(block) && !/^    return;\s*\n  \}/m.test(block),
  );
}

// Test 18: add_edit 子页分支只赋值 subPageNode
{
  const renderBranchStart = wishlist.indexOf("/*  ADD / EDIT FORM PAGE");
  const start = wishlist.indexOf('if (subPage === "add_edit")', renderBranchStart);
  const end = wishlist.indexOf('if (subPage === "intake")', start);
  const block = wishlist.slice(start, end);
  check(
    "add_edit 子页分支只赋值 subPageNode (无 return; 阻断出口)",
    /subPageNode\s*=/.test(block) && !/^    return;\s*\n  \}/m.test(block),
  );
}

// Test 19: intake 子页分支只赋值 subPageNode
{
  const renderBranchStart = wishlist.indexOf("/*  ADD / EDIT FORM PAGE");
  const start = wishlist.indexOf('if (subPage === "intake")', renderBranchStart);
  const end = wishlist.indexOf('if (subPage === "convert_confirm"', start);
  const block = wishlist.slice(start, end);
  check(
    "intake 子页分支只赋值 subPageNode (无 return; 阻断出口)",
    /subPageNode\s*=/.test(block) && !/^    return;\s*\n  \}/m.test(block),
  );
}


/* ------------------------------------------------------------------ */
/*  4C-A: 已买状态统一 — wishlist-view purchasedItems/archivedItems    */
/* ------------------------------------------------------------------ */

// 20. purchasedItems 使用 isWishlistPurchased
check(
  "purchasedItems 使用 isWishlistPurchased",
  /isWishlistPurchased\(w\)/.test(wishlist),
);

// 21. archivedItems 使用 !isWishlistPurchased
check(
  "archivedItems 使用 !isWishlistPurchased",
  /!isWishlistPurchased\(w\)/.test(wishlist),
);

// 22. 不再散落 w.convertedItemId || w.convertedAt 判断已买
check(
  "purchasedItems 不再直接判断 w.convertedItemId || w.convertedAt",
  !/w\.convertedItemId\s*\|\|\s*w\.convertedAt/.test(wishlist),
);

// 23. 不再散落 !w.convertedItemId && !w.convertedAt 排除已买
check(
  "archivedItems 不再直接判断 !w.convertedItemId && !w.convertedAt",
  !/!w\.convertedItemId\s*&&\s*!w\.convertedAt/.test(wishlist),
);

/* ------------------------------------------------------------------ */
/*  瀑布流卡片统一 + 删除记录确认闭环                                  */
/* ------------------------------------------------------------------ */

check("种草首页卡片不新增三点菜单", !/MoreVertical|MoreHorizontal|打开操作菜单/.test(wishlistCardBlock));
check("种草首页卡片不新增删除按钮", !/删除记录|Trash2/.test(wishlistCardBlock));
check("种草首页卡片仍调用 openDetail(w)", /openDetail\(w\)/.test(wishlistCardBlock));
check("WishlistView20 仍保留 WishlistGlobalDialogs", /<WishlistGlobalDialogs\b/.test(wishlist));
check("WishlistView20 仍保留 showDeleteRecordConfirm", /showDeleteRecordConfirm/.test(wishlist));

const deleteConfirmStart = wishlist.indexOf("<ConfirmDialog open={showDeleteRecordConfirm}");
const deleteConfirmEnd = wishlist.indexOf("<ConfirmDialog open={showDiscardConfirm}", deleteConfirmStart);
const deleteConfirmBlock = wishlist.slice(deleteConfirmStart, deleteConfirmEnd);
check("删除记录确认回调 await onDeleteRecord", /await onDeleteRecord\(selectedItem\)/.test(deleteConfirmBlock));
check(
  "删除记录确认回调在 await onDeleteRecord 后关闭弹窗",
  deleteConfirmBlock.indexOf("await onDeleteRecord(selectedItem)") >= 0 &&
    deleteConfirmBlock.indexOf("onCloseDeleteRecord()") > deleteConfirmBlock.indexOf("await onDeleteRecord(selectedItem)"),
);
check("已买种草记录支持关联单品已删除弹窗", /showConvertedItemDeletedNotice/.test(wishlist) && /关联衣橱单品已删除/.test(wishlist));
check("已买种草记录删除关联后禁止撤销购买", /requestUndoPurchase[\s\S]+?isConvertedLinkDeleted/.test(wishlist));
check("已买种草记录删除关联后禁止查看单品详情", /openConvertedWardrobeItem[\s\S]+?isConvertedLinkDeleted/.test(wishlist));
check("WishlistView20 使用 isConvertedWishlistLinkDeleted 判断失效关联", /isConvertedWishlistLinkDeleted/.test(wishlist));

const handleDeleteRecordStart = wishlist.indexOf("const handleDeleteRecord = useCallback");
const handleDeleteRecordEnd = wishlist.indexOf("}, [setWishlistItems", handleDeleteRecordStart);
const handleDeleteRecordBlock = wishlist.slice(handleDeleteRecordStart, handleDeleteRecordEnd);
const deleteRecordCatch = handleDeleteRecordBlock.slice(handleDeleteRecordBlock.indexOf("catch"));
check("删除记录失败路径不得执行 setSelectedItem(null)", !/setSelectedItem\(null\)/.test(deleteRecordCatch));
check("管理页删除记录按钮不得直接调用 handleDeleteRecord(w)", !/handleDeleteRecord\(w\)/.test(wishlist));
check("详情页删除记录按钮不得直接调用 handleDeleteRecord(item)", !/handleDeleteRecord\(item\)/.test(wishlist));
check(
  "删除记录按钮先设置 selectedItem 再打开 showDeleteRecordConfirm",
  /setSelectedItem\(w\); setShowDeleteRecordConfirm\(true\)/.test(wishlist) &&
    /setSelectedItem\(item\); setShowDeleteRecordConfirm\(true\)/.test(wishlist),
);

// v1.1.23-dev: 种草正式录入复用单品多图流程
check("WishlistView20 用 GarmentIntakeFlow 承载种草录入", /<GarmentIntakeFlow[\s\S]+?title="添加种草"[\s\S]+?flowKind="wishlist"/.test(wishlist));
check("WishlistView20 给种草录入传 onPickIntakeImages", /onPickImages=\{onPickIntakeImages\}/.test(wishlist));
check("WishlistView20 给种草录入传 onProcessIntakeImage", /onProcessImage=\{onProcessIntakeImage\}/.test(wishlist));
check("WishlistView20 批量保存种草草稿", /handleSaveIntakeDrafts[\s\S]+?bulkPut\(newItems\)/.test(wishlist));
check("WishlistView20 使用 garmentDraftToWishlistItem", /garmentDraftToWishlistItem/.test(wishlist));

// v1.1.16 commit3 §5.4.4: 种草首页页边距与套装首页对齐
// §5.5 断言 7: 种草首页最外层不使用独立 px-4 内容容器 (px-4 由 wardrobe-app 父级负责)
check(
  "种草首页不再使用 wishlistHomeContentClassName = px-4 (与 outfit-list-view 对齐)",
  !/wishlistHomeContentClassName\s*=\s*"px-4"/.test(wishlist),
);
// §5.5 断言 8: 种草首页 header 与套装首页使用相同布局 token
check(
  "种草首页 header 使用与套装首页相同的 flex h-14 items-center justify-between gap-3",
  /<div className="flex h-14 items-center justify-between gap-3">/.test(wishlist),
);
check(
  "种草首页 header 标题区使用 min-w-0 包裹 (与套装首页一致)",
  /<div className="min-w-0">[\s\S]+?<h2 className="text-lg font-semibold text-ink leading-tight">种草<\/h2>/.test(wishlist),
);
check(
  "种草首页 header 不再使用 px-4 包裹标题区 (改用父级 space-y-4)",
  !/className=\{wishlistHomeContentClassName\}[\s\S]+?<\/div>/.test(wishlist),
);
// §5.5 断言 10: 种草首页 header 右上角只保留 MoreVertical 菜单, 不再渲染 + 文字按钮
check(
  "种草首页 header 右上角保留 MoreVertical 菜单按钮 (无新增 + 文字按钮)",
  /data-testid="wishlist-header-menu"/.test(wishlist) && /<MoreVertical\s+size=\{18\}/.test(wishlist),
);
// §5.4.4 强制要求: 筛选条左边界与套装首页一致 (-mx-1 + px-1)
check(
  "种草首页 chips 行使用 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 (与套装一致)",
  /-mx-1 flex gap-2 overflow-x-auto px-1 pb-1/.test(wishlist),
);
// §5.4.4 强制要求: 空状态居中规则与套装首页一致
check(
  "种草首页空状态使用 flex flex-col items-center justify-center py-20 text-center (与套装一致)",
  /flex flex-col items-center justify-center py-20 text-center/.test(wishlist) &&
    /还没有种草单品/.test(wishlist),
);

console.log(`\nfollowup-wishlist-management tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
