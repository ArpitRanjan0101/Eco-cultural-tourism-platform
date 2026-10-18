import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import AboutSection from '@/components/data-display/AboutSection';
import GallerySection from '@/components/data-display/GallerySection';
import PageLoading from '@/components/feedback/PageLoading';
import Container from '@/components/layout/Container';
import { ExperienceFacts, ExperienceSessions } from '@/features/experiences';
import { getExperience } from '@/features/experiences/server/experiences.server';
import { ReviewsSection } from '@/features/reviews';
import { getReviews } from '@/features/reviews/server/reviews.server';
import { BookingModeBadge, LiveAvailability, SupplyHero } from '@/features/supply';
import { formatDuration, todayInKolkata } from '@/lib/formatting/dates';

export async function generateMetadata({ params }) {
  const experience = await getExperience((await params).slug);
  if (!experience) return {};
  const description = `${experience.name}${experience.destination ? ` at ${experience.destination.name}` : ''}, Jharkhand. Duration, group size and live session availability.`;
  return {
    title: experience.name,
    description,
    alternates: { canonical: `/experiences/${experience.slug}` },
    openGraph: { title: experience.name, description, images: experience.coverImage ? [{ url: experience.coverImage.url, alt: experience.coverImage.altText ?? experience.name }] : undefined },
  };
}

async function ExperienceReviews({ experienceId }) {
  const reviews = await getReviews('experience', experienceId);
  return <ReviewsSection title="Traveller reviews" reviews={reviews.data} rating={reviews.meta.rating} total={reviews.meta.total} />;
}

export default async function ExperiencePage({ params }) {
  const experience = await getExperience((await params).slug);
  if (!experience) notFound();
  return (
    <>
      <SupplyHero
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Experiences', href: '/experiences' }, { label: experience.name }]}
        eyebrow={[experience.destination?.name, formatDuration(experience.durationMinutes)].filter(Boolean).join(' · ')}
        title={experience.name}
        summary={experience.partner ? `Hosted by ${experience.partner.businessName}` : null}
        image={experience.coverImage}
        badges={<BookingModeBadge mode={experience.bookingMode} size="md" />}
      />
      <Container className="grid gap-8 py-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AboutSection title="About this experience" text={experience.description} />
        <ExperienceFacts experience={experience} />
      </Container>
      <LiveAvailability title="Sessions and seats">
        <ExperienceSessions experienceId={experience.id} today={todayInKolkata()} minParticipants={experience.minParticipants} maxParticipants={experience.maxParticipants} />
      </LiveAvailability>
      <GallerySection gallery={experience.gallery} name={experience.name} />
      <Suspense fallback={<PageLoading label="Loading reviews" />}>
        <ExperienceReviews experienceId={experience.id} />
      </Suspense>
    </>
  );
}
