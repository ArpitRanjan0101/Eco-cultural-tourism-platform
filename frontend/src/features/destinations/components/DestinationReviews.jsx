import { ReviewsSection } from '@/features/reviews';

/**
 * Approved reviews and the rating summary for a destination (GET /destinations/:slug/reviews).
 * @param {{ reviews: Array<object>, rating: object|null, total: number }} props
 */
export default function DestinationReviews({ reviews, rating, total }) {
  return <ReviewsSection title="Visitor reviews" reviews={reviews} rating={rating} total={total} />;
}
