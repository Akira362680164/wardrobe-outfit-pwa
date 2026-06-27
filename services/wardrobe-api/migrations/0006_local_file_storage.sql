ALTER TABLE assets RENAME COLUMN original_object_key TO original_storage_key;
ALTER TABLE assets RENAME COLUMN thumbnail_object_key TO thumbnail_storage_key;
ALTER TABLE assets DROP COLUMN storage_key;

UPDATE assets
SET original_storage_key = NULL,
    thumbnail_storage_key = NULL,
    upload_status = 'failed',
    payload = CASE
      WHEN payload ? 'uploads' THEN jsonb_set(
        jsonb_set(
          payload,
          '{uploads,original}',
          CASE WHEN payload #> '{uploads,original}' IS NULL THEN 'null'::jsonb
               ELSE (payload #> '{uploads,original}') || '{"status":"failed","errorCode":"LOCAL_FILE_MISSING_REUPLOAD_REQUIRED"}'::jsonb END,
          true
        ),
        '{uploads,thumbnail}',
        CASE WHEN payload #> '{uploads,thumbnail}' IS NULL THEN 'null'::jsonb
             ELSE (payload #> '{uploads,thumbnail}') || '{"status":"failed","errorCode":"LOCAL_FILE_MISSING_REUPLOAD_REQUIRED"}'::jsonb END,
        true
      )
      ELSE payload
    END,
    updated_at = now()
WHERE original_storage_key IS NOT NULL
   OR thumbnail_storage_key IS NOT NULL
   OR upload_status = 'uploaded';

-- Some early production environments applied 0005 manually before 0004.
-- Bootstrap the missing diagnostic schema in its final local-storage form.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'diagnostic_case_status') THEN
    CREATE TYPE diagnostic_case_status AS ENUM ('pending_upload', 'uploaded', 'expired');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS diagnostic_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text NOT NULL,
  client_request_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  app_version text NOT NULL,
  version_code integer NOT NULL,
  client_git_commit text NOT NULL,
  build_time timestamptz NOT NULL,
  build_channel text NOT NULL,
  schema_version integer NOT NULL,
  problem_description text,
  storage_key text NOT NULL,
  sha256 text NOT NULL,
  size_bytes integer NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  outfit_count integer NOT NULL DEFAULT 0,
  wishlist_count integer NOT NULL DEFAULT 0,
  status diagnostic_case_status NOT NULL DEFAULT 'pending_upload',
  upload_created_at timestamptz NOT NULL,
  uploaded_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'diagnostic_cases' AND column_name = 'object_key')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'diagnostic_cases' AND column_name = 'storage_key') THEN
    ALTER TABLE diagnostic_cases RENAME COLUMN object_key TO storage_key;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'diagnostic_cases' AND column_name = 'upload_authorized_at')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'diagnostic_cases' AND column_name = 'upload_created_at') THEN
    ALTER TABLE diagnostic_cases RENAME COLUMN upload_authorized_at TO upload_created_at;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS diagnostic_cases_case_id_unique ON diagnostic_cases(case_id);
CREATE UNIQUE INDEX IF NOT EXISTS diagnostic_cases_user_client_request_unique ON diagnostic_cases(user_id, client_request_id);
CREATE INDEX IF NOT EXISTS diagnostic_cases_user_created_idx ON diagnostic_cases(user_id, created_at);
CREATE INDEX IF NOT EXISTS diagnostic_cases_device_created_idx ON diagnostic_cases(device_id, created_at);
CREATE INDEX IF NOT EXISTS diagnostic_cases_git_commit_idx ON diagnostic_cases(client_git_commit);
CREATE INDEX IF NOT EXISTS diagnostic_cases_status_expires_idx ON diagnostic_cases(status, expires_at);

CREATE TABLE IF NOT EXISTS diagnostic_access_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_request_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  method text NOT NULL,
  route_template text NOT NULL,
  status_code integer NOT NULL,
  duration_ms integer NOT NULL,
  user_id_hash text,
  device_id_hash text,
  error_code text,
  server_version text NOT NULL,
  server_git_commit text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS api_request_traces_request_id_unique ON api_request_traces(request_id);
CREATE INDEX IF NOT EXISTS api_request_traces_created_at_idx ON api_request_traces(created_at);
CREATE INDEX IF NOT EXISTS api_request_traces_user_id_created_idx ON api_request_traces(user_id_hash, created_at);
CREATE INDEX IF NOT EXISTS api_request_traces_device_id_created_idx ON api_request_traces(device_id_hash, created_at);

CREATE TABLE IF NOT EXISTS diagnostic_case_request_traces (
  diagnostic_case_id uuid NOT NULL REFERENCES diagnostic_cases(id) ON DELETE CASCADE,
  api_request_trace_id uuid NOT NULL REFERENCES api_request_traces(id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS diagnostic_case_request_traces_pk ON diagnostic_case_request_traces(diagnostic_case_id, api_request_trace_id);

UPDATE diagnostic_cases
SET status = 'expired',
    expires_at = COALESCE(expires_at, now()),
    updated_at = now()
WHERE status IN ('pending_upload', 'uploaded');
