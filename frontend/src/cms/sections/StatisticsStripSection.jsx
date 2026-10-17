import Section from '@/components/layout/Section';

/**
 * `statistics_strip`: curated figures typed by CMS editors, shown exactly as entered (never computed or
 * invented by the frontend).
 * @param {{ heading?: string|null, items: Array<{ value: string, label: string }>, sectionId: string }} props
 */
export default function StatisticsStripSection({ heading, items, sectionId }) {
  return (
    <Section id={sectionId} title={heading ?? undefined} tone="primary" spacing="sm">
      <dl className="grid grid-cols-2 gap-6 py-4 text-center md:grid-cols-3 lg:grid-cols-6">
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} className="flex flex-col-reverse gap-1">
            <dt className="text-sm opacity-90">{item.label}</dt>
            <dd className="font-display text-3xl font-bold">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
