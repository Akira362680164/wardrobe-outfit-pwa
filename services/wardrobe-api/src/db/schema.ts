import {
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
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
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
    passwordHash: text("password_hash").notNull(),
    clientSecretHash: text("client_secret_hash").notNull(),
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
