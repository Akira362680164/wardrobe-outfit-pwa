import { describe, expect, it } from "vitest";
import {
  CancelPrimaryPlanCommandSchema,
  CancelPrimaryPlanConflictReasonSchema,
  CancelPrimaryPlanResponseSchema,
} from "@wardrobe/cloud-contracts";
import { CANCEL_PRIMARY_FIXTURE } from "./fixtures/recommendations/cancel-primary.js";

describe("cancel primary and optional backup promotion frozen contract", () => {
  it("accepts the handwritten request and response fixture", () => {
    expect(CancelPrimaryPlanCommandSchema.parse(CANCEL_PRIMARY_FIXTURE.command)).toEqual(CANCEL_PRIMARY_FIXTURE.command);
    expect(CancelPrimaryPlanResponseSchema.parse(CANCEL_PRIMARY_FIXTURE.response)).toEqual(CANCEL_PRIMARY_FIXTURE.response);
    expect(CANCEL_PRIMARY_FIXTURE.conflictReasonCodes.map((code) => CancelPrimaryPlanConflictReasonSchema.parse(code))).toEqual(CANCEL_PRIMARY_FIXTURE.conflictReasonCodes);
  });

  it("requires independent revisions and different plan ids", () => {
    expect(CancelPrimaryPlanCommandSchema.safeParse({ ...CANCEL_PRIMARY_FIXTURE.command, primary: { ...CANCEL_PRIMARY_FIXTURE.command.primary, expectedRevision: 0 } }).success).toBe(false);
    expect(CancelPrimaryPlanCommandSchema.safeParse({ ...CANCEL_PRIMARY_FIXTURE.command, promoteBackup: { planEntryId: CANCEL_PRIMARY_FIXTURE.command.primary.planEntryId, expectedRevision: 2 } }).success).toBe(false);
  });

  it("supports cancel without promotion and freezes rollback/idempotency invariants", () => {
    const { promoteBackup: _backup, ...cancelOnly } = CANCEL_PRIMARY_FIXTURE.command;
    expect(CancelPrimaryPlanCommandSchema.parse(cancelOnly)).toEqual(cancelOnly);
    expect(CancelPrimaryPlanResponseSchema.parse({ ...CANCEL_PRIMARY_FIXTURE.response, activePrimary: null })).toMatchObject({ activePrimary: null });
    expect(CANCEL_PRIMARY_FIXTURE.transactionInvariants).toHaveLength(6);
  });
});
