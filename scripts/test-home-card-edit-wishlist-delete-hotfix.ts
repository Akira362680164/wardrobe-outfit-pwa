import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`✓ ${message}`);
  } else {
    failed += 1;
    console.error(`✗ ${message}`);
  }
}

function includesAll(source: string, parts: string[]): boolean {
  return parts.every((part) => source.includes(part));
}

const wardrobeApp = read("src/components/wardrobe-app.tsx");
const catalogCard = read("src/components/catalog-waterfall-card.tsx");
const catalogFormat = read("src/lib/catalog-card-format.ts");
const wishlistView = read("src/components/wishlist-view-2.0.tsx");
const garmentDetail = read("src/components/garment-detail-3.0.tsx");

const waterfallStart = wardrobeApp.indexOf("function WaterfallCardImage");
const waterfallEnd = wardrobeApp.indexOf("function StableGarmentImage", waterfallStart);
const waterfallSource = wardrobeApp.slice(waterfallStart, waterfallEnd > -1 ? waterfallEnd : undefined);

assert(waterfallSource.includes('imageClassName="object-contain"'), "WaterfallCardImage uses object-contain");
assert(!waterfallSource.includes('imageClassName="object-cover"'), "WaterfallCardImage no longer uses object-cover");
assert(catalogCard.includes("<span className=\"truncate\">{color}</span>"), "GarmentColorInline renders color text");
assert(catalogCard.includes("h-3 w-3 shrink-0 rounded-full"), "GarmentColorInline renders swatch elements");
assert(catalogCard.includes("border border-ink/18"), "GarmentColorInline gives white-like swatches a visible border");
assert(catalogCard.includes("overflow-hidden rounded-2xl"), "CatalogWaterfallCard clips content to the card radius");
assert(!catalogCard.includes("rounded-t-2xl bg-mist"), "CatalogWaterfallCard image well relies on card clipping instead of its own top radius");
assert(wardrobeApp.includes("overflow-hidden rounded-2xl"), "Wardrobe home cards clip content to the card radius");
assert(!wardrobeApp.includes("h-[210px] overflow-hidden rounded-t-2xl bg-mist"), "Wardrobe home image well relies on card clipping instead of its own top radius");
assert(
  catalogFormat.includes("return getAllColors(item.colors)") &&
    catalogFormat.includes("getGarmentCardColors(item"),
  "formatGarmentCategoryColorLine accepts WardrobeItem and { category, colors }",
);
assert(!wardrobeApp.includes("onCropFromSource"), "WardrobeEditPage props no longer include onCropFromSource");
assert(!wardrobeApp.includes("从原图重新裁切"), "user-visible recrop-from-original copy is absent");
assert(
  wardrobeApp.includes("const sourceKind: \"original\" | \"current\" = editDraft.sourceImageDataUrl ? \"original\" : \"current\""),
  "WardrobeEditPage recrop uses original source when available",
);
assert(wishlistView.includes("onExit={closeWishlistIntake}"), "Wishlist intake onExit is wired to closeWishlistIntake");
assert(wishlistView.includes('flowKind="wishlist"'), "Wishlist intake reuses GarmentIntakeFlow wishlist mode");
assert(includesAll(wishlistView, ["const closeWishlistIntake = useCallback", 'setSubPage("home")']), "closeWishlistIntake returns to home");
assert(includesAll(wishlistView, ["const closeWishlistIntake = useCallback", "setSelectedItem(null)"]), "closeWishlistIntake clears selected item");
assert(includesAll(wishlistView, ["const closeWishlistIntake = useCallback", "onCreateClosed?.()"]), "closeWishlistIntake closes outer create flow");
assert(wishlistView.includes('if (subPage === "intake")') && wishlistView.includes("closeWishlistIntake();"), "useStableBackHandler handles intake subpage");
assert(wishlistView.includes("const goBack = useCallback") && wishlistView.includes('if (subPage === "intake")'), "goBack handles intake subpage");
assert(wishlistView.includes('if (subPage === "intake")') && wishlistView.includes("closeWishlistIntake();"), "Wishlist intake back exits to closeWishlistIntake");
assert(garmentDetail.includes("onDelete: () => Promise<void> | void;"), "GarmentDetail30Props.onDelete supports async delete");
assert(garmentDetail.includes("await onDelete();"), "GarmentDetail30 awaits onDelete");
assert(includesAll(garmentDetail, ["submitting: boolean", "errorMessage: string | null"]), "DeleteConfirmDialog accepts submitting and errorMessage");
assert(!wardrobeApp.includes("void handleDetailDelete"), "detail delete prop no longer drops handleDetailDelete promise");
assert(wardrobeApp.includes("async function executeDelete()") && wardrobeApp.includes("try {") && wardrobeApp.includes("catch (error)"), "bulk executeDelete has try/catch");
assert(
  wardrobeApp.includes("setDeleteError(error instanceof Error ? error.message") && !wardrobeApp.includes("catch (error) {\n      setDeleteConfirm(null)"),
  "bulk delete failure keeps deleteConfirm open and records error",
);
assert(!wardrobeApp.includes("runTransaction = db.transaction"), "cascade delete keeps Dexie transaction bound");
assert(wardrobeApp.includes("导出诊断日志"), "settings exposes diagnostic log export");

if (failed > 0) {
  console.error(`\n${failed} hotfix assertions failed.`);
  process.exit(1);
}

console.log("\nHome card/edit/wishlist/delete hotfix assertions passed.");
