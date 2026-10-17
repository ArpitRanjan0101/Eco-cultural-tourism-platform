import { cx } from '@/lib/cx';
import BaseCard from './BaseCard';

const TRENDS = { up: 'text-success', down: 'text-danger', neutral: 'text-muted' };

/**
 * Dashboard figure. Values arrive formatted (money/date formatting is the caller's job, W12).
 * @param {{ label: string, value: React.ReactNode, change?: string, trend?: 'up'|'down'|'neutral',
 *   hint?: string, icon?: React.ReactNode, className?: string }} props
 */
export default function StatCard({ label, value, change, trend = 'neutral', hint, icon, className }) {
  return (
    <BaseCard variant="outlined" padding="md" className={className}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        {icon ? <span className="text-primary">{icon}</span> : null}
      </div>
      <p className="text-2xl font-semibold text-text">{value}</p>
      {change || hint ? (
        <p className="text-sm text-muted">
          {change ? <span className={cx('font-medium', TRENDS[trend] ?? TRENDS.neutral)}>{change}</span> : null}
          {change && hint ? ' ' : null}
          {hint}
        </p>
      ) : null}
    </BaseCard>
  );
}
