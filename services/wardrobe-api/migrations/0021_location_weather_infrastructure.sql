CREATE TABLE "user_location_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "location_id" text,
  "display_name" text,
  "timezone" text,
  "centroid_latitude" double precision,
  "centroid_longitude" double precision,
  "revision" integer NOT NULL,
  "client_mutation_id" uuid NOT NULL,
  "mutation_fingerprint" text NOT NULL,
  "is_current" boolean DEFAULT true NOT NULL,
  "superseded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_location_profiles_revision_positive" CHECK (revision > 0),
  CONSTRAINT "user_location_profiles_location_all_or_none" CHECK ((location_id IS NULL AND display_name IS NULL AND timezone IS NULL AND centroid_latitude IS NULL AND centroid_longitude IS NULL) OR (location_id IS NOT NULL AND display_name IS NOT NULL AND timezone IS NOT NULL)),
  CONSTRAINT "user_location_profiles_latitude_range" CHECK (centroid_latitude IS NULL OR centroid_latitude BETWEEN -90 AND 90),
  CONSTRAINT "user_location_profiles_longitude_range" CHECK (centroid_longitude IS NULL OR centroid_longitude BETWEEN -180 AND 180),
  CONSTRAINT "user_location_profiles_fingerprint" CHECK (mutation_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "user_location_profiles_current_state" CHECK ((is_current AND superseded_at IS NULL) OR (NOT is_current AND superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX "user_location_profiles_user_revision_unique" ON "user_location_profiles" ("user_id","revision");
CREATE UNIQUE INDEX "user_location_profiles_user_mutation_unique" ON "user_location_profiles" ("user_id","client_mutation_id");
CREATE UNIQUE INDEX "user_location_profiles_one_current" ON "user_location_profiles" ("user_id") WHERE "is_current" = true;

CREATE TABLE "location_date_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "location_id" text,
  "display_name" text,
  "timezone" text,
  "centroid_latitude" double precision,
  "centroid_longitude" double precision,
  "effective_from" date,
  "effective_through" date,
  "source" text,
  "confirmed_at" timestamp with time zone,
  "revision" integer NOT NULL,
  "client_mutation_id" uuid NOT NULL,
  "mutation_fingerprint" text NOT NULL,
  "is_current" boolean DEFAULT true NOT NULL,
  "superseded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "location_date_overrides_revision_positive" CHECK (revision > 0),
  CONSTRAINT "location_date_overrides_location_all_or_none" CHECK ((location_id IS NULL AND display_name IS NULL AND timezone IS NULL AND centroid_latitude IS NULL AND centroid_longitude IS NULL AND effective_from IS NULL AND effective_through IS NULL AND source IS NULL AND confirmed_at IS NULL) OR (location_id IS NOT NULL AND display_name IS NOT NULL AND timezone IS NOT NULL AND effective_from IS NOT NULL AND effective_through IS NOT NULL AND source = 'device_location' AND confirmed_at IS NOT NULL)),
  CONSTRAINT "location_date_overrides_dates" CHECK (effective_from IS NULL OR effective_from <= effective_through),
  CONSTRAINT "location_date_overrides_latitude_range" CHECK (centroid_latitude IS NULL OR centroid_latitude BETWEEN -90 AND 90),
  CONSTRAINT "location_date_overrides_longitude_range" CHECK (centroid_longitude IS NULL OR centroid_longitude BETWEEN -180 AND 180),
  CONSTRAINT "location_date_overrides_fingerprint" CHECK (mutation_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "location_date_overrides_current_state" CHECK ((is_current AND superseded_at IS NULL) OR (NOT is_current AND superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX "location_date_overrides_user_revision_unique" ON "location_date_overrides" ("user_id","revision");
CREATE UNIQUE INDEX "location_date_overrides_user_mutation_unique" ON "location_date_overrides" ("user_id","client_mutation_id");
CREATE UNIQUE INDEX "location_date_overrides_one_current_device" ON "location_date_overrides" ("user_id") WHERE "is_current" = true;

CREATE TABLE "weather_cache" (
  "provider" text NOT NULL,
  "location_id" text NOT NULL,
  "endpoint" text NOT NULL,
  "lang" text NOT NULL,
  "unit" text NOT NULL,
  "payload" jsonb,
  "provider_updated_at" timestamp with time zone,
  "fetched_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "stale_until" timestamp with time zone,
  "sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "license" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "target_local_date" date,
  "status" text DEFAULT 'negative' NOT NULL,
  "negative_code" text,
  "negative_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("provider","location_id","endpoint","lang","unit"),
  CONSTRAINT "weather_cache_provider" CHECK (provider = 'qweather'),
  CONSTRAINT "weather_cache_endpoint" CHECK (endpoint IN ('now','hourly','daily')),
  CONSTRAINT "weather_cache_lang" CHECK (lang IN ('zh','en')),
  CONSTRAINT "weather_cache_unit" CHECK (unit IN ('m','i')),
  CONSTRAINT "weather_cache_status" CHECK (status IN ('positive','negative')),
  CONSTRAINT "weather_cache_positive_complete" CHECK (payload IS NULL OR (provider_updated_at IS NOT NULL AND fetched_at IS NOT NULL AND expires_at IS NOT NULL AND stale_until IS NOT NULL AND target_local_date IS NOT NULL AND fetched_at < expires_at AND expires_at <= stale_until)),
  CONSTRAINT "weather_cache_negative_complete" CHECK ((negative_code IS NULL AND negative_until IS NULL) OR (negative_code IS NOT NULL AND negative_until IS NOT NULL))
);
CREATE INDEX "weather_cache_expiry_idx" ON "weather_cache" ("expires_at");
CREATE INDEX "weather_cache_negative_idx" ON "weather_cache" ("negative_until");
