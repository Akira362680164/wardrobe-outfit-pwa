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

ALTER TABLE diagnostic_cases RENAME COLUMN object_key TO storage_key;
ALTER TABLE diagnostic_cases RENAME COLUMN upload_authorized_at TO upload_created_at;

UPDATE diagnostic_cases
SET status = 'expired',
    expires_at = COALESCE(expires_at, now()),
    updated_at = now()
WHERE status IN ('pending_upload', 'uploaded');
