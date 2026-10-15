'use strict';

const service = require('./favorites.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../core/utils/response');
const { requestContext: ctx } = require('../../core/http/context');

module.exports = {
  list: async (req, res) => {
    const { items, meta } = await service.list(ctx(req), req.valid.query);
    sendSuccess(res, items, { meta });
  },
  add: async (req, res) => {
    const { favorite, created } = await service.add(ctx(req), req.valid.body);
    if (created) sendCreated(res, favorite);
    else sendSuccess(res, favorite);
  },
  remove: async (req, res) => {
    await service.remove(ctx(req), req.valid.params);
    sendNoContent(res);
  },
};
