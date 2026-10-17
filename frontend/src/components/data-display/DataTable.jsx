'use client';

import { SortIcon, ChevronDownIcon, ChevronUpIcon } from '@/components/ui/icons';
import Skeleton from '@/components/ui/Skeleton';
import { cx } from '@/lib/cx';

const ALIGN = { start: 'text-left', center: 'text-center', end: 'text-right' };

/**
 * Accessible data table for admin/partner lists. Sorting is delegated (`onSortChange`), matching the API's
 * sort allowlists; nothing is sorted client-side. Scrolls horizontally on narrow screens.
 * @param {{ caption: string, columns: Array<{ key: string, header: string, cell?: (row) => React.ReactNode,
 *   sortable?: boolean, align?: 'start'|'center'|'end', className?: string }>, rows: Array<object>,
 *   getRowKey: (row) => string, sort?: { key: string, direction: 'asc'|'desc' },
 *   onSortChange?: (sort) => void, loading?: boolean, loadingRows?: number, emptyState?: React.ReactNode,
 *   hideCaption?: boolean, className?: string }} props
 */
export default function DataTable({ caption, columns, rows, getRowKey, sort, onSortChange, loading = false, loadingRows = 5, emptyState, hideCaption = false, className }) {
  const nextSort = (key) => ({ key, direction: sort?.key === key && sort.direction === 'asc' ? 'desc' : 'asc' });

  let body;
  if (loading) {
    body = Array.from({ length: loadingRows }, (_, index) => (
      <tr key={`loading-${index}`}>
        {columns.map((column) => (
          <td key={column.key} className="px-4 py-3">
            <Skeleton shape="text" />
          </td>
        ))}
      </tr>
    ));
  } else if (rows.length === 0) {
    body = (
      <tr>
        <td colSpan={columns.length} className="px-4 py-8">
          {emptyState ?? <p className="text-center text-sm text-muted">No records found.</p>}
        </td>
      </tr>
    );
  } else {
    body = rows.map((row) => (
      <tr key={getRowKey(row)} className="border-t border-border hover:bg-surface-muted/60">
        {columns.map((column) => (
          <td key={column.key} className={cx('px-4 py-3 align-top text-sm', ALIGN[column.align ?? 'start'], column.className)}>
            {column.cell ? column.cell(row) : row[column.key]}
          </td>
        ))}
      </tr>
    ));
  }

  return (
    <div role="region" aria-label={caption} tabIndex={0} className={cx('w-full overflow-x-auto rounded-lg border border-border bg-surface-raised focus-visible:outline-2 focus-visible:outline-focus', className)}>
      <table className="w-full border-collapse" aria-busy={loading || undefined}>
        <caption className={cx('px-4 py-3 text-left text-sm font-semibold', hideCaption && 'sr-only')}>{caption}</caption>
        <thead className="bg-surface-muted">
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key;
              const ariaSort = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : column.sortable ? 'none' : undefined;
              const Icon = active ? (sort.direction === 'asc' ? ChevronUpIcon : ChevronDownIcon) : SortIcon;
              return (
                <th key={column.key} scope="col" aria-sort={ariaSort} className={cx('px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted', ALIGN[column.align ?? 'start'])}>
                  {column.sortable && onSortChange ? (
                    <button type="button" onClick={() => onSortChange(nextSort(column.key))} className="inline-flex items-center gap-1 rounded-sm uppercase hover:text-text focus-visible:outline-2 focus-visible:outline-focus">
                      {column.header}
                      <Icon className="size-3.5" />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );
}
