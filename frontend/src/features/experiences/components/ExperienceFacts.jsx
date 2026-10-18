import Money from '@/components/data-display/Money';
import TextLink from '@/components/ui/TextLink';
import { AtAGlance, BookingModeBadge } from '@/features/supply';
import { formatDuration, formatInstant } from '@/lib/formatting/dates';

/**
 * Key facts of an experience from the API detail; facts it does not provide are left out.
 * @param {{ experience: object }} props API ExperienceDetail
 */
export default function ExperienceFacts({ experience }) {
  const { minParticipants: min, maxParticipants: max } = experience;
  return (
    <AtAGlance
      facts={[
        { label: 'Duration', value: formatDuration(experience.durationMinutes) },
        { label: 'Group size', value: min > 1 ? `${min}–${max} people` : `Up to ${max} people` },
        { label: 'Price', value: <Money amount={experience.startingPrice} currency={experience.currency} from fallback="No upcoming sessions" /> },
        { label: 'Next session', value: formatInstant(experience.nextSessionAt) },
        {
          label: 'Where',
          value: experience.destination ? (
            <TextLink href={`/destinations/${experience.destination.slug}`} variant="inline">
              {experience.destination.name}
            </TextLink>
          ) : null,
        },
        { label: 'Hosted by', value: experience.partner?.businessName },
        { label: 'Booking', value: <BookingModeBadge mode={experience.bookingMode} /> },
      ]}
    />
  );
}
