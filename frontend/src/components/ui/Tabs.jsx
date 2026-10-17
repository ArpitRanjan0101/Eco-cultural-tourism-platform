'use client';

import { useId, useRef, useState } from 'react';
import { cx } from '@/lib/cx';

/**
 * WAI-ARIA tabs with roving focus: ←/→ move and activate, Home/End jump, disabled tabs are skipped.
 * Controlled (`value` + `onChange`) or uncontrolled (`defaultValue`, else the first enabled tab).
 * @param {{ label: string, tabs: Array<{ id: string, label: React.ReactNode, content: React.ReactNode,
 *   disabled?: boolean }>, value?: string, defaultValue?: string, onChange?: (id: string) => void,
 *   className?: string }} props
 */
export default function Tabs({ label, tabs, value, defaultValue, onChange, className }) {
  const baseId = useId();
  const firstEnabled = tabs.find((tab) => !tab.disabled)?.id;
  const [internal, setInternal] = useState(defaultValue ?? firstEnabled);
  const active = value ?? internal;
  const refs = useRef({});

  const select = (id) => {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  };

  const onKeyDown = (event) => {
    const enabled = tabs.filter((tab) => !tab.disabled);
    const index = enabled.findIndex((tab) => tab.id === active);
    const target = {
      ArrowRight: enabled[(index + 1) % enabled.length],
      ArrowLeft: enabled[(index - 1 + enabled.length) % enabled.length],
      Home: enabled[0],
      End: enabled[enabled.length - 1],
    }[event.key];
    if (!target) return;
    event.preventDefault();
    select(target.id);
    refs.current[target.id]?.focus();
  };

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => select(tab.id)}
              className={cx(
                '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                selected ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== active}
          tabIndex={0}
          className="py-4 focus-visible:outline-2 focus-visible:outline-focus"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
