import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  RECOMMENDATION_ALGORITHM_VERSION_V2,
  RECOMMENDATION_FORECAST_RULE_VERSION,
  RECOMMENDATION_LOCATIONLESS_RULE_VERSION,
  RecommendationEngineInputV2Schema,
  type PublishDailyRecommendationCommand,
} from "@wardrobe/cloud-contracts";
import { WeatherOverviewService } from "../weather/overview-service.js";
import { generateRecommendationsV2 } from "./engine.js";
import { RecommendationPersistenceService } from "./persistence-service.js";
import { deterministicRequestId, RecommendationWorkspaceAdapter } from "./workspace-adapter.js";

export class RecommendationGenerationServiceV2 {
  readonly adapter: RecommendationWorkspaceAdapter;
  readonly persistence: RecommendationPersistenceService;
  constructor(private readonly pool: Pool, private readonly overview = new WeatherOverviewService({ pool }), private readonly clock: () => Date = () => new Date()) {
    this.adapter = new RecommendationWorkspaceAdapter(pool);
    this.persistence = new RecommendationPersistenceService(pool);
  }
  async prepare(userId: string, targetDate: string, asOfDate: string, _timezone: string, generationBatchId: string, mode: "daily" | "instant" | "regeneration" = "daily"): Promise<{ command: PublishDailyRecommendationCommand | null; skipReason: string | null }> {
    const overview = await this.overview.get(userId, targetDate);
    const ruleVersion = overview.contextMode === "forecast" ? RECOMMENDATION_FORECAST_RULE_VERSION : RECOMMENDATION_LOCATIONLESS_RULE_VERSION;
    const generationRequestId = deterministicRequestId(`v2:${mode}:${userId}:${targetDate}:${generationBatchId}:${ruleVersion}:${overview.contextResolvedAt}`);
    const workspace = await this.adapter.load(userId, targetDate, asOfDate, "Asia/Shanghai", generationRequestId);
    if (workspace.skipReason) return { command: null, skipReason: workspace.skipReason };
    const resolvedContext = {
      targetDate, targetTimezone: overview.targetTimezone, contextResolvedAt: overview.contextResolvedAt, contextMode: overview.contextMode,
      ...(overview.resolvedLocation ? { resolvedLocation: overview.resolvedLocation, locationSource: overview.locationSource } : {}),
    };
    const input = RecommendationEngineInputV2Schema.parse({
      ...workspace.input, ruleVersion, resolvedContext,
      dateContextInput: { ...workspace.input.dateContextInput, date: targetDate, timezone: overview.targetTimezone, weatherEvidence: overview.weatherEvidence },
    });
    const output = await generateRecommendationsV2(input);
    const generatedAt = this.clock().toISOString();
    return { command: {
      userId, targetDate, targetTimezone: overview.targetTimezone, generationBatchId, generationRequestId,
      readiness: output.readiness.status, generationMode: "rule_only",
      payload: { schemaVersion: 2, resolvedContext, dateContextInput: input.dateContextInput, engineOutput: output, weatherContext: { availabilityReason: overview.availabilityReason, endpointFreshness: overview.endpointFreshness, ...(overview.attribution ? { attribution: overview.attribution } : {}) } },
      algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION_V2, ruleVersion, pawProgramVersions: { dateContext: "disabled", candidateEvaluator: "disabled" }, generatedAt,
      expiresAt: new Date(Date.parse(generatedAt) + 30 * 86_400_000).toISOString(),
    }, skipReason: null };
  }
  async generateAndPublish(userId: string, targetDate: string, asOfDate: string, timezone: string, generationBatchId: string = randomUUID(), mode: "daily" | "instant" | "regeneration" = "daily") {
    const prepared = await this.prepare(userId, targetDate, asOfDate, timezone, generationBatchId, mode);
    return prepared.command ? this.persistence.publish(prepared.command) : null;
  }
}
