import { notFound } from 'next/navigation';
import Container from '@/components/layout/Container';
import { parseDestinationQuery } from '@/features/destinations';
import { DistrictDestinationList, DistrictHero } from '@/features/geography';
import { getCategories, getDistrict, getDistrictDestinations } from '@/features/geography/server/geography.server';
import { getSearchFilters } from '@/features/search/server/search.server';

// Inside a district only these list filters apply (GET /districts/:slug/destinations).
const DISTRICT_FILTERS = ['page', 'q', 'category', 'featured', 'sort'];

export async function generateMetadata({ params }) {
  const district = await getDistrict((await params).slug);
  if (!district) return {};
  return {
    title: `${district.name} district`,
    description: district.description ?? `Places to visit in ${district.name}, ${district.region.name}, Jharkhand.`,
    alternates: { canonical: `/districts/${district.slug}` },
  };
}

export default async function DistrictPage({ params, searchParams }) {
  const district = await getDistrict((await params).slug);
  if (!district) notFound();
  const { params: filterParams, query } = parseDestinationQuery(await searchParams, DISTRICT_FILTERS);
  const [result, categories, filters] = await Promise.all([getDistrictDestinations(district.slug, query), getCategories(), getSearchFilters()]);
  return (
    <Container className="pb-12">
      <DistrictHero district={district} />
      <DistrictDestinationList district={district} result={result ?? { data: [], meta: { page: 1, limit: 0, total: 0 } }} params={filterParams} categories={categories} sorts={filters?.sorts} />
    </Container>
  );
}
