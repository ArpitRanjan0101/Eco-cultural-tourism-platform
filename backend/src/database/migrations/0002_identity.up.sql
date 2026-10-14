-- Report 4.1: identity, authentication and RBAC (9 tables).

CREATE TABLE users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name          TEXT NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 150),
  email              CITEXT NOT NULL CHECK (char_length(email) <= 254 AND email = btrim(email)),
  phone              TEXT CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  password_hash      TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  email_verified_at  TIMESTAMPTZ,
  phone_verified_at  TIMESTAMPTZ,
  last_login_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (email);
CREATE UNIQUE INDEX users_phone_key ON users (phone) WHERE phone IS NOT NULL;
CREATE INDEX users_status_idx ON users (status);
CREATE INDEX users_created_at_idx ON users (created_at);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- avatar_media_id gains its FK to media_assets when the media module lands (Phase 3).
CREATE TABLE user_profiles (
  user_id             UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  avatar_media_id     UUID,
  preferred_language  TEXT CHECK (preferred_language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  country             TEXT CHECK (country ~ '^[A-Z]{2}$'),
  state               TEXT CHECK (char_length(state) <= 100),
  city                TEXT CHECK (char_length(city) <= 100),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER user_profiles_set_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_]{1,49}$'),
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE permissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*){1,3}$'),
  module       TEXT NOT NULL CHECK (module ~ '^[a-z][a-z_]*$'),
  description  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX permissions_module_idx ON permissions (module);

CREATE TABLE role_permissions (
  role_id        UUID NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission_id  UUID NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX role_permissions_permission_idx ON role_permissions (permission_id);

CREATE TABLE user_roles (
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX user_roles_role_idx ON user_roles (role_id);

-- Opaque refresh tokens; only SHA-256 hashes are stored. A family is one login session.
CREATE TABLE auth_refresh_tokens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash       TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  token_family_id  UUID NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  revoked_at       TIMESTAMPTZ,
  replaced_by_id   UUID REFERENCES auth_refresh_tokens (id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_refresh_tokens_family_idx ON auth_refresh_tokens (token_family_id);
CREATE INDEX auth_refresh_tokens_user_active_idx ON auth_refresh_tokens (user_id) WHERE revoked_at IS NULL;
CREATE INDEX auth_refresh_tokens_expires_idx ON auth_refresh_tokens (expires_at);

CREATE TABLE auth_verification_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  purpose      TEXT NOT NULL CHECK (purpose IN ('email_verification', 'password_reset')),
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_verification_tokens_open_idx ON auth_verification_tokens (user_id, purpose) WHERE consumed_at IS NULL;
CREATE INDEX auth_verification_tokens_expires_idx ON auth_verification_tokens (expires_at);

-- identifier_hash = SHA-256 of the normalised email, so attempts on unknown accounts are recorded without storing them.
CREATE TABLE auth_login_attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_hash  TEXT NOT NULL CHECK (identifier_hash ~ '^[0-9a-f]{64}$'),
  ip_address       INET,
  succeeded        BOOLEAN NOT NULL,
  attempted_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_login_attempts_identifier_idx ON auth_login_attempts (identifier_hash, attempted_at DESC);
CREATE INDEX auth_login_attempts_ip_idx ON auth_login_attempts (ip_address, attempted_at DESC);
