import Money from '@/components/data-display/Money';
import PlainText from '@/components/data-display/PlainText';
import Section from '@/components/layout/Section';
import BookingModeBadge from '@/features/supply/components/BookingModeBadge';
import { formatDuration } from '@/lib/formatting/dates';
import { plural } from '@/lib/formatting/plural';

/**
 * A guide's active services from the profile (API GuideService). The price is per booking for the whole group,
 * up to the service's group size (backend prices a guide service once, quantity 1).
 * @param {{ services: Array<{ id: string, title: string, durationMinutes: number, price: string, currency: string,
 *   maxGroupSize: number, description?: string|null, bookingMode: 'instant'|'request', status: string }> }} props
 */
export default function GuideServices({ services }) {
  const active = services.filter((service) => service.status === 'active');
  return (
    <Section id="services" title="Services" spacing="sm">
      {active.length ? (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Guide services">
          {active.map((service) => (
            <li key={service.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-sans text-lg font-semibold">{service.title}</h3>
                <BookingModeBadge mode={service.bookingMode} />
              </div>
              <p className="text-sm text-muted">{[formatDuration(service.durationMinutes), `groups of up to ${plural(service.maxGroupSize, 'person', 'people')}`].filter(Boolean).join(' · ')}</p>
              <PlainText text={service.description} className="text-sm" />
              <p className="mt-auto text-sm">
                <Money amount={service.price} currency={service.currency} className="text-lg text-text" />
                <span className="text-muted"> per group</span>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">This guide has no services open for booking at the moment.</p>
      )}
    </Section>
  );
}
