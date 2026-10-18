import Badge from '@/components/ui/Badge';

/**
 * The API's booking mode: `instant` (confirmed on payment) or `request` (the partner approves first).
 * @param {{ mode: 'instant'|'request', size?: 'sm'|'md' }} props
 */
export default function BookingModeBadge({ mode, size }) {
  return (
    <Badge tone={mode === 'instant' ? 'success' : 'info'} size={size}>
      {mode === 'instant' ? 'Instant booking' : 'On request'}
    </Badge>
  );
}
