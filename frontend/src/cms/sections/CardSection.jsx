import CardGrid from '@/components/data-display/CardGrid';
import Section from '@/components/layout/Section';
import TextLink from '@/components/ui/TextLink';

/**
 * Shared shell for live-card sections. Renders nothing when the backend returned no public items: no
 * placeholder or invented cards (W22).
 * @param {{ heading: string, items: Array<object>, renderItem: (item) => React.ReactNode, getKey?: (item) => string,
 *   viewAll?: { href: string, label: string }, columns?: 2|3|4, tone?: string, sectionId: string }} props
 */
export default function CardSection({ heading, items, renderItem, getKey = (item) => item.id, viewAll, columns = 3, tone = 'default', sectionId }) {
  if (!items.length) return null;
  return (
    <Section id={sectionId} title={heading} tone={tone}>
      <CardGrid items={items} getKey={getKey} renderItem={renderItem} columns={columns} label={heading} />
      {viewAll ? (
        <p className="mt-6">
          <TextLink href={viewAll.href} variant="standalone">
            {viewAll.label}
          </TextLink>
        </p>
      ) : null}
    </Section>
  );
}
