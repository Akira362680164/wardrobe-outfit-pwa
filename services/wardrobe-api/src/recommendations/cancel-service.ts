import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  CancelPrimaryPlanResponseSchema,
  type CancelPrimaryPlanCommand,
  type CancelPrimaryPlanResponse,
} from "@wardrobe/cloud-contracts";
import { getPostgresPool } from "../db/client.js";
import { WorkspaceApiError } from "../workspace/errors.js";

export type RecommendationPlanCancelStage = "afterValidation" | "afterPrimaryCancel" | "afterBackupPromotion" | "afterAudit" | "beforeCommit";

export class RecommendationPlanCancelService {
  constructor(
    private readonly pool: Pool = getPostgresPool(),
    private readonly options: { fault?: (stage: RecommendationPlanCancelStage) => void | Promise<void>; clock?: () => Date } = {},
  ) {}

  async cancel(userId: string, deviceId: string, command: CancelPrimaryPlanCommand): Promise<CancelPrimaryPlanResponse> {
    const fingerprint = digest(command);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`recommendation-cancel-mutation:${userId}:${command.clientMutationId}`]);
      const replay = await client.query("select payload,response_json from sync_mutations where user_id=$1 and mutation_id=$2 for update", [userId, command.clientMutationId]);
      if (replay.rows[0]) {
        if (replay.rows[0].payload?.cancelPrimaryFingerprint !== fingerprint) throw conflict("mutation_payload_conflict");
        await client.query("commit");
        return CancelPrimaryPlanResponseSchema.parse({ ...replay.rows[0].response_json, idempotentReplay: true });
      }

      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`workspace-plan-date:${userId}:${command.targetDate}`]);
      const primaryResult = await client.query("select *,plan_date::text as plan_date_key from outfit_plans where id=$1 and user_id=$2 and deleted_at is null for update", [command.primary.planEntryId, userId]);
      const primary = primaryResult.rows[0];
      validatePrimary(primary, command);
      let backup: any | undefined;
      if (command.promoteBackup) {
        const backupResult = await client.query("select *,plan_date::text as plan_date_key from outfit_plans where id=$1 and user_id=$2 and deleted_at is null for update", [command.promoteBackup.planEntryId, userId]);
        backup = backupResult.rows[0];
        validateBackup(backup, command);
      }
      await this.options.fault?.("afterValidation");

      const now = (this.options.clock ?? (() => new Date()))().toISOString();
      const canceledPayload = { ...primary.payload, status: "canceled", role: "backup", isPrimary: false, canceledAt: now, updatedAt: now };
      const canceledRevision = primary.revision + 1;
      const canceled = await client.query("update outfit_plans set revision=$1,origin_device_id=$2,payload=$3::jsonb,updated_at=$4 where id=$5 and revision=$6", [canceledRevision, deviceId, JSON.stringify(canceledPayload), now, primary.id, primary.revision]);
      if (canceled.rowCount !== 1) throw conflict("primary_plan_changed");
      await appendChange(client, userId, primary.id, canceledRevision, canceledPayload);
      await this.options.fault?.("afterPrimaryCancel");

      let activePrimary: CancelPrimaryPlanResponse["activePrimary"] = null;
      if (backup) {
        const promotedPayload = { ...backup.payload, status: "planned", role: "primary", isPrimary: true, promotedAt: now, updatedAt: now };
        const promotedRevision = backup.revision + 1;
        const promoted = await client.query("update outfit_plans set revision=$1,origin_device_id=$2,payload=$3::jsonb,updated_at=$4 where id=$5 and revision=$6", [promotedRevision, deviceId, JSON.stringify(promotedPayload), now, backup.id, backup.revision]);
        if (promoted.rowCount !== 1) throw conflict("backup_plan_changed");
        await appendChange(client, userId, backup.id, promotedRevision, promotedPayload);
        activePrimary = { planEntryId: backup.id, revision: promotedRevision };
      }
      await this.options.fault?.("afterBackupPromotion");

      const response = CancelPrimaryPlanResponseSchema.parse({
        status: "committed", idempotentReplay: false, targetDate: command.targetDate,
        canceledPrimary: { planEntryId: primary.id, revision: canceledRevision }, activePrimary,
      });
      await client.query("insert into sync_mutations(user_id,mutation_id,entity_type,entity_id,operation,status,result_revision,payload,response_json,created_at,updated_at) values($1,$2,'outfitPlan',$3,'update','accepted',$4,$5::jsonb,$6::jsonb,$7,$7)", [userId, command.clientMutationId, primary.id, canceledRevision, JSON.stringify({ cancelPrimaryFingerprint: fingerprint, command }), JSON.stringify(response), now]);
      await this.options.fault?.("afterAudit");
      await this.options.fault?.("beforeCommit");
      await client.query("commit");
      return response;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function validatePrimary(row: any, command: CancelPrimaryPlanCommand) {
  if (!row || row.revision !== command.primary.expectedRevision) throw conflict("primary_plan_changed");
  const payload = row.payload ?? {};
  if (String(row.plan_date_key ?? planDate(row.plan_date)) !== command.targetDate) throw conflict("plan_date_mismatch");
  if (payload.status === "worn" || Array.isArray(payload.actualGarmentIds)) throw conflict("plan_already_worn");
  if (payload.status !== "planned" || payload.isPrimary !== true || payload.role !== "primary") throw conflict("primary_plan_changed");
}

function validateBackup(row: any, command: CancelPrimaryPlanCommand) {
  if (!row || !command.promoteBackup || row.revision !== command.promoteBackup.expectedRevision) throw conflict("backup_plan_changed");
  const payload = row.payload ?? {};
  if (String(row.plan_date_key ?? planDate(row.plan_date)) !== command.targetDate) throw conflict("plan_date_mismatch");
  if (payload.status !== "planned" || payload.isPrimary === true || payload.role !== "backup") throw conflict("backup_not_available");
}

async function appendChange(client: PoolClient, userId: string, entityId: string, revision: number, payload: unknown) {
  await client.query("select pg_advisory_xact_lock(hashtext($1))", [`workspace-seq:${userId}`]);
  await client.query("insert into sync_changes(user_id,change_seq,entity_type,entity_id,operation,revision,payload) select $1,coalesce(max(change_seq),0)+1,'outfitPlan',$2,'update',$3,$4::jsonb from sync_changes where user_id=$1", [userId, entityId, revision, JSON.stringify(payload)]);
}

function conflict(reasonCode: string) {
  const details = { reasonCode };
  return new WorkspaceApiError(409, "conflict", reasonCode, false, details, details);
}
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function planDate(value: unknown) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }
