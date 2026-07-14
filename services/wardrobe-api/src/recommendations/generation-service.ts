import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { PublishDailyRecommendationCommand } from "@wardrobe/cloud-contracts";
import { generateRecommendations } from "./engine.js";
import { RecommendationPersistenceService } from "./persistence-service.js";
import { deterministicRequestId, RecommendationWorkspaceAdapter } from "./workspace-adapter.js";

export const RECOMMENDATION_ALGORITHM_VERSION = "wardora-recommendation-1c";
export const RECOMMENDATION_RULE_VERSION = "wardora-rules-1a";

export class RecommendationGenerationService {
  readonly adapter: RecommendationWorkspaceAdapter;
  readonly persistence: RecommendationPersistenceService;
  constructor(private readonly pool: Pool) { this.adapter = new RecommendationWorkspaceAdapter(pool); this.persistence = new RecommendationPersistenceService(pool); }
  async prepare(userId: string, targetDate: string, asOfDate: string, timezone: string, generationBatchId: string, mode: "daily" | "instant" = "daily"): Promise<{ command: PublishDailyRecommendationCommand | null; skipReason: string | null }> {
    const generationRequestId = deterministicRequestId(`${mode}:${userId}:${targetDate}:${generationBatchId}:${RECOMMENDATION_RULE_VERSION}`);
    const workspace = await this.adapter.load(userId, targetDate, asOfDate, timezone, generationRequestId);
    if (workspace.skipReason) return { command: null, skipReason: workspace.skipReason };
    const output = await generateRecommendations(workspace.input);
    const generatedAt = mode === "instant" ? `${asOfDate}T00:00:00.000Z` : new Date().toISOString();
    return { command: { userId, targetDate, targetTimezone: timezone, generationBatchId, generationRequestId, readiness: output.readiness.status, generationMode: "rule_only", payload: { engineOutput: output, dateContextInput: workspace.input.dateContextInput }, algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION, ruleVersion: RECOMMENDATION_RULE_VERSION, pawProgramVersions: { dateContext: "disabled", candidateEvaluator: "disabled" }, generatedAt, expiresAt: new Date(Date.parse(generatedAt) + 30 * 86_400_000).toISOString() }, skipReason: null };
  }
  async generateAndPublish(userId: string, targetDate: string, asOfDate: string, timezone: string, generationBatchId: string = randomUUID(), mode: "daily" | "instant" = "daily") { const prepared = await this.prepare(userId, targetDate, asOfDate, timezone, generationBatchId, mode); return prepared.command ? this.persistence.publish(prepared.command) : null; }
}
