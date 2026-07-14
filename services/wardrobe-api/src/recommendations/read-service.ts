import type { Pool } from "pg";
import { RecommendationReadResponseSchema, type DailyRecommendationRecord, type RecommendationReadResponse } from "@wardrobe/cloud-contracts";
import { RecommendationGenerationService } from "./generation-service.js";
import { deterministicRequestId } from "./workspace-adapter.js";
import { getPostgresPool } from "../db/client.js";

export class RecommendationReadService {
  private generationInstance: RecommendationGenerationService | null = null;
  constructor(private readonly pool?: Pool) {}
  private get generation() { return this.generationInstance ??= new RecommendationGenerationService(this.pool ?? getPostgresPool()); }
  async read(userId: string, startDate: string, endDate: string): Promise<RecommendationReadResponse> {
    const user = (await this.generation.adapter.listEnabledUsers()).find((value) => value.userId === userId);
    if (!user) throw new RecommendationReadError(404, "not_found");
    const dates = enumerate(startDate, endDate);
    let records = await this.generation.persistence.listCurrent(userId, dates);
    let pairConsistent = true;
    if (dates.length >= 2) {
      const pairDates: [string, string] = [dates[0]!, dates[1]!];
      const currentPair = pairDates.map((date) => records.find((record) => record.targetDate === date)).filter(Boolean) as DailyRecommendationRecord[];
      if (currentPair.length !== 2 || currentPair[0]!.generationBatchId !== currentPair[1]!.generationBatchId) {
        const historicalPair = await this.generation.persistence.findLatestConsistentPair(userId, pairDates);
        records = records.filter((record) => !pairDates.includes(record.targetDate));
        if (historicalPair.length === 2) records.push(...historicalPair);
        else { pairConsistent = false; records = records.filter((record) => record.targetDate !== pairDates[1]); }
      }
    }
    const today = dateInZone(new Date(), user.timezone);
    if (dates.includes(today) && !records.some((record) => record.targetDate === today)) {
      const old = await this.generation.persistence.findLatestValid(userId, today);
      if (old) records.push(old);
      else {
        const batchId = deterministicRequestId(`instant-batch:${userId}:${today}`);
        const generated = await this.generation.generateAndPublish(userId, today, today, user.timezone, batchId, "instant").catch(() => null);
        if (generated) records.push(generated);
      }
    }
    records.sort((a, b) => a.targetDate.localeCompare(b.targetDate));
    return RecommendationReadResponseSchema.parse({ timezone: user.timezone, pairConsistent, items: records.map(display) });
  }
}

export class RecommendationReadError extends Error { constructor(readonly statusCode: number, readonly code: "not_found") { super(code); } }
function display(record: DailyRecommendationRecord) { return { recommendationId: record.id, targetDate: record.targetDate, generationBatchId: record.generationBatchId, readiness: record.readiness, generationMode: record.generationMode, generatedAt: record.generatedAt, expiresAt: record.expiresAt, weatherEvidence: record.payload.dateContextInput.weatherEvidence, recommendations: record.payload.engineOutput.recommendations.map((item) => ({ candidateId: item.candidateId, objective: item.objective, garmentIds: item.garmentIds, source: item.source, reasonCodes: item.reasonCodes, riskCodes: item.riskCodes, finalScore: item.finalScore })) }; }
function enumerate(start: string, end: string) { const out: string[] = []; for (let value = start; value <= end; value = add(value, 1)) out.push(value); return out; }
function add(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function dateInZone(value: Date, timezone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
