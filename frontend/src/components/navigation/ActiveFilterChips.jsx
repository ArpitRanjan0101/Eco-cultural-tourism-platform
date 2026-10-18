import Link from 'next/link';
import { CloseIcon } from '@/components/ui/icons';
import { hrefWith } from '@/lib/url/query';

/**
 * Chips for the filters that are set: `[{ key, label }]` (falsy entries skipped) → chips whose links drop that
 * one filter and keep the rest.
 * @param {string} pathname @param {Record<string,string>} params @param {Array<{ key: string, label: string }|false|null|undefined>} entries
 */
export function filterChips(pathname, params, entries) {
  return entries.filter(Boolean).map((chip) => ({ ...chip, removeHref: hrefWith(pathname, params, { [chip.key]: null }) }));
}

/**
 * Applied filters as removable chips (each a link to the same list without that filter) plus "Clear all".
 * @param {{ chips: Array<{ key: string, label: string, removeHref: string }>, clearHref: string, label?: string }} props
 */
export default function ActiveFilterChips({ chips, clearHref, label = 'Active filters' }) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.removeHref}
          aria-label={`Remove filter: ${chip.label}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary hover:bg-primary hover:text-on-primary focus-visible:outline-2 focus-visible:outline-focus"
        >
          {chip.label}
          <CloseIcon className="size-3.5" />
        </Link>
      ))}
      <Link href={clearHref} className="rounded-sm text-sm text-muted underline underline-offset-4 hover:text-text focus-visible:outline-2 focus-visible:outline-focus">
        Clear all
      </Link>
    </div>
  );
}
