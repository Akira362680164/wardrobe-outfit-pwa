// scripts/test-outfit-cover-consistency.ts
// ============================================================
// 套装封面一致性回归测试
// 覆盖: getOutfitCover 优先级、getCollageImageUrls 动态拼图、
//       deriveGarmentImageList 关联套装引用语义、
//       WaterfallCardImage 源码集成契约
// ============================================================
import { getOutfitCover, getCollageImageUrls } from "../src/lib/outfit-cover";
import { deriveGarmentImageList } from "../src/lib/garment-image-source";
import { buildColorInfo } from "../src/lib/color-fields";
import type { SavedOutfit, WardrobeItem } from "../src/lib/types";
import * as fs from "fs";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    const msg = detail ? ` — ${detail}` : "";
    failures.push(`${name}${msg}`);
    console.log(`  ❌ ${name}${msg}`);
  }
}

function makeItem(overrides: Partial<WardrobeItem> = {}): WardrobeItem {
  return {
    id: 1,
    name: "白色短衬衫",
    imageDataUrl: "data:image/png;base64,ITEM_A",
    category: "tops",
    colors: buildColorInfo("single", ["白"]),
    seasons: ["all"],
    styles: ["casual"],
    formality: 2,
    warmth: 2,
    locationId: "home",
    status: "active",
    wornDates: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

// ------------------------------------------------------------
// 1. 纯逻辑夹具 — getOutfitCover 优先级
// ------------------------------------------------------------
console.log("\n=== 纯逻辑：有效 itemIds → auto_collage ===");
{
  const itemA = makeItem({ id: 1, name: "白色短衬衫", imageDataUrl: "data:image/png;base64,ITEM_A" });
  const itemB = makeItem({ id: 2, name: "黑色乐福鞋", imageDataUrl: "data:image/png;base64,ITEM_B" });
  const outfit: SavedOutfit = {
    id: "outfit-1",
    name: "测试套装",
    itemIds: [1, 2],
    source: "manual",
    favorite: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    // 陈旧 preview，不应影响 mode 判断
    previewImageDataUrl: "data:image/png;base64,OLD_PREVIEW",
  };
  const result = getOutfitCover(outfit, [itemA, itemB]);
  check("mode = auto_collage", result.mode === "auto_collage", `actual=${result.mode}`);
}

console.log("\n=== 纯逻辑：getCollageImageUrls 返回当前衣物图片 ===");
{
  const itemA = makeItem({ id: 1, name: "白色短衬衫", imageDataUrl: "data:image/png;base64,ITEM_A" });
  const itemB = makeItem({ id: 2, name: "黑色乐福鞋", imageDataUrl: "data:image/png;base64,ITEM_B" });
  const outfit: SavedOutfit = {
    id: "outfit-1",
    name: "测试套装",
    itemIds: [1, 2],
    source: "manual",
    favorite: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    previewImageDataUrl: "data:image/png;base64,OLD_PREVIEW",
  };
  const urls = getCollageImageUrls(outfit, [itemA, itemB]);
  check("返回 2 张图片", urls.length === 2, `actual=${urls.length}`);
  check("第 1 张 = ITEM_A", urls[0] === "data:image/png;base64,ITEM_A", `actual=${urls[0]}`);
  check("第 2 张 = ITEM_B", urls[1] === "data:image/png;base64,ITEM_B", `actual=${urls[1]}`);
  check("不包含 OLD_PREVIEW", !urls.includes("data:image/png;base64,OLD_PREVIEW"));
}

console.log("\n=== 纯逻辑：有效 itemIds 不存在对应衣物 → empty ===");
{
  const outfit: SavedOutfit = {
    id: "outfit-1",
    name: "测试套装",
    itemIds: [99],
    source: "manual",
    favorite: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    previewImageDataUrl: "data:image/png;base64,OLD_PREVIEW",
  };
  const result = getOutfitCover(outfit, []);
  // itemIds 存在但无有效衣物 → empty（不是 preview）
  check("有 itemIds 但无有效衣物 → empty", result.mode === "empty", `actual=${result.mode}`);
}

console.log("\n=== 纯逻辑：空 itemIds + 有 preview → preview ===");
{
  const outfit: SavedOutfit = {
    id: "outfit-1",
    name: "测试套装",
    itemIds: [],
    source: "manual",
    favorite: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    previewImageDataUrl: "data:image/png;base64,PREVIEW_ONLY",
  };
  const result = getOutfitCover(outfit, []);
  check("空 itemIds + 有 preview → preview", result.mode === "preview");
  check("imageDataUrl = preview", result.imageDataUrl === "data:image/png;base64,PREVIEW_ONLY");
}

// ------------------------------------------------------------
// 2. 图片派生夹具
// ------------------------------------------------------------
console.log("\n=== 图片派生：关联套装条目语义 ===");
{
  const itemA = makeItem({ id: 1, name: "白色短衬衫", imageDataUrl: "data:image/png;base64,ITEM_A" });
  const outfit: SavedOutfit = {
    id: "outfit-1",
    name: "测试套装",
    itemIds: [1, 2],
    source: "manual",
    favorite: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    previewImageDataUrl: "data:image/png;base64,OLD_PREVIEW",
  };
  const list = deriveGarmentImageList(itemA, [outfit]);
  const outfitEntry = list.find((e) => e.source === "saved_outfit");
  check("存在 saved_outfit 条目", !!outfitEntry);
  if (outfitEntry) {
    check("source = saved_outfit", outfitEntry.source === "saved_outfit");
    check("renderKind = outfit", outfitEntry.renderKind === "outfit");
    check("outfitId = outfit-1", outfitEntry.outfitId === "outfit-1");
    check("imageDataUrl 为空（不依赖静态 URL）", outfitEntry.imageDataUrl === "");
  }
}

console.log("\n=== 图片派生：preview + cover 均缺失也保留引用 ===");
{
  const itemA = makeItem({ id: 1 });
  const outfit: SavedOutfit = {
    id: "outfit-1",
    name: "测试套装",
    itemIds: [1],
    source: "manual",
    favorite: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    // 无 preview / cover
  };
  const list = deriveGarmentImageList(itemA, [outfit]);
  check("即使无任何图片字段也保留套装引用", list.length === 2);
  check("条目 renderKind = outfit", list[1]?.renderKind === "outfit");
}

// ------------------------------------------------------------
// 3. 源码集成契约
// ------------------------------------------------------------
console.log("\n=== 源码集成契约：WaterfallCardImage 套装分支 ===");
{
  const src = fs.readFileSync("src/components/wardrobe-app.tsx", "utf-8");
  const waterfallFnStart = src.indexOf("function WaterfallCardImage(");
  const waterfallFn = waterfallFnStart >= 0 ? src.slice(waterfallFnStart, waterfallFnStart + 3000) : "";
  check("WaterfallCardImage 存在", waterfallFn.length > 0);

  // 套装分支渲染 OutfitCover
  const hasOutfitCoverInCustomSlide = waterfallFn.includes("<OutfitCover");
  check("套装分支渲染 OutfitCover", hasOutfitCoverInCustomSlide);

  // 传给 OutfitCover 的是 resolvedOutfit + items (allItems)
  check("传入 OutfitCover: outfit={resolvedOutfit}", waterfallFn.includes("outfit={resolvedOutfit}"));
  check("传入 OutfitCover: items={allItems}", waterfallFn.includes("items={allItems}"));

  // Check that both outfit and image branches are handled
  const hasOutfitBranch = waterfallFn.includes('renderKind === "outfit"');
  const hasImageBranch = waterfallFn.includes('kind: "image" as const');
  check("套装分支按 renderKind 区分", hasOutfitBranch && hasImageBranch);
}

console.log("\n=== 源码集成契约：SwipeSlide 支持 custom ===");
{
  const carouselSrc = fs.readFileSync("src/components/swipe-image-carousel.tsx", "utf-8");
  check("导出 SwipeCustomSlide", carouselSrc.includes("SwipeCustomSlide"));
  check("SwipeSlide 包含 SwipeCustomSlide", /SwipeCustomSlide/.test(carouselSrc.split("export type SwipeSlide")[1]?.split(";")[0] ?? ""));
  check("renderSlide 处理 custom", carouselSrc.includes('slide.kind === "custom"') || carouselSrc.includes("SwipeCustomPage"));
  check("SwipeCustomPage 组件存在", carouselSrc.includes("function SwipeCustomPage(") || carouselSrc.includes("SwipeCustomPage"));
}

console.log("\n=== 源码集成契约：garment-image-source 不再依赖旧来源值 ===");
{
  const src = fs.readFileSync("src/lib/garment-image-source.ts", "utf-8");
  check("不含 saved_outfit_preview", !src.includes("saved_outfit_preview"));
  check("不含 saved_outfit_cover", !src.includes("saved_outfit_cover"));
  check("包含 renderKind", src.includes("renderKind"));
  check("包含 saved_outfit（统一值）", src.includes('"saved_outfit"'));
}

// ------------------------------------------------------------
console.log(`\n=== 总计: ${pass} pass / ${fail} fail ===\n`);
if (fail > 0) {
  console.log("失败项：");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
