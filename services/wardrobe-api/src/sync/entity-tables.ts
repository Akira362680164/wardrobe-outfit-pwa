// services/wardrobe-api/src/sync/entity-tables.ts
// v1.1.37 cloud 1B B4: entityType ↔ drizzle table 映射
// B4 让所有 8 个 entityType 在 push / bootstrap / pull 路径都能被同一 service 派发。
// 任何新 entityType 必须先在这里登记，否则 service 抛 NOT_IMPLEMENTED。

import {
  garments,
  outfits,
  outfitItems,
  wishlistItems,
  wearEvents,
  tripPlans,
  outfitPlans,
  assets,
} from "../db/schema.js";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { SyncEntityType } from "@wardrobe/cloud-contracts";

type EntityTableMap = {
  [K in SyncEntityType]: AnyPgTable;
};

const ENTITY_TABLE_MAP: EntityTableMap = {
  garment: garments,
  outfit: outfits,
  outfitItem: outfitItems,
  wishlistItem: wishlistItems,
  wearEvent: wearEvents,
  tripPlan: tripPlans,
  outfitPlan: outfitPlans,
  asset: assets,
};

export function getTableForEntityType(entityType: SyncEntityType): AnyPgTable {
  const table = ENTITY_TABLE_MAP[entityType];
  if (!table) {
    throw new Error(`Entity type not implemented: ${entityType}`);
  }
  return table;
}

export function listSyncEntityTables(): SyncEntityType[] {
  return Object.keys(ENTITY_TABLE_MAP) as SyncEntityType[];
}
