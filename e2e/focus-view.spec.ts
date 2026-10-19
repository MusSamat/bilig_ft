/** The 3D focus view (same scene, ~94% of the screen) and the floating assistant over it. */
import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, freshMocks, SCENE_TIMEOUT } from './helpers';

test('focus view keeps the scene state, traps focus, closes with Esc; the assistant floats above it', async ({ page }) => {
  await freshMocks(page);
  await page.evaluate(() => localStorage.setItem('bilig.coach', '1'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en/bio/g7/animal-cell?focus=bio.nucleus&view=study');
  await expect(page.locator('.stage canvas')).toBeVisible({ timeout: SCENE_TIMEOUT });

  // Desktop: the stage stays on screen while the page scrolls.
  await page.mouse.wheel(0, 600);
  await expect(page.locator('.stage')).toBeInViewport();

  const expand = page.getByRole('button', { name: 'Expand' });
  await expand.click();
  const view = page.getByRole('dialog', { name: '3D scene' });
  await expect(view).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1); // the same WebGL canvas, not a copy
  await expect(page).toHaveURL(/focus=bio\.nucleus/);
  await expect(view.getByRole('heading', { name: 'Nucleus' })).toBeVisible(); // concept drawer
  await expectNoA11yViolations(page);

  // The assistant opens on top of the view.
  await page.getByRole('button', { name: 'Open the assistant' }).click();
  await expect(page.getByRole('textbox', { name: 'Question for the assistant' })).toBeFocused();
  await page.getByRole('button', { name: 'Minimise the assistant' }).click();

  await view.focus();
  await page.keyboard.press('Escape');
  await expect(view).toBeHidden();
  await expect(page).toHaveURL(/focus=bio\.nucleus/);

  // `F` toggles it from the keyboard.
  await page.locator('body').press('f');
  await expect(page.getByRole('dialog', { name: '3D scene' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '3D scene' })).toBeHidden();
});
