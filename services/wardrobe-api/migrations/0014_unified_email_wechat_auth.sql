CREATE TABLE "email_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "email_normalized" text NOT NULL,
  "email_masked" text NOT NULL,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "email_identities_email_normalized_unique"
  ON "email_identities" ("email_normalized");

CREATE UNIQUE INDEX "email_identities_user_id_unique"
  ON "email_identities" ("user_id");

CREATE TABLE "email_verification_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email_normalized" text NOT NULL,
  "code_hash" text NOT NULL,
  "purpose" text NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE cascade,
  "binding_ticket_id" uuid,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_ip_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "email_verification_challenges_email_purpose_idx"
  ON "email_verification_challenges" ("email_normalized", "purpose");

CREATE INDEX "email_verification_challenges_expires_at_idx"
  ON "email_verification_challenges" ("expires_at");

CREATE TABLE "wechat_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "app_id" text NOT NULL,
  "openid_hash" text NOT NULL,
  "unionid_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "wechat_identities_app_openid_unique"
  ON "wechat_identities" ("app_id", "openid_hash");

CREATE UNIQUE INDEX "wechat_identities_user_app_unique"
  ON "wechat_identities" ("user_id", "app_id");

CREATE TABLE "wechat_binding_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_hash" text NOT NULL,
  "app_id" text NOT NULL,
  "openid_hash" text NOT NULL,
  "unionid_hash" text,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "wechat_binding_tickets_ticket_hash_unique"
  ON "wechat_binding_tickets" ("ticket_hash");

CREATE INDEX "wechat_binding_tickets_expires_at_idx"
  ON "wechat_binding_tickets" ("expires_at");
