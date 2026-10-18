import PlainText from '@/components/data-display/PlainText';
import Section from '@/components/layout/Section';
import TextLink from '@/components/ui/TextLink';

/**
 * Day-by-day itinerary from the API, in day order, with links to the published destinations it visits.
 * @param {{ itinerary: Array<{ dayNumber: number, title: string, description?: string|null,
 *   items: Array<{ activityTitle: string, description?: string|null, destination?: { name: string, slug: string }|null }> }> }} props
 */
export default function PackageItinerary({ itinerary }) {
  if (!itinerary?.length) return null;
  const days = [...itinerary].sort((a, b) => a.dayNumber - b.dayNumber);
  return (
    <Section id="itinerary" title="Itinerary" spacing="sm">
      <ol className="relative flex flex-col gap-6 border-l-2 border-border pl-6" aria-label="Itinerary by day">
        {days.map((day) => (
          <li key={day.dayNumber} className="relative flex flex-col gap-2">
            <span aria-hidden="true" className="absolute -left-[1.95rem] top-1 size-3.5 rounded-full border-2 border-surface bg-primary" />
            <h3 className="font-sans text-lg font-semibold">
              <span className="text-accent">{`Day ${day.dayNumber}`}</span>
              {' · '}
              {day.title}
            </h3>
            <PlainText text={day.description} className="text-sm" />
            {day.items.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {day.items.map((item, index) => (
                  <li key={`${day.dayNumber}-${index}`} className="rounded-md bg-surface-muted p-3">
                    <p className="font-medium">
                      {item.activityTitle}
                      {item.destination ? (
                        <>
                          {' at '}
                          <TextLink href={`/destinations/${item.destination.slug}`} variant="inline">
                            {item.destination.name}
                          </TextLink>
                        </>
                      ) : null}
                    </p>
                    <PlainText text={item.description} className="text-muted" />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </Section>
  );
}
