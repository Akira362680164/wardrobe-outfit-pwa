-- Account deletion removes the user row before cascading garment/trip rows.
-- Their AFTER DELETE triggers must not recreate dirty work for that user.
CREATE OR REPLACE FUNCTION enqueue_recommendation_regeneration(p_user uuid, p_date date, p_reason text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_date IS NULL
    OR p_date < (timezone('Asia/Shanghai', now()))::date
    OR NOT EXISTS (SELECT 1 FROM users WHERE id = p_user)
  THEN
    RETURN;
  END IF;
  INSERT INTO recommendation_regeneration_requests(user_id,target_date,reasons,content_fingerprint)
  VALUES(p_user,p_date,ARRAY[p_reason],encode(public.digest(p_user::text || ':' || p_date::text || ':' || p_reason,'sha256'),'hex'))
  ON CONFLICT (user_id,target_date) WHERE status IN ('pending','processing') DO UPDATE
  SET reasons=(SELECT array_agg(DISTINCT value ORDER BY value) FROM unnest(recommendation_regeneration_requests.reasons || excluded.reasons) value),
      trigger_version=recommendation_regeneration_requests.trigger_version+1,
      next_attempt_at=LEAST(recommendation_regeneration_requests.next_attempt_at,now()),
      updated_at=now();
END $$;
