import Link from 'next/link';
import { buttonVariants, pickVariant } from '@/config/componentVariants';
import { cx } from '@/lib/cx';
import Spinner from './Spinner';

function buttonClass({ variant, size, fullWidth, className }) {
  return cx(
    buttonVariants.base,
    pickVariant(buttonVariants.variant, variant, 'primary', 'Button variant'),
    pickVariant(buttonVariants.size, size, 'md', 'Button size'),
    fullWidth && 'w-full',
    className,
  );
}

/**
 * Action button.
 * @param {{ variant?: 'primary'|'secondary'|'outline'|'ghost'|'danger', size?: 'sm'|'md'|'lg',
 *   loading?: boolean, disabled?: boolean, type?: 'button'|'submit'|'reset', fullWidth?: boolean,
 *   leadingIcon?: React.ReactNode, trailingIcon?: React.ReactNode, className?: string,
 *   children: React.ReactNode }} props
 * `loading` keeps the label (stable width and accessible name), disables the button and sets aria-busy.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : leadingIcon}
      {children}
      {loading ? null : trailingIcon}
    </button>
  );
}

/**
 * Link styled as a button, for navigation calls to action. Same variants and sizes as Button.
 * @param {{ href: string, variant?: string, size?: string, fullWidth?: boolean, className?: string,
 *   children: React.ReactNode }} props
 */
export function ButtonLink({ href, variant = 'primary', size = 'md', fullWidth = false, className, children, ...rest }) {
  return (
    <Link href={href} className={buttonClass({ variant, size, fullWidth, className })} {...rest}>
      {children}
    </Link>
  );
}
