'use client';

import Link from 'next/link';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { buttonVariants, pickVariant } from '@/config/componentVariants';
import { useDismiss } from '@/hooks/useDismiss';
import { cx } from '@/lib/cx';
import { ChevronDownIcon } from './icons';

/**
 * Menu button (WAI-ARIA menu pattern). ↓/Enter/Space open on the first item, ↑ on the last; ↑/↓/Home/End
 * move; Escape closes and returns focus to the button; Tab or an outside click closes.
 * @param {{ label: string, items: Array<{ id: string, label: string, onSelect?: () => void, href?: string,
 *   disabled?: boolean, tone?: 'default'|'danger' }>, variant?: string, size?: string,
 *   align?: 'start'|'end', className?: string }} props
 */
export default function DropdownMenu({ label, items, variant = 'outline', size = 'md', align = 'start', className }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);
  const refs = useMemo(() => [triggerRef, menuRef], []);
  const enabled = items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0);

  const focusItem = (index) => itemRefs.current[index]?.focus();
  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);
  useDismiss(open, useCallback((reason) => close(reason === 'escape'), [close]), refs);

  const openAt = (which) => {
    setOpen(true);
    requestAnimationFrame(() => focusItem(which === 'last' ? enabled[enabled.length - 1] : enabled[0]));
  };

  const onTriggerKey = (event) => {
    if (['ArrowDown', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openAt('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt('last');
    }
  };

  const onMenuKey = (event) => {
    const position = enabled.indexOf(itemRefs.current.indexOf(document.activeElement));
    const next = {
      ArrowDown: enabled[(position + 1) % enabled.length],
      ArrowUp: enabled[(position - 1 + enabled.length) % enabled.length],
      Home: enabled[0],
      End: enabled[enabled.length - 1],
    }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      focusItem(next);
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  const itemClass = (item) =>
    cx(
      'flex w-full items-center rounded-sm px-3 py-2 text-left text-sm outline-none focus-visible:bg-surface-muted hover:bg-surface-muted',
      'aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
      item.tone === 'danger' ? 'text-danger' : 'text-text',
    );

  return (
    <div className={cx('relative inline-block', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => (open ? close() : openAt('first'))}
        onKeyDown={onTriggerKey}
        className={cx(buttonVariants.base, pickVariant(buttonVariants.variant, variant, 'outline', 'DropdownMenu variant'), pickVariant(buttonVariants.size, size, 'md', 'DropdownMenu size'))}
      >
        {label}
        <ChevronDownIcon />
      </button>
      {open ? (
        <ul
          ref={menuRef}
          id={`${id}-menu`}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={cx('absolute z-40 mt-1 min-w-48 rounded-md border border-border bg-surface-raised p-1 shadow-lg', align === 'end' ? 'right-0' : 'left-0')}
        >
          {items.map((item, index) => {
            const common = {
              ref: (node) => {
                itemRefs.current[index] = node;
              },
              role: 'menuitem',
              tabIndex: -1,
              'aria-disabled': item.disabled || undefined,
              className: itemClass(item),
            };
            return (
              <li key={item.id} role="none">
                {item.href && !item.disabled ? (
                  <Link href={item.href} {...common} onClick={() => close(false)}>
                    {item.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    {...common}
                    onClick={() => {
                      if (item.disabled) return;
                      close();
                      item.onSelect?.();
                    }}
                  >
                    {item.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
