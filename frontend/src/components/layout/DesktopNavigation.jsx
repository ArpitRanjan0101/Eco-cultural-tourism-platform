'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import NavItemLink, { isActivePath } from '@/components/navigation/NavItemLink';
import { ChevronDownIcon } from '@/components/ui/icons';
import { useDismiss } from '@/hooks/useDismiss';
import { cx } from '@/lib/cx';

const LINK = 'rounded-md px-3 py-2 text-sm font-medium text-text hover:bg-surface-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-focus aria-[current=page]:text-primary';

function SubmenuItem({ item, pathname }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const refs = useMemo(() => [buttonRef, panelRef], []);
  const close = useCallback((reason) => {
    setOpen(false);
    if (reason === 'escape') buttonRef.current?.focus();
  }, []);
  useDismiss(open, close, refs);
  const active = isActivePath(pathname, item.href) || item.children.some((child) => isActivePath(pathname, child.href));

  return (
    <li className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-submenu`}
        onClick={() => setOpen((value) => !value)}
        className={cx(LINK, 'inline-flex items-center gap-1', active && 'text-primary')}
      >
        {item.label}
        <ChevronDownIcon className={cx('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      <ul ref={panelRef} id={`${id}-submenu`} hidden={!open} className="absolute left-0 z-40 mt-1 min-w-56 rounded-md border border-border bg-surface-raised p-1 shadow-lg">
        <li>
          <NavItemLink item={{ ...item, label: `All ${item.label.toLowerCase()}` }} current={isActivePath(pathname, item.href)} className={cx(LINK, 'block')} onNavigate={() => setOpen(false)} />
        </li>
        {item.children.map((child) => (
          <li key={child.id}>
            <NavItemLink item={child} current={isActivePath(pathname, child.href)} className={cx(LINK, 'block')} onNavigate={() => setOpen(false)} />
            {child.children.length ? (
              <ul className="ml-3 border-l border-border pl-2">
                {child.children.map((grandchild) => (
                  <li key={grandchild.id}>
                    <NavItemLink item={grandchild} current={isActivePath(pathname, grandchild.href)} className={cx(LINK, 'block text-muted')} onNavigate={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * Header navigation for large screens. Items with children open a disclosure panel (button + list:
 * Enter/Space toggle, Escape and outside clicks close). Current page marked with aria-current.
 * @param {{ items: Array<{ id: string, label: string, href: string, external?: boolean, children: Array<object> }>,
 *   label?: string, className?: string }} props
 */
export default function DesktopNavigation({ items, label = 'Main', className }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex items-center gap-1">
        {items.map((item) =>
          item.children.length ? (
            <SubmenuItem key={item.id} item={item} pathname={pathname} />
          ) : (
            <li key={item.id}>
              <NavItemLink item={item} current={isActivePath(pathname, item.href)} className={LINK} />
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
