'use strict';

const service = require('./trips.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../core/utils/response');
const { requestContext: ctx } = require('../../core/http/context');

const p = (req) => req.valid.params;

module.exports = {
  list: async (req, res) => {
    const { items, meta } = await service.list(ctx(req), req.valid.query);
    sendSuccess(res, items, { meta });
  },
  create: async (req, res) => sendCreated(res, await service.create(ctx(req), req.valid.body)),
  get: async (req, res) => sendSuccess(res, await service.get(ctx(req), p(req).id)),
  update: async (req, res) => sendSuccess(res, await service.update(ctx(req), p(req).id, req.valid.body)),
  remove: async (req, res) => {
    await service.remove(ctx(req), p(req).id);
    sendNoContent(res);
  },
  addDay: async (req, res) => sendCreated(res, await service.addDay(ctx(req), p(req).id, req.valid.body)),
  updateDay: async (req, res) => sendSuccess(res, await service.updateDay(ctx(req), p(req).id, p(req).dayId, req.valid.body)),
  deleteDay: async (req, res) => sendSuccess(res, await service.deleteDay(ctx(req), p(req).id, p(req).dayId)),
  addStop: async (req, res) => sendCreated(res, await service.addStop(ctx(req), p(req).id, p(req).dayId, req.valid.body)),
  updateStop: async (req, res) => sendSuccess(res, await service.updateStop(ctx(req), p(req).id, p(req).stopId, req.valid.body)),
  deleteStop: async (req, res) => sendSuccess(res, await service.deleteStop(ctx(req), p(req).id, p(req).stopId)),
  reorderStops: async (req, res) => sendSuccess(res, await service.reorderStops(ctx(req), p(req).id, req.valid.body)),
};
