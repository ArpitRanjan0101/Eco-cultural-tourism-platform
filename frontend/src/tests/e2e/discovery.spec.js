import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Discovery against the real backend data (whatever is published), through the production build. Map tiles
// are answered locally so test runs never load OpenStreetMap's public tile servers.
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const violations = async (page) => (await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

let sample; // a published destination with coordinates, discovered via the API

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
});

test.beforeAll(async ({ request }) => {
  const list = await (await request.get('/api/v1/destinations?limit=50')).json();
  sample = list.data.find((item) => item.location && item.district);
  if (!sample) throw new Error('The backend has no published destination with coordinates and a district to test with');
});

test('destinations: filter by district and type through the URL, chips, sort, invalid params ignored', async ({ page }) => {
  await page.goto('/destinations?sort=bogus&page=abc&category=Bad%20Slug');
  await expect(page.getByRole('heading', { level: 1, name: 'Destinations' })).toBeVisible();
  expect(await violations(page)).toEqual([]);

  await page.getByRole('combobox', { name: 'District' }).selectOption(sample.district.slug);
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(new RegExp(`district=${sample.district.slug}`));
  const results = page.getByRole('list', { name: 'Destination results' });
  await expect(results.getByRole('link', { name: sample.name })).toBeVisible();
  const chip = page.getByRole('link', { name: `Remove filter: ${sample.district.name}` });
  await expect(chip).toBeVisible();

  await page.getByRole('combobox', { name: 'Sort by' }).selectOption('-name');
  await expect(page).toHaveURL(/sort=-name/);
  await expect(page).toHaveURL(new RegExp(`district=${sample.district.slug}`));

  await page.getByRole('link', { name: `Remove filter: ${sample.district.name}` }).click();
  await expect(page).not.toHaveURL(/district=/);
  await expect(page).toHaveURL(/sort=-name/);
});

test('destinations: map view loads Leaflet on demand with one keyboard-reachable marker per place', async ({ page }) => {
  await page.goto(`/destinations?district=${sample.district.slug}`);
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await page.getByRole('button', { name: 'Map' }).click();
  const map = page.getByRole('region', { name: 'Map of destination results' });
  await expect(map).toBeVisible();
  const marker = map.getByRole('button', { name: sample.name });
  await expect(marker).toBeVisible();
  await marker.focus();
  await page.keyboard.press('Enter');
  await expect(map.locator('.leaflet-popup').getByRole('link', { name: sample.name })).toHaveAttribute('href', `/destinations/${sample.slug}`);
  await expect(map.getByText('OpenStreetMap')).toBeVisible();
});

test('destination detail: heading, breadcrumbs, visiting information, nearby/map, accessible', async ({ page }) => {
  const response = await page.goto(`/destinations/${sample.slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: sample.name })).toBeVisible();
  await expect(page).toHaveTitle(new RegExp(sample.name));
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs.getByRole('link', { name: sample.district.name })).toHaveAttribute('href', `/districts/${sample.district.slug}`);
  await expect(page.getByRole('heading', { name: 'Plan your visit' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Visitor reviews' })).toBeVisible();
  if (await page.getByRole('heading', { name: 'Nearby places' }).count()) {
    await expect(page.getByRole('region', { name: 'Map: Nearby places' })).toBeVisible();
  }
  expect(await violations(page)).toEqual([]);
  expect((await page.goto('/destinations/no-such-place-anywhere'))?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: "We couldn't find that page" })).toBeVisible();
});

test('districts: region filter via URL, district page lists its places', async ({ page }) => {
  await page.goto('/districts');
  const regionLink = page.getByRole('navigation', { name: 'Filter by region' }).getByRole('link').nth(1);
  const regionName = await regionLink.textContent();
  await regionLink.click();
  await expect(page).toHaveURL(/\/districts\?region=/);
  await expect(page.getByRole('link', { name: regionName, exact: true })).toHaveAttribute('aria-current', 'page');

  await page.goto(`/districts/${sample.district.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: sample.district.name })).toBeVisible();
  await expect(page.getByRole('list', { name: `Places in ${sample.district.name}` }).getByRole('link', { name: sample.name })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('search: autocomplete by keyboard, results, type tabs and filters in the URL', async ({ page }) => {
  await page.goto('/search');
  const box = page.getByRole('combobox', { name: 'Search destinations, stays, guides and more' });
  await box.fill(sample.name.slice(0, 4));
  await expect(page.getByRole('listbox', { name: 'Suggestions' })).toBeVisible();
  await box.press('ArrowDown');
  await expect(box).toHaveAttribute('aria-activedescendant', /option-0$/);

  await box.press('Escape');
  await box.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${encodeURIComponent(sample.name.slice(0, 4)).replace(/%20/g, '\\+')}`));
  await expect(page.getByRole('list', { name: /^Results for/ }).getByRole('link', { name: sample.name })).toBeVisible();

  await page.getByRole('navigation', { name: 'Result types' }).getByRole('link', { name: 'Destinations' }).click();
  await expect(page).toHaveURL(/type=destination/);
  await page.locator('aside').getByRole('combobox', { name: 'District' }).selectOption(sample.district.slug);
  await page.locator('aside').getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(new RegExp(`district=${sample.district.slug}`));
  await expect(page).toHaveURL(/type=destination/);
  await expect(page.getByRole('link', { name: `Remove filter: ${sample.district.name}` })).toBeVisible();
  expect(await violations(page)).toEqual([]);

  await page.goto('/search?q=zzqxqzzq');
  await expect(page.getByRole('heading', { name: 'No results for “zzqxqzzq”' })).toBeVisible();
});

test('search on mobile: filters live in a drawer; no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/search?q=${encodeURIComponent(sample.name.slice(0, 4))}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Filters' });
  await expect(drawer.getByRole('combobox', { name: 'Region' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});

test('explore: near me sends the device position to /search/nearby and shows nearby places on a map', async ({ page }) => {
  // Browsers expose geolocation only on secure origins and the test target is http (W33, W43), so the device
  // position is provided by a stand-in. Everything after it is real: BFF → /search/nearby → cards → map.
  const { latitude, longitude } = sample.location;
  await page.addInitScript(([lat, lng]) => {
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: (ok) => ok({ coords: { latitude: lat, longitude: lng, accuracy: 10 } }) },
    });
  }, [latitude, longitude]);
  await page.goto('/explore');
  await expect(page.getByRole('heading', { level: 1, name: 'Explore Jharkhand' })).toBeVisible();
  const nearby = page.waitForResponse((response) => response.url().includes('/api/v1/search/nearby'));
  await page.getByRole('button', { name: 'Use my location' }).click();
  expect((await nearby).status()).toBe(200);
  await expect(page.getByRole('list', { name: 'Places near you' }).getByRole('link', { name: sample.name })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Map of places near you' })).toBeVisible();
});

test('sitemap lists published destinations and districts with absolute URLs', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  expect(xml).toContain(`/destinations/${sample.slug}</loc>`);
  expect(xml).toContain(`/districts/${sample.district.slug}</loc>`);
  expect(xml).toMatch(/<loc>https?:\/\//);
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/Sitemap: https?:\/\/.*\/sitemap\.xml/);
});
