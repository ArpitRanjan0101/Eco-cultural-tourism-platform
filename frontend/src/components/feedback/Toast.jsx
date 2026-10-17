'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from '@/components/ui/icons';
import { pickVariant, toneVariants } from '@/config/componentVariants';
import { cx } from '@/lib/cx';

const ToastContext = createContext(null);
const ICONS = { info: InfoIcon, success: CheckIcon, warning: AlertIcon, danger: AlertIcon };

/**
 * Hosts transient notifications in polite and assertive live regions (mounted once in AppProviders).
 * @param {{ children: React.ReactNode, defaultDuration?: number, max?: number }} props
 */
export function ToastProvider({ children, defaultDuration = 5000, max = 4 }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);
  const show = useCallback(
    ({ tone = 'info', title, description, duration = defaultDuration }) => {
      pickVariant(toneVariants.alert, tone, 'info', 'Toast tone');
      counter.current += 1;
      const id = `toast-${counter.current}`;
      setToasts((list) => [...list, { id, tone, title, description, duration }].slice(-max));
      return id;
    },
    [defaultDuration, max],
  );
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  const region = (assertive) => (
    <div role={assertive ? 'alert' : 'status'} aria-live={assertive ? 'assertive' : 'polite'} className="flex flex-col gap-2">
      {toasts
        .filter((toast) => (toast.tone === 'danger') === assertive)
        .map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
    </div>
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col gap-2 sm:left-auto sm:w-96">
        {region(true)}
        {region(false)}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  const Icon = ICONS[toast.tone] ?? InfoIcon;
  useEffect(() => {
    if (!toast.duration) return undefined;
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);
  return (
    <div className={cx('pointer-events-auto flex gap-3 rounded-lg border bg-surface-raised p-4 shadow-lg', toneVariants.alert[toast.tone])}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-semibold">{toast.title}</p>
        {toast.description ? <p className="mt-1 text-text">{toast.description}</p> : null}
      </div>
      <button type="button" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)} className="-m-1 h-fit rounded-sm p-1 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-focus">
        <CloseIcon />
      </button>
    </div>
  );
}

/** `const toast = useToast(); toast.show({ tone: 'success', title: 'Saved' })`. `duration: null` keeps it until dismissed. */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
