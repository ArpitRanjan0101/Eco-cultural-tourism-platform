DROP TABLE IF EXISTS notification_deliveries;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS notification_templates;

-- Generated vouchers cannot exist without the purpose; their objects become orphans for storage cleanup.
DELETE FROM booking_documents WHERE media_id IN (SELECT id FROM media_assets WHERE purpose = 'booking_document');
DELETE FROM media_assets WHERE purpose = 'booking_document';
ALTER TABLE media_assets DROP CONSTRAINT media_assets_purpose_check;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_purpose_check
  CHECK (purpose IN ('avatar', 'content_image', 'supply_image', 'verification_document'));

DROP INDEX IF EXISTS outbox_events_pending_idx;
ALTER TABLE outbox_events DROP COLUMN available_at, DROP COLUMN last_error, DROP COLUMN attempts;
CREATE INDEX outbox_events_pending_idx ON outbox_events (created_at) WHERE status = 'pending';
