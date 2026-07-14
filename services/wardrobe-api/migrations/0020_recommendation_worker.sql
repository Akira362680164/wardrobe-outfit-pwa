CREATE TYPE "recommendation_job_run_status" AS ENUM('running', 'completed', 'completed_with_errors', 'failed');

CREATE TABLE "recommendation_job_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scheduled_for" timestamp with time zone NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone,
  "status" "recommendation_job_run_status" DEFAULT 'running' NOT NULL,
  "target_task_count" integer DEFAULT 0 NOT NULL,
  "ready_count" integer DEFAULT 0 NOT NULL,
  "fallback_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "algorithm_version" text NOT NULL,
  "paw_program_versions" jsonb NOT NULL,
  "error_code_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "recommendation_job_runs_scheduled_idx" ON "recommendation_job_runs" USING btree ("scheduled_for");
CREATE INDEX "recommendation_job_runs_status_idx" ON "recommendation_job_runs" USING btree ("status");
