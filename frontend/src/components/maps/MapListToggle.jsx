'use client';

import { useId, useState } from 'react';
import { cx } from '@/lib/cx';

const BUTTON = 'rounded-md px-4 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-focus';

/**
 * Switches a result area between list and map views (two toggle buttons, aria-pressed). The list is the default
 * and always available; the map is offered only when `canShowMap` (some results have coordinates).
 * @param {{ list: React.ReactNode, map: React.ReactNode, canShowMap?: boolean, label?: string }} props
 */
export default function MapListToggle({ list, map, canShowMap = true, label = 'Results view' }) {
  const id = useId();
  const [view, setView] = useState('list');
  if (!canShowMap) return list;
  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label={label} className="inline-flex w-fit gap-1 rounded-lg border border-border bg-surface-raised p-1">
        {['list', 'map'].map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            aria-controls={`${id}-${option}`}
            onClick={() => setView(option)}
            className={cx(BUTTON, view === option ? 'bg-primary text-on-primary' : 'text-text hover:bg-surface-muted')}
          >
            {option === 'list' ? 'List' : 'Map'}
          </button>
        ))}
      </div>
      <div id={`${id}-list`} hidden={view !== 'list'}>
        {list}
      </div>
      <div id={`${id}-map`} hidden={view !== 'map'}>
        {view === 'map' ? map : null}
      </div>
    </div>
  );
}
