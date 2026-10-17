import { cx } from '@/lib/cx';

/**
 * Page title block: the page's only h1.
 * @param {{ title: string, description?: string, eyebrow?: string, breadcrumbs?: React.ReactNode,
 *   actions?: React.ReactNode, className?: string }} props
 */
export default function PageHeader({ title, description, eyebrow, breadcrumbs, actions, className }) {
  return (
    <header className={cx('flex flex-col gap-4 py-6 md:py-8', className)}>
      {breadcrumbs}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          {eyebrow ? <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-accent">{eyebrow}</p> : null}
          <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
          {description ? <p className="mt-2 text-lg text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="motif-divider" aria-hidden="true" />
    </header>
  );
}
