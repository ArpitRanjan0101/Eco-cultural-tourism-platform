import ImageFrame from '@/components/data-display/ImageFrame';
import Section from '@/components/layout/Section';
import TextLink from '@/components/ui/TextLink';
import { isExternalHref } from '../links';

/**
 * `cultural_highlights`: editorial stories (festivals, crafts, dances) written by CMS editors.
 * @param {{ heading: string, intro?: string|null, items: Array<{ title: string, text: string, image: object|null,
 *   cta: { label: string, href: string }|null }>, sectionId: string }} props
 */
export default function CulturalHighlightsSection({ heading, intro, items, sectionId }) {
  return (
    <Section id={sectionId} title={heading} description={intro ?? undefined}>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, index) => (
          <li key={`${item.title}-${index}`} className="flex flex-col gap-3">
            <ImageFrame image={item.image} ratio="portrait" className="rounded-lg" />
            <h3 className="font-display text-lg font-semibold">{item.title}</h3>
            <p className="text-sm text-muted">{item.text}</p>
            {item.cta ? (
              <TextLink href={item.cta.href} external={isExternalHref(item.cta.href)} variant="standalone" className="mt-auto">
                {item.cta.label}
              </TextLink>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}
