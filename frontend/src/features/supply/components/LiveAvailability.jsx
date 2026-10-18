import Alert from '@/components/feedback/Alert';
import Section from '@/components/layout/Section';
import Spinner from '@/components/ui/Spinner';

/** Visitor-facing text for a failed availability check (ApiError from the BFF). Backend messages are shown for
 * 422 because they name the rule that failed (e.g. too many nights); internals never are. */
export function availabilityErrorText(error) {
  if (error?.status === 429) {
    const seconds = Number(error.retryAfter);
    return `Too many availability checks from your connection. Please try again ${Number.isFinite(seconds) && seconds > 0 ? `in ${seconds} seconds` : 'in a minute'}.`;
  }
  if (error?.status === 404) return 'This listing is no longer available.';
  if (error?.status === 422) {
    const detail = error.details?.find((item) => item?.message)?.message;
    return detail ? `Please check your choice: ${detail}.` : error.message;
  }
  return `Availability could not be loaded right now. Please try again.${error?.requestId ? ` Reference: ${error.requestId}` : ''}`;
}

/**
 * State of a live availability query (TanStack Query result): spinner while the first answer loads, an
 * explained error, then `children(data)`. While a new check runs the previous answer stays, marked busy.
 * @param {{ query: { data?: unknown, error?: object, isError: boolean, isFetching: boolean }, loadingLabel: string,
 *   children: (data) => React.ReactNode }} props
 */
export function AvailabilityResult({ query, loadingLabel, children }) {
  if (query.isError) return <Alert tone="danger">{availabilityErrorText(query.error)}</Alert>;
  if (query.data === undefined) return query.isFetching ? <Spinner label={loadingLabel} /> : null;
  return (
    <div aria-busy={query.isFetching || undefined} className={query.isFetching ? 'opacity-60 transition-opacity' : undefined}>
      {children(query.data)}
    </div>
  );
}

/**
 * "Availability" section around a live check. The note is the backend's rule (W4): live figures are indicative
 * and booking re-checks them.
 * @param {{ title?: string, description?: string, children: React.ReactNode }} props
 */
export default function LiveAvailability({ title = 'Availability and prices', description, children }) {
  return (
    <Section id="availability" title={title} description={description ?? 'Live from the partner’s calendar. Seats, rooms and prices are confirmed again when you book.'} tone="muted">
      <div className="flex flex-col gap-5">{children}</div>
    </Section>
  );
}
