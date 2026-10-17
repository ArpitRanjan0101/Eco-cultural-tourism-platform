'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { buttonVariants, pickVariant } from '@/config/componentVariants';
import { useDismiss } from '@/hooks/useDismiss';
import { cx } from '@/lib/cx';

/**
 * Non-modal panel anchored to a button (filters, extra details). Opening moves focus into the panel; Escape
 * closes and returns focus to the button; outside clicks close.
 * @param {{ label: React.ReactNode, title: string, children: React.ReactNode, variant?: string, size?: string,
 *   align?: 'start'|'end', className?: string, panelClassName?: string }} props
 * `title` is the panel's accessible name.
 */
export default function Popover({ label, title, children, variant = 'outline', size = 'md', align = 'start', className, panelClassName }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const refs = useMemo(() => [triggerRef, panelRef], []);

  const close = useCallback((reason) => {
    setOpen(false);
    if (reason === 'escape') triggerRef.current?.focus();
  }, []);
  useDismiss(open, close, refs);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <div className={cx('relative inline-block', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((value) => !value)}
        className={cx(buttonVariants.base, pickVariant(buttonVariants.variant, variant, 'outline', 'Popover variant'), pickVariant(buttonVariants.size, size, 'md', 'Popover size'))}
      >
        {label}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={`${id}-panel`}
          role="dialog"
          aria-label={title}
          tabIndex={-1}
          className={cx(
            'absolute z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-surface-raised p-4 shadow-lg focus-visible:outline-2 focus-visible:outline-focus',
            align === 'end' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
