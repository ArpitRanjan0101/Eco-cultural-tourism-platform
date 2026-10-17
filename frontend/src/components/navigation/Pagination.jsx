import Link from 'next/link';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons';
import { cx } from '@/lib/cx';

/** Page numbers to show: first, last, current ± `siblings`, with 'gap' markers. */
export function pageWindow(page, totalPages, siblings = 1) {
  const pages = new Set([1, totalPages]);
  for (let p = page - siblings; p <= page + siblings; p += 1) if (p >= 1 && p <= totalPages) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, index) => (index > 0 && p - sorted[index - 1] > 1 ? ['gap', p] : [p]));
}

const ITEM = 'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm focus-visible:outline-2 focus-visible:outline-focus';

/**
 * Link-based pagination (URL state, LLD §6) matching the API's `meta.{page,limit,total}`.
 * @param {{ page: number, pageSize: number, total: number, hrefFor: (page: number) => string,
 *   label?: string, showSummary?: boolean, className?: string }} props
 * Renders nothing when everything fits on one page.
 */
export default function Pagination({ page, pageSize, total, hrefFor, label = 'Pagination', showSummary = true, className }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const current = Math.min(Math.max(1, page), totalPages);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  const edge = (target, text, Icon, iconFirst) =>
    target ? (
      <Link href={hrefFor(target)} className={cx(ITEM, 'gap-1 hover:bg-surface-muted')} rel={iconFirst ? 'prev' : 'next'}>
        {iconFirst ? <Icon /> : null}
        {text}
        {iconFirst ? null : <Icon />}
      </Link>
    ) : (
      <span aria-disabled="true" className={cx(ITEM, 'gap-1 text-muted opacity-60')}>
        {iconFirst ? <Icon /> : null}
        {text}
        {iconFirst ? null : <Icon />}
      </span>
    );

  return (
    <nav aria-label={label} className={cx('flex flex-col items-center gap-2 sm:flex-row sm:justify-between', className)}>
      {showSummary ? (
        <p className="text-sm text-muted">
          Showing {from}–{to} of {total}
        </p>
      ) : null}
      <ul className="flex flex-wrap items-center gap-1">
        <li>{edge(current > 1 ? current - 1 : null, 'Previous', ChevronLeftIcon, true)}</li>
        {pageWindow(current, totalPages).map((item, index) =>
          item === 'gap' ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-muted">
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={hrefFor(item)}
                aria-current={item === current ? 'page' : undefined}
                aria-label={`Page ${item}`}
                className={cx(ITEM, item === current ? 'bg-primary font-semibold text-on-primary' : 'hover:bg-surface-muted')}
              >
                {item}
              </Link>
            </li>
          ),
        )}
        <li>{edge(current < totalPages ? current + 1 : null, 'Next', ChevronRightIcon, false)}</li>
      </ul>
    </nav>
  );
}
