'use strict';

const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const destinationsService = require('../destinations/destinations.service');
const geographyService = require('../geography/geography.service');
const propertiesService = require('../properties/properties.service');
const guidesService = require('../guides/guides.service');
const experiencesService = require('../experiences/experiences.service');
const packagesService = require('../packages/packages.service');

/**
 * Discovery across modules: destinations (full-text), districts and partner supply
 * (name + trigram). Location/category filters apply to destinations only, so a
 * filtered search returns destinations only.
 */
const SUPPLY_SEARCH = {
  property: (args) => propertiesService.search(args),
  guide: (args) => guidesService.search(args),
  experience: (args) => experiencesService.search(args),
  package: (args) => packagesService.search(args),
};
const SEARCH_TYPES = ['destination', 'district', ...Object.keys(SUPPLY_SEARCH)];
const NEARBY = { defaultKm: 25, maxKm: 300 };
const NEARBY_SEARCH = {
  destination: (args) => destinationsService.nearPoint(args),
  property: (args) => propertiesService.nearPoint(args),
};
const NEARBY_TYPES = Object.keys(NEARBY_SEARCH);
const UNIFIED_WINDOW = 500;

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
  // Other types: ranked lists capped at a window, paged in memory.
  const window = page * limit;
  if (window > UNIFIED_WINDOW) {
    throw ApiError.validation([{ location: 'query', path: 'page', message: `this search is limited to the first ${UNIFIED_WINDOW} results` }]);
  }
  const filtered = Boolean(district || region || category);
  const nameOf = (item) => item.name ?? item.displayName;
  const fetchType = async (kind) => {
    if (kind === 'district') {
      if (district || category) return [];
      const districts = await geographyService.searchDistricts({ q, limit: window });
      return districts.filter((d) => !region || d.region.slug === region).map(districtResult);
    }
    if (filtered) return [];
    return (await SUPPLY_SEARCH[kind]({ q, limit: window })).map((item) => ({ type: kind, ...item }));
  };

  if (type) {
    const items = await fetchType(type);
    return { items: items.slice((page - 1) * limit, window), meta: pageMeta({ page, limit }, items.length) };
  }

  // Unified: merge the top of each ranked list, then page through the merged window.
  const [destinations, ...others] = await Promise.all([
    destinationsService.search({ q, district, region, category, page: 1, limit: window }),
    ...SEARCH_TYPES.filter((kind) => kind !== 'destination').map(fetchType),
  ]);
  const merged = [...destinations.items.map((item) => ({ type: 'destination', ...item })), ...others.flat()].sort(
    (a, b) => b.rank - a.rank || nameOf(a).localeCompare(nameOf(b)),
  );
  const otherTotal = others.reduce((total, list) => total + list.length, 0);
  return {
    items: merged.slice((page - 1) * limit, window),
    meta: pageMeta({ page, limit }, Math.min(destinations.total + otherTotal, UNIFIED_WINDOW)),
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

async function nearby({ latitude, longitude, radiusKm, type, page, limit }) {
  const { items, meta } = await NEARBY_SEARCH[type]({ latitude, longitude, radiusKm, page, limit });
  return { items: items.map((item) => ({ type, ...item })), meta };
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
