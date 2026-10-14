'use strict';

const usersService = require('./users.service');
const { sendSuccess } = require('../../core/utils/response');
const { requestContext } = require('../../core/http/context');

async function getMe(req, res) {
  sendSuccess(res, await usersService.getMe(req.auth.userId));
}

async function updateMe(req, res) {
  sendSuccess(res, await usersService.updateMe(req.auth.userId, req.valid.body));
}

async function getMyRoles(req, res) {
  sendSuccess(res, await usersService.getMyRoles(req.auth.userId));
}

async function searchUsers(req, res) {
  const { items, meta } = await usersService.searchUsers(req.valid.query);
  sendSuccess(res, items, { meta });
}

async function getUser(req, res) {
  sendSuccess(res, await usersService.getUser(req.valid.params.id));
}

async function setUserStatus(req, res) {
  sendSuccess(res, await usersService.setUserStatus(requestContext(req), req.valid.params.id, req.valid.body));
}

async function setUserRoles(req, res) {
  sendSuccess(res, await usersService.setUserRoles(requestContext(req), req.valid.params.id, req.valid.body));
}

async function listRoles(_req, res) {
  sendSuccess(res, await usersService.listRoles());
}

async function listPermissions(_req, res) {
  sendSuccess(res, await usersService.listPermissions());
}

async function setRolePermissions(req, res) {
  sendSuccess(res, await usersService.setRolePermissions(requestContext(req), req.valid.params.id, req.valid.body));
}

module.exports = {
  getMe,
  updateMe,
  getMyRoles,
  searchUsers,
  getUser,
  setUserStatus,
  setUserRoles,
  listRoles,
  listPermissions,
  setRolePermissions,
};
