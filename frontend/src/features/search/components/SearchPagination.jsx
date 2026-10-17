import ResultsPagination from '@/components/navigation/ResultsPagination';

/** Search result pages, keeping q/type/filters and respecting the backend's 500-result window (`maxPage`). */
export default function SearchPagination({ params, meta, maxPage }) {
  return <ResultsPagination pathname="/search" params={params} meta={meta} maxPage={maxPage} label="Search result pages" />;
}
