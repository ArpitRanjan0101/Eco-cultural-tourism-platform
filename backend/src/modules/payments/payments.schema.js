'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery } = require('../../core/utils/pagination');

const orderStatus = z.enum(['created', 'pending', 'paid', 'failed', 'expired']);
const refundStatus = z.enum(['requested', 'processing', 'succeeded', 'failed']);
const providerId = z.string().regex(/^[A-Za-z0-9_]{6,64}$/, 'invalid provider identifier');

const orderSchema = z
  .object({
    id: z.string().uuid(),
    bookingId: z.string().uuid(),
    provider: z.string(),
    providerOrderId: z.string(),
    amount: z.string(),
    currency: z.string(),
    status: orderStatus,
    expiresAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  })
  .openapi('PaymentOrder');

const checkoutSchema = z
  .object({
    order: orderSchema,
    checkout: z.object({
      provider: z.string(),
      keyId: z.string().openapi({ description: 'Public key id for Razorpay Checkout (never the secret)' }),
      orderId: z.string(),
      amount: z.number().int().openapi({ description: 'Minor units (paise)' }),
      currency: z.string(),
      name: z.string(),
      description: z.string(),
    }),
  })
  .openapi('PaymentCheckout');

const transactionSchema = z
  .object({
    id: z.string().uuid(),
    orderId: z.string().uuid(),
    providerPaymentId: z.string(),
    amount: z.string(),
    status: z.enum(['authorized', 'captured', 'failed']),
    method: z.string().nullable(),
    paidAt: z.string().datetime().nullable(),
    failureReason: z.string().nullable(),
  })
  .openapi('PaymentTransaction');

const refundSchema = z
  .object({
    id: z.string().uuid(),
    bookingId: z.string().uuid(),
    amount: z.string(),
    kind: z.enum(['cancellation', 'late_payment', 'duplicate_payment', 'manual']),
    reason: z.string().nullable(),
    status: refundStatus,
    providerRefundId: z.string().nullable(),
    requestedAt: z.string().datetime(),
    processedAt: z.string().datetime().nullable(),
    attempts: z.number().int().optional(),
    lastError: z.string().nullable().optional(),
    requestedBy: z.string().uuid().nullable().optional(),
  })
  .openapi('Refund');

const bookingPaymentsSchema = z
  .object({ orders: z.array(orderSchema), transactions: z.array(transactionSchema), refunds: z.array(refundSchema) })
  .openapi('BookingPayments');

const verifyBody = z
  .object({ providerOrderId: providerId, providerPaymentId: providerId, signature: z.string().regex(/^[0-9a-f]{64}$/, 'signature must be hex') })
  .strict();
const verifyResult = z
  .object({ outcome: z.enum(['confirmed', 'refunded', 'failed', 'pending', 'unknown_order']), bookingId: z.string().uuid(), bookingStatus: z.string(), paymentStatus: z.string() })
  .openapi('PaymentVerification');

const webhookParams = z.object({ provider: z.string().regex(/^[a-z]{2,30}$/) });
const webhookHeaders = z.object({
  'x-razorpay-signature': z.string().openapi({ description: 'HMAC-SHA256 of the raw body with the webhook secret' }),
  'x-razorpay-event-id': z.string().optional(),
});

const adminRefundBody = z.object({ amount: f.money.optional().openapi({ description: 'Defaults to the full refundable amount' }), reason: z.string().trim().min(3).max(1000) }).strict();
const idempotencyHeaders = z.object({ 'idempotency-key': z.string().regex(/^[A-Za-z0-9_:.-]{8,128}$/) });
const adminListQuery = (status) => z.object({ ...paginationQuery, status: status.optional(), bookingId: f.uuid.optional() }).strict();

module.exports = {
  orderSchema,
  checkoutSchema,
  transactionSchema,
  refundSchema,
  bookingPaymentsSchema,
  verifyBody,
  verifyResult,
  webhookParams,
  webhookHeaders,
  adminRefundBody,
  idempotencyHeaders,
  paymentListQuery: adminListQuery(orderStatus),
  refundListQuery: adminListQuery(refundStatus),
  idParams: z.object({ id: f.uuid }),
  bookingIdParams: z.object({ bookingId: f.uuid }),
};
