import { GARMENT_CATEGORY_CATALOG, getCategoryGroupById, getSubcategoryById, getCategoryLabel, getSubcategoryLabel, mapLegacyCategoryToCatalogGroup } from "../src/lib/garment-category-catalog";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name}${detail ? `: ${detail}` : ""}`); console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

// --- Catalog structure ---
console.log("\n=== Catalog structure ===");
check("9 top-level categories", GARMENT_CATEGORY_CATALOG.length === 9, String(GARMENT_CATEGORY_CATALOG.length));
for (const group of GARMENT_CATEGORY_CATALOG) {
  check(`${group.label} has subcategories`, group.subcategories.length > 0, String(group.subcategories.length));
}

// --- getCategoryGroupById ---
console.log("\n=== getCategoryGroupById ===");
check("tops found", getCategoryGroupById("tops")?.label === "上衣");
check("pants found", getCategoryGroupById("pants")?.label === "裤子");
check("shoes found", getCategoryGroupById("shoes")?.label === "鞋");
check("accessories found", getCategoryGroupById("accessories")?.label === "配饰");
check("jewelry found", getCategoryGroupById("jewelry")?.label === "首饰");
check("unknown → undefined", getCategoryGroupById("xyz") === undefined);

// --- getSubcategoryById ---
console.log("\n=== getSubcategoryById ===");
check("tops/t_shirt found", getSubcategoryById("tops", "t_shirt")?.label === "T恤");
check("shoes/sneakers found", getSubcategoryById("shoes", "sneakers")?.label === "运动鞋");
check("bags/backpack found", getSubcategoryById("bags", "backpack")?.label === "双肩包");
check("unknown subcategory → undefined", getSubcategoryById("tops", "xyz") === undefined);
check("unknown group → undefined", getSubcategoryById("xyz", "t_shirt") === undefined);

// --- getCategoryLabel ---
console.log("\n=== getCategoryLabel ===");
check("tops → 上衣", getCategoryLabel("tops") === "上衣");
check("pants → 裤子", getCategoryLabel("pants") === "裤子");
check("one_piece → 连体装", getCategoryLabel("one_piece") === "连体装");
check("unknown → id fallback", getCategoryLabel("xyz") === "xyz");

// --- getSubcategoryLabel ---
console.log("\n=== getSubcategoryLabel ===");
check("tops/t_shirt → T恤", getSubcategoryLabel("tops", "t_shirt") === "T恤");
check("no subcategoryId → empty", getSubcategoryLabel("tops") === "");
check("unknown subcategory → id fallback", getSubcategoryLabel("tops", "xyz") === "xyz");

// --- mapLegacyCategoryToCatalogGroup ---
console.log("\n=== mapLegacyCategoryToCatalogGroup ===");
check("top → tops", mapLegacyCategoryToCatalogGroup("top") === "tops");
check("outerwear → tops", mapLegacyCategoryToCatalogGroup("outerwear") === "tops");
check("bottom → pants", mapLegacyCategoryToCatalogGroup("bottom") === "pants");
check("dress → one_piece", mapLegacyCategoryToCatalogGroup("dress") === "one_piece");
check("shoes → shoes", mapLegacyCategoryToCatalogGroup("shoes") === "shoes");
check("bag → bags", mapLegacyCategoryToCatalogGroup("bag") === "bags");
check("hat → hats", mapLegacyCategoryToCatalogGroup("hat") === "hats");
check("necklace → jewelry", mapLegacyCategoryToCatalogGroup("necklace") === "jewelry");
check("bracelet → jewelry", mapLegacyCategoryToCatalogGroup("bracelet") === "jewelry");
check("bangle → jewelry", mapLegacyCategoryToCatalogGroup("bangle") === "jewelry");
check("unknown → undefined", mapLegacyCategoryToCatalogGroup("xyz") === undefined);

// --- Summary ---
console.log(`\n=== 总计: ${pass} pass / ${fail} fail ===`);
if (fail > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
