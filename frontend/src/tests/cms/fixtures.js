// Rendered section data in the exact shape GET /content/homepage returns (backend cms.service.js renderSections).
// Test data only — sample names, never shown on the site.
const image = (id, alt = null) => ({ id, url: `https://cdn.example.org/${id}.jpg`, altText: alt, width: 1200, height: 800 });
const district = { id: 'd1', name: 'Ranchi', slug: 'ranchi', region: { id: 'r1', name: 'South Chotanagpur', slug: 'south-chotanagpur' } };

export const cards = {
  destination: { id: 'dest1', name: 'Sample Falls', slug: 'sample-falls', summary: 'A sample waterfall.', featured: true, entryFee: '50.00', location: { latitude: 23.4, longitude: 85.4 }, district, coverImage: image('dest1', 'Sample Falls'), categories: [{ id: 'c1', name: 'Waterfalls', slug: 'waterfalls' }] },
  property: { id: 'p1', name: 'Sample Lodge', slug: 'sample-lodge', propertyType: 'eco_lodge', bookingMode: 'instant', startingPrice: '2400.00', currency: 'INR', location: { latitude: 23, longitude: 85 }, district, destination: null, coverImage: null },
  experience: { id: 'e1', name: 'Sample Walk', slug: 'sample-walk', durationMinutes: 150, minParticipants: 1, maxParticipants: 10, bookingMode: 'request', startingPrice: null, currency: 'INR', nextSessionAt: null, destination: { id: 'dest1', name: 'Sample Falls', slug: 'sample-falls' }, coverImage: null, partner: null },
  guide: { id: 'g1', displayName: 'Sample Guide', yearsExperience: 7, startingPrice: '1500.00', currency: 'INR', photo: null, languages: [{ id: 'l1', code: 'hi', name: 'Hindi' }], destinations: [{ id: 'dest1', name: 'Sample Falls', slug: 'sample-falls' }], partner: null },
  package: { id: 'k1', name: 'Sample Circuit', slug: 'sample-circuit', summary: 'Two sample days.', durationDays: 2, durationNights: 1, minTravelers: 1, maxTravelers: 10, bookingMode: 'instant', startingPrice: '7000.00', currency: 'INR', nextDeparture: '2026-12-10', coverImage: null, partner: null },
};

export const SECTION_FIXTURES = {
  hero: { heading: 'Discover the sample land', subheading: 'Forests and festivals', image: image('hero', 'Sample hills at dawn'), cta: { label: 'Explore', href: '/destinations' } },
  rich_text: { heading: 'About', markdown: 'Plain **bold** text.' },
  featured_destinations: { heading: 'Must-see places', destinations: [cards.destination] },
  category_grid: { heading: 'Ways to explore', categories: [{ id: 'c1', name: 'Waterfalls', slug: 'waterfalls', description: 'Falling water', icon: null, status: 'active', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }] },
  district_grid: { heading: 'Districts', districts: [{ ...district, description: null, status: 'active', location: { latitude: 23, longitude: 85 }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }] },
  image_gallery: { heading: 'Gallery', items: [{ image: image('g1', 'Sample view'), caption: 'View' }] },
  cta_banner: { heading: 'Plan a trip', text: 'Save places into a trip.', image: null, cta: { label: 'Start planning', href: '/account/trips/new' } },
  faq: { heading: 'Questions', items: [{ question: 'When to visit?', answer: 'Sample answer.' }] },
  home_search: { heading: 'Where to?', subheading: null, placeholder: 'Waterfalls, forests…' },
  featured_stays: { heading: 'Places to stay', properties: [cards.property] },
  experience_grid: { heading: 'Experiences', experiences: [cards.experience] },
  guide_spotlight: { heading: 'Local guides', guides: [cards.guide] },
  package_showcase: { heading: 'Tour packages', packages: [cards.package] },
  image_text: { heading: 'Sample art', markdown: 'Painted walls.', image: image('it', 'Sample painted wall'), imagePosition: 'end', cta: null },
  statistics_strip: { heading: null, items: [{ value: '24', label: 'Sample districts' }, { value: '100+', label: 'Sample waterfalls' }] },
  cultural_highlights: { heading: 'Living culture', intro: null, items: [{ title: 'Sample dance', text: 'Masked dance.', image: null, cta: { label: 'Read more', href: 'https://example.org/dance' } }] },
};

export const page = (sections, overrides = {}) => ({
  id: 'page1',
  title: 'Sample page',
  slug: 'sample-page',
  pageType: 'landing',
  seo: { title: 'Sample page', description: 'Sample description' },
  publishedAt: '2026-10-01T00:00:00Z',
  sections,
  ...overrides,
});

/** Every fixture as a section list, in backend type order. */
export const ALL_SECTIONS = Object.entries(SECTION_FIXTURES).map(([type, data], index) => ({ id: `s${index}`, type, data }));
