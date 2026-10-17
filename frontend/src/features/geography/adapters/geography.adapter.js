// View-model helpers over the /search/filters geography tree and category list (API DTOs → UI options/labels).

/** District <select> options from the regions tree: "District (Region)", value = district slug. */
export function districtOptions(regions = []) {
  return regions.flatMap((region) => region.districts.map((district) => ({ value: district.slug, label: `${district.name} (${region.name})` })));
}

/** Region <select> options. */
export function regionOptions(regions = []) {
  return regions.map((region) => ({ value: region.slug, label: region.name }));
}

/** Category <select> options. */
export function categoryOptions(categories = []) {
  return categories.map((category) => ({ value: category.slug, label: category.name }));
}

/** Display names for slugs in the URL, falling back to the slug when the API no longer lists it. */
export function geographyLabels({ regions = [], categories = [] } = {}) {
  const districts = new Map(regions.flatMap((region) => region.districts).map((district) => [district.slug, district.name]));
  const regionNames = new Map(regions.map((region) => [region.slug, region.name]));
  const categoryNames = new Map(categories.map((category) => [category.slug, category.name]));
  return {
    district: (slug) => districts.get(slug) ?? slug,
    region: (slug) => regionNames.get(slug) ?? slug,
    category: (slug) => categoryNames.get(slug) ?? slug,
  };
}
