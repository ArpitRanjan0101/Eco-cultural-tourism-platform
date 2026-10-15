'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { createRedisConnection } = require('../../src/config/redis');
const { withTransaction } = require('../../src/core/database/transaction');
const { startJobRuntime } = require('../../src/jobs/runtime');
const { dispatchBatch } = require('../../src/jobs/dispatcher');
const bookingsService = require('../../src/modules/bookings/bookings.service');
const mediaService = require('../../src/modules/media/media.service');
const h = require('../helpers');
const fx = require('../fixtures');
const fake = require('../fakeRazorpay');

const app = createApp();
const MAILPIT = 'http://mailpit:8025/api/v1';
let connection;
let runtime;

/** Polls until `check` returns a truthy value (jobs run asynchronously in this process). */
async function eventually(check, { timeoutMs = 15_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function mailTo(address) {
  const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  const { messages } = await res.json();
  return messages;
}

async function mailBody(id) {
  return (await fetch(`${MAILPIT}/message/${id}`)).json();
}

const dispatchAll = async () => {
  for (;;) {
    const { claimed } = await dispatchBatch(runtime.queues);
    if (claimed === 0) return;
  }
};

before(async () => {
  await h.migrateTestDatabase();
  await h.ensureTestBuckets();
  await fake.start();
  connection = createRedisConnection({ maxRetriesPerRequest: null });
  runtime = await startJobRuntime({ connection, schedule: false });
});
beforeEach(async () => {
  await h.resetData();
  await h.seedReference();
  fake.reset();
  await fetch(`${MAILPIT}/messages`, { method: 'DELETE' });
});
after(async () => {
  await runtime.close();
  await connection.quit();
  await fake.stop();
  await h.closeConnections();
});

describe('outbox dispatch and email', () => {
  it('emails the verification link once and scrubs the token from the stored event', async () => {
    await h.api(app).post('/auth/register').send({ fullName: 'Sita Hembrom', email: 'sita@example.test', password: 'password-123' }).expect(202);
    await dispatchAll();
    const [message] = await eventually(async () => {
      const found = await mailTo('sita@example.test');
      return found.length ? found : null;
    });
    assert.equal(message.Subject, 'Verify your email for Jharkhand Tourism');
    const body = await mailBody(message.ID);
    const token = /verify-email\?token=([A-Za-z0-9_-]+)/.exec(body.Text)[1];
    await h.api(app).post('/auth/verify-email').send({ token }).expect(200);
    assert.ok(body.HTML.includes('href="http://localhost:3000/verify-email?token='));

    const stored = (await pool.query("SELECT status, payload FROM outbox_events WHERE event_type = 'auth.email_verification_requested'")).rows[0];
    assert.equal(stored.status, 'processed');
    assert.equal(stored.payload.token, undefined, 'one-time token removed after dispatch');
    await eventually(async () => (await pool.query("SELECT status FROM notification_deliveries")).rows[0]?.status === 'sent');

    // A re-dispatched event (e.g. crash after enqueue) never emails twice.
    await pool.query("UPDATE outbox_events SET status = 'pending'");
    await dispatchAll();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal((await mailTo('sita@example.test')).length, 1);
  });

  it('keeps events pending with backoff when the queue is unavailable', async () => {
    await h.api(app).post('/auth/register').send({ fullName: 'X', email: 'x@example.test', password: 'password-123' }).expect(202);
    const broken = new Proxy({}, { get: () => ({ add: async () => { throw new Error('redis down'); } }) });
    const result = await dispatchBatch(broken);
    assert.deepEqual(result, { claimed: 1, dispatched: 0 });
    const event = (await pool.query('SELECT status, attempts, last_error, available_at > now() AS deferred FROM outbox_events')).rows[0];
    assert.deepEqual([event.status, event.attempts, event.last_error, event.deferred], ['pending', 1, 'redis down', true]);
    assert.equal((await dispatchBatch(runtime.queues)).claimed, 0, 'not retried before its backoff elapses');
  });
});

describe('booking lifecycle jobs', () => {
  it('confirmation generates one voucher, notifies the guest and the partner', async () => {
    const admin = await fx.actor(app, ['admin']);
    const { hotel, room } = await fx.publishedRoom(app, admin, { totalUnits: 2 });
    const tourist = await fx.actor(app);
    const booking = (await fx.book(tourist, { itemType: 'property_room', resourceId: room.id, checkIn: fx.day(10), checkOut: fx.day(11), rooms: 1, adults: 2 }).expect(201)).body.data;
    await withTransaction((client) => bookingsService.confirmAfterPayment(client, booking.id));
    await dispatchAll();

    const documents = await eventually(async () => {
      const docs = (await tourist.as.get(`/bookings/${booking.id}/documents`).expect(200)).body.data;
      return docs.length ? docs : null;
    });
    assert.equal(documents[0].documentType, 'voucher');
    const pdf = Buffer.from(await (await fetch(documents[0].media.url)).arrayBuffer());
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    await bookingsService.generateVoucher(booking.id);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM booking_documents')).rows[0].n, 1, 'voucher generation is idempotent');

    const inbox = await eventually(async () => {
      const items = (await tourist.as.get('/notifications').expect(200)).body.data;
      return items.some((n) => n.type === 'booking.confirmed') ? items : null;
    });
    assert.ok(inbox.find((n) => n.type === 'booking.created'));
    const partnerInbox = (await hotel.as.get('/notifications').expect(200)).body.data;
    assert.ok(partnerInbox.some((n) => n.type === 'booking.partner_confirmed' && n.message.includes(booking.reference)));
    const [confirmation] = await eventually(async () => {
      const found = (await mailTo(tourist.email)).filter((m) => m.Subject === `Booking confirmed: ${booking.reference}`);
      return found.length ? found : null;
    });
    assert.ok(confirmation);
  });

  it('a paid cancellation is refunded through the refund-processing queue', async () => {
    const admin = await fx.actor(app, ['admin']);
    const { room } = await fx.publishedRoom(app, admin, { totalUnits: 1 });
    const tourist = await fx.actor(app);
    const booking = (await fx.book(tourist, { itemType: 'property_room', resourceId: room.id, checkIn: fx.day(10), checkOut: fx.day(12), rooms: 1, adults: 2 }).expect(201)).body.data;
    const checkout = (await tourist.as.post(`/bookings/${booking.id}/payment-order`).set('Idempotency-Key', `k-${Date.now()}`).expect(201)).body.data;
    await tourist.as.post('/payments/verify').send(fake.pay(checkout.checkout.orderId)).expect(200);
    await tourist.as.post(`/bookings/${booking.id}/cancel`).send({}).expect(200);
    await dispatchAll();

    const detail = await eventually(async () => {
      const data = (await tourist.as.get(`/bookings/${booking.id}`).expect(200)).body.data;
      return data.paymentStatus === 'refunded' ? data : null;
    });
    assert.equal(detail.cancellation.status, 'refunded');
    assert.equal(fake.state.refunds.size, 1);
    await dispatchAll(); // refund.succeeded event -> notification
    await eventually(async () => (await tourist.as.get('/notifications').expect(200)).body.data.some((n) => n.type === 'refund.succeeded'));
  });

  it('request-to-book notifies partner members by email', async () => {
    const admin = await fx.actor(app, ['admin']);
    const { operator, departure } = await fx.publishedDeparture(app, admin, { bookingMode: 'request' });
    const tourist = await fx.actor(app);
    const booking = (await fx.book(tourist, { itemType: 'package_departure', resourceId: departure.id, travelerCount: 2 }).expect(201)).body.data;
    await dispatchAll();
    const [mail] = await eventually(async () => {
      const found = await mailTo(operator.email);
      return found.length ? found : null;
    });
    assert.equal(mail.Subject, `New booking request ${booking.reference}`);
  });
});

describe('notification inbox and templates', () => {
  it('lists, counts and marks notifications read, scoped to the owner', async () => {
    const user = await fx.actor(app);
    const other = await fx.actor(app);
    await user.as.post('/auth/change-password').send({ currentPassword: user.password, newPassword: 'another-pass-99' }).expect(204);
    await dispatchAll();
    const [item] = await eventually(async () => {
      const items = (await user.as.get('/notifications?unreadOnly=true').expect(200)).body.data;
      return items.length ? items : null;
    });
    assert.equal(item.type, 'auth.password_changed');
    assert.equal((await user.as.get('/notifications/unread-count').expect(200)).body.data.unread, 1);
    await other.as.patch(`/notifications/${item.id}/read`).expect(404);
    assert.equal((await user.as.patch(`/notifications/${item.id}/read`).expect(200)).body.data.read, true);
    assert.equal((await user.as.post('/notifications/read-all').expect(200)).body.data.updated, 0);
    assert.equal((await user.as.get('/notifications/unread-count').expect(200)).body.data.unread, 0);
  });

  it('admins edit templates (audited); inactive templates are not sent', async () => {
    const admin = await fx.actor(app, ['admin']);
    const tourist = await fx.actor(app);
    await tourist.as.get('/admin/notification-templates').expect(403);
    const templates = (await admin.as.get('/admin/notification-templates').expect(200)).body.data;
    const verification = templates.find((t) => t.code === 'auth.email_verification' && t.channel === 'email');
    await admin.as.patch(`/admin/notification-templates/${verification.id}`).send({ subject: 'Johar {{name}}! Verify your email' }).expect(200);

    await h.api(app).post('/auth/register').send({ fullName: 'Birsa', email: 'birsa@example.test', password: 'password-123' }).expect(202);
    await dispatchAll();
    const [mail] = await eventually(async () => {
      const found = await mailTo('birsa@example.test');
      return found.length ? found : null;
    });
    assert.equal(mail.Subject, 'Johar Birsa! Verify your email');

    await admin.as.patch(`/admin/notification-templates/${verification.id}`).send({ status: 'inactive' }).expect(200);
    await h.api(app).post('/auth/register').send({ fullName: 'Quiet', email: 'quiet@example.test', password: 'password-123' }).expect(202);
    await dispatchAll();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal((await mailTo('quiet@example.test')).length, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'notification_templates.updated'")).rows[0].n, 2);
  });
});

describe('media processing and housekeeping', () => {
  it('records image dimensions and strips metadata after upload', async () => {
    const admin = await fx.actor(app, ['admin']);
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#2f6f4e' } }).png().withMetadata({ exif: { IFD0: { Copyright: 'secret-gps' } } }).toBuffer();
    const { media } = await h.uploadMedia(app, admin.token, { mimeType: 'image/png', body: png });
    assert.equal(media.width, null);
    await dispatchAll();
    const processed = await eventually(async () => {
      const row = (await pool.query('SELECT width, height, file_size FROM media_assets WHERE id = $1', [media.id])).rows[0];
      return row.width ? row : null;
    });
    assert.deepEqual([processed.width, processed.height], [40, 30]);
    const stored = Buffer.from(await (await fetch(media.url)).arrayBuffer());
    assert.equal(stored.includes(Buffer.from('secret-gps')), false);
    assert.equal(Number(processed.file_size), stored.length);
  });

  it('purges abandoned uploads', async () => {
    const admin = await fx.actor(app, ['admin']);
    const init = await admin.as.post('/media/upload-init').send({ purpose: 'content_image', mimeType: 'image/png', fileSize: 64 }).expect(201);
    await pool.query("UPDATE media_assets SET created_at = now() - interval '2 days' WHERE id = $1", [init.body.data.media.id]);
    assert.equal(await mediaService.purgeStaleUploads(), 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM media_assets')).rows[0].n, 0);
  });
});
