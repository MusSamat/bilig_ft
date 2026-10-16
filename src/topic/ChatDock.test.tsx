import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderTopic, resetSession } from '../test/utils';
import { askAssistant, setChatMode, useAssistantBus } from './assistantBus';
import { ChatDock } from './ChatDock';

describe('floating assistant (ChatDock)', () => {
  beforeEach(() => {
    resetSession();
    sessionStorage.clear();
    localStorage.clear();
    setChatMode('closed');
  });

  it('button → panel → large dialog → panel → minimised, remembered per device', async () => {
    const user = userEvent.setup();
    renderTopic(<ChatDock />, { topic: 'water' });
    await user.click(screen.getByRole('button', { name: 'Open the assistant' }));
    expect(screen.getByRole('region', { name: /Assistant/ })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Question for the assistant' })).toHaveFocus();
    expect(localStorage.getItem('bilig.chat')).toBe('panel');

    await user.click(screen.getByRole('button', { name: 'Enlarge the chat' }));
    const dialog = screen.getByRole('dialog', { name: /Assistant/ });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    await user.keyboard('{Escape}');
    expect(useAssistantBus.getState().mode).toBe('panel');
    await user.click(screen.getByRole('button', { name: 'Minimise the assistant' }));
    expect(useAssistantBus.getState().mode).toBe('closed');
    expect(screen.getByRole('button', { name: 'Open the assistant' })).toHaveFocus();
    expect(localStorage.getItem('bilig.chat')).toBe('closed');
  });

  it('keeps the conversation while minimised', async () => {
    const user = userEvent.setup();
    renderTopic(<ChatDock />, { topic: 'water' });
    await user.click(screen.getByRole('button', { name: 'Open the assistant' }));
    await user.type(screen.getByRole('textbox', { name: 'Question for the assistant' }), 'What is oxygen?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('What is oxygen?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Minimise the assistant' }));
    await user.click(screen.getByRole('button', { name: 'Open the assistant' }));
    expect(screen.getByText('What is oxygen?')).toBeInTheDocument();
  });

  it('«Ask about this» from the card opens the panel and asks', async () => {
    renderTopic(<ChatDock />, { topic: 'water' });
    act(() => askAssistant('What does Oxygen do?'));
    expect(useAssistantBus.getState().mode).toBe('panel');
    expect(await screen.findByText('What does Oxygen do?')).toBeInTheDocument();
  });
});
