import CardGrid from '@/components/data-display/CardGrid';
import { DestinationCard } from '@/features/destinations';
import { ExperienceCard } from '@/features/experiences';
import { DistrictCard } from '@/features/geography';
import { GuideCard } from '@/features/guides';
import { PackageCard } from '@/features/packages';
import { PropertyCard } from '@/features/properties';

// One card per SearchResult variant (OpenAPI oneOf by `type`); unknown variants are skipped, never guessed.
const RENDERERS = {
  destination: (item) => <DestinationCard destination={item} />,
  district: (item) => <DistrictCard district={{ ...item, description: null }} />,
  property: (item) => <PropertyCard property={item} />,
  guide: (item) => <GuideCard guide={item} />,
  experience: (item) => <ExperienceCard experience={item} />,
  package: (item) => <PackageCard pkg={item} />,
};

/**
 * Ranked unified results as typed cards.
 * @param {{ items: Array<{ type: string, id: string }>, label: string }} props
 */
export default function SearchResults({ items, label }) {
  const known = items.filter((item) => RENDERERS[item.type]);
  return <CardGrid items={known} getKey={(item) => `${item.type}-${item.id}`} label={label} renderItem={(item) => RENDERERS[item.type](item)} />;
}
