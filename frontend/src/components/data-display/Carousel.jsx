'use client';

import { useId, useState } from 'react';
import IconButton from '@/components/ui/IconButton';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons';
import { cx } from '@/lib/cx';

/**
 * One-slide-at-a-time carousel (WAI-ARIA carousel pattern). Never auto-rotates; previous/next buttons and
 * slide dots; the current slide is announced as "n of N".
 * @param {{ label: string, items: Array<object>, renderItem: (item, index) => React.ReactNode,
 *   getItemKey: (item) => string, className?: string }} props
 */
export default function Carousel({ label, items, renderItem, getItemKey, className }) {
  const id = useId();
  const [index, setIndex] = useState(0);
  if (!items?.length) return null;
  const count = items.length;
  const go = (target) => setIndex((target + count) % count);

  return (
    <section aria-roledescription="carousel" aria-label={label} className={cx('flex flex-col gap-3', className)}>
      <div className="relative overflow-hidden rounded-lg">
        <div id={`${id}-slides`} aria-live="polite" className="flex transition-transform duration-[var(--duration-slow)]" style={{ transform: `translateX(-${index * 100}%)` }}>
          {items.map((item, i) => (
            <div key={getItemKey(item)} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${count}`} aria-hidden={i !== index} inert={i !== index} className="w-full shrink-0">
              {renderItem(item, i)}
            </div>
          ))}
        </div>
      </div>
      {count > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <IconButton icon={<ChevronLeftIcon className="size-5" />} label="Previous slide" variant="outline" size="sm" aria-controls={`${id}-slides`} onClick={() => go(index - 1)} />
          <div className="flex gap-1.5">
            {items.map((item, i) => (
              <button
                key={getItemKey(item)}
                type="button"
                aria-label={`Show slide ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => go(i)}
                className="inline-flex size-6 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-focus"
              >
                {/* 24 px hit area (WCAG 2.2 target size) around a 10 px dot. */}
                <span aria-hidden="true" className={cx('size-2.5 rounded-full', i === index ? 'bg-primary' : 'bg-border-strong')} />
              </button>
            ))}
          </div>
          <IconButton icon={<ChevronRightIcon className="size-5" />} label="Next slide" variant="outline" size="sm" aria-controls={`${id}-slides`} onClick={() => go(index + 1)} />
        </div>
      ) : null}
    </section>
  );
}
