import Link from 'next/link';
import { cx } from '@/lib/cx';

const PILL = 'inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-focus';

/**
 * Region selection as links (URL state): "All regions" + one pill per region, current one marked.
 * @param {{ regions: Array<{ slug: string, name: string }>, value?: string, hrefFor: (slug: string|null) => string,
 *   label?: string }} props
 */
export default function RegionFilter({ regions, value, hrefFor, label = 'Filter by region' }) {
  const items = [{ slug: null, name: 'All regions' }, ...regions];
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-2">
        {items.map((region) => {
          const current = (region.slug ?? undefined) === (value || undefined);
          return (
            <li key={region.slug ?? 'all'}>
              <Link
                href={hrefFor(region.slug)}
                aria-current={current ? 'page' : undefined}
                className={cx(PILL, current ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface-raised text-text hover:border-primary')}
              >
                {region.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
