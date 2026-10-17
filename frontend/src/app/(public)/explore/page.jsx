import CardGrid from '@/components/data-display/CardGrid';
import Container from '@/components/layout/Container';
import PageHeader from '@/components/layout/PageHeader';
import Section from '@/components/layout/Section';
import Breadcrumbs from '@/components/navigation/Breadcrumbs';
import { DestinationGrid } from '@/features/destinations';
import { getFeaturedDestinations } from '@/features/destinations/server/destinations.server';
import { CategoryCard, RegionCard } from '@/features/geography';
import { getRegions } from '@/features/geography/server/geography.server';
import { GlobalSearch, NearMeExplorer } from '@/features/search';
import { getSearchFilters } from '@/features/search/server/search.server';

export const metadata = {
  title: 'Explore Jharkhand',
  description: 'Browse Jharkhand by type of place, by region, near you, or search for somewhere specific.',
  alternates: { canonical: '/explore' },
};

// Discovery hub: search, types of place (with live counts), regions, featured places and "near me".
export default async function ExplorePage() {
  const [filters, regions, featured] = await Promise.all([getSearchFilters(), getRegions(), getFeaturedDestinations(6)]);
  const categories = (filters?.categories ?? []).filter((category) => category.count > 0);
  return (
    <>
      <Container>
        <PageHeader
          title="Explore Jharkhand"
          description="Find waterfalls, forests, hills, heritage and living culture — by type, by region, or near you."
          breadcrumbs={<Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Explore' }]} />}
        />
        <GlobalSearch />
      </Container>
      {categories.length ? (
        <Section id="types" title="Types of places">
          <ul aria-label="Types of places" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((category) => (
              <li key={category.id}>
                <CategoryCard category={category} count={category.count} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {regions.length ? (
        <Section id="regions" title="Regions" tone="muted">
          <CardGrid items={regions} getKey={(region) => region.id} columns={3} label="Regions" renderItem={(region) => <RegionCard region={region} />} />
        </Section>
      ) : null}
      {featured.length ? (
        <Section id="featured" title="Featured places">
          <DestinationGrid destinations={featured} label="Featured places" />
        </Section>
      ) : null}
      {filters ? (
        <Section id="near-me" title="Near you" description="Share your location to see published places around you. Your location is used only for this search.">
          <NearMeExplorer nearbyTypes={filters.nearbyTypes} radius={filters.radiusKm} />
        </Section>
      ) : null}
    </>
  );
}
