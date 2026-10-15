'use strict';

const service = require('./payments.service');
const { requireKey } = require('../../core/database/idempotency');
const { sendSuccess } = require('../../core/utils/response');
const { requestContext: ctx } = require('../../core/http/context');

const paged = (res, { items, meta }) => sendSuccess(res, items, { meta });
const p = (req) => req.valid.params;

module.exports = {
  createPaymentOrder: async (req, res) => {
    const { replayed, ...checkout } = await service.createPaymentOrder(ctx(req), p(req).id, requireKey(req.get('idempotency-key')));
    if (replayed) res.set('Idempotent-Replay', 'true');
    sendSuccess(res, checkout, { status: 201 });
  },
  verify: async (req, res) => sendSuccess(res, await service.verifyCheckout(ctx(req), req.valid.body)),
  getOrder: async (req, res) => sendSuccess(res, await service.getOrder(ctx(req), p(req).id)),
  bookingPayments: async (req, res) => sendSuccess(res, await service.bookingPayments(ctx(req), p(req).bookingId)),
  getRefund: async (req, res) => sendSuccess(res, await service.getOwnRefund(ctx(req), p(req).id)),
  webhook: async (req, res) => {
    const result = await service.handleWebhook(p(req).provider, {
      rawBody: req.rawBody,
      signature: req.get('x-razorpay-signature'),
      eventId: req.get('x-razorpay-event-id'),
      body: req.body,
    });
    sendSuccess(res, result);
  },
  adminPayments: async (req, res) => paged(res, await service.adminPayments(req.valid.query)),
  adminRefunds: async (req, res) => paged(res, await service.adminRefunds(req.valid.query)),
  adminRefund: async (req, res) =>
    sendSuccess(res, await service.adminRefund(ctx(req), p(req).id, req.valid.body, requireKey(req.get('idempotency-key'))), { status: 201 }),
  retryRefund: async (req, res) => sendSuccess(res, await service.retryRefund(ctx(req), p(req).id)),
};
