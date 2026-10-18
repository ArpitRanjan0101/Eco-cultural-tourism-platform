// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kolkataMidnight, sessionCheckSchema } from '@/features/experiences/schemas/experienceQuery';
import { parseExperienceQuery, experienceSortOptions } from '@/features/experiences';
import { groupSlots } from '@/features/guides/components/GuideAvailability';
import { guideWindowSchema } from '@/features/guides/schemas/guideQuery';
import { guideSortOptions, parseGuideQuery } from '@/features/guides';
import { packageSortOptions, parsePackageQuery } from '@/features/packages';
import { travelersSchema } from '@/features/packages/schemas/packageQuery';
import { cancellationTierText } from '@/features/properties/components/PropertyPolicies';
import { defaultStay, stayAvailabilitySchema } from '@/features/properties/schemas/propertyQuery';
import { parsePropertyQuery, propertySortOptions, propertyTypeOptions } from '@/features/properties';
import { availabilityErrorText } from '@/features/supply/components/LiveAvailability';
import { seatStatus } from '@/features/supply/components/SeatList';
import { addDays, daysBetween, formatTime, todayInKolkata } from '@/lib/formatting/dates';
import { plural } from '@/lib/formatting/plural';
import { labelledOptions } from '@/lib/url/listQuery';
import { guideSlots } from './fixtures';

// The generated backend contract (mounted at /contract in the web container, compose.dev.yml).
const CONTRACT = '/contract/openapi.json';
const contract = existsSync(CONTRACT) ? JSON.parse(readFileSync(CONTRACT, 'utf8')) : null;
const queryEnum = (path, name) => contract.paths[path].get.parameters.find((parameter) => parameter.name === name).schema.enum;

describe('list URL state (5b.1)', () => {
  it('stays: contract values pass; anything else is dropped and never forwarded', () => {
    const ok = parsePropertyQuery({ q: ' lodge ', district: 'ranchi', destination: 'hundru-falls', propertyType: 'eco_lodge', sort: '-startingPrice', page: '2' });
    expect(ok.params).toEqual({ page: '2', q: 'lodge', district: 'ranchi', destination: 'hundru-falls', propertyType: 'eco_lodge', sort: '-startingPrice' });
    expect(ok.query).toMatchObject({ page: 2, limit: 12 });
    const bad = parsePropertyQuery({ q: 'x', district: 'Ranchi!', destination: '../admin', propertyType: 'castle', sort: 'rating', page: '0', amenity: 'wifi' });
    expect(bad.params).toEqual({});
    expect(bad.dropped.sort()).toEqual(['destination', 'district', 'page', 'propertyType', 'q', 'sort']);
    expect(bad.query).toEqual({ page: 1, limit: 12 });
  });

  it('guides: language must be a 2–3 letter code; experiences and packages take q, destination and sort', () => {
    expect(parseGuideQuery({ language: 'hi', sort: '-yearsExperience' }).params).toEqual({ language: 'hi', sort: '-yearsExperience' });
    expect(parseGuideQuery({ language: 'Hindi' }).dropped).toEqual(['language']);
    expect(parseExperienceQuery({ q: 'art', destination: 'sample-falls', sort: 'nextSessionAt' }).params).toEqual({ q: 'art', destination: 'sample-falls', sort: 'nextSessionAt' });
    expect(parseExperienceQuery({ sort: 'durationDays' }).dropped).toEqual(['sort']);
    expect(parsePackageQuery({ sort: '-durationDays', page: '10001' })).toMatchObject({ params: { sort: '-durationDays' }, dropped: ['page'] });
  });

  it.skipIf(!contract)('every offered sort and stay type is one the backend contract accepts', () => {
    const offered = (options) => options.map((option) => option.value);
    for (const [options, path] of [
      [propertySortOptions(), '/api/v1/properties'],
      [guideSortOptions(), '/api/v1/guides'],
      [experienceSortOptions(), '/api/v1/experiences'],
      [packageSortOptions(), '/api/v1/packages'],
    ]) {
      expect(queryEnum(path, 'sort')).toEqual(expect.arrayContaining(offered(options)));
    }
    expect(offered(propertyTypeOptions()).sort()).toEqual([...queryEnum('/api/v1/properties', 'propertyType')].sort());
  });

  it('labelled options keep the given order and skip unlabelled values', () => {
    expect(labelledOptions(['b', 'x', 'a'], { a: 'A', b: 'B' })).toEqual([{ value: 'b', label: 'B' }, { value: 'a', label: 'A' }]);
  });
});

describe('availability rules (5b.2–5b.5)', () => {
  const today = '2026-10-18';

  it('stay check: default dates are tomorrow → day after; past, zero-night and over-30-night stays refused', () => {
    const schema = stayAvailabilitySchema(today);
    expect(schema.parse(defaultStay(today))).toEqual({ checkIn: '2026-10-19', checkOut: '2026-10-20', adults: 2, children: 0, rooms: 1 });
    const issue = (input) => schema.safeParse({ ...defaultStay(today), ...input }).error?.issues.map((i) => `${i.path[0]}: ${i.message}`);
    expect(issue({ checkIn: '2026-10-17' })).toEqual(['checkIn: Check-in cannot be in the past.']);
    expect(issue({ checkOut: '2026-10-19' })).toEqual(['checkOut: Check-out must be after check-in.']);
    expect(issue({ checkOut: '2026-11-19' })).toEqual(['checkOut: Check up to 30 nights at a time.']);
    expect(issue({ adults: '0', rooms: '21' })).toEqual(['adults: At least 1 adult.', 'rooms: At most 20 rooms.']);
  });

  it('guide window: from today, up to 92 days (the backend maximum)', () => {
    const schema = guideWindowSchema(today);
    expect(schema.safeParse({ from: today, to: addDays(today, 92) }).success).toBe(true);
    expect(schema.safeParse({ from: today, to: addDays(today, 93) }).error.issues[0].message).toBe('Check up to 92 days at a time.');
    expect(schema.safeParse({ from: '2026-10-17', to: today }).error.issues[0].message).toBe('The start cannot be in the past.');
  });

  it('party sizes stay within the item’s own limits', () => {
    const sessions = sessionCheckSchema({ today, minParticipants: 2, maxParticipants: 8 });
    expect(sessions.safeParse({ from: today, participants: '9' }).error.issues[0].message).toBe('This experience takes at most 8.');
    expect(sessions.parse({ from: today, participants: '2' })).toEqual({ from: today, participants: 2 });
    expect(travelersSchema({ minTravelers: 2, maxTravelers: 12 }).safeParse('1').error.issues[0].message).toBe('This package needs at least 2.');
  });

  it('session windows start at Jharkhand midnight', () => {
    expect(kolkataMidnight('2026-10-18')).toBe('2026-10-17T18:30:00.000Z');
  });
});

describe('calendar dates in Jharkhand time (W12)', () => {
  it('today follows Asia/Kolkata, not the visitor’s clock', () => {
    expect(todayInKolkata(new Date('2026-10-18T18:29:00Z'))).toBe('2026-10-18');
    expect(todayInKolkata(new Date('2026-10-18T18:30:00Z'))).toBe('2026-10-19');
  });

  it('adds days across month and year ends; counts days between dates', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('bad', 1)).toBeNull();
    expect(daysBetween('2026-10-18', '2027-01-18')).toBe(92);
    expect(formatTime('2026-10-24T05:30:00.000Z')).toMatch(/11:00\s?am/i);
  });
});

describe('presentation helpers', () => {
  it('cancellation tiers read as policy text', () => {
    expect(cancellationTierText({ hoursBeforeCheckIn: 72, refundPercent: 100 })).toBe('3 days or more before check-in: 100% refund');
    expect(cancellationTierText({ hoursBeforeCheckIn: 24, refundPercent: 50 })).toBe('1 day or more before check-in: 50% refund');
    expect(cancellationTierText({ hoursBeforeCheckIn: 6, refundPercent: 25 })).toBe('6 hours or more before check-in: 25% refund');
    expect(cancellationTierText({ hoursBeforeCheckIn: 0, refundPercent: 0 })).toBe('Up to check-in: no refund');
  });

  it('seat status comes from the API flags, never from arithmetic on capacity', () => {
    expect(seatStatus({ status: 'scheduled', available: true, seatsAvailable: 1 })).toEqual({ tone: 'success', text: '1 seat left' });
    expect(seatStatus({ status: 'scheduled', available: false, seatsAvailable: 1 })).toEqual({ tone: 'neutral', text: 'Only 1 seat left' });
    expect(seatStatus({ status: 'scheduled', available: false, seatsAvailable: 0 }).text).toBe('Full');
    expect(seatStatus({ status: 'closed', available: false, seatsAvailable: 4 }).text).toBe('Closed for booking');
    expect(seatStatus({ status: 'cancelled', available: true, seatsAvailable: 4 }).text).toBe('Cancelled');
  });

  it('guide slots are grouped by date in time order', () => {
    expect(groupSlots(guideSlots.slots).map((day) => [day.date, day.slots.map((slot) => slot.startTime)])).toEqual([
      ['2026-10-20', ['09:00:00']],
      ['2026-10-23', ['08:00:00', '14:00:00']],
    ]);
  });

  it('availability errors are explained without exposing internals', () => {
    expect(availabilityErrorText({ status: 429, retryAfter: '42' })).toBe('Too many availability checks from your connection. Please try again in 42 seconds.');
    expect(availabilityErrorText({ status: 429 })).toMatch(/in a minute\.$/);
    expect(availabilityErrorText({ status: 404 })).toBe('This listing is no longer available.');
    expect(availabilityErrorText({ status: 422, message: 'Request validation failed', details: [{ path: 'checkOut', message: 'stay must be 1-30 nights' }] })).toBe('Please check your choice: stay must be 1-30 nights.');
    expect(availabilityErrorText({ status: 503, message: 'upstream exploded at db.js:12', requestId: 'req-1' })).toBe('Availability could not be loaded right now. Please try again. Reference: req-1');
  });

  it('plural', () => {
    expect([plural(1, 'night'), plural(2, 'night'), plural(3, 'child', 'children')]).toEqual(['1 night', '2 nights', '3 children']);
  });
});
