import Container from '@/components/layout/Container';
import PageHeader from '@/components/layout/PageHeader';
import Breadcrumbs from '@/components/navigation/Breadcrumbs';
import MapListToggle from '@/components/maps/MapListToggle';
import MapView from '@/components/maps/MapView';
import { toMapPlaces } from '@/components/maps/places';
import { DistrictGrid, RegionFilter } from '@/features/geography';
import { getDistricts, getRegions } from '@/features/geography/server/geography.server';
import { firstValue, hrefWith } from '@/lib/url/query';

export const metadata = {
  title: 'Districts',
  description: 'All districts of Jharkhand by region — find places to visit in each.',
  alternates: { canonical: '/districts' },
};

// District directory, filterable by region (URL state), with a map of district locations.
export default async function DistrictsPage({ searchParams }) {
  const regions = await getRegions();
  const requested = firstValue((await searchParams).region);
  const region = regions.find((item) => item.slug === requested);
  const districts = await getDistricts(region?.slug);
  const places = toMapPlaces(districts, { href: (district) => `/districts/${district.slug}`, subtitle: (district) => district.region?.name ?? null });

  return (
    <Container className="pb-12">
      <PageHeader
        title={region ? `Districts of ${region.name}` : 'Districts of Jharkhand'}
        description={region?.description ?? 'Choose a district to see its waterfalls, forests, heritage sites and more.'}
        breadcrumbs={<Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Districts', href: region ? '/districts' : undefined }, ...(region ? [{ label: region.name }] : [])]} />}
      />
      <div className="flex flex-col gap-6">
        <RegionFilter regions={regions} value={region?.slug} hrefFor={(slug) => hrefWith('/districts', {}, slug ? { region: slug } : {})} />
        <MapListToggle
          canShowMap={places.length > 0}
          list={<DistrictGrid districts={districts} label={region ? `Districts of ${region.name}` : 'All districts'} />}
          map={<MapView places={places} label="Map of districts" height="lg" />}
        />
      </div>
    </Container>
  );
}
