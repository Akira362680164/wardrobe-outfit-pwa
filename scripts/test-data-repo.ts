// v1.1.7 4B: data-repo 源码级断言
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const dataRepo = readFileSync(join(root, "src/lib/data-repo.ts"), "utf8");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const dataController = readFileSync(join(root, "src/components/use-wardrobe-data-controller.ts"), "utf8");
const wishlistView = readFileSync(join(root, "src/components/wishlist-view-2.0.tsx"), "utf8");
const wishlistConversion = readFileSync(join(root, "src/lib/wishlist-conversion.ts"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

console.log("\n=== 4B-lite reads ===");
check("src/lib/data-repo.ts exists", dataRepo.includes("WardrobeDataSnapshot"));
check("exports WardrobeDataSnapshot", /export interface WardrobeDataSnapshot/.test(dataRepo));
check("exports getWardrobeSnapshot", /export async function getWardrobeSnapshot/.test(dataRepo));
check("exports getAllItems", /export async function getAllItems/.test(dataRepo));
check("exports getAllLocations", /export async function getAllLocations/.test(dataRepo));
check("exports getAllOutfits", /export async function getAllOutfits/.test(dataRepo));
check("exports getAllWishlistItems", /export async function getAllWishlistItems/.test(dataRepo));
check("exports getAllOutfitPlanEntries", /export async function getAllOutfitPlanEntries/.test(dataRepo));
check("exports getAllOutfitCalendarPlans", /export async function getAllOutfitCalendarPlans/.test(dataRepo));
check("exports getAllPlanPackingChecklistItems", /export async function getAllPlanPackingChecklistItems/.test(dataRepo));
check("exports getItemById", /export async function getItemById/.test(dataRepo));
check("exports getOutfitById", /export async function getOutfitById/.test(dataRepo));
check("exports getWishlistItemById", /export async function getWishlistItemById/.test(dataRepo));
check("exports getItemsByLocation", /export async function getItemsByLocation/.test(dataRepo));
check("exports getActiveItemsByLocation", /export async function getActiveItemsByLocation/.test(dataRepo));
check("exports getOutfitsContainingItem", /export async function getOutfitsContainingItem/.test(dataRepo));
check("exports getPlanEntriesByOutfitId", /export async function getPlanEntriesByOutfitId/.test(dataRepo));
check("exports getPlanEntriesByDate", /export async function getPlanEntriesByDate/.test(dataRepo));
check("exports getCalendarPlansForDateRange", /export async function getCalendarPlansForDateRange/.test(dataRepo));
check("exports getPackingItemsByPlanId", /export async function getPackingItemsByPlanId/.test(dataRepo));
check("exports wardrobeDataRepo object", /export const wardrobeDataRepo/.test(dataRepo));
check("data-repo.ts does not import React", !/from "react"/.test(dataRepo) && !/from 'react'/.test(dataRepo));
check("data-repo.ts does not import components", !/from "@\/components\//.test(dataRepo));
check("data-repo.ts does not call version(", !/version\(/.test(dataRepo));
check("data-repo.ts does not call stores(", !/\.stores\(/.test(dataRepo));
check("use-wardrobe-data-controller.ts imports getWardrobeSnapshot", /import.*getWardrobeSnapshot.*from "@\/lib\/data-repo"/.test(dataController));
check("wardrobe-app.tsx imports useWardrobeDataController", /useWardrobeDataController/.test(wardrobeApp));
check("wardrobe-app.tsx does not import getWardrobeSnapshot", !/import.*getWardrobeSnapshot.*from "@\/lib\/data-repo"/.test(wardrobeApp));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

console.log("\n=== 4B-full writes ===");
check("data-repo imports deleteWardrobeItemsWithCascade", /deleteWardrobeItemsWithCascade[\s,}]/.test(dataRepo));
check("data-repo imports convertWishlistItemToWardrobe", /convertWishlistItemToWardrobe/.test(dataRepo));
check("data-repo imports undoWishlistPurchase", /undoWishlistPurchase[\s,]/.test(dataRepo));
check("data-repo exports deleteItemsWithCascade", /export async function deleteItemsWithCascade/.test(dataRepo));
check("data-repo exports convertWishlistToWardrobe", /export async function convertWishlistToWardrobe/.test(dataRepo));
check("data-repo exports undoWishlistPurchaseFromRepo", /export async function undoWishlistPurchaseFromRepo/.test(dataRepo));
check("data-repo exports getWishlistUndoPurchaseRisk", /export function getWishlistUndoPurchaseRisk/.test(dataRepo));
check("wardrobeDataRepo includes deleteItemsWithCascade", dataRepo.includes("deleteItemsWithCascade"));
check("wardrobeDataRepo includes convertWishlistToWardrobe", dataRepo.includes("convertWishlistToWardrobe"));
check("wardrobeDataRepo includes undoWishlistPurchaseFromRepo", dataRepo.includes("undoWishlistPurchaseFromRepo"));
check("wishlist-view imports convertWishlistToWardrobe", /import.*convertWishlistToWardrobe.*from "@\/lib\/data-repo"/.test(wishlistView));
check("wishlist-view imports undoWishlistPurchaseFromRepo", /undoWishlistPurchaseFromRepo.*from "@\/lib\/data-repo"/.test(wishlistView));
check("wishlist-view no longer directly imports convertWishlistItemToWardrobe", !/import {[^}]*convertWishlistItemToWardrobe[^}]*} from "@\/lib\/wishlist-conversion"/.test(wishlistView) && !/import {[^}]*convertWishlistItemToWardrobe/.test(wishlistView));
check("wishlist-view no longer directly imports undoWishlistPurchase", !/import {[^}]*undoWishlistPurchase[^}]*} from "@\/lib\/wishlist-conversion"/.test(wishlistView));
check("WardrobeApp no longer directly imports deleteWardrobeItemsWithCascade", !/deleteWardrobeItemsWithCascade,.*from "@\/lib\/wardrobe-cascade-delete"/.test(wardrobeApp));

/* ------------------------------------------------------------------ */
/*  v1.1.8 4B post-hotfix 新增断言                                    */
/* ------------------------------------------------------------------ */

console.log("\n=== v1.1.8 post-hotfix package.json ===");
const pkg = JSON.parse(packageJson) as { scripts: Record<string, string> };
const testLogicAll = pkg.scripts["test:logic:all"] ?? "";
const appRouteTestIndex = testLogicAll.indexOf("npm run test:logic:app-route");
const dataRepoTestIndex = testLogicAll.indexOf("npm run test:logic:data-repo");
check(
  "package.json test:logic:all 包含 app-route 和 data-repo 且顺序正确",
  appRouteTestIndex >= 0 && dataRepoTestIndex > appRouteTestIndex,
);
check(
  "package.json test:logic:all 不包含损坏拼接 'app-route npm run test:logic:data-repo'",
  !testLogicAll.includes("app-route npm run test:logic:data-repo"),
);

console.log("\n=== v1.1.8 wardrobeDataRepo 写入口聚合 ===");
const wardrobeDataRepoMatch = dataRepo.match(/export const wardrobeDataRepo\s*=\s*\{([\s\S]*?)\};/);
const wardrobeDataRepoBody = wardrobeDataRepoMatch ? wardrobeDataRepoMatch[1] : "";
check(
  "wardrobeDataRepo 对象存在",
  wardrobeDataRepoMatch != null,
);
check(
  "wardrobeDataRepo 对象包含 deleteItemsWithCascade",
  /\bdeleteItemsWithCascade\b/.test(wardrobeDataRepoBody),
);
check(
  "wardrobeDataRepo 对象包含 convertWishlistToWardrobe",
  /\bconvertWishlistToWardrobe\b/.test(wardrobeDataRepoBody),
);
check(
  "wardrobeDataRepo 对象包含 undoWishlistPurchaseFromRepo",
  /\bundoWishlistPurchaseFromRepo\b/.test(wardrobeDataRepoBody),
);
check(
  "wardrobeDataRepo 对象包含 getWishlistUndoPurchaseRisk",
  /\bgetWishlistUndoPurchaseRisk\b/.test(wardrobeDataRepoBody),
);
check(
  "data-repo.ts 不导入 React",
  !/from\s+["']react["']/.test(dataRepo),
);
check(
  "data-repo.ts 不导入 components",
  !/from\s+["']@\/components\//.test(dataRepo),
);

console.log("\n=== v1.1.8 undoWishlistPurchase 删除失败必须抛错 ===");
const undoFnStart = wishlistConversion.indexOf("export async function undoWishlistPurchase");
const undoFnEndAnchor = wishlistConversion.indexOf("\n}\n", undoFnStart);
const undoFnBody = undoFnStart >= 0 && undoFnEndAnchor >= 0
  ? wishlistConversion.slice(undoFnStart, undoFnEndAnchor + 2)
  : "";
check(
  "undoWishlistPurchase 中存在删除后校验 db.items.get(convertedItemId)",
  /input\.db\.items\.get\(convertedItemId\)/.test(undoFnBody)
    && (undoFnBody.match(/input\.db\.items\.get\(convertedItemId\)/g) || []).length >= 2,
);
check(
  "undoWishlistPurchase 中存在删除校验失败抛错",
  /throw\s+new\s+Error\([^)]*仍存在/.test(undoFnBody),
);
check(
  "undoWishlistPurchase 中不存在吞掉 deleteWardrobeItemsWithCascade 错误后继续恢复 wishlist 的 catch",
  !/catch[\s\S]{0,200}cascade delete failed, continuing/.test(undoFnBody)
    && !/console\.warn\("undoWishlistPurchase[\s\S]{0,200}cascade delete failed/.test(undoFnBody),
);
{
  const verifyIdx = undoFnBody.search(/const\s+stillThere\s*=\s*await\s+input\.db\.items\.get\(convertedItemId\)/);
  const restoreIdx = undoFnBody.search(/wishlistItems\.update\(input\.wishlistItem\.id/);
  check(
    "undoWishlistPurchase 中恢复 wishlist 发生在删除校验之后",
    verifyIdx >= 0 && restoreIdx >= 0 && verifyIdx < restoreIdx,
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

/* ------------------------------------------------------------------ */
/*  4C-A: 已买状态统一判断                                             */
/* ------------------------------------------------------------------ */

console.log("\n=== 4C-A 已买状态统一判断 ===");
check("wishlist-conversion 导出 WishlistPurchasedState", /export interface WishlistPurchasedState/.test(wishlistConversion));
check("wishlist-conversion 导出 getWishlistPurchasedState", /export function getWishlistPurchasedState/.test(wishlistConversion));
check("wishlist-conversion 导出 isWishlistPurchased", /export function isWishlistPurchased/.test(wishlistConversion));
check("getWishlistPurchasedState 中 convertedItemId 为 number 时 purchased=true", /typeof wishlist\.convertedItemId === "number"/.test(wishlistConversion) && /purchased: true/.test(wishlistConversion));
check("getWishlistPurchasedState 中只有 convertedAt 时 legacyConvertedAtOnly=true", /legacyConvertedAtOnly: true/.test(wishlistConversion));
check("data-repo 导出 getWishlistPurchasedStateFromRepo", /export function getWishlistPurchasedStateFromRepo/.test(dataRepo));
check("wardrobeDataRepo 包含 getWishlistPurchasedStateFromRepo", /getWishlistPurchasedStateFromRepo/.test(wardrobeDataRepoBody));

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
