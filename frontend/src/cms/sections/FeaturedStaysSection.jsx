import { PropertyCard } from '@/features/properties';
import CardSection from './CardSection';

/** `featured_stays`: published stays (latest or curated) with API starting prices; live prices on the stay page. */
export default function FeaturedStaysSection({ heading, properties, sectionId }) {
  return (
    <CardSection
      sectionId={sectionId}
      heading={heading}
      items={properties}
      renderItem={(property) => <PropertyCard property={property} />}
      viewAll={{ href: '/stays', label: 'Browse all stays' }}
    />
  );
}
