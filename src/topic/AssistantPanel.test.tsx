import { describe, expect, it, beforeEach } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockDb } from '../mocks/db';
import { renderTopic, resetSession } from '../test/utils';
import { useViewer } from '../state/viewer';
import { AssistantPanel } from './AssistantPanel';
import { attachQuote, askAssistant, useAssistantBus } from './assistantBus';

describe('AssistantPanel (W-32)', () => {
  beforeEach(() => {
    resetSession();
    sessionStorage.clear();
  });

  it('greets, offers suggestions, streams an SSE answer and highlights cited structures in 3D', async () => {
    const user = userEvent.setup();
    renderTopic(<AssistantPanel />, { topic: 'water' });
    expect(screen.getByText(/Hi! Ask me anything about/)).toBeInTheDocument();
    // Follow-ups about the topic itself while nothing is selected (contract suggestQuestions).
    const chips = within(screen.getByRole('group', { name: 'Suggestions' })).getAllByRole('button');
    expect(chips).toHaveLength(3);
    expect(chips[0]).toHaveTextContent(/^What is water/);
    await user.type(screen.getByRole('textbox', { name: 'Question for the assistant' }), 'What is oxygen?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(useViewer.getState().cited).toContain('chem.oxygen'));
    expect(useViewer.getState().selected).toBe('chem.oxygen');
    expect(screen.getByRole('button', { name: /Show on the model: Oxygen/ })).toBeInTheDocument();
  });

  it('shows a localized «assistant unavailable» message on 503', async () => {
    mockDb.flags.tutorDown = true;
    const user = userEvent.setup();
    renderTopic(<AssistantPanel />, { topic: 'water', lang: 'ru' });
    await user.click(within(screen.getByRole('group', { name: 'Подсказки' })).getAllByRole('button')[0]);
    expect(await screen.findByText('Помощник временно недоступен')).toBeInTheDocument();
  });

  it('shows what it is looking at; a focus chip can be dropped; follow-ups are about the selection', async () => {
    const user = userEvent.setup();
    renderTopic(<AssistantPanel />, { topic: 'water' });
    act(() => useViewer.getState().select('chem.oxygen'));
    const ctx = screen.getByRole('group', { name: 'Question context' });
    expect(within(ctx).getByText('Oxygen')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Question for the assistant' })).toHaveAttribute('placeholder', 'A question about “Oxygen”…');
    expect(within(screen.getByRole('group', { name: 'Suggestions' })).getAllByRole('button')[0]).toHaveTextContent(/oxygen/i);
    await user.click(within(ctx).getByRole('button', { name: /Ask about the whole topic/ }));
    expect(within(ctx).queryByText('Oxygen')).not.toBeInTheDocument();
  });

  it('a quick action sends the quote and intent; an attached quote goes with the typed question', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      if (req.url.includes('/tutor/ask')) bodies.push(await req.clone().json());
      return orig(req);
    }) as typeof fetch;
    try {
      renderTopic(<AssistantPanel />, { topic: 'water' });
      act(() => askAssistant({ question: 'Explain: “water molecule”', intent: 'explain', quote: { text: 'water molecule', source: 'concept', conceptKey: 'chem.oxygen' } }));
      expect(await screen.findByText('water molecule')).toBeInTheDocument();
      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toMatchObject({ intent: 'explain', conceptKey: 'chem.oxygen', context: { mode: 'explore', quote: { text: 'water molecule', source: 'concept' } } });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled());

      act(() => attachQuote({ text: 'two hydrogen atoms', source: 'topic' }));
      expect(screen.getByRole('textbox', { name: 'Question for the assistant' })).toHaveAttribute('placeholder', 'What would you like to ask about the selected text?');
      await user.type(screen.getByRole('textbox', { name: 'Question for the assistant' }), 'Why two?');
      await user.click(screen.getByRole('button', { name: 'Send' }));
      await waitFor(() => expect(bodies).toHaveLength(2));
      expect(bodies[1]).toMatchObject({ question: 'Why two?', context: { quote: { text: 'two hydrogen atoms' } } });
      expect(useAssistantBus.getState().quote).toBeNull();
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('an off-topic answer offers questions that lead back to the topic', async () => {
    const user = userEvent.setup();
    renderTopic(<AssistantPanel />, { topic: 'water' });
    await user.type(screen.getByRole('textbox', { name: 'Question for the assistant' }), 'Who won the football match?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/do not answer this question/)).toBeInTheDocument();
    const chips = within(screen.getByRole('group', { name: 'Suggestions' })).getAllByRole('button');
    expect(chips.length).toBeGreaterThan(0);
  });
});
