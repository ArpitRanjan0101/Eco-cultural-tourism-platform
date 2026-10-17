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

/** 150 → "2 h 30 min". */
export function formatDuration(minutes) {
  if (!Number.isInteger(minutes) || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} h` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ');
}
