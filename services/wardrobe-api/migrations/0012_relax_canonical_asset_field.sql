ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_lifecycle_check";

ALTER TABLE "assets" ADD CONSTRAINT "assets_lifecycle_check"
  CHECK (
    (
      temporary_session_id IS NULL
      AND client_mutation_id IS NULL
      AND temporary_entity_type IS NULL
      AND temporary_variant IS NULL
      AND expires_at IS NULL
    )
    OR
    (
      temporary_session_id IS NOT NULL
      AND client_mutation_id IS NOT NULL
      AND temporary_entity_type IS NOT NULL
      AND field_name IS NOT NULL
      AND temporary_variant IS NOT NULL
      AND expires_at IS NOT NULL
    )
  );
