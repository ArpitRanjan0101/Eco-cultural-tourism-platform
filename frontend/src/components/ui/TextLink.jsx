import Link from 'next/link';
import { linkVariants, pickVariant } from '@/config/componentVariants';
import { cx } from '@/lib/cx';
import { ExternalIcon } from './icons';
import VisuallyHidden from './VisuallyHidden';

/**
 * Text link. Internal paths use client navigation; `external` links open a new tab safely and say so.
 * @param {{ href: string, variant?: 'inline'|'standalone'|'subtle', external?: boolean, className?: string,
 *   children: React.ReactNode }} props
 */
export default function TextLink({ href, variant = 'inline', external = false, className, children, ...rest }) {
  const classes = cx(linkVariants.base, pickVariant(linkVariants.variant, variant, 'inline', 'TextLink variant'), className);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
        {children}
        {/* A separate text node: a leading space inside the hidden span is trimmed from the accessible name. */}
        {' '}
        <ExternalIcon className="inline size-3.5 align-baseline" />
        <VisuallyHidden>(opens in a new tab)</VisuallyHidden>
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}
