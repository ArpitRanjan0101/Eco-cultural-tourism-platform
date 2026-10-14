'use strict';

const { z } = require('../../core/validation/zod');
const { PURPOSES } = require('./media.policy');

const purposes = Object.keys(PURPOSES);

const mediaSchema = z
  .object({
    id: z.string().uuid(),
    purpose: z.enum(purposes),
    visibility: z.enum(['public', 'private']),
    status: z.enum(['pending', 'ready', 'rejected']),
    mimeType: z.string(),
    fileSize: z.number().int(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    altText: z.string().nullable(),
    url: z.string().url().nullable().openapi({ description: 'Public URL, or a 5-minute signed URL for private assets' }),
    createdAt: z.string().datetime(),
  })
  .openapi('Media');

const uploadInitBody = z
  .object({
    purpose: z.enum(purposes),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    fileSize: z.number().int().positive().max(25 * 1024 * 1024),
    altText: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

const uploadInitResponse = z
  .object({
    media: mediaSchema,
    upload: z.object({
      method: z.literal('PUT'),
      url: z.string().url(),
      headers: z.record(z.string()),
      expiresAt: z.string().datetime(),
    }),
  })
  .openapi('MediaUploadTicket');

const uploadCompleteBody = z.object({ mediaId: z.string().uuid() }).strict();
const idParams = z.object({ id: z.string().uuid() });

module.exports = { mediaSchema, uploadInitBody, uploadInitResponse, uploadCompleteBody, idParams };
