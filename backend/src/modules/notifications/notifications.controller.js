'use strict';

const service = require('./notifications.service');
const { sendSuccess } = require('../../core/utils/response');
const { requestContext: ctx } = require('../../core/http/context');

module.exports = {
  listOwn: async (req, res) => {
    const { items, meta } = await service.listOwn(ctx(req), req.valid.query);
    sendSuccess(res, items, { meta });
  },
  unreadCount: async (req, res) => sendSuccess(res, await service.unreadCount(ctx(req))),
  markRead: async (req, res) => sendSuccess(res, await service.markRead(ctx(req), req.valid.params.id)),
  markAllRead: async (req, res) => sendSuccess(res, await service.markAllRead(ctx(req))),
  listTemplates: async (_req, res) => sendSuccess(res, await service.listTemplates()),
  updateTemplate: async (req, res) => sendSuccess(res, await service.updateTemplate(ctx(req), req.valid.params.id, req.valid.body)),
};
