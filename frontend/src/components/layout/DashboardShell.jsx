'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Drawer from '@/components/ui/Drawer';
import IconButton from '@/components/ui/IconButton';
import { MenuIcon } from '@/components/ui/icons';
import { cx } from '@/lib/cx';

/** True when `pathname` is `href` or below it (exact match for the area root when `exact`). */
export function isCurrent(pathname, href, exact) {
  if (!pathname) return false;
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ items, pathname, onNavigate }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const current = isCurrent(pathname, item.href, item.exact);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current ? 'page' : undefined}
              onClick={onNavigate}
              className={cx(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-focus',
                current ? 'bg-primary-soft text-primary' : 'text-text hover:bg-surface-muted',
              )}
            >
              {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Layout for account, partner and admin areas: sticky sidebar on large screens, drawer navigation on small.
 * Navigation items arrive already filtered by permission (W13); the shell has no access logic.
 * @param {{ title: string, navLabel: string, navItems: Array<{ href: string, label: string, icon?: React.ReactNode,
 *   exact?: boolean }>, headerActions?: React.ReactNode, currentPath?: string, children: React.ReactNode }} props
 * `currentPath` overrides the router pathname (tests, previews).
 */
export default function DashboardShell({ title, navLabel, navItems, headerActions, currentPath, children }) {
  const routerPath = usePathname();
  const pathname = currentPath ?? routerPath;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[16rem_1fr]">
      <a href="#main-content" className="sr-only z-50 rounded-md bg-surface-raised px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to main content
      </a>
      <aside className="hidden border-r border-border bg-surface-raised lg:block">
        <div className="sticky top-0 flex flex-col gap-6 p-4">
          <p className="px-3 font-display text-lg font-semibold text-primary">{title}</p>
          <nav aria-label={navLabel}>
            <NavList items={navItems} pathname={pathname} />
          </nav>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface-raised/95 px-4 backdrop-blur">
          <IconButton icon={<MenuIcon className="size-5" />} label={`Open ${navLabel}`} className="lg:hidden" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} />
          <p className="font-display text-base font-semibold lg:hidden">{title}</p>
          <div className="ml-auto flex items-center gap-2">{headerActions}</div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title={title} side="left" closeLabel={`Close ${navLabel}`}>
        <nav aria-label={navLabel}>
          <NavList items={navItems} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
        </nav>
      </Drawer>
    </div>
  );
}
