import { formatMoney } from '@/lib/formatting/money';

/**
 * Displays an API money value (decimal string). Optional "from" prefix for starting prices; `fallback` when
 * the API has no price (e.g. no upcoming sessions) — never an invented amount (W22).
 * @param {{ amount?: string|null, currency?: string, from?: boolean, fallback?: string, className?: string }} props
 */
export default function Money({ amount, currency = 'INR', from = false, fallback = 'Price on request', className }) {
  const formatted = formatMoney(amount, currency);
  if (!formatted) return <span className={className}>{fallback}</span>;
  return (
    <span className={className}>
      {from ? <span className="text-sm font-normal text-muted">From </span> : null}
      <span className="font-semibold">{formatted}</span>
    </span>
  );
}
