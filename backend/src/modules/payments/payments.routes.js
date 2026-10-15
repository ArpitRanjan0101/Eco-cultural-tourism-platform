'use strict';

const { z } = require('../../core/validation/zod');
const { successEnvelope } = require('../../core/validation/common');
const controller = require('./payments.controller');
const schema = require('./payments.schema');

const TAGS = ['Payments'];
const ADMIN = ['Admin: Payments'];
const ok = (dataSchema, options) => ({ status: 200, schema: successEnvelope(dataSchema, options) });

const routes = [
  {
    method: 'post',
    path: '/bookings/:id/payment-order',
    tags: TAGS,
    summary: 'Initiate payment once eligible',
    description:
      'Creates (or reuses) the Razorpay order for a pending_payment booking and returns Checkout parameters. ' +
      'Requires Idempotency-Key. 409 BOOKING_NOT_PAYABLE / BOOKING_EXPIRED; 503 PAYMENTS_NOT_CONFIGURED.',
    auth: 'user',
    permissions: ['payments.create.own'],
    rateLimit: { name: 'payment_order', windowSeconds: 600, max: 20, by: 'user' },
    headers: schema.idempotencyHeaders,
    request: { params: schema.idParams },
    response: { status: 201, schema: successEnvelope(schema.checkoutSchema) },
    errors: [400, 404, 409, 503],
    handler: controller.createPaymentOrder,
  },
  {
    method: 'get',
    path: '/payments/orders/:id',
    tags: TAGS,
    summary: 'Read payment order',
    auth: 'user',
    permissions: ['payments.read.own'],
    request: { params: schema.idParams },
    response: ok(schema.orderSchema),
    errors: [404],
    handler: controller.getOrder,
  },
  {
    method: 'get',
    path: '/payments/booking/:bookingId',
    tags: TAGS,
    summary: 'Read booking payment history',
    auth: 'user',
    permissions: ['payments.read.own'],
    request: { params: schema.bookingIdParams },
    response: ok(schema.bookingPaymentsSchema),
    errors: [404],
    handler: controller.bookingPayments,
  },
  {
    method: 'post',
    path: '/payments/verify',
    tags: TAGS,
    summary: 'Check gateway transaction signature/status',
    description:
      'Called with the Checkout handler fields. The signature is verified, then the payment is fetched from Razorpay ' +
      '(amount, currency, order) before the booking is confirmed; a capture that can no longer confirm is refunded.',
    auth: 'user',
    permissions: ['payments.create.own'],
    rateLimit: { name: 'payment_verify', windowSeconds: 60, max: 30, by: 'user' },
    request: { body: schema.verifyBody },
    response: ok(schema.verifyResult),
    errors: [400, 404, 409, 503],
    handler: controller.verify,
  },
  {
    method: 'post',
    path: '/webhooks/payments/:provider',
    tags: ['Webhooks'],
    summary: 'Receive gateway-verified webhook',
    description:
      'Public ingress (no service token): authenticated by X-Razorpay-Signature over the raw body. Events are stored before ' +
      'processing; duplicate deliveries are acknowledged without side effects; failed processing is retried.',
    auth: 'webhook',
    rateLimit: { name: 'payment_webhook', windowSeconds: 60, max: 600 },
    headers: schema.webhookHeaders,
    request: { params: schema.webhookParams },
    response: ok(z.object({ received: z.literal(true), duplicate: z.boolean().optional(), status: z.string().optional() })),
    errors: [400, 404, 503],
    handler: controller.webhook,
  },
  {
    method: 'get',
    path: '/refunds/:id',
    tags: TAGS,
    summary: 'Read refund status',
    auth: 'user',
    permissions: ['payments.read.own'],
    request: { params: schema.idParams },
    response: ok(schema.refundSchema),
    errors: [404],
    handler: controller.getRefund,
  },
  {
    method: 'get',
    path: '/admin/payments',
    tags: ADMIN,
    summary: 'Search platform payments',
    auth: 'user',
    permissions: ['payments.read.platform'],
    request: { query: schema.paymentListQuery },
    response: ok(z.array(schema.orderSchema.extend({ capturedPayments: z.number().int() })), { paginated: true }),
    handler: controller.adminPayments,
  },
  {
    method: 'get',
    path: '/admin/refunds',
    tags: ADMIN,
    summary: 'Search refunds',
    auth: 'user',
    permissions: ['payments.read.platform'],
    request: { query: schema.refundListQuery },
    response: ok(z.array(schema.refundSchema), { paginated: true }),
    handler: controller.adminRefunds,
  },
  {
    method: 'post',
    path: '/admin/refunds/:id/retry',
    tags: ADMIN,
    summary: 'Retry eligible refund',
    description: 'Failed refunds only; resubmission first checks Razorpay for an existing refund with the same receipt. Audited.',
    auth: 'user',
    permissions: ['refunds.retry'],
    request: { params: schema.idParams },
    response: ok(schema.refundSchema),
    errors: [404, 409, 503],
    handler: controller.retryRefund,
  },
  {
    method: 'post',
    path: '/admin/bookings/:id/refund',
    tags: ['Admin: Bookings'],
    summary: 'Authorized refund action',
    description: 'Refunds a captured payment (default: remaining refundable amount). Requires Idempotency-Key; audited.',
    auth: 'user',
    permissions: ['refunds.initiate'],
    headers: schema.idempotencyHeaders,
    request: { params: schema.idParams, body: schema.adminRefundBody },
    response: { status: 201, schema: successEnvelope(schema.refundSchema) },
    errors: [400, 404, 409, 503],
    handler: controller.adminRefund,
  },
];

module.exports = routes;
