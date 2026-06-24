// src/lib/wishlist-conversion.ts
// v0.9.49-dev 种草 2.0: WishlistItem → WardrobeItem 转换与撤销购买。

import type { SavedOutfit, WardrobeItem, WishlistItem } from "@/lib/types";
import { getWardrobeDb } from "@/lib/db";
import { deleteWardrobeItemsWithCascade } from "@/lib/wardrobe-cascade-delete";
import { emptyColorInfo } from "@/lib/color-fields";

type WardrobeDb = ReturnType<typeof getWardrobeDb>;

/* ------------------------------------------------------------------ */
/*  WishlistItem → WardrobeItemLike 虚拟衣物适配                        */
/* ------------------------------------------------------------------ */

// v0.9.49-dev auto-fix: formality/warmth 改为可选 (Override), 让 wishlistToVirtualWardrobeItem
// 在未填字段时返回 undefined, scoreStyleCompatibility 的 typeof number 检查会跳过,
// 避免"所有未填形式化度 = 中性 3"被滥用为 +2 分污染。
export type WardrobeItemLike = Pick<
  WardrobeItem,
  | "name"
  | "imageDataUrl"
  | "sourceImageDataUrl"
  | "thumbnailDataUrl"
  | "cropBox"
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

    imageDataUrl: wishlist.imageDataUrl || "",
    sourceImageDataUrl: wishlist.sourceImageDataUrl,
    thumbnailDataUrl: wishlist.thumbnailDataUrl,
    cropBox: wishlist.cropBox,

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

function getLocalDateKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function wishlistToWardrobeItem(input: {
  wishlistItem: WishlistItem;
  locationId: string;
  now: string;
}): Omit<WardrobeItem, "id"> {
  const { wishlistItem, locationId, now } = input;

  return {
    name: wishlistItem.name.trim(),

    imageDataUrl: wishlistItem.imageDataUrl || "",
    sourceImageDataUrl: wishlistItem.sourceImageDataUrl,
    thumbnailDataUrl: wishlistItem.thumbnailDataUrl,
    cropBox: wishlistItem.cropBox,

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
/*  转入衣橱                                                            */
/* ------------------------------------------------------------------ */

export async function convertWishlistItemToWardrobe(input: {
  wishlistItem: WishlistItem;
  locationId: string;
  db: WardrobeDb;
}): Promise<number> {
  const now = new Date().toISOString();

  const wardrobeItem = wishlistToWardrobeItem({
    wishlistItem: input.wishlistItem,
    locationId: input.locationId,
    now,
  });

  // v0.9.49-dev auto-fix: 之前两步独立 await, 移动端断网/后台切走/dexie 抛错会留半态
  // (衣橱有新衣物但种草仍为 interested)。改用事务保证原子性, 与 undoWishlistPurchase 对称。
  let newItemId: number | undefined;
  await input.db.transaction("rw", input.db.items, input.db.wishlistItems, async () => {
    newItemId = await input.db.items.add(wardrobeItem as Omit<WardrobeItem, "id">);
    await input.db.wishlistItems.update(input.wishlistItem.id, {
      status: "archived",
      convertedItemId: newItemId,
      convertedAt: now,
      updatedAt: now,
    });
  });

  if (newItemId == null) {
    throw new Error("convertWishlistItemToWardrobe: 事务未返回 newItemId");
  }
  return newItemId;
}

/* ------------------------------------------------------------------ */
/*  撤销购买                                                            */
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

  // v0.9.49-dev auto-fix: ISO8601 字符串字典序与时间顺序一致, 但显式 getTime() 比较更稳。
  // 同时加 1s 阈值防 millisecond 内多次写入被误判为 "已编辑"。
  const itemUpdatedMs = item?.updatedAt ? new Date(item.updatedAt).getTime() : 0;
  const convertedMs = input.wishlistItem.convertedAt
    ? new Date(input.wishlistItem.convertedAt).getTime()
    : 0;
  const itemWasEdited =
    itemUpdatedMs > 0 && convertedMs > 0 && itemUpdatedMs - convertedMs > 1000;

  return { inOutfitCount, wornDateCount, itemWasEdited };
}

export async function undoWishlistPurchase(input: {
  wishlistItem: WishlistItem;
  db: WardrobeDb;
}): Promise<void> {
  const now = new Date().toISOString();
  const convertedItemId = input.wishlistItem.convertedItemId;

  if (input.wishlistItem.convertedItemDeletedAt) {
    throw new Error("undoWishlistPurchase: 关联衣橱单品已删除");
  }

  if (typeof convertedItemId === "number") {
    const existing = await input.db.items.get(convertedItemId);
    if (!existing) {
      throw new Error("undoWishlistPurchase: 关联衣橱单品不存在");
    }
    if (existing) {
      // 删除失败必须向上抛错，让 UI 显示「撤销购买失败」并保留 convertedItemId/convertedAt。
      await deleteWardrobeItemsWithCascade({
        db: input.db,
        itemIds: [convertedItemId],
        source: "wishlist_undo_purchase",
      });
      // 删除后再次校验：如果 cascade 报告成功但实际单品仍存在，必须抛错。
      const stillThere = await input.db.items.get(convertedItemId);
      if (stillThere) {
        throw new Error("undoWishlistPurchase: 删除后衣橱单品仍存在");
      }
    }
  }

  await input.db.transaction("rw", input.db.wishlistItems, async () => {
    await input.db.wishlistItems.update(input.wishlistItem.id, {
      status: "interested",
      convertedItemId: undefined,
      convertedAt: undefined,
      convertedItemDeletedAt: undefined,
      updatedAt: now,
    });
  });
}
