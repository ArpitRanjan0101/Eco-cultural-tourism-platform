'use strict';

// Calendar dates (stay dates, departures, guide slots) are local to India.
const BUSINESS_TIME_ZONE = 'Asia/Kolkata';
const DAY_MS = 86_400_000;

/** Today's date in the business time zone as YYYY-MM-DD. */
function todayLocal(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Whole days from `from` to `to` (YYYY-MM-DD, exclusive of `to`). */
function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Instant for a local (Asia/Kolkata, UTC+05:30, no DST) date and HH:MM time. */
function localDateTime(date, time = '00:00') {
  return new Date(`${date}T${time}:00+05:30`);
}

module.exports = { BUSINESS_TIME_ZONE, todayLocal, daysBetween, addDays, localDateTime };
