import { expect, test } from '@playwright/test';
import { axeViolations } from './helpers';

// Public chrome and homepage against the real backend, whatever CMS content currently exists (a published
// homepage, or the content-free fallback while none is published, G5).

test('homepage: one h1, header, footer, skip link, no WCAG 2.2 AA violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content');
  expect(await axeViolations(page)).toEqual([]);
});

test('desktop navigation shows CMS or fallback sections with account actions', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav).toBeVisible();
  expect(await nav.getByRole('link').count()).toBeGreaterThan(0);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
});

test('mobile: no horizontal scroll; menu drawer opens with account actions and closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const opener = page.getByRole('button', { name: 'Open menu' });
  await opener.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('navigation', { name: 'Account' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
});

test('unknown CMS pages are real 404s; robots.txt keeps private areas out', async ({ page, request }) => {
  const response = await page.goto('/pages/no-such-page');
  expect(response?.status()).toBe(404);
  const robots = await (await request.get('/robots.txt')).text();
  for (const path of ['/account', '/admin', '/partner', '/api']) expect(robots).toContain(`Disallow: ${path}`);
});
