import Section from '@/components/layout/Section';

function List({ title, items, marker }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-sans text-base font-semibold">{title}</h3>
      {items.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true" className={marker.className}>
                {marker.symbol}
              </span>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nothing listed by the operator.</p>
      )}
    </div>
  );
}

/**
 * What the package price includes and excludes, exactly as the operator lists it.
 * @param {{ inclusions: string[], exclusions: string[] }} props
 */
export default function PackageInclusions({ inclusions, exclusions }) {
  if (!inclusions.length && !exclusions.length) return null;
  return (
    <Section id="inclusions" title="What’s included" spacing="sm">
      <div className="grid gap-6 md:grid-cols-2">
        <List title="Included" items={inclusions} marker={{ symbol: '✓', className: 'text-success' }} />
        <List title="Not included" items={exclusions} marker={{ symbol: '✕', className: 'text-danger' }} />
      </div>
    </Section>
  );
}
