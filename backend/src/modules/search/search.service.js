'use strict';

const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const destinationsService = require('../destinations/destinations.service');
const geographyService = require('../geography/geography.service');

/**
 * Discovery across modules. Searchable types today: destinations and districts.
 * Properties, guides, experiences and packages join when their modules land (Phase 4).
 */
const SEARCH_TYPES = ['destination', 'district'];
const NEARBY_TYPES = ['destination'];
const UNIFIED_WINDOW = 500;
const NEARBY = { defaultKm: 25, maxKm: 300 };

const districtResult = (district) => ({
  type: 'district',
  id: district.id,
  name: district.name,
  slug: district.slug,
  region: district.region,
  location: district.location,
  rank: district.rank,
});

async function search({ q, type, district, region, category, page, limit }) {
  if (type === 'destination') {
    const { items, total } = await destinationsService.search({ q, district, region, category, page, limit });
    return { items: items.map((item) => ({ type: 'destination', ...item })), meta: pageMeta({ page, limit }, total) };
  }
  // Districts are not filterable by district/category, so a filtered search returns destinations only.
  const includeDistricts = !district && !category;
  if (type === 'district') {
    if (!includeDistricts) return { items: [], meta: pageMeta({ page, limit }, 0) };
    const districts = (await geographyService.searchDistricts({ q, limit: UNIFIED_WINDOW })).filter((d) => !region || d.region.slug === region);
    return { items: districts.slice((page - 1) * limit, page * limit).map(districtResult), meta: pageMeta({ page, limit }, districts.length) };
  }

  // Unified: merge the top of each ranked list, then page through the merged window.
  const window = page * limit;
  if (window > UNIFIED_WINDOW) {
    throw ApiError.validation([{ location: 'query', path: 'page', message: `unified search is limited to the first ${UNIFIED_WINDOW} results; filter by type to go further` }]);
  }
  const [destinations, districts] = await Promise.all([
    destinationsService.search({ q, district, region, category, page: 1, limit: window }),
    includeDistricts ? geographyService.searchDistricts({ q, limit: window }) : [],
  ]);
  const scopedDistricts = districts.filter((d) => !region || d.region.slug === region);
  const merged = [
    ...destinations.items.map((item) => ({ type: 'destination', ...item })),
    ...scopedDistricts.map(districtResult),
  ].sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));
  return {
    items: merged.slice((page - 1) * limit, window),
    meta: pageMeta({ page, limit }, Math.min(destinations.total + scopedDistricts.length, UNIFIED_WINDOW)),
  };
}

async function suggestions({ q, limit }) {
  const needle = q.toLowerCase();
  const [destinations, districts, categories] = await Promise.all([
    destinationsService.suggest({ q, limit }),
    geographyService.searchDistricts({ q, limit }),
    destinationsService.listPublicCategories(),
  ]);
  const districtNames = await geographyService.getDistrictRefMap(destinations.map((d) => d.district_id));
  return [
    ...destinations.map((d) => ({
      type: 'destination',
      id: d.id,
      name: d.name,
      slug: d.slug,
      subtitle: districtNames.get(d.district_id)?.name ?? null,
      rank: Number(d.rank) + (d.name.toLowerCase().startsWith(needle) ? 1 : 0),
    })),
    ...districts.map((d) => ({
      type: 'district',
      id: d.id,
      name: d.name,
      slug: d.slug,
      subtitle: d.region.name,
      rank: d.rank + (d.name.toLowerCase().startsWith(needle) ? 1 : 0),
    })),
    ...categories
      .filter((c) => c.name.toLowerCase().includes(needle))
      .map((c) => ({ type: 'category', id: c.id, name: c.name, slug: c.slug, subtitle: null, rank: c.name.toLowerCase().startsWith(needle) ? 1.5 : 0.5 })),
  ]
    .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ rank: _rank, ...item }) => item);
}

async function nearby({ latitude, longitude, radiusKm, page, limit }) {
  const { items, meta } = await destinationsService.nearPoint({ latitude, longitude, radiusKm, page, limit });
  return { items: items.map((item) => ({ type: 'destination', ...item })), meta };
}

async function filters() {
  const [regions, districts, facets] = await Promise.all([
    geographyService.listPublicRegions(),
    geographyService.listPublicDistricts({}),
    destinationsService.facets(),
  ]);
  return {
    types: SEARCH_TYPES,
    nearbyTypes: NEARBY_TYPES,
    regions: regions.map((region) => ({
      id: region.id,
      name: region.name,
      slug: region.slug,
      districts: districts
        .filter((district) => district.region.id === region.id)
        .map((district) => ({ id: district.id, name: district.name, slug: district.slug, destinationCount: facets.districtCounts.get(district.id) ?? 0 })),
    })),
    categories: facets.categories,
    sorts: ['name', '-name', 'publishedAt', '-publishedAt'],
    radiusKm: NEARBY,
  };
}

module.exports = { search, suggestions, nearby, filters, SEARCH_TYPES, NEARBY_TYPES, NEARBY };
