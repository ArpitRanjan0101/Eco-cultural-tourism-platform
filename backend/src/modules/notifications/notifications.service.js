'use strict';

const config = require('../../config');
const { pool } = require('../../config/database');
const { sendMail } = require('../../config/mailer');
const { withTransaction } = require('../../core/database/transaction');
const { diff } = require('../../core/database/sql');
const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const { render, textToHtml } = require('../../core/utils/template');
const auditService = require('../audit/audit.service');
const usersService = require('../users/users.service');
const bookingsService = require('../bookings/bookings.service');
const partnersService = require('../partners/partners.service');
const repository = require('./notifications.repository');

const iso = (value) => (value ? value.toISOString() : null);
const link = (path) => `${config.webAppUrl}${path}`;
const formatDateTime = (value) =>
  value
    ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '';

// A message: deliver template `code` on `channel` to a user (in-app/email) or a bare email address.
const inApp = (userId, code, vars, related) => ({ channel: 'in_app', code, userId, vars, related });
const email = (to, code, vars, related) => ({ channel: 'email', code, to, vars, related });

async function account(userId) {
  return usersService.getAccountSummary(userId);
}

async function bookingContext(bookingId) {
  const booking = await bookingsService.getForPayment(pool, bookingId);
  return {
    booking,
    vars: {
      reference: booking.booking_reference,
      item: booking.description_snapshot,
      amount: booking.total_amount,
      startsAt: formatDateTime(booking.service_start_at),
      expiresAt: formatDateTime(booking.expires_at),
      link: link(`/bookings/${booking.id}`),
    },
    related: { type: 'booking', id: booking.id },
  };
}

/** Messages for user + their email, both channels. */
async function toUser(userId, code, vars, related, { emailToo = true } = {}) {
  const user = await account(userId);
  const messages = [inApp(user.id, code, { name: user.fullName, ...vars }, related)];
  if (emailToo) messages.push(email(user.email, code, { name: user.fullName, ...vars }, related));
  return messages;
}

async function toPartner(partnerId, code, vars, related, { emailToo = false } = {}) {
  const { members, businessName } = await partnersService.memberContacts(partnerId);
  return members.flatMap((member) => {
    const memberVars = { name: member.fullName, businessName, ...vars };
    const messages = [inApp(member.userId, code, memberVars, related)];
    if (emailToo) messages.push(email(member.email, code, memberVars, related));
    return messages;
  });
}

/** Maps an outbox event to the messages it produces (templates decide which channels exist). */
async function messagesFor(event) {
  const p = event.payload;
  const userRelated = { type: 'user', id: p.userId };
  switch (event.event_type) {
    case 'auth.email_verification_requested':
      return [email(p.email, 'auth.email_verification', { name: p.fullName, link: link(`/verify-email?token=${encodeURIComponent(p.token)}`), expiresAt: formatDateTime(p.expiresAt) }, userRelated)];
    case 'auth.password_reset_requested':
      return [email(p.email, 'auth.password_reset', { name: p.fullName, link: link(`/reset-password?token=${encodeURIComponent(p.token)}`), expiresAt: formatDateTime(p.expiresAt) }, userRelated)];
    case 'auth.registration_attempted_for_existing_account':
      return [email(p.email, 'auth.existing_account', { name: p.fullName, link: link('/login') }, userRelated)];
    case 'auth.password_changed':
      return toUser(p.userId, 'auth.password_changed', { link: link('/forgot-password') }, userRelated);
    case 'refund.succeeded': {
      const { booking, vars, related } = await bookingContext(p.bookingId);
      return toUser(booking.user_id, 'refund.succeeded', { ...vars, amount: p.amount }, related);
    }
    case 'partner.status_changed':
      return toPartner(p.partnerId, 'partner.status_changed', { status: p.status, notes: p.notes ?? '', link: link('/partner') }, { type: 'partner', id: p.partnerId }, { emailToo: true });
    default:
      break;
  }

  if (!event.event_type.startsWith('booking.')) return [];
  const { booking, vars, related } = await bookingContext(p.bookingId);
  const partnerLink = link(`/partner/bookings/${booking.id}`);
  switch (event.event_type) {
    case 'booking.created':
      return toUser(booking.user_id, 'booking.created', vars, related, { emailToo: false });
    case 'booking.requested':
      return [
        ...(await toUser(booking.user_id, 'booking.requested', vars, related, { emailToo: false })),
        ...(await toPartner(booking.partner_id, 'booking.request_received', { ...vars, expiresAt: formatDateTime(p.expiresAt), link: partnerLink }, related, { emailToo: true })),
      ];
    case 'booking.approved':
      return toUser(booking.user_id, 'booking.approved', { ...vars, expiresAt: formatDateTime(p.expiresAt) }, related);
    case 'booking.rejected':
      return toUser(booking.user_id, 'booking.rejected', { ...vars, reason: p.reason ? `Reason: ${p.reason}` : '', link: link('/') }, related);
    case 'booking.confirmed':
      return [
        ...(await toUser(booking.user_id, 'booking.confirmed', vars, related)),
        ...(await toPartner(booking.partner_id, 'booking.partner_confirmed', { ...vars, link: partnerLink }, related)),
      ];
    case 'booking.cancelled':
      return [
        ...(await toUser(booking.user_id, 'booking.cancelled', { ...vars, refundAmount: p.refundAmount, cancellationFee: p.cancellationFee }, related)),
        ...(await toPartner(booking.partner_id, 'booking.partner_cancelled', { ...vars, link: partnerLink }, related)),
      ];
    case 'booking.expired':
      return toUser(booking.user_id, 'booking.expired', vars, related, { emailToo: false });
    case 'booking.completed':
      return toUser(booking.user_id, 'booking.completed', vars, related, { emailToo: false });
    default:
      return [];
  }
}

/**
 * Fans an outbox event out into in-app notifications and email deliveries (idempotent
 * per event, template, channel and recipient). Returns the rendered emails to send;
 * bodies are not stored because they can contain one-time links.
 */
async function handleEvent(event) {
  const messages = await messagesFor(event);
  if (messages.length === 0) return [];
  const templates = await repository.activeTemplates(pool, [...new Set(messages.map((m) => m.code))]);
  const templateFor = (code, channel) => templates.find((t) => t.code === code && t.channel === channel);

  return withTransaction(async (client) => {
    const emails = [];
    for (const message of messages) {
      const template = templateFor(message.code, message.channel);
      if (!template) continue; // channel not offered for this event, or disabled by an admin
      const subject = render(template.subject, message.vars);
      const body = render(template.body, message.vars);
      if (message.channel === 'in_app') {
        await repository.insertNotification(client, {
          userId: message.userId,
          type: message.code,
          title: subject,
          message: body.slice(0, 2000),
          relatedType: message.related?.type,
          relatedId: message.related?.id,
          dedupeKey: `${event.id}:${message.code}:in_app:${message.userId}`,
        });
      } else {
        const delivery = await repository.insertDelivery(client, {
          recipient: message.to,
          templateCode: message.code,
          dedupeKey: `${event.id}:${message.code}:email:${message.to}`,
        });
        if (delivery.status === 'pending') emails.push({ deliveryId: delivery.id, to: message.to, subject, text: body, html: textToHtml(body) });
      }
    }
    return emails;
  });
}

/** Sends one rendered email; throws on failure so the queue retries with backoff. */
async function sendEmail({ deliveryId, to, subject, text, html }) {
  const delivery = await repository.findDelivery(pool, deliveryId);
  if (!delivery || delivery.status === 'sent') return { skipped: true };
  try {
    const providerMessageId = await sendMail({ to, subject, text, html });
    await repository.recordDeliveryAttempt(pool, deliveryId, { status: 'sent', providerMessageId });
    return { sent: true };
  } catch (err) {
    await repository.recordDeliveryAttempt(pool, deliveryId, { status: 'pending', error: String(err.message).slice(0, 1000) });
    throw err;
  }
}

/** Called when the queue has exhausted retries. */
async function markDeliveryFailed(deliveryId, error) {
  await pool.query("UPDATE notification_deliveries SET status = 'failed', last_error = $2 WHERE id = $1 AND status <> 'sent'", [
    deliveryId,
    String(error).slice(0, 1000),
  ]);
}

// ---- In-app inbox ----

const toNotification = (row) => ({
  id: row.id,
  type: row.type,
  title: row.title,
  message: row.message,
  relatedType: row.related_type,
  relatedId: row.related_id,
  read: Boolean(row.read_at),
  readAt: iso(row.read_at),
  createdAt: iso(row.created_at),
});

async function listOwn(ctx, { unreadOnly, page, limit }) {
  const { rows, total } = await repository.listForUser(pool, ctx.actorUserId, { unreadOnly, page, limit });
  return { items: rows.map(toNotification), meta: pageMeta({ page, limit }, total) };
}

async function unreadCount(ctx) {
  return { unread: await repository.unreadCount(pool, ctx.actorUserId) };
}

async function markRead(ctx, id) {
  const row = await repository.markRead(pool, ctx.actorUserId, id);
  if (!row) throw ApiError.notFound('Notification not found', 'NOTIFICATION_NOT_FOUND');
  return toNotification(row);
}

async function markAllRead(ctx) {
  return { updated: await repository.markAllRead(pool, ctx.actorUserId) };
}

// ---- Templates (admin) ----

const toTemplate = (row) => ({
  id: row.id,
  code: row.code,
  channel: row.channel,
  subject: row.subject,
  body: row.body,
  status: row.status,
  updatedAt: iso(row.updated_at),
});

async function listTemplates() {
  return (await repository.listTemplates(pool)).map(toTemplate);
}

async function updateTemplate(ctx, id, changes) {
  await auditService.auditedTransaction(ctx, 'notification_template', async (client) => {
    const before = await repository.findTemplate(client, id, { forUpdate: true });
    if (!before) throw ApiError.notFound('Template not found', 'TEMPLATE_NOT_FOUND');
    await repository.updateTemplate(client, id, { ...changes, updatedBy: ctx.actorUserId });
    return { entityId: id, action: 'notification_templates.updated', ...diff(toTemplate(before), changes) };
  });
  return toTemplate(await repository.findTemplate(pool, id));
}

module.exports = {
  handleEvent,
  sendEmail,
  markDeliveryFailed,
  listOwn,
  unreadCount,
  markRead,
  markAllRead,
  listTemplates,
  updateTemplate,
};
