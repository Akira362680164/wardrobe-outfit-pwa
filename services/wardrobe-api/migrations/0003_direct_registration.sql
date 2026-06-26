-- v2.0.1: Direct registration — phone_identities.verified_at now nullable
-- New accounts are created with verified_at = NULL (no SMS verification yet)
-- Existing verified_at data is preserved.
-- pending_registrations table is retained for historical compatibility only.

ALTER TABLE phone_identities ALTER COLUMN verified_at DROP NOT NULL;
