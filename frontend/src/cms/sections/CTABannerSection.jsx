import ImageFrame from '@/components/data-display/ImageFrame';
import Container from '@/components/layout/Container';
import { ButtonLink } from '@/components/ui/Button';

/**
 * `cta_banner`: call to action with optional image.
 * @param {{ heading: string, text: string, image: object|null, cta: { label: string, href: string }, sectionId: string }} props
 */
export default function CTABannerSection({ heading, text, image, cta, sectionId }) {
  return (
    <section id={sectionId} aria-labelledby={`${sectionId}-heading`} className="py-10 md:py-14">
      <Container>
        <div className="grid overflow-hidden rounded-lg bg-accent text-on-accent md:grid-cols-[1fr_minmax(0,24rem)]">
          <div className="flex flex-col gap-4 p-8 md:p-12">
            <h2 id={`${sectionId}-heading`} className="text-2xl font-semibold md:text-3xl">
              {heading}
            </h2>
            <p className="text-lg opacity-95">{text}</p>
            <div>
              <ButtonLink href={cta.href} variant="outline" size="lg" className="border-white bg-white text-accent hover:bg-accent-soft">
                {cta.label}
              </ButtonLink>
            </div>
          </div>
          {image ? <ImageFrame image={image} ratio="fill" sizes="(min-width: 768px) 24rem, 100vw" className="min-h-48" /> : null}
        </div>
      </Container>
    </section>
  );
}
