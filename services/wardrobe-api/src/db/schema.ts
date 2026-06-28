import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name"),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  ...timestamps,
});

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
    planDate: text("plan_date"),
    ...syncEntityColumns,
  },
  (table) => ({
    userDateIdx: index("outfit_plans_user_date_idx").on(table.userId, table.planDate),
    tripPlanIdx: index("outfit_plans_trip_plan_id_idx").on(table.tripPlanId),
  }),
);

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileType: text("profile_type").notNull().default("tryOn"),
    ...syncEntityColumns,
  },
  (table) => ({
    userProfileTypeIdx: index("profiles_user_profile_type_idx").on(table.userId, table.profileType),
  }),
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerEntityType: syncEntityType("owner_entity_type").notNull(),
    ownerEntityId: uuid("owner_entity_id").notNull(),
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
