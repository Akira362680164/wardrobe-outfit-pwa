// src/lib/wishlist-conversion.ts
// v0.9.49-dev 种草 2.0: WishlistItem → WardrobeItem 转换与撤销购买。

import type { SavedOutfit, WardrobeItem, WardrobeItemDraft, WishlistItem } from "@/lib/types";
import { emptyColorInfo } from "@/lib/color-fields";

function getLocalDateKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ------------------------------------------------------------------ */
/*  WishlistItem → WardrobeItemLike 虚拟衣物适配                        */
/* ------------------------------------------------------------------ */

// v0.9.49-dev auto-fix: formality/warmth 改为可选 (Override), 让 wishlistToVirtualWardrobeItem
// 在未填字段时返回 undefined, scoreStyleCompatibility 的 typeof number 检查会跳过,
// 避免"所有未填形式化度 = 中性 3"被滥用为 +2 分污染。
export type WardrobeItemLike = Pick<
  WardrobeItem,
  | "name"
  | "mainImage"
  | "category"
  | "subcategory"
  | "colors"
  | "seasons"
  | "styles"
  | "temperatureRange"
  | "material"
  | "fitGender"
  | "fitNotes"
  | "status"
  | "locationId"
  | "notes"
  | "createdAt"
  | "updatedAt"
> & {
  formality?: number;
  warmth?: number;
  id?: number;
  sourceWishlistId?: string;
};

/* ------------------------------------------------------------------ */
/*  已买状态统一判断                                                     */
/* ------------------------------------------------------------------ */

export interface WishlistPurchasedState {
  purchased: boolean;
  convertedItemId?: number;
  convertedItemDeletedAt?: string;
  legacyConvertedAtOnly: boolean;
}

export function getWishlistPurchasedState(wishlist: WishlistItem): WishlistPurchasedState {
  if (typeof wishlist.convertedItemId === "number") {
    return {
      purchased: true,
      convertedItemId: wishlist.convertedItemId,
      convertedItemDeletedAt: wishlist.convertedItemDeletedAt,
      legacyConvertedAtOnly: false,
    };
  }
  if (wishlist.convertedAt) {
    return { purchased: true, convertedItemDeletedAt: wishlist.convertedItemDeletedAt, legacyConvertedAtOnly: true };
  }
  // status=rejected：除非存在 convertedItemId（已被上面捕获），否则不算已买
  return { purchased: false, legacyConvertedAtOnly: false };
}

export function isWishlistPurchased(wishlist: WishlistItem): boolean {
  // 统一判断：优先 convertedItemId，兼容历史 convertedAt
  if (typeof wishlist.convertedItemId === "number") return true;
  if (wishlist.convertedAt) return true;
  // status=archived 但无 convertedItemId/convertedAt → 普通归档，不是已买
  // status=rejected → 不是已买
  return false;
}

export function wishlistToVirtualWardrobeItem(
  wishlist: WishlistItem,
  fallbackLocationId: string,
): WardrobeItemLike {
  const now = new Date().toISOString();

  return {
    id: undefined,
    sourceWishlistId: wishlist.id,

    name: wishlist.name?.trim() || "未命名种草单品",

    mainImage: wishlist.mainImage,

    category: wishlist.category ?? "tops",
    subcategory: wishlist.subcategory,

    colors: wishlist.colors ?? emptyColorInfo(),

    seasons: wishlist.seasons?.length ? wishlist.seasons : ["all"],
    styles: wishlist.styles?.length ? wishlist.styles : ["casual"],

    temperatureRange: wishlist.temperatureRange,
    // v0.9.49-dev auto-fix: 之前 fallback 3 让所有未填 formality/warmth 的种草单品都被
    // 评分函数判为"中性",与衣橱 1-5 的所有单品"接近" +2 分,污染 scoreStyleCompatibility 分数。
    // 改为 undefined, 评分函数 typeof number 检查会跳过, 与 garment-detail-pairing 行为对齐。
    formality: typeof wishlist.formality === "number" ? wishlist.formality : undefined,
    warmth: typeof wishlist.warmth === "number" ? wishlist.warmth : undefined,

    material: wishlist.material,
    fitGender: wishlist.fitGender ?? "unknown",
    fitNotes: wishlist.fitNotes,

    status: "active",
    locationId: fallbackLocationId,
    notes: wishlist.notes,

    createdAt: wishlist.createdAt || now,
    updatedAt: wishlist.updatedAt || now,
  };
}

/* ------------------------------------------------------------------ */
/*  WishlistItem → WardrobeItem 正式转换                                 */
/* ------------------------------------------------------------------ */

export function wishlistToWardrobeItem(input: {
  wishlistItem: WishlistItem;
  locationId: string;
  now: string;
}): Omit<WardrobeItemDraft, "id"> {
  const { wishlistItem, locationId, now } = input;

  return {
    name: wishlistItem.name.trim(),

    mainImage: wishlistItem.mainImage,

    category: wishlistItem.category ?? "tops",
    subcategory: wishlistItem.subcategory,

    colors: wishlistItem.colors ?? emptyColorInfo(),

    seasons: wishlistItem.seasons?.length ? wishlistItem.seasons : ["all"],
    styles: wishlistItem.styles?.length ? wishlistItem.styles : ["casual"],

    temperatureRange: wishlistItem.temperatureRange,
    // v2: formality/warmth 为可选, 不再强制 fallback 3
    formality: typeof wishlistItem.formality === "number" ? wishlistItem.formality : undefined,
    warmth: typeof wishlistItem.warmth === "number" ? wishlistItem.warmth : undefined,

    material: wishlistItem.material,
    price: wishlistItem.price,
    productUrl: wishlistItem.productUrl,
    purchaseDate: getLocalDateKey(),

    fitGender: wishlistItem.fitGender ?? "unknown",
    fitNotes: wishlistItem.fitNotes,

    locationId,
    status: "active",
    notes: wishlistItem.notes,

    wornDates: [],
    createdAt: now,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/*  撤销购买风险评估                                                     */
/* ------------------------------------------------------------------ */

export interface UndoPurchaseRisk {
  inOutfitCount: number;
  wornDateCount: number;
  itemWasEdited: boolean;
}

export function getUndoPurchaseRisk(input: {
  convertedItemId: number;
  wardrobeItems: WardrobeItem[];
  outfits: SavedOutfit[];
  wishlistItem: WishlistItem;
}): UndoPurchaseRisk {
  const item = input.wardrobeItems.find((i) => i.id === input.convertedItemId);
  const inOutfitCount = input.outfits.filter((o) =>
    Array.isArray(o.itemIds) && o.itemIds.includes(input.convertedItemId),
  ).length;

  const wornDateCount = item?.wornDates?.length ?? 0;

  const itemUpdatedMs = item?.updatedAt ? new Date(item.updatedAt).getTime() : 0;
  const convertedMs = input.wishlistItem.convertedAt
    ? new Date(input.wishlistItem.convertedAt).getTime()
    : 0;
  const itemWasEdited =
    itemUpdatedMs > 0 && convertedMs > 0 && itemUpdatedMs - convertedMs > 1000;

  return { inOutfitCount, wornDateCount, itemWasEdited };
}
