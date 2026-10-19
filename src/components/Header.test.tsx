import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { HttpResponse, http } from 'msw';
import { API_PREFIX, problem } from '@bilig/content-model/api';
import i18n from '../i18n';
import { loginAdult } from '../api/session';
import { TEACHER_EMAIL, TEACHER_PASSWORD } from '../mocks/db';
import { server } from '../mocks/node';
import { useDeck } from '../state/deck';
import { useUi } from '../state/ui';
import { renderRoutes, resetSession, topicPkg } from '../test/utils';
import TopicPage from '../topic/TopicPage';
import { Shell } from './Shell';

const renderShell = (path: string) =>
  renderRoutes(
    path,
    <Route path="/:lang" element={<Shell />}>
      <Route path="*" element={<p>page</p>} />
      <Route index element={<p>home</p>} />
    </Route>,
  );

/** What the topic page tells the header (subject pill, topic key). */
const onTopic = (key = 'animal-cell') => {
  const pkg = topicPkg(key);
  act(() => useUi.getState().setContext({ subject: pkg.subject, topicTitle: pkg.topic.title, unitTitle: pkg.unit?.title, topicKey: pkg.topic.key }));
  return pkg;
};

const setBasket = (n: number) =>
  useDeck.setState({
    loaded: true,
    slides: Array.from({ length: n }, (_, i) => ({ kind: 'text' as const, id: `s${i}`, title: `Slide ${i}`, text: '' })),
  });

const saved: string[] = [];
beforeEach(async () => {
  resetSession();
  await i18n.changeLanguage('en');
  useUi.setState({ context: null, toasts: [], slidesOpen: false });
  setBasket(0);
  saved.length = 0;
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    if (this.download) saved.push(this.download);
  });
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

describe('Header language menu (W-05)', () => {
  it('has no RU / KY / EN buttons in the bar; a guest gets one globe button with the current code', async () => {
    const user = userEvent.setup();
    renderShell('/ky/bio/g7/animal-cell?focus=bio.nucleus&mode=section');
    expect(screen.queryByRole('link', { name: 'Русский' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Тил' })).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Тил: Кыргызча' });
    expect(button).toHaveTextContent('KY');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);
    const menu = screen.getByRole('menu', { name: 'Тил' });
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent)).toEqual(['RUРусский', 'KYКыргызча', 'ENEnglish']);
    expect(within(menu).getByRole('menuitemradio', { name: /Кыргызча/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(menu).getByRole('menuitemradio', { name: /Кыргызча/ })).toHaveFocus();

    // Arrow keys move, Esc closes and returns focus to the button.
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitemradio', { name: /English/ })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    // Choosing navigates to the same page under the new language and keeps the query.
    await user.click(button);
    await user.click(screen.getByRole('menuitemradio', { name: /Русский/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/ru/bio/g7/animal-cell?focus=bio.nucleus&mode=section');
    expect(i18n.language).toBe('ru');
    expect(document.documentElement.lang).toBe('ru');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Язык: Русский' })).toHaveTextContent('RU');
  });

  it('a signed-in user chooses the language in the profile menu (no separate globe button)', async () => {
    const user = userEvent.setup();
    await loginAdult(TEACHER_EMAIL, TEACHER_PASSWORD);
    renderShell('/en/bio/g7/animal-cell?view=study');
    expect(screen.queryByRole('button', { name: /^Language:/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Profile:/ }));
    const menu = screen.getByRole('menu', { name: 'Profile' });
    expect(within(menu).getByRole('menuitem', { name: 'My dashboard' })).toHaveFocus();
    const group = within(menu).getByRole('group', { name: 'Language' });
    expect(within(group).getAllByRole('menuitemradio')).toHaveLength(3);
    expect(within(group).getByRole('menuitemradio', { name: /English/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(group).getByRole('menuitemradio', { name: /Кыргызча/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/ky/bio/g7/animal-cell?view=study');
    expect(i18n.language).toBe('ky');
  });

  it('home page respects :lang', async () => {
    renderShell('/en');
    expect(i18n.language).toBe('en');
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('Topic mode: lesson by default, ?view=study explores', () => {
  it('the header toggle: Lesson pressed without a param, Study sets ?view=study, back to Lesson drops it; each has a hint', async () => {
    const user = userEvent.setup();
    renderShell('/en/bio/g7/animal-cell?focus=bio.nucleus');
    onTopic();
    const lesson = screen.getByRole('button', { name: /Lesson/ });
    const study = screen.getByRole('button', { name: /Study/ });
    expect(lesson).toHaveAttribute('aria-pressed', 'true');
    expect(study).toHaveAttribute('aria-pressed', 'false');
    expect(lesson).toHaveAccessibleDescription('Lesson — the topic step by step, a ready-made script for the teacher');
    expect(study).toHaveAccessibleDescription('Explore — rotate the model yourself, click its parts and read the cards');
    expect(study).toHaveAttribute('title', 'Explore — rotate the model yourself, click its parts and read the cards');

    await user.click(study);
    expect(screen.getByTestId('location')).toHaveTextContent('/en/bio/g7/animal-cell?focus=bio.nucleus&view=study');
    expect(study).toHaveAttribute('aria-pressed', 'true');
    await user.click(lesson);
    expect(screen.getByTestId('location')).toHaveTextContent(/\/en\/bio\/g7\/animal-cell\?focus=bio\.nucleus$/);
  });

  it('an old ?view=lesson link still opens the lesson', () => {
    renderShell('/en/bio/g7/animal-cell?view=lesson');
    onTopic();
    expect(screen.getByRole('button', { name: /Lesson/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it.each([
    ['', 'lesson'],
    ['?view=lesson', 'lesson'],
    ['?view=study', 'study'],
  ])('topic page %s → %s mode', async (query, mode) => {
    renderRoutes(`/en/bio/g7/animal-cell${query}`, <Route path="/:lang/:subject/:grade/:topic" element={<TopicPage />} />);
    await waitFor(() => expect(document.documentElement.dataset.mode).toBe(mode));
  });
});

describe('Header presentation menu (contract 0.6.0 topicDeck)', () => {
  const deckRequests = () => {
    const seen: URL[] = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/deck')) seen.push(url);
    });
    return seen;
  };

  it('downloads the ready-made topic presentation in the UI language and saves the server file name', async () => {
    const user = userEvent.setup();
    const seen = deckRequests();
    renderShell('/ru/bio/g7/animal-cell');
    const pkg = onTopic();
    await user.click(screen.getByRole('button', { name: 'Презентация темы' }));
    const menu = screen.getByRole('menu', { name: 'Презентация темы' });
    expect(within(menu).getByRole('group', { name: 'Готовая презентация' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /Мои слайды/ })).not.toBeInTheDocument();

    await user.click(within(menu).getByRole('menuitem', { name: 'PowerPoint (.pptx)' }));
    await waitFor(() => expect(saved).toEqual([`${pkg.topic.title.ru}.pptx`]));
    expect(seen).toHaveLength(1);
    expect(seen[0].pathname).toBe(`${API_PREFIX}/topics/animal-cell/deck`);
    expect(seen[0].searchParams.get('lang')).toBe('ru');
    expect(seen[0].searchParams.get('format')).toBe('pptx');
    expect(useUi.getState().toasts.at(-1)?.key).toBe('header.deck.downloaded');

    await user.click(screen.getByRole('button', { name: 'Презентация темы' }));
    await user.click(screen.getByRole('menuitem', { name: 'PDF' }));
    await waitFor(() => expect(saved).toHaveLength(2));
    expect(saved[1]).toMatch(/\.pdf$/);
    expect(seen[1].searchParams.get('format')).toBe('pdf');
  });

  it('shows a pending state while the server generates the file', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    server.use(
      http.get(`*${API_PREFIX}/topics/:key/deck`, async () => {
        await new Promise<void>((r) => (release = r));
        return new HttpResponse(new Blob(['x']), { headers: { 'Content-Disposition': 'attachment; filename="t.pptx"' } });
      }),
    );
    renderShell('/en/bio/g7/animal-cell');
    onTopic();
    await user.click(screen.getByRole('button', { name: 'Topic presentation' }));
    await user.click(screen.getByRole('menuitem', { name: 'PowerPoint (.pptx)' }));
    const busy = await screen.findByRole('button', { name: /Preparing the presentation/ });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await user.click(busy);
    expect(screen.getByRole('menuitem', { name: 'PDF' })).toBeDisabled();
    await user.keyboard('{Escape}');
    release();
    await waitFor(() => expect(saved).toEqual(['t.pptx']));
    expect(screen.getByRole('button', { name: 'Topic presentation' })).not.toHaveAttribute('aria-busy');
  });

  it.each([
    [401, 'unauthorized', 'header.deck.needSignIn'],
    [403, 'forbidden', 'header.deck.noLicence'],
    [500, 'internal', 'header.deck.failed'],
  ] as const)('%s → error toast %s', async (status, code, key) => {
    const user = userEvent.setup();
    server.use(http.get(`*${API_PREFIX}/topics/:key/deck`, () => HttpResponse.json(problem(code), { status, headers: { 'Content-Type': 'application/problem+json' } })));
    renderShell('/en/bio/g7/animal-cell');
    onTopic();
    await user.click(screen.getByRole('button', { name: 'Topic presentation' }));
    await user.click(screen.getByRole('menuitem', { name: 'PDF' }));
    await waitFor(() => expect(useUi.getState().toasts.at(-1)).toMatchObject({ key, kind: 'error' }));
    expect(saved).toEqual([]);
  });

  it('«My slides (N)» appears only with a non-empty basket and opens the builder', async () => {
    const user = userEvent.setup();
    setBasket(3);
    renderShell('/en/bio/g7/animal-cell');
    onTopic();
    await user.click(screen.getByRole('button', { name: 'Topic presentation' }));
    await user.click(screen.getByRole('menuitem', { name: 'My slides (3)' }));
    expect(useUi.getState().slidesOpen).toBe(true);
  });

  it('outside topic pages the button opens the builder, and is hidden while the basket is empty', async () => {
    const user = userEvent.setup();
    const view = renderShell('/en/cabinet');
    expect(screen.queryByRole('button', { name: /presentation/i })).not.toBeInTheDocument();
    view.unmount();
    setBasket(2);
    renderShell('/en/cabinet');
    await user.click(screen.getByRole('button', { name: '2 slides in the presentation' }));
    expect(useUi.getState().slidesOpen).toBe(true);
  });
});
