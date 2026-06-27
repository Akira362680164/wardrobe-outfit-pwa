// v1.1.7 batch1-3: 套装级联删除 — 删除套装时清理未来计划与打包清单引用
import type { OutfitPlanEntry, PlanPackingChecklistItem, SavedOutfit } from "@/lib/types";

export interface OutfitCascadeDeleteResult {
  deletedOutfitIds: string[];
  deletedPlanEntryIds: string[];
  deletedPackingItemIds: string[];
  // 保留了过去日期的 worn 记录
  keptWornCount: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CascadeDb = any;

function getLocalDateKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function deleteOutfitWithCascade(input: {
  db: CascadeDb;
  outfitId: string;
}): Promise<OutfitCascadeDeleteResult> {
  const { db, outfitId } = input;
  const now = new Date().toISOString();
  const result: OutfitCascadeDeleteResult = {
    deletedOutfitIds: [outfitId],
    deletedPlanEntryIds: [],
    deletedPackingItemIds: [],
    keptWornCount: 0,
  };

  await db.transaction(
    "rw",
    [db.outfits, db.outfitPlanEntries, db.planPackingChecklistItems],
    async () => {
      // 1. Read the outfit to get its name for snapshot
      const outfit = await db.outfits.get(outfitId);
      const outfitName = outfit?.name || "";

      // 2. Delete the outfit
      await db.outfits.delete(outfitId);

      // 3. Process all plan entries referencing this outfit
      // P1-02 fix: only keep worn history snapshots, delete all non-worn entries
      const allEntries = await db.outfitPlanEntries
        .where("outfitId")
        .equals(outfitId)
        .toArray();

      for (const entry of allEntries) {
        if (entry.status === "worn") {
          // Preserve historical worn snapshot: clear live reference, keep name
          result.keptWornCount++;
          const patch: Partial<OutfitPlanEntry> = {
            outfitId: undefined,
            updatedAt: now,
          };
          if (outfitName) {
            patch.title = entry.title || outfitName;
          }
          await db.outfitPlanEntries.update(entry.id, patch);
        } else {
          // Delete planned/skipped/changed entries regardless of date
          await db.outfitPlanEntries.delete(entry.id);
          result.deletedPlanEntryIds.push(entry.id);
        }
      }

      // 4. Also check actualOutfitId references
      const actualRefEntries = await db.outfitPlanEntries
        .where("actualOutfitId")
        .equals(outfitId)
        .toArray();

      for (const entry of actualRefEntries) {
        if (!result.deletedPlanEntryIds.includes(entry.id)) {
          if (entry.status === "worn") {
            result.keptWornCount++;
            await db.outfitPlanEntries.update(entry.id, {
              actualOutfitId: undefined,
              updatedAt: now,
            });
          } else {
            await db.outfitPlanEntries.delete(entry.id);
            result.deletedPlanEntryIds.push(entry.id);
          }
        }
      }

      // 5. Delete packing checklist items referencing this outfit
      const packingItems = await db.planPackingChecklistItems
        .where("outfitId")
        .equals(outfitId)
        .toArray();

      for (const item of packingItems) {
        await db.planPackingChecklistItems.delete(item.id);
        result.deletedPackingItemIds.push(item.id);
      }
    },
  );

  return result;
}
