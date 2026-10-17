import { cx } from '@/lib/cx';
import Button from '@/components/ui/Button';

/**
 * Responsive row of filter controls for lists. As a GET form (`action`) it writes filters to the URL (LLD §6);
 * with `onSubmit` the caller handles it.
 * @param {{ label: string, children: React.ReactNode, action?: string, onSubmit?: (event) => void,
 *   submitLabel?: string, onReset?: () => void, resetLabel?: string, activeCount?: number,
 *   className?: string }} props
 */
export default function FilterToolbar({ label, children, action, onSubmit, submitLabel = 'Apply filters', onReset, resetLabel = 'Clear filters', activeCount = 0, className }) {
  return (
    <form
      role="search"
      aria-label={label}
      method="get"
      action={action}
      onSubmit={onSubmit}
      className={cx('flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4 md:flex-row md:flex-wrap md:items-end', className)}
    >
      <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <div className="flex gap-2">
        <Button type="submit">{submitLabel}</Button>
        {onReset ? (
          <Button type="button" variant="ghost" onClick={onReset} disabled={activeCount === 0}>
            {resetLabel}
            {activeCount > 0 ? ` (${activeCount})` : null}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
