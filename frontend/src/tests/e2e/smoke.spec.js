import { expect, test } from '@playwright/test';

test('root page renders in a real browser', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Jharkhand Eco & Cultural Tourism');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jharkhand Eco & Cultural Tourism');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('unknown routes return 404 with the not-found page', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to the homepage' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('health endpoint reports ok without caching', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(await response.json()).toEqual({ status: 'ok' });
});

test('response does not advertise the framework', async ({ request }) => {
  const response = await request.get('/');
  expect(response.headers()['x-powered-by']).toBeUndefined();
});
