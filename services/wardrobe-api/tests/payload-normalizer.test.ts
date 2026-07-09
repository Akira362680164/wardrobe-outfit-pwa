import { describe, expect, it } from "vitest";

import { normalizeGarmentPayload, normalizeWishlistPayload } from "../src/workspace/payload-normalizer.js";

describe("workspace payload normalizer", () => {
  it("normalizes legacy garment category, colors and enum lists", () => {
    expect(normalizeGarmentPayload({
      name: "旧外套",
      category: "outerwear",
      subcategory: "shirt",
      colors: { mode: "main_with_accent", primary: "丹宁蓝", accents: ["白色", "未知色", "白"] },
      seasons: ["winter", "invalid", "winter"],
      styles: ["casual", "invalid", "casual"],
      customField: "kept",
    })).toEqual({
      name: "旧外套",
      category: "tops",
      subcategory: "shirt",
      colors: { mode: "main_with_accent", primary: "牛仔蓝", accents: ["白"] },
      seasons: ["winter"],
      styles: ["casual"],
      customField: "kept",
      needsReview: true,
    });
  });

  it("falls back safely and removes a cross-category subcategory", () => {
    expect(normalizeGarmentPayload({
      category: "unknown",
      subcategory: "jeans",
      colors: { mode: "single", primary: "不存在颜色" },
      seasons: "summer",
      styles: null,
    })).toEqual({
      category: "tops",
      colors: { mode: "single", primary: "未标注" },
      seasons: [],
      styles: [],
      needsReview: true,
    });
  });

  it("uses the same rules for wishlist payloads without clearing an existing review flag", () => {
    expect(normalizeWishlistPayload({
      category: "bottom",
      subcategory: "jeans",
      colors: { mode: "multicolor", primaries: ["黑色", "白色", "黑"] },
      seasons: ["all"],
      styles: ["commute"],
      needsReview: true,
    })).toEqual({
      category: "pants",
      subcategory: "jeans",
      colors: { mode: "multicolor", primaries: ["黑", "白"] },
      seasons: ["all"],
      styles: ["commute"],
      needsReview: true,
    });
  });
});
