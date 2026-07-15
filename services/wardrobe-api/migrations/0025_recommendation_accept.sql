CREATE TABLE "recommendation_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "recommendation_id" uuid REFERENCES "daily_recommendations"("id") ON DELETE SET NULL,
  "plan_entry_id" uuid REFERENCES "outfit_plans"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "candidate_id" uuid NOT NULL,
  "client_mutation_id" uuid NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recommendation_actions_action" CHECK ("action" IN ('accepted','item_replaced','rejected','saved_outfit')),
  CONSTRAINT "recommendation_actions_user_mutation_unique" UNIQUE("user_id","client_mutation_id")
);
CREATE INDEX "recommendation_actions_user_created_idx" ON "recommendation_actions" ("user_id","created_at");
CREATE INDEX "recommendation_actions_recommendation_idx" ON "recommendation_actions" ("recommendation_id");
CREATE INDEX "recommendation_actions_plan_idx" ON "recommendation_actions" ("plan_entry_id");
