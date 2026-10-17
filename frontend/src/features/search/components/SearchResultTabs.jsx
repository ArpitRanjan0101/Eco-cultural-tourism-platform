import Link from 'next/link';
import { cx } from '@/lib/cx';
import { hrefWith } from '@/lib/url/query';
import { TYPE_LABELS } from '../schemas/searchQuery';

/**
 * Result type selection as links (URL state; "All" clears the type). Types come from /search/filters. When a
 * location/category filter is active only destinations (and districts, for region) can match, so other types are
 * shown as unavailable instead of offering empty tabs.
 * @param {{ types: string[], active?: string, params: Record<string,string>, filtered: boolean }} props
 */
export default function SearchResultTabs({ types, active, params, filtered }) {
  const filterLimited = (type) => filtered && !['destination', 'district'].includes(type);
  return (
    <nav aria-label="Result types" className="overflow-x-auto">
      <ul className="flex gap-1 border-b border-border">
        {[null, ...types].map((type) => {
          const current = (type ?? undefined) === (active || undefined);
          const label = type ? (TYPE_LABELS[type] ?? type) : 'All results';
          if (type && filterLimited(type)) {
            return (
              <li key={type}>
                <span aria-disabled="true" title="Location and category filters apply to destinations only" className="block whitespace-nowrap border-b-2 border-transparent px-4 py-2 text-sm text-muted opacity-60">
                  {label}
                </span>
              </li>
            );
          }
          return (
            <li key={type ?? 'all'}>
              <Link
                href={hrefWith('/search', params, { type: type ?? null })}
                aria-current={current ? 'page' : undefined}
                className={cx(
                  '-mb-px block whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                  current ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text',
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
