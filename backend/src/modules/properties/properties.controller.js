'use strict';

const service = require('./properties.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../core/utils/response');
const { requestContext: ctx } = require('../../core/http/context');

const paged = (res, { items, meta }) => sendSuccess(res, items, { meta });
const p = (req) => req.valid.params;

module.exports = {
  listPublic: async (req, res) => paged(res, await service.listPublic(req.valid.query)),
  getPublic: async (req, res) => sendSuccess(res, await service.getPublic(p(req).slug)),
  listPublicRooms: async (req, res) => sendSuccess(res, await service.listPublicRooms(p(req).id)),
  availability: async (req, res) => sendSuccess(res, await service.availability(p(req).id, req.valid.query)),
  listAmenities: async (_req, res) => sendSuccess(res, await service.listAmenities()),
  listForDestination: async (req, res) => paged(res, await service.listForDestination(p(req).slug, req.valid.query)),

  listMine: async (req, res) => paged(res, await service.listMine(ctx(req), req.valid.query)),
  create: async (req, res) => sendCreated(res, await service.create(ctx(req), req.valid.body)),
  update: async (req, res) => sendSuccess(res, await service.update(ctx(req), p(req).id, req.valid.body)),
  setAmenities: async (req, res) => sendSuccess(res, await service.setAmenities(ctx(req), p(req).id, req.valid.body)),
  setPolicies: async (req, res) => sendSuccess(res, await service.setPolicies(ctx(req), p(req).id, req.valid.body)),
  attachMedia: async (req, res) => sendSuccess(res, await service.attachMedia(ctx(req), p(req).id, req.valid.body)),
  detachMedia: async (req, res) => {
    await service.detachMedia(ctx(req), p(req).id, p(req).mediaId);
    sendNoContent(res);
  },
  createRoom: async (req, res) => sendCreated(res, await service.createRoom(ctx(req), p(req).id, req.valid.body)),
  updateRoom: async (req, res) => sendSuccess(res, await service.updateRoom(ctx(req), p(req).id, p(req).roomId, req.valid.body)),
  setRoomStatus: async (req, res) => sendSuccess(res, await service.setRoomStatus(ctx(req), p(req).id, p(req).roomId, req.valid.body)),
  attachRoomMedia: async (req, res) => sendSuccess(res, await service.attachRoomMedia(ctx(req), p(req).id, p(req).roomId, req.valid.body)),
  detachRoomMedia: async (req, res) => {
    await service.detachRoomMedia(ctx(req), p(req).id, p(req).roomId, p(req).mediaId);
    sendNoContent(res);
  },
  writeInventory: async (req, res) => sendSuccess(res, await service.writeInventory(ctx(req), p(req).roomId, req.valid.body)),
  writeRates: async (req, res) => sendSuccess(res, await service.writeRates(ctx(req), p(req).roomId, req.valid.body)),
  calendar: async (req, res) => sendSuccess(res, await service.calendar(ctx(req), p(req).roomId, req.valid.query)),

  adminList: async (req, res) => paged(res, await service.adminList(req.valid.query)),
  adminGet: async (req, res) => sendSuccess(res, await service.adminGet(p(req).id)),
  setStatus: async (req, res) => sendSuccess(res, await service.setStatus(ctx(req), p(req).id, req.valid.body)),
  createAmenity: async (req, res) => sendCreated(res, await service.createAmenity(ctx(req), req.valid.body)),
  updateAmenity: async (req, res) => sendSuccess(res, await service.updateAmenity(ctx(req), p(req).id, req.valid.body)),
};
