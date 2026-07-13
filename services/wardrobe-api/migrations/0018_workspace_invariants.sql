-- Repair the existing duplicate primary marker before adding database-level
-- protection. The newest revision is treated as the user's latest intent;
-- deterministic UUID ordering makes the migration repeatable in a restore.
UPDATE outfit_plans
SET plan_date = coalesce(payload->>'planDate', payload->>'date')
WHERE plan_date IS NULL
  AND nullif(coalesce(payload->>'planDate', payload->>'date'), '') IS NOT NULL;

WITH ranked_planned AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY user_id, plan_date
      ORDER BY updated_at DESC, revision DESC, id DESC
    ) AS rank
  FROM outfit_plans
  WHERE deleted_at IS NULL
    AND plan_date IS NOT NULL
    AND payload->>'status' = 'planned'
    AND payload->>'isPrimary' = 'true'
), changed_planned AS (
  UPDATE outfit_plans AS plan
  SET revision = plan.revision + 1,
      payload = jsonb_set(
        plan.payload,
        '{isPrimary}',
        'false'::jsonb,
        true
      ) || jsonb_build_object('updatedAt', now()::text),
      updated_at = now()
  FROM ranked_planned
  WHERE plan.id = ranked_planned.id
    AND ranked_planned.rank > 1
  RETURNING plan.user_id, plan.id, plan.revision, plan.payload
), ranked_actual AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY user_id, plan_date
      ORDER BY updated_at DESC, revision DESC, id DESC
    ) AS rank
  FROM outfit_plans
  WHERE deleted_at IS NULL
    AND plan_date IS NOT NULL
    AND payload->>'status' = 'worn'
    AND payload->>'isPrimaryActual' = 'true'
), changed_actual AS (
  UPDATE outfit_plans AS plan
  SET revision = plan.revision + 1,
      payload = jsonb_set(
        plan.payload,
        '{isPrimaryActual}',
        'false'::jsonb,
        true
      ) || jsonb_build_object('updatedAt', now()::text),
      updated_at = now()
  FROM ranked_actual
  WHERE plan.id = ranked_actual.id
    AND ranked_actual.rank > 1
  RETURNING plan.user_id, plan.id, plan.revision, plan.payload
), changed AS (
  SELECT * FROM changed_planned
  UNION ALL
  SELECT * FROM changed_actual
), sequenced AS (
  SELECT changed.*,
    coalesce((
      SELECT max(existing.change_seq)
      FROM sync_changes AS existing
      WHERE existing.user_id = changed.user_id
    ), 0) + row_number() OVER (
      PARTITION BY changed.user_id ORDER BY changed.id
    ) AS change_seq
  FROM changed
)
INSERT INTO sync_changes (
  user_id, change_seq, entity_type, entity_id, operation, revision, payload
)
SELECT user_id, change_seq, 'outfitPlan', id, 'update', revision, payload
FROM sequenced;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM profiles
    WHERE deleted_at IS NULL
    GROUP BY user_id, profile_type
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'workspace invariant migration stopped: duplicate active profile exists';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "outfit_plans_one_planned_primary_per_day"
  ON outfit_plans (user_id, plan_date)
  WHERE deleted_at IS NULL
    AND plan_date IS NOT NULL
    AND payload->>'status' = 'planned'
    AND payload->>'isPrimary' = 'true';

CREATE UNIQUE INDEX IF NOT EXISTS "outfit_plans_one_actual_primary_per_day"
  ON outfit_plans (user_id, plan_date)
  WHERE deleted_at IS NULL
    AND plan_date IS NOT NULL
    AND payload->>'status' = 'worn'
    AND payload->>'isPrimaryActual' = 'true';

CREATE UNIQUE INDEX IF NOT EXISTS "profiles_one_active_per_user_type"
  ON profiles (user_id, profile_type)
  WHERE deleted_at IS NULL;
