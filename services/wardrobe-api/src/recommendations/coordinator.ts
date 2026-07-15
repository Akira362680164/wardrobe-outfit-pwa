import { randomUUID } from "node:crypto";
import {
  ResolveRecommendationsCommandSchema,
  ResolveRecommendationsResponseSchema,
  type DailyRecommendationRecord,
  type PublishDailyRecommendationCommand,
  type ResolveRecommendationsCommand,
  type ResolveRecommendationsResponse,
} from "@wardrobe/cloud-contracts";
import { displayRecommendationRecord } from "./read-service.js";

export interface PreparedRealtimeRecommendation {
  command: PublishDailyRecommendationCommand | null;
  skipReason: "actual" | "primary_plan" | string | null;
  protectedPlanEntryId?: string;
  planRiskCodes?: string[];
}
export interface RecommendationCoordinatorDependencies {
  prepare(userId: string, targetDate: string, asOfDate: string, generationBatchId: string, source: "foreground" | "worker", forceMutationId?: string): Promise<PreparedRealtimeRecommendation>;
  findCurrent(userId: string, targetDate: string): Promise<DailyRecommendationRecord | null>;
  publish(command: PublishDailyRecommendationCommand): Promise<DailyRecommendationRecord>;
  publishHomePair(commands: readonly [PublishDailyRecommendationCommand, PublishDailyRecommendationCommand]): Promise<readonly [DailyRecommendationRecord, DailyRecommendationRecord]>;
}

export class RecommendationGenerationCoordinator {
  constructor(private readonly dependencies: RecommendationCoordinatorDependencies, private readonly clock: () => Date = () => new Date()) {}

  async resolve(userId: string, raw: ResolveRecommendationsCommand, source: "foreground" | "worker" = "foreground"): Promise<ResolveRecommendationsResponse> {
    const command = ResolveRecommendationsCommandSchema.parse(raw);
    const dates = [...command.dates].sort();
    const asOfDate = shanghaiDate(this.clock());
    const batchId = randomUUID();
    const prepared = await Promise.all(dates.map((date) => this.dependencies.prepare(userId, date, asOfDate, batchId, source, command.clientMutationId)));
    const current = await Promise.all(dates.map((date) => this.dependencies.findCurrent(userId, date)));
    const results: ResolveRecommendationsResponse["results"] = [];
    const publishIndexes = prepared.map((value, index) => value.command && (command.force || !reusable(current[index], value.command, this.clock())) ? index : -1).filter((index) => index >= 0);

    for (let index = 0; index < dates.length; index++) {
      const item = prepared[index]!;
      if (item.skipReason === "actual") results[index] = { targetDate: dates[index]!, status: "actual_wear", ...(item.protectedPlanEntryId ? { protectedPlanEntryId: item.protectedPlanEntryId } : {}), ...(item.planRiskCodes ? { planRiskCodes: item.planRiskCodes as any } : {}) };
      else if (item.skipReason === "primary_plan") results[index] = { targetDate: dates[index]!, status: "protected_plan", ...(item.protectedPlanEntryId ? { protectedPlanEntryId: item.protectedPlanEntryId } : {}), ...(item.planRiskCodes ? { planRiskCodes: item.planRiskCodes as any } : {}) };
      else if (!publishIndexes.includes(index) && current[index]) results[index] = resolvedResult(current[index]!, "reused");
    }

    try {
      const publishable = publishIndexes.filter((index) => prepared[index]!.command !== null);
      if (dates.length === 2 && publishable.length > 0 && prepared.every((item) => item.command !== null)) {
        const records = await this.dependencies.publishHomePair([prepared[0]!.command!, prepared[1]!.command!]);
        results[0] = resolvedResult(records[0], "generated");
        results[1] = resolvedResult(records[1], "generated");
      } else {
        for (const index of publishable) results[index] = resolvedResult(await this.dependencies.publish(prepared[index]!.command!), "generated");
      }
    } catch (error) {
      for (const index of publishIndexes) {
        if (current[index] && Date.parse(current[index]!.expiresAt) > this.clock().getTime()) results[index] = resolvedResult(current[index]!, "served_stale");
        else throw error;
      }
    }
    for (let index = 0; index < dates.length; index++) results[index] ??= { targetDate: dates[index]!, status: "not_ready" };
    return ResolveRecommendationsResponseSchema.parse({ timezone: "Asia/Shanghai", results });
  }
}

function reusable(current: DailyRecommendationRecord | null, command: PublishDailyRecommendationCommand, now: Date): boolean {
  return Boolean(current && current.isCurrent && current.algorithmVersion === command.algorithmVersion && current.ruleVersion === command.ruleVersion && current.inputFingerprint === command.inputFingerprint && Date.parse(current.expiresAt) > now.getTime());
}
function resolvedResult(record: DailyRecommendationRecord, status: "reused" | "generated" | "served_stale"): ResolveRecommendationsResponse["results"][number] {
  if (record.readiness === "not_ready") return { targetDate: record.targetDate, status: "not_ready" };
  if (!(record.payload as any).engineOutput) return { targetDate: record.targetDate, status };
  const display = displayRecommendationRecord(record);
  return "recommendationRevision" in display ? { targetDate: record.targetDate, status, recommendation: display } : { targetDate: record.targetDate, status: "not_ready" };
}
function shanghaiDate(value: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
