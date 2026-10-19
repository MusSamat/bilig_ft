import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import i18n from '../i18n';
import { buildCatalog } from '../mocks/data';
import { renderRoutes, resetSession } from '../test/utils';
import { topicPath } from '../lib/urls';
import { useLastTextbook } from '../state/textbook';
import { HomePage } from './HomePage';
import TextbookPage from './TextbookPage';

const KEY = 'tabigy-ilimder-8-1';
const page = (path = `/en/textbooks/${KEY}`) =>
  renderRoutes(
    path,
    <Route path="/:lang">
      <Route index element={<HomePage />} />
      <Route path="textbooks/:key" element={<TextbookPage />} />
    </Route>,
  );
const lessonItem = (key: string) => document.getElementById(`tb-${key}`)!;

describe('TextbookPage (contract 0.5.0)', () => {
  beforeEach(async () => {
    resetSession();
    useLastTextbook.getState().forget();
    await act(() => i18n.changeLanguage('en'));
  });

  it('renders the chapters with number, title, subject and pages', async () => {
    page();
    expect(await screen.findByRole('heading', { level: 1, name: 'Natural Sciences, grade 8, part 1' })).toBeInTheDocument();
    const chapters = screen.getAllByRole('heading', { level: 2 });
    expect(chapters).toHaveLength(8);
    const ch8 = document.getElementById('tb-ch8')!;
    expect(within(ch8).getByRole('heading', { level: 2, name: 'Forces and motion' })).toBeInTheDocument();
    expect(within(ch8).getByText('Chapter 8')).toBeInTheDocument();
    expect(within(ch8).getByText('pp. 176–207')).toBeInTheDocument();
    expect(within(ch8).getAllByText('Physics').length).toBeGreaterThan(0);
  });

  it('links a one-topic lesson straight to the topic and remembers the chapter', async () => {
    const user = userEvent.setup();
    page();
    await screen.findByRole('heading', { level: 1 });
    const link = within(lessonItem('ch2.l3')).getByRole('link');
    expect(link).toHaveAttribute('href', topicPath(buildCatalog(), 'en', 'human-heart'));
    expect(link).toHaveTextContent('2.3');
    expect(link).toHaveTextContent('pp. 48–52');
    expect(link).toHaveTextContent('Lesson');
    await user.click(link);
    expect(screen.getByTestId('location')).toHaveTextContent(topicPath(buildCatalog(), 'en', 'human-heart'));
    expect(useLastTextbook.getState().last).toEqual({ key: KEY, chapterKey: 'ch2' });
  });

  it('shows a lesson without published topics as a disabled «soon» item', async () => {
    page();
    await screen.findByRole('heading', { level: 1 });
    const speed = lessonItem('ch8.l1');
    expect(within(speed).queryByRole('link')).toBeNull();
    expect(speed.firstElementChild).toHaveAttribute('aria-disabled', 'true');
    expect(within(speed).getByText('soon')).toBeInTheDocument();
  });

  it('shows review and extra labels; a review lists its chapter topics as cards', async () => {
    page();
    await screen.findByRole('heading', { level: 1 });
    const review = lessonItem('ch2.review');
    expect(within(review).getByText('Review')).toBeInTheDocument();
    const cards = within(review).getAllByRole('link');
    expect(cards.map((a) => a.getAttribute('href'))).toEqual([topicPath(buildCatalog(), 'en', 'human-heart')]);
    expect(within(lessonItem('ch3.extra2')).getByText('Extra')).toBeInTheDocument();
  });

  it('remembers the opened textbook; Home offers «Continue»', async () => {
    const user = userEvent.setup();
    page();
    await screen.findByRole('heading', { level: 1 });
    expect(useLastTextbook.getState().last?.key).toBe(KEY);
    await user.click(within(lessonItem('ch4.l1')).getByRole('link'));
    page('/en');
    const cont = await screen.findByRole('link', { name: /Continue: Natural Sciences 8 · chapter 4/ });
    expect(cont).toHaveAttribute('href', `/en/textbooks/${KEY}#tb-ch4`);
    expect(screen.getAllByRole('link', { name: /Natural Sciences, grade 8, part 1/ })[0]).toHaveAttribute('href', `/en/textbooks/${KEY}`);
  });

  it('shows «not found» for an unknown textbook', async () => {
    page('/en/textbooks/nope');
    expect(await screen.findByRole('heading', { name: 'Textbook not found' })).toBeInTheDocument();
  });
});
