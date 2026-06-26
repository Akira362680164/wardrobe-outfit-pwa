"use client";

import { createWorkspaceUuidV7, getAccountWorkspaceDb, type WorkspaceOutfitPlanRecord, type WorkspaceOutfitRecord, type WorkspaceTripPlanRecord } from "@/lib/account-workspace-db";
import { getWardrobeDb } from "@/lib/db";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { currentWorkspaceGuard, deleteOutfitPlan, deleteTripPlan, isGuardCurrent, writeOutfitPlan, writeTripPlan } from "@/lib/cloud-sync/sync-engine";
import type { OutfitCalendarPlan, OutfitPlanEntry, PlanPackingChecklistItem } from "@/lib/types";

export interface BridgePlanResult {
  bridged: boolean;
  reason?:
    | "no_workspace"
    | "workspace_trip_plan_not_found"
    | "workspace_outfit_plan_not_found"
    | "write_failed";
}

export async function bridgeTripPlanUpsert(
  plan: OutfitCalendarPlan,
  checklistItems: PlanPackingChecklistItem[] = [],
): Promise<BridgePlanResult> {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return { bridged: false, reason: "no_workspace" };

  try {
    const db = getAccountWorkspaceDb(ctx.workspace);
    const existing = await findWorkspaceTripPlanByLegacyId(db, plan.id);
    const payload = toCloudTripPlanPayload(plan, checklistItems);
    if (!isGuardCurrent(currentWorkspaceGuard(ctx.workspace))) return { bridged: false, reason: "no_workspace" };
    await writeTripPlan(
      db,
      {
        workspace: ctx.workspace,
        originDeviceId: ctx.deviceId,
        baseRevision: existing?.revision ?? 0,
        payload: { startDate: plan.startDate, endDate: plan.endDate, payload },
      },
      {
        id: existing?.id ?? createWorkspaceUuidV7(),
        legacyCalendarPlanId: plan.id,
        title: plan.title,
        startDate: plan.startDate,
        endDate: plan.endDate,
        payload,
      },
      existing ? "update" : "create",
    );
    return { bridged: true };
  } catch (err) {
    if (typeof console !== "undefined") console.warn("[plan-bridge] bridgeTripPlanUpsert failed:", err);
    return { bridged: false, reason: "write_failed" };
  }
}

export async function bridgeTripPlanWithChecklist(planId: string): Promise<BridgePlanResult> {
  const oldDb = getWardrobeDb();
  const plan = await oldDb.outfitCalendarPlans.get(planId);
  if (!plan) return { bridged: false, reason: "workspace_trip_plan_not_found" };
  const checklistItems = await oldDb.planPackingChecklistItems.where({ calendarPlanId: planId }).toArray();
  return bridgeTripPlanUpsert(plan, checklistItems);
}

export async function bridgeTripPlanDelete(legacyCalendarPlanId: string): Promise<BridgePlanResult> {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return { bridged: false, reason: "no_workspace" };

  try {
    const db = getAccountWorkspaceDb(ctx.workspace);
    const existing = await findWorkspaceTripPlanByLegacyId(db, legacyCalendarPlanId);
    if (!existing) return { bridged: false, reason: "workspace_trip_plan_not_found" };
    if (!isGuardCurrent(currentWorkspaceGuard(ctx.workspace))) return { bridged: false, reason: "no_workspace" };
    await deleteTripPlan(
      db,
      {
        workspace: ctx.workspace,
        originDeviceId: ctx.deviceId,
        baseRevision: existing.revision,
        payload: {},
      },
      existing,
    );
    return { bridged: true };
  } catch (err) {
    if (typeof console !== "undefined") console.warn("[plan-bridge] bridgeTripPlanDelete failed:", err);
    return { bridged: false, reason: "write_failed" };
  }
}

export async function bridgeOutfitPlanUpsert(entry: OutfitPlanEntry): Promise<BridgePlanResult> {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return { bridged: false, reason: "no_workspace" };

  try {
    const db = getAccountWorkspaceDb(ctx.workspace);
    const existing = await findWorkspaceOutfitPlanByLegacyId(db, entry.id);
    const tripPlan = entry.calendarPlanId ? await findWorkspaceTripPlanByLegacyId(db, entry.calendarPlanId) : undefined;
    const legacyOutfitId = entry.outfitId ?? entry.actualOutfitId;
    const outfit = legacyOutfitId ? await findWorkspaceOutfitByLegacyId(db, legacyOutfitId) : undefined;
    const payload = toCloudOutfitPlanPayload(entry);
    if (!isGuardCurrent(currentWorkspaceGuard(ctx.workspace))) return { bridged: false, reason: "no_workspace" };
    await writeOutfitPlan(
      db,
      {
        workspace: ctx.workspace,
        originDeviceId: ctx.deviceId,
        baseRevision: existing?.revision ?? 0,
        payload: { tripPlanId: tripPlan?.id, outfitId: outfit?.id, planDate: entry.date, payload },
      },
      {
        id: existing?.id ?? createWorkspaceUuidV7(),
        legacyPlanEntryId: entry.id,
        tripPlanId: tripPlan?.id,
        outfitId: outfit?.id,
        date: entry.date,
        payload,
      },
      existing ? "update" : "create",
    );
    return { bridged: true };
  } catch (err) {
    if (typeof console !== "undefined") console.warn("[plan-bridge] bridgeOutfitPlanUpsert failed:", err);
    return { bridged: false, reason: "write_failed" };
  }
}

export async function bridgeOutfitPlanDelete(legacyPlanEntryId: string): Promise<BridgePlanResult> {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return { bridged: false, reason: "no_workspace" };

  try {
    const db = getAccountWorkspaceDb(ctx.workspace);
    const existing = await findWorkspaceOutfitPlanByLegacyId(db, legacyPlanEntryId);
    if (!existing) return { bridged: false, reason: "workspace_outfit_plan_not_found" };
    if (!isGuardCurrent(currentWorkspaceGuard(ctx.workspace))) return { bridged: false, reason: "no_workspace" };
    await deleteOutfitPlan(
      db,
      {
        workspace: ctx.workspace,
        originDeviceId: ctx.deviceId,
        baseRevision: existing.revision,
        payload: {},
      },
      existing,
    );
    return { bridged: true };
  } catch (err) {
    if (typeof console !== "undefined") console.warn("[plan-bridge] bridgeOutfitPlanDelete failed:", err);
    return { bridged: false, reason: "write_failed" };
  }
}

export function toCloudTripPlanPayload(
  plan: OutfitCalendarPlan,
  checklistItems: PlanPackingChecklistItem[] = [],
): Record<string, unknown> {
  return {
    ...plan,
    legacyCalendarPlanId: plan.id,
    packingChecklistItems: checklistItems.map((item) => ({ ...item })),
  };
}

export function toCloudOutfitPlanPayload(entry: OutfitPlanEntry): Record<string, unknown> {
  return {
    ...entry,
    legacyPlanEntryId: entry.id,
    legacyCalendarPlanId: entry.calendarPlanId,
    legacyOutfitId: entry.outfitId,
    legacyActualOutfitId: entry.actualOutfitId,
    legacyItemIds: entry.itemIds,
  };
}

async function findWorkspaceTripPlanByLegacyId(
  db: ReturnType<typeof getAccountWorkspaceDb>,
  legacyCalendarPlanId: string,
): Promise<WorkspaceTripPlanRecord | undefined> {
  const plans = await db.tripPlans.toArray();
  return plans.find((plan) => plan.legacyCalendarPlanId === legacyCalendarPlanId && !plan.deletedAt);
}

async function findWorkspaceOutfitPlanByLegacyId(
  db: ReturnType<typeof getAccountWorkspaceDb>,
  legacyPlanEntryId: string,
): Promise<WorkspaceOutfitPlanRecord | undefined> {
  const plans = await db.outfitPlans.toArray();
  return plans.find((plan) => plan.legacyPlanEntryId === legacyPlanEntryId && !plan.deletedAt);
}

async function findWorkspaceOutfitByLegacyId(
  db: ReturnType<typeof getAccountWorkspaceDb>,
  legacyOutfitId: string,
): Promise<WorkspaceOutfitRecord | undefined> {
  const outfits = await db.outfits.toArray();
  return outfits.find((outfit) => outfit.legacyOutfitId === legacyOutfitId && !outfit.deletedAt);
}
