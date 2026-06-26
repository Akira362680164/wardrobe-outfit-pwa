ALTER TABLE assets ADD COLUMN size_bytes integer;
ALTER TABLE assets ADD COLUMN width integer;
ALTER TABLE assets ADD COLUMN height integer;
ALTER TABLE assets ADD COLUMN original_object_key text;
ALTER TABLE assets ADD COLUMN thumbnail_object_key text;
ALTER TABLE assets ADD COLUMN upload_status text NOT NULL DEFAULT 'pending';

CREATE INDEX assets_upload_status_idx ON assets(user_id, upload_status);
