import Money from '@/components/data-display/Money';
import TextLink from '@/components/ui/TextLink';
import { AtAGlance } from '@/features/supply';
import { plural } from '@/lib/formatting/plural';

/**
 * Key facts of a guide profile from the API; facts it does not provide are left out.
 * @param {{ guide: object }} props API GuideProfile
 */
export default function GuideFacts({ guide }) {
  return (
    <AtAGlance
      facts={[
        { label: 'Experience', value: guide.yearsExperience > 0 ? plural(guide.yearsExperience, 'year') : null },
        { label: 'Languages', value: guide.languages.map((language) => language.name).join(', ') },
        {
          label: 'Guides at',
          value: guide.destinations.length ? (
            <ul className="flex flex-col gap-1">
              {guide.destinations.map((destination) => (
                <li key={destination.id}>
                  <TextLink href={`/destinations/${destination.slug}`} variant="inline">
                    {destination.name}
                  </TextLink>
                </li>
              ))}
            </ul>
          ) : null,
        },
        { label: 'Services', value: <Money amount={guide.startingPrice} currency={guide.currency} from fallback="No services listed" /> },
        { label: 'Organisation', value: guide.partner?.businessName },
        // Public profiles are only served for verified guides (backend D6).
        { label: 'Verification', value: 'Verified guide' },
      ]}
    />
  );
}
