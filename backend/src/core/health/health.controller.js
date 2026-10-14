'use strict';

const healthService = require('./health.service');
const { sendSuccess } = require('../utils/response');

function live(_req, res) {
  sendSuccess(res, { status: 'live' });
}

async function ready(req, res) {
  const { ready: isReady, checks } = await healthService.checkReadiness();
  if (isReady) return sendSuccess(res, { status: 'ready', checks });
  return res.status(503).json({
    success: false,
    error: { code: 'NOT_READY', message: 'One or more dependencies are unavailable', details: { checks }, requestId: req.id },
  });
}

function version(_req, res) {
  sendSuccess(res, healthService.getVersion());
}

module.exports = { live, ready, version };
