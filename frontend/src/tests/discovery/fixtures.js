// API-shaped sample data for discovery tests (test names only, never shown on the site).
const region = { id: 'r1', name: 'Sample Region', slug: 'sample-region' };
export const district = { id: 'd1', name: 'Sample District', slug: 'sample-district', description: 'A sample district.', status: 'active', location: { latitude: 23.36, longitude: 85.33 }, region };

export const destination = (overrides = {}) => ({
  id: 'dest1',
  name: 'Sample Falls',
  slug: 'sample-falls',
  summary: 'A sample waterfall.',
  featured: false,
  entryFee: '30.00',
  location: { latitude: 23.4, longitude: 85.4 },
  district: { id: 'd1', name: 'Sample District', slug: 'sample-district', region },
  coverImage: null,
  categories: [{ id: 'c1', name: 'Waterfalls', slug: 'waterfalls' }],
  ...overrides,
});

export const destinationDetail = destination({
  description: 'First paragraph.\n\nSecond paragraph.',
  address: 'Sample Road',
  openingHours: { monday: [{ open: '09:00', close: '17:00' }], tuesday: [], notes: 'Closed during heavy rain.' },
  bestTimeToVisit: 'October to March',
  publishedAt: '2026-10-01T00:00:00Z',
  gallery: [],
  faqs: [{ question: 'Is it safe to swim?', answer: 'Sample answer.' }],
  related: [],
});

export const filters = {
  types: ['destination', 'district', 'property', 'guide', 'experience', 'package'],
  nearbyTypes: ['destination', 'property'],
  regions: [{ ...region, districts: [{ id: 'd1', name: 'Sample District', slug: 'sample-district', destinationCount: 3 }] }],
  categories: [{ id: 'c1', name: 'Waterfalls', slug: 'waterfalls', icon: null, count: 3 }],
  sorts: ['name', '-name', 'publishedAt', '-publishedAt'],
  radiusKm: { defaultKm: 25, maxKm: 300 },
};
