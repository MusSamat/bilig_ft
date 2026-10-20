import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { HttpResponse, http } from 'msw';
import { API_PREFIX, problem } from '@bilig/content-model/api';
import i18n from '../i18n';
import { server } from '../mocks/node';
import { useUi } from '../state/ui';
import { renderRoutes, resetSession, topicPkg } from '../test/utils';
import TopicPage from './TopicPage';
import { TopicToolbar } from './TopicToolbar';

const renderToolbar = (path: string) =>
  renderRoutes(
    path,
    <Route
      path="/:lang/:subject/:grade/:topic"
      element={<TopicToolbar topicKey="animal-cell" />}
    />,
  );

const saved: string[] = [];
beforeEach(async () => {
  resetSession();
  await i18n.changeLanguage('en');
  useUi.setState({ context: null, toasts: [] });
  saved.length = 0;
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (this.download) saved.push(this.download);
  });
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

describe('Topic toolbar: mode — lesson by default, ?view=study explores', () => {
  it('Lesson pressed without a param, Study sets ?view=study, back to Lesson drops it; each has a hint', async () => {
    const user = userEvent.setup();
    renderToolbar('/en/bio/g7/animal-cell?focus=bio.nucleus');
    const lesson = screen.getByRole('button', { name: /Lesson/ });
    const study = screen.getByRole('button', { name: /Study/ });
    expect(lesson).toHaveAttribute('aria-pressed', 'true');
    expect(study).toHaveAttribute('aria-pressed', 'false');
    expect(lesson).toHaveAccessibleDescription(
      'Lesson — the topic step by step, a ready-made script for the teacher',
    );
    expect(study).toHaveAccessibleDescription(
      'Explore — rotate the model yourself, click its parts and read the cards',
    );

    await user.click(study);
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/en/bio/g7/animal-cell?focus=bio.nucleus&view=study',
    );
    expect(study).toHaveAttribute('aria-pressed', 'true');
    await user.click(lesson);
    expect(screen.getByTestId('location')).toHaveTextContent(
      /\/en\/bio\/g7\/animal-cell\?focus=bio\.nucleus$/,
    );
  });

  it('an old ?view=lesson link still opens the lesson', () => {
    renderToolbar('/en/bio/g7/animal-cell?view=lesson');
    expect(screen.getByRole('button', { name: /Lesson/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it.each([
    ['', 'lesson'],
    ['?view=lesson', 'lesson'],
    ['?view=study', 'study'],
  ])('topic page %s → %s mode', async (query, mode) => {
    renderRoutes(
      `/en/bio/g7/animal-cell${query}`,
      <Route path="/:lang/:subject/:grade/:topic" element={<TopicPage />} />,
    );
    await waitFor(() =>
      expect(document.documentElement.dataset.mode).toBe(mode),
    );
  });

  it('the topic page shows the toolbar in its top row with the language of the lesson', async () => {
    await i18n.changeLanguage('ky');
    renderRoutes(
      '/ky/bio/g7/animal-cell',
      <Route path="/:lang/:subject/:grade/:topic" element={<TopicPage />} />,
    );
    const bar = await screen.findByRole('toolbar', { name: 'Теманын куралдары' });
    expect(
      within(bar).getByRole('button', { name: 'Тил: Кыргызча' }),
    ).toHaveTextContent('KY');
  });
});

describe('Topic toolbar: the ready-made presentation (contract 0.6.0 topicDeck)', () => {
  const deckRequests = () => {
    const seen: URL[] = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/deck')) seen.push(url);
    });
    return seen;
  };

  it('downloads the presentation in the lesson language and saves the server file name', async () => {
    const user = userEvent.setup();
    const seen = deckRequests();
    const pkg = topicPkg('animal-cell');
    await i18n.changeLanguage('ru');
    renderToolbar('/ru/bio/g7/animal-cell');
    await user.click(screen.getByRole('button', { name: 'Презентация темы' }));
    const menu = screen.getByRole('menu', { name: 'Презентация темы' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['PowerPoint (.pptx)', 'PDF']);

    await user.click(
      within(menu).getByRole('menuitem', { name: 'PowerPoint (.pptx)' }),
    );
    await waitFor(() => expect(saved).toEqual([`${pkg.topic.title.ru}.pptx`]));
    expect(seen[0].pathname).toBe(`${API_PREFIX}/topics/animal-cell/deck`);
    expect(seen[0].searchParams.get('lang')).toBe('ru');
    expect(seen[0].searchParams.get('format')).toBe('pptx');
    expect(useUi.getState().toasts.at(-1)?.key).toBe('header.deck.downloaded');

    await user.click(screen.getByRole('button', { name: 'Презентация темы' }));
    await user.click(screen.getByRole('menuitem', { name: 'PDF' }));
    await waitFor(() => expect(saved).toHaveLength(2));
    expect(seen[1].searchParams.get('format')).toBe('pdf');
  });

  it('shows a pending state while the server generates the file', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    server.use(
      http.get(`*${API_PREFIX}/topics/:key/deck`, async () => {
        await new Promise<void>((r) => (release = r));
        return new HttpResponse(new Blob(['x']), {
          headers: { 'Content-Disposition': 'attachment; filename="t.pptx"' },
        });
      }),
    );
    renderToolbar('/en/bio/g7/animal-cell');
    await user.click(
      screen.getByRole('button', { name: 'Topic presentation' }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'PowerPoint (.pptx)' }),
    );
    const busy = await screen.findByRole('button', {
      name: /Preparing the presentation/,
    });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await user.click(busy);
    expect(screen.getByRole('menuitem', { name: 'PDF' })).toBeDisabled();
    await user.keyboard('{Escape}');
    release();
    await waitFor(() => expect(saved).toEqual(['t.pptx']));
    expect(
      screen.getByRole('button', { name: 'Topic presentation' }),
    ).not.toHaveAttribute('aria-busy');
  });

  it.each([
    [401, 'unauthorized', 'header.deck.needSignIn'],
    [403, 'forbidden', 'header.deck.noLicence'],
    [500, 'internal', 'header.deck.failed'],
  ] as const)('%s → error toast %s', async (status, code, key) => {
    const user = userEvent.setup();
    server.use(
      http.get(`*${API_PREFIX}/topics/:key/deck`, () =>
        HttpResponse.json(problem(code), {
          status,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      ),
    );
    renderToolbar('/en/bio/g7/animal-cell');
    await user.click(
      screen.getByRole('button', { name: 'Topic presentation' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'PDF' }));
    await waitFor(() =>
      expect(useUi.getState().toasts.at(-1)).toMatchObject({
        key,
        kind: 'error',
      }),
    );
    expect(saved).toEqual([]);
  });
});
