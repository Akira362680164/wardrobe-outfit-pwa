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

  async publish(input: unknown): Promise<DailyRecommendationRecord> {
    const command = PublishDailyRecommendationCommandSchema.parse(input);
    const fingerprint = recommendationPayloadFingerprint(command);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      try {
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
