/** The Bilig library for teachers (contract 0.9.3): a class's book per subject and the КТП suggested from it. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { API_PREFIX } from '@bilig/content-model/api';
import i18n from '../i18n';
import { api } from '../api/client';
import { loginAdult } from '../api/session';
import { tokens } from '../api/tokens';
import { loadMe } from '../api/session';
import { resetSession } from '../cabinet/testUtils';
import { BOOK_PHYS7_ID, seedBooks } from '../mocks/books';
import { CLASS_ID, READY_8B_ID, READY_KTP_ID, READY_PHONE, TEACHER_EMAIL, TEACHER_PASSWORD, mockDb } from '../mocks/db';
import { server } from '../mocks/node';
import TeacherPage from '../pages/TeacherPage';
import KtpPlanPage from './KtpPlanPage';
import { currentSchoolYear } from './model';
import { BookCover, suggestedBook } from './library';

interface Seen {
  method: string;
  path: string;
  search: string;
  body: Record<string, unknown> | null;
}

function spy(): Seen[] {
  const log: Seen[] = [];
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url);
    const entry: Seen = { method: request.method, path: url.pathname.slice(API_PREFIX.length), search: url.search, body: null };
    log.push(entry);
    if (request.method === 'POST' || request.method === 'PATCH')
      void request
        .clone()
        .json()
        .then((b) => (entry.body = b as Record<string, unknown>))
        .catch(() => undefined);
  });
  return log;
}

function renderApp(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:lang/teacher" element={<TeacherPage />} />
          <Route path="/:lang/teacher/ktp/:id" element={<KtpPlanPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const cardOf = async (subject: string) => {
  const cards = await screen.findAllByTestId('subject-card', {}, { timeout: 5000 });
  return cards.find((c) => within(c).getByRole('heading').textContent === subject)!;
};

beforeEach(async () => {
  resetSession();
  await i18n.changeLanguage('en');
  localStorage.clear();
  URL.createObjectURL = vi.fn(() => 'blob:cover');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

describe('a class’s textbook', () => {
  it('suggests the one book of the grade, subject and language; one click chooses it; the КТП is then made from it', async () => {
    // 7А of the school teacher (teaches in Kyrgyz) also has physics; the library has «Физика, 7-класс» (ky).
    mockDb.classes.find((c) => c.id === CLASS_ID)!.subjectKeys = ['phys', 'bio'];
    await loginAdult(TEACHER_EMAIL, TEACHER_PASSWORD);
    const log = spy();
    const user = userEvent.setup();
    renderApp(`/en/teacher?class=${CLASS_ID}`);
    const card = await cardOf('Physics');
    expect(await within(card).findByText('Suggested: «Физика, 7-класс», the only book of this grade in your language.')).toBeInTheDocument();
    expect(within(card).getByTestId('class-book')).toHaveTextContent('Textbook: not chosen');
    expect(log.some((r) => r.path === '/books' && r.search === '?grade=7&subjectKey=phys&kind=textbook')).toBe(true);
    // Never chosen silently.
    expect(log.some((r) => r.method === 'PATCH')).toBe(false);
    expect(within(card).queryByRole('button', { name: /KTP from the textbook/ })).not.toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Use this book' }));
    await waitFor(() => expect(within(card).getByTestId('class-book')).toHaveTextContent('Textbook: Физика, 7-класс'));
    expect(log.find((r) => r.method === 'PATCH' && r.path === `/classes/${CLASS_ID}`)?.body).toEqual({ books: { phys: BOOK_PHYS7_ID } });
    expect(mockDb.classes.find((c) => c.id === CLASS_ID)!.books).toEqual({ phys: BOOK_PHYS7_ID });

    // No own КТП for 7А physics: the КТП from the book is the primary action.
    const cta = within(card).getByRole('button', { name: 'KTP from the textbook: Physics, 7А' });
    expect(cta.className).toContain('bg-accent');
    await user.click(cta);
    const dialog = await screen.findByRole('dialog', { name: 'A KTP from a textbook' });
    expect(within(dialog).getByTestId('ktp-book-step')).toHaveTextContent('Step 3 of 3: Number of lessons');
    expect(within(dialog).getByText('Физика, 7-класс')).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: '2 lessons a week' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: '7А' })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Make the KTP' }));

    // The plan is in the book's language (ky).
    await screen.findByRole('heading', { level: 1, name: 'Физика · Grade 7' }, { timeout: 5000 });
    await waitFor(() =>
      expect(log.find((r) => r.path === '/ktp/from-textbook')?.body).toEqual({ bookId: BOOK_PHYS7_ID, lang: 'ky', hoursPerWeek: 2, year: currentSchoolYear(), classes: ['7А'] }),
    );
    // The new plan is linked to 7А and is now the class's КТП.
    const subjects = await api('classSubjects', { params: { id: CLASS_ID } });
    expect(subjects.items.find((s) => s.subjectKey === 'phys')?.ktp.status).toBe('parsed');
  });

  it('«Choose» lists the published books as cover cards; picking one patches only that subject; «No textbook» clears it', async () => {
    mockDb.classes.find((c) => c.id === CLASS_ID)!.subjectKeys = ['bio', 'phys'];
    // A second, Russian book: not suggested (the teacher teaches in Kyrgyz) but listed with «every language».
    const ru = { ...seedBooks()[0], id: '0192a000-0000-7000-8000-0000000000b8', title: 'Физика, 7 класс', lang: 'ru' as const, authors: ['А. В. Перышкин'], year: 2020 };
    mockDb.books.push(ru);
    await loginAdult(TEACHER_EMAIL, TEACHER_PASSWORD);
    const log = spy();
    const user = userEvent.setup();
    renderApp(`/en/teacher?class=${CLASS_ID}`);
    const card = await cardOf('Physics');
    await within(card).findByRole('button', { name: 'Use this book' });
    await user.click(within(card).getByRole('button', { name: 'Choose the textbook: Physics, 7А' }));
    const sheet = await screen.findByRole('dialog', { name: 'Textbook: Physics, 7А' });
    const list = await within(sheet).findByRole('list', { name: 'Books' });
    expect(within(list).getAllByRole('button')).toHaveLength(1);
    expect(log.some((r) => r.path === '/books' && r.search === '?grade=7&subjectKey=phys&kind=textbook&lang=ky')).toBe(true);
    await user.click(within(sheet).getByRole('checkbox', { name: 'Books in every language' }));
    await waitFor(() => expect(within(within(sheet).getByRole('list', { name: 'Books' })).getAllByRole('button')).toHaveLength(2));
    const ruCard = within(sheet).getByRole('button', { name: 'Физика, 7 класс, Grade 7 · 2020' });
    expect(ruCard).toHaveTextContent('А. В. Перышкин');
    expect(within(ruCard).getByTestId('book-cover')).toBeInTheDocument();
    await waitFor(() => expect(log.some((r) => r.path === `/books/${ru.id}/cover`)).toBe(true));
    await user.click(ruCard);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(log.find((r) => r.method === 'PATCH')?.body).toEqual({ books: { phys: ru.id } });
    await waitFor(() => expect(within(card).getByTestId('class-book')).toHaveTextContent('Textbook: Физика, 7 класс'));

    await user.click(within(card).getByRole('button', { name: 'Choose the textbook: Physics, 7А' }));
    await user.click(await screen.findByRole('button', { name: 'No textbook' }));
    await waitFor(() => expect(log.filter((r) => r.method === 'PATCH').at(-1)?.body).toEqual({ books: { phys: null } }));
    await waitFor(() => expect(within(card).getByTestId('class-book')).toHaveTextContent('Textbook: not chosen'));
  });

  it('an own КТП linked to the class stays the main one, even with a book chosen', async () => {
    const math8 = { ...seedBooks()[0], id: '0192a000-0000-7000-8000-0000000000b9', title: 'Алгебра, 8-класс', subjectKey: 'math', grade: 8 };
    mockDb.books.push(math8);
    mockDb.classes.find((c) => c.id === READY_8B_ID)!.books = { math: math8.id };
    await (async () => {
      const res = await api('login', { body: { phone: READY_PHONE, password: TEACHER_PASSWORD } });
      tokens.set(res.accessToken, res.expiresIn);
      await loadMe();
    })();
    renderApp(`/en/teacher?class=${READY_8B_ID}`);
    const card = await cardOf('Mathematics');
    await waitFor(() => expect(within(card).getByTestId('class-book')).toHaveTextContent('Textbook: Алгебра, 8-класс'));
    expect(within(card).getByText('KTP ready')).toBeInTheDocument();
    expect(within(card).getByText('Main KTP')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /KTP from the textbook/ })).not.toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Open the KTP' })).toHaveAttribute('href', `/en/teacher/ktp/${READY_KTP_ID}`);
  });

  it('the КТП wizard lists the library books next to the catalog textbooks (bookId, not textbookKey)', async () => {
    await loginAdult(TEACHER_EMAIL, TEACHER_PASSWORD);
    const log = spy();
    const user = userEvent.setup();
    renderApp('/en/teacher');
    await user.click(await screen.findByRole('tab', { name: 'Lesson plans (KTP)' }));
    await screen.findByTestId('ktp-plan-item', {}, { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: 'Make a KTP from a textbook' }));
    const dialog = await screen.findByRole('dialog', { name: 'A KTP from a textbook' });
    const lib = await within(dialog).findByRole('region', { name: 'Bilig library' }, { timeout: 5000 });
    await user.click(within(lib).getByRole('button', { name: /^Физика, 7-класс, Grade 7 · Physics · KY/ }));
    expect(within(dialog).getByTestId('ktp-book-step')).toHaveTextContent('Step 3 of 3');
    await user.click(within(dialog).getByRole('button', { name: 'Make the KTP' }));
    await waitFor(() => expect(log.find((r) => r.path === '/ktp/from-textbook')).toBeDefined());
    await screen.findByRole('heading', { level: 1, name: 'Физика · Grade 7' }, { timeout: 5000 });
    const body = log.find((r) => r.path === '/ktp/from-textbook')?.body;
    await waitFor(() => expect(log.find((r) => r.path === '/ktp/from-textbook')?.body).toMatchObject({ bookId: BOOK_PHYS7_ID, hoursPerWeek: 2 }));
    expect(body ?? log.find((r) => r.path === '/ktp/from-textbook')?.body).not.toHaveProperty('textbookKey');
  });
});

describe('suggestedBook', () => {
  const [b] = seedBooks();
  it('one book in the teacher’s language → it; none or several → nothing', () => {
    expect(suggestedBook([b], 'ky')).toBe(b);
    expect(suggestedBook([b], 'ru')).toBeNull();
    expect(suggestedBook([b, { ...b, id: 'x' }], 'ky')).toBeNull();
    expect(suggestedBook([b], undefined)).toBe(b);
  });
});

describe('BookCover', () => {
  it('a width from the caller replaces the full width (a small cover next to the title, not over it)', () => {
    const qc = new QueryClient();
    const { getAllByTestId } = render(
      <QueryClientProvider client={qc}>
        <BookCover book={{ id: 'b1', coverUrl: null }} className="w-12 flex-none" />
        <BookCover book={{ id: 'b2', coverUrl: null }} />
      </QueryClientProvider>,
    );
    const [small, full] = getAllByTestId('book-cover');
    expect(small.className).toContain('w-12');
    expect(small.className).not.toContain('w-full');
    expect(full.className).toContain('w-full');
  });
});
