import { filterChips } from '@/components/navigation/ActiveFilterChips';
import SortSelector from '@/components/navigation/SortSelector';
import { getDestination } from '@/features/destinations/server/destinations.server';
import { ExperienceCard, experienceSortOptions, parseExperienceQuery } from '@/features/experiences';
import { listExperiences } from '@/features/experiences/server/experiences.server';
import { SupplyFilters, SupplyListing, SupplyResults } from '@/features/supply';

const PATH = '/experiences';

export async function generateMetadata({ searchParams }) {
  const { params } = parseExperienceQuery(await searchParams);
  return {
    title: 'Experiences',
    description: 'Tribal art walks, village stays, forest treks and festival evenings across Jharkhand — with live session availability.',
    alternates: { canonical: PATH },
    robots: Object.keys(params).some((key) => key !== 'page') ? { index: false, follow: true } : undefined,
  };
}

// Published experiences: URL-driven filters (name, destination), API sorts, pagination.
export default async function ExperiencesPage({ searchParams }) {
  const { params, query } = parseExperienceQuery(await searchParams);
  const [result, destination] = await Promise.all([listExperiences(query), params.destination ? getDestination(params.destination) : null]);
  const chips = filterChips(PATH, params, [
    params.q && { key: 'q', label: `“${params.q}”` },
    params.destination && { key: 'destination', label: `At ${destination?.name ?? params.destination}` },
  ]);

  return (
    <SupplyListing
      title="Experiences"
      description="Cultural and nature experiences hosted by local operators."
      pathname={PATH}
      params={params}
      meta={result.meta}
      noun={['experience', 'experiences']}
      chips={chips}
      filters={<SupplyFilters label="Filter experiences" action={PATH} values={params} />}
      sort={<SortSelector options={experienceSortOptions()} value={params.sort ?? 'nextSessionAt'} params={params} action={PATH} />}
    >
      <SupplyResults items={result.data} renderItem={(item) => <ExperienceCard experience={item} />} label="Experience results" noun="experiences" filtered={chips.length > 0} clearHref={PATH} />
    </SupplyListing>
  );
}
