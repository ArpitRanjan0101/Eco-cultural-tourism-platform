import { layoutVariants, pickVariant } from '@/config/componentVariants';
import { cx } from '@/lib/cx';

/**
 * Centred page-width wrapper with the standard 16 px mobile gutter.
 * @param {{ size?: 'sm'|'md'|'lg'|'xl'|'full', as?: string, className?: string, children: React.ReactNode }} props
 */
export default function Container({ size = 'lg', as: Tag = 'div', className, children, ...rest }) {
  return (
    <Tag className={cx('mx-auto w-full px-4 sm:px-6 lg:px-8', pickVariant(layoutVariants.container, size, 'lg', 'Container size'), className)} {...rest}>
      {children}
    </Tag>
  );
}
