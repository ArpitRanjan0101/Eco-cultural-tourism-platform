'use strict';

const service = require('./packages.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../core/utils/response');
const { requestContext: ctx } = require('../../core/http/context');

const paged = (res, { items, meta }) => sendSuccess(res, items, { meta });
const p = (req) => req.valid.params;

module.exports = {
  listPublic: async (req, res) => paged(res, await service.listPublic(req.valid.query)),
  getPublic: async (req, res) => sendSuccess(res, await service.getPublic(p(req).slug)),
  listPublicDepartures: async (req, res) => sendSuccess(res, await service.listPublicDepartures(p(req).id)),
  availability: async (req, res) => sendSuccess(res, await service.availability(p(req).id, req.valid.query)),

  listMine: async (req, res) => paged(res, await service.listMine(ctx(req), req.valid.query)),
  create: async (req, res) => sendCreated(res, await service.create(ctx(req), req.valid.body)),
  update: async (req, res) => sendSuccess(res, await service.update(ctx(req), p(req).id, req.valid.body)),
  setDestinations: async (req, res) => sendSuccess(res, await service.setDestinations(ctx(req), p(req).id, req.valid.body)),
  setItinerary: async (req, res) => sendSuccess(res, await service.setItinerary(ctx(req), p(req).id, req.valid.body)),
  setInclusions: async (req, res) => sendSuccess(res, await service.setInclusions(ctx(req), p(req).id, req.valid.body)),
  attachMedia: async (req, res) => sendSuccess(res, await service.attachMedia(ctx(req), p(req).id, req.valid.body)),
  detachMedia: async (req, res) => {
    await service.detachMedia(ctx(req), p(req).id, p(req).mediaId);
    sendNoContent(res);
  },
  createDeparture: async (req, res) => sendCreated(res, await service.createDeparture(ctx(req), p(req).id, req.valid.body)),
  updateDeparture: async (req, res) => sendSuccess(res, await service.updateDeparture(ctx(req), p(req).id, p(req).departureId, req.valid.body)),

  adminList: async (req, res) => paged(res, await service.adminList(req.valid.query)),
  setStatus: async (req, res) => sendSuccess(res, await service.setStatus(ctx(req), p(req).id, req.valid.body)),
};
