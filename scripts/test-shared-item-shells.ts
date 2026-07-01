import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

const cardShell = readFileSync(
  join(root, "src/components/item-shell/catalog-waterfall-card-shell.tsx"),
  "utf8",
);
const grid = readFileSync(
  join(root, "src/components/item-shell/catalog-waterfall-grid.tsx"),
  "utf8",
);
const detailShell = readFileSync(
  join(root, "src/components/item-shell/item-detail-page-shell.tsx"),
  "utf8",
);
const detailCard = readFileSync(
  join(root, "src/components/item-shell/detail-section-card.tsx"),
  "utf8",
);
const editShell = readFileSync(
  join(root, "src/components/item-shell/item-edit-page-shell.tsx"),
  "utf8",
);
const editCard = readFileSync(
  join(root, "src/components/item-shell/edit-section-card.tsx"),
  "utf8",
);
const itemSectionCard = readFileSync(
  join(root, "src/components/item-shell/item-section-card.tsx"),
  "utf8",
);
const garmentDetail = readFileSync(join(root, "src/components/garment-detail-3.0.tsx"), "utf8");
const outfitList = readFileSync(join(root, "src/components/outfit-list-view.tsx"), "utf8");
const wishlistView = readFileSync(join(root, "src/components/wishlist-view-2.0.tsx"), "utf8");

// Existence
assert.ok(
  cardShell.includes("CatalogWaterfallCardShell"),
  "CatalogWaterfallCardShell exists",
);
assert.ok(
  grid.includes("CatalogWaterfallGrid"),
  "CatalogWaterfallGrid exists",
);
assert.ok(
  detailShell.includes("ItemDetailPageShell"),
  "ItemDetailPageShell exists",
);
assert.ok(detailCard.includes("DetailSectionCard"), "DetailSectionCard exists");
assert.ok(
  editShell.includes("ItemEditPageShell"),
  "ItemEditPageShell exists",
);
assert.ok(editCard.includes("EditSectionCard"), "EditSectionCard exists");

// Card shell structure
assert.ok(cardShell.includes("h-[304px]"), "card shell has h-[304px]");
assert.ok(cardShell.includes("h-[210px]"), "card shell has h-[210px]");
assert.ok(
  cardShell.includes('h-[210px] w-full shrink-0'),
  "card media slot keeps full width when its content is absolutely positioned",
);
assert.ok(cardShell.includes("h-[94px]"), "card shell has h-[94px]");
assert.ok(cardShell.includes("shadow-none"), "card shell has shadow-none");
assert.ok(
  !cardShell.includes("shadow-soft"),
  "card shell does not have shadow-soft",
);

// Section card shadow — relies on ITEM_SURFACE_CLASS from token file
const surfaceTokens = readFileSync(
  join(root, "src/components/item-shell/item-surface-tokens.ts"),
  "utf8",
);
assert.ok(
  surfaceTokens.includes("shadow-none"),
  "ITEM_SURFACE_CLASS has shadow-none",
);
assert.ok(
  !surfaceTokens.includes("shadow-soft"),
  "ITEM_SURFACE_CLASS does not have shadow-soft",
);

// Both public cards are thin wrappers around one shared structure.
assert.ok(
  detailCard.includes("<ItemSectionCard"),
  "DetailSectionCard delegates to ItemSectionCard",
);
assert.ok(
  editCard.includes("<ItemSectionCard"),
  "EditSectionCard delegates to ItemSectionCard",
);
assert.ok(itemSectionCard.includes("ITEM_SURFACE_CLASS"), "ItemSectionCard owns the shared surface structure");

// Real business consumers, not file-existence-only assertions.
assert.ok(garmentDetail.includes("<ItemDetailPageShell"), "garment detail uses ItemDetailPageShell");
assert.ok(outfitList.includes("<ItemDetailPageShell"), "outfit detail uses ItemDetailPageShell");
assert.ok(wishlistView.includes("<ItemDetailPageShell"), "wishlist detail uses ItemDetailPageShell");
assert.ok(wishlistView.includes("<ItemEditPageShell"), "wishlist edit uses ItemEditPageShell");
assert.ok(editShell.includes("<AppSubPageTopBar"), "ItemEditPageShell uses AppSubPageTopBar");
assert.ok(outfitList.includes("<CatalogWaterfallGrid>"), "outfit library uses CatalogWaterfallGrid");
assert.ok(outfitList.includes("<CatalogWaterfallCardShell"), "outfit library uses CatalogWaterfallCardShell");
assert.ok(!outfitList.includes("<CatalogWaterfallCard\n"), "outfit library no longer uses the legacy card");

// Single scroll container per shell — verifies token file has overflow-y-auto
// and each shell uses ITEM_PAGE_SCROLL_CLASS (not a duplicate literal)
const scrollInTokens = surfaceTokens.match(/overflow-y-auto/g);
assert.ok(scrollInTokens, "ITEM_PAGE_SCROLL_CLASS has overflow-y-auto");
assert.equal(
  scrollInTokens!.length,
  1,
  "ITEM_PAGE_SCROLL_CLASS has exactly one overflow-y-auto",
);

assert.ok(
  detailShell.includes("ITEM_PAGE_SCROLL_CLASS"),
  "ItemDetailPageShell uses ITEM_PAGE_SCROLL_CLASS",
);
assert.ok(
  editShell.includes("ITEM_PAGE_SCROLL_CLASS"),
  "ItemEditPageShell uses ITEM_PAGE_SCROLL_CLASS",
);

// Scroll properties in token file
assert.ok(
  surfaceTokens.includes("min-h-0"),
  "ITEM_PAGE_SCROLL_CLASS has min-h-0",
);
assert.ok(
  surfaceTokens.includes("overflow-x-hidden"),
  "ITEM_PAGE_SCROLL_CLASS has overflow-x-hidden",
);
assert.ok(
  surfaceTokens.includes("overscroll-contain"),
  "ITEM_PAGE_SCROLL_CLASS has overscroll-contain",
);

console.log("✅ test-shared-item-shells: all passed");
