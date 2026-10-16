import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderTopic, resetSession } from '../test/utils';
import { SelectionMenu, clampQuote, readSelection } from './SelectionMenu';
import { useAssistantBus } from './assistantBus';

/** Select the text of `el` and notify listeners (jsdom does not fire selectionchange itself). */
function selectText(el: Element) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = document.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
}

function Page() {
  return (
    <>
      <section data-ask="concept" data-concept="chem.oxygen">
        <p id="txt">Each water molecule has one oxygen atom and two hydrogen atoms.</p>
      </section>
      <p id="outside">Plain text outside the learning regions.</p>
      <SelectionMenu />
    </>
  );
}

describe('selection toolbar (v0.4.0)', () => {
  beforeEach(() => {
    resetSession();
    useAssistantBus.setState({ pending: null, quote: null, mode: 'closed' });
  });
  afterEach(() => document.getSelection()?.removeAllRanges());

  it('clampQuote collapses whitespace and cuts at a word boundary', () => {
    expect(clampQuote('  a\n\n b  ')).toBe('a b');
    const long = 'word '.repeat(200);
    const out = clampQuote(long, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });

  it('only text inside [data-ask] regions opens it', async () => {
    renderTopic(<Page />, { topic: 'water' });
    act(() => selectText(document.getElementById('outside')!));
    expect(readSelection()).toBeNull();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    act(() => selectText(document.getElementById('txt')!));
    expect(readSelection()?.quote).toEqual({ text: 'Each water molecule has one oxygen atom and two hydrogen atoms.', source: 'concept', conceptKey: 'chem.oxygen' });
    expect(await screen.findByRole('toolbar', { name: 'Actions for the selected text' })).toBeInTheDocument();
  });

  it('«Explain» asks the assistant with the quote and intent, then clears the selection', async () => {
    const user = userEvent.setup();
    renderTopic(<Page />, { topic: 'water' });
    act(() => selectText(document.getElementById('txt')!));
    const bar = await screen.findByRole('toolbar');
    await user.click(within(bar).getByRole('button', { name: 'Simpler' }));
    const p = useAssistantBus.getState().pending!;
    expect(p.intent).toBe('simpler');
    expect(p.quote).toMatchObject({ source: 'concept', conceptKey: 'chem.oxygen' });
    expect(p.question).toMatch(/^Explain more simply: “Each water molecule/);
    expect(useAssistantBus.getState().mode).toBe('panel');
    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
  });

  it('«Translate» shows glossary terms offline; «Ask…» attaches the quote; Esc dismisses', async () => {
    const user = userEvent.setup();
    renderTopic(<Page />, { topic: 'water' });
    act(() => selectText(document.getElementById('txt')!));
    const bar = await screen.findByRole('toolbar');
    await user.click(within(bar).getByRole('button', { name: 'Translate' }));
    const gloss = within(bar).getByRole('status');
    expect(within(gloss).getByText('molecule')).toBeInTheDocument();
    expect(within(gloss).getByText('atom')).toBeInTheDocument();
    await user.click(within(bar).getByRole('button', { name: 'Ask…' }));
    expect(useAssistantBus.getState().quote?.text).toMatch(/^Each water molecule/);
    act(() => selectText(document.getElementById('txt')!));
    await screen.findByRole('toolbar');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
  });

  it('a guest without the assistant permission still gets «Translate» only', async () => {
    const { useSession } = await import('../api/session');
    useSession.setState({ permissions: [] });
    renderTopic(<Page />, { topic: 'water' });
    act(() => selectText(document.getElementById('txt')!));
    const bar = await screen.findByRole('toolbar');
    expect(within(bar).getAllByRole('button').map((b) => b.textContent)).toEqual(['Translate']);
  });
});
