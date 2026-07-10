CREATE INDEX "email_verification_challenges_email_created_at_idx"
  ON "email_verification_challenges" ("email_normalized", "created_at");

CREATE INDEX "email_verification_challenges_ip_created_at_idx"
  ON "email_verification_challenges" ("created_ip_hash", "created_at");
