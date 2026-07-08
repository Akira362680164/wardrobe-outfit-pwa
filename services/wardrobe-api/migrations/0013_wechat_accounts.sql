CREATE TABLE "wechat_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "app_id" text NOT NULL,
  "openid" text NOT NULL,
  "unionid" text,
  "phone_hash" text NOT NULL,
  "phone_masked" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "wechat_accounts_app_openid_unique"
  ON "wechat_accounts" ("app_id", "openid");

CREATE INDEX "wechat_accounts_user_id_idx"
  ON "wechat_accounts" ("user_id");

CREATE INDEX "wechat_accounts_phone_hash_idx"
  ON "wechat_accounts" ("phone_hash");
