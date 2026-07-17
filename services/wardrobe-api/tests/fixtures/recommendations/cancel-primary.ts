export const CANCEL_PRIMARY_FIXTURE = {
  command: {
    clientMutationId: "10000000-0000-4000-8000-000000000001",
    targetDate: "2026-07-17",
    primary: { planEntryId: "20000000-0000-4000-8000-000000000001", expectedRevision: 4 },
    promoteBackup: { planEntryId: "20000000-0000-4000-8000-000000000002", expectedRevision: 2 },
  },
  response: {
    status: "committed",
    idempotentReplay: false,
    targetDate: "2026-07-17",
    canceledPrimary: { planEntryId: "20000000-0000-4000-8000-000000000001", revision: 5 },
    activePrimary: { planEntryId: "20000000-0000-4000-8000-000000000002", revision: 3 },
    requestId: "req-cancel-primary-1",
  },
  conflictReasonCodes: [
    "mutation_payload_conflict", "primary_plan_changed", "backup_plan_changed",
    "plan_already_worn", "plan_date_mismatch", "backup_not_available",
  ],
  transactionInvariants: [
    "lock one user and target date before reading either plan",
    "validate both revisions and planned states before any write",
    "reject a worn primary without changing either plan",
    "cancel primary and promote backup in one transaction",
    "append both sync changes and idempotency response before commit",
    "roll back every write when any validation or persistence step fails",
  ],
} as const;
