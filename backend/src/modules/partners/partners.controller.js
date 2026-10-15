'use strict';

const service = require('./partners.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../core/utils/response');
const { requestContext: ctx } = require('../../core/http/context');

module.exports = {
  apply: async (req, res) => sendCreated(res, await service.apply(ctx(req), req.valid.body)),
  getMine: async (req, res) => sendSuccess(res, await service.getMine(ctx(req))),
  updateMine: async (req, res) => sendSuccess(res, await service.updateMine(ctx(req), req.valid.body)),
  addDocument: async (req, res) => sendCreated(res, await service.addDocument(ctx(req), req.valid.body)),
  listMembers: async (req, res) => sendSuccess(res, await service.listMembers(ctx(req))),
  addMember: async (req, res) => sendCreated(res, await service.addMember(ctx(req), req.valid.body)),
  changeMemberRole: async (req, res) =>
    sendSuccess(res, await service.changeMemberRole(ctx(req), req.valid.params.userId, req.valid.body)),
  removeMember: async (req, res) => {
    await service.removeMember(ctx(req), req.valid.params.userId);
    sendNoContent(res);
  },
  adminList: async (req, res) => {
    const { items, meta } = await service.adminList(req.valid.query);
    sendSuccess(res, items, { meta });
  },
  adminGet: async (req, res) => sendSuccess(res, await service.adminGet(req.valid.params.id)),
  setStatus: async (req, res) => sendSuccess(res, await service.setStatus(ctx(req), req.valid.params.id, req.valid.body)),
  adminDocuments: async (req, res) => sendSuccess(res, await service.adminDocuments(req.valid.params.id)),
};
