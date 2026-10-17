'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import NavItemLink, { isActivePath } from '@/components/navigation/NavItemLink';
import Drawer from '@/components/ui/Drawer';
import IconButton from '@/components/ui/IconButton';
import { MenuIcon } from '@/components/ui/icons';
import { cx } from '@/lib/cx';

const LINK = 'block rounded-md px-3 py-2 text-base font-medium text-text hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary';

function Tree({ items, pathname, onNavigate, depth = 0 }) {
  return (
    <ul className={cx('flex flex-col gap-1', depth > 0 && 'ml-3 border-l border-border pl-2')}>
      {items.map((item) => (
        <li key={item.id}>
          <NavItemLink item={item} current={isActivePath(pathname, item.href)} className={cx(LINK, depth > 0 && 'text-sm')} onNavigate={onNavigate} />
          {item.children.length ? <Tree items={item.children} pathname={pathname} onNavigate={onNavigate} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Menu button + drawer for small screens: the full navigation tree (expanded) and the account actions.
 * The drawer is a modal dialog (focus trap, Escape closes, focus returns to the button).
 * @param {{ items: Array<object>, accountItems: Array<{ id: string, label: string, href: string }>, siteName: string,
 *   label?: string, className?: string }} props
 */
export default function MobileNavigation({ items, accountItems, siteName, label = 'Main', className }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div className={className}>
      <IconButton icon={<MenuIcon className="size-5" />} label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} />
      <Drawer open={open} onClose={close} title={siteName} side="right" closeLabel="Close menu">
        <div className="flex flex-col gap-6">
          <nav aria-label={label}>
            <Tree items={items} pathname={pathname} onNavigate={close} />
          </nav>
          {accountItems.length ? (
            <nav aria-label="Account" className="border-t border-border pt-4">
              <Tree items={accountItems.map((item) => ({ ...item, children: [] }))} pathname={pathname} onNavigate={close} />
            </nav>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}
