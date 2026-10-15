'use strict';

const service = require('./guides.service');
const { sendSuccess, sendCreated } = require('../../core/utils/response');
const { requestContext: ctx } = require('../../core/http/context');

const paged = (res, { items, meta }) => sendSuccess(res, items, { meta });
const p = (req) => req.valid.params;

module.exports = {
  listPublic: async (req, res) => paged(res, await service.listPublic(req.valid.query)),
  listForDestination: async (req, res) => paged(res, await service.listForDestination(p(req).slug, req.valid.query)),
  getPublic: async (req, res) => sendSuccess(res, await service.getPublic(p(req).id)),
  listPublicServices: async (req, res) => sendSuccess(res, await service.listPublicServices(p(req).id)),
  publicAvailability: async (req, res) => sendSuccess(res, await service.publicAvailability(p(req).id, req.valid.query)),
  listLanguages: async (_req, res) => sendSuccess(res, await service.listLanguages()),

  listMine: async (req, res) => paged(res, await service.listMine(ctx(req), req.valid.query)),
  create: async (req, res) => sendCreated(res, await service.create(ctx(req), req.valid.body)),
  update: async (req, res) => sendSuccess(res, await service.update(ctx(req), p(req).id, req.valid.body)),
  setLanguages: async (req, res) => sendSuccess(res, await service.setLanguages(ctx(req), p(req).id, req.valid.body)),
  setDestinations: async (req, res) => sendSuccess(res, await service.setDestinations(ctx(req), p(req).id, req.valid.body)),
  createService: async (req, res) => sendCreated(res, await service.createService(ctx(req), p(req).id, req.valid.body)),
  updateService: async (req, res) => sendSuccess(res, await service.updateService(ctx(req), p(req).id, p(req).serviceId, req.valid.body)),
  setServiceStatus: async (req, res) =>
    sendSuccess(res, await service.setServiceStatus(ctx(req), p(req).id, p(req).serviceId, req.valid.body)),
  setAvailability: async (req, res) => sendSuccess(res, await service.setAvailability(ctx(req), p(req).id, req.valid.body)),
  addDocument: async (req, res) => sendCreated(res, await service.addDocument(ctx(req), p(req).id, req.valid.body)),

  adminList: async (req, res) => paged(res, await service.adminList(req.valid.query)),
  adminGet: async (req, res) => sendSuccess(res, await service.adminGet(p(req).id)),
  setVerification: async (req, res) => sendSuccess(res, await service.setVerification(ctx(req), p(req).id, req.valid.body)),
  setStatus: async (req, res) => sendSuccess(res, await service.setStatus(ctx(req), p(req).id, req.valid.body)),
  createLanguage: async (req, res) => sendCreated(res, await service.createLanguage(ctx(req), req.valid.body)),
  updateLanguage: async (req, res) => sendSuccess(res, await service.updateLanguage(ctx(req), p(req).id, req.valid.body)),
};
