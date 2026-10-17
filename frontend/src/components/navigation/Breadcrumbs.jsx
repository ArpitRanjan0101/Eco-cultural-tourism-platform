import Link from 'next/link';
import { ChevronRightIcon } from '@/components/ui/icons';
import { cx } from '@/lib/cx';

/**
 * Breadcrumb trail. The last item is the current page (no link, aria-current="page").
 * @param {{ items: Array<{ label: string, href?: string }>, label?: string, className?: string }} props
 */
export default function Breadcrumbs({ items, label = 'Breadcrumb', className }) {
  if (!items?.length) return null;
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {last || !item.href ? (
                <span aria-current={last ? 'page' : undefined} className={cx(last && 'font-medium text-text')}>
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="rounded-sm hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-focus">
                  {item.label}
                </Link>
              )}
              {last ? null : <ChevronRightIcon className="size-3.5" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
