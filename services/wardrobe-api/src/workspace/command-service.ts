import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type {
  WorkspaceAssetMutation,
  WorkspaceCommandResponse,
  WorkspaceCreateCommand,
  WorkspaceDeleteCommand,
  WorkspaceEntity,
  WorkspaceStateCommand,
  WorkspaceUpdateCommand,
} from "@wardrobe/cloud-contracts";

import { getDb } from "../db/client.js";
import { assetBindings, assets, syncChanges, syncMutations } from "../db/schema.js";
import type * as schema from "../db/schema.js";
import { WorkspaceApiError } from "./errors.js";
import { WORKSPACE_RESOURCES, type WorkspaceResource } from "./query-service.js";

type Db = NodePgDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Mutation = WorkspaceCreateCommand | WorkspaceUpdateCommand | WorkspaceDeleteCommand;

export class WorkspaceCommandService {
  constructor(private readonly injectedDb?: Db) {}

  async mutationResult(userId: string, clientMutationId: string): Promise<WorkspaceCommandResponse | null> {
    const [row] = await this.database().select({ response: syncMutations.response }).from(syncMutations).where(and(
      eq(syncMutations.userId, userId), eq(syncMutations.mutationId, clientMutationId),
    )).limit(1);
    return row?.response ? row.response as WorkspaceCommandResponse : null;
  }

  async create(input: { resource: WorkspaceResource; command: WorkspaceCreateCommand; userId: string; deviceId: string; requestId?: string }): Promise<WorkspaceCommandResponse> {
    return this.runMutation({ ...input, operation: "create", entityId: randomUUID() }, async (tx, entityId) => {
      const descriptor = WORKSPACE_RESOURCES[input.resource];
      const table = descriptor.table as AnyPgTable & Record<string, any>;
      const now = new Date();
      const payload = sanitizePayload(input.command.payload);
      await tx.insert(table).values({
        id: entityId, userId: input.userId, revision: 1, originDeviceId: input.deviceId,
        payload, ...specialColumns(input.resource, payload), createdAt: now, updatedAt: now,
      });
      await applyAssetMutations(tx, {
        mutations: input.command.assetMutations, userId: input.userId, entityId,
        entityType: descriptor.entityType, clientMutationId: input.command.clientMutationId, now,
      });
      const assetRefs = await readAssetRefs(tx, input.userId, descriptor.entityType, entityId);
      await appendChange(tx, input.userId, descriptor.entityType, entityId, "create", 1, payload);
      return { entity: toEntity({ id: entityId, revision: 1, payload, createdAt: now, updatedAt: now }, assetRefs), revision: 1 };
    });
  }

  async batchCreate(input: { resource: WorkspaceResource; commands: WorkspaceCreateCommand[]; userId: string; deviceId: string; requestId?: string }): Promise<WorkspaceCommandResponse> {
    const entities: WorkspaceEntity[] = [];
    for (const command of input.commands) {
      const result = await this.create({ ...input, command });
      if (result.status === "in_progress") return result;
      if (result.entity) entities.push(result.entity);
    }
    return { status: "committed", entities, ...(input.requestId ? { requestId: input.requestId } : {}) };
  }

  async update(input: { resource: WorkspaceResource; entityId: string; command: WorkspaceUpdateCommand; userId: string; deviceId: string; requestId?: string }): Promise<WorkspaceCommandResponse> {
    return this.runMutation({ ...input, operation: "update" }, async (tx) => {
      const descriptor = WORKSPACE_RESOURCES[input.resource];
      const table = descriptor.table as AnyPgTable & Record<string, any>;
      const row = await ownedActiveRow(tx, table, input.entityId, input.userId);
      assertRevision(row.revision, input.command.expectedRevision, row);
      const now = new Date();
      const revision = row.revision + 1;
      const payload = sanitizePayload(input.command.payload);
      await tx.update(table).set({ revision, originDeviceId: input.deviceId, payload, ...specialColumns(input.resource, payload), updatedAt: now })
        .where(and(eq(table.id, input.entityId), eq(table.userId, input.userId), eq(table.revision, row.revision), isNull(table.deletedAt)));
      await applyAssetMutations(tx, {
        mutations: input.command.assetMutations, userId: input.userId, entityId: input.entityId,
        entityType: descriptor.entityType, clientMutationId: input.command.clientMutationId, now,
      });
      const assetRefs = await readAssetRefs(tx, input.userId, descriptor.entityType, input.entityId);
      await appendChange(tx, input.userId, descriptor.entityType, input.entityId, "update", revision, payload);
      return { entity: toEntity({ id: input.entityId, revision, payload, createdAt: row.createdAt, updatedAt: now }, assetRefs), revision };
    });
  }

  async delete(input: { resource: WorkspaceResource; entityId: string; command: WorkspaceDeleteCommand; userId: string; deviceId: string; requestId?: string }): Promise<WorkspaceCommandResponse> {
    return this.runMutation({ ...input, operation: "delete" }, async (tx) => {
      const descriptor = WORKSPACE_RESOURCES[input.resource];
      const table = descriptor.table as AnyPgTable & Record<string, any>;
      const row = await ownedActiveRow(tx, table, input.entityId, input.userId);
      assertRevision(row.revision, input.command.expectedRevision, row);
      const now = new Date();
      const revision = row.revision + 1;
      await tx.update(table).set({ revision, originDeviceId: input.deviceId, deletedAt: now, updatedAt: now })
        .where(and(eq(table.id, input.entityId), eq(table.userId, input.userId), eq(table.revision, row.revision), isNull(table.deletedAt)));
      await removeOwnerBindings(tx, input.userId, descriptor.entityType, input.entityId, now);
      await appendChange(tx, input.userId, descriptor.entityType, input.entityId, "delete", revision, {});
      return { revision };
    });
  }

  async patchPayload(input: { resource: WorkspaceResource; entityId: string; command: WorkspaceUpdateCommand | (WorkspaceDeleteCommand & { payload?: Record<string, unknown> }); userId: string; deviceId: string; requestId?: string; patch: Record<string, unknown> }): Promise<WorkspaceCommandResponse> {
    const descriptor = WORKSPACE_RESOURCES[input.resource];
    const table = descriptor.table as AnyPgTable & Record<string, any>;
    const [row] = await this.database().select().from(table).where(and(eq(table.id, input.entityId), eq(table.userId, input.userId), isNull(table.deletedAt))).limit(1) as any[];
    if (!row) throw new WorkspaceApiError(404, "not_found", "数据不存在");
    return this.update({ ...input, command: { ...input.command, payload: { ...asRecord(row.payload), ...input.patch }, assetMutations: [] } });
  }

  async convertWishlist(input: { entityId: string; command: WorkspaceUpdateCommand & { locationId: string }; userId: string; deviceId: string; requestId?: string }): Promise<WorkspaceCommandResponse> {
    return this.runMutation({ ...input, resource: "wishlist", operation: "update" }, async (tx) => {
      const wishlistTable = WORKSPACE_RESOURCES.wishlist.table as AnyPgTable & Record<string, any>;
      const garmentTable = WORKSPACE_RESOURCES.garments.table as AnyPgTable & Record<string, any>;
      const row = await ownedActiveRow(tx, wishlistTable, input.entityId, input.userId);
      assertRevision(row.revision, input.command.expectedRevision, row);
      const now = new Date();
      const garmentId = randomUUID();
      const legacyItemId = stableNumericId(garmentId);
      const payload = {
        ...asRecord(row.payload), ...sanitizePayload(input.command.payload), sourceWishlistId: input.entityId,
        legacyItemId, locationId: input.command.locationId, status: "active", wornDates: [],
        createdAt: now.toISOString(), updatedAt: now.toISOString(),
      };
      await tx.insert(garmentTable).values({ id: garmentId, userId: input.userId, revision: 1, originDeviceId: input.deviceId, payload, ...specialColumns("garments", payload), createdAt: now, updatedAt: now });
      const wishlistPayload = { ...asRecord(row.payload), purchased: true, convertedGarmentId: garmentId, convertedItemId: legacyItemId, convertedAt: now.toISOString() };
      await tx.update(wishlistTable).set({ revision: row.revision + 1, payload: wishlistPayload, updatedAt: now }).where(eq(wishlistTable.id, input.entityId));
      const wishlistBindings = await tx.select().from(assetBindings).where(and(
        eq(assetBindings.userId, input.userId), eq(assetBindings.ownerEntityType, "wishlistItem"), eq(assetBindings.ownerEntityId, input.entityId),
      ));
      for (const binding of wishlistBindings) {
        await upsertBinding(tx, { userId: input.userId, assetId: binding.assetId, entityType: "garment", entityId: garmentId, fieldName: binding.fieldName, now });
      }
      await applyAssetMutations(tx, { mutations: input.command.assetMutations, userId: input.userId, entityId: garmentId, entityType: "garment", clientMutationId: input.command.clientMutationId, now });
      const assetRefs = await readAssetRefs(tx, input.userId, "garment", garmentId);
      await appendChange(tx, input.userId, "garment", garmentId, "create", 1, payload);
      await appendChange(tx, input.userId, "wishlistItem", input.entityId, "update", row.revision + 1, wishlistPayload);
      return { entity: toEntity({ id: garmentId, revision: 1, payload, createdAt: now, updatedAt: now }, assetRefs), revision: 1 };
    });
  }

  async undoWishlistPurchase(input: { entityId: string; command: WorkspaceDeleteCommand; userId: string; deviceId: string; requestId?: string }): Promise<WorkspaceCommandResponse> {
    return this.runMutation({ ...input, resource: "wishlist", operation: "update" }, async (tx) => {
      const wishlistTable = WORKSPACE_RESOURCES.wishlist.table as AnyPgTable & Record<string, any>;
      const garmentTable = WORKSPACE_RESOURCES.garments.table as AnyPgTable & Record<string, any>;
      const row = await ownedActiveRow(tx, wishlistTable, input.entityId, input.userId);
      assertRevision(row.revision, input.command.expectedRevision, row);
      const payload = asRecord(row.payload);
      const garmentId = uuidOrNull(payload.convertedGarmentId);
      const now = new Date();
      if (garmentId) {
        const [garment] = await tx.select().from(garmentTable).where(and(eq(garmentTable.id, garmentId), eq(garmentTable.userId, input.userId), isNull(garmentTable.deletedAt))).limit(1) as any[];
        if (garment) {
          await tx.update(garmentTable).set({ revision: garment.revision + 1, deletedAt: now, updatedAt: now }).where(eq(garmentTable.id, garmentId));
          await removeOwnerBindings(tx, input.userId, "garment", garmentId, now);
          await appendChange(tx, input.userId, "garment", garmentId, "delete", garment.revision + 1, {});
        }
      }
      const nextPayload = { ...payload, purchased: false, convertedGarmentId: null, convertedItemId: null, convertedAt: null };
      const revision = row.revision + 1;
      await tx.update(wishlistTable).set({ revision, payload: nextPayload, updatedAt: now }).where(eq(wishlistTable.id, input.entityId));
      await appendChange(tx, input.userId, "wishlistItem", input.entityId, "update", revision, nextPayload);
      return { entity: toEntity({ id: input.entityId, revision, payload: nextPayload, createdAt: row.createdAt, updatedAt: now }), revision };
    });
  }

  async markWorn(input: { resource: "garments" | "outfits" | "outfit-plans"; entityId: string; command: WorkspaceDeleteCommand & { wornAt: string; outfitId?: string }; userId: string; deviceId: string; requestId?: string }): Promise<WorkspaceCommandResponse> {
    return this.runMutation({ ...input, operation: "update" }, async (tx) => {
      if (input.resource === "outfits") return markOutfitWearTransaction(tx, input);
      const descriptor = WORKSPACE_RESOURCES[input.resource];
      const table = descriptor.table as AnyPgTable & Record<string, any>;
      const wearTable = WORKSPACE_RESOURCES["wear-events"].table as AnyPgTable & Record<string, any>;
      const row = await ownedActiveRow(tx, table, input.entityId, input.userId);
      assertRevision(row.revision, input.command.expectedRevision, row);
      const wearEventId = randomUUID();
      const now = new Date();
      const wearPayload = input.resource === "garments"
        ? { garmentId: input.entityId, wornAt: input.command.wornAt }
        : { outfitPlanId: input.entityId, outfitId: input.command.outfitId ?? asRecord(row.payload).outfitId, wornAt: input.command.wornAt };
      await tx.insert(wearTable).values({ id: wearEventId, userId: input.userId, revision: 1, originDeviceId: input.deviceId, payload: wearPayload, ...specialColumns("wear-events", wearPayload), createdAt: now, updatedAt: now });
      const nextPayload = { ...asRecord(row.payload), worn: true, wornAt: input.command.wornAt, wearEventId };
      const revision = row.revision + 1;
      await tx.update(table).set({ revision, payload: nextPayload, updatedAt: now }).where(eq(table.id, input.entityId));
      await appendChange(tx, input.userId, "wearEvent", wearEventId, "create", 1, wearPayload);
      await appendChange(tx, input.userId, descriptor.entityType, input.entityId, "update", revision, nextPayload);
      return { entity: toEntity({ id: input.entityId, revision, payload: nextPayload, createdAt: row.createdAt, updatedAt: now }), revision };
    });
  }

  async cancelWorn(input: { resource: "garments" | "outfits" | "outfit-plans"; entityId: string; command: WorkspaceStateCommand; userId: string; deviceId: string; requestId?: string }): Promise<WorkspaceCommandResponse> {
    return this.runMutation({ ...input, operation: "update" }, async (tx) => {
      if (input.resource === "outfits") return cancelOutfitWearTransaction(tx, input);
      const descriptor = WORKSPACE_RESOURCES[input.resource];
      const table = descriptor.table as AnyPgTable & Record<string, any>;
      const wearTable = WORKSPACE_RESOURCES["wear-events"].table as AnyPgTable & Record<string, any>;
      const row = await ownedActiveRow(tx, table, input.entityId, input.userId);
      assertRevision(row.revision, input.command.expectedRevision, row);
      const payload = asRecord(row.payload);
      const wearEventId = uuidOrNull(payload.wearEventId);
      const now = new Date();
      if (wearEventId) {
        const [event] = await tx.select().from(wearTable).where(and(eq(wearTable.id, wearEventId), eq(wearTable.userId, input.userId), isNull(wearTable.deletedAt))).limit(1) as any[];
        if (event) {
          await tx.update(wearTable).set({ revision: event.revision + 1, deletedAt: now, updatedAt: now }).where(eq(wearTable.id, wearEventId));
          await appendChange(tx, input.userId, "wearEvent", wearEventId, "delete", event.revision + 1, {});
        }
      }
      const nextPayload = { ...payload, worn: false, wornAt: null, wearEventId: null };
      const revision = row.revision + 1;
      await tx.update(table).set({ revision, payload: nextPayload, updatedAt: now }).where(eq(table.id, input.entityId));
      await appendChange(tx, input.userId, descriptor.entityType, input.entityId, "update", revision, nextPayload);
      return { entity: toEntity({ id: input.entityId, revision, payload: nextPayload, createdAt: row.createdAt, updatedAt: now }), revision };
    });
  }

  private async runMutation(
    input: { resource: WorkspaceResource; operation: "create" | "update" | "delete"; entityId: string; command: Mutation; userId: string; requestId?: string },
    execute: (tx: Tx, entityId: string) => Promise<Omit<WorkspaceCommandResponse, "status" | "requestId">>,
  ): Promise<WorkspaceCommandResponse> {
    const descriptor = WORKSPACE_RESOURCES[input.resource];
    return this.database().transaction(async (tx) => {
      const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtext(${`${input.userId}:${input.command.clientMutationId}`})) AS acquired`);
      if (!(lock.rows[0] as any)?.acquired) return { status: "in_progress", ...(input.requestId ? { requestId: input.requestId } : {}) };
      const [existing] = await tx.select().from(syncMutations).where(and(eq(syncMutations.userId, input.userId), eq(syncMutations.mutationId, input.command.clientMutationId))).limit(1);
      if (existing?.response) return existing.response as WorkspaceCommandResponse;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`workspace-entity:${input.userId}:${descriptor.entityType}:${input.entityId}`}))`);
      const result = await execute(tx, input.entityId);
      const response: WorkspaceCommandResponse = { status: "committed", ...result, ...(input.requestId ? { requestId: input.requestId } : {}) };
      await tx.insert(syncMutations).values({
        userId: input.userId, mutationId: input.command.clientMutationId, entityType: descriptor.entityType,
        entityId: input.entityId, operation: input.operation, baseRevision: input.command.expectedRevision ?? null,
        status: "accepted", resultRevision: response.revision ?? response.entity?.revision ?? null,
        payload: "payload" in input.command ? input.command.payload : {}, response,
      });
      return response;
    });
  }

  private database(): Db { return this.injectedDb ?? getDb(); }
}

async function markOutfitWearTransaction(
  tx: Tx,
  input: { entityId: string; command: WorkspaceDeleteCommand & { wornAt: string }; userId: string; deviceId: string },
): Promise<Omit<WorkspaceCommandResponse, "status" | "requestId">> {
  const outfitTable = WORKSPACE_RESOURCES.outfits.table as AnyPgTable & Record<string, any>;
  const garmentTable = WORKSPACE_RESOURCES.garments.table as AnyPgTable & Record<string, any>;
  const planTable = WORKSPACE_RESOURCES["outfit-plans"].table as AnyPgTable & Record<string, any>;
  const wearTable = WORKSPACE_RESOURCES["wear-events"].table as AnyPgTable & Record<string, any>;
  const outfit = await ownedActiveRow(tx, outfitTable, input.entityId, input.userId);
  assertRevision(outfit.revision, input.command.expectedRevision, outfit);
  const now = new Date();
  const dateKey = input.command.wornAt.slice(0, 10);
  const outfitPayload = asRecord(outfit.payload);
  const legacyOutfitId = String(outfitPayload.legacyOutfitId ?? input.entityId);
  const itemIds = numberList(outfitPayload.legacyItemIds ?? outfitPayload.itemIds);

  const nextOutfitPayload = { ...outfitPayload, wornDates: addDate(outfitPayload.wornDates, dateKey), updatedAt: now.toISOString() };
  const outfitRevision = outfit.revision + 1;
  await tx.update(outfitTable).set({ revision: outfitRevision, originDeviceId: input.deviceId, payload: nextOutfitPayload, updatedAt: now }).where(eq(outfitTable.id, input.entityId));
  await appendChange(tx, input.userId, "outfit", input.entityId, "update", outfitRevision, nextOutfitPayload);

  const garments = await tx.select().from(garmentTable).where(and(eq(garmentTable.userId, input.userId), isNull(garmentTable.deletedAt))) as any[];
  const wornGarments = garments.filter((row) => itemIds.includes(Number(asRecord(row.payload).legacyItemId)));
  for (const garment of wornGarments) {
    const payload = asRecord(garment.payload);
    const nextPayload = { ...payload, wornDates: addDate(payload.wornDates, dateKey), updatedAt: now.toISOString() };
    await tx.update(garmentTable).set({ revision: garment.revision + 1, originDeviceId: input.deviceId, payload: nextPayload, updatedAt: now }).where(eq(garmentTable.id, garment.id));
    await appendChange(tx, input.userId, "garment", garment.id, "update", garment.revision + 1, nextPayload);
  }

  const plans = await tx.select().from(planTable).where(and(eq(planTable.userId, input.userId), isNull(planTable.deletedAt))) as any[];
  const sameDay = plans.filter((row) => String(asRecord(row.payload).date ?? "") === dateKey);
  const alreadyWorn = sameDay.find((row) => {
    const payload = asRecord(row.payload);
    return payload.status === "worn" && (payload.outfitId === legacyOutfitId || payload.actualOutfitId === legacyOutfitId);
  });
  if (!alreadyWorn) {
    const planned = sameDay.find((row) => {
      const payload = asRecord(row.payload);
      return payload.outfitId === legacyOutfitId && (payload.status === "planned" || payload.status === "changed");
    });
    if (planned) {
      const payload = asRecord(planned.payload);
      const nextPayload = {
        ...payload, status: "worn", wornDateLinked: dateKey, actualOutfitId: legacyOutfitId,
        wearOrigin: "planned_confirmed", plannedBeforeWorn: true, isPrimaryActual: Boolean(payload.isPrimary), updatedAt: now.toISOString(),
      };
      await tx.update(planTable).set({ revision: planned.revision + 1, originDeviceId: input.deviceId, payload: nextPayload, updatedAt: now }).where(eq(planTable.id, planned.id));
      await appendChange(tx, input.userId, "outfitPlan", planned.id, "update", planned.revision + 1, nextPayload);
    } else {
      const planId = randomUUID();
      const payload = {
        legacyPlanEntryId: `plan-entry-${dateKey}-${planId.slice(0, 8)}`, date: dateKey, outfitId: legacyOutfitId,
        status: "worn", wornDateLinked: dateKey, wearOrigin: "manual_actual", plannedBeforeWorn: false,
        isPrimaryActual: !sameDay.some((row) => asRecord(row.payload).status === "worn"), createdAt: now.toISOString(), updatedAt: now.toISOString(),
      };
      await tx.insert(planTable).values({ id: planId, userId: input.userId, revision: 1, originDeviceId: input.deviceId, payload, planDate: dateKey, createdAt: now, updatedAt: now });
      await appendChange(tx, input.userId, "outfitPlan", planId, "create", 1, payload);
    }
    for (const plan of sameDay) {
      const payload = asRecord(plan.payload);
      if (payload.status !== "planned" || !payload.isPrimary || payload.outfitId === legacyOutfitId) continue;
      const nextPayload = { ...payload, status: "changed", actualOutfitId: legacyOutfitId, updatedAt: now.toISOString() };
      await tx.update(planTable).set({ revision: plan.revision + 1, originDeviceId: input.deviceId, payload: nextPayload, updatedAt: now }).where(eq(planTable.id, plan.id));
      await appendChange(tx, input.userId, "outfitPlan", plan.id, "update", plan.revision + 1, nextPayload);
    }
  }

  const events = await tx.select().from(wearTable).where(and(eq(wearTable.userId, input.userId), isNull(wearTable.deletedAt))) as any[];
  if (!events.some((row) => asRecord(row.payload).sourceOutfitId === input.entityId && String(asRecord(row.payload).wornAt).slice(0, 10) === dateKey)) {
    await createWearEvent(tx, { userId: input.userId, deviceId: input.deviceId, now, payload: { outfitId: input.entityId, sourceOutfitId: input.entityId, wornAt: input.command.wornAt } });
    for (const garment of wornGarments) {
      await createWearEvent(tx, { userId: input.userId, deviceId: input.deviceId, now, payload: { garmentId: garment.id, sourceOutfitId: input.entityId, wornAt: input.command.wornAt } });
    }
  }
  return { entity: toEntity({ id: input.entityId, revision: outfitRevision, payload: nextOutfitPayload, createdAt: outfit.createdAt, updatedAt: now }), revision: outfitRevision };
}

async function cancelOutfitWearTransaction(
  tx: Tx,
  input: { entityId: string; command: WorkspaceStateCommand; userId: string; deviceId: string },
): Promise<Omit<WorkspaceCommandResponse, "status" | "requestId">> {
  const outfitTable = WORKSPACE_RESOURCES.outfits.table as AnyPgTable & Record<string, any>;
  const garmentTable = WORKSPACE_RESOURCES.garments.table as AnyPgTable & Record<string, any>;
  const planTable = WORKSPACE_RESOURCES["outfit-plans"].table as AnyPgTable & Record<string, any>;
  const wearTable = WORKSPACE_RESOURCES["wear-events"].table as AnyPgTable & Record<string, any>;
  const outfit = await ownedActiveRow(tx, outfitTable, input.entityId, input.userId);
  assertRevision(outfit.revision, input.command.expectedRevision, outfit);
  const dateKey = input.command.date;
  if (!dateKey) throw new WorkspaceApiError(400, "invalid_request", "缺少穿着日期");
  const now = new Date();
  const outfitPayload = asRecord(outfit.payload);
  const legacyOutfitId = String(outfitPayload.legacyOutfitId ?? input.entityId);
  const itemIds = numberList(outfitPayload.legacyItemIds ?? outfitPayload.itemIds);

  const plans = await tx.select().from(planTable).where(and(eq(planTable.userId, input.userId), isNull(planTable.deletedAt))) as any[];
  const sameDay = plans.filter((row) => String(asRecord(row.payload).date ?? "") === dateKey);
  const cancelledPlans = sameDay.filter((row) => {
    const payload = asRecord(row.payload);
    return payload.status === "worn" && (payload.outfitId === legacyOutfitId || payload.actualOutfitId === legacyOutfitId);
  });
  for (const plan of cancelledPlans) {
    const payload = asRecord(plan.payload);
    if (payload.wearOrigin === "planned_confirmed" || payload.plannedBeforeWorn) {
      const hasOtherPrimary = sameDay.some((row) => row.id !== plan.id && asRecord(row.payload).status === "planned" && asRecord(row.payload).isPrimary);
      const nextPayload = {
        ...payload, status: "planned", isPrimary: !hasOtherPrimary, wornDateLinked: undefined,
        actualOutfitId: undefined, wearOrigin: undefined, plannedBeforeWorn: undefined, isPrimaryActual: undefined, updatedAt: now.toISOString(),
      };
      await tx.update(planTable).set({ revision: plan.revision + 1, originDeviceId: input.deviceId, payload: nextPayload, updatedAt: now }).where(eq(planTable.id, plan.id));
      await appendChange(tx, input.userId, "outfitPlan", plan.id, "update", plan.revision + 1, nextPayload);
    } else {
      await tx.update(planTable).set({ revision: plan.revision + 1, originDeviceId: input.deviceId, deletedAt: now, updatedAt: now }).where(eq(planTable.id, plan.id));
      await appendChange(tx, input.userId, "outfitPlan", plan.id, "delete", plan.revision + 1, {});
    }
  }

  const otherWorn = sameDay.filter((row) => !cancelledPlans.some((cancelled) => cancelled.id === row.id) && asRecord(row.payload).status === "worn");
  const otherLegacyOutfitIds = otherWorn.map((row) => String(asRecord(row.payload).actualOutfitId ?? asRecord(row.payload).outfitId ?? ""));
  const allOutfits = await tx.select().from(outfitTable).where(and(eq(outfitTable.userId, input.userId), isNull(outfitTable.deletedAt))) as any[];
  const otherWornItemIds = new Set(allOutfits
    .filter((row) => otherLegacyOutfitIds.includes(String(asRecord(row.payload).legacyOutfitId ?? row.id)))
    .flatMap((row) => numberList(asRecord(row.payload).legacyItemIds ?? asRecord(row.payload).itemIds)));

  const nextOutfitPayload = { ...outfitPayload, wornDates: removeDate(outfitPayload.wornDates, dateKey), updatedAt: now.toISOString() };
  const outfitRevision = outfit.revision + 1;
  await tx.update(outfitTable).set({ revision: outfitRevision, originDeviceId: input.deviceId, payload: nextOutfitPayload, updatedAt: now }).where(eq(outfitTable.id, input.entityId));
  await appendChange(tx, input.userId, "outfit", input.entityId, "update", outfitRevision, nextOutfitPayload);

  const garments = await tx.select().from(garmentTable).where(and(eq(garmentTable.userId, input.userId), isNull(garmentTable.deletedAt))) as any[];
  for (const garment of garments) {
    const payload = asRecord(garment.payload);
    const legacyItemId = Number(payload.legacyItemId);
    if (!itemIds.includes(legacyItemId) || otherWornItemIds.has(legacyItemId)) continue;
    const nextPayload = { ...payload, wornDates: removeDate(payload.wornDates, dateKey), updatedAt: now.toISOString() };
    await tx.update(garmentTable).set({ revision: garment.revision + 1, originDeviceId: input.deviceId, payload: nextPayload, updatedAt: now }).where(eq(garmentTable.id, garment.id));
    await appendChange(tx, input.userId, "garment", garment.id, "update", garment.revision + 1, nextPayload);
  }

  const remainingPrimary = otherWorn.find((row) => asRecord(row.payload).isPrimaryActual) ?? otherWorn[0];
  const remainingOutfitId = remainingPrimary ? String(asRecord(remainingPrimary.payload).actualOutfitId ?? asRecord(remainingPrimary.payload).outfitId ?? "") : undefined;
  for (const plan of sameDay.filter((row) => asRecord(row.payload).status === "changed" && asRecord(row.payload).actualOutfitId === legacyOutfitId)) {
    const payload = asRecord(plan.payload);
    const nextPayload = remainingOutfitId
      ? { ...payload, actualOutfitId: remainingOutfitId, updatedAt: now.toISOString() }
      : { ...payload, status: "planned", actualOutfitId: undefined, updatedAt: now.toISOString() };
    await tx.update(planTable).set({ revision: plan.revision + 1, originDeviceId: input.deviceId, payload: nextPayload, updatedAt: now }).where(eq(planTable.id, plan.id));
    await appendChange(tx, input.userId, "outfitPlan", plan.id, "update", plan.revision + 1, nextPayload);
  }

  const events = await tx.select().from(wearTable).where(and(eq(wearTable.userId, input.userId), isNull(wearTable.deletedAt))) as any[];
  for (const event of events.filter((row) => asRecord(row.payload).sourceOutfitId === input.entityId && String(asRecord(row.payload).wornAt).slice(0, 10) === dateKey)) {
    await tx.update(wearTable).set({ revision: event.revision + 1, deletedAt: now, updatedAt: now }).where(eq(wearTable.id, event.id));
    await appendChange(tx, input.userId, "wearEvent", event.id, "delete", event.revision + 1, {});
  }
  return { entity: toEntity({ id: input.entityId, revision: outfitRevision, payload: nextOutfitPayload, createdAt: outfit.createdAt, updatedAt: now }), revision: outfitRevision };
}

async function createWearEvent(tx: Tx, input: { userId: string; deviceId: string; now: Date; payload: Record<string, unknown> }): Promise<void> {
  const table = WORKSPACE_RESOURCES["wear-events"].table as AnyPgTable & Record<string, any>;
  const id = randomUUID();
  await tx.insert(table).values({ id, userId: input.userId, revision: 1, originDeviceId: input.deviceId, payload: input.payload, ...specialColumns("wear-events", input.payload), createdAt: input.now, updatedAt: input.now });
  await appendChange(tx, input.userId, "wearEvent", id, "create", 1, input.payload);
}

async function ownedActiveRow(tx: Tx, table: AnyPgTable & Record<string, any>, id: string, userId: string): Promise<any> {
  const [row] = await tx.select().from(table).where(and(eq(table.id, id), eq(table.userId, userId), isNull(table.deletedAt))).limit(1);
  if (!row) throw new WorkspaceApiError(404, "not_found", "数据不存在");
  return row;
}

function assertRevision(actual: number, expected: number, row: unknown): void {
  if (actual !== expected) throw new WorkspaceApiError(409, "conflict", "数据已在其他设备更新", false, row);
}

async function appendChange(tx: Tx, userId: string, entityType: any, entityId: string, operation: "create" | "update" | "delete", revision: number, payload: Record<string, unknown>) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`workspace-seq:${userId}`}))`);
  const [row] = await tx.select({ value: sql<number>`coalesce(max(${syncChanges.changeSeq}), 0) + 1` }).from(syncChanges).where(eq(syncChanges.userId, userId));
  await tx.insert(syncChanges).values({ userId, changeSeq: Number(row?.value ?? 1), entityType, entityId, operation, revision, payload });
}

async function applyAssetMutations(tx: Tx, input: {
  mutations: WorkspaceAssetMutation[];
  userId: string;
  entityId: string;
  entityType: string;
  clientMutationId: string;
  now: Date;
}): Promise<void> {
  for (const mutation of input.mutations) {
    if (mutation.kind === "remove") {
      await removeFieldBinding(tx, input.userId, input.entityType, input.entityId, mutation.fieldName, input.now);
      continue;
    }
    if (mutation.kind === "reuse") {
      await requireOwnedAsset(tx, mutation.assetId, input.userId);
      await replaceBinding(tx, { ...input, fieldName: mutation.fieldName, assetId: mutation.assetId });
      continue;
    }
    if (mutation.kind === "update_thumbnail") {
      const binding = await requireBinding(tx, input.userId, input.entityType, input.entityId, mutation.fieldName, mutation.assetId);
      const [temporary] = await temporaryRows(tx, [mutation.temporaryAssetId], input);
      if (temporary.temporaryVariant !== "thumbnail") throw new WorkspaceApiError(422, "image_upload", "更新裁切只能提交 thumbnail");
      const canonical = await requireOwnedAsset(tx, binding.assetId, input.userId);
      const thumbnailUpload = asRecord(asRecord(temporary.payload).uploads).thumbnail;
      const oldKey = canonical.thumbnailStorageKey;
      const payload = {
        ...asRecord(canonical.payload),
        uploads: { ...asRecord(asRecord(canonical.payload).uploads), thumbnail: thumbnailUpload },
        ...(oldKey && oldKey !== temporary.thumbnailStorageKey
          ? { staleStorageKeys: [...new Set([...stringList(asRecord(canonical.payload).staleStorageKeys), oldKey])] }
          : {}),
      };
      await tx.update(assets).set({
        thumbnailStorageKey: temporary.thumbnailStorageKey,
        payload,
        updatedAt: input.now,
      }).where(eq(assets.id, canonical.id));
      await consumeTemporaryRows(tx, [temporary.id], input.now);
      continue;
    }

    const rows = await temporaryRows(tx, mutation.temporaryAssetIds, input);
    if (rows.some((row) => row.fieldName !== mutation.fieldName)) throw new WorkspaceApiError(422, "image_upload", "临时图片字段与资产命令不一致");
    const original = rows.find((row) => row.temporaryVariant === "original");
    const thumbnail = rows.find((row) => row.temporaryVariant === "thumbnail");
    if (!original || !thumbnail) throw new WorkspaceApiError(422, "image_upload", "正式图片必须同时包含 original 和 thumbnail");
    const canonical = original;
    const uploads = {
      original: asRecord(asRecord(original.payload).uploads).original,
      thumbnail: asRecord(asRecord(thumbnail.payload).uploads).thumbnail,
    };
    await tx.update(assets).set({
      ownerEntityType: null,
      ownerEntityId: null,
      fieldName: null,
      temporarySessionId: null,
      clientMutationId: null,
      temporaryEntityType: null,
      temporaryVariant: null,
      expiresAt: null,
      boundAt: input.now,
      orphanedAt: null,
      originalStorageKey: original.originalStorageKey,
      thumbnailStorageKey: thumbnail.thumbnailStorageKey,
      sha256: original.sha256,
      mimeType: original.mimeType,
      sizeBytes: original.sizeBytes,
      width: original.width,
      height: original.height,
      payload: { uploads },
      updatedAt: input.now,
    }).where(eq(assets.id, canonical.id));
    await consumeTemporaryRows(tx, rows.filter((row) => row.id !== canonical.id).map((row) => row.id), input.now);
    await replaceBinding(tx, { ...input, fieldName: mutation.fieldName, assetId: canonical.id });
  }
}

async function temporaryRows(tx: Tx, ids: string[], input: { userId: string; entityType: string; clientMutationId: string; now: Date }) {
  const uniqueIds = [...new Set(ids)];
  const rows = await tx.select().from(assets).where(and(eq(assets.userId, input.userId), inArray(assets.id, uniqueIds), isNull(assets.deletedAt)));
  if (rows.length !== uniqueIds.length) throw new WorkspaceApiError(422, "image_upload", "临时图片不存在或不属于当前账号");
  for (const row of rows) {
    if (row.ownerEntityId || row.clientMutationId !== input.clientMutationId || row.temporaryEntityType !== input.entityType || !row.expiresAt || row.expiresAt <= input.now || row.uploadStatus !== "uploaded") {
      throw new WorkspaceApiError(422, "image_upload", "临时图片未上传完成、已过期或与本次保存不匹配");
    }
  }
  const slots = rows.map((row) => `${row.fieldName}:${row.temporaryVariant}`);
  if (new Set(slots).size !== slots.length) throw new WorkspaceApiError(422, "image_upload", "临时图片槽位重复");
  return rows;
}

async function consumeTemporaryRows(tx: Tx, ids: string[], now: Date): Promise<void> {
  if (!ids.length) return;
  await tx.update(assets).set({ deletedAt: now, originalStorageKey: null, thumbnailStorageKey: null, uploadStatus: "deleted", updatedAt: now }).where(inArray(assets.id, ids));
}

async function replaceBinding(tx: Tx, input: { userId: string; entityType: string; entityId: string; fieldName: string; assetId: string; now: Date }): Promise<void> {
  const [old] = await tx.select().from(assetBindings).where(and(
    eq(assetBindings.userId, input.userId),
    eq(assetBindings.ownerEntityType, input.entityType as typeof assetBindings.$inferSelect.ownerEntityType),
    eq(assetBindings.ownerEntityId, input.entityId),
    eq(assetBindings.fieldName, input.fieldName),
  )).limit(1);
  await upsertBinding(tx, input);
  if (old && old.assetId !== input.assetId) await markOrphanedIfUnbound(tx, old.assetId, input.userId, input.now);
}

async function upsertBinding(tx: Tx, input: { userId: string; entityType: string; entityId: string; fieldName: string; assetId: string; now: Date }): Promise<void> {
  await tx.insert(assetBindings).values({
    userId: input.userId,
    assetId: input.assetId,
    ownerEntityType: input.entityType as typeof assetBindings.$inferInsert.ownerEntityType,
    ownerEntityId: input.entityId,
    fieldName: input.fieldName,
    createdAt: input.now,
    updatedAt: input.now,
  }).onConflictDoUpdate({
    target: [assetBindings.userId, assetBindings.ownerEntityType, assetBindings.ownerEntityId, assetBindings.fieldName],
    set: { assetId: input.assetId, updatedAt: input.now },
  });
  await tx.update(assets).set({ orphanedAt: null, updatedAt: input.now }).where(and(eq(assets.id, input.assetId), eq(assets.userId, input.userId)));
}

async function removeFieldBinding(tx: Tx, userId: string, entityType: string, entityId: string, fieldName: string, now: Date): Promise<void> {
  const [old] = await tx.select().from(assetBindings).where(and(
    eq(assetBindings.userId, userId),
    eq(assetBindings.ownerEntityType, entityType as typeof assetBindings.$inferSelect.ownerEntityType),
    eq(assetBindings.ownerEntityId, entityId),
    eq(assetBindings.fieldName, fieldName),
  )).limit(1);
  if (!old) return;
  await tx.delete(assetBindings).where(eq(assetBindings.id, old.id));
  await markOrphanedIfUnbound(tx, old.assetId, userId, now);
}

async function removeOwnerBindings(tx: Tx, userId: string, entityType: string, entityId: string, now: Date): Promise<void> {
  const rows = await tx.select().from(assetBindings).where(and(
    eq(assetBindings.userId, userId),
    eq(assetBindings.ownerEntityType, entityType as typeof assetBindings.$inferSelect.ownerEntityType),
    eq(assetBindings.ownerEntityId, entityId),
  ));
  if (!rows.length) return;
  await tx.delete(assetBindings).where(inArray(assetBindings.id, rows.map((row) => row.id)));
  for (const assetId of new Set(rows.map((row) => row.assetId))) await markOrphanedIfUnbound(tx, assetId, userId, now);
}

async function markOrphanedIfUnbound(tx: Tx, assetId: string, userId: string, now: Date): Promise<void> {
  const [remaining] = await tx.select({ id: assetBindings.id }).from(assetBindings).where(and(eq(assetBindings.userId, userId), eq(assetBindings.assetId, assetId))).limit(1);
  if (!remaining) await tx.update(assets).set({ orphanedAt: now, updatedAt: now }).where(and(eq(assets.id, assetId), eq(assets.userId, userId)));
}

async function requireBinding(tx: Tx, userId: string, entityType: string, entityId: string, fieldName: string, assetId: string) {
  const [binding] = await tx.select().from(assetBindings).where(and(
    eq(assetBindings.userId, userId),
    eq(assetBindings.ownerEntityType, entityType as typeof assetBindings.$inferSelect.ownerEntityType),
    eq(assetBindings.ownerEntityId, entityId),
    eq(assetBindings.fieldName, fieldName),
    eq(assetBindings.assetId, assetId),
  )).limit(1);
  if (!binding) throw new WorkspaceApiError(422, "image_upload", "图片资产未绑定到当前字段");
  return binding;
}

async function requireOwnedAsset(tx: Tx, assetId: string, userId: string) {
  const [asset] = await tx.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.userId, userId), isNull(assets.deletedAt))).limit(1);
  if (!asset) throw new WorkspaceApiError(404, "not_found", "图片资产不存在");
  return asset;
}

async function readAssetRefs(tx: Tx, userId: string, entityType: string, entityId: string): Promise<Record<string, any> | undefined> {
  const rows = await tx.select({ binding: assetBindings, asset: assets }).from(assetBindings).innerJoin(assets, eq(assetBindings.assetId, assets.id)).where(and(
    eq(assetBindings.userId, userId),
    eq(assetBindings.ownerEntityType, entityType as typeof assetBindings.$inferSelect.ownerEntityType),
    eq(assetBindings.ownerEntityId, entityId),
    isNull(assets.deletedAt),
  ));
  if (!rows.length) return undefined;
  return Object.fromEntries(rows.flatMap(({ binding, asset }) => {
    const uploads = asRecord(asRecord(asset.payload).uploads);
    const variants = (["original", "thumbnail"] as const).filter((variant) => asRecord(uploads[variant]).status === "uploaded");
    if (!variants.length) return [];
    const original = asRecord(uploads.original);
    const thumbnail = asRecord(uploads.thumbnail);
    const primary = original.status === "uploaded" ? original : thumbnail;
    return [[binding.fieldName, {
      assetId: asset.id,
      variants,
      sha256: String(primary.sha256 ?? asset.sha256),
      mimeType: String(primary.mimeType ?? asset.mimeType),
      ...(asset.width ? { width: asset.width } : {}),
      ...(asset.height ? { height: asset.height } : {}),
      variantSha256: Object.fromEntries(variants.map((variant) => [variant, String(asRecord(uploads[variant]).sha256)])),
    }]];
  }));
}

function toEntity(row: { id: string; revision: number; payload: Record<string, unknown>; createdAt: Date; updatedAt: Date }, assetRefs?: Record<string, any>): WorkspaceEntity {
  return { id: row.id, revision: row.revision, payload: row.payload, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), ...(assetRefs ? { assetRefs } : {}) };
}

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const protectedKeys = new Set(["id", "userId", "revision", "createdAt", "updatedAt", "deletedAt", "originDeviceId"]);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !protectedKeys.has(key)));
}

function specialColumns(resource: WorkspaceResource, payload: Record<string, unknown>) {
  if (resource === "trip-plans") return { startDate: stringOrNull(payload.startDate), endDate: stringOrNull(payload.endDate) };
  if (resource === "outfit-plans") return { planDate: stringOrNull(payload.planDate ?? payload.date), tripPlanId: uuidOrNull(payload.tripPlanId), outfitId: uuidOrNull(payload.outfitId) };
  if (resource === "wear-events") return { wornAt: new Date(String(payload.wornAt ?? new Date().toISOString())), garmentId: uuidOrNull(payload.garmentId), outfitId: uuidOrNull(payload.outfitId) };
  if (resource === "profiles") return { profileType: typeof payload.profileType === "string" ? payload.profileType : "tryOn" };
  return {};
}

function stringOrNull(value: unknown): string | null { return typeof value === "string" ? value : null; }
function uuidOrNull(value: unknown): string | null { return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null; }
function asRecord(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function stringList(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []; }
function numberList(value: unknown): number[] { return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : []; }
function dateList(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []; }
function addDate(value: unknown, date: string): string[] { return [...new Set([...dateList(value), date])].sort(); }
function removeDate(value: unknown, date: string): string[] { return dateList(value).filter((entry) => entry !== date); }
function stableNumericId(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return Math.abs(hash) || 1;
}
