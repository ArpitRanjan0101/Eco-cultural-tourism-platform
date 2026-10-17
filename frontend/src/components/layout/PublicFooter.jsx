import NavItemLink from '@/components/navigation/NavItemLink';
import Container from './Container';

const LINK = 'text-sm text-muted hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus rounded-sm';

/**
 * Site footer driven by the CMS footer menu: top-level items with children become titled columns; leaf items
 * are grouped in an untitled column.
 * @param {{ siteName: string, description: string, items: Array<{ id: string, label: string, href: string,
 *   external?: boolean, children: Array<object> }>, year?: number }} props
 */
export default function PublicFooter({ siteName, description, items, year = new Date().getFullYear() }) {
  const columns = items.filter((item) => item.children.length);
  const leaves = items.filter((item) => !item.children.length);
  return (
    <footer className="mt-16 border-t border-border bg-surface-muted">
      <Container className="grid gap-10 py-12 md:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
        <div className="flex flex-col gap-3">
          <p className="font-display text-lg font-bold text-primary">{siteName}</p>
          <p className="max-w-sm text-sm text-muted">{description}</p>
        </div>
        {columns.map((column) => (
          <nav key={column.id} aria-label={column.label}>
            <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text">{column.label}</h2>
            <ul className="flex flex-col gap-2">
              {column.children.map((child) => (
                <li key={child.id}>
                  <NavItemLink item={child} className={LINK} />
                </li>
              ))}
            </ul>
          </nav>
        ))}
        {leaves.length ? (
          <nav aria-label="Footer">
            <ul className="flex flex-col gap-2">
              {leaves.map((item) => (
                <li key={item.id}>
                  <NavItemLink item={item} className={LINK} />
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </Container>
      <div className="border-t border-border">
        <Container className="py-4 text-xs text-muted">
          © {year} {siteName}
        </Container>
      </div>
    </footer>
  );
}
