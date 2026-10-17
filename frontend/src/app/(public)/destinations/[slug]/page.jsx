import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import Container from '@/components/layout/Container';
import PageLoading from '@/components/feedback/PageLoading';
import {
  DestinationFAQ,
  DestinationGallery,
  DestinationHero,
  DestinationOverview,
  DestinationReviews,
  DestinationSupply,
  NearbyDestinations,
  RelatedDestinations,
  VisitorInformation,
} from '@/features/destinations';
import { getDestination, getDestinationReviews, getDestinationSupply, getNearbyDestinations } from '@/features/destinations/server/destinations.server';

const NEARBY_RADIUS_KM = 50;

export async function generateMetadata({ params }) {
  const destination = await getDestination((await params).slug);
  if (!destination) return {};
  const description = destination.summary ?? `Visit ${destination.name}${destination.district ? ` in ${destination.district.name}` : ''}, Jharkhand.`;
  return {
    title: destination.name,
    description,
    alternates: { canonical: `/destinations/${destination.slug}` },
    openGraph: {
      title: destination.name,
      description,
      type: 'article',
      images: destination.coverImage ? [{ url: destination.coverImage.url, alt: destination.coverImage.altText ?? destination.name }] : undefined,
    },
  };
}

// Secondary content streams in after the main destination (which decides 404 before streaming starts, W29).
async function DestinationSurroundings({ destination }) {
  const [nearby, properties, experiences, guides, reviews] = await Promise.all([
    getNearbyDestinations(destination.slug, { radiusKm: NEARBY_RADIUS_KM }),
    getDestinationSupply(destination.slug, 'properties'),
    getDestinationSupply(destination.slug, 'experiences'),
    getDestinationSupply(destination.slug, 'guides'),
    getDestinationReviews(destination.slug),
  ]);
  return (
    <>
      <NearbyDestinations destination={destination} nearby={nearby.data} radiusKm={NEARBY_RADIUS_KM} />
      <DestinationSupply sectionId="stays" kind="properties" items={properties.data} total={properties.meta.total} />
      <DestinationSupply sectionId="experiences" kind="experiences" items={experiences.data} total={experiences.meta.total} />
      <DestinationSupply sectionId="guides" kind="guides" items={guides.data} total={guides.meta.total} />
      <DestinationReviews reviews={reviews.data} rating={reviews.meta.rating} total={reviews.meta.total} />
    </>
  );
}

export default async function DestinationPage({ params }) {
  const destination = await getDestination((await params).slug);
  if (!destination) notFound();
  return (
    <>
      <DestinationHero destination={destination} />
      <Container className="grid gap-8 py-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DestinationOverview description={destination.description} />
        <VisitorInformation destination={destination} />
      </Container>
      <DestinationGallery gallery={destination.gallery} name={destination.name} />
      <DestinationFAQ faqs={destination.faqs} />
      <RelatedDestinations related={destination.related} />
      <Suspense fallback={<PageLoading label="Loading nearby places, stays and reviews" />}>
        <DestinationSurroundings destination={destination} />
      </Suspense>
    </>
  );
}
