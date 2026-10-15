'use strict';

const service = require('./experiences.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../core/utils/response');
const { requestContext: ctx } = require('../../core/http/context');

const paged = (res, { items, meta }) => sendSuccess(res, items, { meta });
const p = (req) => req.valid.params;

module.exports = {
  listPublic: async (req, res) => paged(res, await service.listPublic(req.valid.query)),
  listForDestination: async (req, res) => paged(res, await service.listForDestination(p(req).slug, req.valid.query)),
  getPublic: async (req, res) => sendSuccess(res, await service.getPublic(p(req).slug)),
  listPublicSessions: async (req, res) => sendSuccess(res, await service.listPublicSessions(p(req).id, req.valid.query)),
  availability: async (req, res) => sendSuccess(res, await service.availability(p(req).id, req.valid.query)),

  listMine: async (req, res) => paged(res, await service.listMine(ctx(req), req.valid.query)),
  create: async (req, res) => sendCreated(res, await service.create(ctx(req), req.valid.body)),
  update: async (req, res) => sendSuccess(res, await service.update(ctx(req), p(req).id, req.valid.body)),
  createSession: async (req, res) => sendCreated(res, await service.createSession(ctx(req), p(req).id, req.valid.body)),
  updateSession: async (req, res) => sendSuccess(res, await service.updateSession(ctx(req), p(req).id, p(req).sessionId, req.valid.body)),
  deleteSession: async (req, res) => {
    await service.deleteSession(ctx(req), p(req).id, p(req).sessionId);
    sendNoContent(res);
  },
  attachMedia: async (req, res) => sendSuccess(res, await service.attachMedia(ctx(req), p(req).id, req.valid.body)),
  detachMedia: async (req, res) => {
    await service.detachMedia(ctx(req), p(req).id, p(req).mediaId);
    sendNoContent(res);
  },

  adminList: async (req, res) => paged(res, await service.adminList(req.valid.query)),
  setStatus: async (req, res) => sendSuccess(res, await service.setStatus(ctx(req), p(req).id, req.valid.body)),
};
