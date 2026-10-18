import { filterChips } from '@/components/navigation/ActiveFilterChips';
import SortSelector from '@/components/navigation/SortSelector';
import { getDestination } from '@/features/destinations/server/destinations.server';
import { PackageCard, packageSortOptions, parsePackageQuery } from '@/features/packages';
import { listPackages } from '@/features/packages/server/packages.server';
import { SupplyFilters, SupplyListing, SupplyResults } from '@/features/supply';

const PATH = '/packages';

export async function generateMetadata({ searchParams }) {
  const { params } = parsePackageQuery(await searchParams);
  return {
    title: 'Tour packages',
    description: 'Multi-day tours across Jharkhand with itineraries, inclusions and live departure availability.',
    alternates: { canonical: PATH },
    robots: Object.keys(params).some((key) => key !== 'page') ? { index: false, follow: true } : undefined,
  };
}

// Published packages: URL-driven filters (name, destination), API sorts, pagination.
export default async function PackagesPage({ searchParams }) {
  const { params, query } = parsePackageQuery(await searchParams);
  const [result, destination] = await Promise.all([listPackages(query), params.destination ? getDestination(params.destination) : null]);
  const chips = filterChips(PATH, params, [
    params.q && { key: 'q', label: `“${params.q}”` },
    params.destination && { key: 'destination', label: `Visits ${destination?.name ?? params.destination}` },
  ]);

  return (
    <SupplyListing
      title="Tour packages"
      description="Multi-day journeys planned by local operators, with fixed departures."
      pathname={PATH}
      params={params}
      meta={result.meta}
      noun={['package', 'packages']}
      chips={chips}
      filters={<SupplyFilters label="Filter packages" action={PATH} values={params} />}
      sort={<SortSelector options={packageSortOptions()} value={params.sort ?? 'nextDeparture'} params={params} action={PATH} />}
    >
      <SupplyResults items={result.data} renderItem={(item) => <PackageCard pkg={item} />} label="Package results" noun="packages" filtered={chips.length > 0} clearHref={PATH} />
    </SupplyListing>
  );
}
