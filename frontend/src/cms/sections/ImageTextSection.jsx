import ImageFrame from '@/components/data-display/ImageFrame';
import Container from '@/components/layout/Container';
import { ButtonLink } from '@/components/ui/Button';
import { cx } from '@/lib/cx';
import Markdown from '../Markdown';

/**
 * `image_text`: editorial block — Markdown beside an image, image on the start or end side (stacked on mobile).
 * @param {{ heading: string, markdown: string, image: object|null, imagePosition: 'start'|'end',
 *   cta: { label: string, href: string }|null, sectionId: string }} props
 */
export default function ImageTextSection({ heading, markdown, image, imagePosition, cta, sectionId }) {
  return (
    <section id={sectionId} aria-labelledby={`${sectionId}-heading`} className="py-10 md:py-14">
      <Container className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
        <div className={cx(imagePosition === 'end' && 'md:order-2')}>
          <ImageFrame image={image} ratio="photo" sizes="(min-width: 768px) 50vw, 100vw" className="rounded-lg shadow-md" />
        </div>
        <div className="flex flex-col gap-4">
          <h2 id={`${sectionId}-heading`} className="text-2xl font-semibold md:text-3xl">
            {heading}
          </h2>
          <Markdown>{markdown}</Markdown>
          {cta ? (
            <div>
              <ButtonLink href={cta.href} variant="outline">
                {cta.label}
              </ButtonLink>
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
