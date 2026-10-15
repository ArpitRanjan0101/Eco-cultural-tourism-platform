'use strict';

const destinationsService = require('../destinations/destinations.service');
const propertiesService = require('../properties/properties.service');
const guidesService = require('../guides/guides.service');
const experiencesService = require('../experiences/experiences.service');
const packagesService = require('../packages/packages.service');

/**
 * Resolves polymorphic "subjects" (favorites, reviews) to publicly visible cards through
 * the owning modules' public interfaces. A subject that is unpublished/suspended simply
 * has no card.
 */
const SUBJECT_TYPES = ['destination', 'property', 'guide', 'experience', 'package'];

const RESOLVERS = {
  destination: async (ids) => new Map((await destinationsService.getPublishedCards(ids)).map((card) => [card.id, card])),
  property: (ids) => propertiesService.getPublicCardsByIds(ids),
  guide: (ids) => guidesService.getPublicCardsByIds(ids),
  experience: (ids) => experiencesService.getPublicCardsByIds(ids),
  package: (ids) => packagesService.getPublicCardsByIds(ids),
};

/** Map "type:id" -> card for a mixed list of { subjectType, subjectId }. */
async function resolveCards(subjects) {
  const result = new Map();
  await Promise.all(
    SUBJECT_TYPES.map(async (type) => {
      const ids = [...new Set(subjects.filter((s) => s.subjectType === type).map((s) => s.subjectId))];
      if (ids.length === 0) return;
      for (const [id, card] of await RESOLVERS[type](ids)) result.set(`${type}:${id}`, card);
    }),
  );
  return result;
}

async function isPublic(subjectType, subjectId) {
  return (await RESOLVERS[subjectType]([subjectId])).has(subjectId);
}

module.exports = { SUBJECT_TYPES, resolveCards, isPublic };
