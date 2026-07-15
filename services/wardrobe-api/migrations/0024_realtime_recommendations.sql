ALTER TABLE "daily_recommendations"
  ADD COLUMN "input_fingerprint" text,
  ADD COLUMN "generation_source" text;

ALTER TABLE "daily_recommendations"
  ADD CONSTRAINT "daily_recommendations_input_fingerprint_format" CHECK ("input_fingerprint" IS NULL OR "input_fingerprint" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "daily_recommendations_generation_source" CHECK ("generation_source" IS NULL OR "generation_source" IN ('foreground','worker')),
  ADD CONSTRAINT "daily_recommendations_v3_metadata" CHECK (
    COALESCE(("payload"->>'schemaVersion')::integer, 0) <> 3
    OR ("input_fingerprint" IS NOT NULL AND "generation_source" IS NOT NULL AND "generation_mode" = 'rule_only')
  );

CREATE INDEX "daily_recommendations_user_date_input_idx"
  ON "daily_recommendations" ("user_id", "target_date", "input_fingerprint");

-- Real-time worker only prewarms today/tomorrow. Dirty rows for existing
-- current dates and explicit travel changes remain available to the worker.
CREATE OR REPLACE FUNCTION recommendation_weather_regeneration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date; uid uuid; today date;
BEGIN
  IF NEW.payload IS NULL OR (OLD IS NOT NULL AND NEW.payload IS NOT DISTINCT FROM OLD.payload) THEN RETURN NEW; END IF;
  today := (timezone('Asia/Shanghai',now()))::date;
  FOR uid IN
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM user_location_profiles WHERE is_current AND superseded_at IS NULL AND location_id=NEW.location_id
      UNION SELECT user_id FROM location_date_overrides WHERE is_current AND superseded_at IS NULL AND location_id=NEW.location_id
      UNION SELECT user_id FROM trip_plans WHERE deleted_at IS NULL AND payload->'weatherLocation'->>'locationId'=NEW.location_id
    ) users
  LOOP
    PERFORM enqueue_recommendation_regeneration(uid,today,'weather_changed');
    PERFORM enqueue_recommendation_regeneration(uid,today+1,'weather_changed');
    FOR d IN SELECT target_date FROM daily_recommendations WHERE user_id=uid AND is_current AND target_date>today+1 LOOP
      PERFORM enqueue_recommendation_regeneration(uid,d,'weather_changed');
    END LOOP;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION recommendation_garment_regeneration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uid uuid; today date;
BEGIN
  uid := COALESCE(NEW.user_id,OLD.user_id); today := (timezone('Asia/Shanghai',now()))::date;
  IF TG_OP='DELETE' OR OLD IS NULL OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.payload IS DISTINCT FROM OLD.payload THEN
    PERFORM enqueue_recommendation_regeneration(uid,today,'garment_changed');
    PERFORM enqueue_recommendation_regeneration(uid,today+1,'garment_changed');
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
