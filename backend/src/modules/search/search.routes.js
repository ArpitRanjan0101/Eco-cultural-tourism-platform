'use strict';

const { z } = require('../../core/validation/zod');
const { successEnvelope } = require('../../core/validation/common');
const controller = require('./search.controller');
const schema = require('./search.schema');

const TAGS = ['Search'];
const ok = (dataSchema, options) => ({ status: 200, schema: successEnvelope(dataSchema, options) });

const routes = [
  {
    method: 'get',
    path: '/search',
    tags: TAGS,
    summary: 'Unified search',
    description:
      'Full-text + fuzzy search over published destinations and active districts, ranked. Without `type` results are merged ' +
      '(first 500); with `type` results are paged directly.',
    rateLimit: { name: 'search', windowSeconds: 60, max: 120 },
    request: { query: schema.searchQuery },
    response: ok(z.array(schema.searchResult), { paginated: true }),
    errors: [404],
    handler: controller.search,
  },
  {
    method: 'get',
    path: '/search/suggestions',
    tags: TAGS,
    summary: 'Autocomplete',
    rateLimit: { name: 'search_suggest', windowSeconds: 60, max: 300 },
    request: { query: schema.suggestionsQuery },
    response: ok(z.array(schema.suggestion)),
    handler: controller.suggestions,
  },
  {
    method: 'get',
    path: '/search/nearby',
    tags: TAGS,
    summary: 'Radius search using coordinates',
    rateLimit: { name: 'search_nearby', windowSeconds: 60, max: 120 },
    request: { query: schema.nearbyQuery },
    response: ok(z.array(schema.nearbyResult), { paginated: true }),
    handler: controller.nearby,
  },
  {
    method: 'get',
    path: '/search/filters',
    tags: TAGS,
    summary: 'Available filter options',
    response: ok(schema.filtersSchema),
    handler: controller.filters,
  },
];

module.exports = routes;
