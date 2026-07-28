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
import { WeatherLocationRefSchema } from "@wardrobe/cloud-contracts";

import { getDb } from "../db/client.js";
import { assetBindings, assets, profiles, syncChanges, syncMutations } from "../db/schema.js";
import type * as schema from "../db/schema.js";
import { WorkspaceApiError } from "./errors.js";
import {
  normalizeGarmentPayload,
  normalizeWishlistPayload,
  normalizeWorkspacePayload,
} from "./payload-normalizer.js";
import { inheritGarmentFieldsToWishlist } from "./wishlist-inheritance.js";
import { WORKSPACE_RESOURCES, type WorkspaceResource } from "./query-service.js";

type Db = NodePgDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Mutation = WorkspaceCreateCommand | WorkspaceUpdateCommand | WorkspaceDeleteCommand;

class BatchMutationInProgressError extends Error {
  constructor() {
    super("batch mutation is already in progress");
  }
}

export class WorkspaceCommandService {
  constructor(private readonly injectedDb?: Db) {}

  async mutationResult(userId: string, clientMutationId: string): Promise<WorkspaceCommandResponse | null> {
    const [row] = await this.database().select({ response: syncMutations.response }).from(syncMutations).where(and(
      eq(syncMutations.userId, userId), eq(syncMutations.mutationId, clientMutationId),
    )).limit(1);
    return row?.response ? row.response as WorkspaceCommandResponse : null;
  }

  async create(input: { resource: WorkspaceResource; command: WorkspaceCreateCommand; userId: string; deviceId: string; requestId?: string }): Promise<WorkspaceCommandResponse> {
    if (input.resource === "profiles") return this.createOrUpdateProfile(input);
    return this.runMutation({ ...input, operation: "create", entityId: randomUUID() }, async (tx, entityId) => {
      const descriptor = WORKSPACE_RESOURCES[input.resource];
      const table = descriptor.table as AnyPgTable & Record<string, any>;
      const now = new Date();
      if (input.resource === "outfit-plans") {
        await lockOutfitPlanDates(tx, input.userId, [planDateFromPayload(input.command.payload)]);
      }
      const payload = await canonicalWorkspacePayload(tx, input.resource, input.userId, input.command.payload);
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

  private async createOrUpdateProfile(input: { resource: WorkspaceResource; command: WorkspaceCreateCommand; userId: string; deviceId: string; requestId?: string }): Promise<WorkspaceCommandResponse> {
    return this.runMutation({ ...input, operation: "create", entityId: randomUUID() }, async (tx, entityId) => {
      const table = profiles as AnyPgTable & Record<string, any>;
      const profileType = typeof input.command.payload.profileType === "string" ? input.command.payload.profileType : "tryOn";
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`workspace-profile:${input.userId}:${profileType}`}))`);
      const [existing] = await tx.select().from(table).where(and(
        eq(table.userId, input.userId), eq(table.profileType, profileType), isNull(table.deletedAt),
      )).limit(1) as any[];
      const now = new Date();
      const payload = await canonicalWorkspacePayload(tx, input.resource, input.userId, input.command.payload);
      const targetId = existing?.id ?? entityId;
      const revision = existing ? existing.revision + 1 : 1;
      if (existing) {
        await tx.update(table).set({ revision, originDeviceId: input.deviceId, payload, ...specialColumns("profiles", payload), updatedAt: now })
          .where(and(eq(table.id, targetId), eq(table.userId, input.userId), eq(table.revision, existing.revision), isNull(table.deletedAt)));
      } else {
        await tx.insert(table).values({
          id: targetId, userId: input.userId, revision, originDeviceId: input.deviceId,
          payload, ...specialColumns("profiles", payload), createdAt: now, updatedAt: now,
        });
      }
      await applyAssetMutations(tx, {
        mutations: input.command.assetMutations, userId: input.userId, entityId: targetId,
        entityType: "profile", clientMutationId: input.command.clientMutationId, now,
      });
      const assetRefs = await readAssetRefs(tx, input.userId, "profile", targetId);
      const entity = toEntity({ id: targetId, revision, payload, createdAt: existing?.createdAt ?? now, updatedAt: now }, assetRefs);
      await appendChange(tx, input.userId, "profile", targetId, existing ? "update" : "create", revision, payload);
      return { entity, revision };
    });
  }

  async batchCreate(input: { resource: WorkspaceResource; commands: WorkspaceCreateCommand[]; userId: string; deviceId: string; requestId?: string }): Promise<WorkspaceCommandResponse> {
    const mutationIds = new Set<string>();
    for (const command of input.commands) {
      if (mutationIds.has(command.clientMutationId)) {
        throw new WorkspaceApiError(400, "invalid_request", "批量提交包含重复的 clientMutationId");
      }
      mutationIds.add(command.clientMutationId);
    }

    // Batch creation is intentionally all-or-nothing. The previous per-item
    // transaction loop could commit item 1, fail item 2, then make the App
    // retry item 1 as if it had never been saved.
    try {
      return await this.database().transaction(async (tx) => {
        const entities: WorkspaceEntity[] = [];
        for (const command of input.commands) {
          const descriptor = WORKSPACE_RESOURCES[input.resource];
          const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtext(${`${input.userId}:${command.clientMutationId}`})) AS acquired`);
          if (!(lock.rows[0] as any)?.acquired) throw new BatchMutationInProgressError();
          const [existing] = await tx.select().from(syncMutations).where(and(
            eq(syncMutations.userId, input.userId), eq(syncMutations.mutationId, command.clientMutationId),
          )).limit(1);
          if (existing?.response) {
            const response = existing.response as WorkspaceCommandResponse;
            if (response.entity) entities.push(response.entity);
            continue;
          }

          const entityId = randomUUID();
          const table = descriptor.table as AnyPgTable & Record<string, any>;
          const now = new Date();
          if (input.resource === "outfit-plans") {
            await lockOutfitPlanDates(tx, input.userId, [planDateFromPayload(command.payload)]);
          }
          const payload = await canonicalWorkspacePayload(tx, input.resource, input.userId, command.payload);
          await tx.insert(table).values({
            id: entityId, userId: input.userId, revision: 1, originDeviceId: input.deviceId,
            payload, ...specialColumns(input.resource, payload), createdAt: now, updatedAt: now,
          });
          await applyAssetMutations(tx, {
            mutations: command.assetMutations, userId: input.userId, entityId,
            entityType: descriptor.entityType, clientMutationId: command.clientMutationId, now,
          });
          const assetRefs = await readAssetRefs(tx, input.userId, descriptor.entityType, entityId);
          const entity = toEntity({ id: entityId, revision: 1, payload, createdAt: now, updatedAt: now }, assetRefs);
          await appendChange(tx, input.userId, descriptor.entityType, entityId, "create", 1, payload);
          const response: WorkspaceCommandResponse = { status: "committed", entity, revision: 1, ...(input.requestId ? { requestId: input.requestId } : {}) };
          await tx.insert(syncMutations).values({
            userId: input.userId, mutationId: command.clientMutationId, entityType: descriptor.entityType,
            entityId, operation: "create", baseRevision: null, status: "accepted", resultRevision: 1,
            payload: command.payload, response,
          });
          entities.push(entity);
        }
        return { status: "committed", entities, ...(input.requestId ? { requestId: input.requestId } : {}) };
      });
    } catch (error) {
      if (error instanceof BatchMutationInProgressError) {
        return { status: "in_progress", ...(input.requestId ? { requestId: input.requestId } : {}) };
      }
      throw error;
    }
  }

  async update(input: { resource: WorkspaceResource; entityId: string; command: WorkspaceUpdateCommand; userId: string; deviceId: string; requestId?: string }): Promise<WorkspaceCommandResponse> {
    return this.runMutation({ ...input, operation: "update" }, async (tx) => {
      const descriptor = WORKSPACE_RESOURCES[input.resource];
      const table = descriptor.table as AnyPgTable & Record<string, any>;
      const row = await ownedActiveRow(tx, table, input.entityId, input.userId);
      assertRevision(row.revision, input.command.expectedRevision, row);
      if (input.resource === "outfit-plans") {
        await lockOutfitPlanDates(tx, input.userId, [planDateFromRow(row), planDateFromPayload(input.command.payload)]);
      }
      const now = new Date();
      const revision = row.revision + 1;
      const payload = await canonicalWorkspacePayload(tx, input.resource, input.userId, input.command.payload);
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
      if (input.resource === "outfit-plans") {
        await lockOutfitPlanDates(tx, input.userId, [planDateFromRow(row)]);
      }
      const now = new Date();
      const revision = row.revision + 1;
      await tx.update(table).set({ revision, originDeviceId: input.deviceId, deletedAt: now, updatedAt: now })
        .where(and(eq(table.id, input.entityId), eq(table.userId, input.userId), eq(table.revision, row.revision), isNull(table.deletedAt)));
      if (input.resource === "garments") {
        await cascadeDeletedGarmentReferences(tx, {
          userId: input.userId,
          deviceId: input.deviceId,
          garmentId: input.entityId,
          legacyItemId: numberOrNull(asRecord(row.payload).legacyItemId),
          now,
        });
      }
      if (input.resource === "outfits") {
        await cascadeDeletedOutfitReferences(tx, {
          userId: input.userId,
          deviceId: input.deviceId,
          outfitId: input.entityId,
          outfitPayload: asRecord(row.payload),
          now,
        });
      }
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

  async setOutfitPlanPrimary(input: { entityId: string; command: WorkspaceStateCommand; userId: string; deviceId: string; requestId?: string }): Promise<WorkspaceCommandResponse> {
    return this.runMutation({ ...input, resource: "outfit-plans", operation: "update" }, async (tx) => {
      const planTable = WORKSPACE_RESOURCES["outfit-plans"].table as AnyPgTable & Record<string, any>;
      const target = await ownedActiveRow(tx, planTable, input.entityId, input.userId);
      assertRevision(target.revision, input.command.expectedRevision, target);
      const targetPayload = asRecord(target.payload);
      if (targetPayload.status !== "planned") throw new WorkspaceApiError(409, "conflict", "只有计划中的穿搭才能设为当天主展示");
      const dateKey = String(targetPayload.date ?? "");
      if (!dateKey) throw new WorkspaceApiError(400, "invalid_request", "穿搭计划缺少日期");

      // 同一天的主展示是跨实体约束，按用户和日期加事务锁，避免并发请求留下两个主展示。
      await lockOutfitPlanDates(tx, input.userId, [dateKey]);
      const plans = await tx.select().from(planTable).where(and(eq(planTable.userId, input.userId), isNull(planTable.deletedAt))) as any[];
      const sameDay = plans.filter((row) => String(asRecord(row.payload).date ?? "") === dateKey);
      const now = new Date();
      let targetRevision = target.revision;
      let targetPayloadAfter = targetPayload;

      for (const plan of sameDay) {
        const payload = asRecord(plan.payload);
        if (payload.status !== "planned") continue;
        const shouldBePrimary = plan.id === target.id;
        if (Boolean(payload.isPrimary) === shouldBePrimary) continue;
        const revision = plan.revision + 1;
        const nextPayload = { ...payload, isPrimary: shouldBePrimary, updatedAt: now.toISOString() };
        await tx.update(planTable).set({ revision, originDeviceId: input.deviceId, payload: nextPayload, updatedAt: now })
          .where(and(eq(planTable.id, plan.id), eq(planTable.userId, input.userId), eq(planTable.revision, plan.revision), isNull(planTable.deletedAt)));
        await appendChange(tx, input.userId, "outfitPlan", plan.id, "update", revision, nextPayload);
        if (plan.id === target.id) {
          targetRevision = revision;
          targetPayloadAfter = nextPayload;
        }
      }

      return {
        entity: toEntity({ id: target.id, revision: targetRevision, payload: targetPayloadAfter, createdAt: target.createdAt, updatedAt: now }),
        revision: targetRevision,
      };
    });
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
      const payload = normalizeGarmentPayload({
        ...asRecord(row.payload), ...sanitizePayload(input.command.payload), sourceWishlistId: input.entityId,
        legacyItemId, locationId: input.command.locationId, status: "active", wornDates: [],
        createdAt: now.toISOString(), updatedAt: now.toISOString(),
      });
      await tx.insert(garmentTable).values({ id: garmentId, userId: input.userId, revision: 1, originDeviceId: input.deviceId, payload, ...specialColumns("garments", payload), createdAt: now, updatedAt: now });
      const wishlistPayload = normalizeWishlistPayload({ ...asRecord(row.payload), purchased: true, convertedGarmentId: garmentId, convertedItemId: legacyItemId, convertedAt: now.toISOString() });
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
      let restoredPayload = payload;
      if (garmentId) {
        const [garment] = await tx.select().from(garmentTable).where(and(eq(garmentTable.id, garmentId), eq(garmentTable.userId, input.userId), isNull(garmentTable.deletedAt))).limit(1) as any[];
        if (garment) {
          restoredPayload = inheritGarmentFieldsToWishlist(payload, asRecord(garment.payload));
          await tx.update(garmentTable).set({ revision: garment.revision + 1, deletedAt: now, updatedAt: now }).where(eq(garmentTable.id, garmentId));
          await cascadeDeletedGarmentReferences(tx, {
            userId: input.userId,
            deviceId: input.deviceId,
            garmentId,
            legacyItemId: numberOrNull(asRecord(garment.payload).legacyItemId),
            now,
            excludedWishlistId: input.entityId,
          });
          await removeOwnerBindings(tx, input.userId, "garment", garmentId, now);
          await appendChange(tx, input.userId, "garment", garmentId, "delete", garment.revision + 1, {});
        }
      }
      const nextPayload = normalizeWishlistPayload({ ...restoredPayload, purchased: false, convertedGarmentId: null, convertedItemId: null, convertedAt: null });
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
      if (input.resource === "outfit-plans") {
        await lockOutfitPlanDates(tx, input.userId, [input.command.wornAt.slice(0, 10)]);
      }
      const row = await ownedActiveRow(tx, table, input.entityId, input.userId);
      assertRevision(row.revision, input.command.expectedRevision, row);
      if (input.resource === "outfit-plans" && !input.command.outfitId && !uuidOrNull(asRecord(row.payload).outfitId)) {
        return markGarmentPlanWornTransaction(tx, input, row);
      }
      const wearEventId = randomUUID();
      const now = new Date();
      const wearPayload = input.resource === "garments"
        ? { garmentId: input.entityId, wornAt: input.command.wornAt }
        : { outfitPlanId: input.entityId, outfitId: input.command.outfitId ?? asRecord(row.payload).outfitId, wornAt: input.command.wornAt };
      await tx.insert(wearTable).values({ id: wearEventId, userId: input.userId, revision: 1, originDeviceId: input.deviceId, payload: wearPayload, ...specialColumns("wear-events", wearPayload), createdAt: now, updatedAt: now });
      const currentPayload = asRecord(row.payload);
      const rawNextPayload = {
        ...currentPayload,
        worn: true,
        wornAt: input.command.wornAt,
        wearEventId,
        ...(input.resource === "garments"
          ? { wornDates: addDate(currentPayload.wornDates, input.command.wornAt.slice(0, 10)) }
          : {}),
      };
      const nextPayload = input.resource === "garments" ? normalizeGarmentPayload(rawNextPayload) : rawNextPayload;
      const revision = row.revision + 1;
      await tx.update(table).set({ revision, originDeviceId: input.deviceId, payload: nextPayload, updatedAt: now }).where(eq(table.id, input.entityId));
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
      if (input.resource === "outfit-plans" && typeof input.command.date === "string") {
        await lockOutfitPlanDates(tx, input.userId, [input.command.date]);
      }
      const row = await ownedActiveRow(tx, table, input.entityId, input.userId);
      assertRevision(row.revision, input.command.expectedRevision, row);
      if (input.resource === "outfit-plans" && stringList(asRecord(row.payload).actualGarmentIds).length) {
        return cancelGarmentPlanWornTransaction(tx, input, row);
      }
      if (input.resource === "garments") {
        return cancelGarmentWearTransaction(tx, input, row);
      }
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
      const rawNextPayload = { ...payload, worn: false, wornAt: null, wearEventId: null };
      const nextPayload = rawNextPayload;
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

async function markGarmentPlanWornTransaction(tx: Tx, input: { entityId: string; command: WorkspaceDeleteCommand & { wornAt: string }; userId: string; deviceId: string }, row: any) {
  const garmentTable = WORKSPACE_RESOURCES.garments.table as AnyPgTable & Record<string, any>;
  const planTable = WORKSPACE_RESOURCES["outfit-plans"].table as AnyPgTable & Record<string, any>;
  const payload = asRecord(row.payload);
  const garmentIds = stringList(payload.garmentIds);
  if (!garmentIds.length) throw new WorkspaceApiError(409, "conflict", "计划没有可确认的衣物");
  const now = new Date();
  const dateKey = input.command.wornAt.slice(0, 10);
  const garments = await tx.select().from(garmentTable).where(and(eq(garmentTable.userId, input.userId), isNull(garmentTable.deletedAt))) as any[];
  const current = garments.filter((garment) => garmentIds.includes(garment.id));
  const snapshots = Array.isArray(payload.garmentSnapshots) ? payload.garmentSnapshots : [];
  for (const garment of current) {
    const garmentPayload = asRecord(garment.payload);
    const next = normalizeGarmentPayload({ ...garmentPayload, wornDates: addDate(garmentPayload.wornDates, dateKey), updatedAt: now.toISOString() });
    await tx.update(garmentTable).set({ revision: garment.revision + 1, originDeviceId: input.deviceId, payload: next, updatedAt: now }).where(eq(garmentTable.id, garment.id));
    await appendChange(tx, input.userId, "garment", garment.id, "update", garment.revision + 1, next);
    await createWearEvent(tx, { userId: input.userId, deviceId: input.deviceId, now, payload: { garmentId: garment.id, sourcePlanId: input.entityId, wornAt: input.command.wornAt } });
  }
  const nextPayload = { ...payload, status: "worn", wornDateLinked: dateKey, wearOrigin: "planned_confirmed", plannedBeforeWorn: true, isPrimaryActual: Boolean(payload.isPrimary), actualGarmentIds: garmentIds, actualGarmentSnapshots: snapshots, updatedAt: now.toISOString() };
  const revision = row.revision + 1;
  await tx.update(planTable).set({ revision, originDeviceId: input.deviceId, payload: nextPayload, updatedAt: now }).where(eq(planTable.id, input.entityId));
  await appendChange(tx, input.userId, "outfitPlan", input.entityId, "update", revision, nextPayload);
  return { entity: toEntity({ id: input.entityId, revision, payload: nextPayload, createdAt: row.createdAt, updatedAt: now }), revision };
}

async function cancelGarmentPlanWornTransaction(tx: Tx, input: { entityId: string; command: WorkspaceStateCommand; userId: string; deviceId: string }, row: any) {
  const garmentTable = WORKSPACE_RESOURCES.garments.table as AnyPgTable & Record<string, any>;
  const planTable = WORKSPACE_RESOURCES["outfit-plans"].table as AnyPgTable & Record<string, any>;
  const wearTable = WORKSPACE_RESOURCES["wear-events"].table as AnyPgTable & Record<string, any>;
  const payload = asRecord(row.payload);
  const dateKey = String(payload.wornDateLinked ?? payload.date ?? input.command.date ?? "");
  const ids = stringList(payload.actualGarmentIds);
  const now = new Date();
  const garments = await tx.select().from(garmentTable).where(and(eq(garmentTable.userId, input.userId), isNull(garmentTable.deletedAt))) as any[];
  for (const garment of garments.filter((item) => ids.includes(item.id))) {
    const garmentPayload = asRecord(garment.payload);
    const next = normalizeGarmentPayload({ ...garmentPayload, wornDates: removeDate(garmentPayload.wornDates, dateKey), updatedAt: now.toISOString() });
    await tx.update(garmentTable).set({ revision: garment.revision + 1, originDeviceId: input.deviceId, payload: next, updatedAt: now }).where(eq(garmentTable.id, garment.id));
    await appendChange(tx, input.userId, "garment", garment.id, "update", garment.revision + 1, next);
  }
  const events = await tx.select().from(wearTable).where(and(eq(wearTable.userId, input.userId), isNull(wearTable.deletedAt))) as any[];
  for (const event of events.filter((item) => asRecord(item.payload).sourcePlanId === input.entityId)) {
    await tx.update(wearTable).set({ revision: event.revision + 1, deletedAt: now, updatedAt: now }).where(eq(wearTable.id, event.id));
    await appendChange(tx, input.userId, "wearEvent", event.id, "delete", event.revision + 1, {});
  }
  const { wornDateLinked: _wornDateLinked, wearOrigin: _wearOrigin, plannedBeforeWorn: _plannedBeforeWorn, isPrimaryActual: _isPrimaryActual, actualGarmentIds: _actualGarmentIds, actualGarmentSnapshots: _actualGarmentSnapshots, ...restored } = payload;
  const nextPayload = { ...restored, status: "planned", updatedAt: now.toISOString() };
  const revision = row.revision + 1;
  await tx.update(planTable).set({ revision, originDeviceId: input.deviceId, payload: nextPayload, updatedAt: now }).where(eq(planTable.id, input.entityId));
  await appendChange(tx, input.userId, "outfitPlan", input.entityId, "update", revision, nextPayload);
  return { entity: toEntity({ id: input.entityId, revision, payload: nextPayload, createdAt: row.createdAt, updatedAt: now }), revision };
}

async function cancelGarmentWearTransaction(
  tx: Tx,
  input: { entityId: string; command: WorkspaceStateCommand; userId: string; deviceId: string },
  row: any,
) {
  const garmentTable = WORKSPACE_RESOURCES.garments.table as AnyPgTable & Record<string, any>;
  const wearTable = WORKSPACE_RESOURCES["wear-events"].table as AnyPgTable & Record<string, any>;
  const payload = asRecord(row.payload);
  const dateKey = typeof input.command.date === "string" && input.command.date
    ? input.command.date
    : typeof payload.wornAt === "string"
      ? payload.wornAt.slice(0, 10)
      : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new WorkspaceApiError(400, "invalid_request", "缺少穿着日期");
  }

  const now = new Date();
  const events = await tx.select().from(wearTable).where(and(
    eq(wearTable.userId, input.userId),
    eq(wearTable.garmentId, input.entityId),
    isNull(wearTable.deletedAt),
  )) as any[];
  for (const event of events.filter((item) => String(asRecord(item.payload).wornAt ?? "").slice(0, 10) === dateKey)) {
    await tx.update(wearTable).set({
      revision: event.revision + 1,
      originDeviceId: input.deviceId,
      deletedAt: now,
      updatedAt: now,
    }).where(and(
      eq(wearTable.id, event.id),
      eq(wearTable.userId, input.userId),
      eq(wearTable.revision, event.revision),
      isNull(wearTable.deletedAt),
    ));
    await appendChange(tx, input.userId, "wearEvent", event.id, "delete", event.revision + 1, {});
  }

  const nextPayload = normalizeGarmentPayload({
    ...payload,
    ...(typeof payload.wornAt !== "string" || payload.wornAt.slice(0, 10) === dateKey
      ? { worn: false, wornAt: null, wearEventId: null }
      : {}),
    wornDates: removeDate(payload.wornDates, dateKey),
    updatedAt: now.toISOString(),
  });
  const revision = row.revision + 1;
  await tx.update(garmentTable).set({
    revision,
    originDeviceId: input.deviceId,
    payload: nextPayload,
    updatedAt: now,
  }).where(and(
    eq(garmentTable.id, input.entityId),
    eq(garmentTable.userId, input.userId),
    eq(garmentTable.revision, row.revision),
    isNull(garmentTable.deletedAt),
  ));
  await appendChange(tx, input.userId, "garment", input.entityId, "update", revision, nextPayload);
  return {
    entity: toEntity({
      id: input.entityId,
      revision,
      payload: nextPayload,
      createdAt: row.createdAt,
      updatedAt: now,
    }),
    revision,
  };
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
  await lockOutfitPlanDates(tx, input.userId, [dateKey]);
  const outfitPayload = asRecord(outfit.payload);
  const canonicalOutfitId = input.entityId;
  const itemIds = numberList(outfitPayload.legacyItemIds ?? outfitPayload.itemIds);

  const nextOutfitPayload = { ...outfitPayload, wornDates: addDate(outfitPayload.wornDates, dateKey), updatedAt: now.toISOString() };
  const outfitRevision = outfit.revision + 1;
  await tx.update(outfitTable).set({ revision: outfitRevision, originDeviceId: input.deviceId, payload: nextOutfitPayload, updatedAt: now }).where(eq(outfitTable.id, input.entityId));
  await appendChange(tx, input.userId, "outfit", input.entityId, "update", outfitRevision, nextOutfitPayload);

  const garments = await tx.select().from(garmentTable).where(and(eq(garmentTable.userId, input.userId), isNull(garmentTable.deletedAt))) as any[];
  const wornGarments = garments.filter((row) => itemIds.includes(Number(asRecord(row.payload).legacyItemId)));
  for (const garment of wornGarments) {
    const payload = asRecord(garment.payload);
    const nextPayload = normalizeGarmentPayload({ ...payload, wornDates: addDate(payload.wornDates, dateKey), updatedAt: now.toISOString() });
    await tx.update(garmentTable).set({ revision: garment.revision + 1, originDeviceId: input.deviceId, payload: nextPayload, updatedAt: now }).where(eq(garmentTable.id, garment.id));
    await appendChange(tx, input.userId, "garment", garment.id, "update", garment.revision + 1, nextPayload);
  }

  const plans = await tx.select().from(planTable).where(and(eq(planTable.userId, input.userId), isNull(planTable.deletedAt))) as any[];
  const sameDay = plans.filter((row) => String(asRecord(row.payload).date ?? "") === dateKey);
  const alreadyWorn = sameDay.find((row) => {
    const payload = asRecord(row.payload);
    return payload.status === "worn" && (payload.outfitId === canonicalOutfitId || payload.actualOutfitId === canonicalOutfitId);
  });
  if (!alreadyWorn) {
    const planned = sameDay.find((row) => {
      const payload = asRecord(row.payload);
      return payload.outfitId === canonicalOutfitId && (payload.status === "planned" || payload.status === "changed");
    });
    if (planned) {
      const payload = asRecord(planned.payload);
      const wantsPrimaryActual = Boolean(payload.isPrimary);
      if (wantsPrimaryActual) {
        for (const other of sameDay) {
          const otherPayload = asRecord(other.payload);
          if (other.id === planned.id || otherPayload.status !== "worn" || otherPayload.isPrimaryActual !== true) continue;
          const demoted = { ...otherPayload, isPrimaryActual: false, updatedAt: now.toISOString() };
          await tx.update(planTable).set({ revision: other.revision + 1, originDeviceId: input.deviceId, payload: demoted, updatedAt: now })
            .where(and(eq(planTable.id, other.id), eq(planTable.userId, input.userId), eq(planTable.revision, other.revision), isNull(planTable.deletedAt)));
          await appendChange(tx, input.userId, "outfitPlan", other.id, "update", other.revision + 1, demoted);
        }
      }
      const nextPayload = {
        ...payload, status: "worn", wornDateLinked: dateKey, actualOutfitId: canonicalOutfitId,
        wearOrigin: "planned_confirmed", plannedBeforeWorn: true, isPrimaryActual: wantsPrimaryActual, updatedAt: now.toISOString(),
      };
      await tx.update(planTable).set({ revision: planned.revision + 1, originDeviceId: input.deviceId, payload: nextPayload, actualOutfitId: canonicalOutfitId, updatedAt: now }).where(eq(planTable.id, planned.id));
      await appendChange(tx, input.userId, "outfitPlan", planned.id, "update", planned.revision + 1, nextPayload);
    } else {
      const planId = randomUUID();
      const payload = {
        date: dateKey, outfitId: canonicalOutfitId, actualOutfitId: canonicalOutfitId,
        status: "worn", wornDateLinked: dateKey, wearOrigin: "manual_actual", plannedBeforeWorn: false,
        isPrimaryActual: !sameDay.some((row) => asRecord(row.payload).status === "worn"), createdAt: now.toISOString(), updatedAt: now.toISOString(),
      };
      await tx.insert(planTable).values({ id: planId, userId: input.userId, revision: 1, originDeviceId: input.deviceId, payload, planDate: dateKey, outfitId: canonicalOutfitId, actualOutfitId: canonicalOutfitId, createdAt: now, updatedAt: now });
      await appendChange(tx, input.userId, "outfitPlan", planId, "create", 1, payload);
    }
    for (const plan of sameDay) {
      const payload = asRecord(plan.payload);
      if (payload.status !== "planned" || !payload.isPrimary || payload.outfitId === canonicalOutfitId) continue;
      const nextPayload = { ...payload, status: "changed", actualOutfitId: canonicalOutfitId, updatedAt: now.toISOString() };
      await tx.update(planTable).set({ revision: plan.revision + 1, originDeviceId: input.deviceId, payload: nextPayload, actualOutfitId: canonicalOutfitId, updatedAt: now }).where(eq(planTable.id, plan.id));
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
  await lockOutfitPlanDates(tx, input.userId, [dateKey]);
  const now = new Date();
  const outfitPayload = asRecord(outfit.payload);
  const canonicalOutfitId = input.entityId;
  const itemIds = numberList(outfitPayload.legacyItemIds ?? outfitPayload.itemIds);

  const plans = await tx.select().from(planTable).where(and(eq(planTable.userId, input.userId), isNull(planTable.deletedAt))) as any[];
  const sameDay = plans.filter((row) => String(asRecord(row.payload).date ?? "") === dateKey);
  const cancelledPlans = sameDay.filter((row) => {
    const payload = asRecord(row.payload);
    return payload.status === "worn" && (payload.outfitId === canonicalOutfitId || payload.actualOutfitId === canonicalOutfitId);
  });
  for (const plan of cancelledPlans) {
    const payload = asRecord(plan.payload);
    if (payload.wearOrigin === "planned_confirmed" || payload.plannedBeforeWorn) {
      const hasOtherPrimary = sameDay.some((row) => row.id !== plan.id && asRecord(row.payload).status === "planned" && asRecord(row.payload).isPrimary);
      const nextPayload = {
        ...payload, status: "planned", isPrimary: !hasOtherPrimary, wornDateLinked: undefined,
        actualOutfitId: undefined, wearOrigin: undefined, plannedBeforeWorn: undefined, isPrimaryActual: undefined, updatedAt: now.toISOString(),
      };
      await tx.update(planTable).set({ revision: plan.revision + 1, originDeviceId: input.deviceId, payload: nextPayload, actualOutfitId: null, updatedAt: now }).where(eq(planTable.id, plan.id));
      await appendChange(tx, input.userId, "outfitPlan", plan.id, "update", plan.revision + 1, nextPayload);
    } else {
      await tx.update(planTable).set({ revision: plan.revision + 1, originDeviceId: input.deviceId, deletedAt: now, updatedAt: now }).where(eq(planTable.id, plan.id));
      await appendChange(tx, input.userId, "outfitPlan", plan.id, "delete", plan.revision + 1, {});
    }
  }

  const otherWorn = sameDay.filter((row) => !cancelledPlans.some((cancelled) => cancelled.id === row.id) && asRecord(row.payload).status === "worn");
  const otherOutfitIds = otherWorn.map((row) => String(asRecord(row.payload).actualOutfitId ?? asRecord(row.payload).outfitId ?? ""));
  const allOutfits = await tx.select().from(outfitTable).where(and(eq(outfitTable.userId, input.userId), isNull(outfitTable.deletedAt))) as any[];
  const otherWornItemIds = new Set(allOutfits
    .filter((row) => otherOutfitIds.includes(row.id))
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
    const nextPayload = normalizeGarmentPayload({ ...payload, wornDates: removeDate(payload.wornDates, dateKey), updatedAt: now.toISOString() });
    await tx.update(garmentTable).set({ revision: garment.revision + 1, originDeviceId: input.deviceId, payload: nextPayload, updatedAt: now }).where(eq(garmentTable.id, garment.id));
    await appendChange(tx, input.userId, "garment", garment.id, "update", garment.revision + 1, nextPayload);
  }

  const remainingPrimary = otherWorn.find((row) => asRecord(row.payload).isPrimaryActual) ?? otherWorn[0];
  const remainingOutfitId = remainingPrimary ? String(asRecord(remainingPrimary.payload).actualOutfitId ?? asRecord(remainingPrimary.payload).outfitId ?? "") : undefined;
  for (const plan of sameDay.filter((row) => asRecord(row.payload).status === "changed" && asRecord(row.payload).actualOutfitId === canonicalOutfitId)) {
    const payload = asRecord(plan.payload);
    const nextPayload = remainingOutfitId
      ? { ...payload, actualOutfitId: remainingOutfitId, updatedAt: now.toISOString() }
      : { ...payload, status: "planned", actualOutfitId: undefined, updatedAt: now.toISOString() };
    await tx.update(planTable).set({ revision: plan.revision + 1, originDeviceId: input.deviceId, payload: nextPayload, actualOutfitId: uuidOrNull(remainingOutfitId), updatedAt: now }).where(eq(planTable.id, plan.id));
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

async function cascadeDeletedGarmentReferences(tx: Tx, input: {
  userId: string;
  deviceId: string;
  garmentId: string;
  legacyItemId: number | null;
  now: Date;
  excludedWishlistId?: string;
}): Promise<void> {
  const resources = ["outfits", "outfit-plans", "wishlist", "wear-events"] as const;
  for (const resource of resources) {
    const descriptor = WORKSPACE_RESOURCES[resource];
    const table = descriptor.table as AnyPgTable & Record<string, any>;
    const rows = await tx.select().from(table).where(and(eq(table.userId, input.userId), isNull(table.deletedAt))) as any[];
    for (const row of rows) {
      if (resource === "wishlist" && row.id === input.excludedWishlistId) continue;
      const cleanup = removeGarmentReferences(resource, asRecord(row.payload), input.garmentId, input.legacyItemId, input.now.toISOString());
      if (!cleanup.changed) continue;
      const revision = row.revision + 1;
      if (cleanup.deleteEntity) {
        await tx.update(table).set({
          revision,
          originDeviceId: input.deviceId,
          deletedAt: input.now,
          updatedAt: input.now,
          ...(resource === "wear-events" ? { garmentId: null } : {}),
        }).where(and(eq(table.id, row.id), eq(table.userId, input.userId), eq(table.revision, row.revision), isNull(table.deletedAt)));
        await appendChange(tx, input.userId, descriptor.entityType, row.id, "delete", revision, {});
        continue;
      }
      const payload = { ...cleanup.payload, updatedAt: input.now.toISOString() };
      await tx.update(table).set({
        revision,
        originDeviceId: input.deviceId,
        payload,
        ...specialColumns(resource, payload),
        updatedAt: input.now,
      }).where(and(eq(table.id, row.id), eq(table.userId, input.userId), eq(table.revision, row.revision), isNull(table.deletedAt)));
      await appendChange(tx, input.userId, descriptor.entityType, row.id, "update", revision, payload);
    }
  }
}

async function cascadeDeletedOutfitReferences(tx: Tx, input: {
  userId: string;
  deviceId: string;
  outfitId: string;
  outfitPayload: Record<string, unknown>;
  now: Date;
}): Promise<void> {
  const table = WORKSPACE_RESOURCES["outfit-plans"].table as AnyPgTable & Record<string, any>;
  const rows = await tx.select().from(table).where(and(eq(table.userId, input.userId), isNull(table.deletedAt))) as any[];
  for (const row of rows) {
    const payload = asRecord(row.payload);
    const referencesPlanned = row.outfitId === input.outfitId || payload.outfitId === input.outfitId;
    const referencesActual = row.actualOutfitId === input.outfitId || payload.actualOutfitId === input.outfitId;
    if (!referencesPlanned && !referencesActual) continue;
    const revision = row.revision + 1;
    if (payload.status !== "worn" && referencesPlanned) {
      await tx.update(table).set({ revision, originDeviceId: input.deviceId, deletedAt: input.now, updatedAt: input.now })
        .where(and(eq(table.id, row.id), eq(table.userId, input.userId), eq(table.revision, row.revision), isNull(table.deletedAt)));
      await appendChange(tx, input.userId, "outfitPlan", row.id, "delete", revision, {});
      continue;
    }
    const nextPayload = {
      ...payload,
      ...(referencesPlanned ? { outfitId: undefined } : {}),
      ...(referencesActual ? { actualOutfitId: undefined } : {}),
      deletedOutfitSnapshot: payload.deletedOutfitSnapshot ?? {
        name: input.outfitPayload.name,
        title: payload.title,
        deletedAt: input.now.toISOString(),
      },
      updatedAt: input.now.toISOString(),
    };
    await tx.update(table).set({
      revision,
      originDeviceId: input.deviceId,
      payload: nextPayload,
      ...(referencesPlanned ? { outfitId: null } : {}),
      ...(referencesActual ? { actualOutfitId: null } : {}),
      updatedAt: input.now,
    }).where(and(eq(table.id, row.id), eq(table.userId, input.userId), eq(table.revision, row.revision), isNull(table.deletedAt)));
    await appendChange(tx, input.userId, "outfitPlan", row.id, "update", revision, nextPayload);
  }
}

export function removeGarmentReferences(
  resource: "outfits" | "outfit-plans" | "wishlist" | "wear-events",
  payload: Record<string, unknown>,
  garmentId: string,
  legacyItemId: number | null,
  deletedAt = new Date().toISOString(),
): { changed: boolean; deleteEntity: boolean; payload: Record<string, unknown> } {
  if (resource === "wear-events") {
    const referencesGarment = payload.garmentId === garmentId
      || (legacyItemId !== null && payload.garmentId === legacyItemId)
      || (legacyItemId !== null && payload.itemId === legacyItemId);
    return { changed: referencesGarment, deleteEntity: referencesGarment, payload };
  }

  if (resource === "outfit-plans" && payload.sourceType === "daily_recommendation" && Array.isArray(payload.garmentIds) && payload.garmentIds.includes(garmentId)) {
    const unavailableGarmentIds = [...new Set([...(Array.isArray(payload.unavailableGarmentIds) ? payload.unavailableGarmentIds.filter((id): id is string => typeof id === "string") : []), garmentId])];
    const deletionDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(deletedAt));
    const isFutureOrToday = typeof payload.date === "string" && payload.date >= deletionDate;
    return { changed: true, deleteEntity: false, payload: { ...payload, unavailableGarmentIds, availability: isFutureOrToday ? "blocked" : "historical", unavailableSince: deletedAt } };
  }

  const next = { ...payload };
  let changed = false;
  for (const key of ["itemIds", "legacyItemIds", "garmentIds", "legacyGarmentIds"] as const) {
    if (!Array.isArray(next[key])) continue;
    const filtered = next[key].filter((value) => value !== garmentId && (legacyItemId === null || value !== legacyItemId));
    if (filtered.length !== next[key].length) {
      next[key] = filtered;
      changed = true;
    }
  }
  for (const key of ["garmentId", "convertedGarmentId"] as const) {
    if (next[key] === garmentId) {
      next[key] = null;
      changed = true;
    }
  }
  for (const key of ["itemId", "convertedItemId"] as const) {
    if (legacyItemId !== null && next[key] === legacyItemId) {
      next[key] = null;
      changed = true;
    }
  }
  if (resource === "wishlist" && changed) {
    next.convertedAt = null;
    next.convertedItemDeletedAt = deletedAt;
  }
  return { changed, deleteEntity: false, payload: next };
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

async function canonicalWorkspacePayload(
  tx: Tx,
  resource: WorkspaceResource,
  userId: string,
  rawPayload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const payload = normalizeWorkspacePayload(resource, sanitizePayload(rawPayload));
  assertNoLegacyIdentifiers(payload);
  if (resource === "trip-plans") {
    if (!Object.prototype.hasOwnProperty.call(payload, "weatherLocation")) return payload;
    const weatherLocation = WeatherLocationRefSchema.safeParse(payload.weatherLocation);
    if (!weatherLocation.success) throw new WorkspaceApiError(422, "invalid_request", "行程天气地点必须是已确认的标准地点");
    return { ...payload, weatherLocation: weatherLocation.data };
  }
  if (resource === "outfits") return payload;
  if (resource !== "outfit-plans") return payload;

  const canonical = { ...payload };
  const sourceType = canonical.sourceType ?? (canonical.outfitId ? "saved_outfit" : undefined);
  if (sourceType === "daily_recommendation" || sourceType === "manual_items") {
    const garmentIds = Array.isArray(canonical.garmentIds) ? [...new Set(canonical.garmentIds.filter((id): id is string => typeof id === "string"))] : [];
    const minimum = sourceType === "daily_recommendation" ? 2 : 1;
    if (garmentIds.length < minimum || (sourceType === "daily_recommendation" && (typeof canonical.recommendationId !== "string" || typeof canonical.recommendationCandidateId !== "string"))) {
      throw new WorkspaceApiError(422, "invalid_request", "计划来源与衣物 UUID 不完整");
    }
    for (const garmentId of garmentIds) await ownedActiveRow(tx, WORKSPACE_RESOURCES.garments.table as AnyPgTable & Record<string, any>, requireUuid(garmentId, "计划衣物 UUID 无效"), userId);
    canonical.sourceType = sourceType;
    canonical.garmentIds = garmentIds;
    delete canonical.outfitId;
  } else {
    canonical.sourceType = "saved_outfit";
    const outfitId = requireUuid(canonical.outfitId, "穿搭计划缺少有效的套装 UUID");
    await ownedActiveRow(tx, WORKSPACE_RESOURCES.outfits.table as AnyPgTable & Record<string, any>, outfitId, userId);
    canonical.outfitId = outfitId;
  }

  if (canonical.actualOutfitId !== undefined && canonical.actualOutfitId !== null && canonical.actualOutfitId !== "") {
    const actualOutfitId = requireUuid(canonical.actualOutfitId, "实际穿着缺少有效的套装 UUID");
    await ownedActiveRow(tx, WORKSPACE_RESOURCES.outfits.table as AnyPgTable & Record<string, any>, actualOutfitId, userId);
    canonical.actualOutfitId = actualOutfitId;
  } else {
    delete canonical.actualOutfitId;
  }

  const tripPlanId = canonical.tripPlanId ?? canonical.calendarPlanId;
  if (tripPlanId !== undefined && tripPlanId !== null && tripPlanId !== "") {
    const canonicalTripPlanId = requireUuid(tripPlanId, "穿搭计划缺少有效的行程 UUID");
    await ownedActiveRow(tx, WORKSPACE_RESOURCES["trip-plans"].table as AnyPgTable & Record<string, any>, canonicalTripPlanId, userId);
    canonical.tripPlanId = canonicalTripPlanId;
    canonical.calendarPlanId = canonicalTripPlanId;
  } else {
    delete canonical.tripPlanId;
    delete canonical.calendarPlanId;
  }
  return canonical;
}

function assertNoLegacyIdentifiers(payload: Record<string, unknown>): void {
  const legacyKeys = ["legacyOutfitId", "legacyPlanEntryId", "legacyCalendarPlanId"];
  const found = legacyKeys.find((key) => Object.prototype.hasOwnProperty.call(payload, key));
  if (found) throw new WorkspaceApiError(422, "invalid_request", `旧标识 ${found} 已停用，请刷新客户端后重试`);
}

async function lockOutfitPlanDates(tx: Tx, userId: string, dates: Array<string | null | undefined>): Promise<void> {
  const normalized = [...new Set(dates.filter((date): date is string => Boolean(date)).map((date) => date.slice(0, 10)))].sort();
  for (const date of normalized) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`workspace-plan-date:${userId}:${date}`}))`);
  }
}

function planDateFromPayload(payload: Record<string, unknown>): string | null {
  const value = payload.planDate ?? payload.date;
  return typeof value === "string" && value ? value : null;
}

function planDateFromRow(row: Record<string, any>): string | null {
  return typeof row.planDate === "string" && row.planDate ? row.planDate : planDateFromPayload(asRecord(row.payload));
}

function specialColumns(resource: WorkspaceResource, payload: Record<string, unknown>) {
  if (resource === "trip-plans") return { startDate: stringOrNull(payload.startDate), endDate: stringOrNull(payload.endDate) };
  if (resource === "outfit-plans") return { planDate: stringOrNull(payload.planDate ?? payload.date), tripPlanId: uuidOrNull(payload.tripPlanId ?? payload.calendarPlanId), outfitId: uuidOrNull(payload.outfitId), actualOutfitId: uuidOrNull(payload.actualOutfitId) };
  if (resource === "wear-events") return { wornAt: new Date(String(payload.wornAt ?? new Date().toISOString())), garmentId: uuidOrNull(payload.garmentId), outfitId: uuidOrNull(payload.outfitId) };
  if (resource === "profiles") return { profileType: typeof payload.profileType === "string" ? payload.profileType : "tryOn" };
  return {};
}

function stringOrNull(value: unknown): string | null { return typeof value === "string" ? value : null; }
function numberOrNull(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function uuidOrNull(value: unknown): string | null { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null; }
function requireUuid(value: unknown, message: string): string {
  const uuid = uuidOrNull(value);
  if (!uuid) throw new WorkspaceApiError(422, "invalid_request", message);
  return uuid;
}
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
