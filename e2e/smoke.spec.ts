import { expect, test } from '@playwright/test';
import { SCENE_TIMEOUT } from './helpers';

test('home and topic pages render without console errors (guest, missing GLB assets)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/en');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/en/bio/g7/animal-cell');
  await expect(page.locator('.stage canvas')).toBeVisible({ timeout: SCENE_TIMEOUT });
  await page.waitForTimeout(1500);
  await page.goto('/en/chem/g8/water');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Water');
  await expect(page.locator('.stage canvas')).toBeVisible({ timeout: SCENE_TIMEOUT });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/smoke-water.png', fullPage: false });
  expect(errors).toEqual([]);
});
