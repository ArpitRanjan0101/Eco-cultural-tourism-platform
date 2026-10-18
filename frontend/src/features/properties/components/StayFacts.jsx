import Money from '@/components/data-display/Money';
import { osmLink } from '@/components/maps/places';
import TextLink from '@/components/ui/TextLink';
import { AtAGlance } from '@/features/supply';
import { PROPERTY_TYPE_LABELS } from '../schemas/propertyQuery';

// "14:00:00" → "14:00" (the API returns times of day without a date).
const clock = (time) => (typeof time === 'string' ? time.slice(0, 5) : null);

/**
 * Key facts of a stay from the API detail; facts it does not provide are left out.
 * @param {{ property: object }} props API PropertyDetail
 */
export default function StayFacts({ property }) {
  return (
    <AtAGlance
      facts={[
        { label: 'Type of stay', value: PROPERTY_TYPE_LABELS[property.propertyType] },
        { label: 'Prices', value: <Money amount={property.startingPrice} currency={property.currency} from fallback="Ask for dates below" /> },
        { label: 'Check-in', value: clock(property.checkInTime) && `From ${clock(property.checkInTime)}` },
        { label: 'Check-out', value: clock(property.checkOutTime) && `Until ${clock(property.checkOutTime)}` },
        { label: 'Address', value: property.address },
        {
          label: 'Phone',
          value: property.contactPhone ? (
            <TextLink href={`tel:${property.contactPhone.replace(/[^+\d]/g, '')}`} variant="inline">
              {property.contactPhone}
            </TextLink>
          ) : null,
        },
        {
          label: 'Near',
          value: property.destination ? (
            <TextLink href={`/destinations/${property.destination.slug}`} variant="inline">
              {property.destination.name}
            </TextLink>
          ) : null,
        },
        {
          label: 'District',
          value: property.district ? (
            <TextLink href={`/districts/${property.district.slug}`} variant="inline">
              {property.district.name}
            </TextLink>
          ) : null,
        },
        {
          label: 'Location',
          value: property.location ? (
            <TextLink href={osmLink(property.location)} external variant="inline">
              Open in OpenStreetMap
            </TextLink>
          ) : null,
        },
      ]}
    />
  );
}
