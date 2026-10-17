import { cx } from '@/lib/cx';
import VisuallyHidden from './VisuallyHidden';

const SIZES = { sm: 'size-4 border-2', md: 'size-6 border-2', lg: 'size-10 border-[3px]' };

/**
 * Loading indicator.
 * @param {{ size?: 'sm'|'md'|'lg', label?: string, className?: string }} props
 *   `label` set → announced as a status; omitted → decorative (e.g. inside a busy button).
 */
export default function Spinner({ size = 'md', label, className }) {
  const circle = <span aria-hidden="true" className={cx('inline-block animate-spin rounded-full border-current border-t-transparent', SIZES[size] ?? SIZES.md, className)} />;
  if (!label) return circle;
  return (
    <span role="status" className="inline-flex items-center">
      {circle}
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}
