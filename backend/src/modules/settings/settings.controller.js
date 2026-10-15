'use strict';

const service = require('./settings.service');
const { sendSuccess } = require('../../core/utils/response');
const { requestContext: ctx } = require('../../core/http/context');

module.exports = {
  list: async (req, res) => sendSuccess(res, await service.list()),
  update: async (req, res) => sendSuccess(res, await service.update(ctx(req), req.valid.body)),
};
