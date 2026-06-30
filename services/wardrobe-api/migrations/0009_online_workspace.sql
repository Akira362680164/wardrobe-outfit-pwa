ALTER TABLE assets ALTER COLUMN owner_entity_type DROP NOT NULL;
ALTER TABLE assets ALTER COLUMN owner_entity_id DROP NOT NULL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS temporary_session_id uuid;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS client_mutation_id uuid;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS temporary_entity_type sync_entity_type;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS field_name text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS temporary_variant text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS bound_at timestamptz;
ALTER TABLE sync_mutations ADD COLUMN IF NOT EXISTS response_json jsonb;

CREATE INDEX IF NOT EXISTS assets_temporary_session_idx
  ON assets(user_id, temporary_session_id);
CREATE INDEX IF NOT EXISTS assets_temporary_expiry_idx
  ON assets(expires_at) WHERE owner_entity_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS assets_temporary_slot_unique
  ON assets(user_id, temporary_session_id, field_name, temporary_variant)
  WHERE temporary_session_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE assets ADD CONSTRAINT assets_temporary_variant_check
  CHECK (temporary_variant IS NULL OR temporary_variant IN ('original', 'thumbnail'));
ALTER TABLE assets ADD CONSTRAINT assets_owner_or_temporary_check
  CHECK (
    (owner_entity_type IS NOT NULL AND owner_entity_id IS NOT NULL)
    OR
    (temporary_session_id IS NOT NULL AND client_mutation_id IS NOT NULL
      AND temporary_entity_type IS NOT NULL AND field_name IS NOT NULL
      AND temporary_variant IS NOT NULL AND expires_at IS NOT NULL)
  );
