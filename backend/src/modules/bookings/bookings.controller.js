'use strict';

const service = require('./bookings.service');
const { requireKey } = require('../../core/database/idempotency');
const { sendSuccess } = require('../../core/utils/response');
const { requestContext: ctx } = require('../../core/http/context');

const paged = (res, { items, meta }) => sendSuccess(res, items, { meta });
const p = (req) => req.valid.params;

module.exports = {
  quote: async (req, res) => sendSuccess(res, await service.quote(req.valid.body)),
  create: async (req, res) => {
    const key = requireKey(req.get('idempotency-key'));
    const { replayed, booking } = await service.create(ctx(req), req.valid.body, key);
    if (replayed) res.set('Idempotent-Replay', 'true');
    sendSuccess(res, booking, { status: 201 });
  },
  listOwn: async (req, res) => paged(res, await service.listOwn(ctx(req), req.valid.query)),
  getOwn: async (req, res) => sendSuccess(res, await service.getOwn(ctx(req), p(req).id)),
  getStatus: async (req, res) => sendSuccess(res, await service.getStatus(ctx(req), p(req).id)),
  cancelOwn: async (req, res) => sendSuccess(res, await service.cancelOwn(ctx(req), p(req).id, req.valid.body)),
  listDocuments: async (req, res) => sendSuccess(res, await service.listDocuments(ctx(req), p(req).id)),

  listForPartner: async (req, res) => paged(res, await service.listForPartner(ctx(req), req.valid.query)),
  getForPartner: async (req, res) => sendSuccess(res, await service.getForPartner(ctx(req), p(req).id)),
  approve: async (req, res) => sendSuccess(res, await service.approve(ctx(req), p(req).id, req.valid.body)),
  reject: async (req, res) => sendSuccess(res, await service.reject(ctx(req), p(req).id, req.valid.body)),

  adminList: async (req, res) => paged(res, await service.adminList(req.valid.query)),
  adminGet: async (req, res) => sendSuccess(res, await service.adminGet(p(req).id)),
  adminCancel: async (req, res) => sendSuccess(res, await service.adminCancel(ctx(req), p(req).id, req.valid.body)),
};
