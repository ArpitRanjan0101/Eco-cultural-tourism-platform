'use strict';

const service = require('./geography.service');
const { sendSuccess, sendCreated } = require('../../core/utils/response');
const { requestContext } = require('../../core/http/context');

module.exports = {
  listPublicRegions: async (_req, res) => sendSuccess(res, await service.listPublicRegions()),
  listPublicDistricts: async (req, res) => sendSuccess(res, await service.listPublicDistricts(req.valid.query)),
  getPublicDistrict: async (req, res) => sendSuccess(res, await service.getPublicDistrict(req.valid.params.slug)),

  listRegions: async (req, res) => sendSuccess(res, await service.listRegions(req.valid.query)),
  createRegion: async (req, res) => sendCreated(res, await service.createRegion(requestContext(req), req.valid.body)),
  updateRegion: async (req, res) => sendSuccess(res, await service.updateRegion(requestContext(req), req.valid.params.id, req.valid.body)),
  setRegionStatus: async (req, res) =>
    sendSuccess(res, await service.setRegionStatus(requestContext(req), req.valid.params.id, req.valid.body)),

  listDistricts: async (req, res) => sendSuccess(res, await service.listDistricts(req.valid.query)),
  createDistrict: async (req, res) => sendCreated(res, await service.createDistrict(requestContext(req), req.valid.body)),
  updateDistrict: async (req, res) =>
    sendSuccess(res, await service.updateDistrict(requestContext(req), req.valid.params.id, req.valid.body)),
  setDistrictStatus: async (req, res) =>
    sendSuccess(res, await service.setDistrictStatus(requestContext(req), req.valid.params.id, req.valid.body)),
};
