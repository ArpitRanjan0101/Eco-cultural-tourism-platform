import { DestinationCard } from '@/features/destinations';
import CardSection from './CardSection';

/** `featured_destinations`: published destination cards resolved by the backend. */
export default function DestinationGridSection({ heading, destinations, sectionId }) {
  return (
    <CardSection
      sectionId={sectionId}
      heading={heading}
      items={destinations}
      renderItem={(destination) => <DestinationCard destination={destination} />}
      viewAll={{ href: '/destinations', label: 'See all destinations' }}
    />
  );
}
