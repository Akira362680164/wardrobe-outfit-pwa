import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  PublishDailyRecommendationCommandSchema,
  RealDateSchema,
  type DailyRecommendationRecord,
  type PublishDailyRecommendationCommand,
} from "@wardrobe/cloud-contracts";

import { RecommendationPersistenceRepository } from "./persistence-repository.js";

export type RecommendationPublishStage = "afterInsert" | "afterSupersede" | "afterPromote" | "beforeCommit";
export type RecommendationPublishFaultHook = (stage: RecommendationPublishStage, context: { client: PoolClient; recordId: string }) => void | Promise<void>;
export interface RecommendationPublishFence { requestIds: string[]; claimToken: string; generationBatchId: string }

export class RecommendationGenerationConflictError extends Error {
  readonly code = "RECOMMENDATION_GENERATION_REQUEST_CONFLICT";
  constructor() {
    super("generationRequestId was already used with different recommendation content");
  }
}

export class RecommendationPersistenceService {
  constructor(
    private readonly pool: Pool,
    private readonly repository = new RecommendationPersistenceRepository(),
    private readonly faultHook?: RecommendationPublishFaultHook,
  ) {}

  async publish(input: unknown, fence?: RecommendationPublishFence): Promise<DailyRecommendationRecord> {
    const command = PublishDailyRecommendationCommandSchema.parse(input);
    const fingerprint = recommendationPayloadFingerprint(command);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      try {
        if (fence) await assertPublishFence(client, fence);
        await this.repository.acquireCurrentLock(client, command.userId, command.targetDate);
        await this.repository.acquireGenerationRequestLock(client, command.userId, command.generationRequestId);
        const replay = await this.repository.findByGenerationRequest(client, command.userId, command.generationRequestId);
        if (replay) {
          if (replay.payloadFingerprint !== fingerprint) throw new RecommendationGenerationConflictError();
          await client.query("commit");
          return replay;
        }
        const revision = await this.repository.nextRevision(client, command.userId, command.targetDate);
        const recordId = await this.repository.insertNonCurrent(client, { command, revision, fingerprint });
        await this.faultHook?.("afterInsert", { client, recordId });
        await this.repository.supersedeCurrent(client, command.userId, command.targetDate, recordId, command.generatedAt);
        await this.faultHook?.("afterSupersede", { client, recordId });
        await this.repository.promote(client, recordId);
        await this.faultHook?.("afterPromote", { client, recordId });
        const record = await this.repository.findById(client, recordId);
        await this.faultHook?.("beforeCommit", { client, recordId });
        await client.query("commit");
        return record;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      }
    } finally {
      client.release();
    }
  }

  async publishGuarded(input: unknown, fence: RecommendationPublishFence): Promise<DailyRecommendationRecord> {
    return this.publish(input, fence);
  }

  async publishHomePair(inputs: readonly [unknown, unknown], fence?: RecommendationPublishFence): Promise<readonly [DailyRecommendationRecord, DailyRecommendationRecord]> {
    const commands = inputs.map((input) => PublishDailyRecommendationCommandSchema.parse(input)).sort((a, b) => a.targetDate.localeCompare(b.targetDate));
    if (commands[0]!.userId !== commands[1]!.userId || commands[0]!.generationBatchId !== commands[1]!.generationBatchId || commands[0]!.targetDate === commands[1]!.targetDate) throw new Error("home pair must contain two dates for one user and batch");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      try {
        if (fence) await assertPublishFence(client, fence);
        for (const command of commands) await this.repository.acquireCurrentLock(client, command.userId, command.targetDate);
        const records: DailyRecommendationRecord[] = [];
        for (const command of commands) {
          await this.repository.acquireGenerationRequestLock(client, command.userId, command.generationRequestId);
          const fingerprint = recommendationPayloadFingerprint(command);
          const replay = await this.repository.findByGenerationRequest(client, command.userId, command.generationRequestId);
          if (replay) {
            if (replay.payloadFingerprint !== fingerprint) throw new RecommendationGenerationConflictError();
            records.push(replay);
            continue;
          }
          const revision = await this.repository.nextRevision(client, command.userId, command.targetDate);
          const recordId = await this.repository.insertNonCurrent(client, { command, revision, fingerprint });
          await this.faultHook?.("afterInsert", { client, recordId });
          records.push(await this.repository.findById(client, recordId));
        }
        const replayOnly = records.every((record) => record.isCurrent);
        if (!replayOnly) {
          for (const record of records) await this.repository.supersedeCurrent(client, record.userId, record.targetDate, record.id, record.generatedAt);
          for (const record of records) await this.repository.promote(client, record.id);
        }
        const current = await Promise.all(records.map((record) => this.repository.findById(client, record.id)));
        await this.faultHook?.("beforeCommit", { client, recordId: current[1]!.id });
        await client.query("commit");
        return current as [DailyRecommendationRecord, DailyRecommendationRecord];
      } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
    } finally { client.release(); }
  }

  async publishHomePairGuarded(inputs: readonly [unknown, unknown], fence: RecommendationPublishFence): Promise<readonly [DailyRecommendationRecord, DailyRecommendationRecord]> {
    return this.publishHomePair(inputs, fence);
  }

  async findCurrent(userId: string, targetDate: string): Promise<DailyRecommendationRecord | null> {
    const validUserId = z.string().uuid().parse(userId);
    const validDate = RealDateSchema.parse(targetDate);
    const client = await this.pool.connect();
    try {
      return await this.repository.findCurrent(client, validUserId, validDate);
    } finally {
      client.release();
    }
  }

  async listCurrent(userId: string, targetDates?: readonly string[]): Promise<DailyRecommendationRecord[]> {
    const validUserId = z.string().uuid().parse(userId);
    const validDates = targetDates?.map((date) => RealDateSchema.parse(date));
    const client = await this.pool.connect();
    try {
      return await this.repository.listCurrent(client, validUserId, validDates);
    } finally {
      client.release();
    }
  }

  async cleanupExpiredNonCurrent(beforeIso: string): Promise<number> {
    const validBefore = z.string().datetime().parse(beforeIso);
    const client = await this.pool.connect();
    try {
      return await this.repository.cleanupExpiredNonCurrent(client, validBefore);
    } finally {
      client.release();
    }
  }

  async findLatestConsistentPair(userId: string, dates: readonly [string, string], nowIso = new Date().toISOString()) {
    const client = await this.pool.connect(); try { return await this.repository.findLatestConsistentPair(client, z.string().uuid().parse(userId), [RealDateSchema.parse(dates[0]), RealDateSchema.parse(dates[1])], z.string().datetime().parse(nowIso)); } finally { client.release(); }
  }
  async findLatestValid(userId: string, targetDate: string, nowIso = new Date().toISOString()) {
    const client = await this.pool.connect(); try { return await this.repository.findLatestValid(client, z.string().uuid().parse(userId), RealDateSchema.parse(targetDate), z.string().datetime().parse(nowIso)); } finally { client.release(); }
  }
}

async function assertPublishFence(client: PoolClient, fence: RecommendationPublishFence): Promise<void> {
  const result = await client.query(`select id from recommendation_regeneration_requests
    where id=any($1::uuid[]) and status='processing' and claim_token=$2 and generation_batch_id=$3 and lease_expires_at>now()
    order by id for update`, [fence.requestIds, fence.claimToken, fence.generationBatchId]);
  if (result.rows.length !== fence.requestIds.length) throw new Error("recommendation regeneration claim fenced");
}

export function recommendationPayloadFingerprint(command: PublishDailyRecommendationCommand): string {
  const { generationRequestId: _requestId, ...content } = command;
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
