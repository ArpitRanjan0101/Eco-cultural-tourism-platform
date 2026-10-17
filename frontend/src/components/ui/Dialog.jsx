'use client';

import { useEffect, useId, useRef } from 'react';
import { cx } from '@/lib/cx';
import IconButton from './IconButton';
import { CloseIcon } from './icons';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal surface on the native <dialog> (showModal): focus stays inside, the page behind is inert, Escape and
 * backdrop clicks call `onClose`, focus returns to the previously focused element, page scroll is locked.
 * Shared by Dialog and Drawer; not exported for direct use.
 */
export function ModalSurface({ open, onClose, title, description, footer, closeLabel = 'Close', closeOnBackdrop = true, initialFocusRef, panelClassName, children }) {
  const ref = useRef(null);
  const returnFocus = useRef(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement;
      dialog.showModal();
      initialFocusRef?.current?.focus();
      const previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.documentElement.style.overflow = previousOverflow;
        if (dialog.open) dialog.close();
        returnFocus.current?.focus?.();
      };
    }
    return undefined;
  }, [open, initialFocusRef]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        // A modal dialog makes the page inert, but Chromium still lets Tab leave for the browser UI; wrap instead.
        if (event.key !== 'Tab') return;
        const focusable = [...event.currentTarget.querySelectorAll(FOCUSABLE)].filter((node) => !node.closest('[inert]'));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      className={cx('max-h-none max-w-none overflow-visible border-0 bg-transparent p-0 text-text', panelClassName)}
    >
      {open ? (
        <div className="flex max-h-[inherit] flex-col overflow-hidden rounded-[inherit] bg-surface-raised shadow-lg [height:inherit]">
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 id={`${id}-title`} className="text-lg font-semibold">
                {title}
              </h2>
              {description ? (
                <p id={`${id}-description`} className="mt-1 text-sm text-muted">
                  {description}
                </p>
              ) : null}
            </div>
            <IconButton icon={<CloseIcon />} label={closeLabel} size="sm" onClick={onClose} />
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

/**
 * Centred modal dialog.
 * @param {{ open: boolean, onClose: () => void, title: string, description?: string, footer?: React.ReactNode,
 *   size?: 'sm'|'md'|'lg'|'xl', closeLabel?: string, closeOnBackdrop?: boolean,
 *   initialFocusRef?: React.RefObject, children: React.ReactNode }} props
 */
export default function Dialog({ size = 'md', ...props }) {
  return <ModalSurface {...props} panelClassName={cx('m-auto max-h-[85dvh] w-[calc(100%-2rem)] rounded-lg', SIZES[size] ?? SIZES.md)} />;
}
