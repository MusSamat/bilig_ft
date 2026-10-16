/** TZ §3 «Учитель»: sign in, class + CSV import + cards, assignment, lesson mode, presentation PPTX, results. */
import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, freshMocks, SCENE_TIMEOUT } from './helpers';

test('teacher scenario', async ({ page }) => {
  await freshMocks(page);

  // 1. Sign in with e-mail + password.
  await page.goto('/en/login');
  await page.getByRole('tab', { name: 'Teacher or staff' }).click();
  await page.getByLabel('E-mail').fill('teacher@bilig.kg');
  await page.getByLabel('Password').fill('bilig-teacher-2026');
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await expect(page).toHaveURL(/\/en\/teacher$/);
  await expect(page.getByRole('heading', { name: 'Teacher dashboard' })).toBeVisible();
  await expectNoA11yViolations(page);

  // 2. Class «7Б», students from CSV, login cards.
  await page.getByLabel('Class name').fill('7Б');
  await page.getByRole('button', { name: 'Create class' }).click();
  await page.getByRole('button', { name: /Open class “7Б”/ }).click();
  await page.getByRole('tab', { name: 'Students' }).click();
  await page.getByLabel('Import a CSV file').setInputFiles({ name: 'class.csv', mimeType: 'text/csv', buffer: Buffer.from('name\nАсель Б.\nТимур К.\n') });
  await expect(page.getByText('2 students added')).toBeVisible();
  await expect(page.getByText(/^\d{4}$/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print login cards' })).toBeEnabled();

  // 3. Assignment: topic + activities + due date.
  await page.getByRole('tab', { name: 'Assignments' }).click();
  await page.getByLabel('Topic').selectOption({ index: 1 });
  await page.getByRole('checkbox', { name: 'Quiz' }).check();
  await page.getByRole('button', { name: 'Give assignment' }).click();
  await expect(page.getByText('Assignment created')).toBeVisible();

  // 4. Lesson mode on the projector, stepping with arrows / remote.
  await page.goto('/en/bio/g7/animal-cell?view=lesson');
  await expect(page.getByText(/Step 1 of \d+/)).toBeVisible();
  await expect(page.locator('.stage canvas')).toBeVisible({ timeout: SCENE_TIMEOUT });
  await expect(page).toHaveURL(/lesson=0/);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText(/Step 2 of \d+/)).toBeVisible();
  await page.keyboard.press('PageDown');
  await expect(page.getByText(/Step 3 of \d+/)).toBeVisible();
  await expect(page).toHaveURL(/lesson=2/);
  await page.keyboard.press('PageUp');
  await expect(page.getByText(/Step 2 of \d+/)).toBeVisible();

  // 5. Presentation with own 3D snapshot → PPTX.
  await expect(page.locator('.stage canvas')).toBeVisible({ timeout: SCENE_TIMEOUT });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Snapshot' }).first().click();
  await expect(page.getByText('Snapshot added to the presentation')).toBeVisible();
  await page.goto('/en/presentation');
  await page.getByRole('button', { name: 'Build from topic' }).click();
  await expect(page.getByText(/slides$/).first()).toBeVisible();
  await page.getByLabel('Slide title').fill('My title');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PPTX' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pptx$/);
  await page.getByRole('button', { name: 'Save to account' }).click();
  await expect(page.getByText('Presentation saved to your account')).toBeVisible();

  // 6. Results of the class.
  await page.goto('/en/teacher');
  await page.getByRole('button', { name: /Open class “7А”/ }).click();
  await page.getByRole('tab', { name: 'Results' }).click();
  await expect(page.getByText(/of \d+ done/)).toBeVisible();
  await expectNoA11yViolations(page);
});

test('phone 360 px: no horizontal scroll on home and topic', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const url of ['/ky', '/ky/chem/g8/water', '/ky/login']) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
});
