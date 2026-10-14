'use strict';

const { z } = require('../../core/validation/zod');
const { userSummarySchema } = require('../users/users.schema');

const email = z.string().trim().toLowerCase().email().max(254);
// Length is the primary strength control (NIST SP 800-63B); upper bound limits hashing cost.
const newPassword = z.string().min(8, 'password must be at least 8 characters').max(128);
const anyPassword = z.string().min(1).max(128);
const opaqueToken = z.string().min(20).max(200);

const registerBody = z
  .object({ fullName: z.string().trim().min(1).max(150), email, password: newPassword })
  .strict()
  .refine((body) => body.password.toLowerCase() !== body.email, { message: 'password must not equal the email', path: ['password'] });

const loginBody = z.object({ email, password: anyPassword }).strict();
const refreshTokenBody = z.object({ refreshToken: opaqueToken }).strict();
const emailBody = z.object({ email }).strict();
const tokenBody = z.object({ token: opaqueToken }).strict();
const resetPasswordBody = z.object({ token: opaqueToken, newPassword }).strict();
const changePasswordBody = z
  .object({ currentPassword: anyPassword, newPassword })
  .strict()
  .refine((body) => body.currentPassword !== body.newPassword, {
    message: 'new password must differ from the current password',
    path: ['newPassword'],
  });

const authSessionSchema = z
  .object({
    tokenType: z.literal('Bearer'),
    accessToken: z.string(),
    accessTokenExpiresAt: z.string().datetime(),
    refreshToken: z.string(),
    refreshTokenExpiresAt: z.string().datetime(),
    user: userSummarySchema,
  })
  .openapi('AuthSession');

const acceptedSchema = z.object({ message: z.string() }).openapi('AcceptedMessage');

const meSchema = userSummarySchema
  .extend({ permissions: z.array(z.string()), sessionId: z.string().uuid() })
  .openapi('AuthenticatedUser');

module.exports = {
  registerBody,
  loginBody,
  refreshTokenBody,
  emailBody,
  tokenBody,
  resetPasswordBody,
  changePasswordBody,
  authSessionSchema,
  acceptedSchema,
  meSchema,
};
