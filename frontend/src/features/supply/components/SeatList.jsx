import Money from '@/components/data-display/Money';
import Badge from '@/components/ui/Badge';
import { plural } from '@/lib/formatting/plural';

/**
 * Seat status of a scheduled session or departure for the requested party, from the API's `status`,
 * `available` and `seatsAvailable` (never computed from capacity here).
 */
export function seatStatus({ status, available, seatsAvailable }) {
  if (status === 'cancelled') return { tone: 'danger', text: 'Cancelled' };
  if (status === 'closed') return { tone: 'neutral', text: 'Closed for booking' };
  if (available) return { tone: 'success', text: `${plural(seatsAvailable, 'seat')} left` };
  return { tone: 'neutral', text: seatsAvailable > 0 ? `Only ${plural(seatsAvailable, 'seat')} left` : 'Full' };
}

/**
 * Scheduled options with a per-person price and seat status (experience sessions, package departures).
 * @param {{ label: string, options: Array<{ id: string, when: React.ReactNode, pricePerPerson: string,
 *   currency: string, status: string, available: boolean, seatsAvailable: number }> }} props
 */
export default function SeatList({ label, options }) {
  return (
    <ul className="flex flex-col gap-3" aria-label={label}>
      {options.map((option) => {
        const status = seatStatus(option);
        return (
          <li key={option.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-col gap-1">
              <p className="font-semibold">{option.when}</p>
              <p className="text-sm">
                <Money amount={option.pricePerPerson} currency={option.currency} className="text-text" />
                <span className="text-muted"> per person</span>
              </p>
            </div>
            <Badge tone={status.tone} size="md">
              {status.text}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
