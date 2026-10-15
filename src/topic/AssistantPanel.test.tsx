import { describe, expect, it, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockDb } from '../mocks/db';
import { renderTopic, resetSession } from '../test/utils';
import { useViewer } from '../state/viewer';
import { AssistantPanel } from './AssistantPanel';

describe('AssistantPanel (W-32)', () => {
  beforeEach(() => {
    resetSession();
    sessionStorage.clear();
  });

  it('greets, offers suggestions, streams an SSE answer and highlights cited structures in 3D', async () => {
    const user = userEvent.setup();
    renderTopic(<AssistantPanel />, { topic: 'water' });
    expect(screen.getByText(/Hi! Ask me anything about/)).toBeInTheDocument();
    const chips = screen.getAllByRole('button', { name: /What does|Where is|How big/ });
    expect(chips).toHaveLength(3);
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
    await user.click(screen.getAllByRole('button', { name: /Что делает/ })[0]);
    expect(await screen.findByText('Помощник временно недоступен')).toBeInTheDocument();
  });
});
