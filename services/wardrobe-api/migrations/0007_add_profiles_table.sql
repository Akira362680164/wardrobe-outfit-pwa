-- Migration: add profiles table and extend sync_entity_type enum
ALTER TYPE sync_entity_type ADD VALUE IF NOT EXISTS 'profile';

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_type text NOT NULL DEFAULT 'tryOn',
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1,
  origin_device_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_user_profile_type_idx ON profiles(user_id, profile_type);
