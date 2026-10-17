import { cx } from '@/lib/cx';

const one = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Star display for a backend rating (1–5). Decorative stars, accessible text "4.5 out of 5".
 * @param {{ value: number, className?: string }} props
 */
export function Stars({ value, className }) {
  const rounded = Math.round(value);
  return (
    <span className={cx('inline-flex items-center gap-1', className)}>
      {/* Whole stars only (widely supported glyphs); the exact value is in the accessible text. */}
      <span aria-hidden="true" className="tracking-tight text-accent">
        {[1, 2, 3, 4, 5].map((star) => (star <= rounded ? '★' : '☆')).join('')}
      </span>
      <span className="sr-only">{`${one.format(value)} out of 5`}</span>
    </span>
  );
}

/**
 * Rating summary from the API (`meta.rating`: count, average, distribution). With no reviews it says so —
 * never a default or invented score (W22).
 * @param {{ summary: { count: number, average: number|null, distribution: Record<string, number> } | null }} props
 */
export default function RatingSummary({ summary }) {
  if (!summary?.count || summary.average === null) return <p className="text-sm text-muted">No reviews yet.</p>;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
      <div className="flex flex-col">
        <span className="font-display text-4xl font-bold">{one.format(summary.average)}</span>
        <Stars value={summary.average} />
        <span className="text-sm text-muted">{`${summary.count} ${summary.count === 1 ? 'review' : 'reviews'}`}</span>
      </div>
      <dl className="flex flex-1 flex-col gap-1 text-sm">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = summary.distribution?.[star] ?? 0;
          const share = summary.count ? Math.round((count / summary.count) * 100) : 0;
          return (
            <div key={star} className="flex items-center gap-2">
              <dt className="w-14 shrink-0">{`${star} star`}</dt>
              <dd className="flex flex-1 items-center gap-2">
                <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <span className="block h-full bg-accent" style={{ width: `${share}%` }} />
                </span>
                <span className="w-8 text-right text-muted">{count}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
