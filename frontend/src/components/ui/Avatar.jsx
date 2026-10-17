import Image from 'next/image';
import { cx } from '@/lib/cx';

const SIZES = { sm: { box: 'size-8 text-xs', px: 32 }, md: { box: 'size-10 text-sm', px: 40 }, lg: { box: 'size-14 text-base', px: 56 } };

export function initials(name) {
  return String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

/**
 * User or organisation avatar: image when `src` is given, otherwise initials.
 * @param {{ name: string, src?: string|null, size?: 'sm'|'md'|'lg', className?: string }} props
 * Images are unoptimized until storage origins are configured for next/image (W16, Phase 4–5).
 */
export default function Avatar({ name, src, size = 'md', className }) {
  const config = SIZES[size] ?? SIZES.md;
  return (
    <span className={cx('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft font-semibold text-primary', config.box, className)}>
      {src ? (
        <Image src={src} alt={name} width={config.px} height={config.px} unoptimized className="size-full object-cover" />
      ) : (
        <span role="img" aria-label={name}>
          {initials(name)}
        </span>
      )}
    </span>
  );
}
