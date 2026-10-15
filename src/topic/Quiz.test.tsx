import { describe, expect, it, beforeEach } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderTopic, resetSession } from '../test/utils';
import { useViewer } from '../state/viewer';
import { Quiz, parseNumber } from './Quiz';

describe('Quiz (W-45)', () => {
  beforeEach(resetSession);

  it('draws a deterministic sample, checks answers with explanations, scores and retakes', async () => {
    const user = userEvent.setup();
    const { pkg } = renderTopic(<Quiz ready />, { topic: 'water' });
    await user.click(screen.getByRole('button', { name: 'Start the quiz' }));
    const questions = screen.getAllByRole('listitem');
    expect(questions).toHaveLength(pkg.topic.activities.quiz!.sampleSize);

    for (const q of questions) {
      const type = q.getAttribute('data-testid')!.replace('question-', '');
      const w = within(q);
      if (type === 'single') await user.click(w.getAllByRole('radio')[0]);
      if (type === 'multiple') await user.click(w.getAllByRole('checkbox')[0]);
      if (type === 'match') for (const sel of w.getAllByRole('combobox')) await user.selectOptions(sel, within(sel).getAllByRole('option')[1]);
      if (type === 'numeric') await user.type(w.getByRole('textbox'), '18,02');
      if (type === 'find-on-model') {
        await user.click(w.getByRole('button', { name: 'Pick on the model' }));
        expect(useViewer.getState().findItemKey).not.toBeNull();
        act(() => useViewer.getState().pick('chem.oxygen'));
        expect(w.getByText(/Picked:/)).toBeInTheDocument();
      }
      await user.click(w.getByRole('button', { name: 'Check' }));
      expect(w.getByText(/^(Correct|Incorrect|Partly correct)$/)).toBeInTheDocument();
      expect(w.getByText('Explanation', { exact: false })).toBeInTheDocument();
    }
    expect(screen.getByText(/of \d+ correct/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retake' }));
    expect(screen.queryByText(/of \d+ correct/)).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Check' }).length).toBe(pkg.topic.activities.quiz!.sampleSize);
  });

  it('parses decimal commas', () => {
    expect(parseNumber('18,02')).toBe(18.02);
    expect(Number.isNaN(parseNumber(' '))).toBe(true);
  });
});
