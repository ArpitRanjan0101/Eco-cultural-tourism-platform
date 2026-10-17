import ActiveFilterChips from '@/components/navigation/ActiveFilterChips';
import ResultsPagination from '@/components/navigation/ResultsPagination';
import MapListToggle from '@/components/maps/MapListToggle';
import MapView from '@/components/maps/MapView';
import { toMapPlaces } from '@/components/maps/places';
import { DestinationFilters, DestinationGrid, DestinationSort } from '@/features/destinations';
import { hrefWith } from '@/lib/url/query';

/**
 * A district's published attractions (GET /districts/:slug/destinations): category/featured/name filters,
 * supported sorts, list/map toggle and filter-preserving pagination.
 * @param {{ district: { name: string, slug: string }, result: { data: Array<object>, meta: object },
 *   params: Record<string,string>, categories: Array<object>, sorts?: string[] }} props
 */
export default function DistrictDestinationList({ district, result, params, categories, sorts }) {
  const pathname = `/districts/${district.slug}`;
  const categoryName = categories.find((category) => category.slug === params.category)?.name;
  const chips = [
    params.q ? { key: 'q', label: `“${params.q}”`, removeHref: hrefWith(pathname, params, { q: null }) } : null,
    params.category ? { key: 'category', label: categoryName ?? params.category, removeHref: hrefWith(pathname, params, { category: null }) } : null,
    params.featured ? { key: 'featured', label: 'Featured', removeHref: hrefWith(pathname, params, { featured: null }) } : null,
  ].filter(Boolean);
  const places = toMapPlaces(result.data, { href: (item) => `/destinations/${item.slug}` });

  return (
    <section aria-labelledby="district-places-heading" className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <h2 id="district-places-heading" className="text-2xl font-semibold">
          {`Places to visit in ${district.name}`}
          <span className="ml-2 font-sans text-base font-normal text-muted">({result.meta.total})</span>
        </h2>
        <DestinationSort advertised={sorts} value={params.sort} params={params} action={pathname} />
      </div>
      <DestinationFilters action={pathname} values={params} regions={[]} categories={categories} showLocation={false} />
      <ActiveFilterChips chips={chips} clearHref={pathname} />
      <MapListToggle
        canShowMap={places.length > 0}
        list={<DestinationGrid destinations={result.data} label={`Places in ${district.name}`} emptyDescription="No published places match these filters in this district." />}
        map={<MapView places={places} label={`Map of places in ${district.name}`} height="lg" />}
      />
      <ResultsPagination pathname={pathname} params={params} meta={result.meta} />
    </section>
  );
}
