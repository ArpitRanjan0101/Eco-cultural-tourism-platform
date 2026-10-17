import Section from '@/components/layout/Section';
import { CategoryCard } from '@/features/geography';

/** `category_grid`: active destination categories, each opening the filtered destination list. */
export default function CategoryGridSection({ heading, categories, sectionId }) {
  if (!categories.length) return null;
  return (
    <Section id={sectionId} title={heading}>
      <ul aria-label={heading} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((category) => (
          <li key={category.id}>
            <CategoryCard category={category} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
