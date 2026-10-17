import { cx } from '@/lib/cx';

const DOTS = { neutral: 'bg-border-strong', primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', info: 'bg-info' };

/**
 * Ordered sequence of events or steps (booking history, itinerary days). Times arrive formatted.
 * @param {{ items: Array<{ id: string, title: React.ReactNode, time?: string, dateTime?: string,
 *   description?: React.ReactNode, tone?: 'neutral'|'primary'|'success'|'warning'|'danger'|'info' }>,
 *   className?: string }} props
 * `dateTime` (ISO) feeds the <time> element when `time` is a formatted label.
 */
export default function Timeline({ items, className }) {
  if (!items?.length) return null;
  return (
    <ol className={cx('relative flex flex-col gap-6 border-l-2 border-border pl-6', className)}>
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span aria-hidden="true" className={cx('absolute -left-[31px] top-1.5 size-3 rounded-full ring-4 ring-surface', DOTS[item.tone] ?? DOTS.neutral)} />
          <div className="flex flex-col gap-0.5">
            {item.time ? (
              <time dateTime={item.dateTime} className="text-xs font-medium uppercase tracking-wide text-muted">
                {item.time}
              </time>
            ) : null}
            <p className="font-medium text-text">{item.title}</p>
            {item.description ? <div className="text-sm text-muted">{item.description}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
