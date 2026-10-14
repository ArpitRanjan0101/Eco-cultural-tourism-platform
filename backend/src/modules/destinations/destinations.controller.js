'use strict';

const service = require('./destinations.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../core/utils/response');
const { requestContext } = require('../../core/http/context');

const paged = (res, { items, meta }) => sendSuccess(res, items, { meta });
const ctx = requestContext;

module.exports = {
  listPublic: async (req, res) => paged(res, await service.listPublic(req.valid.query)),
  listFeatured: async (req, res) => sendSuccess(res, await service.listFeatured(req.valid.query)),
  listByDistrict: async (req, res) => paged(res, await service.listByDistrict(req.valid.params.slug, req.valid.query)),
  getPublic: async (req, res) => sendSuccess(res, await service.getPublic(req.valid.params.slug)),
  nearby: async (req, res) => paged(res, await service.nearby(req.valid.params.slug, req.valid.query)),
  listPublicCategories: async (_req, res) => sendSuccess(res, await service.listPublicCategories()),

  adminList: async (req, res) => paged(res, await service.adminList(req.valid.query)),
  adminGet: async (req, res) => sendSuccess(res, await service.adminGet(req.valid.params.id)),
  create: async (req, res) => sendCreated(res, await service.create(ctx(req), req.valid.body)),
  update: async (req, res) => sendSuccess(res, await service.update(ctx(req), req.valid.params.id, req.valid.body)),
  setStatus: async (req, res) => sendSuccess(res, await service.setStatus(ctx(req), req.valid.params.id, req.valid.body)),
  archive: async (req, res) => {
    await service.archive(ctx(req), req.valid.params.id);
    sendNoContent(res);
  },
  setCategories: async (req, res) => sendSuccess(res, await service.setCategories(ctx(req), req.valid.params.id, req.valid.body)),
  attachMedia: async (req, res) => sendSuccess(res, await service.attachMedia(ctx(req), req.valid.params.id, req.valid.body)),
  detachMedia: async (req, res) => {
    await service.detachMedia(ctx(req), req.valid.params.id, req.valid.params.mediaId);
    sendNoContent(res);
  },
  replaceFaqs: async (req, res) => sendSuccess(res, await service.replaceFaqs(ctx(req), req.valid.params.id, req.valid.body)),
  setRelated: async (req, res) => sendSuccess(res, await service.setRelated(ctx(req), req.valid.params.id, req.valid.body)),

  listCategories: async (req, res) => sendSuccess(res, await service.listCategories(req.valid.query)),
  createCategory: async (req, res) => sendCreated(res, await service.createCategory(ctx(req), req.valid.body)),
  updateCategory: async (req, res) => sendSuccess(res, await service.updateCategory(ctx(req), req.valid.params.id, req.valid.body)),
  setCategoryStatus: async (req, res) =>
    sendSuccess(res, await service.setCategoryStatus(ctx(req), req.valid.params.id, req.valid.body)),
};
