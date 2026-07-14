CREATE TYPE "recommendation_readiness" AS ENUM ('ready', 'limited', 'not_ready');
CREATE TYPE "recommendation_generation_mode" AS ENUM ('rule_only', 'paw_enhanced', 'rule_fallback');

CREATE TABLE "daily_recommendations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "target_date" date NOT NULL,
  "target_timezone" text NOT NULL,
  "revision" integer NOT NULL,
  "generation_batch_id" uuid NOT NULL,
  "generation_request_id" uuid NOT NULL,
  "payload_fingerprint" text NOT NULL,
  "readiness" "recommendation_readiness" NOT NULL,
  "generation_mode" "recommendation_generation_mode" NOT NULL,
  "is_current" boolean DEFAULT false NOT NULL,
  "superseded_at" timestamp with time zone,
  "payload" jsonb NOT NULL,
  "algorithm_version" text NOT NULL,
  "rule_version" text NOT NULL,
  "paw_program_versions" jsonb NOT NULL,
  "generated_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "daily_recommendations_revision_positive" CHECK ("revision" > 0),
  CONSTRAINT "daily_recommendations_expiry_after_generation" CHECK ("expires_at" > "generated_at"),
  CONSTRAINT "daily_recommendations_fingerprint_format" CHECK ("payload_fingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "daily_recommendations_current_superseded_state" CHECK (("is_current" AND "superseded_at" IS NULL) OR (NOT "is_current" AND "superseded_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "daily_recommendations_user_date_revision_unique" ON "daily_recommendations" ("user_id", "target_date", "revision");
CREATE UNIQUE INDEX "daily_recommendations_generation_request_unique" ON "daily_recommendations" ("user_id", "generation_request_id");
CREATE UNIQUE INDEX "daily_recommendations_one_current_per_date" ON "daily_recommendations" ("user_id", "target_date") WHERE "is_current" = true;
CREATE INDEX "daily_recommendations_user_date_idx" ON "daily_recommendations" ("user_id", "target_date");
CREATE INDEX "daily_recommendations_batch_idx" ON "daily_recommendations" ("user_id", "generation_batch_id");
CREATE INDEX "daily_recommendations_expiry_idx" ON "daily_recommendations" ("expires_at");
