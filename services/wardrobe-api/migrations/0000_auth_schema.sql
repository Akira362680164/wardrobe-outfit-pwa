CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE pending_registration_status AS ENUM ('pending', 'verified', 'expired', 'cancelled', 'completed');
CREATE TYPE refresh_token_status AS ENUM ('active', 'used', 'revoked');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE phone_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  masked_phone text NOT NULL,
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX phone_identities_phone_e164_unique ON phone_identities(phone_e164);
CREATE INDEX phone_identities_user_id_idx ON phone_identities(user_id);

CREATE TABLE password_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  password_version integer NOT NULL DEFAULT 1,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX password_credentials_user_id_unique ON password_credentials(user_id);

CREATE TABLE pending_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL,
  masked_phone text NOT NULL,
  password_hash text NOT NULL,
  client_secret_hash text NOT NULL,
  status pending_registration_status NOT NULL DEFAULT 'pending',
  verification_source text,
  verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pending_registrations_phone_status_idx ON pending_registrations(phone_e164, status);
CREATE INDEX pending_registrations_expires_at_idx ON pending_registrations(expires_at);

CREATE TABLE device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_label text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_sessions_user_device_idx ON device_sessions(user_id, device_id);
CREATE INDEX device_sessions_user_id_idx ON device_sessions(user_id);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES device_sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  token_family_id uuid NOT NULL,
  status refresh_token_status NOT NULL DEFAULT 'active',
  absolute_expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  refresh_request_id text,
  idempotency_ciphertext text,
  idempotency_nonce text,
  idempotency_auth_tag text,
  idempotency_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX refresh_tokens_token_hash_unique ON refresh_tokens(token_hash);
CREATE INDEX refresh_tokens_session_id_idx ON refresh_tokens(session_id);
CREATE INDEX refresh_tokens_family_id_idx ON refresh_tokens(token_family_id);
CREATE INDEX refresh_tokens_idempotency_expires_at_idx ON refresh_tokens(idempotency_expires_at);

CREATE TABLE account_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  ip_hash text,
  user_agent_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  redacted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_security_events_user_created_idx ON account_security_events(user_id, created_at);
CREATE INDEX account_security_events_event_type_idx ON account_security_events(event_type);
