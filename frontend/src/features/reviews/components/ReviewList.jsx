import { Stars } from '@/components/data-display/Rating';
import Badge from '@/components/ui/Badge';
import { formatInstant } from '@/lib/formatting/dates';

/**
 * Approved public reviews (API Review). "Verified stay/visit" only when the backend marks it verified.
 * @param {{ reviews: Array<{ id: string, rating: number, title?: string|null, comment?: string|null, verified: boolean,
 *   author: { displayName: string }, createdAt: string }>, headingLevel?: 3|4 }} props
 */
export default function ReviewList({ reviews, headingLevel = 3 }) {
  if (!reviews.length) return null;
  const Heading = `h${headingLevel}`;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {reviews.map((review) => (
        <li key={review.id} className="flex flex-col gap-1.5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Stars value={review.rating} />
            {review.verified ? <Badge tone="success">Verified booking</Badge> : null}
          </div>
          {review.title ? <Heading className="font-sans text-base font-semibold">{review.title}</Heading> : null}
          {review.comment ? <p className="whitespace-pre-line text-sm">{review.comment}</p> : null}
          <p className="text-xs text-muted">
            {review.author.displayName} · <time dateTime={review.createdAt}>{formatInstant(review.createdAt)}</time>
          </p>
        </li>
      ))}
    </ul>
  );
}
