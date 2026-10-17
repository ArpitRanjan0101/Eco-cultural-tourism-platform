import { hrefWith } from '@/lib/url/query';
import Pagination from './Pagination';

/**
 * Pagination that keeps the current URL filters. `maxPage` caps navigation where the backend limits paging
 * (e.g. unified search's first 500 results).
 * @param {{ pathname: string, params: Record<string,string>, meta: { page: number, limit: number, total: number },
 *   maxPage?: number, label?: string }} props
 */
export default function ResultsPagination({ pathname, params, meta, maxPage, label = 'Results pages' }) {
  if (!meta?.limit) return null;
  const total = maxPage ? Math.min(meta.total, maxPage * meta.limit) : meta.total;
  return <Pagination page={meta.page} pageSize={meta.limit} total={total} label={label} hrefFor={(page) => hrefWith(pathname, params, { page })} className="mt-8" />;
}
