import RatingSummary from '@/components/data-display/Rating';
import Section from '@/components/layout/Section';
import ReviewList from './ReviewList';

/**
 * Approved reviews and the API rating summary for any reviewable item.
 * @param {{ title: string, reviews: Array<object>, rating: object|null, total: number, id?: string }} props
 */
export default function ReviewsSection({ title, reviews, rating, total, id = 'reviews' }) {
  return (
    <Section id={id} title={title} containerSize="md">
      <div className="flex flex-col gap-6">
        <RatingSummary summary={rating} />
        <ReviewList reviews={reviews} />
        {total > reviews.length ? <p className="text-sm text-muted">{`Showing the latest ${reviews.length} of ${total} reviews.`}</p> : null}
      </div>
    </Section>
  );
}
