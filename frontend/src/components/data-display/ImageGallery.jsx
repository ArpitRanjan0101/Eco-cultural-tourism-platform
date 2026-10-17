'use client';

import Image from 'next/image';
import { useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import IconButton from '@/components/ui/IconButton';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons';
import { cx } from '@/lib/cx';

/**
 * Thumbnail grid that opens a lightbox (Dialog) with previous/next buttons and ←/→ keys.
 * Image objects follow the API `Image` shape: `{ id, url, altText, width, height }`.
 * @param {{ images: Array<{ id: string, url: string, altText?: string|null, width?: number|null,
 *   height?: number|null }>, title: string, columns?: 2|3|4, className?: string }} props
 * `title` names the gallery and the lightbox. Missing alt text falls back to "<title>, image n of N".
 */
export default function ImageGallery({ images, title, columns = 3, className }) {
  const [index, setIndex] = useState(null);
  if (!images?.length) return null;
  const altFor = (image, i) => image.altText || `${title}, image ${i + 1} of ${images.length}`;
  const go = (delta) => setIndex((current) => (current + delta + images.length) % images.length);
  const current = index === null ? null : images[index];

  return (
    <div className={className}>
      <ul className={cx('grid gap-2', { 2: 'grid-cols-2', 3: 'grid-cols-2 sm:grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' }[columns])}>
        {images.map((image, i) => (
          <li key={image.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Open ${altFor(image, i)}`}
              className="relative block aspect-[4/3] w-full overflow-hidden rounded-md bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Image src={image.url} alt="" fill unoptimized sizes="(min-width: 640px) 33vw, 50vw" className="object-cover transition-transform duration-[var(--duration-base)] hover:scale-105" />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={current !== null} onClose={() => setIndex(null)} title={title} description={current ? `Image ${index + 1} of ${images.length}` : undefined} size="xl">
        {current ? (
          <div
            className="flex flex-col gap-3"
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') go(1);
              if (event.key === 'ArrowLeft') go(-1);
            }}
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-surface-muted">
              <Image src={current.url} alt={altFor(current, index)} fill unoptimized sizes="90vw" className="object-contain" />
            </div>
            {images.length > 1 ? (
              <div className="flex items-center justify-between">
                <IconButton icon={<ChevronLeftIcon className="size-5" />} label="Previous image" variant="outline" onClick={() => go(-1)} />
                <p className="text-sm text-muted" aria-live="polite">
                  {index + 1} / {images.length}
                </p>
                <IconButton icon={<ChevronRightIcon className="size-5" />} label="Next image" variant="outline" onClick={() => go(1)} />
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
