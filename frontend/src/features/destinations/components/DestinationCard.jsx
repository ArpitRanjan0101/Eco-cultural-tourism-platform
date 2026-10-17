import ImageFrame from '@/components/data-display/ImageFrame';
import LinkCard from '@/components/data-display/LinkCard';
import Money from '@/components/data-display/Money';
import Badge from '@/components/ui/Badge';

/**
 * Card for an API DestinationCard.
 * @param {{ destination: { name: string, slug: string, summary?: string|null, entryFee?: string|null,
 *   district?: { name: string } | null, coverImage?: object|null, categories?: Array<{ id: string, name: string }> },
 *   headingLevel?: 2|3|4 }} props
 */
export default function DestinationCard({ destination, headingLevel = 3 }) {
  return (
    <LinkCard
      href={`/destinations/${destination.slug}`}
      title={destination.name}
      headingLevel={headingLevel}
      eyebrow={destination.district?.name}
      media={<ImageFrame image={destination.coverImage} alt="" />}
      footer={destination.entryFee ? <Money amount={destination.entryFee} fallback="" className="text-text" /> : null}
    >
      {destination.summary ? <p className="line-clamp-3">{destination.summary}</p> : null}
      {destination.categories?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {destination.categories.slice(0, 3).map((category) => (
            <Badge key={category.id} tone="primary">
              {category.name}
            </Badge>
          ))}
        </div>
      ) : null}
    </LinkCard>
  );
}
