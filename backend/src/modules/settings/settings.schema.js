'use strict';

const { z } = require('../../core/validation/zod');

const tiers = z
  .array(z.object({ hoursBeforeCheckIn: z.number().int().min(0).max(8760), refundPercent: z.number().int().min(0).max(100) }).strict())
  .min(1)
  .max(10)
  .refine((list) => new Set(list.map((t) => t.hoursBeforeCheckIn)).size === list.length, 'hoursBeforeCheckIn values must be unique');

/** Value rules per key; `null` restores the default. */
const VALUE_SCHEMAS = {
  'booking.hold_minutes': z.number().int().min(5).max(60),
  'booking.request_approval_hours': z.number().int().min(1).max(168),
  'booking.payment_window_hours': z.number().int().min(1).max(168),
  'booking.max_advance_days': z.number().int().min(30).max(730),
  'booking.tax_rate_percent': z
    .number()
    .min(0)
    .max(28)
    .refine((n) => Math.round(n * 100) === n * 100, 'at most two decimals'),
  'booking.default_cancellation_policy': z.object({ tiers, notes: z.string().trim().max(1000).optional() }).strict(),
};

const updateBody = z
  .object({
    values: z
      .object(Object.fromEntries(Object.entries(VALUE_SCHEMAS).map(([key, schema]) => [key, schema.nullable().optional()])))
      .strict()
      .refine((values) => Object.keys(values).length > 0, 'at least one setting is required'),
  })
  .strict();

const settingSchema = z
  .object({
    key: z.string(),
    description: z.string(),
    value: z.unknown(),
    defaultValue: z.unknown(),
    isDefault: z.boolean(),
    updatedBy: z.string().uuid().nullable(),
    updatedAt: z.string().datetime().nullable(),
  })
  .openapi('PlatformSetting');

module.exports = { VALUE_SCHEMAS, updateBody, settingSchema };
