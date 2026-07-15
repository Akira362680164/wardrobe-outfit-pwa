import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  RECOMMENDATION_ALGORITHM_VERSION_V3,
  RECOMMENDATION_FORECAST_RULE_VERSION,
  RECOMMENDATION_LOCATIONLESS_RULE_VERSION,
  RECOMMENDATION_REALTIME_RULE_VERSION,
  RecommendationEngineInputV2Schema,
  type PublishDailyRecommendationCommand,
} from "@wardrobe/cloud-contracts";
import { WeatherOverviewService } from "../weather/overview-service.js";
import { generateRecommendationsV3, hardFilterGarments } from "./engine.js";
import { RuleDateContextResolver } from "./ports.js";
import { recommendationInputFingerprint } from "./input-fingerprint.js";
import { RecommendationPersistenceService } from "./persistence-service.js";
import { deterministicRequestId, RecommendationWorkspaceAdapter } from "./workspace-adapter.js";

export class RecommendationGenerationServiceV3 {
  readonly adapter: RecommendationWorkspaceAdapter;
  readonly persistence: RecommendationPersistenceService;
  constructor(private readonly pool: Pool, private readonly overview = new WeatherOverviewService({ pool }), private readonly clock: () => Date = () => new Date()) {
    this.adapter = new RecommendationWorkspaceAdapter(pool);
    this.persistence = new RecommendationPersistenceService(pool);
  }

  async prepare(userId: string, targetDate: string, asOfDate: string, generationBatchId: string, source: "foreground" | "worker", forceMutationId?: string): Promise<{ command: PublishDailyRecommendationCommand | null; skipReason: string | null }> {
    const overview = await this.overview.get(userId, targetDate);
    const legacyRuleVersion = overview.contextMode === "forecast" ? RECOMMENDATION_FORECAST_RULE_VERSION : RECOMMENDATION_LOCATIONLESS_RULE_VERSION;
    const provisionalRequestId = deterministicRequestId(`v3-input:${userId}:${targetDate}:${generationBatchId}`);
    const workspace = await this.adapter.load(userId, targetDate, asOfDate, "Asia/Shanghai", provisionalRequestId);
    const resolvedContext = {
      targetDate, targetTimezone: overview.targetTimezone, contextResolvedAt: overview.contextResolvedAt, contextMode: overview.contextMode,
      ...(overview.resolvedLocation ? { resolvedLocation: overview.resolvedLocation, locationSource: overview.locationSource } : {}),
    };
    const input = RecommendationEngineInputV2Schema.parse({
      ...workspace.input, ruleVersion: legacyRuleVersion, resolvedContext,
      dateContextInput: { ...workspace.input.dateContextInput, date: targetDate, timezone: overview.targetTimezone, weatherEvidence: overview.weatherEvidence },
    });
    if (workspace.skipReason) {
      const context = await new RuleDateContextResolver().resolve(input.dateContextInput);
      const excluded = new Map(hardFilterGarments(input.garments, context, input, overview.contextMode === "forecast" ? "forecast" : "generic").exclusions.map((entry) => [entry.garmentId, entry.codes]));
      const garmentIds = Array.isArray(workspace.protectedPlan?.payload.garmentIds) ? workspace.protectedPlan.payload.garmentIds.filter((id): id is string => typeof id === "string") : [];
      const planRiskCodes = [...new Set(garmentIds.flatMap((id) => (excluded.get(id) ?? []).map((code) => code === "temperature_mismatch" ? "severe_temperature_mismatch" as const : code === "formality_mismatch" || code === "invalid_formality" ? "severe_formality_mismatch" as const : code === "avoid_rule" ? "rain_incompatible" as const : "missing_required_slot" as const)))];
      return { command: null, skipReason: workspace.skipReason, ...(workspace.protectedPlan ? { protectedPlanEntryId: workspace.protectedPlan.id } : {}), ...(planRiskCodes.length ? { planRiskCodes } : {}) };
    }
    const inputFingerprint = recommendationInputFingerprint(input);
    const generationRequestId = deterministicRequestId(`v3:${userId}:${targetDate}:${forceMutationId ?? generationBatchId}`);
    const output = await generateRecommendationsV3({ ...input, requestId: generationRequestId });
    const generatedAt = this.clock().toISOString();
    return { command: {
      userId, targetDate, targetTimezone: overview.targetTimezone, generationBatchId, generationRequestId, inputFingerprint, generationSource: source, ...(forceMutationId ? { forceRefresh: true } : {}),
      readiness: output.readiness.status, generationMode: "rule_only",
      payload: { schemaVersion: 3, resolvedContext, dateContextInput: input.dateContextInput, engineOutput: output, weatherContext: { availabilityReason: overview.availabilityReason, endpointFreshness: overview.endpointFreshness, ...(overview.attribution ? { attribution: overview.attribution } : {}) } },
      algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION_V3, ruleVersion: RECOMMENDATION_REALTIME_RULE_VERSION,
      pawProgramVersions: { dateContext: "disabled", candidateEvaluator: "disabled" }, generatedAt,
      expiresAt: new Date(Date.parse(generatedAt) + 30 * 86_400_000).toISOString(),
    }, skipReason: null };
  }

  async generateAndPublish(userId: string, targetDate: string, asOfDate: string, generationBatchId = randomUUID(), source: "foreground" | "worker" = "worker") {
    const prepared = await this.prepare(userId, targetDate, asOfDate, generationBatchId, source);
    return prepared.command ? this.persistence.publish(prepared.command) : null;
  }
}
