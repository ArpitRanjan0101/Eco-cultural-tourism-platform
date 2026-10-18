import Section from '@/components/layout/Section';

// Backend amenity categories, in display order.
const CATEGORIES = [
  ['general', 'General'],
  ['room', 'In the rooms'],
  ['bathroom', 'Bathroom'],
  ['food', 'Food and drink'],
  ['outdoor', 'Outdoors'],
  ['accessibility', 'Accessibility'],
  ['safety', 'Safety'],
  ['connectivity', 'Connectivity'],
];

/**
 * Property amenities grouped by the API category; only what the partner listed.
 * @param {{ amenities: Array<{ id: string, name: string, category: string }> }} props
 */
export default function AmenityList({ amenities }) {
  const groups = CATEGORIES.map(([category, label]) => ({ category, label, items: amenities.filter((amenity) => amenity.category === category) })).filter((group) => group.items.length);
  if (!groups.length) return null;
  return (
    <Section id="amenities" title="Amenities" spacing="sm">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <div key={group.category} className="flex flex-col gap-2">
            <h3 className="font-sans text-base font-semibold">{group.label}</h3>
            <ul className="flex flex-col gap-1 text-sm text-muted">
              {group.items.map((amenity) => (
                <li key={amenity.id} className="before:mr-2 before:text-success before:content-['✓']">
                  {amenity.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
