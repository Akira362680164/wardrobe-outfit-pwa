import { strict as assert } from "node:assert";
import {
  calculateDraftReviewSummary,
  createIntakeField,
  mergeIntakeFields,
} from "../src/lib/intake-draft";
import {
  buildLocalGarmentDraft,
  buildLocalOutfitDraftFromItems,
  buildLocalWishlistDraft,
} from "../src/lib/intake-local-draft";
import {
  buildIntakeRecognitionPrompt,
  buildIntakeRecognitionSystemPrompt,
  parseIntakeRecognitionJson,
} from "../src/lib/intake-ai-prompt";
import {
  garmentDraftToWardrobeItem,
  isIntakeDraftReadyToSave,
  outfitDraftToSavedOutfit,
  wishlistDraftToWishlistItem,
} from "../src/lib/intake-save-adapters";
import { buildColorInfo, getAccentColors, getPrimaryColors } from "../src/lib/color-fields";
import type { WardrobeItem } from "../src/lib/types";

const now = "2026-06-11T08:00:00.000Z";

const user = createIntakeField("用户白", "user", "high", { needsReview: false });
const aiHigh = createIntakeField("AI白", "ai", "high", { needsReview: false });
const localHigh = createIntakeField("本地白", "local", "high", { needsReview: false });
const aiLow = createIntakeField("AI米白", "ai", "low", { needsReview: true });
const localLow = createIntakeField("本地灰", "local", "low", { needsReview: true });

assert.equal(mergeIntakeFields([localHigh, aiHigh])?.value, "AI白", "AI 高可信应高于本地高可信");
assert.equal(mergeIntakeFields([aiHigh, user])?.value, "用户白", "用户手动字段不能被 AI 覆盖");
assert.equal(mergeIntakeFields([localLow, aiLow], { fieldKey: "colors" })?.value, "AI米白", "本地颜色低可信时 AI 可补色");
assert.equal(mergeIntakeFields([localLow, aiLow], { fieldKey: "colors" })?.needsReview, true, "AI 补色必须保留确认标记");

const garmentDraft = buildLocalGarmentDraft({
  imageDataUrl: "data:image/png;base64,aaa",
  croppedImageDataUrl: "data:image/png;base64,cropped",
  cropBox: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
  thumbnailDataUrl: "data:image/png;base64,thumb",
  colors: buildColorInfo("single", ["白"]),
  transparentBackgroundStatus: "failed",
  nameGuess: "白衬衫",
  categoryGuess: "tops",
  locationId: "home",
  now,
});
const summary = calculateDraftReviewSummary(garmentDraft);
assert.equal(summary.transparentBackgroundFailed, true, "透明底失败要被记录");
assert.equal(summary.canSave, true, "透明底失败不阻塞保存");
assert.equal(isIntakeDraftReadyToSave(garmentDraft), true, "可保存判断应复用草稿 review summary");

const wardrobeItem = garmentDraftToWardrobeItem(garmentDraft, { now });
assert.equal(wardrobeItem.imageDataUrl, garmentDraft.imageDataUrl, "正式单品必须保存完整原图");
assert.notEqual(wardrobeItem.imageDataUrl, garmentDraft.croppedImageDataUrl, "裁切临时图不能冒充完整原图");
assert.deepEqual(wardrobeItem.cropBox, garmentDraft.cropBox, "裁切框必须相对于完整原图保存");
assert.equal((wardrobeItem as unknown as Record<string, unknown>).sourceImageDataUrl, undefined, "正式单品不再保存第二份主图");
assert.equal(wardrobeItem.thumbnailDataUrl, "data:image/png;base64,thumb", "草稿缩略图应进入正式衣物");
assert.equal(wardrobeItem.cropRevision, 1, "已裁切单品默认 cropRevision=1");
assert.equal(wardrobeItem.thumbnailCropRevision, 1, "已裁切单品 thumbnailCropRevision 对齐 cropRevision");
assert.equal(wardrobeItem.needsReview, true, "含 review/info 字段的草稿入库后应保留待确认");
assert.throws(
  () => garmentDraftToWardrobeItem({ ...garmentDraft, imageDataUrl: garmentDraft.croppedImageDataUrl }),
  /GARMENT_ORIGINAL_IMAGE_INVALID/,
  "非全图裁切时必须拒绝用裁切图冒充原图",
);

const colorEditedGarment = garmentDraftToWardrobeItem({
  ...garmentDraft,
  colors: { ...garmentDraft.colors, value: buildColorInfo("main_with_accent", ["蓝"], ["银"]), source: "user", needsReview: false },
}, { now });
assert.deepEqual(getPrimaryColors(colorEditedGarment.colors), ["蓝"], "保存衣物时 colors 应跟随用户校对后的主色");
assert.deepEqual(getAccentColors(colorEditedGarment.colors), ["银"], "保存衣物时 colors 应跟随用户校对后的辅色");

const uncroppedWardrobeItem = garmentDraftToWardrobeItem({
  ...garmentDraft,
  croppedImageDataUrl: undefined,
  cropBox: undefined,
  cropRevision: undefined,
  thumbnailCropRevision: undefined,
}, { now });
assert.equal(uncroppedWardrobeItem.cropRevision, 0, "未裁切单品 cropRevision=0");
assert.equal(uncroppedWardrobeItem.thumbnailCropRevision, 0, "未裁切单品 thumbnailCropRevision=0");

const wishlistDraft = buildLocalWishlistDraft({
  imageDataUrl: "data:image/png;base64,bbb",
  imageKind: "product_screenshot",
  now,
});
const wishlistPrompt = buildIntakeRecognitionPrompt({ draft: wishlistDraft, visibleTextHint: "¥399" });
assert.ok(wishlistPrompt.includes("买前评估") && wishlistPrompt.includes("不做"), "种草录入 prompt 必须声明不做买前评估");
assert.ok(wishlistPrompt.includes("不能猜"), "种草录入 prompt 必须禁止编造商品字段");

const wishlistItem = wishlistDraftToWishlistItem(wishlistDraft, { id: "wishlist-intake-test", now });
assert.equal(wishlistItem.status, "interested", "种草草稿保存后应保持 interested");
assert.equal(wishlistItem.price, undefined, "未填写时种草录入不写入价格");
assert.equal((wishlistItem as unknown as Record<string, unknown>).currency, undefined, "新版种草录入不写入币种");
assert.equal(wishlistItem.productUrl, undefined, "未填写时种草录入不写入链接");
assert.equal((wishlistItem as unknown as Record<string, unknown>).brand, undefined, "新建种草不写入品牌");
assert.equal((wishlistItem as unknown as Record<string, unknown>).shopName, undefined, "新建种草不写入店铺");
assert.equal(wishlistItem.aiAssessment, undefined, "保存种草录入草稿时不能自动写入买前评估");

const pricedWishlistItem = wishlistDraftToWishlistItem({
  ...wishlistDraft,
  price: createIntakeField("¥399", "user", "high", { needsReview: false }),
  productUrl: createIntakeField("https://example.com/item", "user", "high", { needsReview: false }),
}, { id: "wishlist-priced-test", now });
assert.equal(pricedWishlistItem.price, 399, "用户填写价格后种草录入应写入价格");
assert.equal(pricedWishlistItem.productUrl, "https://example.com/item", "用户填写链接后种草录入应写入链接");

const colorEditedWishlist = wishlistDraftToWishlistItem({
  ...wishlistDraft,
  colors: { ...wishlistDraft.colors, value: buildColorInfo("main_with_accent", ["绿"], ["黄"]), source: "user", needsReview: false },
}, { id: "wishlist-color-test", now });
assert.deepEqual(getPrimaryColors(colorEditedWishlist.colors), ["绿"], "保存种草时 colors 应跟随用户校对后的主色");
assert.deepEqual(getAccentColors(colorEditedWishlist.colors), ["黄"], "保存种草时 colors 应跟随用户校对后的辅色");

const items: WardrobeItem[] = [
  {
    id: 1,
    name: "白衬衫",
    imageDataUrl: "data:image/png;base64,1",
    category: "tops",
    colors: buildColorInfo("single", ["白"]),
    seasons: ["spring", "autumn"],
    styles: ["commute"],
    formality: 4,
    warmth: 2,
    locationId: "home",
    status: "active",
    wornDates: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 2,
    name: "黑西裤",
    imageDataUrl: "data:image/png;base64,2",
    category: "pants",
    colors: buildColorInfo("single", ["黑"]),
    seasons: ["spring", "autumn"],
    styles: ["commute"],
    formality: 4,
    warmth: 2,
    locationId: "home",
    status: "active",
    wornDates: [],
    createdAt: now,
    updatedAt: now,
  },
];
const outfitDraft = buildLocalOutfitDraftFromItems({ items, unknownItemNotes: ["图中可能还有包"], now });
assert.deepEqual(outfitDraft.itemIds.value, [1, 2], "套装草稿应聚合真实 itemIds");
assert.ok(outfitDraft.unknownItemNotes.needsReview, "未知单品不能静默创建，必须确认");
assert.ok(outfitDraft.temperatureRange.needsReview, "聚合字段需要用户校对");

const savedOutfit = outfitDraftToSavedOutfit(outfitDraft, { id: "outfit-intake-test", now });
assert.deepEqual(savedOutfit.itemIds, [1, 2], "套装保存只能引用真实存在的 itemIds");
assert.ok(savedOutfit.notes?.includes("未知单品待处理"), "未知单品只能作为待处理备注保留，不能静默创建");
assert.equal(savedOutfit.source, "manual", "从已有衣物创建套装默认来源应为 manual");

const savedResolvedOutfit = outfitDraftToSavedOutfit(outfitDraft, {
  id: "outfit-linked-test",
  now,
  itemIds: [1, 2, 2, 3],
  unknownItemNotes: ["已忽略未知单品参考：黑色手包"],
});
assert.deepEqual(savedResolvedOutfit.itemIds, [1, 2, 3], "未知单品关联已有后应合并进套装 itemIds 并去重");
assert.ok(savedResolvedOutfit.notes?.includes("已忽略未知单品参考"), "忽略的未知单品只应作为参考备注保留");

const outfitPhotoDraft = buildLocalOutfitDraftFromItems({
  items,
  sourceImageDataUrl: "data:image/png;base64,outfit-photo",
  thumbnailDataUrl: "data:image/png;base64,outfit-thumb",
  source: "capture",
  now,
});
const savedPhotoOutfit = outfitDraftToSavedOutfit(outfitPhotoDraft, { id: "outfit-photo-test", now });
assert.equal(savedPhotoOutfit.source, "capture", "从套装图录入的套装来源应为 capture");
assert.equal(savedPhotoOutfit.thumbnailDataUrl, "data:image/png;base64,outfit-thumb", "套装图缩略图应随草稿保存");

const parsed = parseIntakeRecognitionJson(JSON.stringify({
  mode: "intake_recognition",
  kind: "wishlist",
  fields: {},
  warnings: [],
  shouldRunBuyBeforeAssessment: false,
}));
assert.equal(parsed.shouldRunBuyBeforeAssessment, false, "录入识别结果不能触发买前评估");
assert.ok(buildIntakeRecognitionSystemPrompt().includes("严格 JSON"), "system prompt 要求严格 JSON");

console.log("intake draft tests passed");

/* ------------------------------------------------------------------ */
/*  P0 收口: 衣橱 / 种草两步统一 + 新版种草字段契约 + AI 识别加载态 */
/* ------------------------------------------------------------------ */
import { readFileSync } from "node:fs";
import { join as joinPath } from "node:path";

const garmentFlowSrc = readFileSync(joinPath(__dirname, "..", "src/components/garment-intake-flow.tsx"), "utf8");

// Test 1: AI 识别与图片编辑是过渡态，步骤条只展示两个用户任务
const garmentStepsMatch = /GARMENT_INTAKE_STEPS:\s*IntakeFlowStep\[\]\s*=\s*\[([\s\S]*?)\]/.exec(garmentFlowSrc);
const garmentStepLabels = garmentStepsMatch ? [...garmentStepsMatch[1].matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]) : [];
assert.deepEqual(garmentStepLabels, ["选择照片", "确认信息"], "GARMENT_INTAKE_STEPS 必须保持两步任务文案");

// Test 2-4: garment-intake-flow.tsx 不含旧步骤文案
assert.ok(!/选择来源/.test(garmentFlowSrc), "garment-intake-flow.tsx 不应再出现「选择来源」");
assert.ok(!/生成草稿/.test(garmentFlowSrc), "garment-intake-flow.tsx 不应再出现「生成草稿」");
assert.ok(!/确认保存/.test(garmentFlowSrc), "garment-intake-flow.tsx 不应再出现「确认保存」");

// Test 5: 正式种草录入的价格/链接位于 GarmentIntakeFlow（wishlist-intake-flow.tsx 已删 dead code）
assert.ok(/productUrl/.test(garmentFlowSrc) && /flowKind === "wishlist"\s*\?\s*"链接"/.test(garmentFlowSrc), "GarmentIntakeFlow 应包含种草链接字段");

// Test 6: GarmentIntakeFlow 包含「价格」
assert.ok(/draft\.price/.test(garmentFlowSrc) && /flowKind === "wishlist"\s*\?\s*"价格"/.test(garmentFlowSrc), "GarmentIntakeFlow 应包含种草价格字段");

// Test 7: wishlistDraftToWishlistItem 写入用户填写的 productUrl
const adapterSrc = readFileSync(joinPath(__dirname, "..", "src/lib/intake-save-adapters.ts"), "utf8");
assert.ok(/productUrl:\s*optionalText\(draft\.productUrl\)/.test(adapterSrc), "wishlistDraftToWishlistItem 应写入 draft.productUrl");

// Test 8: wishlistDraftToWishlistItem 写入用户填写的 price
assert.ok(/price:\s*optionalPrice\(draft\.price\)/.test(adapterSrc), "wishlistDraftToWishlistItem 应写入 draft.price");

// Test 9: garment-intake-flow.tsx 无 AI loading 状态（单品直接处理无需中间态）
assert.ok(!/正在识别衣物信息/.test(garmentFlowSrc), "garment-intake-flow.tsx 不应包含「正在识别衣物信息」（单品无AI中间态）");

console.log("intake draft tests passed");
