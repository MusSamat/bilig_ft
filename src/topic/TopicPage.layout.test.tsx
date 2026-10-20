/**
 * Topic page layout (audit P-1, P-2, P-3): the hero is compact (crumbs and
 * toolbar, title and specimens, the goal folded), the 3D stage follows it
 * directly and is sized to the rest of the first screen, and nothing floats
 * over the model by default.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import i18n from '../i18n';
import { setWebGLAvailable } from '../scene/webgl';
import { useViewer } from '../state/viewer';
import { renderRoutes, resetSession } from '../test/utils';
import { ABOUT_KEY } from './TopicHeader';
import TopicPage from './TopicPage';

vi.mock('../scene/SceneViewer', () => ({ default: () => <div data-testid="scene" /> }));

const open = (path = '/en/bio/g7/animal-cell') => {
  // The URL sync reads window.location (the browser's), so keep it in step with the memory router.
  window.history.replaceState(null, '', path);
  return renderRoutes(path, <Route path="/:lang/:subject/:grade/:topic" element={<TopicPage />} />);
};

beforeEach(async () => {
  resetSession();
  localStorage.clear();
  setWebGLAvailable(true);
  await i18n.changeLanguage('en');
});
afterEach(() => {
  setWebGLAvailable(null);
  window.history.replaceState(null, '', '/');
});

const WAIT = { timeout: 15000 };

describe('Topic page: the stage is on the first screen', () => {
  it('the hero is compact and the stage comes right after it, sized to the viewport left under the hero', async () => {
    open();
    const h1 = await screen.findByRole('heading', { level: 1 });
    const hero = h1.closest('section')!;
    const stage = await screen.findByTestId('stage', {}, WAIT);
    // DOM (= visual and Tab) order: hero → stage → inspector.
    expect(hero.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(stage.parentElement?.previousElementSibling).toBe(hero);
    // Height = what is left of the viewport under the header and the measured hero.
    expect(stage.className).toContain('var(--hero-h');
    expect(stage.className).toContain('100dvh');
    // No status tiles any more; the goal is one folded summary line.
    expect(screen.queryByRole('region', { name: /status/i })).toBeNull();
    const details = hero.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(within(details.querySelector('summary')!).getByText(/Lesson goal/)).toBeInTheDocument();
  });

  it('the goal details unfold and the choice is remembered', async () => {
    const user = userEvent.setup();
    open();
    const h1 = await screen.findByRole('heading', { level: 1 });
    const details = h1.closest('section')!.querySelector('details')!;
    await user.click(details.querySelector('summary')!);
    expect(details.open).toBe(true);
    expect(localStorage.getItem(ABOUT_KEY)).toBe('1');
  });

  it('the view modes are a toolbar button, not a panel over the model; its state is remembered', async () => {
    const user = userEvent.setup();
    open('/en/bio/g7/animal-cell?view=study');
    const toolbar = await screen.findByRole('toolbar', { name: 'Scene tools' }, WAIT);
    await waitFor(() => expect(useViewer.getState().modeDefs.length).toBeGreaterThan(0), WAIT);
    expect(screen.queryByRole('region', { name: 'Model view' })).toBeNull();
    const view = await within(toolbar).findByRole('button', { name: 'View' }, WAIT);
    expect(view).toHaveAttribute('aria-expanded', 'false');
    await user.click(view);
    expect(view).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Model view' })).toBeInTheDocument();
    expect(localStorage.getItem('bilig.viewMenu')).toBe('1');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Model view' })).toBeNull();
    expect(view).toHaveFocus();
    expect(localStorage.getItem('bilig.viewMenu')).toBe('0');
  });

  it('select-only tools appear once a part is selected (no dimmed buttons without a reason)', async () => {
    open('/en/bio/g7/animal-cell?view=study');
    const toolbar = await screen.findByRole('toolbar', { name: 'Scene tools' }, WAIT);
    await waitFor(() => expect(useViewer.getState().topicKey).toBe('animal-cell'), WAIT);
    expect(within(toolbar).queryByRole('button', { name: 'Isolate' })).toBeNull();
    act(() => useViewer.getState().select('bio.nucleus'));
    expect(await within(toolbar).findByRole('button', { name: 'Isolate' })).toBeEnabled();
  });
});
