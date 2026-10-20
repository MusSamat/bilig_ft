import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import i18n from '../i18n';
import { loginAdult } from '../api/session';
import { TEACHER_EMAIL, TEACHER_PASSWORD } from '../mocks/db';
import { server } from '../mocks/node';
import { useUi } from '../state/ui';
import { renderRoutes, resetSession, topicPkg } from '../test/utils';
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
  act(() =>
    useUi
      .getState()
      .setContext({
        subject: pkg.subject,
        topicTitle: pkg.topic.title,
        unitTitle: pkg.unit?.title,
        topicKey: pkg.topic.key,
      }),
  );
  return pkg;
};

beforeEach(async () => {
  resetSession();
  await i18n.changeLanguage('en');
  useUi.setState({ context: null, toasts: [] });
});
afterEach(() => server.events.removeAllListeners());

describe('Header: one line — logo, subject, language, theme, profile', () => {
  it('a compact globe button opens the three languages; choosing keeps the page and the query', async () => {
    const user = userEvent.setup();
    renderShell('/ky/cabinet?tab=x');
    expect(
      screen.queryByRole('link', { name: 'Русский' }),
    ).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Тил: Кыргызча' });
    expect(button).toHaveTextContent('KY');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);
    const menu = screen.getByRole('menu', { name: 'Тил' });
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((i) => i.textContent),
    ).toEqual(['RUРусский', 'KYКыргызча', 'ENEnglish']);
    expect(
      within(menu).getByRole('menuitemradio', { name: /Кыргызча/ }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      within(menu).getByRole('menuitemradio', { name: /Кыргызча/ }),
    ).toHaveFocus();

    // Arrow keys move, Esc closes and returns focus to the button.
    await user.keyboard('{ArrowDown}');
    expect(
      within(menu).getByRole('menuitemradio', { name: /English/ }),
    ).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    await user.click(button);
    await user.click(screen.getByRole('menuitemradio', { name: /Русский/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/ru/cabinet?tab=x',
    );
    expect(i18n.language).toBe('ru');
    expect(document.documentElement.lang).toBe('ru');
    expect(
      screen.getByRole('button', { name: 'Язык: Русский' }),
    ).toHaveTextContent('RU');
  });

  it('a signed-in user has the same globe button; the profile menu has no language list', async () => {
    const user = userEvent.setup();
    await loginAdult(TEACHER_EMAIL, TEACHER_PASSWORD);
    renderShell('/en/cabinet');
    expect(
      screen.getByRole('button', { name: 'Language: English' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Profile:/ }));
    const menu = screen.getByRole('menu', { name: 'Profile' });
    expect(
      within(menu).getByRole('menuitem', { name: 'My dashboard' }),
    ).toHaveFocus();
    expect(within(menu).queryByRole('menuitemradio')).not.toBeInTheDocument();
  });

  it('on a topic page the header carries no topic controls: language, mode and presentation are in the topic toolbar', () => {
    renderShell('/en/bio/g7/animal-cell');
    onTopic();
    expect(
      screen.queryByRole('button', { name: /^Language:/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Lesson/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Topic presentation' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Open the catalog/ }),
    ).toBeInTheDocument();
  });

  it('home page respects :lang', async () => {
    renderShell('/en');
    expect(i18n.language).toBe('en');
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});
