import ImageFrame from '@/components/data-display/ImageFrame';
import LinkCard from '@/components/data-display/LinkCard';
import Money from '@/components/data-display/Money';
import { humanizeStatus } from '@/components/ui/StatusBadge';
import BookingModeBadge from '@/features/supply/components/BookingModeBadge';

/**
 * Card for an API PropertyCard. The price is the API's indicative starting price; availability and the real
 * price come from a live quote on the stay page (W9).
 * @param {{ property: { name: string, slug: string, propertyType: string, bookingMode: 'instant'|'request',
 *   startingPrice: string|null, currency: string, district?: { name: string } | null, coverImage?: object|null },
 *   headingLevel?: 2|3|4 }} props
 */
export default function PropertyCard({ property, headingLevel = 3 }) {
  return (
    <LinkCard
      href={`/stays/${property.slug}`}
      title={property.name}
      headingLevel={headingLevel}
      eyebrow={humanizeStatus(property.propertyType)}
      media={<ImageFrame image={property.coverImage} alt="" />}
      footer={
        <>
          <Money amount={property.startingPrice} currency={property.currency} from className="text-text" />
          <BookingModeBadge mode={property.bookingMode} />
        </>
      }
    >
      {property.district?.name ? <p>{property.district.name}</p> : null}
    </LinkCard>
  );
}
