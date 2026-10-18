import CardGrid from '@/components/data-display/CardGrid';
import Section from '@/components/layout/Section';
import { ButtonLink } from '@/components/ui/Button';
import { ExperienceCard } from '@/features/experiences';
import { GuideCard } from '@/features/guides';
import { PropertyCard } from '@/features/properties';

// `more` links to the full catalogue list. Experiences and guides use the same backend destination filter as
// these sections, so the count matches. Stays here include places within 25 km, which /properties?destination=
// does not, so stays link to the district's stays without claiming a count.
const KINDS = {
  properties: {
    title: 'Places to stay nearby',
    description: 'Published stays linked to this place or within 25 km.',
    render: (item) => <PropertyCard property={item} />,
    more: (destination) => destination.district && { href: `/stays?district=${destination.district.slug}`, label: `Browse stays in ${destination.district.name}` },
  },
  experiences: {
    title: 'Experiences here',
    description: 'Cultural and nature experiences at this destination.',
    render: (item) => <ExperienceCard experience={item} />,
    more: (destination, total) => ({ href: `/experiences?destination=${destination.slug}`, label: `See all ${total} experiences` }),
  },
  guides: {
    title: 'Local guides',
    description: 'Verified guides who work at this destination.',
    render: (item) => <GuideCard guide={item} />,
    more: (destination, total) => ({ href: `/guides?destination=${destination.slug}`, label: `See all ${total} guides` }),
  },
};

/**
 * Bookable supply around a destination (GET /destinations/:slug/{properties|experiences|guides}); nothing when
 * the API has none. With more than shown, links on to the full list.
 * @param {{ kind: 'properties'|'experiences'|'guides', items: Array<object>, total: number, sectionId: string,
 *   destination: { slug: string, district?: { slug: string, name: string }|null } }} props
 */
export default function DestinationSupply({ kind, items, total, sectionId, destination }) {
  if (!items.length) return null;
  const config = KINDS[kind];
  const more = total > items.length ? config.more(destination, total) : null;
  return (
    <Section id={sectionId} title={config.title} description={total > items.length ? `${config.description} Showing ${items.length} of ${total}.` : config.description}>
      <div className="flex flex-col gap-5">
        <CardGrid items={items} getKey={(item) => item.id} columns={4} label={config.title} renderItem={config.render} />
        {more ? (
          <div>
            <ButtonLink href={more.href} variant="outline">
              {more.label}
            </ButtonLink>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
