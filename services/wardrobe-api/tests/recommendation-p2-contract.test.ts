import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RejectRecommendationCommandSchema, RejectRecommendationResponseSchema } from "@wardrobe/cloud-contracts";

describe("recommendation P2 strict contracts", () => {
  it("accepts only controlled rejection reasons and stable mutation identity", () => {
    const command = {
      clientMutationId: randomUUID(), recommendationId: randomUUID(), expectedRecommendationRevision: 3,
      candidateId: randomUUID(), reason: "style" as const,
    };
    expect(RejectRecommendationCommandSchema.parse(command)).toEqual(command);
    expect(RejectRecommendationCommandSchema.safeParse({ ...command, reason: "free text" }).success).toBe(false);
    expect(RejectRecommendationCommandSchema.safeParse({ ...command, unexpected: true }).success).toBe(false);
    expect(RejectRecommendationResponseSchema.parse({ status: "committed", idempotentReplay: false, actionId: randomUUID() }).status).toBe("committed");
  });
});
