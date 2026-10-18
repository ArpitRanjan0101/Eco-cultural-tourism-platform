import { filterChips } from '@/components/navigation/ActiveFilterChips';
import SortSelector from '@/components/navigation/SortSelector';
import MapListToggle from '@/components/maps/MapListToggle';
import MapView from '@/components/maps/MapView';
import { toMapPlaces } from '@/components/maps/places';
import { getDestination } from '@/features/destinations/server/destinations.server';
import { districtOptions, geographyLabels } from '@/features/geography/adapters/geography.adapter';
import { parsePropertyQuery, PropertyCard, propertySortOptions, propertyTypeOptions, PROPERTY_TYPE_LABELS } from '@/features/properties';
import { listProperties } from '@/features/properties/server/properties.server';
import { getSearchFilters } from '@/features/search/server/search.server';
import { SupplyFilters, SupplyListing, SupplyResults } from '@/features/supply';

const PATH = '/stays';

export async function generateMetadata({ searchParams }) {
  const { params } = parsePropertyQuery(await searchParams);
  return {
    title: 'Places to stay',
    description: 'Hotels, homestays, eco lodges and camps across Jharkhand, with live availability from local hosts.',
    alternates: { canonical: PATH },
    robots: Object.keys(params).some((key) => key !== 'page') ? { index: false, follow: true } : undefined,
  };
}

// Published stays: URL-driven filters (name, district, type, destination), API sorts, list/map, pagination.
export default async function StaysPage({ searchParams }) {
  const { params, query } = parsePropertyQuery(await searchParams);
  const [result, filters, destination] = await Promise.all([listProperties(query), getSearchFilters(), params.destination ? getDestination(params.destination) : null]);
  const regions = filters?.regions ?? [];
  const labels = geographyLabels({ regions });
  const chips = filterChips(PATH, params, [
    params.q && { key: 'q', label: `“${params.q}”` },
    params.district && { key: 'district', label: labels.district(params.district) },
    params.propertyType && { key: 'propertyType', label: PROPERTY_TYPE_LABELS[params.propertyType] },
    params.destination && { key: 'destination', label: `Near ${destination?.name ?? params.destination}` },
  ]);
  const places = toMapPlaces(result.data, { href: (item) => `${PATH}/${item.slug}`, subtitle: (item) => item.district?.name ?? null });
  const results = <SupplyResults items={result.data} renderItem={(item) => <PropertyCard property={item} />} label="Stay results" noun="stays" filtered={chips.length > 0} clearHref={PATH} />;

  return (
    <SupplyListing
      title="Places to stay"
      description="Hotels, homestays, eco lodges and camps run by local hosts."
      pathname={PATH}
      params={params}
      meta={result.meta}
      noun={['stay', 'stays']}
      chips={chips}
      filters={
        <SupplyFilters
          label="Filter stays"
          action={PATH}
          values={params}
          selects={[
            { name: 'district', label: 'District', placeholder: 'All districts', options: districtOptions(regions) },
            { name: 'propertyType', label: 'Type of stay', placeholder: 'All types', options: propertyTypeOptions() },
          ]}
        />
      }
      sort={<SortSelector options={propertySortOptions()} value={params.sort ?? 'name'} params={params} action={PATH} />}
    >
      <MapListToggle canShowMap={places.length > 0} list={results} map={<MapView places={places} label="Map of stay results" height="lg" />} />
    </SupplyListing>
  );
}
