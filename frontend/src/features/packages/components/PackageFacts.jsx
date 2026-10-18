import Money from '@/components/data-display/Money';
import TextLink from '@/components/ui/TextLink';
import { AtAGlance, BookingModeBadge } from '@/features/supply';
import { formatDate } from '@/lib/formatting/dates';
import { packageDuration } from './PackageCard';

/**
 * Key facts of a package from the API detail; facts it does not provide are left out.
 * @param {{ pkg: object }} props API PackageDetail
 */
export default function PackageFacts({ pkg }) {
  const { minTravelers: min, maxTravelers: max } = pkg;
  return (
    <AtAGlance
      facts={[
        { label: 'Duration', value: packageDuration(pkg) },
        { label: 'Group size', value: min > 1 ? `${min}–${max} travellers` : `Up to ${max} travellers` },
        { label: 'Price', value: <Money amount={pkg.startingPrice} currency={pkg.currency} from fallback="No upcoming departures" /> },
        { label: 'Next departure', value: formatDate(pkg.nextDeparture) },
        {
          label: 'Places visited',
          value: pkg.destinations.length ? (
            <ul className="flex flex-col gap-1">
              {pkg.destinations.map((destination) => (
                <li key={destination.id}>
                  <TextLink href={`/destinations/${destination.slug}`} variant="inline">
                    {destination.name}
                  </TextLink>
                </li>
              ))}
            </ul>
          ) : null,
        },
        { label: 'Operator', value: pkg.partner?.businessName },
        { label: 'Booking', value: <BookingModeBadge mode={pkg.bookingMode} /> },
      ]}
    />
  );
}
