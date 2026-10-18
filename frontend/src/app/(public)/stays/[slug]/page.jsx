import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import AboutSection from '@/components/data-display/AboutSection';
import GallerySection from '@/components/data-display/GallerySection';
import PageLoading from '@/components/feedback/PageLoading';
import Container from '@/components/layout/Container';
import Section from '@/components/layout/Section';
import MapView from '@/components/maps/MapView';
import { toMapPlaces } from '@/components/maps/places';
import { AmenityList, PropertyPolicies, PROPERTY_TYPE_LABELS, RoomTypes, StayAvailability, StayFacts } from '@/features/properties';
import { getProperty } from '@/features/properties/server/properties.server';
import { ReviewsSection } from '@/features/reviews';
import { getReviews } from '@/features/reviews/server/reviews.server';
import { BookingModeBadge, LiveAvailability, SupplyHero } from '@/features/supply';
import { todayInKolkata } from '@/lib/formatting/dates';

const describe = (property) => [PROPERTY_TYPE_LABELS[property.propertyType], property.district && `in ${property.district.name}`, 'Jharkhand'].filter(Boolean).join(' ');

export async function generateMetadata({ params }) {
  const property = await getProperty((await params).slug);
  if (!property) return {};
  const description = `${property.name}: ${describe(property)}. Rooms, amenities, policies and live availability.`;
  return {
    title: property.name,
    description,
    alternates: { canonical: `/stays/${property.slug}` },
    openGraph: { title: property.name, description, images: property.coverImage ? [{ url: property.coverImage.url, alt: property.coverImage.altText ?? property.name }] : undefined },
  };
}

async function StayReviews({ propertyId }) {
  const reviews = await getReviews('property', propertyId);
  return <ReviewsSection title="Guest reviews" reviews={reviews.data} rating={reviews.meta.rating} total={reviews.meta.total} />;
}

export default async function StayPage({ params }) {
  const property = await getProperty((await params).slug);
  if (!property) notFound();
  const places = toMapPlaces([property], { href: () => `/stays/${property.slug}`, subtitle: () => property.address ?? null });
  return (
    <>
      <SupplyHero
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Stays', href: '/stays' },
          ...(property.district ? [{ label: property.district.name, href: `/stays?district=${property.district.slug}` }] : []),
          { label: property.name },
        ]}
        eyebrow={describe(property)}
        title={property.name}
        summary={property.address}
        image={property.coverImage}
        badges={<BookingModeBadge mode={property.bookingMode} size="md" />}
      />
      <Container className="grid gap-8 py-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AboutSection title="About this stay" text={property.description} />
        <StayFacts property={property} />
      </Container>
      <LiveAvailability>
        <StayAvailability propertyId={property.id} today={todayInKolkata()} />
      </LiveAvailability>
      <RoomTypes rooms={property.rooms} />
      <AmenityList amenities={property.amenities} />
      <PropertyPolicies policies={property.policies} />
      <GallerySection gallery={property.gallery} name={property.name} />
      {places.length ? (
        <Section id="location" title="Location" spacing="sm">
          <MapView places={places} label={`Map: ${property.name}`} />
        </Section>
      ) : null}
      <Suspense fallback={<PageLoading label="Loading reviews" />}>
        <StayReviews propertyId={property.id} />
      </Suspense>
    </>
  );
}
