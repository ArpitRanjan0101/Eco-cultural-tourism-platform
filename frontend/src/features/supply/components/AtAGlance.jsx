/**
 * Key facts beside a detail page's description. Only facts the API provides: entries with an empty value are
 * left out instead of being shown as guesses.
 * @param {{ title?: string, facts: Array<{ label: string, value: React.ReactNode }|null|false>, children?: React.ReactNode }} props
 */
export default function AtAGlance({ title = 'At a glance', facts, children }) {
  const shown = facts.filter((fact) => fact && fact.value !== null && fact.value !== undefined && fact.value !== '');
  return (
    <section aria-labelledby="glance-heading" className="flex flex-col gap-4 self-start rounded-lg border border-border bg-surface-raised p-5">
      <h2 id="glance-heading" className="text-xl font-semibold">
        {title}
      </h2>
      <dl className="flex flex-col gap-3 text-sm">
        {shown.map((fact) => (
          <div key={fact.label}>
            <dt className="font-semibold">{fact.label}</dt>
            <dd className="text-muted">{fact.value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}
