/** TZ §3 «Ученик»: class code → name → PIN; home with assignments & recent topics; topic, process, assistant, quiz saved. */
import { expect, test } from '@playwright/test';
import { answerQuiz, expectNoA11yViolations, freshMocks, SCENE_TIMEOUT } from './helpers';

test('student scenario', async ({ page }) => {
  await freshMocks(page);

  // 1. Class code → pick yourself → PIN.
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expectNoA11yViolations(page);
  await page.getByLabel('Class code').fill('abc123');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Айбек Т.' }).click();
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await expect(page).toHaveURL(/\/en$/);

  // 2. Home: assignments from the teacher.
  const assignments = page.getByRole('region', { name: 'Assignments' }).or(page.locator('section', { hasText: 'Assignments' })).first();
  await expect(assignments).toBeVisible();
  await expectNoA11yViolations(page);
  await assignments.getByRole('link').first().click();

  // 3. Topic: rotate the model, select structures, read the card.
  await expect(page).toHaveURL(/assignment=/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const canvas = page.locator('.stage canvas');
  await expect(canvas).toBeVisible({ timeout: SCENE_TIMEOUT });
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 20, { steps: 8 });
  await page.mouse.up();
  const items = page.getByRole('tree').getByRole('treeitem');
  await items.nth(1).click();
  await expect(page).toHaveURL(/focus=/);
  await expect(page.getByRole('region', { name: 'STEM in life' }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Simply put' }).first()).toBeVisible();
  // keyboard selection through the accessible tree
  await items.nth(1).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expectNoA11yViolations(page);

  // 4. Process, assistant, quiz (sections of the page, as in the Workbench).
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page).toHaveURL(/process=/);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Open the assistant' }).click();
  await page.getByRole('textbox', { name: 'Question for the assistant' }).fill('What does the nucleus do?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('button', { name: /Show on the model/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Minimise the assistant' }).click();

  await page.getByRole('button', { name: 'Start the quiz' }).click();
  await answerQuiz(page);
  await page.getByRole('button', { name: 'See results' }).click();

  // 5. The result is saved on the server (attempt linked to the assignment).
  await expect(page.getByText('Result saved')).toBeVisible();
  const saved = await page.evaluate(() => window.__biligMock!.state().attempts.filter((a) => a.finishedAt && a.assignmentId).length);
  expect(saved).toBe(1);

  // Recent topics on the dashboard.
  await page.goto('/en/cabinet');
  await expect(page.getByText('Recently opened topics')).toBeVisible();
});
