import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockDb } from '../mocks/db';
import { renderTopic, resetSession } from '../test/utils';
import { useViewer } from '../state/viewer';
import { ConceptCard } from './ConceptCard';
import { PracticeQuiz } from './PracticeQuiz';
import { useGeneratedStore } from './generated';

beforeEach(() => {
  resetSession();
  mockDb.generated = [];
  mockDb.flags.tutorDown = false;
  useGeneratedStore.setState({ buckets: {}, votes: {} });
});

describe('«More examples» on the concept card (v0.4.0)', () => {
  it('adds AI-labelled examples under the authored ones; «more» never repeats; a report hides one', async () => {
    const user = userEvent.setup();
    renderTopic(<ConceptCard />, { topic: 'water' });
    act(() => useViewer.getState().select('chem.oxygen'));
    const simple = screen.getByRole('region', { name: 'Simply put' });
    await user.click(within(simple).getByRole('button', { name: 'More examples' }));
    const list = await within(simple).findByRole('list', { name: 'Examples from AI' });
    const first = within(list).getAllByRole('listitem');
    expect(first.length).toBeGreaterThan(0);
    expect(within(first[0]).getByText('AI')).toBeInTheDocument();

    await user.click(within(simple).getByRole('button', { name: /More examples|No more examples/ }));
    await waitFor(() => expect(within(list).getAllByRole('listitem').length).toBeGreaterThanOrEqual(first.length));
    const titles = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(new Set(titles).size).toBe(titles.length);

    const row = within(list).getAllByRole('listitem')[0];
    const before = within(list).getAllByRole('listitem').length;
    await user.click(within(row).getByRole('button', { name: 'Report' }));
    await user.click(within(row).getByRole('button', { name: 'Wrong' }));
    const genCount = () => simple.querySelectorAll('.ex__gen > li').length;
    await waitFor(() => expect(genCount()).toBe(before - 1));
    await waitFor(() => expect(mockDb.generated.some((g) => g.bad === 1 && g.reasons.wrong === 1)).toBe(true));
  });

  it('shows a localized error when the assistant is unavailable', async () => {
    mockDb.flags.tutorDown = true;
    const user = userEvent.setup();
    renderTopic(<ConceptCard />, { topic: 'water', lang: 'ru' });
    const stem = screen.getByRole('region', { name: 'STEM в жизни' });
    await user.click(within(stem).getByRole('button', { name: 'Ещё STEM-примеры' }));
    expect(await within(stem).findByRole('alert')).toHaveTextContent('Помощник временно недоступен');
  });

  it('is hidden without the assistant permission', async () => {
    const { useSession } = await import('../api/session');
    useSession.setState({ permissions: [] });
    renderTopic(<ConceptCard />, { topic: 'water' });
    expect(screen.queryByRole('button', { name: 'More examples' })).not.toBeInTheDocument();
  });
});

describe('«Questions for the class» (v0.4.0)', () => {
  it('one question at a time; the teacher marks the class answer, reveals, moves on; «good» is sent once', async () => {
    const user = userEvent.setup();
    renderTopic(<PracticeQuiz />, { topic: 'water' });
    const sec = screen.getByRole('region', { name: 'Questions for the class' });
    expect(within(sec).getByText(/About “Water/)).toBeInTheDocument();
    await user.click(within(sec).getByRole('button', { name: 'Write 3 questions' }));
    expect(await within(sec).findByText(/^Question 1 of \d/)).toBeInTheDocument();
    const opts = within(sec).getAllByRole('button', { pressed: false }).filter((b) => b.className.includes('practice__opt'));
    expect(opts.length).toBeGreaterThanOrEqual(2);
    await user.click(opts[0]);
    expect(opts[0]).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(sec).getByRole('button', { name: 'Show the answer' }));
    expect(within(sec).getByRole('status')).toBeInTheDocument();
    expect(sec.querySelectorAll('.practice__opt.is-ok')).toHaveLength(1);
    await user.click(within(sec).getByRole('button', { name: 'Good example' }));
    await waitFor(() => expect(mockDb.generated.filter((g) => g.good === 1)).toHaveLength(1));
    expect(within(sec).getByRole('button', { name: 'Good example' })).toBeDisabled();
    await user.click(within(sec).getByRole('button', { name: /Next/ }));
    expect(within(sec).getByText(/^Question 2 of/)).toBeInTheDocument();
    expect(within(sec).queryByRole('status')).not.toBeInTheDocument();
  });

  it('asks about the selected structure', async () => {
    renderTopic(<PracticeQuiz />, { topic: 'water' });
    act(() => useViewer.getState().select('chem.oxygen'));
    expect(screen.getByText(/About “Oxygen”/)).toBeInTheDocument();
  });
});
