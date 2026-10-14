'use strict';

const { z } = require('../../core/validation/zod');
const { successEnvelope } = require('../../core/validation/common');
const controller = require('./auth.controller');
const schema = require('./auth.schema');

const TAGS = ['Auth'];
const ok = (dataSchema) => ({ status: 200, schema: successEnvelope(dataSchema) });
const accepted = { status: 202, schema: successEnvelope(schema.acceptedSchema) };
const noContent = (description) => ({ status: 204, description });

const routes = [
  {
    method: 'post',
    path: '/auth/register',
    tags: TAGS,
    summary: 'Create user account',
    description:
      'Always 202 with the same body whether or not the email exists (no account enumeration). Queues a verification email.',
    rateLimit: { name: 'auth_register', windowSeconds: 3600, max: 10 },
    request: { body: schema.registerBody },
    response: accepted,
    handler: controller.register,
  },
  {
    method: 'post',
    path: '/auth/login',
    tags: TAGS,
    summary: 'Authenticate and issue access/refresh tokens',
    description: 'Accounts lock for 15 minutes after 5 failures per account+IP or 20 per account (429 LOGIN_LOCKED).',
    rateLimit: { name: 'auth_login', windowSeconds: 60, max: 20 },
    request: { body: schema.loginBody },
    response: ok(schema.authSessionSchema),
    handler: controller.login,
  },
  {
    method: 'post',
    path: '/auth/refresh',
    tags: TAGS,
    summary: 'Rotate refresh token',
    description:
      'Each refresh token is single-use. Reusing a rotated token revokes the whole session (401 REFRESH_TOKEN_REUSED); the BFF must serialise refreshes per session.',
    rateLimit: { name: 'auth_refresh', windowSeconds: 60, max: 60 },
    request: { body: schema.refreshTokenBody },
    response: ok(schema.authSessionSchema),
    handler: controller.refresh,
  },
  {
    method: 'post',
    path: '/auth/logout',
    tags: TAGS,
    summary: 'Revoke current refresh session',
    rateLimit: { name: 'auth_logout', windowSeconds: 60, max: 60 },
    request: { body: schema.refreshTokenBody },
    response: noContent('Session revoked (idempotent)'),
    handler: controller.logout,
  },
  {
    method: 'post',
    path: '/auth/logout-all',
    tags: TAGS,
    summary: 'Revoke all sessions',
    auth: 'user',
    response: noContent('All sessions revoked'),
    handler: controller.logoutAll,
  },
  {
    method: 'get',
    path: '/auth/me',
    tags: TAGS,
    summary: 'Return authenticated user and permissions',
    auth: 'user',
    response: ok(schema.meSchema),
    handler: controller.me,
  },
  {
    method: 'post',
    path: '/auth/forgot-password',
    tags: TAGS,
    summary: 'Request password reset',
    description: 'Always 202 (no account enumeration).',
    rateLimit: { name: 'auth_forgot', windowSeconds: 900, max: 5 },
    request: { body: schema.emailBody },
    response: accepted,
    handler: controller.forgotPassword,
  },
  {
    method: 'post',
    path: '/auth/reset-password',
    tags: TAGS,
    summary: 'Reset password with verification token',
    description: 'Consumes the token, verifies the email and revokes every session.',
    rateLimit: { name: 'auth_reset', windowSeconds: 900, max: 10 },
    request: { body: schema.resetPasswordBody },
    response: noContent('Password reset'),
    errors: [400],
    handler: controller.resetPassword,
  },
  {
    method: 'post',
    path: '/auth/change-password',
    tags: TAGS,
    summary: 'Change password while logged in',
    description: 'Revokes all other sessions; the current session stays signed in.',
    auth: 'user',
    rateLimit: { name: 'auth_change_password', windowSeconds: 900, max: 5, by: 'user' },
    request: { body: schema.changePasswordBody },
    response: noContent('Password changed'),
    errors: [400],
    handler: controller.changePassword,
  },
  {
    method: 'post',
    path: '/auth/verify-email',
    tags: TAGS,
    summary: 'Complete email verification',
    rateLimit: { name: 'auth_verify_email', windowSeconds: 900, max: 10 },
    request: { body: schema.tokenBody },
    response: ok(z.object({ emailVerified: z.literal(true) })),
    errors: [400],
    handler: controller.verifyEmail,
  },
  {
    method: 'post',
    path: '/auth/resend-verification',
    tags: TAGS,
    summary: 'Resend verification',
    description: 'Always 202 (no account enumeration).',
    rateLimit: { name: 'auth_resend', windowSeconds: 900, max: 5 },
    request: { body: schema.emailBody },
    response: accepted,
    handler: controller.resendVerification,
  },
];

module.exports = routes;
