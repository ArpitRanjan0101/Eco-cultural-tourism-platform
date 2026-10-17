import ImageFrame from '@/components/data-display/ImageFrame';
import LinkCard from '@/components/data-display/LinkCard';
import Money from '@/components/data-display/Money';
import { formatDuration, formatInstant } from '@/lib/formatting/dates';

/**
 * Card for an API ExperienceCard.
 * @param {{ experience: { name: string, slug: string, durationMinutes: number, startingPrice: string|null,
 *   currency: string, nextSessionAt: string|null, destination?: { name: string } | null, coverImage?: object|null },
 *   headingLevel?: 2|3|4 }} props
 */
export default function ExperienceCard({ experience, headingLevel = 3 }) {
  const next = formatInstant(experience.nextSessionAt);
  return (
    <LinkCard
      href={`/experiences/${experience.slug}`}
      title={experience.name}
      headingLevel={headingLevel}
      eyebrow={experience.destination?.name}
      media={<ImageFrame image={experience.coverImage} alt="" />}
      footer={<Money amount={experience.startingPrice} currency={experience.currency} from fallback="No upcoming sessions" className="text-text" />}
    >
      <p>{formatDuration(experience.durationMinutes)}</p>
      {next ? <p>Next session: {next}</p> : null}
    </LinkCard>
  );
}
