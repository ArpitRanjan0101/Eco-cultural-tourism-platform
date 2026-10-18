import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import AboutSection from '@/components/data-display/AboutSection';
import PageLoading from '@/components/feedback/PageLoading';
import Container from '@/components/layout/Container';
import Badge from '@/components/ui/Badge';
import { GuideAvailability, guideExperience, GuideFacts, GuideServices } from '@/features/guides';
import { getGuide } from '@/features/guides/server/guides.server';
import { ReviewsSection } from '@/features/reviews';
import { getReviews } from '@/features/reviews/server/reviews.server';
import { LiveAvailability, SupplyHero } from '@/features/supply';
import { todayInKolkata } from '@/lib/formatting/dates';

const summaryOf = (guide) => [guide.partner?.businessName, guide.destinations.length ? `Guides at ${guide.destinations.map((d) => d.name).join(', ')}` : null].filter(Boolean).join(' · ');

export async function generateMetadata({ params }) {
  const guide = await getGuide((await params).id);
  if (!guide) return {};
  const description = `${guide.displayName}, verified local guide in Jharkhand${guide.languages.length ? ` speaking ${guide.languages.map((l) => l.name).join(', ')}` : ''}. Services and open dates.`;
  return {
    title: `${guide.displayName} — local guide`,
    description,
    alternates: { canonical: `/guides/${guide.id}` },
    openGraph: { title: guide.displayName, description, images: guide.photo ? [{ url: guide.photo.url, alt: guide.photo.altText ?? guide.displayName }] : undefined },
  };
}

async function GuideReviews({ guideId }) {
  const reviews = await getReviews('guide', guideId);
  return <ReviewsSection title="Traveller reviews" reviews={reviews.data} rating={reviews.meta.rating} total={reviews.meta.total} />;
}

export default async function GuidePage({ params }) {
  const guide = await getGuide((await params).id);
  if (!guide) notFound();
  return (
    <>
      <SupplyHero
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Guides', href: '/guides' }, { label: guide.displayName }]}
        eyebrow={guideExperience(guide.yearsExperience)}
        title={guide.displayName}
        summary={summaryOf(guide) || null}
        image={guide.photo}
        imageRatio="square"
        badges={guide.languages.map((language) => (
          <Badge key={language.id} tone="primary" size="md">
            {language.name}
          </Badge>
        ))}
      />
      <Container className="grid gap-8 py-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AboutSection title={`About ${guide.displayName}`} text={guide.bio} />
        <GuideFacts guide={guide} />
      </Container>
      <GuideServices services={guide.services} />
      <LiveAvailability title="Open dates" description="Time windows the guide has published. Your booking is confirmed against the guide’s live calendar.">
        <GuideAvailability guideId={guide.id} today={todayInKolkata()} />
      </LiveAvailability>
      <Suspense fallback={<PageLoading label="Loading reviews" />}>
        <GuideReviews guideId={guide.id} />
      </Suspense>
    </>
  );
}
