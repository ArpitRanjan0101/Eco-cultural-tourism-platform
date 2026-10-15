'use strict';

const service = require('./reviews.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../core/utils/response');
const { requestContext: ctx } = require('../../core/http/context');

const sendPage = (res, { items, meta }) => sendSuccess(res, items, { meta });

module.exports = {
  listForSubject: async (req, res) => {
    const { subjectType, subjectId, ...page } = req.valid.query;
    sendPage(res, await service.listForSubject(subjectType, subjectId, page));
  },
  listForDestination: async (req, res) => sendPage(res, await service.listForDestination(req.valid.params.slug, req.valid.query)),
  create: async (req, res) => sendCreated(res, await service.create(ctx(req), req.valid.body)),
  update: async (req, res) => sendSuccess(res, await service.update(ctx(req), req.valid.params.id, req.valid.body)),
  remove: async (req, res) => {
    await service.remove(ctx(req), req.valid.params.id);
    sendNoContent(res);
  },
  listForModeration: async (req, res) => sendPage(res, await service.listForModeration(req.valid.query)),
  moderate: async (req, res) => sendSuccess(res, await service.moderate(ctx(req), req.valid.params.id, req.valid.body)),
};
