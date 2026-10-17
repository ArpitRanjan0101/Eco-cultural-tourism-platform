import { cardVariants, pickVariant } from '@/config/componentVariants';
import { cx } from '@/lib/cx';

/**
 * Generic card shell. Feature cards (destination, stay, guide…) compose it; it has no domain fields.
 * @param {{ as?: string, variant?: 'plain'|'elevated'|'outlined', padding?: 'none'|'sm'|'md'|'lg',
 *   media?: React.ReactNode, header?: React.ReactNode, footer?: React.ReactNode, interactive?: boolean,
 *   className?: string, children?: React.ReactNode }} props
 * `interactive` adds hover elevation for cards that contain a stretched primary link.
 */
export default function BaseCard({ as: Tag = 'article', variant = 'outlined', padding = 'md', media, header, footer, interactive = false, className, children, ...rest }) {
  return (
    <Tag
      className={cx(
        'relative flex flex-col overflow-hidden rounded-lg',
        pickVariant(cardVariants.variant, variant, 'outlined', 'BaseCard variant'),
        interactive && 'transition-shadow duration-[var(--duration-base)] focus-within:shadow-lg hover:shadow-lg',
        className,
      )}
      {...rest}
    >
      {media ? <div className="relative">{media}</div> : null}
      <div className={cx('flex flex-1 flex-col gap-2', pickVariant(cardVariants.padding, padding, 'md', 'BaseCard padding'))}>
        {header}
        {children}
      </div>
      {footer ? <div className="border-t border-border px-5 py-3">{footer}</div> : null}
    </Tag>
  );
}
