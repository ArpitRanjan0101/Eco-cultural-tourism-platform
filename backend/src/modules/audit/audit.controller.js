'use strict';

const auditSearch = require('./audit-search.service');
const { sendSuccess } = require('../../core/utils/response');

module.exports = {
  search: async (req, res) => {
    const { items, meta } = await auditSearch.search(req.valid.query);
    sendSuccess(res, items, { meta });
  },
};
