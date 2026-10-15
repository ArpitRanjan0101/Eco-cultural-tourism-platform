-- Report 4.3 (3 tables) and 4.6 (7 tables): bookable experiences and tour packages.

CREATE TABLE experiences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        UUID NOT NULL REFERENCES partners (id) ON DELETE RESTRICT,
  destination_id    UUID REFERENCES destinations (id) ON DELETE RESTRICT,
  name              TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 150),
  slug              TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 160),
  description       TEXT CHECK (char_length(description) <= 20000),
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 4320),
  min_participants  INTEGER NOT NULL DEFAULT 1 CHECK (min_participants >= 1),
  max_participants  INTEGER NOT NULL CHECK (max_participants BETWEEN 1 AND 500),
  booking_mode      TEXT NOT NULL DEFAULT 'instant' CHECK (booking_mode IN ('instant', 'request')),
  status            TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'published', 'rejected', 'suspended')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (max_participants >= min_participants),
  CHECK (status <> 'published' OR (description IS NOT NULL AND destination_id IS NOT NULL))
);
CREATE INDEX experiences_partner_idx ON experiences (partner_id);
CREATE INDEX experiences_destination_idx ON experiences (destination_id);
CREATE INDEX experiences_status_idx ON experiences (status);
CREATE INDEX experiences_name_trgm ON experiences USING GIN (name gin_trgm_ops);
CREATE TRIGGER experiences_set_updated_at BEFORE UPDATE ON experiences FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE experience_media (
  experience_id  UUID NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  media_id       UUID NOT NULL REFERENCES media_assets (id) ON DELETE RESTRICT,
  sort_order     INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  PRIMARY KEY (experience_id, media_id)
);
CREATE INDEX experience_media_media_idx ON experience_media (media_id);

CREATE TABLE experience_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id     UUID NOT NULL REFERENCES experiences (id) ON DELETE RESTRICT,
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,
  capacity          INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 1000),
  price_per_person  NUMERIC(12, 2) NOT NULL CHECK (price_per_person >= 0),
  status            TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX experience_sessions_experience_idx ON experience_sessions (experience_id, starts_at);
CREATE TRIGGER experience_sessions_set_updated_at BEFORE UPDATE ON experience_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE packages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id       UUID NOT NULL REFERENCES partners (id) ON DELETE RESTRICT,
  name             TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 150),
  slug             TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 160),
  summary          TEXT CHECK (char_length(summary) <= 500),
  description      TEXT CHECK (char_length(description) <= 20000),
  duration_days    INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 60),
  duration_nights  INTEGER NOT NULL CHECK (duration_nights BETWEEN 0 AND 60),
  -- Maintained by the service: lowest price among upcoming scheduled departures.
  starting_price   NUMERIC(12, 2) CHECK (starting_price >= 0),
  min_travelers    INTEGER NOT NULL DEFAULT 1 CHECK (min_travelers >= 1),
  max_travelers    INTEGER NOT NULL CHECK (max_travelers BETWEEN 1 AND 500),
  booking_mode     TEXT NOT NULL DEFAULT 'instant' CHECK (booking_mode IN ('instant', 'request')),
  status           TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'published', 'rejected', 'suspended')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (max_travelers >= min_travelers),
  CHECK (duration_nights BETWEEN duration_days - 1 AND duration_days),
  CHECK (status <> 'published' OR (summary IS NOT NULL AND description IS NOT NULL))
);
CREATE INDEX packages_partner_idx ON packages (partner_id);
CREATE INDEX packages_status_idx ON packages (status);
CREATE INDEX packages_name_trgm ON packages USING GIN (name gin_trgm_ops);
CREATE TRIGGER packages_set_updated_at BEFORE UPDATE ON packages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE package_destinations (
  package_id      UUID NOT NULL REFERENCES packages (id) ON DELETE CASCADE,
  destination_id  UUID NOT NULL REFERENCES destinations (id) ON DELETE RESTRICT,
  sort_order      INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  PRIMARY KEY (package_id, destination_id)
);
CREATE INDEX package_destinations_destination_idx ON package_destinations (destination_id);

CREATE TABLE package_itinerary_days (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id   UUID NOT NULL REFERENCES packages (id) ON DELETE CASCADE,
  day_number   INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 60),
  title        TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 150),
  description  TEXT CHECK (char_length(description) <= 5000),
  UNIQUE (package_id, day_number)
);

CREATE TABLE package_itinerary_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_day_id  UUID NOT NULL REFERENCES package_itinerary_days (id) ON DELETE CASCADE,
  destination_id    UUID REFERENCES destinations (id) ON DELETE RESTRICT,
  activity_title    TEXT NOT NULL CHECK (char_length(btrim(activity_title)) BETWEEN 1 AND 150),
  description       TEXT CHECK (char_length(description) <= 2000),
  sort_order        INTEGER NOT NULL CHECK (sort_order >= 0),
  UNIQUE (itinerary_day_id, sort_order)
);

CREATE TABLE package_inclusions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id      UUID NOT NULL REFERENCES packages (id) ON DELETE CASCADE,
  description     TEXT NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 300),
  inclusion_type  TEXT NOT NULL CHECK (inclusion_type IN ('included', 'excluded')),
  sort_order      INTEGER NOT NULL CHECK (sort_order >= 0)
);
CREATE INDEX package_inclusions_package_idx ON package_inclusions (package_id, sort_order);

CREATE TABLE package_media (
  package_id  UUID NOT NULL REFERENCES packages (id) ON DELETE CASCADE,
  media_id    UUID NOT NULL REFERENCES media_assets (id) ON DELETE RESTRICT,
  sort_order  INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  PRIMARY KEY (package_id, media_id)
);
CREATE INDEX package_media_media_idx ON package_media (media_id);

CREATE TABLE package_departures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id        UUID NOT NULL REFERENCES packages (id) ON DELETE RESTRICT,
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  total_seats       INTEGER NOT NULL CHECK (total_seats BETWEEN 1 AND 1000),
  price_per_person  NUMERIC(12, 2) NOT NULL CHECK (price_per_person >= 0),
  status            TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'closed', 'cancelled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  UNIQUE (package_id, start_date)
);
CREATE INDEX package_departures_package_idx ON package_departures (package_id, start_date);
CREATE TRIGGER package_departures_set_updated_at BEFORE UPDATE ON package_departures FOR EACH ROW EXECUTE FUNCTION set_updated_at();
