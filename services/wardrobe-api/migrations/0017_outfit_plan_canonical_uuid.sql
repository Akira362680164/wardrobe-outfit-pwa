ALTER TABLE "outfit_plans"
  ADD COLUMN IF NOT EXISTS "actual_outfit_id" uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM outfits
    WHERE deleted_at IS NULL AND nullif(payload->>'legacyOutfitId', '') IS NOT NULL
    GROUP BY user_id, payload->>'legacyOutfitId'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'outfit UUID migration stopped: duplicate legacyOutfitId exists for one user';
  END IF;
END $$;

UPDATE outfit_plans AS plan
SET outfit_id = (
  SELECT outfit.id
  FROM outfits AS outfit
  WHERE outfit.user_id = plan.user_id
    AND outfit.deleted_at IS NULL
    AND (
      outfit.id::text = plan.payload->>'outfitId'
      OR outfit.payload->>'legacyOutfitId' = plan.payload->>'outfitId'
    )
  LIMIT 1
)
WHERE plan.deleted_at IS NULL
  AND plan.outfit_id IS NULL
  AND nullif(plan.payload->>'outfitId', '') IS NOT NULL;

UPDATE outfit_plans AS plan
SET actual_outfit_id = (
  SELECT outfit.id
  FROM outfits AS outfit
  WHERE outfit.user_id = plan.user_id
    AND outfit.deleted_at IS NULL
    AND (
      outfit.id::text = plan.payload->>'actualOutfitId'
      OR outfit.payload->>'legacyOutfitId' = plan.payload->>'actualOutfitId'
    )
  LIMIT 1
)
WHERE plan.deleted_at IS NULL
  AND plan.actual_outfit_id IS NULL
  AND nullif(plan.payload->>'actualOutfitId', '') IS NOT NULL;

UPDATE outfit_plans AS plan
SET trip_plan_id = (
  SELECT trip.id
  FROM trip_plans AS trip
  WHERE trip.user_id = plan.user_id
    AND trip.deleted_at IS NULL
    AND (
      trip.id::text = coalesce(plan.payload->>'tripPlanId', plan.payload->>'calendarPlanId')
      OR trip.payload->>'legacyCalendarPlanId' = coalesce(plan.payload->>'tripPlanId', plan.payload->>'calendarPlanId')
    )
  LIMIT 1
)
WHERE plan.deleted_at IS NULL
  AND plan.trip_plan_id IS NULL
  AND nullif(coalesce(plan.payload->>'tripPlanId', plan.payload->>'calendarPlanId'), '') IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM outfit_plans
    WHERE deleted_at IS NULL
      AND nullif(payload->>'outfitId', '') IS NOT NULL
      AND outfit_id IS NULL
  ) THEN
    RAISE EXCEPTION 'outfit UUID migration stopped: unresolved outfitId exists';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM outfit_plans AS plan
    JOIN outfits AS outfit ON outfit.id = plan.outfit_id AND outfit.user_id = plan.user_id
    WHERE plan.deleted_at IS NULL
      AND nullif(plan.payload->>'outfitId', '') IS NOT NULL
      AND plan.payload->>'outfitId' NOT IN (outfit.id::text, coalesce(outfit.payload->>'legacyOutfitId', ''))
  ) THEN
    RAISE EXCEPTION 'outfit UUID migration stopped: outfit_id column conflicts with payload outfitId';
  END IF;
  IF EXISTS (
    SELECT 1 FROM outfit_plans
    WHERE deleted_at IS NULL
      AND nullif(payload->>'actualOutfitId', '') IS NOT NULL
      AND actual_outfit_id IS NULL
  ) THEN
    RAISE EXCEPTION 'outfit UUID migration stopped: unresolved actualOutfitId exists';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM outfit_plans AS plan
    JOIN outfits AS outfit ON outfit.id = plan.actual_outfit_id AND outfit.user_id = plan.user_id
    WHERE plan.deleted_at IS NULL
      AND nullif(plan.payload->>'actualOutfitId', '') IS NOT NULL
      AND plan.payload->>'actualOutfitId' NOT IN (outfit.id::text, coalesce(outfit.payload->>'legacyOutfitId', ''))
  ) THEN
    RAISE EXCEPTION 'outfit UUID migration stopped: actual_outfit_id column conflicts with payload actualOutfitId';
  END IF;
  IF EXISTS (
    SELECT 1 FROM outfit_plans
    WHERE deleted_at IS NULL
      AND nullif(coalesce(payload->>'tripPlanId', payload->>'calendarPlanId'), '') IS NOT NULL
      AND trip_plan_id IS NULL
  ) THEN
    RAISE EXCEPTION 'outfit UUID migration stopped: unresolved trip plan ID exists';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM outfit_plans AS plan
    JOIN trip_plans AS trip ON trip.id = plan.trip_plan_id AND trip.user_id = plan.user_id
    WHERE plan.deleted_at IS NULL
      AND nullif(coalesce(plan.payload->>'tripPlanId', plan.payload->>'calendarPlanId'), '') IS NOT NULL
      AND coalesce(plan.payload->>'tripPlanId', plan.payload->>'calendarPlanId') NOT IN (trip.id::text, coalesce(trip.payload->>'legacyCalendarPlanId', ''))
  ) THEN
    RAISE EXCEPTION 'outfit UUID migration stopped: trip_plan_id column conflicts with payload plan ID';
  END IF;
END $$;

UPDATE outfit_plans
SET payload = (
  payload
  - 'legacyPlanEntryId'
  - 'legacyOutfitId'
  - 'legacyCalendarPlanId'
  - 'outfitId'
  - 'actualOutfitId'
  - 'tripPlanId'
  - 'calendarPlanId'
  || CASE WHEN outfit_id IS NOT NULL THEN jsonb_build_object('outfitId', outfit_id::text) ELSE '{}'::jsonb END
  || CASE WHEN actual_outfit_id IS NOT NULL THEN jsonb_build_object('actualOutfitId', actual_outfit_id::text) ELSE '{}'::jsonb END
  || CASE WHEN trip_plan_id IS NOT NULL THEN jsonb_build_object('tripPlanId', trip_plan_id::text, 'calendarPlanId', trip_plan_id::text) ELSE '{}'::jsonb END
)
WHERE payload ?| ARRAY['legacyPlanEntryId', 'legacyOutfitId', 'legacyCalendarPlanId', 'outfitId', 'actualOutfitId', 'tripPlanId', 'calendarPlanId'];

UPDATE outfits
SET payload = payload - 'legacyOutfitId'
WHERE payload ? 'legacyOutfitId';

UPDATE trip_plans
SET payload = payload - 'legacyCalendarPlanId'
WHERE payload ? 'legacyCalendarPlanId';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outfit_plans_actual_outfit_id_outfits_id_fk') THEN
    ALTER TABLE "outfit_plans"
      ADD CONSTRAINT "outfit_plans_actual_outfit_id_outfits_id_fk"
      FOREIGN KEY ("actual_outfit_id") REFERENCES "public"."outfits"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "outfit_plans_actual_outfit_id_idx"
  ON "outfit_plans" USING btree ("actual_outfit_id");
