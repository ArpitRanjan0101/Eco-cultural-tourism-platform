-- Report 4.2: geography and destinations (8 tables).

CREATE TABLE regions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  slug         TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  description  TEXT CHECK (char_length(description) <= 5000),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX regions_name_key ON regions (lower(name));
CREATE TRIGGER regions_set_updated_at BEFORE UPDATE ON regions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE districts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id    UUID NOT NULL REFERENCES regions (id) ON DELETE RESTRICT,
  name         TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  slug         TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  description  TEXT CHECK (char_length(description) <= 5000),
  location     GEOGRAPHY (POINT, 4326),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX districts_name_key ON districts (lower(name));
CREATE INDEX districts_region_idx ON districts (region_id);
CREATE INDEX districts_location_gist ON districts USING GIST (location);
CREATE INDEX districts_name_trgm ON districts USING GIN (name gin_trgm_ops);
CREATE TRIGGER districts_set_updated_at BEFORE UPDATE ON districts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE destination_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  slug         TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  description  TEXT CHECK (char_length(description) <= 2000),
  icon         TEXT CHECK (icon ~ '^[a-z0-9-]{1,50}$'),
  -- Not in the report's field list; required by PATCH /admin/destination-categories/:id/status (DECISIONS C3).
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX destination_categories_name_key ON destination_categories (lower(name));
CREATE TRIGGER destination_categories_set_updated_at BEFORE UPDATE ON destination_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE destinations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id        UUID NOT NULL REFERENCES districts (id) ON DELETE RESTRICT,
  name               TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 150),
  slug               TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 160),
  summary            TEXT CHECK (char_length(summary) <= 500),
  description        TEXT CHECK (char_length(description) <= 20000),
  geo_location       GEOGRAPHY (POINT, 4326),
  address            TEXT CHECK (char_length(address) <= 500),
  opening_hours      JSONB CHECK (opening_hours IS NULL OR jsonb_typeof(opening_hours) = 'object'),
  best_time_to_visit TEXT CHECK (char_length(best_time_to_visit) <= 200),
  entry_fee          NUMERIC(12, 2) CHECK (entry_fee >= 0),
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  featured           BOOLEAN NOT NULL DEFAULT false,
  published_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  search_vector      TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', name), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED,
  -- A published destination must be complete enough to show publicly.
  CHECK (status <> 'published' OR (summary IS NOT NULL AND description IS NOT NULL AND geo_location IS NOT NULL))
);
CREATE INDEX destinations_district_idx ON destinations (district_id);
CREATE INDEX destinations_status_featured_idx ON destinations (status, featured);
CREATE INDEX destinations_geo_gist ON destinations USING GIST (geo_location);
CREATE INDEX destinations_search_gin ON destinations USING GIN (search_vector);
CREATE INDEX destinations_name_trgm ON destinations USING GIN (name gin_trgm_ops);
CREATE TRIGGER destinations_set_updated_at BEFORE UPDATE ON destinations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Destinations are archived, never hard-deleted, so child rows may cascade.
CREATE TABLE destination_category_links (
  destination_id  UUID NOT NULL REFERENCES destinations (id) ON DELETE CASCADE,
  category_id     UUID NOT NULL REFERENCES destination_categories (id) ON DELETE RESTRICT,
  PRIMARY KEY (destination_id, category_id)
);
CREATE INDEX destination_category_links_category_idx ON destination_category_links (category_id);

CREATE TABLE destination_media (
  destination_id  UUID NOT NULL REFERENCES destinations (id) ON DELETE CASCADE,
  media_id        UUID NOT NULL REFERENCES media_assets (id) ON DELETE RESTRICT,
  sort_order      INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_cover        BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (destination_id, media_id)
);
CREATE UNIQUE INDEX destination_media_one_cover ON destination_media (destination_id) WHERE is_cover;
CREATE INDEX destination_media_media_idx ON destination_media (media_id);

CREATE TABLE destination_faqs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id  UUID NOT NULL REFERENCES destinations (id) ON DELETE CASCADE,
  question        TEXT NOT NULL CHECK (char_length(btrim(question)) BETWEEN 1 AND 300),
  answer          TEXT NOT NULL CHECK (char_length(btrim(answer)) BETWEEN 1 AND 3000),
  sort_order      INTEGER NOT NULL CHECK (sort_order >= 0),
  UNIQUE (destination_id, sort_order)
);

CREATE TABLE destination_related_places (
  destination_id          UUID NOT NULL REFERENCES destinations (id) ON DELETE CASCADE,
  related_destination_id  UUID NOT NULL REFERENCES destinations (id) ON DELETE CASCADE,
  sort_order              INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  PRIMARY KEY (destination_id, related_destination_id),
  CHECK (destination_id <> related_destination_id)
);
