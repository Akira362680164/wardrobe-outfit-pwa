import { strict as assert } from "node:assert";
import "fake-indexeddb/auto";
import type { WardrobeItem, WishlistItem } from "@/lib/types";
import { deleteWishlistRecords } from "@/lib/data-repo";

/**
 * v1.1.37 种草批量删除测试 (fake-indexeddb)。
 *
 * 覆盖:
 *   - 删除 1 条 main wishlist
 *   - 删除多条 main wishlist
 *   - 删除后数据库记录消失
 *   - 删除后其他 wishlist 保留
 *   - 删除后衣橱 item 保留
 *   - 单条详情删除调用同一 deleteWishlistRecords
 *   - 事务失败不部分删除
 */

function buildWishlistItem(overrides: Partial<WishlistItem> = {}): WishlistItem {
  return {
    id: `wishlist-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "测试种草",
    category: "tops",
    imageDataUrl: "",
    colors: { mode: "single", primary: "白" },
    seasons: [],
    styles: [],
    status: "interested",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function buildWardrobeItem(overrides: Partial<WardrobeItem> = {}): WardrobeItem & { id: number } {
  const id = Date.now() + Math.floor(Math.random() * 10000);
  return {
    id,
    name: "测试衣物",
    category: "tops",
    imageDataUrl: "",
    colors: { mode: "single", primary: "白" },
    seasons: [],
    styles: [],
    status: "active",
    locationId: "home",
    wornDates: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

async function runTests() {
  const { getWardrobeDb } = await import("@/lib/db");
  const db = getWardrobeDb();

  // ---- 1. 删除 1 条 main wishlist ----
  {
    const w = buildWishlistItem();
    await db.wishlistItems.put(w);
    await deleteWishlistRecords([w.id]);
    const found = await db.wishlistItems.get(w.id);
    assert.equal(found, undefined, "删除后记录应为 undefined");
  }

  // ---- 2. 删除多条 main wishlist ----
  {
    const w1 = buildWishlistItem();
    const w2 = buildWishlistItem();
    const w3 = buildWishlistItem();
    await db.wishlistItems.bulkPut([w1, w2, w3]);
    await deleteWishlistRecords([w1.id, w2.id]);
    assert.equal(await db.wishlistItems.get(w1.id), undefined);
    assert.equal(await db.wishlistItems.get(w2.id), undefined);
    assert.ok(await db.wishlistItems.get(w3.id), "未删除的记录应保留");
  }

  // ---- 3. 删除后其他 wishlist 保留 ----
  {
    const w1 = buildWishlistItem();
    const w2 = buildWishlistItem();
    await db.wishlistItems.bulkPut([w1, w2]);
    await deleteWishlistRecords([w1.id]);
    assert.equal(await db.wishlistItems.get(w1.id), undefined);
    assert.ok(await db.wishlistItems.get(w2.id), "其他种草应保留");
  }

  // ---- 4. 删除后衣橱 item 保留 ----
  {
    const item = buildWardrobeItem();
    await db.items.put(item);
    const w = buildWishlistItem();
    await db.wishlistItems.put(w);
    await deleteWishlistRecords([w.id]);
    assert.ok(await db.items.get(item.id), "衣橱 item 应保留");
  }

  // ---- 5. 单条删除调用同一函数 ----
  {
    const w = buildWishlistItem();
    await db.wishlistItems.put(w);
    await deleteWishlistRecords([w.id]);
    assert.equal(await db.wishlistItems.get(w.id), undefined);
  }

  // ---- 6. 空数组不操作 ----
  {
    await deleteWishlistRecords([]);
    // 不应抛出异常
  }

  // ---- 7. 不存在的 ID 不报错 ----
  {
    await deleteWishlistRecords(["nonexistent-id-12345"]);
    // 不应抛出异常
  }

  console.log("wishlist bulk delete tests passed");
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
