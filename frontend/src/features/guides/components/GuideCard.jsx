import ImageFrame from '@/components/data-display/ImageFrame';
import LinkCard from '@/components/data-display/LinkCard';
import Money from '@/components/data-display/Money';
import { plural } from '@/lib/formatting/plural';

/** API yearsExperience → "5 years guiding" (0 → "Local guide"). */
export const guideExperience = (years) => (years > 0 ? `${plural(years, 'year')} guiding` : 'Local guide');

/**
 * Card for an API GuideCard (public guides are verified by the backend, D6).
 * @param {{ guide: { id: string, displayName: string, yearsExperience: number, startingPrice: string|null,
 *   currency: string, photo?: object|null, languages: Array<{ code: string, name: string }>,
 *   destinations: Array<{ id: string, name: string }> }, headingLevel?: 2|3|4 }} props
 */
export default function GuideCard({ guide, headingLevel = 3 }) {
  return (
    <LinkCard
      href={`/guides/${guide.id}`}
      title={guide.displayName}
      headingLevel={headingLevel}
      eyebrow={guideExperience(guide.yearsExperience)}
      media={<ImageFrame image={guide.photo} alt="" ratio="square" />}
      footer={<Money amount={guide.startingPrice} currency={guide.currency} from className="text-text" />}
    >
      {guide.languages.length ? <p>Speaks {guide.languages.map((language) => language.name).join(', ')}</p> : null}
      {guide.destinations.length ? <p>Guides at {guide.destinations.slice(0, 3).map((destination) => destination.name).join(', ')}</p> : null}
    </LinkCard>
  );
}
