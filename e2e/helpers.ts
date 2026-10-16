import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * The 3D stage needs the GPU process; with software WebGL (SwiftShader, CI and
 * old PCs) starting it can take tens of seconds on a busy machine.
 */
export const SCENE_TIMEOUT = 90_000;

/** Fresh mock state per test (MSW state lives in sessionStorage). */
export async function freshMocks(page: Page): Promise<void> {
  await page.goto('/en');
  await page.waitForFunction(() => !!window.__biligMock);
  await page.evaluate(() => {
    window.__biligMock!.reset();
    localStorage.clear();
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__biligMock);
}

/** WCAG 2.1 AA via axe (§10); the WebGL canvas itself is excluded. */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('canvas').analyze();
  const summary = res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(summary).toEqual([]);
}

/** Answer every visible quiz question with the first option (verdict doesn't matter for the flow). */
export async function answerQuiz(page: Page): Promise<void> {
  const questions = page.locator('li.question');
  const n = await questions.count();
  for (let i = 0; i < n; i++) {
    const q = questions.nth(i);
    const type = ((await q.getAttribute('data-testid')) ?? '').replace('question-', '');
    if (type === 'single') await q.getByRole('radio').first().check();
    if (type === 'multiple') await q.getByRole('checkbox').first().check();
    if (type === 'match') {
      const selects = q.getByRole('combobox');
      for (let k = 0; k < (await selects.count()); k++) await selects.nth(k).selectOption({ index: 1 });
    }
    if (type === 'numeric') await q.getByRole('textbox').fill('1');
    if (type === 'find-on-model') {
      await q.getByRole('button', { name: 'Pick on the model' }).click();
      // Keyboard/tree alternative to clicking the 3D model.
      await page.getByRole('tree').getByRole('treeitem').last().click();
    }
    await q.getByRole('button', { name: 'Check' }).click();
    await expect(q.getByText(/^(Correct|Incorrect|Partly correct)$/)).toBeVisible();
  }
}
