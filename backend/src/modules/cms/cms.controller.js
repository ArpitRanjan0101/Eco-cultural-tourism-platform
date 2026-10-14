'use strict';

const service = require('./cms.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../core/utils/response');
const { requestContext: ctx } = require('../../core/http/context');

module.exports = {
  getPublishedPage: async (req, res) => sendSuccess(res, await service.getPublishedPage(req.valid.params.slug)),
  getHomepage: async (_req, res) => sendSuccess(res, await service.getHomepage()),
  getPublicMenu: async (req, res) => sendSuccess(res, await service.getPublicMenu(req.valid.params.code)),
  getActiveAnnouncements: async (_req, res) => sendSuccess(res, await service.getActiveAnnouncements()),

  listPages: async (req, res) => {
    const { items, meta } = await service.listPages(req.valid.query);
    sendSuccess(res, items, { meta });
  },
  createPage: async (req, res) => sendCreated(res, await service.createPage(ctx(req), req.valid.body)),
  getPage: async (req, res) => sendSuccess(res, await service.getPage(req.valid.params.id)),
  updatePage: async (req, res) => sendSuccess(res, await service.updatePage(ctx(req), req.valid.params.id, req.valid.body)),
  replaceSections: async (req, res) => sendSuccess(res, await service.replaceSections(ctx(req), req.valid.params.id, req.valid.body)),
  setPageStatus: async (req, res) => sendSuccess(res, await service.setPageStatus(ctx(req), req.valid.params.id, req.valid.body)),
  archivePage: async (req, res) => {
    await service.archivePage(ctx(req), req.valid.params.id);
    sendNoContent(res);
  },

  listMenus: async (_req, res) => sendSuccess(res, await service.listMenus()),
  createMenu: async (req, res) => sendCreated(res, await service.createMenu(ctx(req), req.valid.body)),
  replaceMenuItems: async (req, res) => sendSuccess(res, await service.replaceMenuItems(ctx(req), req.valid.params.id, req.valid.body)),

  listRedirects: async (_req, res) => sendSuccess(res, await service.listRedirects()),
  createRedirect: async (req, res) => sendCreated(res, await service.createRedirect(ctx(req), req.valid.body)),
  deleteRedirect: async (req, res) => {
    await service.deleteRedirect(ctx(req), req.valid.params.id);
    sendNoContent(res);
  },

  listAnnouncements: async (req, res) => sendSuccess(res, await service.listAnnouncements(req.valid.query)),
  createAnnouncement: async (req, res) => sendCreated(res, await service.createAnnouncement(ctx(req), req.valid.body)),
  updateAnnouncement: async (req, res) =>
    sendSuccess(res, await service.updateAnnouncement(ctx(req), req.valid.params.id, req.valid.body)),
  deleteAnnouncement: async (req, res) => {
    await service.deleteAnnouncement(ctx(req), req.valid.params.id);
    sendNoContent(res);
  },
};
