import ActiveFilterChips from '@/components/navigation/ActiveFilterChips';
import Container from '@/components/layout/Container';
import PageHeader from '@/components/layout/PageHeader';
import Breadcrumbs from '@/components/navigation/Breadcrumbs';
import ResultsPagination from '@/components/navigation/ResultsPagination';

/**
 * Shared layout of the catalogue list pages: header, filters, live result count, sort, active-filter chips,
 * results and filter-preserving pagination.
 * @param {{ title: string, description: string, pathname: string, params: Record<string,string>,
 *   meta: { page: number, limit: number, total: number }, noun: [string, string], filters: React.ReactNode,
 *   sort: React.ReactNode, chips: Array<object>, children: React.ReactNode }} props
 *   `noun` = [singular, plural] for the count ("1 stay", "3 stays").
 */
export default function SupplyListing({ title, description, pathname, params, meta, noun, filters, sort, chips, children }) {
  return (
    <Container className="pb-12">
      <PageHeader title={title} description={description} breadcrumbs={<Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: title }]} />} />
      <div className="flex flex-col gap-5">
        {filters}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-muted" aria-live="polite">{`${meta.total} ${meta.total === 1 ? noun[0] : noun[1]}`}</p>
          {sort}
        </div>
        <ActiveFilterChips chips={chips} clearHref={pathname} />
        {children}
        <ResultsPagination pathname={pathname} params={params} meta={meta} label={`${title} pages`} />
      </div>
    </Container>
  );
}
