// scripts/test-garment-image-source.ts
// ============================================================
// 衣物图片组派生（v0.9.32-dev）单元测试 — 套装封面一致性修复版
// ------------------------------------------------------------
// 覆盖: 主图存在/缺失、referenceOutfitImages 来源、SavedOutfit 关联套装引用、
//        renderKind 语义、outfit 去重、排序、容错
// ============================================================
import {
  deriveGarmentImageList,
  isMainImageEntry,
  isReferenceOutfitEntry,
  type GarmentImageEntry,
} from "../src/lib/garment-image-source";
import { buildColorInfo } from "../src/lib/color-fields";
import type { ReferenceOutfitImage, SavedOutfit, WardrobeItem } from "../src/lib/types";

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

function checkEq<T>(name: string, actual: T, expected: T): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(name, a === b, `actual=${a} expected=${b}`);
}

function makeItem(overrides: Partial<WardrobeItem> = {}): WardrobeItem {
  return {
    id: 1,
    name: "白色 T 恤",
    imageDataUrl: "data:image/png;base64,MAIN",
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

function makeOutfit(overrides: Partial<SavedOutfit> = {}): SavedOutfit {
  return {
    id: "outfit-1",
    name: "周末休闲",
    itemIds: [1],
    source: "manual",
    favorite: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}

function makeRef(overrides: Partial<ReferenceOutfitImage> = {}): ReferenceOutfitImage {
  return {
    id: "ref-1",
    imageDataUrl: "data:image/png;base64,REF1",
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    ...overrides,
  };
}

// ------------------------------------------------------------
console.log("\n=== 基础：单张主图 ===");
{
  const item = makeItem();
  const list = deriveGarmentImageList(item, []);
  checkEq("只有 1 张", list.length, 1);
  checkEq("第 0 张是主图", list[0]?.source, "main");
  checkEq("主图 renderKind", list[0]?.renderKind, "image");
  checkEq("主图 url 正确", list[0]?.imageDataUrl, "data:image/png;base64,MAIN");
}

console.log("\n=== 边界：item 为 null/undefined ===");
{
  checkEq("null 返回 []", deriveGarmentImageList(null, []).length, 0);
  checkEq("undefined 返回 []", deriveGarmentImageList(undefined, []).length, 0);
}

console.log("\n=== 边界：主图 imageDataUrl 缺失/无效 ===");
{
  const empty = makeItem({ imageDataUrl: "" });
  checkEq("主图空字符串且无 thumbnail → []", deriveGarmentImageList(empty, []).length, 0);
  const garbage = makeItem({ imageDataUrl: "not-a-url" });
  checkEq("主图非 url → []", deriveGarmentImageList(garbage, []).length, 0);
}

console.log("\n=== 缩略图优先：有 thumbnail 无 original 仍创建主图条目 ===");
{
  const item = makeItem({
    imageDataUrl: "",
    thumbnailDataUrl: "data:image/webp;base64,THUMB",
  });
  const list = deriveGarmentImageList(item, []);
  checkEq("长度 1", list.length, 1);
  checkEq("主图 imageDataUrl 保持为空", list[0]?.imageDataUrl, "");
  checkEq("card 使用 thumbnail", list[0]?.cardImageDataUrl, "data:image/webp;base64,THUMB");
  checkEq("display 仍等待 original", list[0]?.displayImageDataUrl, "");
}

console.log("\n=== 线上图片：blob Object URL 可用 ===");
{
  const item = makeItem({
    imageDataUrl: "blob:http://127.0.0.1/original",
    thumbnailDataUrl: "blob:http://127.0.0.1/thumbnail",
  });
  const list = deriveGarmentImageList(item, []);
  checkEq("blob 主图不被过滤", list[0]?.displayImageDataUrl, item.imageDataUrl);
  checkEq("blob 缩略图不被过滤", list[0]?.cardImageDataUrl, item.thumbnailDataUrl);
}

console.log("\n=== 缩略图优先：有 original 无 thumbnail 不把 original 当 card 图 ===");
{
  const item = makeItem({
    imageDataUrl: "data:image/png;base64,MAIN",
    thumbnailDataUrl: undefined,
  });
  const list = deriveGarmentImageList(item, []);
  checkEq("长度 1", list.length, 1);
  checkEq("主图 original 保留给详情", list[0]?.imageDataUrl, "data:image/png;base64,MAIN");
  checkEq("card 不 fallback original", list[0]?.cardImageDataUrl, "");
}

console.log("\n=== 手动 reference 排序：按 createdAt 升序 ===");
{
  const item = makeItem({
    referenceOutfitImages: [
      makeRef({ id: "ref-2", imageDataUrl: "data:image/png;base64,REF2", createdAt: "2026-06-05T00:00:00.000Z" }),
      makeRef({ id: "ref-1", imageDataUrl: "data:image/png;base64,REF1", createdAt: "2026-06-02T00:00:00.000Z" }),
      makeRef({ id: "ref-3", imageDataUrl: "data:image/png;base64,REF3", createdAt: "2026-06-08T00:00:00.000Z" }),
    ],
  });
  const list = deriveGarmentImageList(item, []);
  checkEq("长度 4（主图+3 ref）", list.length, 4);
  checkEq("第 0 张 = 主图", list[0]?.source, "main");
  checkEq("manual ref renderKind", list[1]?.renderKind, "image");
  checkEq("第 1 张 = ref-1（最早）", list[1]?.refId, "ref-1");
  checkEq("第 2 张 = ref-2（中间）", list[2]?.refId, "ref-2");
  checkEq("第 3 张 = ref-3（最晚）", list[3]?.refId, "ref-3");
}

console.log("\n=== 关联套装条目：基本语义 ===");
{
  const item = makeItem();
  const outfit = makeOutfit({
    id: "outfit-1",
    previewImageDataUrl: "data:image/png;base64,PREVIEW",
    coverImageDataUrl: "data:image/png;base64,COVER",
    itemIds: [1],
  });
  const list = deriveGarmentImageList(item, [outfit]);
  checkEq("长度 2（主图+outfit 引用）", list.length, 2);
  checkEq("套装条目 source = saved_outfit", list[1]?.source, "saved_outfit");
  checkEq("套装条目 renderKind = outfit", list[1]?.renderKind, "outfit");
  checkEq("outfitId 正确", list[1]?.outfitId, "outfit-1");
}

console.log("\n=== 关联套装条目：preview + cover 都缺失 → 仍保留套装引用 ===");
{
  const item = makeItem();
  const outfit = makeOutfit({
    previewImageDataUrl: undefined,
    coverImageDataUrl: undefined,
    itemIds: [1],
  });
  const list = deriveGarmentImageList(item, [outfit]);
  checkEq("长度 2（主图+outfit 引用）", list.length, 2);
  checkEq("第 1 张 = saved_outfit", list[1]?.source, "saved_outfit");
  checkEq("renderKind = outfit", list[1]?.renderKind, "outfit");
}

console.log("\n=== 关联套装条目：陈旧 preview 不影响派生（仍只派生引用） ===");
{
  const item = makeItem();
  const outfit = makeOutfit({
    id: "outfit-1",
    previewImageDataUrl: "data:image/png;base64,OLD_PREVIEW",
    coverImageDataUrl: "data:image/png;base64,OLD_COVER",
    itemIds: [1],
  });
  const list = deriveGarmentImageList(item, [outfit]);
  checkEq("长度 2（主图+outfit 引用）", list.length, 2);
  checkEq("套装条目不包含 preview URL", list[1]?.imageDataUrl, "");
  checkEq("套装条目 renderKind = outfit", list[1]?.renderKind, "outfit");
  checkEq("source = saved_outfit", list[1]?.source, "saved_outfit");
}

console.log("\n=== 两个不同套装使用相同静态 preview → 两条引用都保留 ===");
{
  const item = makeItem();
  const o1 = makeOutfit({ id: "o1", previewImageDataUrl: "data:image/png;base64,SAME", itemIds: [1] });
  const o2 = makeOutfit({ id: "o2", previewImageDataUrl: "data:image/png;base64,SAME", itemIds: [1] });
  const list = deriveGarmentImageList(item, [o1, o2]);
  checkEq("长度 3（主图+两个 outfit 引用）", list.length, 3);
  checkEq("[1] outfitId = o1", list[1]?.outfitId, "o1");
  checkEq("[2] outfitId = o2", list[2]?.outfitId, "o2");
}

console.log("\n=== 同一个 outfit.id 不重复加入 ===");
{
  const item = makeItem();
  const outfit = makeOutfit({ id: "outfit-1", previewImageDataUrl: "data:image/png;base64,X", itemIds: [1] });
  // same outfit appears twice in array
  const list = deriveGarmentImageList(item, [outfit, outfit]);
  checkEq("长度 2（主图+1 个 outfit）", list.length, 2);
}

console.log("\n=== SavedOutfit 排序：按 updatedAt 倒序 ===");
{
  const item = makeItem();
  const o1 = makeOutfit({
    id: "o1",
    updatedAt: "2026-06-01T00:00:00.000Z",
    itemIds: [1],
  });
  const o2 = makeOutfit({
    id: "o2",
    updatedAt: "2026-06-09T00:00:00.000Z",
    itemIds: [1],
  });
  const list = deriveGarmentImageList(item, [o1, o2]);
  checkEq("长度 3", list.length, 3);
  checkEq("第 1 张是 o2 (较新)", list[1]?.outfitId, "o2");
  checkEq("第 2 张是 o1 (较旧)", list[2]?.outfitId, "o1");
}

console.log("\n=== 不包含当前 item.id 的套装不加入 ===");
{
  const item = makeItem({ id: 1 });
  const outfit = makeOutfit({ itemIds: [2, 3] });
  const list = deriveGarmentImageList(item, [outfit]);
  checkEq("长度 1（只有主图）", list.length, 1);
}

console.log("\n=== 主图和手动灵感图继续按图片 URL 去重 ===");
{
  const item = makeItem({ imageDataUrl: "data:image/png;base64,MAIN" });
  const outfit = makeOutfit({
    previewImageDataUrl: "data:image/png;base64,MAIN", // 跟主图同 url（但 outfit 按 id 去重）
    itemIds: [1],
  });
  // 主图用图片 URL 去重, 但 outfit 按 id 去重, 所以 outfit 依然加入
  const list = deriveGarmentImageList(item, [outfit]);
  checkEq("长度 2（主图+outfit）", list.length, 2);
}

console.log("\n=== SavedOutfit 派生：item.id 缺失 → 不派生 ===");
{
  const item = makeItem({ id: undefined });
  const outfit = makeOutfit({ itemIds: [1] });
  const list = deriveGarmentImageList(item, [outfit]);
  checkEq("长度 1（item.id 缺失时不派生）", list.length, 1);
}

console.log("\n=== 去重：manual ref 与主图重复 → ref 不加入 ===");
{
  const item = makeItem({
    referenceOutfitImages: [
      makeRef({ id: "ref-1", imageDataUrl: "data:image/png;base64,MAIN" }),
    ],
  });
  const list = deriveGarmentImageList(item, []);
  checkEq("去重后长度 1", list.length, 1);
}

console.log("\n=== 容错：referenceOutfitImages 含空字符串/无效 url → 过滤 ===");
{
  const item = makeItem({
    referenceOutfitImages: [
      makeRef({ id: "ref-1", imageDataUrl: "" }),
      makeRef({ id: "ref-2", imageDataUrl: "not-a-url" }),
      makeRef({ id: "ref-3", imageDataUrl: "data:image/png;base64,VALID" }),
    ],
  });
  const list = deriveGarmentImageList(item, []);
  checkEq("只保留 1 个有效 ref", list.length, 2);
  checkEq("ref-3 保留", list[1]?.refId, "ref-3");
}

console.log("\n=== 容错：item 缺 createdAt → 用 now() ===");
{
  const item = makeItem({ createdAt: "" });
  const list = deriveGarmentImageList(item, []);
  check("createdAt fallback 不空", !!list[0]?.createdAt);
}

console.log("\n=== 容错：referenceOutfitImages 不是数组（老数据） → 当 [] 处理 ===");
{
  const item = makeItem();
  (item as unknown as { referenceOutfitImages: unknown }).referenceOutfitImages = "garbage" as unknown;
  const list = deriveGarmentImageList(item, []);
  checkEq("非法 referenceOutfitImages → []", list.length, 1);
}

console.log("\n=== 工具函数 isMainImageEntry / isReferenceOutfitEntry ===");
{
  const mainEntry: GarmentImageEntry = { imageDataUrl: "x", cardImageDataUrl: "x", displayImageDataUrl: "x", source: "main", renderKind: "image", createdAt: "" };
  const refEntry: GarmentImageEntry = { imageDataUrl: "x", cardImageDataUrl: "x", displayImageDataUrl: "x", source: "reference_outfit", renderKind: "image", createdAt: "" };
  const outfitEntry: GarmentImageEntry = { imageDataUrl: "", cardImageDataUrl: "", displayImageDataUrl: "", source: "saved_outfit", renderKind: "outfit", createdAt: "" };
  check("isMainImageEntry(main) === true", isMainImageEntry(mainEntry));
  check("isMainImageEntry(ref) === false", !isMainImageEntry(refEntry));
  check("isMainImageEntry(outfit) === false", !isMainImageEntry(outfitEntry));
  check("isMainImageEntry(null) === false", !isMainImageEntry(null));
  check("isReferenceOutfitEntry(ref) === true", isReferenceOutfitEntry(refEntry));
  check("isReferenceOutfitEntry(main) === false", !isReferenceOutfitEntry(mainEntry));
  check("isReferenceOutfitEntry(outfit) === false", !isReferenceOutfitEntry(outfitEntry));
}

console.log("\n=== v0.9.32-dev: reference_outfit 填充 sourceImageDataUrl + cropBox ===");
{
  const cropBox = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
  const item = makeItem({
    referenceOutfitImages: [
      makeRef({
        id: "ref-crop",
        imageDataUrl: "data:image/png;base64,CROPPED",
        sourceImageDataUrl: "data:image/png;base64,ORIGINAL",
        cropBox,
      }),
    ],
  });
  const list = deriveGarmentImageList(item, []);
  checkEq("长度 2", list.length, 2);
  checkEq("ref entry sourceImageDataUrl 保留", list[1]?.sourceImageDataUrl, "data:image/png;base64,ORIGINAL");
  checkEq("ref entry cropBox 保留", list[1]?.cropBox, cropBox);
}

console.log("\n=== https URL 也允许 ===");
{
  const item = makeItem({ imageDataUrl: "https://example.com/main.jpg" });
  const list = deriveGarmentImageList(item, []);
  checkEq("长度 1", list.length, 1);
  checkEq("https 主图通过", list[0]?.imageDataUrl, "https://example.com/main.jpg");
}

console.log("\n=== 完整场景：主图 + 1 manual ref + 2 outfit ===");
{
  const item = makeItem({
    referenceOutfitImages: [
      makeRef({ id: "ref-A", imageDataUrl: "data:image/png;base64,A", createdAt: "2026-06-03T00:00:00.000Z" }),
    ],
  });
  const o1 = makeOutfit({
    id: "o1",
    previewImageDataUrl: "data:image/png;base64,B",
    updatedAt: "2026-06-05T00:00:00.000Z",
  });
  const o2 = makeOutfit({
    id: "o2",
    previewImageDataUrl: "data:image/png;base64,A",
    updatedAt: "2026-06-09T00:00:00.000Z",
  });
  const list = deriveGarmentImageList(item, [o1, o2]);
  // 期望: MAIN(0,image) + ref-A(1,image) + o1(2,outfit) + o2(3,outfit) (outfit 按 id 去重,不按 URL 去重)
  checkEq("长度 4（主图+ref+2 outfit）", list.length, 4);
  checkEq("[0]=main image", list[0]?.source, "main");
  checkEq("[1]=ref-A image", list[1]?.refId, "ref-A");
  checkEq("[2]=o1 outfit", list[2]?.source, "saved_outfit");
  checkEq("[2] renderKind=outfit", list[2]?.renderKind, "outfit");
  checkEq("[3]=o2 outfit", list[3]?.source, "saved_outfit");
}

// ------------------------------------------------------------
console.log(`\n=== 总计: ${pass} pass / ${fail} fail ===\n`);
if (fail > 0) {
  console.log("失败项：");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
