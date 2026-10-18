'use client';

import { useState } from 'react';
import Alert from '@/components/feedback/Alert';
import Button from '@/components/ui/Button';
import DatePicker from '@/components/ui/DatePicker';
import Input from '@/components/ui/Input';
import { AvailabilityResult } from '@/features/supply/components/LiveAvailability';
import SeatList from '@/features/supply/components/SeatList';
import { useAvailability } from '@/features/supply/hooks/useAvailability';
import { addDays, formatDate, formatInstant, formatTime } from '@/lib/formatting/dates';
import { plural } from '@/lib/formatting/plural';
import { kolkataMidnight, SESSION_WINDOW_DAYS, sessionCheckSchema } from '../schemas/experienceQuery';
import { experiencesService } from '../services/experiencesService';

const toParams = (experienceId, { from, participants }) => ({ experienceId, participants, from: kolkataMidnight(from), to: kolkataMidnight(addDays(from, SESSION_WINDOW_DAYS)) });

/**
 * Live session availability (GET /experiences/:id/availability via the BFF) for a party size over 30 days from a
 * chosen date. Prices are the API's per-person price; the total is calculated by the backend at booking (W4).
 * @param {{ experienceId: string, today: string, minParticipants: number, maxParticipants: number }} props
 */
export default function ExperienceSessions({ experienceId, today, minParticipants, maxParticipants }) {
  const min = Math.max(1, minParticipants);
  const schema = sessionCheckSchema({ today, minParticipants: min, maxParticipants });
  const [form, setForm] = useState({ from: today, participants: String(min) });
  const [errors, setErrors] = useState({});
  const [checked, setChecked] = useState({ from: today, participants: min });
  // Query keys hash structurally, so deriving the request on each render is stable.
  const query = useAvailability(['experiences', experienceId, 'availability'], experiencesService.availability, toParams(experienceId, checked));

  const submit = (event) => {
    event.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path[0], issue.message])));
      return;
    }
    setErrors({});
    setChecked(parsed.data);
  };

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={submit} noValidate aria-label="Check session availability" className="grid gap-4 rounded-lg border border-border bg-surface-raised p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <DatePicker label="Sessions from" value={form.from} min={today} max={addDays(today, 365)} onChange={(event) => setForm({ ...form, from: event.target.value })} error={errors.from} required />
        <Input
          label="People"
          type="number"
          inputMode="numeric"
          min={min}
          max={maxParticipants}
          value={form.participants}
          onChange={(event) => setForm({ ...form, participants: event.target.value })}
          hint={`${min}–${maxParticipants} per booking`}
          error={errors.participants}
          required
        />
        <div className="sm:pb-6">
          <Button type="submit" loading={query.isFetching}>
            Check sessions
          </Button>
        </div>
      </form>
      <AvailabilityResult query={query} loadingLabel="Checking sessions">
        {(data) => {
          const sessions = data.sessions.filter((session) => session.status !== 'cancelled');
          const open = sessions.filter((session) => session.available).length;
          return (
            <div className="flex flex-col gap-3">
              <p role="status" className="text-sm font-medium">{`${formatDate(checked.from)} – ${formatDate(addDays(checked.from, SESSION_WINDOW_DAYS))} ·${plural(data.participants, 'person', 'people')} · ${plural(open, 'session')} with space`}</p>
              {!data.withinGroupLimits ? <Alert tone="warning">{`This experience takes groups of ${min} to ${maxParticipants}.`}</Alert> : null}
              {sessions.length ? (
                <SeatList
                  label="Upcoming sessions"
                  options={sessions.map((session) => ({
                    ...session,
                    when: (
                      <>
                        <time dateTime={session.startsAt}>{formatInstant(session.startsAt)}</time>
                        {formatTime(session.endsAt) ? (
                          <>
                            {' – '}
                            <time dateTime={session.endsAt}>{formatTime(session.endsAt)}</time>
                          </>
                        ) : null}
                      </>
                    ),
                  }))}
                />
              ) : (
                <Alert tone="info">{`No sessions are scheduled in the ${SESSION_WINDOW_DAYS} days from this date. Try a later date.`}</Alert>
              )}
            </div>
          );
        }}
      </AvailabilityResult>
    </div>
  );
}
