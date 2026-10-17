import ActiveFilterChips from '@/components/navigation/ActiveFilterChips';
import Container from '@/components/layout/Container';
import PageHeader from '@/components/layout/PageHeader';
import Breadcrumbs from '@/components/navigation/Breadcrumbs';
import {
  FilterSidebar,
  GlobalSearch,
  MobileFilterDrawer,
  parseSearchQuery,
  SearchEmptyState,
  SearchFilterForm,
  SearchPagination,
  SearchResults,
  SearchResultTabs,
  TYPE_LABELS,
} from '@/features/search';
import { getSearchFilters, runSearch } from '@/features/search/server/search.server';
import { hrefWith } from '@/lib/url/query';

export async function generateMetadata({ searchParams }) {
  const { params } = parseSearchQuery(await searchParams);
  // Result pages are never indexed (endless permutations); the empty search page may be.
  return { title: params.q ? `Search: ${params.q}` : 'Search', robots: params.q ? { index: false, follow: true } : undefined };
}

// Unified search: URL state (q, type, region, district, category, page) → GET /search, server-rendered.
export default async function SearchPage({ searchParams }) {
  const state = parseSearchQuery(await searchParams);
  const { params, query, filtered, maxPage } = state;
  const [filters, result] = await Promise.all([getSearchFilters(), query ? runSearch(query) : null]);
  const regions = filters?.regions ?? [];
  const districtName = regions.flatMap((region) => region.districts).find((district) => district.slug === params.district)?.name;
  const regionName = regions.find((region) => region.slug === params.region)?.name;
  const categoryName = filters?.categories.find((category) => category.slug === params.category)?.name;
  const chips = [
    params.region && { key: 'region', label: regionName ?? params.region },
    params.district && { key: 'district', label: districtName ?? params.district },
    params.category && { key: 'category', label: categoryName ?? params.category },
  ]
    .filter(Boolean)
    .map((chip) => ({ ...chip, removeHref: hrefWith('/search', params, { [chip.key]: null }) }));
  const clearHref = hrefWith('/search', { q: params.q, type: params.type });
  const activeCount = chips.length;
  const typeLabel = params.type ? TYPE_LABELS[params.type] : null;

  let body;
  if (!params.q) body = <SearchEmptyState reason={state.qTooShort ? 'too-short' : 'no-query'} />;
  else if (!result.data.length) body = <SearchEmptyState q={params.q} filtered={filtered} clearHref={clearHref} />;
  else {
    body = (
      <>
        <SearchResults items={result.data} label={`Results for ${params.q}`} />
        <SearchPagination params={params} meta={result.meta} maxPage={maxPage} />
      </>
    );
  }

  return (
    <Container className="pb-12">
      <PageHeader title="Search" breadcrumbs={<Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Search' }]} />} />
      <div className="flex flex-col gap-6">
        <GlobalSearch key={params.q ?? ''} defaultValue={params.q ?? ''} hidden={params.type ? { type: params.type } : {}} />
        {params.q && filters ? <SearchResultTabs types={filters.types} active={params.type} params={params} filtered={filtered} /> : null}
        <div className={filters ? 'grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]' : ''}>
          {filters ? <FilterSidebar filters={filters} params={params} /> : null}
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {params.q && result ? (
                <p className="text-sm text-muted" aria-live="polite">
                  {`${result.meta.total} ${result.meta.total === 1 ? 'result' : 'results'} for “${params.q}”${typeLabel ? ` in ${typeLabel}` : ''}`}
                </p>
              ) : (
                <span />
              )}
              {filters ? (
                <MobileFilterDrawer activeCount={activeCount}>
                  <SearchFilterForm filters={filters} params={params} idPrefix="drawer" />
                </MobileFilterDrawer>
              ) : null}
            </div>
            <ActiveFilterChips chips={chips} clearHref={clearHref} />
            {body}
          </div>
        </div>
      </div>
    </Container>
  );
}
