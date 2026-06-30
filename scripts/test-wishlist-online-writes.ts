import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/wishlist-view-2.0.tsx", "utf8");

for (const forbidden of [
  "@/lib/data-repo",
  "@/lib/cloud-sync/garment-bridge",
  "@/lib/cloud-sync/wishlist-bridge",
  "setWishlistItems(",
  "deleteWishlistRecords(",
  "convertWishlistToWardrobe(",
  "undoWishlistPurchaseFromRepo(",
]) {
  assert.ok(!source.includes(forbidden), `wishlist runtime must not use ${forbidden}`);
}

for (const required of [
  "wardrobeRepository.createWishlistItem",
  "wardrobeRepository.updateWishlistItem",
  "wardrobeRepository.deleteWishlistItems",
  "wardrobeRepository.convertWishlistItem",
  "wardrobeRepository.undoWishlistPurchase",
  "context?.submissions[index]?.clientMutationId",
  "await onDataChanged?.()",
]) {
  assert.ok(source.includes(required), `wishlist online write must include ${required}`);
}

assert.match(source, /if \(!result\.ok\)[\s\S]{0,180}return;/, "failed save keeps the current form open");
assert.match(source, /failed === 0[\s\S]{0,240}setSubPage\("home"\)/, "batch intake closes only when every item succeeds");

console.log("✓ wishlist writes are server-authoritative and retain failed drafts/forms");
