'use strict';

const { isIP } = require('node:net');

/**
 * Resolves the end-user IP. All traffic arrives via the BFF, so the socket/proxy
 * address is the BFF's. The BFF forwards the browser IP in X-Client-Ip, which is
 * trusted only because this middleware runs after the service-token check
 * (nginx strips the header on the public listener).
 */
function clientIp(req, _res, next) {
  const forwarded = req.get('x-client-ip');
  req.clientIp = forwarded && isIP(forwarded) ? forwarded : req.ip;
  next();
}

module.exports = clientIp;
