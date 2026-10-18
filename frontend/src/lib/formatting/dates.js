// Calendar dates are "YYYY-MM-DD" strings in Asia/Kolkata (backend P6); instants are ISO timestamps (W12).
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const instantFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** "2026-12-10" → "10 Dec 2026", formatted as a calendar date (no time-zone shift). */
export function formatDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return null;
  return dateFormat.format(new Date(`${value}T00:00:00Z`));
}

/** ISO instant → local Jharkhand time, e.g. "10 Dec 2026, 6:30 am". */
export function formatInstant(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? instantFormat.format(new Date(time)) : null;
}

const kolkataDay = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Kolkata' });

/** Today's calendar date in Jharkhand ("YYYY-MM-DD"), whatever the visitor's own time zone. */
export function todayInKolkata(now = new Date()) {
  return kolkataDay.format(now);
}

/** "2026-12-31" + 1 → "2027-01-01" (calendar arithmetic, no time zone involved). */
export function addDays(value, days) {
  if (typeof value !== 'string' || !DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `start` to `end` ("YYYY-MM-DD"), or null for malformed input. */
export function daysBetween(start, end) {
  if (![start, end].every((value) => typeof value === 'string' && DATE.test(value))) return null;
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** ISO instant → Jharkhand clock time, e.g. "6:30 am". */
export function formatTime(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? timeFormat.format(new Date(time)) : null;
}

/** 150 → "2 h 30 min". */
export function formatDuration(minutes) {
  if (!Number.isInteger(minutes) || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} h` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ');
}
