/**
 * Visual regression for the Workbench design system: key components in light
 * and dark, compared with stored baselines (`npx playwright test visual
 * --update-snapshots` after an intended change). The WebGL canvas is masked
 * (software rendering differs between machines); fonts are self-hosted, so
 * text renders the same everywhere.
 */
import { expect, test, type Page } from '@playwright/test';
import { freshMocks, SCENE_TIMEOUT } from './helpers';

// Software WebGL behind glass (backdrop-filter) panels makes each capture slow on a busy machine.
const OPTS = { maxDiffPixelRatio: 0.02, animations: 'disabled' as const, timeout: 120_000 };

async function openTopic(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await freshMocks(page);
  await page.evaluate((th) => {
    localStorage.setItem('bilig.theme', th);
    localStorage.setItem('bilig.coach', '1');
  }, theme);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en/bio/g7/animal-cell?view=study');
  await expect(page.locator('.stage canvas')).toBeVisible({ timeout: SCENE_TIMEOUT });
  await page.waitForTimeout(1200);
}

for (const theme of ['light', 'dark'] as const) {
  test(`components — ${theme}`, async ({ page }) => {
    test.setTimeout(480_000);
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
    await openTopic(page, theme);
    // Freeze the 3D render loop (software WebGL makes every capture slow) and mask the
    // canvas, labels and live thumbnails, which differ between machines.
    await page.evaluate(() => (window as unknown as { __biligScene: { setFrameloop(v: string): void } }).__biligScene.setFrameloop('never'));
    const mask = [page.locator('.stage canvas'), page.locator('.labs'), page.locator('.spec .th')];
    await expect(page.locator('header.top')).toHaveScreenshot(`header-${theme}.png`, OPTS);
    await expect(page.locator('.hero')).toHaveScreenshot(`hero-${theme}.png`, { ...OPTS, mask });
    await expect(page.locator('.stage')).toHaveScreenshot(`stage-${theme}.png`, { ...OPTS, mask });
    await expect(page.locator('#insp')).toHaveScreenshot(`inspector-${theme}.png`, OPTS);
    await page.getByRole('button', { name: 'Open the assistant' }).click();
    await expect(page.locator('.chat-dock')).toHaveScreenshot(`tutor-${theme}.png`, OPTS);
    await page.getByRole('button', { name: 'Minimise the assistant' }).click();
    await page.locator('.procs').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await expect(page.locator('.procs .pgrid')).toHaveScreenshot(`processes-${theme}.png`, OPTS);
    await page.keyboard.press('/');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.sheet__body .sc').first()).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(page.locator('.sheet__body')).toHaveScreenshot(`catalog-${theme}.png`, OPTS);
  });
}
