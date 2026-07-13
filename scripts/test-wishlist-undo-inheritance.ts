import assert from "node:assert/strict";
import { inheritGarmentFieldsToWishlist } from "../services/wardrobe-api/src/workspace/wishlist-inheritance.ts";

const wishlist = {
  name: "原始名称",
  category: "tops",
  colors: { mode: "single", primary: "black" },
  price: 299,
  productUrl: "https://shop.example/item",
  status: "purchased",
  aiAssessment: { verdict: "buy" },
  imageAssetId: "shared-asset",
};
const garment = {
  name: "衣橱修改名称",
  category: "bottoms",
  colors: { mode: "single", primary: "navy" },
  notes: "穿着偏大，已记录",
  locationId: "closet",
  status: "laundry",
  wornDates: ["2026-07-12"],
};

const restored = inheritGarmentFieldsToWishlist(wishlist, garment);
assert.equal(restored.name, "衣橱修改名称");
assert.equal(restored.category, "bottoms");
assert.deepEqual(restored.colors, garment.colors);
assert.equal(restored.notes, garment.notes);
assert.equal(restored.price, wishlist.price, "种草价格语义不能被衣橱成本覆盖");
assert.equal(restored.productUrl, wishlist.productUrl);
assert.equal(restored.status, wishlist.status);
assert.deepEqual(restored.aiAssessment, wishlist.aiAssessment);
assert.equal("locationId" in restored, false, "衣橱位置不能泄露回种草实体");
assert.equal("wornDates" in restored, false, "穿着历史不能泄露回种草实体");
assert.equal(restored.imageAssetId, wishlist.imageAssetId, "共享图片引用保持原样");

console.log("✓ 种草撤销购买会继承衣橱侧共用属性，同时保留种草语义字段");
