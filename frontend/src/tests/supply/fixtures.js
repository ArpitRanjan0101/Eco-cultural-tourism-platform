// API-shaped sample data for the supply (stays, guides, experiences, packages) tests. Test names only.
export const ids = {
  property: '11111111-1111-4111-8111-111111111111',
  room: '22222222-2222-4222-8222-222222222222',
  guide: '33333333-3333-4333-8333-333333333333',
  experience: '44444444-4444-4444-8444-444444444444',
  session: '55555555-5555-4555-8555-555555555555',
  pkg: '66666666-6666-4666-8666-666666666666',
  departure: '77777777-7777-4777-8777-777777777777',
};
const region = { id: 'r1', name: 'Sample Region', slug: 'sample-region' };
const district = { id: 'd1', name: 'Sample District', slug: 'sample-district', region };
const destinationRef = { id: 'dest1', name: 'Sample Falls', slug: 'sample-falls' };
const partner = { id: 'p1', businessName: 'Sample Partner' };
const amenity = (code, category, name) => ({ id: `a-${code}`, code, name, category, icon: null });

export const property = (overrides = {}) => ({
  id: ids.property,
  name: 'Sample Lodge',
  slug: 'sample-lodge',
  propertyType: 'eco_lodge',
  bookingMode: 'instant',
  startingPrice: '2000.00',
  currency: 'INR',
  location: { latitude: 23.36, longitude: 85.33 },
  district,
  destination: destinationRef,
  coverImage: null,
  ...overrides,
});

export const room = (overrides = {}) => ({
  id: ids.room,
  propertyId: ids.property,
  name: 'Standard room',
  description: 'Twin beds.',
  maxAdults: 2,
  maxChildren: 1,
  totalUnits: 3,
  basePrice: '2000.00',
  currency: 'INR',
  status: 'active',
  amenities: [amenity('fan', 'room', 'Ceiling fan')],
  images: [],
  ...overrides,
});

export const propertyDetail = property({
  description: 'A quiet lodge.\n\nNear the falls.',
  address: 'Sample Road, Sample District',
  contactPhone: '+91 98765 43210',
  checkInTime: '14:00:00',
  checkOutTime: '11:00:00',
  gallery: [],
  amenities: [amenity('wifi', 'connectivity', 'Wi-Fi'), amenity('parking', 'general', 'Parking'), amenity('ramp', 'accessibility', 'Step-free entrance')],
  policies: {
    cancellationPolicy: { tiers: [{ hoursBeforeCheckIn: 24, refundPercent: 50 }, { hoursBeforeCheckIn: 72, refundPercent: 100 }, { hoursBeforeCheckIn: 0, refundPercent: 0 }], notes: 'Refunds go to the original payment method.' },
    childPolicy: 'Children under 5 stay free.',
    houseRules: null,
    identificationPolicy: 'Government photo ID at check-in.',
    isDefault: false,
  },
  rooms: [room(), room({ id: 'r-inactive', name: 'Closed wing', status: 'inactive' })],
});

export const stayAvailability = {
  propertyId: ids.property,
  checkIn: '2026-10-19',
  checkOut: '2026-10-21',
  nights: 2,
  currency: 'INR',
  bookingMode: 'instant',
  rooms: [
    {
      roomTypeId: ids.room,
      name: 'Standard room',
      maxAdults: 2,
      maxChildren: 1,
      availableUnits: 2,
      fitsOccupancy: true,
      available: true,
      nightly: [
        { date: '2026-10-19', price: '2000.00', availableUnits: 2 },
        { date: '2026-10-20', price: '2500.00', availableUnits: 3 },
      ],
      totalPrice: '4500.00',
    },
    { roomTypeId: 'r2', name: 'Family suite', maxAdults: 4, maxChildren: 2, availableUnits: 0, fitsOccupancy: true, available: false, nightly: [], totalPrice: '0.00' },
    { roomTypeId: 'r3', name: 'Single cabin', maxAdults: 1, maxChildren: 0, availableUnits: 4, fitsOccupancy: false, available: false, nightly: [], totalPrice: '2400.00' },
  ],
};

export const guide = (overrides = {}) => ({
  id: ids.guide,
  displayName: 'Sample Guide',
  yearsExperience: 6,
  startingPrice: '1500.00',
  currency: 'INR',
  photo: null,
  languages: [{ id: 'l1', code: 'hi', name: 'Hindi' }, { id: 'l2', code: 'en', name: 'English' }],
  destinations: [destinationRef],
  partner,
  ...overrides,
});

export const guideDetail = guide({
  bio: 'Born in the hills.',
  services: [
    { id: 's1', guideId: ids.guide, title: 'Waterfall walk', durationMinutes: 150, price: '1500.00', currency: 'INR', maxGroupSize: 6, description: 'Easy trail.', bookingMode: 'instant', status: 'active' },
    { id: 's2', guideId: ids.guide, title: 'Retired tour', durationMinutes: 60, price: '900.00', currency: 'INR', maxGroupSize: 2, description: null, bookingMode: 'request', status: 'inactive' },
  ],
});

export const guideSlots = {
  guideId: ids.guide,
  from: '2026-10-18',
  to: '2026-10-31',
  slots: [
    { id: 'g2', date: '2026-10-23', startTime: '14:00:00', endTime: '17:00:00', status: 'blocked' },
    { id: 'g1', date: '2026-10-23', startTime: '08:00:00', endTime: '12:00:00', status: 'available' },
    { id: 'g3', date: '2026-10-20', startTime: '09:00:00', endTime: '13:00:00', status: 'available' },
  ],
};

export const experience = (overrides = {}) => ({
  id: ids.experience,
  name: 'Sample Art Walk',
  slug: 'sample-art-walk',
  durationMinutes: 120,
  minParticipants: 2,
  maxParticipants: 8,
  bookingMode: 'request',
  startingPrice: '500.00',
  currency: 'INR',
  nextSessionAt: '2026-10-24T03:30:00.000Z',
  destination: destinationRef,
  coverImage: null,
  partner,
  ...overrides,
});

const session = (overrides) => ({ id: ids.session, experienceId: ids.experience, startsAt: '2026-10-24T03:30:00.000Z', endsAt: '2026-10-24T05:30:00.000Z', capacity: 8, pricePerPerson: '500.00', currency: 'INR', status: 'scheduled', ...overrides });

export const sessionAvailability = {
  experienceId: ids.experience,
  participants: 2,
  withinGroupLimits: true,
  sessions: [
    session({ seatsAvailable: 5, available: true }),
    session({ id: 'x2', startsAt: '2026-10-25T03:30:00.000Z', endsAt: '2026-10-25T05:30:00.000Z', seatsAvailable: 1, available: false }),
    session({ id: 'x3', startsAt: '2026-10-26T03:30:00.000Z', seatsAvailable: 0, available: false }),
  ],
};

export const pkg = (overrides = {}) => ({
  id: ids.pkg,
  name: 'Sample Circuit',
  slug: 'sample-circuit',
  summary: 'Three waterfalls in two days.',
  durationDays: 2,
  durationNights: 1,
  minTravelers: 2,
  maxTravelers: 12,
  bookingMode: 'instant',
  startingPrice: '7000.00',
  currency: 'INR',
  nextDeparture: '2026-10-28',
  coverImage: null,
  partner,
  ...overrides,
});

export const packageDetail = pkg({
  description: 'A short circuit.',
  destinations: [destinationRef],
  itinerary: [
    { dayNumber: 2, title: 'Return', description: null, items: [] },
    { dayNumber: 1, title: 'Falls day', description: 'Early start.', items: [{ activityTitle: 'Morning walk', description: 'Bring water.', destination: destinationRef }, { activityTitle: 'Lunch', description: null, destination: null }] },
  ],
  inclusions: ['Transport', 'Breakfast'],
  exclusions: ['Entry fees'],
  gallery: [],
  upcomingDepartures: [],
});

const departure = (overrides) => ({ id: ids.departure, packageId: ids.pkg, startDate: '2026-10-28', endDate: '2026-10-29', totalSeats: 12, pricePerPerson: '7000.00', currency: 'INR', status: 'scheduled', ...overrides });

export const departureAvailability = {
  packageId: ids.pkg,
  travelers: 2,
  withinGroupLimits: true,
  departures: [departure({ seatsAvailable: 12, available: true }), departure({ id: 'd2', startDate: '2026-11-04', endDate: '2026-11-05', status: 'closed', seatsAvailable: 4, available: false })],
};

export const reviews = {
  data: [{ id: 'rv1', subjectType: 'property', subjectId: ids.property, rating: 5, title: 'Lovely', comment: 'Quiet and clean.', verified: true, author: { displayName: 'Asha M.' }, createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' }],
  meta: { page: 1, limit: 5, total: 7, rating: { count: 7, average: 4.6, distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 5 } } },
};
