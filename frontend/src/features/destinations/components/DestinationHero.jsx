import ImageFrame from '@/components/data-display/ImageFrame';
import Container from '@/components/layout/Container';
import Badge from '@/components/ui/Badge';
import DestinationBreadcrumbs from './DestinationBreadcrumbs';

/**
 * Destination detail header: breadcrumbs, the page h1, district, categories and the cover image.
 * @param {{ destination: { name: string, summary?: string|null, featured: boolean, coverImage?: object|null,
 *   district?: { name: string, slug: string } | null, categories: Array<{ id: string, name: string }> } }} props
 */
export default function DestinationHero({ destination }) {
  return (
    <Container className="flex flex-col gap-6 py-6 md:py-8">
      <DestinationBreadcrumbs destination={destination} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
        <div className="flex flex-col gap-3">
          {destination.district ? <p className="text-sm font-semibold uppercase tracking-wide text-accent">{destination.district.name}</p> : null}
          <h1 className="text-3xl font-bold md:text-5xl">{destination.name}</h1>
          {destination.summary ? <p className="text-lg text-muted">{destination.summary}</p> : null}
          <div className="flex flex-wrap gap-2">
            {destination.featured ? <Badge tone="accent">Featured</Badge> : null}
            {destination.categories.map((category) => (
              <Badge key={category.id} tone="primary" size="md">
                {category.name}
              </Badge>
            ))}
          </div>
        </div>
        <ImageFrame image={destination.coverImage} ratio="photo" priority sizes="(min-width: 1024px) 55vw, 100vw" className="rounded-lg shadow-md" />
      </div>
    </Container>
  );
}
