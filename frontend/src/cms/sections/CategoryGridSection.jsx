import Link from 'next/link';
import Section from '@/components/layout/Section';

/** `category_grid`: active destination categories, each opening the filtered destination list. */
export default function CategoryGridSection({ heading, categories, sectionId }) {
  if (!categories.length) return null;
  return (
    <Section id={sectionId} title={heading}>
      <ul aria-label={heading} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href={`/destinations?category=${encodeURIComponent(category.slug)}`}
              className="flex h-full flex-col gap-1 rounded-lg border border-border bg-surface-raised p-4 transition-colors hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-focus"
            >
              <span className="font-semibold text-text">{category.name}</span>
              {/* Space keeps the accessible name readable ("Waterfalls Falling water", not "WaterfallsFalling…"). */}
              {category.description ? <span className="line-clamp-2 text-sm text-muted"> {category.description}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
