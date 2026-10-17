import Container from '@/components/layout/Container';
import { ButtonLink } from '@/components/ui/Button';
import ImageFrame from '@/components/data-display/ImageFrame';

/**
 * `hero`: heading over the CMS image (or a brand-colour panel when the image is missing/private).
 * @param {{ heading: string, subheading?: string|null, image: object|null, cta: { label: string, href: string }|null,
 *   headingLevel?: 1|2, sectionId: string }} props
 */
export default function HeroSection({ heading, subheading, image, cta, headingLevel = 2, sectionId }) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <section id={sectionId} aria-labelledby={`${sectionId}-heading`} className="relative isolate overflow-hidden bg-primary text-on-primary">
      {image ? (
        <div className="absolute inset-0 -z-10">
          <ImageFrame image={image} ratio="fill" priority sizes="100vw" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/20" />
        </div>
      ) : null}
      <Container className="flex min-h-[26rem] flex-col justify-end gap-4 py-14 md:min-h-[32rem] md:py-20">
        <Heading id={`${sectionId}-heading`} className="max-w-3xl text-4xl font-bold text-white md:text-6xl">
          {heading}
        </Heading>
        {subheading ? <p className="max-w-2xl text-lg text-white/90 md:text-xl">{subheading}</p> : null}
        {cta ? (
          <div className="mt-2">
            <ButtonLink href={cta.href} size="lg" variant="secondary">
              {cta.label}
            </ButtonLink>
          </div>
        ) : null}
      </Container>
    </section>
  );
}
