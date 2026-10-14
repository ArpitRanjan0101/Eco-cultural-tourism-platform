'use strict';

const express = require('express');
const controller = require('./health.controller');
const { requireServiceToken } = require('../middleware/serviceToken');

const router = express.Router();

// Liveness is public (container/orchestrator probes); readiness and version
// reveal dependency/deployment details and require the service token.
router.get('/live', controller.live);
router.get('/ready', requireServiceToken, controller.ready);
router.get('/version', requireServiceToken, controller.version);

module.exports = router;
