-- Report 4.12 (part): media_assets. Objects live in S3-compatible storage; only metadata here.

-- Trigram matching for autocomplete / fuzzy search (Phase 3 search module).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE media_assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by  UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  -- purpose drives allowed types, size limits and visibility (see media.policy.js).
  purpose      TEXT NOT NULL CHECK (purpose IN ('avatar', 'content_image', 'supply_image', 'verification_document')),
  storage_key  TEXT NOT NULL UNIQUE CHECK (storage_key ~ '^[a-z_]+/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.[a-z]{3,4}$'),
  public_url   TEXT,
  mime_type    TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size    BIGINT NOT NULL CHECK (file_size > 0 AND file_size <= 26214400),
  width        INTEGER CHECK (width > 0),
  height       INTEGER CHECK (height > 0),
  alt_text     TEXT CHECK (char_length(alt_text) <= 300),
  visibility   TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'rejected')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (visibility = 'public' OR public_url IS NULL),
  CHECK (status <> 'ready' OR visibility = 'private' OR public_url IS NOT NULL)
);
CREATE INDEX media_assets_uploaded_by_idx ON media_assets (uploaded_by, created_at DESC);
CREATE INDEX media_assets_pending_idx ON media_assets (created_at) WHERE status = 'pending';
CREATE TRIGGER media_assets_set_updated_at BEFORE UPDATE ON media_assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_avatar_media_fk FOREIGN KEY (avatar_media_id) REFERENCES media_assets (id) ON DELETE RESTRICT;
