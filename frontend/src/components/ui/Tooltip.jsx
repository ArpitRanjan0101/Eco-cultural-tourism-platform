'use client';

import { cloneElement, useCallback, useId, useMemo, useRef, useState } from 'react';
import { useDismiss } from '@/hooks/useDismiss';
import { cx } from '@/lib/cx';

/**
 * Short supplementary text shown on hover and keyboard focus, linked with aria-describedby; Escape hides it.
 * Never put essential information or interactive content in a tooltip.
 * @param {{ content: string, children: React.ReactElement, side?: 'top'|'bottom' }} props
 * `children` must be one focusable element that accepts aria-describedby.
 */
export default function Tooltip({ content, children, side = 'top' }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const wrapperRef = useRef(null);
  const refs = useMemo(() => [wrapperRef], []);
  const hide = useCallback(() => setVisible(false), []);
  useDismiss(visible, hide, refs);

  const trigger = cloneElement(children, {
    'aria-describedby': cx(children.props['aria-describedby'], `${id}-tip`) || undefined,
    onFocus: (event) => {
      children.props.onFocus?.(event);
      setVisible(true);
    },
    onBlur: (event) => {
      children.props.onBlur?.(event);
      setVisible(false);
    },
  });

  return (
    <span ref={wrapperRef} className="relative inline-flex" onMouseEnter={() => setVisible(true)} onMouseLeave={hide}>
      {trigger}
      <span
        id={`${id}-tip`}
        role="tooltip"
        hidden={!visible}
        className={cx(
          'pointer-events-none absolute left-1/2 z-50 w-max max-w-56 -translate-x-1/2 rounded-sm bg-text px-2 py-1 text-xs text-surface shadow-md',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
        )}
      >
        {content}
      </span>
    </span>
  );
}
