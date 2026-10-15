-- Report 4.13 (rest): notification_templates, notifications, notification_deliveries;
-- outbox retry bookkeeping; generated booking documents (vouchers) as private media.

ALTER TABLE outbox_events
  ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN last_error TEXT CHECK (char_length(last_error) <= 1000),
  ADD COLUMN available_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP INDEX outbox_events_pending_idx;
CREATE INDEX outbox_events_pending_idx ON outbox_events (available_at, created_at) WHERE status = 'pending';

ALTER TABLE media_assets DROP CONSTRAINT media_assets_purpose_check;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_purpose_check
  CHECK (purpose IN ('avatar', 'content_image', 'supply_image', 'verification_document', 'booking_document'));

CREATE TABLE notification_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL CHECK (code ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'),
  channel     TEXT NOT NULL CHECK (channel IN ('email', 'in_app')),
  subject     TEXT NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 1 AND 200),
  body        TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  updated_by  UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, channel)
);
CREATE TRIGGER notification_templates_set_updated_at BEFORE UPDATE ON notification_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (char_length(type) <= 100),
  title         TEXT NOT NULL CHECK (char_length(title) <= 200),
  message       TEXT NOT NULL CHECK (char_length(message) <= 2000),
  related_type  TEXT CHECK (char_length(related_type) <= 50),
  related_id    UUID,
  -- Addition: makes event fan-out idempotent (re-dispatched events never duplicate a notification).
  dedupe_key    TEXT NOT NULL UNIQUE,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE notification_deliveries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id      UUID REFERENCES notifications (id) ON DELETE SET NULL,
  recipient            TEXT NOT NULL CHECK (char_length(recipient) <= 254),
  channel              TEXT NOT NULL CHECK (channel IN ('email')),
  -- Additions: which template produced it, idempotency key, timestamps. Bodies are not stored
  -- (they may contain one-time links); the rendered message travels only in the queue job.
  template_code        TEXT NOT NULL,
  dedupe_key           TEXT NOT NULL UNIQUE,
  provider_message_id  TEXT,
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts             INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error           TEXT CHECK (char_length(last_error) <= 1000),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at              TIMESTAMPTZ
);
CREATE INDEX notification_deliveries_status_idx ON notification_deliveries (status, created_at);

-- Default templates. {{placeholders}} are filled at send time; values are HTML-escaped in email.
INSERT INTO notification_templates (code, channel, subject, body) VALUES
  ('auth.email_verification', 'email', 'Verify your email for Jharkhand Tourism',
   E'Hello {{name}},\n\nPlease confirm your email address by opening this link:\n{{link}}\n\nThe link expires at {{expiresAt}}.'),
  ('auth.password_reset', 'email', 'Reset your Jharkhand Tourism password',
   E'Hello {{name}},\n\nWe received a request to reset your password. Open this link to choose a new one:\n{{link}}\n\nThe link expires at {{expiresAt}}. If you did not ask for this, you can ignore this email.'),
  ('auth.existing_account', 'email', 'You already have a Jharkhand Tourism account',
   E'Hello {{name}},\n\nSomeone tried to register with this email address, but you already have an account. You can sign in or reset your password here:\n{{link}}'),
  ('auth.password_changed', 'email', 'Your password was changed',
   E'Hello {{name}},\n\nYour Jharkhand Tourism password was just changed. If this was not you, reset your password immediately:\n{{link}}'),
  ('auth.password_changed', 'in_app', 'Password changed', 'Your password was changed and other sessions were signed out.'),
  ('booking.created', 'in_app', 'Complete your payment', 'Booking {{reference}} for {{item}} is held until {{expiresAt}}. Complete the payment of INR {{amount}} to confirm it.'),
  ('booking.requested', 'in_app', 'Request sent', 'Your request {{reference}} for {{item}} was sent to the partner. You will be notified when they respond.'),
  ('booking.request_received', 'in_app', 'New booking request', 'Request {{reference}} for {{item}} is waiting for your approval until {{expiresAt}}.'),
  ('booking.request_received', 'email', 'New booking request {{reference}}',
   E'A guest requested {{item}} (booking {{reference}}).\nPlease approve or reject it before {{expiresAt}}:\n{{link}}'),
  ('booking.approved', 'in_app', 'Request approved', 'Your request {{reference}} was approved. Pay INR {{amount}} before {{expiresAt}} to confirm it.'),
  ('booking.approved', 'email', 'Your booking request {{reference}} was approved',
   E'Good news! Your request for {{item}} was approved.\nPay INR {{amount}} before {{expiresAt}} to confirm it:\n{{link}}'),
  ('booking.rejected', 'in_app', 'Request declined', 'Your request {{reference}} for {{item}} was declined. {{reason}}'),
  ('booking.rejected', 'email', 'Your booking request {{reference}} was declined',
   E'Unfortunately your request for {{item}} was declined.\n{{reason}}\nYou can explore other options here:\n{{link}}'),
  ('booking.confirmed', 'in_app', 'Booking confirmed', 'Booking {{reference}} for {{item}} is confirmed. Your voucher will be available shortly.'),
  ('booking.confirmed', 'email', 'Booking confirmed: {{reference}}',
   E'Your booking {{reference}} is confirmed.\n\n{{item}}\nStarts: {{startsAt}}\nAmount paid: INR {{amount}}\n\nView your booking and voucher:\n{{link}}'),
  ('booking.partner_confirmed', 'in_app', 'New confirmed booking', 'Booking {{reference}} for {{item}} starting {{startsAt}} is confirmed and paid.'),
  ('booking.cancelled', 'in_app', 'Booking cancelled', 'Booking {{reference}} was cancelled. Refund: INR {{refundAmount}}.'),
  ('booking.cancelled', 'email', 'Booking {{reference}} cancelled',
   E'Your booking {{reference}} for {{item}} was cancelled.\nRefund due: INR {{refundAmount}} (cancellation fee INR {{cancellationFee}}).\n{{link}}'),
  ('booking.partner_cancelled', 'in_app', 'Booking cancelled', 'Booking {{reference}} for {{item}} was cancelled; the capacity is available again.'),
  ('booking.expired', 'in_app', 'Booking expired', 'Booking {{reference}} for {{item}} expired before it was completed.'),
  ('booking.completed', 'in_app', 'How was your trip?', 'We hope you enjoyed {{item}}. Share a review to help other travellers.'),
  ('refund.succeeded', 'in_app', 'Refund processed', 'A refund of INR {{amount}} for booking {{reference}} has been processed.'),
  ('refund.succeeded', 'email', 'Refund processed for {{reference}}',
   E'A refund of INR {{amount}} for booking {{reference}} has been sent to your original payment method. Banks may take 5-7 working days to show it.'),
  ('partner.status_changed', 'in_app', 'Partner account {{status}}', 'Your organisation {{businessName}} is now {{status}}. {{notes}}'),
  ('partner.status_changed', 'email', 'Your partner account is {{status}}',
   E'Your organisation {{businessName}} is now {{status}}.\n{{notes}}\nManage your account:\n{{link}}');
