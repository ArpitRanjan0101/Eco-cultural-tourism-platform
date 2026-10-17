import Money from '@/components/data-display/Money';
import { osmLink } from '@/components/maps/places';
import TextLink from '@/components/ui/TextLink';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABEL = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };

/**
 * Visiting details from the API: address, entry fee, best time, opening hours, coordinates. Only fields the API
 * provides are shown; a day missing from `openingHours` is listed as "No hours published" — never assumed open
 * or closed.
 * @param {{ destination: { address?: string|null, entryFee?: string|null, bestTimeToVisit?: string|null,
 *   openingHours?: Record<string, Array<{ open: string, close: string }>|string>|null,
 *   location?: { latitude: number, longitude: number }|null } }} props
 */
export default function VisitorInformation({ destination }) {
  const { address, entryFee, bestTimeToVisit, openingHours, location } = destination;
  const hasHours = openingHours && DAYS.some((day) => Array.isArray(openingHours[day]));
  return (
    <section aria-labelledby="visit-heading" className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-5">
      <h2 id="visit-heading" className="text-xl font-semibold">
        Plan your visit
      </h2>
      <dl className="flex flex-col gap-3 text-sm">
        {address ? (
          <div>
            <dt className="font-semibold">Address</dt>
            <dd className="text-muted">{address}</dd>
          </div>
        ) : null}
        <div>
          <dt className="font-semibold">Entry fee</dt>
          <dd className="text-muted">{entryFee ? <Money amount={entryFee} fallback="Not published" /> : 'Not published'}</dd>
        </div>
        {bestTimeToVisit ? (
          <div>
            <dt className="font-semibold">Best time to visit</dt>
            <dd className="text-muted">{bestTimeToVisit}</dd>
          </div>
        ) : null}
        {location ? (
          <div>
            <dt className="font-semibold">Location</dt>
            <dd className="text-muted">
              <TextLink href={osmLink(location)} external variant="inline">
                Open in OpenStreetMap
              </TextLink>
            </dd>
          </div>
        ) : null}
      </dl>
      {hasHours ? (
        <table className="w-full text-sm">
          <caption className="mb-2 text-left font-semibold">Opening hours</caption>
          <tbody>
            {DAYS.map((day) => (
              <tr key={day} className="border-t border-border">
                <th scope="row" className="py-1.5 pr-4 text-left font-medium">
                  {DAY_LABEL[day]}
                </th>
                <td className="py-1.5 text-muted">
                  {Array.isArray(openingHours[day])
                    ? openingHours[day].length
                      ? openingHours[day].map((slot) => `${slot.open}–${slot.close}`).join(', ')
                      : 'Closed'
                    : 'No hours published'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {openingHours?.notes ? <p className="text-sm text-muted">{openingHours.notes}</p> : null}
    </section>
  );
}
