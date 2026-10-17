import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/design-system');
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
});

test('showcase has no WCAG 2.2 AA violations (including colour contrast)', async ({ page }) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test('dialog traps focus, closes on Escape and returns focus to the opener', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Open dialog' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Example dialog' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('open drawer passes axe and closes on Escape', async ({ page }) => {
  await page.getByRole('button', { name: 'Open drawer' }).click();
  await expect(page.getByRole('dialog', { name: 'Example drawer' })).toBeVisible();
  const results = await new AxeBuilder({ page }).include('dialog[open]').analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Example drawer' })).toBeHidden();
});

test('menu button and tabs follow their keyboard models', async ({ page }) => {
  const menuButton = page.getByRole('button', { name: 'Actions' });
  await menuButton.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Archive' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(menuButton).toBeFocused();

  await page.getByRole('tab', { name: 'Overview' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Details' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Reviews' })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Reviews' })).toBeVisible();
});

test('confirmation dialog starts on Cancel and confirming shows a toast', async ({ page }) => {
  await page.getByRole('button', { name: 'Delete item' }).click();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Item deleted (example)' })).toBeVisible();
});

test('mobile viewport: no horizontal scroll and dashboard navigation opens in a drawer', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Open Example navigation' }).click();
  await expect(page.getByRole('dialog', { name: 'Example area' })).toBeVisible();
});
