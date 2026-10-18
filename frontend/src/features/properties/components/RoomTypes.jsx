import ImageFrame from '@/components/data-display/ImageFrame';
import Money from '@/components/data-display/Money';
import PlainText from '@/components/data-display/PlainText';
import Section from '@/components/layout/Section';
import Badge from '@/components/ui/Badge';
import { plural } from '@/lib/formatting/plural';

/**
 * Room types from the stay detail (API rooms; inactive ones are not offered). Prices are the API base price per
 * room per night; date-specific prices come from the live availability check.
 * @param {{ rooms: Array<{ id: string, name: string, description?: string|null, maxAdults: number,
 *   maxChildren: number, basePrice: string, currency: string, status: string, amenities: Array<object>,
 *   images: Array<object> }> }} props
 */
export default function RoomTypes({ rooms }) {
  const active = rooms.filter((room) => room.status === 'active');
  if (!active.length) return null;
  return (
    <Section id="rooms" title="Rooms" spacing="sm">
      <ul className="flex flex-col gap-4" aria-label="Room types">
        {active.map((room) => (
          <li key={room.id} className="grid gap-4 rounded-lg border border-border bg-surface-raised p-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            <ImageFrame image={room.images[0] ?? null} alt={room.images[0]?.altText ?? ''} ratio="photo" sizes="(min-width: 640px) 12rem, 100vw" className="rounded-md" />
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-sans text-lg font-semibold">{room.name}</h3>
                <p className="text-sm">
                  <Money amount={room.basePrice} currency={room.currency} from className="text-text" />
                  <span className="text-muted"> per night</span>
                </p>
              </div>
              <p className="text-sm text-muted">{`Up to ${plural(room.maxAdults, 'adult')}${room.maxChildren ? ` and ${plural(room.maxChildren, 'child', 'children')}` : ''}`}</p>
              <PlainText text={room.description} className="text-sm" />
              {room.amenities.length ? (
                <ul className="flex flex-wrap gap-1.5" aria-label={`${room.name} amenities`}>
                  {room.amenities.map((amenity) => (
                    <li key={amenity.id}>
                      <Badge>{amenity.name}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
