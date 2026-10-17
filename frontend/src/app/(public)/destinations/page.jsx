import ActiveFilterChips from '@/components/navigation/ActiveFilterChips';
import Container from '@/components/layout/Container';
import PageHeader from '@/components/layout/PageHeader';
import Breadcrumbs from '@/components/navigation/Breadcrumbs';
import ResultsPagination from '@/components/navigation/ResultsPagination';
import MapListToggle from '@/components/maps/MapListToggle';
import MapView from '@/components/maps/MapView';
import { toMapPlaces } from '@/components/maps/places';
import { DestinationFilters, DestinationGrid, DestinationSort, parseDestinationQuery } from '@/features/destinations';
import { listDestinations } from '@/features/destinations/server/destinations.server';
import { getCategories } from '@/features/geography/server/geography.server';
import { getSearchFilters } from '@/features/search/server/search.server';
import { hrefWith } from '@/lib/url/query';

const PATH = '/destinations';

export async function generateMetadata({ searchParams }) {
  const { params } = parseDestinationQuery(await searchParams);
  const filtered = Object.keys(params).some((key) => key !== 'page');
  return {
    title: 'Destinations',
    description: 'Waterfalls, forests, hills and heritage sites across Jharkhand — filter by district, region and type.',
    alternates: { canonical: PATH },
    // Filtered permutations are not separate pages for search engines.
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

// Published destinations with URL-driven filters, supported sorts, list/map view and pagination.
export default async function DestinationsPage({ searchParams }) {
  const { params, query } = parseDestinationQuery(await searchParams);
  const [result, filters, categories] = await Promise.all([listDestinations(query), getSearchFilters(), getCategories()]);
  const regions = filters?.regions ?? [];
  const districtName = regions.flatMap((region) => region.districts).find((district) => district.slug === params.district)?.name;
  const regionName = regions.find((region) => region.slug === params.region)?.name;
  const categoryName = categories.find((category) => category.slug === params.category)?.name;
  const chips = [
    params.q && { key: 'q', label: `“${params.q}”` },
    params.district && { key: 'district', label: districtName ?? params.district },
    params.region && { key: 'region', label: regionName ?? params.region },
    params.category && { key: 'category', label: categoryName ?? params.category },
    params.featured && { key: 'featured', label: 'Featured' },
  ]
    .filter(Boolean)
    .map((chip) => ({ ...chip, removeHref: hrefWith(PATH, params, { [chip.key]: null }) }));
  const places = toMapPlaces(result.data, { href: (item) => `${PATH}/${item.slug}`, subtitle: (item) => item.district?.name ?? null });

  return (
    <Container className="pb-12">
      <PageHeader
        title="Destinations"
        description="Waterfalls, forests, hills and heritage sites across Jharkhand."
        breadcrumbs={<Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Destinations' }]} />}
      />
      <div className="flex flex-col gap-5">
        <DestinationFilters action={PATH} values={params} regions={regions} categories={categories} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-muted" aria-live="polite">{`${result.meta.total} ${result.meta.total === 1 ? 'destination' : 'destinations'}`}</p>
          <DestinationSort advertised={filters?.sorts} value={params.sort} params={params} action={PATH} />
        </div>
        <ActiveFilterChips chips={chips} clearHref={PATH} />
        <MapListToggle
          canShowMap={places.length > 0}
          list={<DestinationGrid destinations={result.data} label="Destination results" />}
          map={<MapView places={places} label="Map of destination results" height="lg" />}
        />
        <ResultsPagination pathname={PATH} params={params} meta={result.meta} label="Destination pages" />
      </div>
    </Container>
  );
}
