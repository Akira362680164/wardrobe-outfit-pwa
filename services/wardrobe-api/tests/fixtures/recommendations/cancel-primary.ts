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
  cancelOnlyCommand: {
    clientMutationId: "10000000-0000-4000-8000-000000000002",
    targetDate: "2026-07-17",
    primary: { planEntryId: "20000000-0000-4000-8000-000000000001", expectedRevision: 4 },
  },
  cancelOnlyResponse: {
    status: "committed",
    idempotentReplay: false,
    targetDate: "2026-07-17",
    canceledPrimary: { planEntryId: "20000000-0000-4000-8000-000000000001", revision: 5 },
    activePrimary: null,
    requestId: "req-cancel-primary-only-1",
  },
  before: {
    primary: { planEntryId: "20000000-0000-4000-8000-000000000001", revision: 4, role: "primary", status: "planned" },
    backup: { planEntryId: "20000000-0000-4000-8000-000000000002", revision: 2, role: "backup", status: "planned" },
  },
  afterPromotion: {
    primary: { planEntryId: "20000000-0000-4000-8000-000000000001", revision: 5, role: "primary", status: "canceled" },
    backup: { planEntryId: "20000000-0000-4000-8000-000000000002", revision: 3, role: "primary", status: "planned" },
  },
  afterCancelOnly: {
    primary: { planEntryId: "20000000-0000-4000-8000-000000000001", revision: 5, role: "primary", status: "canceled" },
    backup: { planEntryId: "20000000-0000-4000-8000-000000000002", revision: 2, role: "backup", status: "planned" },
  },
  idempotentReplayResponse: {
    status: "committed",
    idempotentReplay: true,
    targetDate: "2026-07-17",
    canceledPrimary: { planEntryId: "20000000-0000-4000-8000-000000000001", revision: 5 },
    activePrimary: { planEntryId: "20000000-0000-4000-8000-000000000002", revision: 3 },
    requestId: "req-cancel-primary-replay-1",
  },
  conflictReasonCodes: [
    "mutation_payload_conflict", "primary_plan_changed", "backup_plan_changed",
    "plan_already_worn", "plan_date_mismatch", "backup_not_available",
  ],
  transactionInvariants: {
    lockScope: "lock one user and target date before reading either plan",
    validateBeforeWrite: "validate both revisions and planned states before any write",
    wornRollback: "reject a worn primary without changing either plan",
    atomicPromotion: "cancel primary and promote backup in one transaction",
    auditBeforeCommit: "append both sync changes and idempotency response before commit",
    fullRollback: "roll back every write when any validation or persistence step fails",
  },
} as const;
