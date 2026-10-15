-- Report 4.7 (trips, 3 tables) and 4.11 (reviews, favorites).

CREATE TABLE trips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 150),
  start_date      DATE,
  end_date        DATE,
  traveler_count  INTEGER NOT NULL DEFAULT 1 CHECK (traveler_count BETWEEN 1 AND 50),
  -- draft: being planned; planned: finalised by the traveller; archived: kept for reference.
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'planned', 'archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((start_date IS NULL) = (end_date IS NULL)),
  CHECK (end_date IS NULL OR (end_date >= start_date AND end_date - start_date < 60))
);
CREATE INDEX trips_user_idx ON trips (user_id, created_at DESC);
CREATE TRIGGER trips_set_updated_at BEFORE UPDATE ON trips FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE trip_days (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  -- Derived from trips.start_date + day_number - 1 when the trip has dates.
  trip_date   DATE,
  day_number  INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 60),
  title       TEXT CHECK (char_length(title) <= 150),
  UNIQUE (trip_id, day_number)
);

CREATE TABLE trip_stops (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_day_id     UUID NOT NULL REFERENCES trip_days (id) ON DELETE CASCADE,
  destination_id  UUID REFERENCES destinations (id) ON DELETE RESTRICT,
  title           TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 150),
  notes           TEXT CHECK (char_length(notes) <= 2000),
  start_time      TIME,
  end_time        TIME,
  sort_order      INTEGER NOT NULL CHECK (sort_order >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time),
  -- Deferred so a reorder can permute positions within one transaction.
  CONSTRAINT trip_stops_day_order_key UNIQUE (trip_day_id, sort_order) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX trip_stops_destination_idx ON trip_stops (destination_id);
CREATE TRIGGER trip_stops_set_updated_at BEFORE UPDATE ON trip_stops FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- subject_id is polymorphic (destination, property, guide, experience, package); the service
-- validates that the subject exists and is publicly visible.
CREATE TABLE favorites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  subject_type  TEXT NOT NULL CHECK (subject_type IN ('destination', 'property', 'guide', 'experience', 'package')),
  subject_id    UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject_type, subject_id)
);
CREATE INDEX favorites_user_idx ON favorites (user_id, created_at DESC);

CREATE TABLE reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Set for verified reviews of bookable supply (a completed booking of this subject).
  booking_id     UUID REFERENCES bookings (id) ON DELETE RESTRICT,
  subject_type   TEXT NOT NULL CHECK (subject_type IN ('destination', 'property', 'guide', 'experience', 'package')),
  subject_id     UUID NOT NULL,
  rating         SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title          TEXT CHECK (char_length(title) <= 150),
  comment        TEXT CHECK (char_length(comment) <= 5000),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden', 'rejected')),
  -- Additions: moderation trail and edit time.
  moderated_by   UUID REFERENCES users (id) ON DELETE SET NULL,
  moderation_note TEXT CHECK (char_length(moderation_note) <= 1000),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (booking_id IS NOT NULL OR subject_type = 'destination')
);
-- One verified review per booking (Report §4.14); one unverified destination review per user.
CREATE UNIQUE INDEX reviews_one_per_booking ON reviews (booking_id) WHERE booking_id IS NOT NULL;
CREATE UNIQUE INDEX reviews_one_unverified_per_subject ON reviews (user_id, subject_type, subject_id) WHERE booking_id IS NULL;
CREATE INDEX reviews_subject_idx ON reviews (subject_type, subject_id, status, created_at DESC);
CREATE INDEX reviews_moderation_idx ON reviews (status, created_at);
CREATE TRIGGER reviews_set_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
