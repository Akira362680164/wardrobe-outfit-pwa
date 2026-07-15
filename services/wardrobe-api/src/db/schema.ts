import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const pendingRegistrationStatus = pgEnum("pending_registration_status", [
  "pending",
  "verified",
  "expired",
  "cancelled",
  "completed",
]);

export const refreshTokenStatus = pgEnum("refresh_token_status", [
  "active",
  "used",
  "revoked",
]);

export const syncEntityType = pgEnum("sync_entity_type", [
  "garment",
  "outfit",
  "outfitItem",
  "wishlistItem",
  "wearEvent",
  "tripPlan",
  "outfitPlan",
  "asset",
  "closetLocation",
  "profile",
]);

export const syncMutationOperation = pgEnum("sync_mutation_operation", [
  "create",
  "update",
  "delete",
]);

export const syncMutationStatus = pgEnum("sync_mutation_status", [
  "accepted",
  "conflict",
  "rejected",
]);

export const diagnosticCaseStatus = pgEnum("diagnostic_case_status", [
  "pending_upload",
  "uploaded",
  "expired",
]);

export const accountDeletionJobStatus = pgEnum("account_deletion_job_status", [
  "processing",
  "completed",
  "failed",
]);

export const recommendationReadiness = pgEnum("recommendation_readiness", ["ready", "limited", "not_ready"]);
export const recommendationGenerationMode = pgEnum("recommendation_generation_mode", ["rule_only", "paw_enhanced", "rule_fallback"]);
export const recommendationJobRunStatus = pgEnum("recommendation_job_run_status", ["running", "completed", "completed_with_errors", "failed"]);
export const recommendationRegenerationStatus = pgEnum("recommendation_regeneration_status", ["pending", "processing", "completed", "failed"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name"),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  ...timestamps,
});

export const accountDeletionAuthorizations = pgTable(
  "account_deletion_authorizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    method: text("method").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    tokenUnique: uniqueIndex("account_deletion_authorizations_token_unique").on(table.tokenHash),
    userExpiresIdx: index("account_deletion_authorizations_user_expires_idx").on(table.userId, table.expiresAt),
  }),
);

export const accountDeletionJobs = pgTable(
  "account_deletion_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptTokenHash: text("receipt_token_hash").notNull(),
    subjectUserId: uuid("subject_user_id"),
    status: accountDeletionJobStatus("status").notNull().default("processing"),
    storageKeys: jsonb("storage_keys").$type<string[]>().notNull().default([]),
    attempts: integer("attempts").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    receiptUnique: uniqueIndex("account_deletion_jobs_receipt_unique").on(table.receiptTokenHash),
    statusUpdatedIdx: index("account_deletion_jobs_status_updated_idx").on(table.status, table.updatedAt),
  }),
);

export const phoneIdentities = pgTable(
  "phone_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    phoneE164: text("phone_e164").notNull(),
    maskedPhone: text("masked_phone").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    phoneUnique: uniqueIndex("phone_identities_phone_e164_unique").on(table.phoneE164),
    userIdx: index("phone_identities_user_id_idx").on(table.userId),
  }),
);

export const emailIdentities = pgTable(
  "email_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    emailNormalized: text("email_normalized").notNull(),
    emailMasked: text("email_masked").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    emailUnique: uniqueIndex("email_identities_email_normalized_unique").on(table.emailNormalized),
    userUnique: uniqueIndex("email_identities_user_id_unique").on(table.userId),
  }),
);

export const passwordCredentials = pgTable(
  "password_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    passwordHash: text("password_hash").notNull(),
    passwordVersion: integer("password_version").notNull().default(1),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => ({
    userUnique: uniqueIndex("password_credentials_user_id_unique").on(table.userId),
  }),
);

export const emailVerificationChallenges = pgTable(
  "email_verification_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailNormalized: text("email_normalized").notNull(),
    codeHash: text("code_hash").notNull(),
    purpose: text("purpose").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    bindingTicketId: uuid("binding_ticket_id"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdIpHash: text("created_ip_hash"),
    ...timestamps,
  },
  (table) => ({
    emailPurposeIdx: index("email_verification_challenges_email_purpose_idx").on(table.emailNormalized, table.purpose),
    emailCreatedAtIdx: index("email_verification_challenges_email_created_at_idx").on(table.emailNormalized, table.createdAt),
    ipCreatedAtIdx: index("email_verification_challenges_ip_created_at_idx").on(table.createdIpHash, table.createdAt),
    expiresAtIdx: index("email_verification_challenges_expires_at_idx").on(table.expiresAt),
  }),
);

export const pendingRegistrations = pgTable(
  "pending_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneE164: text("phone_e164").notNull(),
    maskedPhone: text("masked_phone").notNull(),
    passwordHash: text("password_hash"),
    clientSecretHash: text("client_secret_hash"),
    status: pendingRegistrationStatus("status").notNull().default("pending"),
    verificationSource: text("verification_source"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    phoneStatusIdx: index("pending_registrations_phone_status_idx").on(table.phoneE164, table.status),
    expiresAtIdx: index("pending_registrations_expires_at_idx").on(table.expiresAt),
  }),
);

export const deviceSessions = pgTable(
  "device_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    deviceLabel: text("device_label"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    userDeviceIdx: index("device_sessions_user_device_idx").on(table.userId, table.deviceId),
    userIdx: index("device_sessions_user_id_idx").on(table.userId),
  }),
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => deviceSessions.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    tokenFamilyId: uuid("token_family_id").notNull(),
    status: refreshTokenStatus("status").notNull().default("active"),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    refreshRequestId: text("refresh_request_id"),
    idempotencyCiphertext: text("idempotency_ciphertext"),
    idempotencyNonce: text("idempotency_nonce"),
    idempotencyAuthTag: text("idempotency_auth_tag"),
    idempotencyExpiresAt: timestamp("idempotency_expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("refresh_tokens_token_hash_unique").on(table.tokenHash),
    sessionIdx: index("refresh_tokens_session_id_idx").on(table.sessionId),
    familyIdx: index("refresh_tokens_family_id_idx").on(table.tokenFamilyId),
    idempotencyExpiryIdx: index("refresh_tokens_idempotency_expires_at_idx").on(table.idempotencyExpiresAt),
  }),
);

export const accountSecurityEvents = pgTable(
  "account_security_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    ipHash: text("ip_hash"),
    userAgentHash: text("user_agent_hash"),
    metadata: jsonb("metadata").notNull().default({}),
    redacted: boolean("redacted").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index("account_security_events_user_created_idx").on(table.userId, table.createdAt),
    eventTypeIdx: index("account_security_events_event_type_idx").on(table.eventType),
  }),
);

export const wechatAccounts = pgTable(
  "wechat_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    appId: text("app_id").notNull(),
    openid: text("openid").notNull(),
    unionid: text("unionid"),
    phoneHash: text("phone_hash").notNull(),
    phoneMasked: text("phone_masked").notNull(),
    ...timestamps,
  },
  (table) => ({
    appOpenidUnique: uniqueIndex("wechat_accounts_app_openid_unique").on(table.appId, table.openid),
    userIdx: index("wechat_accounts_user_id_idx").on(table.userId),
    phoneHashIdx: index("wechat_accounts_phone_hash_idx").on(table.phoneHash),
  }),
);

export const wechatIdentities = pgTable(
  "wechat_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    appId: text("app_id").notNull(),
    openidHash: text("openid_hash").notNull(),
    unionidHash: text("unionid_hash"),
    ...timestamps,
  },
  (table) => ({
    appOpenidUnique: uniqueIndex("wechat_identities_app_openid_unique").on(table.appId, table.openidHash),
    userAppUnique: uniqueIndex("wechat_identities_user_app_unique").on(table.userId, table.appId),
  }),
);

export const wechatBindingTickets = pgTable(
  "wechat_binding_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketHash: text("ticket_hash").notNull(),
    appId: text("app_id").notNull(),
    openidHash: text("openid_hash").notNull(),
    unionidHash: text("unionid_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    ticketHashUnique: uniqueIndex("wechat_binding_tickets_ticket_hash_unique").on(table.ticketHash),
    expiresAtIdx: index("wechat_binding_tickets_expires_at_idx").on(table.expiresAt),
  }),
);

const syncEntityColumns = {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(1),
  originDeviceId: text("origin_device_id").notNull(),
  payload: jsonb("payload").notNull().default({}),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
};

export const wardrobes = pgTable(
  "wardrobes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("默认衣橱"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    userUpdatedIdx: index("wardrobes_user_updated_idx").on(table.userId, table.updatedAt),
  }),
);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...syncEntityColumns,
  },
  (table) => ({
    userUpdatedIdx: index("locations_user_updated_idx").on(table.userId, table.updatedAt),
  }),
);

export const garments = pgTable(
  "garments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wardrobeId: uuid("wardrobe_id").references(() => wardrobes.id, { onDelete: "set null" }),
    ...syncEntityColumns,
  },
  (table) => ({
    userRevisionIdx: index("garments_user_revision_idx").on(table.userId, table.revision),
    userUpdatedIdx: index("garments_user_updated_idx").on(table.userId, table.updatedAt),
  }),
);

export const outfits = pgTable(
  "outfits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...syncEntityColumns,
  },
  (table) => ({
    userRevisionIdx: index("outfits_user_revision_idx").on(table.userId, table.revision),
    userUpdatedIdx: index("outfits_user_updated_idx").on(table.userId, table.updatedAt),
  }),
);

export const outfitItems = pgTable(
  "outfit_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    outfitId: uuid("outfit_id").notNull().references(() => outfits.id, { onDelete: "cascade" }),
    garmentId: uuid("garment_id").notNull().references(() => garments.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    originDeviceId: text("origin_device_id").notNull(),
    sortOrder: integer("sort_order"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    outfitIdx: index("outfit_items_outfit_id_idx").on(table.outfitId),
    garmentIdx: index("outfit_items_garment_id_idx").on(table.garmentId),
    userRevisionIdx: index("outfit_items_user_revision_idx").on(table.userId, table.revision),
  }),
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...syncEntityColumns,
  },
  (table) => ({
    userRevisionIdx: index("wishlist_items_user_revision_idx").on(table.userId, table.revision),
    userUpdatedIdx: index("wishlist_items_user_updated_idx").on(table.userId, table.updatedAt),
  }),
);

export const wearEvents = pgTable(
  "wear_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    garmentId: uuid("garment_id").references(() => garments.id, { onDelete: "set null" }),
    outfitId: uuid("outfit_id").references(() => outfits.id, { onDelete: "set null" }),
    wornAt: timestamp("worn_at", { withTimezone: true }).notNull(),
    revision: integer("revision").notNull().default(1),
    originDeviceId: text("origin_device_id").notNull(),
    payload: jsonb("payload").notNull().default({}),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    userWornIdx: index("wear_events_user_worn_idx").on(table.userId, table.wornAt),
    garmentIdx: index("wear_events_garment_id_idx").on(table.garmentId),
    outfitIdx: index("wear_events_outfit_id_idx").on(table.outfitId),
  }),
);

export const tripPlans = pgTable(
  "trip_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startDate: text("start_date"),
    endDate: text("end_date"),
    ...syncEntityColumns,
  },
  (table) => ({
    userUpdatedIdx: index("trip_plans_user_updated_idx").on(table.userId, table.updatedAt),
  }),
);

export const outfitPlans = pgTable(
  "outfit_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripPlanId: uuid("trip_plan_id").references(() => tripPlans.id, { onDelete: "set null" }),
    outfitId: uuid("outfit_id").references(() => outfits.id, { onDelete: "set null" }),
    actualOutfitId: uuid("actual_outfit_id").references(() => outfits.id, { onDelete: "set null" }),
    planDate: text("plan_date"),
    ...syncEntityColumns,
  },
  (table) => ({
    userDateIdx: index("outfit_plans_user_date_idx").on(table.userId, table.planDate),
    tripPlanIdx: index("outfit_plans_trip_plan_id_idx").on(table.tripPlanId),
    actualOutfitIdx: index("outfit_plans_actual_outfit_id_idx").on(table.actualOutfitId),
    onePlannedPrimaryPerDay: uniqueIndex("outfit_plans_one_planned_primary_per_day").on(table.userId, table.planDate)
      .where(sql`${table.deletedAt} IS NULL AND ${table.planDate} IS NOT NULL AND ${table.payload}->>'status' = 'planned' AND ${table.payload}->>'isPrimary' = 'true'`),
    oneActualPrimaryPerDay: uniqueIndex("outfit_plans_one_actual_primary_per_day").on(table.userId, table.planDate)
      .where(sql`${table.deletedAt} IS NULL AND ${table.planDate} IS NOT NULL AND ${table.payload}->>'status' = 'worn' AND ${table.payload}->>'isPrimaryActual' = 'true'`),
  }),
);

export const dailyRecommendations = pgTable(
  "daily_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetDate: date("target_date", { mode: "string" }).notNull(),
    targetTimezone: text("target_timezone").notNull(),
    revision: integer("revision").notNull(),
    generationBatchId: uuid("generation_batch_id").notNull(),
    generationRequestId: uuid("generation_request_id").notNull(),
    payloadFingerprint: text("payload_fingerprint").notNull(),
    inputFingerprint: text("input_fingerprint"),
    generationSource: text("generation_source"),
    readiness: recommendationReadiness("readiness").notNull(),
    generationMode: recommendationGenerationMode("generation_mode").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    payload: jsonb("payload").notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    ruleVersion: text("rule_version").notNull(),
    pawProgramVersions: jsonb("paw_program_versions").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => ({
    userDateRevisionUnique: uniqueIndex("daily_recommendations_user_date_revision_unique").on(table.userId, table.targetDate, table.revision),
    generationRequestUnique: uniqueIndex("daily_recommendations_generation_request_unique").on(table.userId, table.generationRequestId),
    oneCurrentPerDate: uniqueIndex("daily_recommendations_one_current_per_date").on(table.userId, table.targetDate).where(sql`${table.isCurrent} = true`),
    userDateIdx: index("daily_recommendations_user_date_idx").on(table.userId, table.targetDate),
    userDateInputIdx: index("daily_recommendations_user_date_input_idx").on(table.userId, table.targetDate, table.inputFingerprint),
    batchIdx: index("daily_recommendations_batch_idx").on(table.userId, table.generationBatchId),
    expiryIdx: index("daily_recommendations_expiry_idx").on(table.expiresAt),
    revisionPositive: check("daily_recommendations_revision_positive", sql`${table.revision} > 0`),
    expiryAfterGeneration: check("daily_recommendations_expiry_after_generation", sql`${table.expiresAt} > ${table.generatedAt}`),
    fingerprintFormat: check("daily_recommendations_fingerprint_format", sql`${table.payloadFingerprint} ~ '^[a-f0-9]{64}$'`),
    currentSupersededState: check("daily_recommendations_current_superseded_state", sql`(${table.isCurrent} AND ${table.supersededAt} IS NULL) OR (NOT ${table.isCurrent} AND ${table.supersededAt} IS NOT NULL)`),
  }),
);

export const recommendationActions = pgTable(
  "recommendation_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    recommendationId: uuid("recommendation_id").references(() => dailyRecommendations.id, { onDelete: "set null" }),
    planEntryId: uuid("plan_entry_id").references(() => outfitPlans.id, { onDelete: "set null" }),
    action: text("action").notNull(), candidateId: uuid("candidate_id").notNull(), clientMutationId: uuid("client_mutation_id").notNull(),
    payload: jsonb("payload").notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userMutationUnique: uniqueIndex("recommendation_actions_user_mutation_unique").on(table.userId, table.clientMutationId),
    userCreatedIdx: index("recommendation_actions_user_created_idx").on(table.userId, table.createdAt),
    recommendationIdx: index("recommendation_actions_recommendation_idx").on(table.recommendationId),
    planIdx: index("recommendation_actions_plan_idx").on(table.planEntryId),
  }),
);

export const recommendationJobRuns = pgTable(
  "recommendation_job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: recommendationJobRunStatus("status").notNull().default("running"),
    targetTaskCount: integer("target_task_count").notNull().default(0),
    readyCount: integer("ready_count").notNull().default(0),
    fallbackCount: integer("fallback_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    algorithmVersion: text("algorithm_version").notNull(),
    pawProgramVersions: jsonb("paw_program_versions").notNull(),
    errorCodeCounts: jsonb("error_code_counts").notNull().default({}),
    ...timestamps,
  },
  (table) => ({ scheduledIdx: index("recommendation_job_runs_scheduled_idx").on(table.scheduledFor), statusIdx: index("recommendation_job_runs_status_idx").on(table.status) }),
);

export const recommendationRegenerationRequests = pgTable("recommendation_regeneration_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetDate: date("target_date", { mode: "string" }).notNull(),
  reasons: text("reasons").array().notNull(),
  clientMutationIds: uuid("client_mutation_ids").array().notNull().default([]),
  clientMutationFingerprints: jsonb("client_mutation_fingerprints").notNull().default({}),
  contentFingerprint: text("content_fingerprint").notNull(),
  status: recommendationRegenerationStatus("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  claimToken: uuid("claim_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  generationBatchId: uuid("generation_batch_id"),
  triggerVersion: integer("trigger_version").notNull().default(1),
  claimedTriggerVersion: integer("claimed_trigger_version"),
  lastErrorCode: text("last_error_code"),
  resultRecommendationId: uuid("result_recommendation_id").references(() => dailyRecommendations.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
});

const locationRevisionColumns = {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  locationId: text("location_id"), displayName: text("display_name"), timezone: text("timezone"),
  centroidLatitude: doublePrecision("centroid_latitude"), centroidLongitude: doublePrecision("centroid_longitude"),
  revision: integer("revision").notNull(), clientMutationId: uuid("client_mutation_id").notNull(), mutationFingerprint: text("mutation_fingerprint").notNull(),
  isCurrent: boolean("is_current").notNull().default(true), supersededAt: timestamp("superseded_at", { withTimezone: true }), ...timestamps,
};
export const userLocationProfiles = pgTable(
  "user_location_profiles",
  { id: uuid("id").primaryKey().defaultRandom(), ...locationRevisionColumns },
  (table) => ({
    revisionUnique: uniqueIndex("user_location_profiles_user_revision_unique").on(table.userId, table.revision),
    mutationUnique: uniqueIndex("user_location_profiles_user_mutation_unique").on(table.userId, table.clientMutationId),
    oneCurrent: uniqueIndex("user_location_profiles_one_current").on(table.userId).where(sql`${table.isCurrent} = true`),
  }),
);
export const locationDateOverrides = pgTable("location_date_overrides", {
  id: uuid("id").primaryKey().defaultRandom(), ...locationRevisionColumns,
  effectiveFrom: date("effective_from", { mode: "string" }), effectiveThrough: date("effective_through", { mode: "string" }), source: text("source"), confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, (table) => ({
  revisionUnique: uniqueIndex("location_date_overrides_user_revision_unique").on(table.userId, table.revision),
  mutationUnique: uniqueIndex("location_date_overrides_user_mutation_unique").on(table.userId, table.clientMutationId),
  oneCurrentDevice: uniqueIndex("location_date_overrides_one_current_device").on(table.userId).where(sql`${table.isCurrent} = true`),
}));
export const weatherCache = pgTable("weather_cache", {
  provider: text("provider").notNull(), locationId: text("location_id").notNull(), endpoint: text("endpoint").notNull(), lang: text("lang").notNull(), unit: text("unit").notNull(),
  payload: jsonb("payload"), providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true }), fetchedAt: timestamp("fetched_at", { withTimezone: true }), expiresAt: timestamp("expires_at", { withTimezone: true }), staleUntil: timestamp("stale_until", { withTimezone: true }),
  sources: jsonb("sources").$type<string[]>().notNull().default([]), license: jsonb("license").$type<string[]>().notNull().default([]), targetLocalDate: date("target_local_date", { mode: "string" }), status: text("status").notNull().default("negative"), negativeCode: text("negative_code"), negativeUntil: timestamp("negative_until", { withTimezone: true }), ...timestamps,
}, (table) => ({
  pk: primaryKey({ columns: [table.provider, table.locationId, table.endpoint, table.lang, table.unit] }),
  expiryIdx: index("weather_cache_expiry_idx").on(table.expiresAt),
  negativeIdx: index("weather_cache_negative_idx").on(table.negativeUntil),
}));

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileType: text("profile_type").notNull().default("tryOn"),
    ...syncEntityColumns,
  },
  (table) => ({
    userProfileTypeIdx: index("profiles_user_profile_type_idx").on(table.userId, table.profileType),
    oneActiveProfilePerType: uniqueIndex("profiles_one_active_per_user_type").on(table.userId, table.profileType)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerEntityType: syncEntityType("owner_entity_type"),
    ownerEntityId: uuid("owner_entity_id"),
    temporarySessionId: uuid("temporary_session_id"),
    clientMutationId: uuid("client_mutation_id"),
    temporaryEntityType: syncEntityType("temporary_entity_type"),
    fieldName: text("field_name"),
    temporaryVariant: text("temporary_variant"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    orphanedAt: timestamp("orphaned_at", { withTimezone: true }),
    boundAt: timestamp("bound_at", { withTimezone: true }),
    sha256: text("sha256"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    width: integer("width"),
    height: integer("height"),
    originalStorageKey: text("original_storage_key"),
    thumbnailStorageKey: text("thumbnail_storage_key"),
    uploadStatus: text("upload_status").notNull().default("uploading"),
    ...syncEntityColumns,
  },
  (table) => ({
    userOwnerIdx: index("assets_user_owner_idx").on(table.userId, table.ownerEntityType, table.ownerEntityId),
    shaIdx: index("assets_sha256_idx").on(table.sha256),
    uploadStatusIdx: index("assets_upload_status_idx").on(table.userId, table.uploadStatus),
    temporarySessionIdx: index("assets_temporary_session_idx").on(table.userId, table.temporarySessionId),
    temporaryExpiryIdx: index("assets_temporary_expiry_idx").on(table.expiresAt),
  }),
);

export const assetBindings = pgTable(
  "asset_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    ownerEntityType: syncEntityType("owner_entity_type").notNull(),
    ownerEntityId: uuid("owner_entity_id").notNull(),
    fieldName: text("field_name").notNull(),
    ...timestamps,
  },
  (table) => ({
    ownerFieldUnique: uniqueIndex("asset_bindings_owner_field_unique").on(
      table.userId,
      table.ownerEntityType,
      table.ownerEntityId,
      table.fieldName,
    ),
    ownerIdx: index("asset_bindings_owner_idx").on(table.userId, table.ownerEntityType, table.ownerEntityId),
    assetIdx: index("asset_bindings_asset_idx").on(table.userId, table.assetId),
  }),
);

export const syncChanges = pgTable(
  "sync_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    changeSeq: bigint("change_seq", { mode: "number" }).notNull(),
    entityType: syncEntityType("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    operation: syncMutationOperation("operation").notNull(),
    revision: integer("revision").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userSeqUnique: uniqueIndex("sync_changes_user_seq_unique").on(table.userId, table.changeSeq),
    userEntityIdx: index("sync_changes_user_entity_idx").on(table.userId, table.entityType, table.entityId),
  }),
);

export const syncMutations = pgTable(
  "sync_mutations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    mutationId: uuid("mutation_id").notNull(),
    entityType: syncEntityType("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    operation: syncMutationOperation("operation").notNull(),
    baseRevision: integer("base_revision"),
    status: syncMutationStatus("status").notNull(),
    resultRevision: integer("result_revision"),
    errorCode: text("error_code"),
    response: jsonb("response_json"),
    payload: jsonb("payload").notNull().default({}),
    ...timestamps,
  },
  (table) => ({
    userMutationUnique: uniqueIndex("sync_mutations_user_mutation_unique").on(table.userId, table.mutationId),
    userEntityIdx: index("sync_mutations_user_entity_idx").on(table.userId, table.entityType, table.entityId),
  }),
);

export const diagnosticCases = pgTable(
  "diagnostic_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: text("case_id").notNull(),
    clientRequestId: uuid("client_request_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    appVersion: text("app_version").notNull(),
    versionCode: integer("version_code").notNull(),
    clientGitCommit: text("client_git_commit").notNull(),
    buildTime: timestamp("build_time", { withTimezone: true }).notNull(),
    buildChannel: text("build_channel").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    problemDescription: text("problem_description"),
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    eventCount: integer("event_count").notNull().default(0),
    itemCount: integer("item_count").notNull().default(0),
    outfitCount: integer("outfit_count").notNull().default(0),
    wishlistCount: integer("wishlist_count").notNull().default(0),
    status: diagnosticCaseStatus("status").notNull().default("pending_upload"),
    uploadCreatedAt: timestamp("upload_created_at", { withTimezone: true }).notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    caseIdUnique: uniqueIndex("diagnostic_cases_case_id_unique").on(table.caseId),
    userClientRequestUnique: uniqueIndex("diagnostic_cases_user_client_request_unique").on(table.userId, table.clientRequestId),
    userCreatedIdx: index("diagnostic_cases_user_created_idx").on(table.userId, table.createdAt),
    deviceCreatedIdx: index("diagnostic_cases_device_created_idx").on(table.deviceId, table.createdAt),
    gitCommitIdx: index("diagnostic_cases_git_commit_idx").on(table.clientGitCommit),
    statusExpiresIdx: index("diagnostic_cases_status_expires_idx").on(table.status, table.expiresAt),
  }),
);

export const diagnosticAccessAudits = pgTable(
  "diagnostic_access_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: text("case_id").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    ipHash: text("ip_hash"),
    userAgentHash: text("user_agent_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const apiRequestTraces = pgTable(
  "api_request_traces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    method: text("method").notNull(),
    routeTemplate: text("route_template").notNull(),
    statusCode: integer("status_code").notNull(),
    durationMs: integer("duration_ms").notNull(),
    userIdHash: text("user_id_hash"),
    deviceIdHash: text("device_id_hash"),
    errorCode: text("error_code"),
    serverVersion: text("server_version").notNull(),
    serverGitCommit: text("server_git_commit").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    requestIdUnique: uniqueIndex("api_request_traces_request_id_unique").on(table.requestId),
    createdAtIdx: index("api_request_traces_created_at_idx").on(table.createdAt),
    userIdCreatedIdx: index("api_request_traces_user_id_created_idx").on(table.userIdHash, table.createdAt),
    deviceIdCreatedIdx: index("api_request_traces_device_id_created_idx").on(table.deviceIdHash, table.createdAt),
  }),
);

export const diagnosticCaseRequestTraces = pgTable(
  "diagnostic_case_request_traces",
  {
    diagnosticCaseId: uuid("diagnostic_case_id").notNull().references(() => diagnosticCases.id, { onDelete: "cascade" }),
    apiRequestTraceId: uuid("api_request_trace_id").notNull().references(() => apiRequestTraces.id, { onDelete: "cascade" }),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: uniqueIndex("diagnostic_case_request_traces_pk").on(table.diagnosticCaseId, table.apiRequestTraceId),
  }),
);
