'use strict';

const service = require('./search.service');
const { sendSuccess } = require('../../core/utils/response');

const paged = (res, { items, meta }) => sendSuccess(res, items, { meta });

module.exports = {
  search: async (req, res) => paged(res, await service.search(req.valid.query)),
  suggestions: async (req, res) => sendSuccess(res, await service.suggestions(req.valid.query)),
  nearby: async (req, res) => {
    const { lat, lng, ...rest } = req.valid.query;
    paged(res, await service.nearby({ latitude: lat, longitude: lng, ...rest }));
  },
  filters: async (_req, res) => sendSuccess(res, await service.filters()),
};
