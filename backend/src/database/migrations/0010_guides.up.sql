-- Report 4.5: tour guides (7 tables).

CREATE TABLE guide_languages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z]{2,3}$'),
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER guide_languages_set_updated_at BEFORE UPDATE ON guide_languages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE guides (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The guide's own account, when they have one (a person has at most one guide profile).
  user_id              UUID REFERENCES users (id) ON DELETE RESTRICT,
  partner_id           UUID NOT NULL REFERENCES partners (id) ON DELETE RESTRICT,
  -- display_name and photo_media_id are additions to the report's field list (public listings need them).
  display_name         TEXT NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 150),
  photo_media_id       UUID REFERENCES media_assets (id) ON DELETE RESTRICT,
  bio                  TEXT CHECK (char_length(bio) <= 5000),
  years_experience     INTEGER NOT NULL DEFAULT 0 CHECK (years_experience BETWEEN 0 AND 80),
  verification_status  TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX guides_user_key ON guides (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX guides_partner_idx ON guides (partner_id);
CREATE INDEX guides_public_idx ON guides (verification_status, status);
CREATE INDEX guides_name_trgm ON guides USING GIN (display_name gin_trgm_ops);
CREATE TRIGGER guides_set_updated_at BEFORE UPDATE ON guides FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE guide_language_links (
  guide_id     UUID NOT NULL REFERENCES guides (id) ON DELETE CASCADE,
  language_id  UUID NOT NULL REFERENCES guide_languages (id) ON DELETE RESTRICT,
  PRIMARY KEY (guide_id, language_id)
);
CREATE INDEX guide_language_links_language_idx ON guide_language_links (language_id);

CREATE TABLE guide_destinations (
  guide_id        UUID NOT NULL REFERENCES guides (id) ON DELETE CASCADE,
  destination_id  UUID NOT NULL REFERENCES destinations (id) ON DELETE RESTRICT,
  PRIMARY KEY (guide_id, destination_id)
);
CREATE INDEX guide_destinations_destination_idx ON guide_destinations (destination_id);

CREATE TABLE guide_services (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id          UUID NOT NULL REFERENCES guides (id) ON DELETE RESTRICT,
  title             TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 150),
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes BETWEEN 30 AND 4320),
  price             NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  max_group_size    INTEGER NOT NULL CHECK (max_group_size BETWEEN 1 AND 100),
  description       TEXT CHECK (char_length(description) <= 5000),
  booking_mode      TEXT NOT NULL DEFAULT 'instant' CHECK (booking_mode IN ('instant', 'request')),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX guide_services_guide_idx ON guide_services (guide_id);
CREATE TRIGGER guide_services_set_updated_at BEFORE UPDATE ON guide_services FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Published working windows. Windows of one guide may not overlap (exclusion constraint).
CREATE TABLE guide_availability (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id      UUID NOT NULL REFERENCES guides (id) ON DELETE CASCADE,
  service_date  DATE NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  status        TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'blocked')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  EXCLUDE USING GIST (guide_id WITH =, tsrange(service_date + start_time, service_date + end_time) WITH &&)
);
CREATE INDEX guide_availability_guide_date_idx ON guide_availability (guide_id, service_date);

CREATE TABLE guide_verification_documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id           UUID NOT NULL REFERENCES guides (id) ON DELETE CASCADE,
  document_media_id  UUID NOT NULL REFERENCES media_assets (id) ON DELETE RESTRICT,
  document_type      TEXT NOT NULL CHECK (document_type IN ('government_id', 'guide_license', 'training_certificate', 'police_verification', 'other')),
  review_status      TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  reviewed_by        UUID REFERENCES users (id) ON DELETE RESTRICT,
  reviewed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guide_id, document_media_id)
);
