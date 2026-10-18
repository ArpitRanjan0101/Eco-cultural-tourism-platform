import { filterChips } from '@/components/navigation/ActiveFilterChips';
import SortSelector from '@/components/navigation/SortSelector';
import { getDestination } from '@/features/destinations/server/destinations.server';
import { GuideCard, guideSortOptions, parseGuideQuery } from '@/features/guides';
import { getLanguages, listGuides } from '@/features/guides/server/guides.server';
import { SupplyFilters, SupplyListing, SupplyResults } from '@/features/supply';

const PATH = '/guides';

export async function generateMetadata({ searchParams }) {
  const { params } = parseGuideQuery(await searchParams);
  return {
    title: 'Local guides',
    description: 'Verified local guides across Jharkhand: languages, experience, services and open dates.',
    alternates: { canonical: PATH },
    robots: Object.keys(params).some((key) => key !== 'page') ? { index: false, follow: true } : undefined,
  };
}

// Verified guides: URL-driven filters (name, language, destination), API sorts, pagination.
export default async function GuidesPage({ searchParams }) {
  const { params, query } = parseGuideQuery(await searchParams);
  const [result, languages, destination] = await Promise.all([listGuides(query), getLanguages(), params.destination ? getDestination(params.destination) : null]);
  const languageName = languages.find((language) => language.code === params.language)?.name;
  const chips = filterChips(PATH, params, [
    params.q && { key: 'q', label: `“${params.q}”` },
    params.language && { key: 'language', label: `Speaks ${languageName ?? params.language}` },
    params.destination && { key: 'destination', label: `At ${destination?.name ?? params.destination}` },
  ]);

  return (
    <SupplyListing
      title="Local guides"
      description="Verified guides who know Jharkhand’s forests, villages and festivals first-hand."
      pathname={PATH}
      params={params}
      meta={result.meta}
      noun={['guide', 'guides']}
      chips={chips}
      filters={
        <SupplyFilters
          label="Filter guides"
          action={PATH}
          values={params}
          searchLabel="Search by guide name"
          selects={[{ name: 'language', label: 'Language', placeholder: 'Any language', options: languages.map((language) => ({ value: language.code, label: language.name })) }]}
        />
      }
      sort={<SortSelector options={guideSortOptions()} value={params.sort ?? 'displayName'} params={params} action={PATH} />}
    >
      <SupplyResults items={result.data} renderItem={(item) => <GuideCard guide={item} />} label="Guide results" noun="guides" filtered={chips.length > 0} clearHref={PATH} columns={4} />
    </SupplyListing>
  );
}
