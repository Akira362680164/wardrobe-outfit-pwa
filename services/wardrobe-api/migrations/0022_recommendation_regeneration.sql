CREATE TYPE "recommendation_regeneration_status" AS ENUM ('pending','processing','completed','failed');

CREATE TABLE "recommendation_regeneration_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "target_date" date NOT NULL,
  "reasons" text[] NOT NULL,
  "client_mutation_ids" uuid[] NOT NULL DEFAULT '{}',
  "content_fingerprint" text NOT NULL,
  "status" "recommendation_regeneration_status" NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 5,
  "next_attempt_at" timestamp with time zone NOT NULL DEFAULT now(),
  "locked_at" timestamp with time zone,
  "last_error_code" text,
  "result_recommendation_id" uuid REFERENCES "daily_recommendations"("id") ON DELETE SET NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "recommendation_regeneration_reasons_nonempty" CHECK (cardinality(reasons) BETWEEN 1 AND 6),
  CONSTRAINT "recommendation_regeneration_attempts" CHECK (attempt_count >= 0 AND max_attempts BETWEEN 1 AND 10),
  CONSTRAINT "recommendation_regeneration_fingerprint" CHECK (content_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "recommendation_regeneration_error_code" CHECK (last_error_code IS NULL OR last_error_code IN ('weather_unavailable','wardrobe_not_ready','candidate_generation_failed','persistence_failed','protected_plan','unknown'))
);
CREATE UNIQUE INDEX "recommendation_regeneration_one_active_per_date" ON "recommendation_regeneration_requests" ("user_id","target_date") WHERE status IN ('pending','processing');
CREATE INDEX "recommendation_regeneration_client_ids_gin" ON "recommendation_regeneration_requests" USING gin ("client_mutation_ids");
CREATE INDEX "recommendation_regeneration_claim_idx" ON "recommendation_regeneration_requests" ("status","next_attempt_at","created_at");

CREATE OR REPLACE FUNCTION enqueue_recommendation_regeneration(p_user uuid, p_date date, p_reason text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_date IS NULL OR p_date < (timezone('Asia/Shanghai', now()))::date THEN RETURN; END IF;
  INSERT INTO recommendation_regeneration_requests(user_id,target_date,reasons,content_fingerprint)
  VALUES(p_user,p_date,ARRAY[p_reason],encode(public.digest(p_user::text || ':' || p_date::text || ':' || p_reason,'sha256'),'hex'))
  ON CONFLICT (user_id,target_date) WHERE status IN ('pending','processing') DO UPDATE
  SET reasons=(SELECT array_agg(DISTINCT value ORDER BY value) FROM unnest(recommendation_regeneration_requests.reasons || excluded.reasons) value), updated_at=now();
END $$;

CREATE OR REPLACE FUNCTION recommendation_location_profile_regeneration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date;
BEGIN
  IF NEW.is_current THEN FOR d IN SELECT generate_series((timezone('Asia/Shanghai',now()))::date,(timezone('Asia/Shanghai',now()))::date+6,'1 day')::date LOOP PERFORM enqueue_recommendation_regeneration(NEW.user_id,d,'home_city_changed'); END LOOP; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER user_location_profile_regeneration AFTER INSERT ON user_location_profiles FOR EACH ROW EXECUTE FUNCTION recommendation_location_profile_regeneration();

CREATE OR REPLACE FUNCTION recommendation_override_regeneration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date; from_date date; through_date date;
BEGIN
  from_date := NEW.effective_from; through_date := NEW.effective_through;
  IF from_date IS NULL THEN SELECT effective_from,effective_through INTO from_date,through_date FROM location_date_overrides WHERE user_id=NEW.user_id AND id<>NEW.id ORDER BY revision DESC LIMIT 1; END IF;
  FOR d IN SELECT generate_series(from_date,through_date,'1 day')::date LOOP PERFORM enqueue_recommendation_regeneration(NEW.user_id,d,'temporary_city_changed'); END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER location_override_regeneration AFTER INSERT ON location_date_overrides FOR EACH ROW EXECUTE FUNCTION recommendation_override_regeneration();

CREATE OR REPLACE FUNCTION recommendation_trip_regeneration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date; from_date date; through_date date; uid uuid;
BEGIN
  uid := COALESCE(NEW.user_id,OLD.user_id); from_date := LEAST(COALESCE(NEW.start_date,OLD.start_date),COALESCE(OLD.start_date,NEW.start_date)); through_date := GREATEST(COALESCE(NEW.end_date,OLD.end_date),COALESCE(OLD.end_date,NEW.end_date));
  FOR d IN SELECT generate_series(from_date,through_date,'1 day')::date LOOP PERFORM enqueue_recommendation_regeneration(uid,d,'travel_changed'); END LOOP;
  RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER trip_plan_regeneration AFTER INSERT OR UPDATE OF start_date,end_date,payload,deleted_at OR DELETE ON trip_plans FOR EACH ROW EXECUTE FUNCTION recommendation_trip_regeneration();

CREATE OR REPLACE FUNCTION recommendation_garment_regeneration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date; uid uuid;
BEGIN
  uid := COALESCE(NEW.user_id,OLD.user_id);
  IF TG_OP='DELETE' OR OLD IS NULL OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.payload IS DISTINCT FROM OLD.payload THEN
    FOR d IN SELECT generate_series((timezone('Asia/Shanghai',now()))::date,(timezone('Asia/Shanghai',now()))::date+6,'1 day')::date LOOP PERFORM enqueue_recommendation_regeneration(uid,d,'garment_changed'); END LOOP;
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER garment_recommendation_regeneration AFTER INSERT OR UPDATE OF payload,deleted_at OR DELETE ON garments FOR EACH ROW EXECUTE FUNCTION recommendation_garment_regeneration();

CREATE OR REPLACE FUNCTION recommendation_weather_regeneration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date; uid uuid;
BEGIN
  IF NEW.payload IS NULL OR (OLD IS NOT NULL AND NEW.payload IS NOT DISTINCT FROM OLD.payload) THEN RETURN NEW; END IF;
  FOR uid IN
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM user_location_profiles WHERE is_current AND superseded_at IS NULL AND location_id=NEW.location_id
      UNION SELECT user_id FROM location_date_overrides WHERE is_current AND superseded_at IS NULL AND location_id=NEW.location_id
      UNION SELECT user_id FROM trip_plans WHERE deleted_at IS NULL AND payload->'weatherLocation'->>'locationId'=NEW.location_id
    ) users
  LOOP
    FOR d IN SELECT generate_series((timezone('Asia/Shanghai',now()))::date,(timezone('Asia/Shanghai',now()))::date+6,'1 day')::date LOOP PERFORM enqueue_recommendation_regeneration(uid,d,'weather_changed'); END LOOP;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER weather_recommendation_regeneration AFTER INSERT OR UPDATE OF payload ON weather_cache FOR EACH ROW EXECUTE FUNCTION recommendation_weather_regeneration();
