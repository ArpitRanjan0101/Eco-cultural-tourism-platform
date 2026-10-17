import { cx } from '@/lib/cx';

const SHAPES = { rect: 'h-24 w-full rounded-md', text: 'h-4 w-full rounded-sm', circle: 'size-10 rounded-full' };

/**
 * Loading placeholder. Decorative: pair with a status message (e.g. aria-busy on the region) for screen readers.
 * @param {{ shape?: 'rect'|'text'|'circle', lines?: number, className?: string }} props
 * `lines` > 1 renders a paragraph of text lines (last one shorter).
 */
export default function Skeleton({ shape = 'rect', lines = 1, className }) {
  const base = cx('animate-pulse bg-surface-muted', SHAPES[shape] ?? SHAPES.rect);
  if (shape === 'text' && lines > 1) {
    return (
      <span aria-hidden="true" className={cx('flex flex-col gap-2', className)}>
        {Array.from({ length: lines }, (_, index) => (
          <span key={index} className={cx(base, 'block', index === lines - 1 && 'w-2/3')} />
        ))}
      </span>
    );
  }
  return <span aria-hidden="true" className={cx(base, 'block', className)} />;
}
