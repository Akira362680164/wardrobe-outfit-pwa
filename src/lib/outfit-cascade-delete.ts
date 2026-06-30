export interface OutfitCascadeDeleteResult {
  deletedOutfitIds: string[];
  deletedPlanEntryIds: string[];
  deletedPackingItemIds: string[];
  // 保留了过去日期的 worn 记录
  keptWornCount: number;
}
