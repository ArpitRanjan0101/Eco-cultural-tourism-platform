import Container from '@/components/layout/Container';
import { ButtonLink } from '@/components/ui/Button';

/**
 * Shown while no homepage is published (G5): the site's own name and purpose plus links to its sections.
 * Deliberately content-free — no invented places, prices or figures (W22).
 * @param {{ siteName: string, description: string, links: Array<{ id: string, label: string, href: string }> }} props
 */
export default function HomeFallback({ siteName, description, links }) {
  return (
    <section className="bg-primary-soft">
      <Container className="flex min-h-[60vh] flex-col justify-center gap-6 py-16">
        <h1 className="max-w-3xl text-4xl font-bold text-primary md:text-5xl">{siteName}</h1>
        <p className="max-w-2xl text-lg text-text">{description}</p>
        <ul className="flex flex-wrap gap-3">
          {links.map((link, index) => (
            <li key={link.id}>
              <ButtonLink href={link.href} variant={index === 0 ? 'primary' : 'outline'}>
                {link.label}
              </ButtonLink>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
