-- Remote diagnostic case storage and request traces
CREATE TYPE "diagnostic_case_status" AS ENUM ('pending_upload', 'uploaded', 'expired');

CREATE TABLE IF NOT EXISTS "diagnostic_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "case_id" text NOT NULL,
  "client_request_id" uuid NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "device_id" text NOT NULL,
  "app_version" text NOT NULL,
  "version_code" integer NOT NULL,
  "client_git_commit" text NOT NULL,
  "build_time" timestamptz NOT NULL,
  "build_channel" text NOT NULL,
  "schema_version" integer NOT NULL,
  "problem_description" text,
  "object_key" text NOT NULL,
  "sha256" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "event_count" integer NOT NULL DEFAULT 0,
  "item_count" integer NOT NULL DEFAULT 0,
  "outfit_count" integer NOT NULL DEFAULT 0,
  "wishlist_count" integer NOT NULL DEFAULT 0,
  "status" "diagnostic_case_status" NOT NULL DEFAULT 'pending_upload',
  "upload_authorized_at" timestamptz NOT NULL,
  "uploaded_at" timestamptz,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "diagnostic_cases_case_id_unique" ON "diagnostic_cases"("case_id");
CREATE UNIQUE INDEX IF NOT EXISTS "diagnostic_cases_user_client_request_unique" ON "diagnostic_cases"("user_id", "client_request_id");
CREATE INDEX IF NOT EXISTS "diagnostic_cases_user_created_idx" ON "diagnostic_cases"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "diagnostic_cases_device_created_idx" ON "diagnostic_cases"("device_id", "created_at");
CREATE INDEX IF NOT EXISTS "diagnostic_cases_git_commit_idx" ON "diagnostic_cases"("client_git_commit");
CREATE INDEX IF NOT EXISTS "diagnostic_cases_status_expires_idx" ON "diagnostic_cases"("status", "expires_at");

CREATE TABLE IF NOT EXISTS "diagnostic_access_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "case_id" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text NOT NULL,
  "action" text NOT NULL,
  "ip_hash" text,
  "user_agent_hash" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "api_request_traces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "method" text NOT NULL,
  "route_template" text NOT NULL,
  "status_code" integer NOT NULL,
  "duration_ms" integer NOT NULL,
  "user_id_hash" text,
  "device_id_hash" text,
  "error_code" text,
  "server_version" text NOT NULL,
  "server_git_commit" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "api_request_traces_request_id_unique" ON "api_request_traces"("request_id");
CREATE INDEX IF NOT EXISTS "api_request_traces_created_at_idx" ON "api_request_traces"("created_at");
CREATE INDEX IF NOT EXISTS "api_request_traces_user_id_created_idx" ON "api_request_traces"("user_id_hash", "created_at");
CREATE INDEX IF NOT EXISTS "api_request_traces_device_id_created_idx" ON "api_request_traces"("device_id_hash", "created_at");

CREATE TABLE IF NOT EXISTS "diagnostic_case_request_traces" (
  "diagnostic_case_id" uuid NOT NULL REFERENCES "diagnostic_cases"("id") ON DELETE CASCADE,
  "api_request_trace_id" uuid NOT NULL REFERENCES "api_request_traces"("id") ON DELETE CASCADE,
  "linked_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "diagnostic_case_request_traces_pk" ON "diagnostic_case_request_traces"("diagnostic_case_id", "api_request_trace_id");
