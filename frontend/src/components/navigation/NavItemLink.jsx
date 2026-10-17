import Link from 'next/link';
import { ExternalIcon } from '@/components/ui/icons';
import VisuallyHidden from '@/components/ui/VisuallyHidden';

/**
 * A navigation link: client-side for internal paths, new tab + announcement for external https links.
 * @param {{ item: { href: string, label: string, external?: boolean }, current?: boolean, className?: string,
 *   onNavigate?: () => void }} props
 */
export default function NavItemLink({ item, current = false, className, onNavigate }) {
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={className}>
        {item.label}
        {/* Separate text node: the accessible name needs the space before "(opens in a new tab)". */}{' '}
        <ExternalIcon className="inline size-3.5" />
        <VisuallyHidden>(opens in a new tab)</VisuallyHidden>
      </a>
    );
  }
  return (
    <Link href={item.href} aria-current={current ? 'page' : undefined} className={className} onClick={onNavigate}>
      {item.label}
    </Link>
  );
}

/** True when `pathname` is the item's path or below it (query strings ignored). */
export function isActivePath(pathname, href) {
  if (!pathname || !href.startsWith('/')) return false;
  const path = href.split('?')[0];
  return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
}
