import ImageFrame from '@/components/data-display/ImageFrame';
import LinkCard from '@/components/data-display/LinkCard';
import Money from '@/components/data-display/Money';

/**
 * Card for an API GuideCard (public guides are verified by the backend, D6).
 * @param {{ guide: { id: string, displayName: string, yearsExperience: number, startingPrice: string|null,
 *   currency: string, photo?: object|null, languages: Array<{ code: string, name: string }>,
 *   destinations: Array<{ id: string, name: string }> }, headingLevel?: 2|3|4 }} props
 */
export default function GuideCard({ guide, headingLevel = 3 }) {
  const years = guide.yearsExperience;
  return (
    <LinkCard
      href={`/guides/${guide.id}`}
      title={guide.displayName}
      headingLevel={headingLevel}
      eyebrow={years > 0 ? `${years} ${years === 1 ? 'year' : 'years'} guiding` : 'Local guide'}
      media={<ImageFrame image={guide.photo} alt="" ratio="square" />}
      footer={<Money amount={guide.startingPrice} currency={guide.currency} from className="text-text" />}
    >
      {guide.languages.length ? <p>Speaks {guide.languages.map((language) => language.name).join(', ')}</p> : null}
      {guide.destinations.length ? <p>Guides at {guide.destinations.slice(0, 3).map((destination) => destination.name).join(', ')}</p> : null}
    </LinkCard>
  );
}
