-- Report 4.4: accommodation and room-type/date inventory (10 tables).

CREATE TABLE amenities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_]{1,49}$'),
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  category    TEXT NOT NULL CHECK (category IN ('general', 'room', 'bathroom', 'food', 'outdoor', 'accessibility', 'safety', 'connectivity')),
  icon        TEXT CHECK (icon ~ '^[a-z0-9-]{1,50}$'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER amenities_set_updated_at BEFORE UPDATE ON amenities FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE properties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      UUID NOT NULL REFERENCES partners (id) ON DELETE RESTRICT,
  district_id     UUID NOT NULL REFERENCES districts (id) ON DELETE RESTRICT,
  destination_id  UUID REFERENCES destinations (id) ON DELETE RESTRICT,
  name            TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 150),
  slug            TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 160),
  property_type   TEXT NOT NULL CHECK (property_type IN ('hotel', 'resort', 'homestay', 'guest_house', 'eco_lodge', 'camp', 'dharamshala')),
  description     TEXT CHECK (char_length(description) <= 20000),
  address         TEXT CHECK (char_length(address) <= 500),
  geo_location    GEOGRAPHY (POINT, 4326),
  contact_phone   TEXT CHECK (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  check_in_time   TIME NOT NULL DEFAULT '12:00',
  check_out_time  TIME NOT NULL DEFAULT '11:00',
  -- Instant-book vs request-to-book (DECISIONS O3).
  booking_mode    TEXT NOT NULL DEFAULT 'instant' CHECK (booking_mode IN ('instant', 'request')),
  status          TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'published', 'rejected', 'suspended')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'published' OR (description IS NOT NULL AND address IS NOT NULL AND geo_location IS NOT NULL))
);
CREATE INDEX properties_partner_idx ON properties (partner_id);
CREATE INDEX properties_district_idx ON properties (district_id);
CREATE INDEX properties_destination_idx ON properties (destination_id);
CREATE INDEX properties_status_idx ON properties (status);
CREATE INDEX properties_geo_gist ON properties USING GIST (geo_location);
CREATE INDEX properties_name_trgm ON properties USING GIN (name gin_trgm_ops);
CREATE TRIGGER properties_set_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE property_media (
  property_id  UUID NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  media_id     UUID NOT NULL REFERENCES media_assets (id) ON DELETE RESTRICT,
  sort_order   INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_cover     BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (property_id, media_id)
);
CREATE UNIQUE INDEX property_media_one_cover ON property_media (property_id) WHERE is_cover;
CREATE INDEX property_media_media_idx ON property_media (media_id);

CREATE TABLE property_amenities (
  property_id  UUID NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  amenity_id   UUID NOT NULL REFERENCES amenities (id) ON DELETE RESTRICT,
  PRIMARY KEY (property_id, amenity_id)
);

CREATE TABLE room_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID NOT NULL REFERENCES properties (id) ON DELETE RESTRICT,
  name          TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  description   TEXT CHECK (char_length(description) <= 5000),
  max_adults    INTEGER NOT NULL CHECK (max_adults BETWEEN 1 AND 20),
  max_children  INTEGER NOT NULL DEFAULT 0 CHECK (max_children BETWEEN 0 AND 10),
  total_units   INTEGER NOT NULL CHECK (total_units BETWEEN 1 AND 500),
  base_price    NUMERIC(12, 2) NOT NULL CHECK (base_price >= 0),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX room_types_property_idx ON room_types (property_id);
CREATE UNIQUE INDEX room_types_name_key ON room_types (property_id, lower(name));
CREATE TRIGGER room_types_set_updated_at BEFORE UPDATE ON room_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE room_type_media (
  room_type_id  UUID NOT NULL REFERENCES room_types (id) ON DELETE CASCADE,
  media_id      UUID NOT NULL REFERENCES media_assets (id) ON DELETE RESTRICT,
  sort_order    INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  PRIMARY KEY (room_type_id, media_id)
);
CREATE INDEX room_type_media_media_idx ON room_type_media (media_id);

CREATE TABLE room_type_amenities (
  room_type_id  UUID NOT NULL REFERENCES room_types (id) ON DELETE CASCADE,
  amenity_id    UUID NOT NULL REFERENCES amenities (id) ON DELETE RESTRICT,
  PRIMARY KEY (room_type_id, amenity_id)
);

-- Room-type/date grain (Report §4.4). A missing row means: room_types.total_units sellable, nothing blocked.
CREATE TABLE room_inventory (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id   UUID NOT NULL REFERENCES room_types (id) ON DELETE CASCADE,
  stay_date      DATE NOT NULL,
  total_units    INTEGER NOT NULL CHECK (total_units >= 0),
  blocked_units  INTEGER NOT NULL DEFAULT 0 CHECK (blocked_units >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (total_units >= blocked_units),
  UNIQUE (room_type_id, stay_date)
);
CREATE TRIGGER room_inventory_set_updated_at BEFORE UPDATE ON room_inventory FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A missing row means room_types.base_price applies.
CREATE TABLE room_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id   UUID NOT NULL REFERENCES room_types (id) ON DELETE CASCADE,
  stay_date      DATE NOT NULL,
  nightly_price  NUMERIC(12, 2) NOT NULL CHECK (nightly_price >= 0),
  currency       CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_type_id, stay_date)
);
CREATE TRIGGER room_rates_set_updated_at BEFORE UPDATE ON room_rates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- cancellation_policy is structured JSON so refunds can be computed (snapshotted onto bookings in Phase 5).
CREATE TABLE property_policies (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id            UUID NOT NULL UNIQUE REFERENCES properties (id) ON DELETE CASCADE,
  cancellation_policy    JSONB NOT NULL CHECK (jsonb_typeof(cancellation_policy) = 'object'),
  child_policy           TEXT CHECK (char_length(child_policy) <= 2000),
  house_rules            TEXT CHECK (char_length(house_rules) <= 5000),
  identification_policy  TEXT CHECK (char_length(identification_policy) <= 2000),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER property_policies_set_updated_at BEFORE UPDATE ON property_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
