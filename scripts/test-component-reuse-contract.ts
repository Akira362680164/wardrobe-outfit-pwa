import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const wardrobeApp = read("src/components/wardrobe-app.tsx");
const controller = read("src/components/use-wardrobe-data-controller.ts");
const wishlist = read("src/components/wishlist-view-2.0.tsx");
const garment = read("src/components/garment-detail-3.0.tsx");
const outfit = read("src/components/outfit-list-view.tsx");
const editShell = read("src/components/item-shell/item-edit-page-shell.tsx");
const confirmSheet = read("src/components/dialogs/confirm-action-sheet.tsx");

const bootstrapEffect = wardrobeApp.match(/useEffect\(\(\) => \{\n    setMiniMaxSettings[\s\S]*?\n  \}, \[\]\);/)?.[0] ?? "";
assert.ok(bootstrapEffect, "WardrobeApp bootstrap effect is present");
assert.ok(!bootstrapEffect.includes("refreshState("), "WardrobeApp does not duplicate the controller Overview request");
assert.ok(controller.includes("repository.getOverview()"), "data controller remains the Overview request owner");
assert.ok(wishlist.includes("<MotionPopoverMenu"), "wishlist menus use MotionPopoverMenu");
assert.ok(!garment.includes('className="fixed inset-0 z-[55]'), "garment move sheet has no private fixed overlay");
assert.ok(!garment.includes('className="fixed inset-0 z-[60]'), "garment delete confirmation has no private fixed overlay");
assert.ok(outfit.includes("<ConfirmActionSheet"), "outfit confirmations use ConfirmActionSheet");
assert.ok(!wardrobeApp.includes("confirm("), "native browser confirm is not used");
assert.ok(editShell.includes("<AsyncActionButton"), "edit shell uses the shared async action button");
assert.ok(confirmSheet.includes("<MotionSheet"), "shared confirmation delegates to MotionSheet");

console.log("✅ test-component-reuse-contract: all passed");
