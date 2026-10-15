'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery } = require('../../core/utils/pagination');
const { SUBJECT_TYPES } = require('../subjects/subjects.service');
const { destinationCardSchema } = require('../destinations/destinations.schema');
const { propertyCardSchema } = require('../properties/properties.schema');
const { guideCardSchema } = require('../guides/guides.schema');
const { cardSchema: experienceCardSchema } = require('../experiences/experiences.schema');
const { cardSchema: packageCardSchema } = require('../packages/packages.schema');

const subjectType = z.enum(SUBJECT_TYPES);
const subjectCardSchema = z.union([destinationCardSchema, propertyCardSchema, guideCardSchema, experienceCardSchema, packageCardSchema]);

const listQuery = z.object({ ...paginationQuery, subjectType: subjectType.optional() }).strict();
const addBody = z.object({ subjectType, subjectId: f.uuid }).strict();
const removeParams = z.object({ type: subjectType, id: f.uuid });

const favoriteSchema = z
  .object({
    id: z.string().uuid(),
    subjectType,
    subjectId: z.string().uuid(),
    available: z.boolean().openapi({ description: 'false when the item is no longer publicly listed' }),
    item: subjectCardSchema.nullable().openapi({ description: 'Public card of the matching subject type' }),
    createdAt: z.string().datetime(),
  })
  .openapi('Favorite');

module.exports = { subjectType, subjectCardSchema, listQuery, addBody, removeParams, favoriteSchema };
