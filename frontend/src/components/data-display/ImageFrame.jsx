import Image from 'next/image';
import { cx } from '@/lib/cx';

// `fill` takes the parent's height (for backgrounds and side panels).
const RATIOS = { video: 'aspect-video', photo: 'aspect-[4/3]', square: 'aspect-square', portrait: 'aspect-[3/4]', wide: 'aspect-[21/9]', fill: 'h-full' };

/**
 * Responsive image box for API `Image` objects ({ url, altText, width, height }). Without an image it shows a
 * neutral decorative surface — never a stock photo pretending to be the place (W22).
 * Images are unoptimized until storage origins are configured for next/image (W16).
 * @param {{ image?: { url: string, altText?: string|null } | null, alt?: string, ratio?: 'video'|'photo'|'square'|'portrait'|'wide'|'fill',
 *   sizes?: string, priority?: boolean, className?: string }} props
 * `alt` overrides the image's alt text; pass "" for decorative images next to a visible title.
 */
export default function ImageFrame({ image, alt, ratio = 'photo', sizes = '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw', priority = false, className }) {
  return (
    <div className={cx('relative w-full overflow-hidden bg-surface-muted', RATIOS[ratio] ?? RATIOS.photo, className)}>
      {image?.url ? (
        <Image src={image.url} alt={alt ?? image.altText ?? ''} fill sizes={sizes} priority={priority} unoptimized className="object-cover" />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-primary-soft to-accent-soft">
          <div className="motif-divider absolute inset-x-0 bottom-3" />
        </div>
      )}
    </div>
  );
}
