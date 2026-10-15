'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');
const config = require('../../../config');
const ApiError = require('../../../core/errors/ApiError');
const logger = require('../../../core/logging/logger');

/**
 * Razorpay adapter (Orders + Payments + Refunds REST APIs, Basic auth with key id/secret).
 * Everything else in the payments module is provider-neutral and talks to this interface.
 * Amounts cross this boundary in minor units (paise).
 */
const NAME = 'razorpay';
const { payments } = config;

function assertConfigured({ webhook = false } = {}) {
  if (!payments.keyId || !payments.keySecret || (webhook && !payments.webhookSecret)) {
    throw ApiError.unavailable('Online payments are not configured', 'PAYMENTS_NOT_CONFIGURED');
  }
}

async function request(method, path, body) {
  assertConfigured();
  let response;
  try {
    response = await fetch(`${payments.apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${payments.keyId}:${payments.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(payments.timeoutMs),
    });
  } catch (err) {
    logger.error({ err: { message: err.message }, path }, 'Payment provider unreachable');
    throw new ApiError(502, 'PAYMENT_PROVIDER_UNAVAILABLE', 'The payment provider could not be reached');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Provider error descriptions are logged, never forwarded verbatim to clients.
    logger.warn({ status: response.status, path, error: payload?.error?.description }, 'Payment provider rejected request');
    throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'The payment provider rejected the request');
  }
  return payload;
}

const toPayment = (p) => ({
  id: p.id,
  orderId: p.order_id,
  amountMinor: p.amount,
  currency: p.currency,
  status: p.status,
  method: p.method ?? null,
  errorDescription: p.error_description ?? null,
});

const toRefund = (r) => ({ id: r.id, paymentId: r.payment_id, amountMinor: r.amount, status: r.status, receipt: r.receipt ?? null });

async function createOrder({ amountMinor, currency, receipt, notes }) {
  const order = await request('POST', '/orders', { amount: amountMinor, currency, receipt, notes });
  return { providerOrderId: order.id, status: order.status };
}

async function fetchPayment(paymentId) {
  return toPayment(await request('GET', `/payments/${encodeURIComponent(paymentId)}`));
}

async function capturePayment(paymentId, amountMinor, currency) {
  return toPayment(await request('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountMinor, currency }));
}

async function listOrderPayments(providerOrderId) {
  const result = await request('GET', `/orders/${encodeURIComponent(providerOrderId)}/payments`);
  return (result.items ?? []).map(toPayment);
}

/** `receipt` (our refund id) lets a retry find a refund whose creation response was lost. */
async function createRefund(paymentId, { amountMinor, receipt, notes }) {
  return toRefund(await request('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountMinor, receipt, notes }));
}

async function listPaymentRefunds(paymentId) {
  const result = await request('GET', `/payments/${encodeURIComponent(paymentId)}/refunds`);
  return (result.items ?? []).map(toRefund);
}

function safeEqualHex(expectedHex, providedHex) {
  const expected = Buffer.from(expectedHex, 'hex');
  const provided = Buffer.from(String(providedHex ?? ''), 'hex');
  return provided.length === expected.length && timingSafeEqual(expected, provided);
}

/** Checkout callback signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret). */
function verifyCheckoutSignature(providerOrderId, providerPaymentId, signature) {
  assertConfigured();
  const expected = createHmac('sha256', payments.keySecret).update(`${providerOrderId}|${providerPaymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256(raw request body, webhook secret) in X-Razorpay-Signature. */
function verifyWebhookSignature(rawBody, signature) {
  assertConfigured({ webhook: true });
  if (!rawBody || !signature) return false;
  const expected = createHmac('sha256', payments.webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Normalises a webhook body to the fields the payments service acts on (also the redacted stored payload). */
function parseWebhook(body) {
  const payment = body?.payload?.payment?.entity;
  const refund = body?.payload?.refund?.entity;
  const order = body?.payload?.order?.entity;
  return {
    eventType: String(body?.event ?? 'unknown'),
    payment: payment ? { id: payment.id, orderId: payment.order_id, amountMinor: payment.amount, currency: payment.currency, status: payment.status } : null,
    refund: refund ? { id: refund.id, paymentId: refund.payment_id, amountMinor: refund.amount, status: refund.status, receipt: refund.receipt ?? null } : null,
    order: order ? { id: order.id, status: order.status } : null,
  };
}

const checkoutKeyId = () => payments.keyId;

module.exports = {
  NAME,
  assertConfigured,
  createOrder,
  fetchPayment,
  capturePayment,
  listOrderPayments,
  createRefund,
  listPaymentRefunds,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  parseWebhook,
  checkoutKeyId,
};
