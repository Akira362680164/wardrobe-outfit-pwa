import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AcceptRecommendationCommandSchema, RecommendationPlanPayloadSchema } from "@wardrobe/cloud-contracts";

const ids = () => [randomUUID(), randomUUID(), randomUUID()];

describe("recommendation accept frozen contracts", () => {
  it("accepts an original candidate intent and rejects duplicate garments", () => {
    const [recommendationId, candidateId, garmentId] = ids();
    const command = { clientMutationId: randomUUID(), recommendationId, expectedRecommendationRevision: 2, candidateId, selectedGarmentIds: [garmentId, randomUUID()] };
    expect(AcceptRecommendationCommandSchema.parse(command)).toEqual(command);
    expect(AcceptRecommendationCommandSchema.safeParse({ ...command, selectedGarmentIds: [garmentId, garmentId] }).success).toBe(false);
  });

  it("allows a daily recommendation plan without outfitId", () => {
    const [recommendationId, candidateId, garmentId] = ids();
    const second = randomUUID();
    const payload = {
      sourceType: "daily_recommendation", date: "2026-07-15", garmentIds: [garmentId, second], itemIds: [1, 2], recommendationId,
      recommendationRevision: 1, recommendationCandidateId: candidateId, recommendationInputFingerprint: "a".repeat(64),
      algorithmVersion: "wardora-recommendation-realtime-v1", sourceVariant: "original", originalGarmentIds: [garmentId, second],
      garmentSnapshots: [
        { garmentId, legacyItemId: 1, name: "top", role: "tops", category: "tops" },
        { garmentId: second, legacyItemId: 2, name: "pants", role: "pants", category: "pants" },
      ], recommendationSnapshot: { candidateId, reasonCodes: [], riskCodes: [] }, snapshotVersion: 1, selectedAt: "2026-07-15T00:00:00.000Z",
      status: "planned", isPrimary: true, role: "primary",
    } as const;
    expect(RecommendationPlanPayloadSchema.parse(payload)).not.toHaveProperty("outfitId");
  });
});
