import { pickVariant, toneVariants } from '@/config/componentVariants';
import { cx } from '@/lib/cx';

/**
 * Small label.
 * @param {{ tone?: 'neutral'|'primary'|'accent'|'success'|'warning'|'danger'|'info', size?: 'sm'|'md',
 *   className?: string, children: React.ReactNode }} props
 */
export default function Badge({ tone = 'neutral', size = 'sm', className, children }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full font-medium',
        size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs',
        pickVariant(toneVariants.badge, tone, 'neutral', 'Badge tone'),
        className,
      )}
    >
      {children}
    </span>
  );
}
