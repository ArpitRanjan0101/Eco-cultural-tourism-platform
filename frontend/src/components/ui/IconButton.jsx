import { buttonVariants, pickVariant } from '@/config/componentVariants';
import { cx } from '@/lib/cx';

/**
 * Square button showing only an icon. `label` is required and becomes the accessible name.
 * @param {{ icon: React.ReactNode, label: string, variant?: 'primary'|'secondary'|'outline'|'ghost'|'danger',
 *   size?: 'sm'|'md'|'lg', type?: string, disabled?: boolean, className?: string }} props
 */
export default function IconButton({ icon, label, variant = 'ghost', size = 'md', type = 'button', className, ...rest }) {
  if (!label && process.env.NODE_ENV !== 'production') throw new Error('IconButton: `label` is required');
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        buttonVariants.base,
        pickVariant(buttonVariants.variant, variant, 'ghost', 'IconButton variant'),
        pickVariant(buttonVariants.iconSize, size, 'md', 'IconButton size'),
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
