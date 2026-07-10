CREATE TYPE "account_deletion_job_status" AS ENUM ('processing', 'completed', 'failed');

CREATE TABLE "account_deletion_authorizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "device_id" text NOT NULL,
  "method" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "account_deletion_authorizations_token_unique"
  ON "account_deletion_authorizations" ("token_hash");

CREATE INDEX "account_deletion_authorizations_user_expires_idx"
  ON "account_deletion_authorizations" ("user_id", "expires_at");

CREATE TABLE "account_deletion_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "receipt_token_hash" text NOT NULL,
  "subject_user_id" uuid,
  "status" "account_deletion_job_status" DEFAULT 'processing' NOT NULL,
  "storage_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error_code" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "account_deletion_jobs_receipt_unique"
  ON "account_deletion_jobs" ("receipt_token_hash");

CREATE INDEX "account_deletion_jobs_status_updated_idx"
  ON "account_deletion_jobs" ("status", "updated_at");
