'use client';

import { useState } from 'react';
import Money from '@/components/data-display/Money';
import Alert from '@/components/feedback/Alert';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import DateRangePicker from '@/components/ui/DateRangePicker';
import Input from '@/components/ui/Input';
import { AvailabilityResult } from '@/features/supply/components/LiveAvailability';
import { useAvailability } from '@/features/supply/hooks/useAvailability';
import { addDays, formatDate } from '@/lib/formatting/dates';
import { plural } from '@/lib/formatting/plural';
import { defaultStay, MAX_STAY_NIGHTS, stayAvailabilitySchema } from '../schemas/propertyQuery';
import { propertiesService } from '../services/propertiesService';

function RoomResult({ room, nights, rooms }) {
  const status = !room.fitsOccupancy
    ? { tone: 'warning', text: 'Too small for your group' }
    : room.available
      ? { tone: 'success', text: room.availableUnits === 1 ? '1 left for these dates' : `${room.availableUnits} left for these dates` }
      : { tone: 'neutral', text: 'Not available for these dates' };
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-sans text-base font-semibold">{room.name}</h3>
          <p className="text-sm text-muted">{`Sleeps up to ${plural(room.maxAdults, 'adult')}${room.maxChildren ? ` and ${plural(room.maxChildren, 'child', 'children')}` : ''} per room`}</p>
        </div>
        <Badge tone={status.tone} size="md">
          {status.text}
        </Badge>
      </div>
      {room.available ? (
        <p className="text-sm">
          <Money amount={room.totalPrice} className="text-lg text-text" />
          <span className="text-muted">{` total for ${plural(nights, 'night')}, ${plural(rooms, 'room')}`}</span>
        </p>
      ) : null}
      {room.nightly.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer rounded-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-focus">Price per night</summary>
          <table className="mt-2 w-full max-w-md">
            <caption className="sr-only">{`${room.name}: price per room per night`}</caption>
            <thead>
              <tr className="text-left text-muted">
                <th scope="col" className="py-1 font-medium">
                  Night of
                </th>
                <th scope="col" className="py-1 font-medium">
                  Price per room
                </th>
                <th scope="col" className="py-1 font-medium">
                  Rooms left
                </th>
              </tr>
            </thead>
            <tbody>
              {room.nightly.map((night) => (
                <tr key={night.date} className="border-t border-border">
                  <td className="py-1">{formatDate(night.date)}</td>
                  <td className="py-1">
                    <Money amount={night.price} />
                  </td>
                  <td className="py-1">{night.availableUnits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </li>
  );
}

/**
 * Live stay availability (GET /properties/:id/availability via the BFF): dates and guests in, rooms that fit
 * with the API's total price out. Runs once with default dates so visitors see real figures immediately; the
 * backend re-checks everything when a booking is made (W4).
 * @param {{ propertyId: string, today: string }} props `today` = the Jharkhand calendar date from the server.
 */
export default function StayAvailability({ propertyId, today }) {
  const schema = stayAvailabilitySchema(today);
  const [form, setForm] = useState(() => defaultStay(today));
  const [errors, setErrors] = useState({});
  const [params, setParams] = useState(() => ({ propertyId, ...schema.parse(defaultStay(today)) }));
  const query = useAvailability(['properties', propertyId, 'availability'], propertiesService.availability, params);
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const submit = (event) => {
    event.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path[0], issue.message])));
      return;
    }
    setErrors({});
    setParams({ propertyId, ...parsed.data });
  };

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={submit} noValidate aria-label="Check stay availability" className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4">
        <DateRangePicker
          legend="Dates"
          startLabel="Check-in"
          endLabel="Check-out"
          value={{ start: form.checkIn, end: form.checkOut }}
          onChange={({ start, end }) => set({ checkIn: start, checkOut: end })}
          min={today}
          max={addDays(today, 365)}
          allowSameDay={false}
          required
          hint={`Up to ${MAX_STAY_NIGHTS} nights per check.`}
          error={errors.checkIn ?? errors.checkOut}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Adults" type="number" inputMode="numeric" min={1} max={40} value={form.adults} onChange={(event) => set({ adults: event.target.value })} error={errors.adults} required />
          <Input label="Children" type="number" inputMode="numeric" min={0} max={20} value={form.children} onChange={(event) => set({ children: event.target.value })} error={errors.children} />
          <Input label="Rooms" type="number" inputMode="numeric" min={1} max={20} value={form.rooms} onChange={(event) => set({ rooms: event.target.value })} error={errors.rooms} required />
        </div>
        <div>
          <Button type="submit" loading={query.isFetching}>
            Check availability
          </Button>
        </div>
      </form>

      <div>
        <AvailabilityResult query={query} loadingLabel="Checking rooms">
          {(data) => (
            <div className="flex flex-col gap-3">
              <p role="status" className="text-sm font-medium">{`${formatDate(data.checkIn)} – ${formatDate(data.checkOut)} · ${plural(data.nights, 'night')} · ${plural(data.rooms.filter((room) => room.available).length, 'room type')} available`}</p>
              {data.rooms.length ? (
                <ul className="flex flex-col gap-3" aria-label="Rooms for your dates">
                  {data.rooms.map((room) => (
                    <RoomResult key={room.roomTypeId} room={room} nights={data.nights} rooms={params.rooms} />
                  ))}
                </ul>
              ) : (
                <Alert tone="info">This stay has no rooms open for booking at the moment.</Alert>
              )}
              {data.rooms.length && !data.rooms.some((room) => room.available) ? <Alert tone="info">No room fits these dates and guests. Try other dates, more rooms or fewer guests.</Alert> : null}
              {data.bookingMode === 'request' ? <p className="text-sm text-muted">This stay takes bookings on request: the host accepts or declines each request.</p> : null}
            </div>
          )}
        </AvailabilityResult>
      </div>
    </div>
  );
}
