-- Phase 9: indexes for reporting ranges (no new tables). Audit-log search uses the
-- actor/entity/action/created_at indexes created in 0003.

CREATE INDEX bookings_created_idx ON bookings (created_at);
CREATE INDEX bookings_upcoming_idx ON bookings (service_start_at) WHERE booking_status = 'confirmed';
CREATE INDEX payment_transactions_captured_idx ON payment_transactions (paid_at) WHERE status = 'captured';
CREATE INDEX refunds_succeeded_idx ON refunds (processed_at) WHERE status = 'succeeded';
