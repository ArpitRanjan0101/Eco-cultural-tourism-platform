import LinkCard from '@/components/data-display/LinkCard';

/**
 * Region preview (API Region) linking to its districts.
 * @param {{ region: { name: string, slug: string, description?: string|null, districtCount: number }, headingLevel?: 2|3|4 }} props
 */
export default function RegionCard({ region, headingLevel = 3 }) {
  const count = region.districtCount;
  return (
    <LinkCard href={`/districts?region=${region.slug}`} title={region.name} headingLevel={headingLevel} eyebrow={`${count} ${count === 1 ? 'district' : 'districts'}`}>
      {region.description ? <p className="line-clamp-3">{region.description}</p> : null}
    </LinkCard>
  );
}
