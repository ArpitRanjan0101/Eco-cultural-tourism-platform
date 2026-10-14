'use strict';

const mediaService = require('./media.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../core/utils/response');
const { requestContext } = require('../../core/http/context');

async function uploadInit(req, res) {
  sendCreated(res, await mediaService.initUpload(requestContext(req), req.valid.body));
}

async function uploadComplete(req, res) {
  sendSuccess(res, await mediaService.completeUpload(requestContext(req), req.valid.body));
}

async function getMedia(req, res) {
  sendSuccess(res, await mediaService.getMedia(requestContext(req), req.valid.params.id));
}

async function deleteMedia(req, res) {
  await mediaService.deleteMedia(requestContext(req), req.valid.params.id);
  sendNoContent(res);
}

module.exports = { uploadInit, uploadComplete, getMedia, deleteMedia };
