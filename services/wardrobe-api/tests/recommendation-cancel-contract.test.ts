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

  it("freezes cancel-only state without mutating the untouched backup", () => {
    expect(CancelPrimaryPlanCommandSchema.parse(CANCEL_PRIMARY_FIXTURE.cancelOnlyCommand)).toEqual(CANCEL_PRIMARY_FIXTURE.cancelOnlyCommand);
    expect(CancelPrimaryPlanResponseSchema.parse(CANCEL_PRIMARY_FIXTURE.cancelOnlyResponse)).toEqual(CANCEL_PRIMARY_FIXTURE.cancelOnlyResponse);
    expect(CANCEL_PRIMARY_FIXTURE.afterCancelOnly.primary.revision).toBe(CANCEL_PRIMARY_FIXTURE.before.primary.revision + 1);
    expect(CANCEL_PRIMARY_FIXTURE.afterCancelOnly.primary.status).toBe("canceled");
    expect(CANCEL_PRIMARY_FIXTURE.afterCancelOnly.backup).toEqual(CANCEL_PRIMARY_FIXTURE.before.backup);
    expect(CANCEL_PRIMARY_FIXTURE.cancelOnlyResponse.activePrimary).toBeNull();
  });

  it("freezes promotion ids, roles, revisions and response correspondence", () => {
    const { command, response, before, afterPromotion } = CANCEL_PRIMARY_FIXTURE;
    expect(command.primary.planEntryId).not.toBe(command.promoteBackup.planEntryId);
    expect(command.promoteBackup.planEntryId).toBe(response.activePrimary?.planEntryId);
    expect(command.primary.planEntryId).toBe(response.canceledPrimary.planEntryId);
    expect(afterPromotion.primary.revision).toBe(before.primary.revision + 1);
    expect(afterPromotion.backup.revision).toBe(before.backup.revision + 1);
    expect(afterPromotion.primary.status).toBe("canceled");
    expect(afterPromotion.backup.role).toBe("primary");
    expect(response.canceledPrimary.revision).toBe(afterPromotion.primary.revision);
    expect(response.activePrimary?.revision).toBe(afterPromotion.backup.revision);
  });

  it("freezes idempotent replay and every stable conflict code", () => {
    expect(CancelPrimaryPlanResponseSchema.parse(CANCEL_PRIMARY_FIXTURE.idempotentReplayResponse)).toEqual(CANCEL_PRIMARY_FIXTURE.idempotentReplayResponse);
    expect(CANCEL_PRIMARY_FIXTURE.idempotentReplayResponse.canceledPrimary).toEqual(CANCEL_PRIMARY_FIXTURE.response.canceledPrimary);
    expect(CANCEL_PRIMARY_FIXTURE.idempotentReplayResponse.activePrimary).toEqual(CANCEL_PRIMARY_FIXTURE.response.activePrimary);
    expect(CANCEL_PRIMARY_FIXTURE.conflictReasonCodes).toEqual([
      "mutation_payload_conflict", "primary_plan_changed", "backup_plan_changed",
      "plan_already_worn", "plan_date_mismatch", "backup_not_available",
    ]);
    for (const code of CANCEL_PRIMARY_FIXTURE.conflictReasonCodes) expect(CancelPrimaryPlanConflictReasonSchema.parse(code)).toBe(code);
    expect(Object.keys(CANCEL_PRIMARY_FIXTURE.transactionInvariants)).toEqual([
      "lockScope", "validateBeforeWrite", "wornRollback", "atomicPromotion", "auditBeforeCommit", "fullRollback",
    ]);
  });
});
