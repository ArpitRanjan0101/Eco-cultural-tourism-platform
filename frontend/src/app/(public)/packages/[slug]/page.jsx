import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import AboutSection from '@/components/data-display/AboutSection';
import GallerySection from '@/components/data-display/GallerySection';
import PageLoading from '@/components/feedback/PageLoading';
import Container from '@/components/layout/Container';
import { PackageDepartures, packageDuration, PackageFacts, PackageInclusions, PackageItinerary } from '@/features/packages';
import { getPackage } from '@/features/packages/server/packages.server';
import { ReviewsSection } from '@/features/reviews';
import { getReviews } from '@/features/reviews/server/reviews.server';
import { BookingModeBadge, LiveAvailability, SupplyHero } from '@/features/supply';

export async function generateMetadata({ params }) {
  const pkg = await getPackage((await params).slug);
  if (!pkg) return {};
  const description = pkg.summary ?? `${pkg.name}: ${packageDuration(pkg)} in Jharkhand. Itinerary, inclusions and live departures.`;
  return {
    title: pkg.name,
    description,
    alternates: { canonical: `/packages/${pkg.slug}` },
    openGraph: { title: pkg.name, description, images: pkg.coverImage ? [{ url: pkg.coverImage.url, alt: pkg.coverImage.altText ?? pkg.name }] : undefined },
  };
}

async function PackageReviews({ packageId }) {
  const reviews = await getReviews('package', packageId);
  return <ReviewsSection title="Traveller reviews" reviews={reviews.data} rating={reviews.meta.rating} total={reviews.meta.total} />;
}

export default async function PackagePage({ params }) {
  const pkg = await getPackage((await params).slug);
  if (!pkg) notFound();
  return (
    <>
      <SupplyHero
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Packages', href: '/packages' }, { label: pkg.name }]}
        eyebrow={packageDuration(pkg)}
        title={pkg.name}
        summary={pkg.summary}
        image={pkg.coverImage}
        badges={<BookingModeBadge mode={pkg.bookingMode} size="md" />}
      />
      <Container className="grid gap-8 py-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AboutSection title="About this package" text={pkg.description} />
        <PackageFacts pkg={pkg} />
      </Container>
      <PackageItinerary itinerary={pkg.itinerary} />
      <PackageInclusions inclusions={pkg.inclusions} exclusions={pkg.exclusions} />
      <LiveAvailability title="Departures and seats">
        <PackageDepartures packageId={pkg.id} minTravelers={pkg.minTravelers} maxTravelers={pkg.maxTravelers} />
      </LiveAvailability>
      <GallerySection gallery={pkg.gallery} name={pkg.name} />
      <Suspense fallback={<PageLoading label="Loading reviews" />}>
        <PackageReviews packageId={pkg.id} />
      </Suspense>
    </>
  );
}
