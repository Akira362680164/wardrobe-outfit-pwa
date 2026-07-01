ALTER TABLE "assets" ADD COLUMN "orphaned_at" timestamp with time zone;

CREATE TABLE "asset_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "asset_id" uuid NOT NULL,
  "owner_entity_type" "sync_entity_type" NOT NULL,
  "owner_entity_id" uuid NOT NULL,
  "field_name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "asset_bindings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "asset_bindings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade
);

CREATE UNIQUE INDEX "asset_bindings_owner_field_unique" ON "asset_bindings" USING btree ("user_id", "owner_entity_type", "owner_entity_id", "field_name");
CREATE INDEX "asset_bindings_owner_idx" ON "asset_bindings" USING btree ("user_id", "owner_entity_type", "owner_entity_id");
CREATE INDEX "asset_bindings_asset_idx" ON "asset_bindings" USING btree ("user_id", "asset_id");
