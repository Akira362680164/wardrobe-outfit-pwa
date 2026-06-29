CREATE UNIQUE INDEX locations_one_active_home_per_user
ON locations(user_id)
WHERE deleted_at IS NULL AND payload->>'dexieId' = 'home';
