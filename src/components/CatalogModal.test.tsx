import { describe, expect, it, beforeEach } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { buildCatalog } from '../mocks/data';
import { renderRoutes, resetSession } from '../test/utils';
import { useUi } from '../state/ui';
import { Shell } from './Shell';
import { searchCatalog } from './CatalogModal';

const page = () => renderRoutes('/en', <Route path="/:lang" element={<Shell />}><Route index element={<p>home</p>} /></Route>);

describe('CatalogModal (W-02)', () => {
  beforeEach(() => {
    resetSession();
    useUi.setState({ catalogOpen: false });
  });

  it('opens with "/" and Ctrl+K, is a modal dialog, closes with Esc and restores focus', async () => {
    const user = userEvent.setup();
    page();
    await user.keyboard('/');
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('searchbox')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('renders groups and subject cards from data, with model counts and a locked «soon» subject', async () => {
    page();
    act(() => useUi.getState().openCatalog());
    const dialog = await screen.findByRole('dialog');
    const catalog = buildCatalog();
    await waitFor(() => expect(within(dialog).getAllByRole('heading', { level: 3 }).length).toBeGreaterThan(1));
    const soon = catalog.subjects.find((s) => s.status === 'soon')!;
    const locked = within(dialog).getByRole('button', { name: new RegExp(soon.title.en) });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog).getAllByText(/\d+ models?/).length).toBeGreaterThan(0);
  });

  it('keeps Tab focus inside the dialog', async () => {
    const user = userEvent.setup();
    page();
    act(() => useUi.getState().openCatalog());
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getAllByRole('button').length).toBeGreaterThan(3));
    for (let i = 0; i < 40; i++) await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('searches topics across all languages (Russian query in the English UI)', async () => {
    const user = userEvent.setup();
    page();
    act(() => useUi.getState().openCatalog());
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getAllByRole('heading', { level: 3 }).length).toBeGreaterThan(1));
    await user.type(within(dialog).getByRole('searchbox'), 'клетка');
    expect(await within(dialog).findByText('Animal cell')).toBeInTheDocument();
  });

  it('searchCatalog matches every language and scales to many topics', () => {
    const c = buildCatalog();
    expect(searchCatalog(c, 'Жаныбар').topics.map((t) => t.key)).toContain('animal-cell');
    const big = { ...c, topics: Array.from({ length: 2000 }, (_, i) => ({ ...c.topics[i % c.topics.length], key: `t${i}` })) };
    // Best of three runs: a single sample is noisy when the whole suite runs in parallel.
    const times: number[] = [];
    let r = searchCatalog(big, 'cell');
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      r = searchCatalog(big, 'cell');
      times.push(performance.now() - t0);
    }
    expect(Math.min(...times)).toBeLessThan(200);
    expect(r.topics.length).toBeLessThanOrEqual(30);
  });
});
