-- Report 4.8: bookings and inventory holds (7 tables), plus platform_settings and
-- idempotency_records from 4.13 which the booking engine depends on.

CREATE TABLE platform_settings (
  key         TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'),
  value_json  JSONB NOT NULL,
  updated_by  UUID REFERENCES users (id) ON DELETE RESTRICT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Booking timings (DECISIONS O4), tax (O2: 0 until finance sign-off) and the default cancellation policy.
INSERT INTO platform_settings (key, value_json) VALUES
  ('booking.hold_minutes', '15'),
  ('booking.request_approval_hours', '24'),
  ('booking.payment_window_hours', '24'),
  ('booking.max_advance_days', '365'),
  ('booking.tax_rate_percent', '0'),
  ('booking.default_cancellation_policy',
   '{"tiers":[{"hoursBeforeCheckIn":72,"refundPercent":100},{"hoursBeforeCheckIn":24,"refundPercent":50},{"hoursBeforeCheckIn":0,"refundPercent":0}]}');

CREATE TABLE idempotency_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The scope embeds the operation and the user, e.g. 'bookings.create:<userId>' (DECISIONS C5).
  scope            TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_:.-]{8,128}$'),
  request_hash     TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response_status  SMALLINT,
  response_body    JSONB,
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, idempotency_key)
);
CREATE INDEX idempotency_records_expires_idx ON idempotency_records (expires_at);

CREATE TABLE bookings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference  TEXT NOT NULL UNIQUE CHECK (booking_reference ~ '^JHT-[0-9]{6}-[A-Z0-9]{6}$'),
  user_id            UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  -- Additions to the report's field list: owning partner (partner queries), booking mode,
  -- service window (cancellation/completion) and expires_at (DECISIONS C4).
  partner_id         UUID NOT NULL REFERENCES partners (id) ON DELETE RESTRICT,
  booking_type       TEXT NOT NULL CHECK (booking_type IN ('property_room', 'guide_service', 'experience_session', 'package_departure')),
  booking_mode       TEXT NOT NULL CHECK (booking_mode IN ('instant', 'request')),
  booking_status     TEXT NOT NULL CHECK (booking_status IN ('requested', 'pending_payment', 'confirmed', 'completed', 'rejected', 'expired', 'cancelled')),
  payment_status     TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'partially_refunded', 'refunded')),
  currency           CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal           NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  tax_amount         NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  discount_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount       NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  service_start_at   TIMESTAMPTZ NOT NULL,
  service_end_at     TIMESTAMPTZ NOT NULL,
  expires_at         TIMESTAMPTZ,
  confirmed_at       TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (total_amount = subtotal + tax_amount - discount_amount),
  CHECK (service_end_at > service_start_at),
  CHECK (booking_status NOT IN ('requested', 'pending_payment') OR expires_at IS NOT NULL)
);
CREATE INDEX bookings_user_idx ON bookings (user_id, created_at DESC);
CREATE INDEX bookings_partner_idx ON bookings (partner_id, created_at DESC);
CREATE INDEX bookings_status_idx ON bookings (booking_status, created_at DESC);
CREATE INDEX bookings_expiry_scan_idx ON bookings (expires_at) WHERE booking_status IN ('requested', 'pending_payment');
CREATE INDEX bookings_completion_scan_idx ON bookings (service_end_at) WHERE booking_status = 'confirmed';
CREATE TRIGGER bookings_set_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- item_reference_id is polymorphic (no FK, Report §4.8): the booking service validates type and
-- ownership and snapshots the purchased terms into description_snapshot/booking_details.
CREATE TABLE booking_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            UUID NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,
  item_type             TEXT NOT NULL CHECK (item_type IN ('property_room', 'guide_service', 'experience_session', 'package_departure')),
  item_reference_id     UUID NOT NULL,
  description_snapshot  TEXT NOT NULL CHECK (char_length(description_snapshot) <= 500),
  quantity              INTEGER NOT NULL CHECK (quantity >= 1),
  unit_price            NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  tax_amount            NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount          NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  booking_details       JSONB NOT NULL CHECK (jsonb_typeof(booking_details) = 'object'),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX booking_items_booking_idx ON booking_items (booking_id);
CREATE INDEX booking_items_reference_idx ON booking_items (item_type, item_reference_id);

CREATE TABLE booking_travelers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,
  full_name     TEXT NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 150),
  age           INTEGER CHECK (age BETWEEN 0 AND 120),
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX booking_travelers_booking_idx ON booking_travelers (booking_id);
CREATE UNIQUE INDEX booking_travelers_one_primary ON booking_travelers (booking_id) WHERE is_primary;

-- Capacity ledger for every supply type. Active allocation = confirmed, or held and not expired.
-- resource_type/resource_id: room_type (per-night units), guide (time range), experience_session, package_departure (seats).
CREATE TABLE inventory_holds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_item_id  UUID NOT NULL REFERENCES booking_items (id) ON DELETE RESTRICT,
  resource_type    TEXT NOT NULL CHECK (resource_type IN ('room_type', 'guide', 'experience_session', 'package_departure')),
  resource_id      UUID NOT NULL,
  start_at         TIMESTAMPTZ NOT NULL,
  end_at           TIMESTAMPTZ NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity >= 1),
  expires_at       TIMESTAMPTZ,
  status           TEXT NOT NULL CHECK (status IN ('held', 'confirmed', 'released', 'expired')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at),
  CHECK (status <> 'held' OR expires_at IS NOT NULL),
  -- A guide can never be held/booked twice for overlapping time (Report §4.14, §8.2).
  EXCLUDE USING GIST (resource_id WITH =, tstzrange(start_at, end_at) WITH &&)
    WHERE (resource_type = 'guide' AND status IN ('held', 'confirmed'))
);
CREATE INDEX inventory_holds_resource_idx ON inventory_holds (resource_type, resource_id, start_at) WHERE status IN ('held', 'confirmed');
CREATE INDEX inventory_holds_item_idx ON inventory_holds (booking_item_id);
CREATE TRIGGER inventory_holds_set_updated_at BEFORE UPDATE ON inventory_holds FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE booking_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,
  old_status  TEXT,
  new_status  TEXT NOT NULL,
  changed_by  UUID REFERENCES users (id) ON DELETE RESTRICT,
  reason      TEXT CHECK (char_length(reason) <= 1000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX booking_status_history_booking_idx ON booking_status_history (booking_id, created_at);

CREATE TABLE booking_cancellations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID NOT NULL UNIQUE REFERENCES bookings (id) ON DELETE RESTRICT,
  reason            TEXT CHECK (char_length(reason) <= 1000),
  cancellation_fee  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cancellation_fee >= 0),
  refund_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  requested_by      UUID REFERENCES users (id) ON DELETE RESTRICT,
  status            TEXT NOT NULL CHECK (status IN ('completed', 'refund_pending', 'refunded', 'refund_failed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE booking_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,
  media_id       UUID NOT NULL REFERENCES media_assets (id) ON DELETE RESTRICT,
  document_type  TEXT NOT NULL CHECK (document_type IN ('voucher', 'invoice', 'receipt', 'other')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX booking_documents_booking_idx ON booking_documents (booking_id);
