import ImageFrame from '@/components/data-display/ImageFrame';
import LinkCard from '@/components/data-display/LinkCard';
import Money from '@/components/data-display/Money';
import { formatDate } from '@/lib/formatting/dates';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Card for an API PackageCard.
 * @param {{ pkg: { name: string, slug: string, summary?: string|null, durationDays: number, durationNights: number,
 *   startingPrice: string|null, currency: string, nextDeparture: string|null, coverImage?: object|null },
 *   headingLevel?: 2|3|4 }} props
 */
export default function PackageCard({ pkg, headingLevel = 3 }) {
  const next = formatDate(pkg.nextDeparture);
  return (
    <LinkCard
      href={`/packages/${pkg.slug}`}
      title={pkg.name}
      headingLevel={headingLevel}
      eyebrow={`${plural(pkg.durationDays, 'day')} · ${plural(pkg.durationNights, 'night')}`}
      media={<ImageFrame image={pkg.coverImage} alt="" />}
      footer={<Money amount={pkg.startingPrice} currency={pkg.currency} from fallback="No upcoming departures" className="text-text" />}
    >
      {pkg.summary ? <p className="line-clamp-3">{pkg.summary}</p> : null}
      {next ? <p>Next departure: {next}</p> : null}
    </LinkCard>
  );
}
