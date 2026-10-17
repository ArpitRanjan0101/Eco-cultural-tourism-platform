import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Real CMS content end to end: an admin creates a landing page through the BFF (contract-allowlisted admin
// routes), the backend validates and publishes it, and the public site renders it. A landing page is used so the
// dev site's homepage is never overwritten; it is archived afterwards. Admin credentials come from the run
// environment (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD) and are never stored.
test.describe.configure({ mode: 'serial' });

const ADMIN = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };
const stamp = Date.now();
const title = `E2E CMS ${stamp}`;
const slug = `e2e-cms-${stamp}`;
let pageId;

const axeTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const violations = (results) => results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

async function adminRequest(page) {
  await page.goto('/login');
  const csrf = (await page.context().cookies()).find((c) => c.name === 'jt_csrf').value;
  const headers = { origin: new URL(page.url()).origin, 'x-csrf-token': csrf };
  const login = await page.request.post('/api/auth/login', { data: ADMIN, headers });
  expect(login.status(), 'admin sign-in').toBe(200);
  return {
    post: (path, data) => page.request.post(path, { data, headers }),
    put: (path, data) => page.request.put(path, { data, headers }),
    patch: (path, data) => page.request.patch(path, { data, headers }),
    delete: (path) => page.request.delete(path, { headers }),
  };
}

test.beforeAll(() => {
  if (!ADMIN.email || !ADMIN.password) throw new Error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run the CMS suite');
});

test('admin creates a page with live sections; drafts stay private; publishing makes it public', async ({ page }) => {
  const admin = await adminRequest(page);
  const created = await admin.post('/api/v1/admin/cms/pages', { title, pageType: 'landing', seoDescription: 'End-to-end CMS rendering check' });
  expect(created.status()).toBe(201);
  pageId = (await created.json()).data.id;

  const sections = await admin.put(`/api/v1/admin/cms/pages/${pageId}/sections`, {
    sections: [
      { sectionType: 'home_search', data: { heading: 'Find your next trip', placeholder: 'Waterfalls, forests, festivals' } },
      { sectionType: 'rich_text', data: { heading: 'About this page', markdown: 'Rendered from **validated** CMS data. [See destinations](/destinations).' } },
      { sectionType: 'statistics_strip', data: { heading: 'Test figures', items: [{ value: '24', label: 'Test districts' }] } },
      { sectionType: 'district_grid', data: { heading: 'Browse districts' } },
      { sectionType: 'featured_stays', data: { heading: 'Newest stays', source: 'latest', limit: 3 } },
      { sectionType: 'cultural_highlights', data: { heading: 'Test culture', items: [{ title: 'Test story', text: 'Editorial text.' }] } },
      { sectionType: 'faq', data: { heading: 'Test questions', items: [{ question: 'Is this rendered?', answer: 'Yes, from the CMS.' }] } },
      { sectionType: 'cta_banner', data: { heading: 'Ready?', text: 'Create an account to save trips.', cta: { label: 'Create account', href: '/register' } } },
    ],
  });
  expect(sections.status()).toBe(200);

  // Unsafe content never gets stored (backend allowlist), so it can never reach the page.
  const unsafe = await admin.put(`/api/v1/admin/cms/pages/${pageId}/sections`, { sections: [{ sectionType: 'rich_text', data: { markdown: '<script>alert(1)</script>' } }] });
  expect(unsafe.status()).toBe(422);

  // Draft: not public (checked through the uncached BFF route so no stale 404 is cached for the page).
  expect((await page.request.get(`/api/v1/content/pages/${slug}`)).status()).toBe(404);
  expect((await admin.patch(`/api/v1/admin/cms/pages/${pageId}/status`, { status: 'published' })).status()).toBe(200);
  expect((await page.request.get(`/api/v1/content/pages/${slug}`)).status()).toBe(200);
});

test('the published page renders every section through the registry, accessibly', async ({ page }) => {
  await page.goto(`/pages/${slug}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page).toHaveTitle(new RegExp(title));
  for (const heading of ['Find your next trip', 'About this page', 'Test figures', 'Browse districts', 'Test culture', 'Test questions', 'Ready?']) {
    await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible();
  }
  await expect(page.getByRole('definition')).toHaveText('24');
  await expect(page.getByRole('link', { name: 'See destinations' })).toHaveAttribute('href', '/destinations');
  await expect(page.getByRole('link', { name: 'Ranchi' }).first()).toHaveAttribute('href', '/districts/ranchi');

  const question = page.getByRole('button', { name: 'Is this rendered?' });
  await question.click();
  await expect(page.getByText('Yes, from the CMS.')).toBeVisible();

  expect(violations(await new AxeBuilder({ page }).withTags(axeTags).analyze())).toEqual([]);

  await page.getByLabel('Search destinations, stays, guides and more').fill('falls');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=falls$/);
});

test('public layout: header, footer, mobile navigation and homepage', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content');
  await expect(page.getByRole('contentinfo')).toBeVisible();
  expect(violations(await new AxeBuilder({ page }).withTags(axeTags).analyze())).toEqual([]);

  await page.setViewportSize({ width: 375, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Open menu' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('navigation', { name: 'Account' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});

test.afterAll(async ({ browser }) => {
  if (!pageId) return;
  const page = await browser.newPage();
  const admin = await adminRequest(page);
  expect((await admin.delete(`/api/v1/admin/cms/pages/${pageId}`)).status()).toBe(204);
  expect((await page.request.get(`/api/v1/content/pages/${slug}`)).status()).toBe(404);
  await page.close();
});
