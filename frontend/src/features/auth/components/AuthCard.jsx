import { cx } from '@/lib/cx';

/**
 * Centred panel for the (auth) pages: the page's h1, an optional lead and the form.
 * @param {{ title: string, description?: React.ReactNode, footer?: React.ReactNode, className?: string,
 *   children: React.ReactNode }} props
 */
export default function AuthCard({ title, description, footer, className, children }) {
  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-12 sm:items-center">
      <div className={cx('w-full max-w-md rounded-lg border border-border bg-surface-raised p-6 shadow-md sm:p-8', className)}>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
        <div className="motif-divider my-5" aria-hidden="true" />
        {children}
        {footer ? <div className="mt-6 border-t border-border pt-4 text-sm text-muted">{footer}</div> : null}
      </div>
    </main>
  );
}
