CREATE TYPE sync_entity_type AS ENUM (
  'garment',
  'outfit',
  'outfitItem',
  'wishlistItem',
  'wearEvent',
  'tripPlan',
  'outfitPlan',
  'asset'
);

CREATE TYPE sync_mutation_operation AS ENUM ('create', 'update', 'delete');
CREATE TYPE sync_mutation_status AS ENUM ('accepted', 'conflict', 'rejected');

CREATE TABLE wardrobes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '默认衣橱',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wardrobes_user_updated_idx ON wardrobes(user_id, updated_at);

CREATE TABLE garments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wardrobe_id uuid REFERENCES wardrobes(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1,
  origin_device_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX garments_user_revision_idx ON garments(user_id, revision);
CREATE INDEX garments_user_updated_idx ON garments(user_id, updated_at);

CREATE TABLE outfits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1,
  origin_device_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outfits_user_revision_idx ON outfits(user_id, revision);
CREATE INDEX outfits_user_updated_idx ON outfits(user_id, updated_at);

CREATE TABLE outfit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  outfit_id uuid NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
  garment_id uuid NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1,
  origin_device_id text NOT NULL,
  sort_order integer,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outfit_items_outfit_id_idx ON outfit_items(outfit_id);
CREATE INDEX outfit_items_garment_id_idx ON outfit_items(garment_id);
CREATE INDEX outfit_items_user_revision_idx ON outfit_items(user_id, revision);

CREATE TABLE wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1,
  origin_device_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wishlist_items_user_revision_idx ON wishlist_items(user_id, revision);
CREATE INDEX wishlist_items_user_updated_idx ON wishlist_items(user_id, updated_at);

CREATE TABLE wear_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  garment_id uuid REFERENCES garments(id) ON DELETE SET NULL,
  outfit_id uuid REFERENCES outfits(id) ON DELETE SET NULL,
  worn_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  origin_device_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wear_events_user_worn_idx ON wear_events(user_id, worn_at);
CREATE INDEX wear_events_garment_id_idx ON wear_events(garment_id);
CREATE INDEX wear_events_outfit_id_idx ON wear_events(outfit_id);

CREATE TABLE trip_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date text,
  end_date text,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1,
  origin_device_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trip_plans_user_updated_idx ON trip_plans(user_id, updated_at);

CREATE TABLE outfit_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_plan_id uuid REFERENCES trip_plans(id) ON DELETE SET NULL,
  outfit_id uuid REFERENCES outfits(id) ON DELETE SET NULL,
  plan_date text,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1,
  origin_device_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outfit_plans_user_date_idx ON outfit_plans(user_id, plan_date);
CREATE INDEX outfit_plans_trip_plan_id_idx ON outfit_plans(trip_plan_id);

CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_entity_type sync_entity_type NOT NULL,
  owner_entity_id uuid NOT NULL,
  sha256 text,
  mime_type text,
  storage_key text,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1,
  origin_device_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assets_user_owner_idx ON assets(user_id, owner_entity_type, owner_entity_id);
CREATE INDEX assets_sha256_idx ON assets(sha256);

CREATE TABLE sync_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  change_seq bigint NOT NULL,
  entity_type sync_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  operation sync_mutation_operation NOT NULL,
  revision integer NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sync_changes_user_seq_unique ON sync_changes(user_id, change_seq);
CREATE INDEX sync_changes_user_entity_idx ON sync_changes(user_id, entity_type, entity_id);

CREATE TABLE sync_mutations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mutation_id uuid NOT NULL,
  entity_type sync_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  operation sync_mutation_operation NOT NULL,
  base_revision integer,
  status sync_mutation_status NOT NULL,
  result_revision integer,
  error_code text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sync_mutations_user_mutation_unique ON sync_mutations(user_id, mutation_id);
CREATE INDEX sync_mutations_user_entity_idx ON sync_mutations(user_id, entity_type, entity_id);
