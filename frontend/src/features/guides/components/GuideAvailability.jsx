'use client';

import { useState } from 'react';
import Alert from '@/components/feedback/Alert';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { AvailabilityResult } from '@/features/supply/components/LiveAvailability';
import { useAvailability } from '@/features/supply/hooks/useAvailability';
import { addDays, formatDate } from '@/lib/formatting/dates';
import { plural } from '@/lib/formatting/plural';
import { defaultGuideWindow, guideWindowSchema, MAX_GUIDE_WINDOW_DAYS } from '../schemas/guideQuery';
import { guidesService } from '../services/guidesService';

const clock = (time) => time.slice(0, 5);

/** API slots → [{ date, slots }] in date and start-time order (blocked windows kept, labelled as such). */
export function groupSlots(slots) {
  const byDate = new Map();
  for (const slot of [...slots].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))) {
    if (!byDate.has(slot.date)) byDate.set(slot.date, []);
    byDate.get(slot.date).push(slot);
  }
  return [...byDate].map(([date, items]) => ({ date, slots: items }));
}

/**
 * Live guide availability (GET /guides/:id/availability via the BFF): the time windows the guide has published
 * for the chosen dates. Starts with the next 14 days (the backend default).
 * @param {{ guideId: string, today: string }} props
 */
export default function GuideAvailability({ guideId, today }) {
  const schema = guideWindowSchema(today);
  const [range, setRange] = useState(() => {
    const window = defaultGuideWindow(today);
    return { start: window.from, end: window.to };
  });
  const [error, setError] = useState(null);
  const [params, setParams] = useState(() => ({ guideId, ...defaultGuideWindow(today) }));
  const query = useAvailability(['guides', guideId, 'availability'], guidesService.availability, params);

  const submit = (event) => {
    event.preventDefault();
    const parsed = schema.safeParse({ from: range.start, to: range.end });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError(null);
    setParams({ guideId, ...parsed.data });
  };

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={submit} noValidate aria-label="Check guide availability" className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4">
        <DateRangePicker legend="Dates" startLabel="From" endLabel="To" value={range} onChange={setRange} min={today} max={addDays(today, 365)} required hint={`Up to ${MAX_GUIDE_WINDOW_DAYS} days per check.`} error={error} />
        <div>
          <Button type="submit" loading={query.isFetching}>
            Show availability
          </Button>
        </div>
      </form>
      <AvailabilityResult query={query} loadingLabel="Loading the guide’s calendar">
        {(data) => {
          const days = groupSlots(data.slots);
          const open = data.slots.filter((slot) => slot.status !== 'blocked').length;
          return (
            <div className="flex flex-col gap-3">
              <p role="status" className="text-sm font-medium">{`${formatDate(data.from)} – ${formatDate(data.to)} · ${plural(open, 'open time window')}`}</p>
              {days.length ? (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Available dates">
                  {days.map((day) => (
                    <li key={day.date} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
                      <h3 className="font-sans text-base font-semibold">
                        <time dateTime={day.date}>{formatDate(day.date)}</time>
                      </h3>
                      <ul className="flex flex-col gap-1.5 text-sm">
                        {day.slots.map((slot) => (
                          <li key={`${slot.startTime}-${slot.endTime}`} className="flex items-center justify-between gap-2">
                            <span>{`${clock(slot.startTime)} – ${clock(slot.endTime)}`}</span>
                            {slot.status === 'blocked' ? <Badge>Unavailable</Badge> : <Badge tone="success">Open</Badge>}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <Alert tone="info">The guide has not published any time for these dates. Try later dates.</Alert>
              )}
            </div>
          );
        }}
      </AvailabilityResult>
    </div>
  );
}
