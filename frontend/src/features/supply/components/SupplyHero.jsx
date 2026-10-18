import ImageFrame from '@/components/data-display/ImageFrame';
import Container from '@/components/layout/Container';
import Breadcrumbs from '@/components/navigation/Breadcrumbs';

/**
 * Detail header shared by stays, guides, experiences and packages: breadcrumbs, the page h1, an eyebrow, a short
 * summary, badges and the API cover image (or a neutral surface, never a stand-in photo).
 * @param {{ breadcrumbs: Array<{ label: string, href?: string }>, title: string, eyebrow?: string|null,
 *   summary?: React.ReactNode, badges?: React.ReactNode, image?: object|null, imageRatio?: 'photo'|'square' }} props
 */
export default function SupplyHero({ breadcrumbs, title, eyebrow, summary, badges, image, imageRatio = 'photo' }) {
  return (
    <Container className="flex flex-col gap-6 py-6 md:py-8">
      <Breadcrumbs items={breadcrumbs} />
      <div className={`grid gap-6 lg:items-center ${imageRatio === 'square' ? 'lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]'}`}>
        <div className="flex flex-col gap-3">
          {eyebrow ? <p className="text-sm font-semibold uppercase tracking-wide text-accent">{eyebrow}</p> : null}
          <h1 className="text-3xl font-bold md:text-5xl">{title}</h1>
          {summary ? <div className="text-lg text-muted">{summary}</div> : null}
          {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
        </div>
        <ImageFrame image={image} ratio={imageRatio} priority sizes="(min-width: 1024px) 50vw, 100vw" className="rounded-lg shadow-md" />
      </div>
    </Container>
  );
}
