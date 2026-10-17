import { layoutVariants, pickVariant } from '@/config/componentVariants';
import { cx } from '@/lib/cx';
import Container from './Container';

/**
 * Vertical page section with optional heading. Labelled by its heading when `title` is given.
 * @param {{ title?: string, description?: string, headingLevel?: 2|3, spacing?: 'none'|'sm'|'md'|'lg',
 *   tone?: 'default'|'muted'|'raised'|'primary', containerSize?: string, id?: string, className?: string,
 *   children: React.ReactNode }} props
 */
export default function Section({ title, description, headingLevel = 2, spacing = 'md', tone = 'default', containerSize = 'lg', id, className, children }) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const headingId = title && id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cx(
        pickVariant(layoutVariants.sectionSpacing, spacing, 'md', 'Section spacing'),
        pickVariant(layoutVariants.sectionTone, tone, 'default', 'Section tone'),
        className,
      )}
    >
      <Container size={containerSize}>
        {title ? (
          <header className="mb-6 max-w-2xl">
            <Heading id={headingId} className="text-2xl font-semibold md:text-3xl">
              {title}
            </Heading>
            {description ? <p className={cx('mt-2', tone === 'primary' ? 'opacity-90' : 'text-muted')}>{description}</p> : null}
          </header>
        ) : null}
        {children}
      </Container>
    </section>
  );
}
