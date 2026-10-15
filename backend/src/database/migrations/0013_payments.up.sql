-- Report 4.9: payments and refunds (4 tables). No card data is ever stored (Report §4.9).

CREATE TABLE payment_orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         UUID NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,
  provider           TEXT NOT NULL CHECK (provider IN ('razorpay')),
  provider_order_id  TEXT NOT NULL,
  amount             NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency           CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status             TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'paid', 'failed', 'expired')),
  expires_at         TIMESTAMPTZ NOT NULL,
  -- Addition: last provider reconciliation check (payment-reconciliation job).
  reconciled_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_order_id)
);
CREATE INDEX payment_orders_booking_idx ON payment_orders (booking_id, created_at DESC);
CREATE INDEX payment_orders_open_idx ON payment_orders (created_at) WHERE status IN ('created', 'pending');
CREATE TRIGGER payment_orders_set_updated_at BEFORE UPDATE ON payment_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE payment_transactions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_order_id     UUID NOT NULL REFERENCES payment_orders (id) ON DELETE RESTRICT,
  -- provider/method are additions: provider scopes the unique payment id (Report §4.14).
  provider             TEXT NOT NULL CHECK (provider IN ('razorpay')),
  provider_payment_id  TEXT NOT NULL,
  amount               NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  status               TEXT NOT NULL CHECK (status IN ('authorized', 'captured', 'failed')),
  method               TEXT CHECK (char_length(method) <= 30),
  paid_at              TIMESTAMPTZ,
  failure_reason       TEXT CHECK (char_length(failure_reason) <= 500),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_payment_id),
  CHECK (status <> 'captured' OR paid_at IS NOT NULL)
);
CREATE INDEX payment_transactions_order_idx ON payment_transactions (payment_order_id);
CREATE TRIGGER payment_transactions_set_updated_at BEFORE UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Signed provider events are persisted before processing; the event id makes delivery idempotent.
CREATE TABLE payment_webhook_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider           TEXT NOT NULL CHECK (provider IN ('razorpay')),
  provider_event_id  TEXT NOT NULL,
  event_type         TEXT NOT NULL CHECK (char_length(event_type) <= 100),
  -- Redacted: identifiers, amounts and statuses only (no contact, card or VPA details).
  payload            JSONB NOT NULL,
  processing_status  TEXT NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received', 'processed', 'ignored', 'failed')),
  attempts           INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error         TEXT CHECK (char_length(last_error) <= 1000),
  received_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at       TIMESTAMPTZ,
  UNIQUE (provider, provider_event_id)
);
CREATE INDEX payment_webhook_events_retry_idx ON payment_webhook_events (received_at) WHERE processing_status IN ('received', 'failed');

CREATE TABLE refunds (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id              UUID NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,
  payment_transaction_id  UUID NOT NULL REFERENCES payment_transactions (id) ON DELETE RESTRICT,
  provider_refund_id      TEXT UNIQUE,
  amount                  NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  -- Additions: why the refund exists (one automatic refund per booking and kind), retry bookkeeping.
  kind                    TEXT NOT NULL CHECK (kind IN ('cancellation', 'late_payment', 'duplicate_payment', 'manual')),
  reason                  TEXT CHECK (char_length(reason) <= 1000),
  status                  TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'succeeded', 'failed')),
  attempts                INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error              TEXT CHECK (char_length(last_error) <= 1000),
  requested_by            UUID REFERENCES users (id) ON DELETE RESTRICT,
  requested_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at            TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'succeeded' OR processed_at IS NOT NULL)
);
CREATE UNIQUE INDEX refunds_one_automatic_per_kind ON refunds (booking_id, kind) WHERE kind IN ('cancellation', 'late_payment');
CREATE UNIQUE INDEX refunds_one_duplicate_per_payment ON refunds (payment_transaction_id) WHERE kind = 'duplicate_payment';
CREATE INDEX refunds_booking_idx ON refunds (booking_id);
CREATE INDEX refunds_pending_idx ON refunds (updated_at) WHERE status IN ('requested', 'processing', 'failed');
CREATE TRIGGER refunds_set_updated_at BEFORE UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION set_updated_at();
