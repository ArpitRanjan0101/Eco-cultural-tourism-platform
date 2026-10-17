import Link from 'next/link';
import { cx } from '@/lib/cx';

/**
 * Tourism category tile linking to the destinations filtered by it.
 * @param {{ category: { name: string, slug: string, description?: string|null }, count?: number, href?: string,
 *   className?: string }} props
 * `count` (published destinations, from /search/filters) is shown only when provided.
 */
export default function CategoryCard({ category, count, href, className }) {
  return (
    <Link
      href={href ?? `/destinations?category=${encodeURIComponent(category.slug)}`}
      className={cx(
        'flex h-full flex-col gap-1 rounded-lg border border-border bg-surface-raised p-4 transition-colors hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-focus',
        className,
      )}
    >
      <span className="font-semibold text-text">{category.name}</span>
      {/* Separate space nodes keep the accessible name readable. */}
      {count !== undefined ? ' ' : null}
      {count !== undefined ? <span className="text-sm text-muted">{`${count} ${count === 1 ? 'place' : 'places'}`}</span> : null}
      {category.description ? ' ' : null}
      {category.description ? <span className="line-clamp-2 text-sm text-muted">{category.description}</span> : null}
    </Link>
  );
}
