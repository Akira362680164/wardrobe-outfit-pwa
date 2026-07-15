import type { Pool } from "pg";
import { RecommendationDisplayItemV3Schema, RecommendationReadResponseSchema, type DailyRecommendationRecord, type RecommendationReadResponse } from "@wardrobe/cloud-contracts";
import { getPostgresPool } from "../db/client.js";
import { RecommendationPersistenceService } from "./persistence-service.js";

export class RecommendationReadService {
  private persistenceInstance: RecommendationPersistenceService | null = null;
  constructor(private readonly pool?: Pool, private readonly injectedPersistence?: RecommendationPersistenceService) {}
  private get persistence() { return this.injectedPersistence ?? (this.persistenceInstance ??= new RecommendationPersistenceService(this.pool ?? getPostgresPool())); }
  async read(userId: string, startDate: string, endDate: string): Promise<RecommendationReadResponse> {
    const dates = enumerate(startDate, endDate);
    let records = await this.persistence.listCurrent(userId, dates);
    let pairConsistent = true;
    if (dates.length >= 2) {
      const pairDates: [string, string] = [dates[0]!, dates[1]!];
      const currentPair = pairDates.map((date) => records.find((record) => record.targetDate === date)).filter(Boolean) as DailyRecommendationRecord[];
      if (currentPair.length !== 2 || currentPair[0]!.generationBatchId !== currentPair[1]!.generationBatchId) {
        const historicalPair = await this.persistence.findLatestConsistentPair(userId, pairDates);
        records = records.filter((record) => !pairDates.includes(record.targetDate));
        if (historicalPair.length === 2) records.push(...historicalPair);
        else { pairConsistent = false; records = records.filter((record) => record.targetDate !== pairDates[1]); }
      }
    }
    records.sort((a, b) => a.targetDate.localeCompare(b.targetDate));
    return RecommendationReadResponseSchema.parse({ timezone: "Asia/Shanghai", pairConsistent, items: records.map(displayRecommendationRecord) });
  }
}

export class RecommendationReadError extends Error { constructor(readonly statusCode: number, readonly code: "not_found") { super(code); } }
export function displayRecommendationRecord(record: DailyRecommendationRecord) {
  const base = { recommendationId: record.id, targetDate: record.targetDate, generationBatchId: record.generationBatchId, readiness: record.readiness, generationMode: record.generationMode, generatedAt: record.generatedAt, expiresAt: record.expiresAt, weatherEvidence: record.payload.dateContextInput.weatherEvidence };
  if ("schemaVersion" in record.payload && record.payload.schemaVersion === 3) {
    const weather = record.payload.weatherContext ?? { availabilityReason: record.payload.resolvedContext.contextMode === "locationless" ? "locationless" as const : "insufficient_evidence" as const, endpointFreshness: [] };
    return RecommendationDisplayItemV3Schema.parse({ ...base, recommendationRevision: record.revision, inputFingerprint: record.inputFingerprint!, recommendations: record.payload.engineOutput.recommendations.map((item) => ({ candidateId: item.candidateId, objective: item.objective, garmentIds: item.garmentIds, source: item.source, reasonCodes: item.reasonCodes, riskCodes: [...item.deterministicRiskAssessment.blockingCodes, ...item.deterministicRiskAssessment.warningCodes, ...item.deterministicRiskAssessment.advisoryCodes], finalScore: item.finalScore })), contextMode: record.payload.resolvedContext.contextMode, targetTimezone: record.payload.resolvedContext.targetTimezone, contextResolvedAt: record.payload.resolvedContext.contextResolvedAt, ...(record.payload.resolvedContext.resolvedLocation ? { resolvedLocation: record.payload.resolvedContext.resolvedLocation, locationSource: record.payload.resolvedContext.locationSource } : {}), algorithmVersion: record.algorithmVersion, ruleVersion: record.ruleVersion, availabilityReason: weather.availabilityReason, endpointFreshness: weather.endpointFreshness, ...(weather.attribution ? { attribution: weather.attribution } : {}) });
  }
  const legacy = { ...base, recommendations: record.payload.engineOutput.recommendations.map((item) => ({ candidateId: item.candidateId, objective: item.objective, garmentIds: item.garmentIds, source: item.source, reasonCodes: item.reasonCodes, riskCodes: item.riskCodes, finalScore: item.finalScore })) };
  if (!("schemaVersion" in record.payload)) return legacy;
  const weather = record.payload.weatherContext ?? { availabilityReason: record.payload.resolvedContext.contextMode === "locationless" ? "locationless" as const : "insufficient_evidence" as const, endpointFreshness: [] };
  return { ...legacy, contextMode: record.payload.resolvedContext.contextMode, targetTimezone: record.payload.resolvedContext.targetTimezone, contextResolvedAt: record.payload.resolvedContext.contextResolvedAt, ...(record.payload.resolvedContext.resolvedLocation ? { resolvedLocation: record.payload.resolvedContext.resolvedLocation, locationSource: record.payload.resolvedContext.locationSource } : {}), algorithmVersion: record.algorithmVersion, ruleVersion: record.ruleVersion, availabilityReason: weather.availabilityReason, endpointFreshness: weather.endpointFreshness, ...(weather.attribution ? { attribution: weather.attribution } : {}) };
}
function enumerate(start: string, end: string) { const out: string[] = []; for (let value = start; value <= end; value = add(value, 1)) out.push(value); return out; }
function add(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
