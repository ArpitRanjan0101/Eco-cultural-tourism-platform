'use client';

import { useEffect } from 'react';

/**
 * Calls `onDismiss(reason)` on Escape or on a pointer press outside every element in `refs` while `active`.
 * reason: 'escape' | 'outside'. Used by non-modal overlays (menus, popovers, tooltips).
 */
export function useDismiss(active, onDismiss, refs) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onDismiss('escape');
    };
    const onPointer = (event) => {
      if (refs.every((ref) => !ref.current?.contains(event.target))) onDismiss('outside');
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [active, onDismiss, refs]);
}
