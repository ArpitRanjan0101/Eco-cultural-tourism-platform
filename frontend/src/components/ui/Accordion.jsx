'use client';

import { useId, useState } from 'react';
import { cx } from '@/lib/cx';
import { ChevronDownIcon } from './icons';

/**
 * WAI-ARIA accordion: heading-wrapped buttons with aria-expanded controlling labelled regions.
 * @param {{ items: Array<{ id: string, title: React.ReactNode, content: React.ReactNode }>,
 *   allowMultiple?: boolean, defaultOpen?: string[], headingLevel?: 2|3|4, className?: string }} props
 */
export default function Accordion({ items, allowMultiple = true, defaultOpen = [], headingLevel = 3, className }) {
  const baseId = useId();
  const [open, setOpen] = useState(() => new Set(defaultOpen));
  const Heading = `h${headingLevel}`;

  const toggle = (id) =>
    setOpen((current) => {
      const next = new Set(allowMultiple ? current : []);
      if (current.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={cx('divide-y divide-border rounded-lg border border-border bg-surface-raised', className)}>
      {items.map((item) => {
        const expanded = open.has(item.id);
        const buttonId = `${baseId}-${item.id}-button`;
        const panelId = `${baseId}-${item.id}-panel`;
        return (
          <div key={item.id}>
            <Heading className="font-sans text-base font-medium">
              <button
                type="button"
                id={buttonId}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
              >
                {item.title}
                <ChevronDownIcon className={cx('size-5 shrink-0 transition-transform duration-[var(--duration-fast)]', expanded && 'rotate-180')} />
              </button>
            </Heading>
            <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!expanded} className="px-4 pb-4 text-sm text-text">
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
