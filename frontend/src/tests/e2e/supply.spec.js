import { expect, test } from '@playwright/test';
import { axeViolations, bffClient, dataOf, signedInClient, verificationToken } from './helpers';

// Phase 5b browse flows against real published supply, created the way partners and admins create it: a new
// partner account (real verification email) applies, the admin approves it, the partner lists a stay, a guide,
// an experience and a package, and the admin publishes or verifies each. Afterwards everything is suspended so
// the catalogue is left as it was. Admin credentials come from the run environment (W39), never from files.
test.describe.configure({ mode: 'serial' });

const ADMIN = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };
const stamp = Date.now();
// Names unique to this run: list pages are fetch-cached per query for 60 s, so a fresh query never sees a
// cached page from an earlier run.
const tag = `E2E ${stamp}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const kolkata = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const day = (offset) => kolkata.format(new Date(Date.now() + offset * 86_400_000));
const shown = (date) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const s = {}; // the created supply

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
});

test.beforeAll(async ({ browser }) => {
  if (!ADMIN.email || !ADMIN.password) throw new Error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run the supply suite');
  test.setTimeout(180_000);
  const admin = await signedInClient(await browser.newPage(), ADMIN);
  const partner = await bffClient(await browser.newPage());

  // A partner organisation: register, verify by the real email, apply, approval by the admin.
  const owner = { fullName: 'E2E Partner', email: `e2e.partner.${stamp}@example.org`, password: `Pw-${stamp}-ok` };
  await dataOf(await partner.post('/api/v1/auth/register', owner), 202);
  await dataOf(await partner.post('/api/v1/auth/verify-email', { token: await verificationToken(owner.email) }), 200);
  await partner.signIn(owner);
  s.partner = await dataOf(await partner.post('/api/v1/partners/apply', { partnerType: 'multi', businessName: `${tag} Partner`, legalName: `${tag} Partner Pvt Ltd`, email: owner.email }), 201);
  await dataOf(await admin.patch(`/api/v1/admin/partners/${s.partner.id}/status`, { status: 'approved' }), 200);
  await partner.signIn(owner); // a new session carries the partner roles granted on approval

  const ranchi = await dataOf(await partner.get('/api/v1/districts/ranchi'), 200);
  const destinations = await dataOf(await partner.get('/api/v1/destinations?limit=50'), 200);
  s.destination = destinations.find((destination) => destination.location) ?? destinations[0];
  const amenities = await dataOf(await partner.get('/api/v1/amenities'), 200);
  [s.language] = await dataOf(await partner.get('/api/v1/languages'), 200);
  if (!s.destination || !s.language || amenities.length < 2) throw new Error('reference data missing: run `npm run db:seed` in the api container');

  // Stay: one room type of 3 units at ₹2,000, two amenities, a cancellation policy.
  s.property = await dataOf(
    await partner.post('/api/v1/partners/me/properties', {
      districtId: ranchi.id,
      destinationId: s.destination.id,
      name: `${tag} Lodge`,
      propertyType: 'eco_lodge',
      description: 'A quiet test lodge.',
      address: 'Test Road, Ranchi',
      location: { latitude: 23.36, longitude: 85.33 },
      bookingMode: 'instant',
    }),
    201,
  );
  await dataOf(await partner.post(`/api/v1/partners/me/properties/${s.property.id}/rooms`, { name: 'Standard room', maxAdults: 2, maxChildren: 1, totalUnits: 3, basePrice: '2000.00' }), 201);
  s.amenities = amenities.slice(0, 2);
  await dataOf(await partner.put(`/api/v1/partners/me/properties/${s.property.id}/amenities`, { amenityIds: s.amenities.map((amenity) => amenity.id) }), 200);
  await dataOf(await partner.put(`/api/v1/partners/me/properties/${s.property.id}/policies`, { cancellationPolicy: { tiers: [{ hoursBeforeCheckIn: 48, refundPercent: 100 }, { hoursBeforeCheckIn: 0, refundPercent: 0 }] }, houseRules: 'No loud music after 10 pm.' }), 200);
  await dataOf(await admin.patch(`/api/v1/admin/properties/${s.property.id}/status`, { status: 'published' }), 200);

  // Guide: a language, a destination, one service, an open window in 5 days, then verification.
  s.guide = await dataOf(await partner.post('/api/v1/partners/me/guides', { displayName: `${tag} Guide`, yearsExperience: 7, bio: 'A test guide.' }), 201);
  await dataOf(await partner.put(`/api/v1/partners/me/guides/${s.guide.id}/languages`, { languageIds: [s.language.id] }), 200);
  await dataOf(await partner.put(`/api/v1/partners/me/guides/${s.guide.id}/destinations`, { destinationIds: [s.destination.id] }), 200);
  await dataOf(await partner.post(`/api/v1/partners/me/guides/${s.guide.id}/services`, { title: 'Waterfall walk', durationMinutes: 150, price: '1500.00', maxGroupSize: 6 }), 201);
  await dataOf(await partner.put(`/api/v1/partners/me/guides/${s.guide.id}/availability`, { from: day(5), to: day(5), slots: [{ date: day(5), startTime: '08:00', endTime: '14:00' }] }), 200);
  await dataOf(await admin.patch(`/api/v1/admin/guides/${s.guide.id}/verification`, { verificationStatus: 'verified' }), 200);

  // Experience: 2–8 people, one session in 6 days with 4 seats.
  s.experience = await dataOf(
    await partner.post('/api/v1/partners/me/experiences', { name: `${tag} Art Walk`, description: 'A test art walk.', destinationId: s.destination.id, durationMinutes: 120, minParticipants: 2, maxParticipants: 8, bookingMode: 'request' }),
    201,
  );
  const startsAt = new Date(Date.now() + 6 * 86_400_000);
  await dataOf(await partner.post(`/api/v1/partners/me/experiences/${s.experience.id}/sessions`, { startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 7_200_000).toISOString(), capacity: 4, pricePerPerson: '500.00' }), 201);
  await dataOf(await admin.patch(`/api/v1/admin/experiences/${s.experience.id}/status`, { status: 'published' }), 200);

  // Package: 2 days, itinerary, inclusions, one departure in 10 days with 6 seats.
  s.pkg = await dataOf(await partner.post('/api/v1/partners/me/packages', { name: `${tag} Circuit`, summary: 'Two test days.', description: 'A test circuit.', durationDays: 2, durationNights: 1, minTravelers: 2, maxTravelers: 10, bookingMode: 'instant' }), 201);
  await dataOf(await partner.put(`/api/v1/partners/me/packages/${s.pkg.id}/destinations`, { destinationIds: [s.destination.id] }), 200);
  await dataOf(
    await partner.put(`/api/v1/partners/me/packages/${s.pkg.id}/itinerary`, {
      days: [
        { dayNumber: 1, title: 'Falls day', items: [{ activityTitle: 'Morning walk', destinationId: s.destination.id }] },
        { dayNumber: 2, title: 'Return' },
      ],
    }),
    200,
  );
  await dataOf(await partner.put(`/api/v1/partners/me/packages/${s.pkg.id}/inclusions`, { items: [{ description: 'Transport', inclusionType: 'included' }, { description: 'Entry fees', inclusionType: 'excluded' }] }), 200);
  await dataOf(await partner.post(`/api/v1/partners/me/packages/${s.pkg.id}/departures`, { startDate: day(10), totalSeats: 6, pricePerPerson: '7000.00' }), 201);
  await dataOf(await admin.patch(`/api/v1/admin/packages/${s.pkg.id}/status`, { status: 'published' }), 200);
});

test.afterAll(async ({ browser }) => {
  if (!s.partner) return;
  const admin = await signedInClient(await browser.newPage(), ADMIN);
  const cleanup = { status: 'suspended', reason: 'End-to-end test data' };
  if (s.property) expect((await admin.patch(`/api/v1/admin/properties/${s.property.id}/status`, cleanup)).status()).toBe(200);
  if (s.guide) expect((await admin.patch(`/api/v1/admin/guides/${s.guide.id}/status`, cleanup)).status()).toBe(200);
  if (s.experience) expect((await admin.patch(`/api/v1/admin/experiences/${s.experience.id}/status`, cleanup)).status()).toBe(200);
  if (s.pkg) expect((await admin.patch(`/api/v1/admin/packages/${s.pkg.id}/status`, cleanup)).status()).toBe(200);
  expect((await admin.patch(`/api/v1/admin/partners/${s.partner.id}/status`, { status: 'suspended', notes: 'End-to-end test data' })).status()).toBe(200);
  if (s.property) expect((await admin.get(`/api/v1/properties/${s.property.slug}`)).status()).toBe(404);
});

test('stays: search, type filter and chips through the URL; map on demand; filtered lists are noindex', async ({ page }) => {
  await page.goto(`/stays?q=${encodeURIComponent(tag)}&sort=bogus`);
  await expect(page.getByRole('heading', { level: 1, name: 'Places to stay' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Stay results' }).getByRole('link', { name: `${tag} Lodge` })).toHaveAttribute('href', `/stays/${s.property.slug}`);
  await expect(page.getByText('1 stay', { exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  expect(await axeViolations(page)).toEqual([]);

  await page.getByRole('combobox', { name: 'Type of stay' }).selectOption('camp');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/propertyType=camp/);
  await expect(page.getByRole('heading', { name: 'No stays match these filters' })).toBeVisible();
  await page.getByRole('link', { name: 'Remove filter: Camp' }).click();
  await expect(page).not.toHaveURL(/propertyType=/);

  await page.getByRole('button', { name: 'Map' }).click();
  const map = page.getByRole('region', { name: 'Map of stay results' });
  await expect(map.getByRole('button', { name: `${tag} Lodge` })).toBeVisible();
});

test('stay detail: facts, rooms, amenities and policies; live availability from the API', async ({ page }) => {
  const availability = page.waitForResponse((response) => response.url().includes(`/api/v1/properties/${s.property.id}/availability`));
  expect((await page.goto(`/stays/${s.property.slug}`))?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: `${tag} Lodge` })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Stays' })).toHaveAttribute('href', '/stays');
  await expect(page.getByRole('list', { name: 'Room types' }).getByRole('heading', { name: 'Standard room' })).toBeVisible();
  for (const amenity of s.amenities) await expect(page.locator('#amenities').getByText(amenity.name, { exact: true })).toBeVisible();
  await expect(page.getByText('2 days or more before check-in: 100% refund')).toBeVisible();
  await expect(page.getByText('No loud music after 10 pm.')).toBeVisible();

  expect((await availability).status()).toBe(200);
  const rooms = page.getByRole('list', { name: 'Rooms for your dates' });
  await expect(rooms.getByText('3 left for these dates')).toBeVisible();
  await expect(rooms.getByText('₹2,000', { exact: true }).first()).toBeVisible(); // the room total (the nightly table repeats it, collapsed)

  await page.getByRole('spinbutton', { name: 'Rooms' }).fill('4');
  await page.getByRole('button', { name: 'Check availability' }).click();
  await expect(rooms.getByText('Not available for these dates')).toBeVisible();
  await expect(page.getByText('No room fits these dates and guests.', { exact: false })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Guest reviews' })).toBeVisible();
  await expect(page.locator('#reviews').getByText('No reviews yet.')).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  expect((await page.goto('/stays/no-such-stay-anywhere'))?.status()).toBe(404);
});

test('guides: language filter, profile, services and open dates from the guide’s calendar', async ({ page }) => {
  await page.goto(`/guides?q=${encodeURIComponent(tag)}`);
  await page.getByRole('combobox', { name: 'Language' }).selectOption(s.language.code);
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(new RegExp(`language=${s.language.code}`));
  await expect(page.getByRole('link', { name: `Remove filter: Speaks ${s.language.name}` })).toBeVisible();
  await page.getByRole('list', { name: 'Guide results' }).getByRole('link', { name: `${tag} Guide` }).click();

  await expect(page).toHaveURL(`/guides/${s.guide.id}`);
  await expect(page.getByRole('heading', { level: 1, name: `${tag} Guide` })).toBeVisible();
  const services = page.getByRole('list', { name: 'Guide services' });
  await expect(services.getByRole('heading', { name: 'Waterfall walk' })).toBeVisible();
  await expect(services.getByText('₹1,500')).toBeVisible();
  const dates = page.getByRole('list', { name: 'Available dates' });
  await expect(dates.getByRole('heading', { name: shown(day(5)) })).toBeVisible();
  await expect(dates.getByText('08:00 – 14:00')).toBeVisible();
  await expect(page.locator('#glance-heading + dl').getByRole('link', { name: s.destination.name })).toHaveAttribute('href', `/destinations/${s.destination.slug}`);
  expect(await axeViolations(page)).toEqual([]);
  expect((await page.goto('/guides/not-a-guide-id'))?.status()).toBe(404);
});

test('experiences: destination filter; live seats for the party size; limits enforced', async ({ page }) => {
  await page.goto(`/experiences?q=${encodeURIComponent(tag)}&destination=${s.destination.slug}`);
  await expect(page.getByRole('link', { name: `Remove filter: At ${s.destination.name}` })).toBeVisible();
  await page.getByRole('list', { name: 'Experience results' }).getByRole('link', { name: `${tag} Art Walk` }).click();

  await expect(page.getByRole('heading', { level: 1, name: `${tag} Art Walk` })).toBeVisible();
  await expect(page.getByText('2–8 people')).toBeVisible();
  const sessions = page.getByRole('list', { name: 'Upcoming sessions' });
  await expect(sessions.getByText('4 seats left')).toBeVisible();
  await expect(sessions.getByText('₹500')).toBeVisible();

  const people = page.getByRole('spinbutton', { name: 'People' });
  await people.fill('5');
  await page.getByRole('button', { name: 'Check sessions' }).click();
  await expect(sessions.getByText('Only 4 seats left')).toBeVisible();
  await people.fill('9');
  await page.getByRole('button', { name: 'Check sessions' }).click();
  await expect(page.getByText('This experience takes at most 8.')).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test('packages: sort through the URL; itinerary, inclusions and live departures', async ({ page }) => {
  await page.goto(`/packages?q=${encodeURIComponent(tag)}`);
  await page.getByRole('combobox', { name: 'Sort by' }).selectOption('-durationDays');
  await expect(page).toHaveURL(/sort=-durationDays/);
  await expect(page).toHaveURL(/q=E2E/);
  await page.getByRole('list', { name: 'Package results' }).getByRole('link', { name: `${tag} Circuit` }).click();

  await expect(page.getByRole('heading', { level: 1, name: `${tag} Circuit` })).toBeVisible();
  const itinerary = page.getByRole('list', { name: 'Itinerary by day' });
  await expect(itinerary.getByRole('heading', { name: 'Day 1 · Falls day' })).toBeVisible();
  await expect(itinerary.getByRole('link', { name: s.destination.name })).toHaveAttribute('href', `/destinations/${s.destination.slug}`);
  await expect(page.locator('#inclusions').getByText('Transport')).toBeVisible();
  await expect(page.locator('#inclusions').getByText('Entry fees')).toBeVisible();

  const departures = page.getByRole('list', { name: 'Upcoming departures' });
  await expect(departures.getByText(`${shown(day(10))} – ${shown(day(11))}`)).toBeVisible();
  await expect(departures.getByText('6 seats left')).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Travellers' }).fill('7');
  await page.getByRole('button', { name: 'Check departures' }).click();
  await expect(departures.getByText('Only 6 seats left')).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test('stay detail on a phone: no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/stays/${s.property.slug}`);
  await expect(page.getByRole('list', { name: 'Rooms for your dates' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('sitemap lists the new catalogue pages', async ({ request }) => {
  test.setTimeout(120_000);
  // The sitemap's catalogue reads share the 60 s fetch cache, so a listing cached before setup can lag.
  await expect
    .poll(async () => (await (await request.get('/sitemap.xml')).text()).includes(`/stays/${s.property.slug}</loc>`), { timeout: 75_000, intervals: [5_000] })
    .toBe(true);
  const xml = await (await request.get('/sitemap.xml')).text();
  for (const path of ['/stays', '/guides', '/experiences', '/packages', `/guides/${s.guide.id}`, `/experiences/${s.experience.slug}`, `/packages/${s.pkg.slug}`]) expect(xml).toContain(`${path}</loc>`);
});
