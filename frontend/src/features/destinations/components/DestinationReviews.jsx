import RatingSummary from '@/components/data-display/Rating';
import Section from '@/components/layout/Section';
import { ReviewList } from '@/features/reviews';

/**
 * Approved reviews and the rating summary for a destination (GET /destinations/:slug/reviews).
 * @param {{ reviews: Array<object>, rating: object|null, total: number }} props
 */
export default function DestinationReviews({ reviews, rating, total }) {
  return (
    <Section id="reviews" title="Visitor reviews" containerSize="md">
      <div className="flex flex-col gap-6">
        <RatingSummary summary={rating} />
        <ReviewList reviews={reviews} />
        {total > reviews.length ? <p className="text-sm text-muted">{`Showing the latest ${reviews.length} of ${total} reviews.`}</p> : null}
      </div>
    </Section>
  );
}
