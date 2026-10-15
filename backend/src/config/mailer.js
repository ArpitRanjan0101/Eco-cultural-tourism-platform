'use strict';

const nodemailer = require('nodemailer');
const config = require('./index');

let transport;

/** Shared SMTP transport (pooled). Credentials are optional (Mailpit in development needs none). */
function getTransport() {
  transport ??= nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: config.email.user ? { user: config.email.user, pass: config.email.password } : undefined,
    pool: true,
    maxConnections: 3,
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

/** Sends one message; returns the SMTP message id. */
async function sendMail({ to, subject, text, html }) {
  const info = await getTransport().sendMail({ from: config.email.from, to, subject, text, html });
  return info.messageId;
}

function closeMailer() {
  if (transport) transport.close();
  transport = undefined;
}

module.exports = { sendMail, closeMailer };
