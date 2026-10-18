'use client';

import { useState } from 'react';
import Alert from '@/components/feedback/Alert';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { AvailabilityResult } from '@/features/supply/components/LiveAvailability';
import SeatList from '@/features/supply/components/SeatList';
import { useAvailability } from '@/features/supply/hooks/useAvailability';
import { formatDate } from '@/lib/formatting/dates';
import { plural } from '@/lib/formatting/plural';
import { travelersSchema } from '../schemas/packageQuery';
import { packagesService } from '../services/packagesService';

/**
 * Live departure availability (GET /packages/:id/availability via the BFF) for a number of travellers.
 * Per-person prices from the API; the booking total is calculated by the backend (W4).
 * @param {{ packageId: string, minTravelers: number, maxTravelers: number }} props
 */
export default function PackageDepartures({ packageId, minTravelers, maxTravelers }) {
  const min = Math.max(1, minTravelers);
  const schema = travelersSchema({ minTravelers: min, maxTravelers });
  const [value, setValue] = useState(String(min));
  const [error, setError] = useState(null);
  const [travelers, setTravelers] = useState(min);
  const query = useAvailability(['packages', packageId, 'availability'], packagesService.availability, { packageId, travelers });

  const submit = (event) => {
    event.preventDefault();
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError(null);
    setTravelers(parsed.data);
  };

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={submit} noValidate aria-label="Check departure availability" className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4 sm:flex-row sm:items-end">
        <Input label="Travellers" type="number" inputMode="numeric" min={min} max={maxTravelers} value={value} onChange={(event) => setValue(event.target.value)} hint={`${min}–${maxTravelers} per booking`} error={error} required />
        <div className="sm:pb-6">
          <Button type="submit" loading={query.isFetching}>
            Check departures
          </Button>
        </div>
      </form>
      <AvailabilityResult query={query} loadingLabel="Checking departures">
        {(data) => {
          const open = data.departures.filter((departure) => departure.available).length;
          return (
            <div className="flex flex-col gap-3">
              <p role="status" className="text-sm font-medium">{`${plural(data.travelers, 'traveller')} · ${plural(open, 'departure')} with space`}</p>
              {!data.withinGroupLimits ? <Alert tone="warning">{`This package takes groups of ${min} to ${maxTravelers}.`}</Alert> : null}
              {data.departures.length ? (
                <SeatList
                  label="Upcoming departures"
                  options={data.departures.map((departure) => ({
                    ...departure,
                    when: (
                      <>
                        <time dateTime={departure.startDate}>{formatDate(departure.startDate)}</time>
                        {' – '}
                        <time dateTime={departure.endDate}>{formatDate(departure.endDate)}</time>
                      </>
                    ),
                  }))}
                />
              ) : (
                <Alert tone="info">No departures are scheduled yet. Please check back later.</Alert>
              )}
            </div>
          );
        }}
      </AvailabilityResult>
    </div>
  );
}
