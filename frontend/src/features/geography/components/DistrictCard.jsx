import LinkCard from '@/components/data-display/LinkCard';

/**
 * Card for an API District (region shown as context).
 * @param {{ district: { name: string, slug: string, description?: string|null, region?: { name: string } | null },
 *   headingLevel?: 2|3|4 }} props
 */
export default function DistrictCard({ district, headingLevel = 3 }) {
  return (
    <LinkCard href={`/districts/${district.slug}`} title={district.name} headingLevel={headingLevel} eyebrow={district.region?.name}>
      {district.description ? <p className="line-clamp-2">{district.description}</p> : null}
    </LinkCard>
  );
}
