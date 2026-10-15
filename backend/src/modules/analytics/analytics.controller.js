'use strict';

const service = require('./analytics.service');
const { sendSuccess } = require('../../core/utils/response');
const { requestContext: ctx } = require('../../core/http/context');

const sendPage = (res, { items, meta }) => sendSuccess(res, items, { meta });

module.exports = {
  platformDashboard: async (req, res) => sendSuccess(res, await service.platformDashboard()),
  platformBookings: async (req, res) => sendSuccess(res, await service.bookingsReport(req.valid.query)),
  platformRevenue: async (req, res) => sendSuccess(res, await service.revenueReport(req.valid.query)),
  destinations: async (req, res) => sendPage(res, await service.destinationsReport(req.valid.query)),
  partners: async (req, res) => sendPage(res, await service.partnersReport(req.valid.query)),
  partnerDashboard: async (req, res) => sendSuccess(res, await service.partnerDashboard(ctx(req))),
  partnerBookings: async (req, res) => sendSuccess(res, await service.bookingsReport(req.valid.query, ctx(req).partner.partnerId)),
  partnerRevenue: async (req, res) => sendSuccess(res, await service.revenueReport(req.valid.query, ctx(req).partner.partnerId)),
};
