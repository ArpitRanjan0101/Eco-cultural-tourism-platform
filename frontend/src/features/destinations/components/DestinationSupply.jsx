import CardGrid from '@/components/data-display/CardGrid';
import Section from '@/components/layout/Section';
import { ExperienceCard } from '@/features/experiences';
import { GuideCard } from '@/features/guides';
import { PropertyCard } from '@/features/properties';

const KINDS = {
  properties: { title: 'Places to stay nearby', description: 'Published stays linked to this place or within 25 km.', render: (item) => <PropertyCard property={item} /> },
  experiences: { title: 'Experiences here', description: 'Cultural and nature experiences at this destination.', render: (item) => <ExperienceCard experience={item} /> },
  guides: { title: 'Local guides', description: 'Verified guides who work at this destination.', render: (item) => <GuideCard guide={item} /> },
};

/**
 * Bookable supply around a destination (GET /destinations/:slug/{properties|experiences|guides}); nothing when
 * the API has none.
 * @param {{ kind: 'properties'|'experiences'|'guides', items: Array<object>, total: number, sectionId: string }} props
 */
export default function DestinationSupply({ kind, items, total, sectionId }) {
  if (!items.length) return null;
  const config = KINDS[kind];
  return (
    <Section id={sectionId} title={config.title} description={total > items.length ? `${config.description} Showing ${items.length} of ${total}.` : config.description}>
      <CardGrid items={items} getKey={(item) => item.id} columns={4} label={config.title} renderItem={config.render} />
    </Section>
  );
}
