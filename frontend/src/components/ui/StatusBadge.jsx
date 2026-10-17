import Badge from './Badge';

/** `pending_payment` → `Pending payment`. */
export function humanizeStatus(status) {
  const text = String(status ?? '').replaceAll('_', ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

/**
 * Badge for a backend status value. Generic: the caller supplies the status → tone map (feature modules own
 * domain mappings such as booking or payment states). Unmapped statuses render neutral.
 * @param {{ status: string, tones?: Record<string, string>, labels?: Record<string, string>,
 *   size?: 'sm'|'md', className?: string }} props
 */
export default function StatusBadge({ status, tones = {}, labels = {}, size, className }) {
  return (
    <Badge tone={tones[status] ?? 'neutral'} size={size} className={className}>
      {labels[status] ?? humanizeStatus(status)}
    </Badge>
  );
}
