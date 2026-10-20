/** TZ §3 «Учитель»: sign in, class + CSV import + cards, assignment, lesson mode, presentation PPTX, results. */
import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, freshMocks, SCENE_TIMEOUT } from './helpers';

test('teacher scenario', async ({ page }) => {
  await freshMocks(page);

  // 1. Sign in with the WhatsApp number + password (contract 0.7.0).
  await page.goto('/en/login');
  const teacherTab = page.getByRole('tab', { name: 'Teacher or staff' }); // only when the student sign-in is shown
  if (await teacherTab.count()) await teacherTab.click();
  await page.getByLabel('WhatsApp number').fill('555 00 00 01');
  await page.getByLabel('Password', { exact: true }).fill('bilig-teacher-2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/teacher$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Hello, Гүлнара!' })).toBeVisible();
  await expectNoA11yViolations(page);

  // 2. Class «7Б» (in a sheet), students from CSV, sign-in cards.
  await page.getByRole('button', { name: 'Add a class' }).click();
  const sheet = page.getByRole('dialog', { name: 'New class' });
  await sheet.getByLabel('Class name').fill('7Б');
  await sheet.getByLabel('Grade').selectOption('7');
  await sheet.getByRole('button', { name: 'Biology' }).click(); // v0.8.0: one or more subjects
  await page.getByRole('button', { name: 'Add class' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '7Б' })).toBeVisible();
  await expect(page.getByTestId('subject-card')).toHaveCount(1); // the class opens on its subjects
  await page.getByRole('tab', { name: 'Students' }).click();
  await page.getByRole('button', { name: 'Add students' }).click();
  await page.getByLabel('Import a CSV file').setInputFiles({ name: 'class.csv', mimeType: 'text/csv', buffer: Buffer.from('name\nАсель Б.\nТимур К.\n') });
  await expect(page.getByText('2 students added')).toBeVisible();
  await expect(page.getByTestId('card-pin').first()).toHaveText(/^\d{4}$/);
  await expect(page.getByRole('button', { name: 'Print' })).toBeEnabled();

  // 3. Assignment: topic + activities + due date (in a sheet).
  await page.getByRole('tab', { name: 'Assignments' }).click();
  await page.getByRole('button', { name: 'Give assignment' }).click();
  await page.getByLabel('Topic').selectOption({ index: 1 });
  await page.getByRole('checkbox', { name: 'Quiz' }).check();
  await page.getByRole('button', { name: 'Give', exact: true }).click();
  await expect(page.getByText('Assignment given')).toBeVisible();

  // 4. Lesson mode on the projector (the default; old ?view=lesson links still work), stepping with arrows / remote.
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
  await page.getByRole('link', { name: /Open class “7А”/ }).click();
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
