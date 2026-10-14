'use strict';

const authService = require('./auth.service');
const { sendSuccess, sendNoContent } = require('../../core/utils/response');
const { requestContext } = require('../../core/http/context');

const accepted = (res, message) => sendSuccess(res, { message }, { status: 202 });

async function register(req, res) {
  await authService.register(req.valid.body);
  accepted(res, 'Registration received. Check your email to verify your account, then sign in.');
}

async function login(req, res) {
  sendSuccess(res, await authService.login(req.valid.body, requestContext(req)));
}

async function refresh(req, res) {
  sendSuccess(res, await authService.refresh(req.valid.body));
}

async function logout(req, res) {
  await authService.logout(req.valid.body);
  sendNoContent(res);
}

async function logoutAll(req, res) {
  await authService.logoutAll(req.auth.userId);
  sendNoContent(res);
}

async function me(req, res) {
  sendSuccess(res, await authService.getMe(req.auth));
}

async function forgotPassword(req, res) {
  await authService.forgotPassword(req.valid.body);
  accepted(res, 'If an account exists for that email, a password reset link has been sent.');
}

async function resetPassword(req, res) {
  await authService.resetPassword(req.valid.body);
  sendNoContent(res);
}

async function changePassword(req, res) {
  await authService.changePassword(req.auth, req.valid.body);
  sendNoContent(res);
}

async function verifyEmail(req, res) {
  await authService.verifyEmail(req.valid.body);
  sendSuccess(res, { emailVerified: true });
}

async function resendVerification(req, res) {
  await authService.resendVerification(req.valid.body);
  accepted(res, 'If the account exists and is unverified, a new verification email has been sent.');
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  me,
  forgotPassword,
  resetPassword,
  changePassword,
  verifyEmail,
  resendVerification,
};
