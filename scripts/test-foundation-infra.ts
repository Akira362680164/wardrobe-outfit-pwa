import { migrateSavedOutfitRecord, migrateWishlistItemRecord, sanitizeStringArray, sanitizeColorInfo, sanitizeTemperatureRange, sanitizeWishlistStatus, sanitizeOutfitSource } from "../src/lib/migrate";
import { createBackup, parseBackup } from "../src/lib/backup";
import { buildColorInfo, getAccentColors, getPrimaryColor, getPrimaryColors } from "../src/lib/color-fields";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name}${detail ? `: ${detail}` : ""}`); console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

// --- sanitizeStringArray ---
console.log("\n=== sanitizeStringArray ===");
check("normal array", sanitizeStringArray(["a", "b", "c"]).join(",") === "a,b,c");
check("filters non-string", sanitizeStringArray([1, "a", true, "b"]).join(",") === "a,b");
check("filters empty string", sanitizeStringArray(["", "a", "  "]).join(",") === "a");
check("non-array → []", sanitizeStringArray("string").length === 0);
check("null → []", sanitizeStringArray(null).length === 0);

// --- sanitizeColorInfo ---
console.log("\n=== sanitizeColorInfo ===");
check("single valid", getPrimaryColor(sanitizeColorInfo({ mode: "single", primary: "米" }, {})) === "米");
check("main_with_accent valid", getAccentColors(sanitizeColorInfo({ mode: "main_with_accent", primary: "米", accents: ["棕"] }, {}))[0] === "棕");
check("multicolor valid", getPrimaryColors(sanitizeColorInfo({ mode: "multicolor", primaries: ["米", "黑"] }, {})).length === 2);
check("invalid → legacy fallback", getPrimaryColor(sanitizeColorInfo({ mode: "rainbow" }, { mainColor: "蓝" })) === "蓝");
check("non-object → legacy fallback", getPrimaryColor(sanitizeColorInfo(123, { primaryColors: ["白"] })) === "白");

// --- sanitizeTemperatureRange ---
console.log("\n=== sanitizeTemperatureRange ===");
check("both min and max", JSON.stringify(sanitizeTemperatureRange({ minC: 5, maxC: 25 })) === '{"minC":5,"maxC":25}');
check("min only", JSON.stringify(sanitizeTemperatureRange({ minC: 10 })) === '{"minC":10}');
check("max only", JSON.stringify(sanitizeTemperatureRange({ maxC: 30 })) === '{"maxC":30}');
check("both undefined → undefined", sanitizeTemperatureRange({}) === undefined);
check("non-object → undefined", sanitizeTemperatureRange("string") === undefined);

// --- sanitizeWishlistStatus ---
console.log("\n=== sanitizeWishlistStatus ===");
check("interested → interested", sanitizeWishlistStatus("interested") === "interested");
check("considering → interested", sanitizeWishlistStatus("considering") === "interested");
check("bought → archived", sanitizeWishlistStatus("bought") === "archived");
check("rejected → rejected", sanitizeWishlistStatus("rejected") === "rejected");
check("archived → archived", sanitizeWishlistStatus("archived") === "archived");
check("invalid → interested", sanitizeWishlistStatus("xyz") === "interested");
check("non-string → interested", sanitizeWishlistStatus(123) === "interested");

// --- sanitizeOutfitSource ---
console.log("\n=== sanitizeOutfitSource ===");
check("manual → manual", sanitizeOutfitSource("manual") === "manual");
check("ai → ai", sanitizeOutfitSource("ai") === "ai");
check("capture → capture", sanitizeOutfitSource("capture") === "capture");
check("invalid → manual", sanitizeOutfitSource("other") === "manual");

// --- migrateSavedOutfitRecord ---
console.log("\n=== migrateSavedOutfitRecord ===");
{
  const r1 = migrateSavedOutfitRecord({ id: "o1", name: "我的套装", itemIds: [1, 2, 3] });
  check("basic fields", r1.id === "o1" && r1.name === "我的套装" && r1.itemIds.length === 3);
  check("default source=manual", r1.source === "manual");
  check("default favorite=true", r1.favorite === true);

  const r2 = migrateSavedOutfitRecord({});
  check("empty → generated id", r2.id.startsWith("outfit-"));
  check("empty → 未命名套装", r2.name === "未命名套装");
  check("empty → itemIds=[]", r2.itemIds.length === 0);

  const r3 = migrateSavedOutfitRecord({ itemIds: [1, "bad", 3, null] });
  check("itemIds filters non-number", r3.itemIds.length === 2 && r3.itemIds[0] === 1 && r3.itemIds[1] === 3, JSON.stringify(r3.itemIds));

  const r4 = migrateSavedOutfitRecord({ source: "ai" });
  check("source=ai preserved", r4.source === "ai");

  const r5 = migrateSavedOutfitRecord({ source: "bad" });
  check("source=bad → manual", r5.source === "manual");

  const r6 = migrateSavedOutfitRecord({ wornDates: ["2026-01-15", "2026-06-10", "2026-06-10", "not-a-date"] });
  check("wornDates deduped + filtered", (r6.wornDates ?? []).length === 2 && (r6.wornDates ?? [])[0] === "2026-01-15", (r6.wornDates ?? []).join(","));

  const r7 = migrateSavedOutfitRecord({ coverImageDataUrl: 123 });
  check("coverImageDataUrl non-string → undefined", r7.coverImageDataUrl === undefined);

  const r8 = migrateSavedOutfitRecord({});
  check("createdAt auto-filled", typeof r8.createdAt === "string" && r8.createdAt.length > 0);
  check("updatedAt auto-filled", typeof r8.updatedAt === "string" && r8.updatedAt.length > 0);

  const r9 = migrateSavedOutfitRecord({ seasons: ["spring", "bad", "winter"] });
  check("seasons filters non-season", (r9.seasons ?? []).length === 2 && (r9.seasons ?? []).includes("spring") && (r9.seasons ?? []).includes("winter"), (r9.seasons ?? []).join(","));

  const r10 = migrateSavedOutfitRecord({ thumbnailStatus: "ready" });
  check("thumbnailStatus=ready preserved", r10.thumbnailStatus === "ready");

  const r11 = migrateSavedOutfitRecord({ thumbnailStatus: "broken" });
  check("thumbnailStatus=broken → undefined", r11.thumbnailStatus === undefined);
}

// --- migrateWishlistItemRecord ---
console.log("\n=== migrateWishlistItemRecord ===");
{
  const r1 = migrateWishlistItemRecord({ name: "Nike AF1", imageDataUrl: "data:image/png;base64,x", status: "interested" });
  check("basic wishlist", r1 !== null && r1.name === "Nike AF1" && r1.status === "interested", r1 ? r1.status : "null");

  const r2 = migrateWishlistItemRecord({ name: "", imageDataUrl: "" });
  check("no name no image → null", r2 === null);

  const r3 = migrateWishlistItemRecord({ name: "Test", imageDataUrl: "" });
  check("name only → valid", r3 !== null && r3.name === "Test");

  const r4 = migrateWishlistItemRecord({ name: "", imageDataUrl: "data:image/png;base64,x" });
  check("image only → valid", r4 !== null && r4.imageDataUrl === "data:image/png;base64,x");

  const r5 = migrateWishlistItemRecord({ name: "x", status: "considering" });
  check("considering → interested", r5 !== null && r5.status === "interested", r5 ? r5.status : "null");

  const r6 = migrateWishlistItemRecord({ name: "x", status: "bought" });
  check("bought → archived", r6 !== null && r6.status === "archived", r6 ? r6.status : "null");

  const r7 = migrateWishlistItemRecord({ name: "x", status: "archived" });
  check("archived → archived", r7 !== null && r7.status === "archived");

  const r8 = migrateWishlistItemRecord({ name: "x", status: "xyz" });
  check("invalid status → interested", r8 !== null && r8.status === "interested");

  const r9 = migrateWishlistItemRecord({ name: "x", aiAssessment: { verdict: "xyz", summary: "bad data" } });
  check("bad aiAssessment verdict → unknown", r9 !== null && r9.aiAssessment?.verdict === "unknown", r9?.aiAssessment?.verdict ?? "null");

  const r10 = migrateWishlistItemRecord({ name: "x", imageDataUrl: 123 });
  check("imageDataUrl non-string → empty", r10 !== null && r10.imageDataUrl === "");

  const r11 = migrateWishlistItemRecord(null);
  check("null → null", r11 === null);

  const r12 = migrateWishlistItemRecord(undefined);
  check("undefined → null", r12 === null);

  const r13 = migrateWishlistItemRecord({ name: "x", convertedItemId: 8, convertedAt: "2026-06-20T00:00:00.000Z", convertedItemDeletedAt: "2026-06-21T00:00:00.000Z" });
  check("convertedItemDeletedAt preserved", r13 !== null && r13.convertedItemDeletedAt === "2026-06-21T00:00:00.000Z");
}

// --- backup roundtrip ---
console.log("\n=== backup roundtrip ===");
{
  const now = new Date().toISOString();
  const items = [
    { id: 1, name: "白T恤", imageDataUrl: "data:image/png;base64,a", category: "top", primaryColors: ["白"], secondaryColors: [], seasons: ["summer"], styles: ["casual"], formality: 2, warmth: 1, locationId: "home", status: "active", wornDates: ["2026-06-10"], createdAt: now, updatedAt: now },
  ] as any;
  const locations = [{ id: "home", name: "默认衣橱", sortOrder: 1, createdAt: now, updatedAt: now }];
  const outfits = [{ id: "o1", name: "夏季套装", itemIds: [1], source: "manual" as const, favorite: true, createdAt: now, updatedAt: now }];
  const wishlistItems = [{ id: "w1", name: "种草鞋", imageDataUrl: "data:image/png;base64,b", category: "shoes" as const, colors: buildColorInfo("single", ["白"]), seasons: ["all" as const], styles: ["casual" as const], status: "interested" as const, createdAt: now, updatedAt: now }];

  const backup = createBackup(items, locations, outfits, undefined, wishlistItems);
  check("backup has wishlistItems", backup.wishlistItems !== undefined && backup.wishlistItems.length === 1);
  check("backup has outfits", backup.outfits !== undefined && backup.outfits.length === 1);
  check("backup version=5", backup.version === 5);

  const json = JSON.stringify(backup);
  const parsed = parseBackup(json);
  check("parsed items count", parsed.items.length === 1);
  check("parsed outfits count", (parsed.outfits ?? []).length === 1);
  check("parsed wishlistItems count", (parsed.wishlistItems ?? []).length === 1);
  check("parsed wishlist status", parsed.wishlistItems![0].status === "interested");
}

// --- old backup compatibility ---
console.log("\n=== old backup compatibility ===");
{
  const oldBackup = JSON.stringify({
    version: 3,
    exportedAt: new Date().toISOString(),
    locations: [{ id: "home", name: "默认衣橱", sortOrder: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    items: [{ id: 1, name: "旧T恤", imageDataUrl: "data:image/png;base64,x", category: "top", primaryColors: ["黑"], secondaryColors: [], seasons: [], styles: [], formality: 2, warmth: 2, locationId: "home", status: "active", wornDates: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
  });
  const parsed = parseBackup(oldBackup);
  check("old backup items", parsed.items.length === 1);
  check("old backup no wishlistItems → []", (parsed.wishlistItems ?? []).length === 0);
  check("old backup no outfits → []", (parsed.outfits ?? []).length === 0);
}

// --- bad data in backup ---
console.log("\n=== bad data resilience ===");
{
  const badBackup = JSON.stringify({
    version: 4,
    exportedAt: new Date().toISOString(),
    locations: [{ id: "home", name: "默认衣橱", sortOrder: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    items: [{ id: 1, name: "T恤", imageDataUrl: "data:image/png;base64,x", category: "top", primaryColors: ["黑"], secondaryColors: [], seasons: [], styles: [], formality: 2, warmth: 2, locationId: "home", status: "active", wornDates: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    outfits: "not-an-array",
    wishlistItems: { bad: true },
  });
  const parsed = parseBackup(badBackup);
  check("bad outfits → []", (parsed.outfits ?? []).length === 0);
  check("bad wishlistItems → []", (parsed.wishlistItems ?? []).length === 0);
}

// --- Summary ---
console.log(`\n=== 总计: ${pass} pass / ${fail} fail ===`);
if (fail > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
