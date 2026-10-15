'use strict';

const http = require('node:http');
const { createHmac, randomBytes } = require('node:crypto');

/**
 * In-process stand-in for the Razorpay REST API (orders, payments, capture, refunds),
 * so payment tests exercise the real adapter over HTTP without network access or keys.
 * Test controls simulate what Checkout and the dashboard would do.
 */
const PORT = 4555;
const KEY_SECRET = process.env.PAYMENT_KEY_SECRET;
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET;
const AUTH = `Basic ${Buffer.from(`${process.env.PAYMENT_KEY_ID}:${KEY_SECRET}`).toString('base64')}`;

const state = { orders: new Map(), payments: new Map(), refunds: new Map(), calls: [], failRefunds: 0, refundStatus: 'processed', down: false };
const id = (prefix) => `${prefix}_${randomBytes(7).toString('hex')}`;

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function handle(req, res, body) {
  const [, resource, resourceId, action] = req.url.split('?')[0].split('/');
  state.calls.push(`${req.method} /${resource}${action ? `/:id/${action}` : resourceId ? '/:id' : ''}`);
  if (req.headers.authorization !== AUTH) return send(res, 401, { error: { description: 'auth' } });

  if (resource === 'orders' && req.method === 'POST') {
    const order = { id: id('order'), amount: body.amount, currency: body.currency, receipt: body.receipt, notes: body.notes, status: 'created' };
    state.orders.set(order.id, order);
    return send(res, 200, order);
  }
  if (resource === 'orders' && action === 'payments') {
    return send(res, 200, { items: [...state.payments.values()].filter((p) => p.order_id === resourceId) });
  }
  const payment = state.payments.get(resourceId);
  if (resource === 'payments' && !payment) return send(res, 404, { error: { description: 'not found' } });
  if (resource === 'payments' && !action) return send(res, 200, payment);
  if (resource === 'payments' && action === 'capture') {
    payment.status = 'captured';
    return send(res, 200, payment);
  }
  if (resource === 'payments' && action === 'refunds') {
    return send(res, 200, { items: [...state.refunds.values()].filter((r) => r.payment_id === resourceId) });
  }
  if (resource === 'payments' && action === 'refund') {
    if (state.failRefunds > 0) {
      state.failRefunds -= 1;
      return send(res, 502, { error: { description: 'temporary failure' } });
    }
    const refunded = [...state.refunds.values()].filter((r) => r.payment_id === resourceId).reduce((t, r) => t + r.amount, 0);
    if (refunded + body.amount > payment.amount) return send(res, 400, { error: { description: 'amount exceeds payment' } });
    const refund = { id: id('rfnd'), payment_id: resourceId, amount: body.amount, receipt: body.receipt, status: state.refundStatus };
    state.refunds.set(refund.id, refund);
    return send(res, 200, refund);
  }
  return send(res, 404, { error: { description: 'unknown route' } });
}

const server = http.createServer(async (req, res) => {
  if (state.down) return res.destroy();
  return handle(req, res, await readJson(req));
});

const fake = {
  state,
  start: () => new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve)),
  stop: () => new Promise((resolve) => server.close(resolve)),
  reset() {
    Object.assign(state, { failRefunds: 0, refundStatus: 'processed', down: false });
    state.orders.clear();
    state.payments.clear();
    state.refunds.clear();
    state.calls.length = 0;
  },
  /** Simulates the customer paying in Checkout; returns what the Checkout handler receives. */
  pay(orderId, { status = 'captured', amount } = {}) {
    const order = state.orders.get(orderId);
    const payment = { id: id('pay'), order_id: orderId, amount: amount ?? order.amount, currency: order.currency, status, method: 'upi' };
    if (status === 'failed') payment.error_description = 'Payment declined';
    state.payments.set(payment.id, payment);
    return {
      providerOrderId: orderId,
      providerPaymentId: payment.id,
      signature: createHmac('sha256', KEY_SECRET).update(`${orderId}|${payment.id}`).digest('hex'),
    };
  },
  /** A signed webhook delivery: returns { body, headers } ready to POST. */
  webhook(event, entities, eventId = id('evt')) {
    const body = JSON.stringify({ entity: 'event', event, payload: entities, created_at: Math.floor(Date.now() / 1000) });
    return {
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex'),
        'X-Razorpay-Event-Id': eventId,
      },
    };
  },
};

module.exports = fake;
