/**
 * 测试账号数据清理脚本 (Section 14)
 *
 * 用法: npx tsx scripts/reset-test-account-data.ts --account <phone> --api <local-api-url>
 * 安全措施: 拒绝空参数、拒绝非本机 API 和非本机 DATABASE_URL
 */

import { eq } from "drizzle-orm";
import { getDb, closeDatabase, assertSafeTestDatabaseUrl, getDatabaseUrl } from "../services/wardrobe-api/src/db/client.js";
import * as schema from "../services/wardrobe-api/src/db/schema.js";
import { createStorageProviderFromEnv } from "../services/wardrobe-api/src/storage/factory.js";

async function main() {
  const account = readArg("--account");
  const apiBase = readArg("--api");
  if (!account || !apiBase) {
    console.error("错误: 必须显式提供 --account 和 --api。");
    process.exit(1);
  }
  const apiHost = new URL(apiBase).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(apiHost)) {
    console.error(`安全拒绝: --api 指向非本机地址 (${apiHost})。`);
    process.exit(1);
  }

  // 安全检查：禁止连接生产数据库（非 127.0.0.1/localhost 的地址）
  const dbUrl = getDatabaseUrl();
  assertSafeTestDatabaseUrl(dbUrl);
  const host = new URL(dbUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    console.error(`安全拒绝: DATABASE_URL 指向非本地地址 (${host})。此脚本仅允许本地测试数据库。`);
    process.exit(1);
  }

  const db = getDb();
  const storage = createStorageProviderFromEnv();

  // 查找用户
  const [phoneIdentity] = await db
    .select({ userId: schema.phoneIdentities.userId })
    .from(schema.phoneIdentities)
    .innerJoin(schema.users, eq(schema.users.id, schema.phoneIdentities.userId))
    .where(eq(schema.phoneIdentities.phoneE164, account));
  const userId = phoneIdentity?.userId;
  if (!userId) {
    console.error(`未找到测试账号: ${account}`);
    process.exit(1);
  }

  console.log(`找到用户 ${userId}，开始清理数据...`);

  const assetRows = await db
    .select({ originalStorageKey: schema.assets.originalStorageKey, thumbnailStorageKey: schema.assets.thumbnailStorageKey })
    .from(schema.assets)
    .where(eq(schema.assets.userId, userId));

  // 按 FK 依赖顺序删除
  const tables: Array<{ name: string; table: Parameters<typeof db.delete>[0] }> = [
    { name: "sync_mutations", table: schema.syncMutations },
    { name: "sync_changes", table: schema.syncChanges },
    { name: "wear_events", table: schema.wearEvents },
    { name: "outfit_plans", table: schema.outfitPlans },
    { name: "outfit_items", table: schema.outfitItems },
    { name: "assets", table: schema.assets },
    { name: "garments", table: schema.garments },
    { name: "outfits", table: schema.outfits },
    { name: "wishlist_items", table: schema.wishlistItems },
    { name: "trip_plans", table: schema.tripPlans },
    { name: "profiles", table: schema.profiles },
    { name: "locations", table: schema.locations },
    { name: "wardrobes", table: schema.wardrobes },
  ];

  for (const { name, table } of tables) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await db.delete(table).where(eq((table as any).userId, userId));
      if (result.rowCount && result.rowCount > 0) {
        console.log(`  ${name}: 删除 ${result.rowCount} 行`);
      }
    } catch (err) {
      console.warn(`  ${name}: 跳过 (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  // 清理云端图片文件（使用 storage provider）
  try {
    for (const row of assetRows) {
      if (row.originalStorageKey && storage) await storage.delete(row.originalStorageKey);
      if (row.thumbnailStorageKey && storage) await storage.delete(row.thumbnailStorageKey);
    }
    console.log(`  云端图片文件: 已清理 ${assetRows.length} 条`);
  } catch (err) {
    console.warn(`  云端图片文件: 跳过 (${err instanceof Error ? err.message : String(err)})`);
  }

  // 清理诊断数据
  try {
    await db.delete(schema.diagnosticCases).where(eq(schema.diagnosticCases.userId, userId));
    console.log("  diagnostic_cases: 已清理");
  } catch { /* 表可能不存在 */ }

  console.log(`\n用户 ${userId} 的测试数据清理完成。`);
  console.log("客户端清理: 请在浏览器 DevTools → Application → Clear site data 清除 IndexedDB 和缓存。");
  await closeDatabase();
}

function readArg(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() ?? "" : "";
}

main().catch((err) => {
  console.error("清理失败:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
