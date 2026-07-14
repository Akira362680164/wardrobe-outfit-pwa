ALTER TABLE "recommendation_regeneration_requests"
  ADD COLUMN "client_mutation_fingerprints" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "claim_token" uuid,
  ADD COLUMN "lease_expires_at" timestamp with time zone,
  ADD COLUMN "generation_batch_id" uuid,
  ADD COLUMN "trigger_version" integer NOT NULL DEFAULT 1,
  ADD COLUMN "claimed_trigger_version" integer;

UPDATE recommendation_regeneration_requests
SET status='pending', locked_at=NULL, next_attempt_at=now(), updated_at=now()
WHERE status='processing';

UPDATE recommendation_regeneration_requests r
SET client_mutation_fingerprints=(
  SELECT coalesce(jsonb_object_agg(value::text,encode(public.digest(r.user_id::text || ':' || r.target_date::text || ':explicit_reassess','sha256'),'hex')),'{}'::jsonb)
  FROM unnest(r.client_mutation_ids) value
)
WHERE cardinality(client_mutation_ids)>0;

ALTER TABLE "recommendation_regeneration_requests"
  ADD CONSTRAINT "recommendation_regeneration_trigger_versions" CHECK (trigger_version > 0 AND (claimed_trigger_version IS NULL OR claimed_trigger_version > 0)),
  ADD CONSTRAINT "recommendation_regeneration_claim_state" CHECK (
    (status='processing' AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL AND generation_batch_id IS NOT NULL AND claimed_trigger_version IS NOT NULL)
    OR
    (status<>'processing' AND claim_token IS NULL AND lease_expires_at IS NULL AND generation_batch_id IS NULL)
  );

CREATE INDEX "recommendation_regeneration_lease_idx"
  ON "recommendation_regeneration_requests" ("status","lease_expires_at");

CREATE OR REPLACE FUNCTION enqueue_recommendation_regeneration(p_user uuid, p_date date, p_reason text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_date IS NULL OR p_date < (timezone('Asia/Shanghai', now()))::date THEN RETURN; END IF;
  INSERT INTO recommendation_regeneration_requests(user_id,target_date,reasons,content_fingerprint)
  VALUES(p_user,p_date,ARRAY[p_reason],encode(public.digest(p_user::text || ':' || p_date::text || ':' || p_reason,'sha256'),'hex'))
  ON CONFLICT (user_id,target_date) WHERE status IN ('pending','processing') DO UPDATE
  SET reasons=(SELECT array_agg(DISTINCT value ORDER BY value) FROM unnest(recommendation_regeneration_requests.reasons || excluded.reasons) value),
      trigger_version=recommendation_regeneration_requests.trigger_version+1,
      next_attempt_at=LEAST(recommendation_regeneration_requests.next_attempt_at,now()),
      updated_at=now();
END $$;
