import ImageFrame from '@/components/data-display/ImageFrame';
import LinkCard from '@/components/data-display/LinkCard';
import Money from '@/components/data-display/Money';
import Badge from '@/components/ui/Badge';

const km = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

/**
 * Primary destination listing card (API DestinationCard).
 * @param {{ destination: { name: string, slug: string, summary?: string|null, entryFee?: string|null, featured?: boolean,
 *   distanceKm?: number, district?: { name: string } | null, coverImage?: object|null,
 *   categories?: Array<{ id: string, name: string }> }, headingLevel?: 2|3|4, showDistance?: boolean }} props
 */
export default function DestinationCard({ destination, headingLevel = 3, showDistance = false }) {
  const distance = showDistance && Number.isFinite(destination.distanceKm) ? `${km.format(destination.distanceKm)} km away` : null;
  return (
    <LinkCard
      href={`/destinations/${destination.slug}`}
      title={destination.name}
      headingLevel={headingLevel}
      eyebrow={[destination.district?.name, distance].filter(Boolean).join(' · ') || undefined}
      media={<ImageFrame image={destination.coverImage} alt="" />}
      footer={destination.entryFee ? <Money amount={destination.entryFee} fallback="" className="text-text" /> : null}
    >
      {destination.summary ? <p className="line-clamp-3">{destination.summary}</p> : null}
      {destination.categories?.length || destination.featured ? (
        <div className="flex flex-wrap gap-1.5">
          {destination.featured ? <Badge tone="accent">Featured</Badge> : null}
          {(destination.categories ?? []).slice(0, 3).map((category) => (
            <Badge key={category.id} tone="primary">
              {category.name}
            </Badge>
          ))}
        </div>
      ) : null}
    </LinkCard>
  );
}
