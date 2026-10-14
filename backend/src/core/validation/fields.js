'use strict';

const { z } = require('./zod');

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const slug = z.string().trim().toLowerCase().max(160).regex(SLUG, 'slug may contain lowercase letters, digits and single hyphens');
const name = (max = 150) => z.string().trim().min(1).max(max);
const optionalText = (max) => z.string().trim().min(1).max(max).nullable();
const uuid = z.string().uuid();
const activeStatus = z.enum(['active', 'inactive']);
const publishStatus = z.enum(['draft', 'published', 'archived']);

const geoPoint = z
  .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
  .strict()
  .openapi('GeoPoint');

/** Relative app path or absolute https URL; rejects javascript:, data:, protocol-relative, etc. */
const safeHref = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => /^\/(?!\/)[^\s]*$/.test(value) || /^https:\/\/[^\s]+$/.test(value), 'must be a path starting with "/" or an https:// URL');

const uniqueIds = ({ min = 0, max }) =>
  z
    .array(uuid)
    .min(min)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, 'ids must be unique');

const statusBody = (statusSchema) => z.object({ status: statusSchema }).strict();
const idParams = z.object({ id: uuid });
const slugParams = z.object({ slug });

module.exports = { slug, name, optionalText, uuid, activeStatus, publishStatus, geoPoint, safeHref, uniqueIds, statusBody, idParams, slugParams };
