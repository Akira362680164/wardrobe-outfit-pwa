import { strict as assert } from "node:assert";
import { buildLocalWishlistDraft } from "../src/lib/intake-local-draft";
import { wishlistDraftToWishlistItem } from "../src/lib/intake-save-adapters";
import { wishlistItemFromShoppingCandidate } from "../src/lib/wishlist-intake-from-ai";
import { buildDetailMetaText } from "../src/components/detail-shell";
import { buildColorInfo } from "../src/lib/color-fields";
import type { ShoppingAssessmentCandidate } from "../src/lib/types";

const now = "2026-06-12T12:00:00.000Z";

const localDraft = buildLocalWishlistDraft({
  imageDataUrl: "data:image/png;base64,wishlist",
  imageKind: "product_screenshot",
  productNameVisible: "米白短袖衬衫",
  now,
});

const localItem = wishlistDraftToWishlistItem(localDraft, { id: "wishlist-fields-local", now });
assert.equal((localItem as unknown as Record<string, unknown>).brand, undefined, "新建种草记录不写入品牌");
assert.equal((localItem as unknown as Record<string, unknown>).shopName, undefined, "新建种草记录不写入店铺");
assert.equal(localItem.price, undefined, "未填写时种草录入不写入价格");
assert.equal(localItem.productUrl, undefined, "未填写时种草录入不写入链接");

const pricedLocalItem = wishlistDraftToWishlistItem({
  ...localDraft,
  price: { value: "299", source: "user", confidence: "high", needsReview: false },
  productUrl: { value: "https://example.com/item", source: "user", confidence: "high", needsReview: false },
}, { id: "wishlist-fields-priced", now });
assert.equal(pricedLocalItem.price, 299, "用户填写价格后应写入种草记录");
assert.equal(pricedLocalItem.productUrl, "https://example.com/item", "用户填写链接后应写入种草记录");

const candidate: ShoppingAssessmentCandidate = {
  tempId: "candidate-1",
  name: "蓝色衬衫",
  category: "tops",
  colors: buildColorInfo("single", ["蓝"]),
  seasonGuess: ["spring"],
  styles: ["commute"],
  formality: 3,
  warmth: 2,
  visualFeatures: ["衬衫"],
  confidence: 0.8,
  needsReview: false,
  price: 299,
};

const aiItem = wishlistItemFromShoppingCandidate({
  candidate,
  sourceImageDataUrl: "data:image/png;base64,source",
  displayImageDataUrl: "data:image/png;base64,display",
  now,
});

assert.equal((aiItem as unknown as Record<string, unknown>).brand, undefined, "AI 候选转种草记录不写入品牌");
assert.equal((aiItem as unknown as Record<string, unknown>).shopName, undefined, "AI 候选转种草记录不写入店铺");

const metaText = buildDetailMetaText(["种草中", "上装", "春夏", "通勤", "日常"]);
assert.ok(!metaText.includes("品牌"));
assert.ok(!metaText.includes("店铺"));

assert.ok(metaText.includes("通勤"), "种草详情摘要仍展示穿搭属性");

console.log("wishlist field reduction tests passed");
