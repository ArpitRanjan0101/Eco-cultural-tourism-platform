import { cx } from '@/lib/cx';

/**
 * Real empty result (W22): no placeholder data, just what happened and what the user can do next.
 * @param {{ title: string, description?: string, icon?: React.ReactNode, action?: React.ReactNode,
 *   headingLevel?: 2|3, className?: string }} props
 */
export default function EmptyState({ title, description, icon, action, headingLevel = 2, className }) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <div className={cx('flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center', className)}>
      {icon ? <span className="text-muted">{icon}</span> : null}
      <Heading className="font-sans text-lg font-semibold">{title}</Heading>
      {description ? <p className="max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
