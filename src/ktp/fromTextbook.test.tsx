import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { API_PREFIX, problem } from '@bilig/content-model/api';
import i18n from '../i18n';
import { loginAdult } from '../api/session';
import { resetSession } from '../cabinet/testUtils';
import { KTP_ID, TEACHER_EMAIL, TEACHER_PASSWORD } from '../mocks/db';
import { server } from '../mocks/node';
import TeacherPage from '../pages/TeacherPage';
import KtpPlanPage from './KtpPlanPage';
import { currentSchoolYear } from './model';

// jsdom has no canvas: photos «downscale» to a fixed JPEG; pdf.js is replaced by a fake text PDF.
vi.mock('./bookImage', () => ({
  imageToJpeg: vi.fn(async () => 'data:image/jpeg;base64,/9j/AAAA'),
  canvasToJpeg: vi.fn(async () => 'data:image/jpeg;base64,/9j/AAAA'),
}));
vi.mock('./bookPdf', () => ({
  openPdf: vi.fn(async () => ({
    pageCount: () => 64,
    pageText: async (n: number) => `${n}. Мазмуну: Кыймылдын ылдамдыгы, бир калыптагы кыймыл ........ ${n + 7}`,
    pageJpeg: async () => 'data:image/jpeg;base64,/9j/AAAA',
    close: () => undefined,
  })),
}));

interface Seen {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

function spy(): Seen[] {
  const log: Seen[] = [];
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${API_PREFIX}/ktp`)) return;
    const entry: Seen = {
      method: request.method,
      path: url.pathname.slice(API_PREFIX.length),
      body: null,
    };
    log.push(entry);
    if (request.method === 'POST')
      void request
        .clone()
        .json()
        .then((b) => (entry.body = b as Record<string, unknown>));
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
  return qc;
}

const saved: string[] = [];
beforeEach(async () => {
  resetSession();
  await i18n.changeLanguage('en');
  localStorage.clear();
  saved.length = 0;
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push(this.download);
  });
  await loginAdult(TEACHER_EMAIL, TEACHER_PASSWORD);
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

/** The teacher page on the КТП tab, the wizard open. */
async function openWizard() {
  const user = userEvent.setup();
  const qc = renderApp('/en/teacher');
  await user.click(await screen.findByRole('tab', { name: 'Lesson plans (KTP)' }));
  await screen.findByTestId('ktp-plan-item', {}, { timeout: 5000 });
  await user.click(screen.getByRole('button', { name: 'Make a KTP from a textbook' }));
  const dialog = await screen.findByRole('dialog', { name: 'A KTP from a textbook' }, { timeout: 5000 });
  return { user, dialog, qc };
}

const step = () => screen.getByTestId('ktp-book-step');

describe('КТП from a textbook', () => {
  it('a Bilig textbook: grouped by the teacher’s subjects, step 2 skipped, lessons a week → the new plan', async () => {
    const log = spy();
    const { user, dialog, qc } = await openWizard();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    expect(within(dialog).getByRole('list', { name: 'Steps' })).toBeInTheDocument();
    expect(step()).toHaveTextContent('Step 1 of 3: Book');

    // The integrated book is listed under each of the teacher's subjects; this is its physics part.
    const physics = await within(dialog).findByRole('region', { name: 'Physics' }, { timeout: 5000 });
    await user.click(
      within(physics).getByRole('button', {
        name: /^Natural Sciences 8, Grade 8 · Physics · 5 lessons/,
      }),
    );

    expect(step()).toHaveTextContent('Step 3 of 3: Number of lessons');
    expect(step()).toHaveFocus();
    expect(within(dialog).getByRole('listitem', { current: 'step' })).toHaveTextContent('Number of lessons');
    expect(within(dialog).getByText('(skipped)')).toBeInTheDocument();
    const total = within(dialog).getByTestId('ktp-book-total');
    expect(total).toHaveTextContent('2 × 34 = 68 lessons');
    expect(within(dialog).getByRole('radio', { name: '2 lessons a week' })).toBeChecked();

    await user.click(within(dialog).getByRole('radio', { name: '3 lessons a week' }));
    expect(total).toHaveTextContent('3 × 34 = 102 lessons');
    const weeks = within(dialog).getByRole('spinbutton', { name: 'Weeks' });
    await user.clear(weeks);
    await user.type(weeks, '50');
    expect(within(dialog).getByText('Weeks: a number from 10 to 40.')).toBeInTheDocument();
    await user.clear(weeks);
    await user.type(weeks, '30');
    expect(total).toHaveTextContent('3 × 30 = 90 lessons');
    expect(within(dialog).getByRole('combobox', { name: 'School year' })).toHaveValue(String(currentSchoolYear()));

    await user.click(within(dialog).getByRole('button', { name: 'Make the KTP' }));
    await screen.findByRole('heading', { level: 1, name: 'Physics · Grade 8' }, { timeout: 5000 });
    const post = log.find((r) => r.path === '/ktp/from-textbook')!;
    await waitFor(() =>
      expect(post.body).toEqual({
        textbookKey: 'tabigy-ilimder-8-1',
        subjectKey: 'phys',
        lang: 'en',
        hoursPerWeek: 3,
        weeks: 30,
        year: currentSchoolYear(),
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['ktp', 'list'] });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // A preliminary plan: the info line, «All lessons» first, no «date missing» problems.
    expect(screen.getByTestId('ktp-draft-info')).toHaveTextContent('This is a preliminary KTP: the dates are yours to fill in');
    expect(screen.getByRole('tab', { name: 'All lessons' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('ktp-count')).not.toHaveTextContent(/error/);
  });

  it('my own book (.docx): contents read, checked and edited in the table, then the КТП', async () => {
    const log = spy();
    const { user, dialog } = await openWizard();
    await user.click(within(dialog).getByRole('tab', { name: 'My own book' }));
    const input = within(dialog).getByLabelText('Book file: PDF, .docx or photos');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'book.djvu')] },
    });
    expect(await within(dialog).findByText(/This file type is not supported/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Read the contents' })).toBeDisabled();

    fireEvent.change(input, {
      target: { files: [new File(['PK-docx'], 'Физика 7.docx')] },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Read the contents' }));
    const review = await within(dialog).findByTestId('ktp-book-review', {}, { timeout: 5000 });
    expect(step()).toHaveTextContent('Step 2 of 3: Check the contents');
    const contents = log.find((r) => r.path === '/ktp/contents')!;
    await waitFor(() =>
      expect(contents.body).toEqual({
        fileName: 'Физика 7.docx',
        docx: btoa('PK-docx'),
      }),
    );

    expect(within(review).getByRole('textbox', { name: 'Book title' })).toHaveValue('Физика, 7-класс');
    expect(within(review).getByRole('combobox', { name: 'Grade' })).toHaveValue('7');
    expect(within(review).getByRole('combobox', { name: 'Subject' })).toHaveValue('phys');
    expect(within(review).getAllByTestId('ktp-draft-chapter')).toHaveLength(3);
    expect(within(review).getByText('7 lines to check are marked.')).toBeInTheDocument();
    // Warnings sit on their rows; a matched topic is a chip.
    const row15 = within(review).getByRole('textbox', { name: 'Title, § 15' }).closest('li')!;
    expect(within(row15).getByText('No pages')).toBeInTheDocument();
    const row24 = within(review).getByRole('textbox', { name: 'Title, § 24' }).closest('li')!;
    expect(within(row24).getByText('No Bilig topic')).toBeInTheDocument();
    const row6 = within(review).getByRole('textbox', { name: 'Title, § 6' }).closest('li')!;
    expect(within(row6).getByText('Bilig topic:')).toBeInTheDocument();

    // Fill the missing pages: the warning goes.
    await user.type(within(row15).getByRole('textbox', { name: 'First page, § 15' }), '50');
    await user.type(within(row15).getByRole('textbox', { name: 'Last page, § 15' }), '51');
    expect(within(row15).queryByText('No pages')).not.toBeInTheDocument();
    expect(within(review).getByText('6 lines to check are marked.')).toBeInTheDocument();
    // Rename a lesson, remove one, make the kind of another a test.
    const title1 = within(review).getByRole('textbox', { name: 'Title, § 1' });
    await user.clear(title1);
    await user.type(title1, 'Физика жана турмуш');
    await user.click(within(review).getByRole('button', { name: 'Remove § 2' }));
    expect(within(review).queryByRole('textbox', { name: 'Title, § 2' })).not.toBeInTheDocument();
    await user.selectOptions(within(review).getByRole('combobox', { name: 'Kind, § 11' }), 'review');
    // Add a lesson to the third chapter.
    const ch3 = within(review).getAllByTestId('ktp-draft-chapter')[2];
    await user.click(within(ch3).getByRole('button', { name: 'Add a lesson' }));
    const added = within(ch3).getAllByTestId('ktp-draft-lesson').at(-1)!;
    // Bad pages stop «Next» and are marked on the row.
    await user.type(within(added).getAllByRole('textbox')[1], 'Лабораториялык иш');
    await user.type(within(added).getAllByRole('textbox')[2], '12');
    await user.type(within(added).getAllByRole('textbox')[3], '9');
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(within(dialog).getByText('Fix 1 marked line to go on.')).toBeInTheDocument();
    expect(within(added).getByText('Pages are numbers, the last one not before the first.')).toBeInTheDocument();
    await user.clear(within(added).getAllByRole('textbox')[3]);
    await user.type(within(added).getAllByRole('textbox')[3], '13');
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));

    expect(step()).toHaveTextContent('Step 3 of 3: Number of lessons');
    // Back keeps the edits.
    await user.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(within(dialog).getByRole('textbox', { name: 'Title, § 1' })).toHaveValue('Физика жана турмуш');
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));

    // The teacher's 7А (biology) is not preselected for a physics book; tick it and add another class.
    const cls = within(dialog).getByRole('checkbox', { name: '7А' });
    expect(cls).not.toBeChecked();
    await user.click(cls);
    await user.type(within(dialog).getByRole('textbox', { name: 'Another class' }), '7 Б{Enter}');
    expect(within(dialog).getByRole('checkbox', { name: '7Б' })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Make the KTP' }));

    await screen.findByRole('heading', { level: 1, name: 'Физика · Grade 7' }, { timeout: 5000 });
    const post = log.find((r) => r.path === '/ktp/from-textbook')!;
    await waitFor(() => expect(post.body).not.toBeNull());
    const body = post.body as {
      draft: {
        title: string;
        chapters: {
          lessons: {
            number: string;
            title: string;
            kind: string;
            pages?: unknown;
          }[];
        }[];
      };
    } & Record<string, unknown>;
    expect(body).toMatchObject({
      lang: 'ky',
      hoursPerWeek: 2,
      year: currentSchoolYear(),
      classes: ['7А', '7Б'],
    });
    expect(body.weeks).toBeUndefined();
    expect(body.textbookKey).toBeUndefined();
    const [c1, c2, c3] = body.draft.chapters;
    expect(c1.lessons[0].title).toBe('Физика жана турмуш');
    expect(c1.lessons.map((l) => l.number)).not.toContain('2');
    expect(c1.lessons.find((l) => l.number === '11')!.kind).toBe('review');
    expect(c2.lessons.find((l) => l.number === '15')!.pages).toEqual({
      from: 50,
      to: 51,
    });
    expect(c3.lessons.at(-1)).toEqual({
      number: '',
      kind: 'lesson',
      title: 'Лабораториялык иш',
      pages: { from: 12, to: 13 },
    });
    expect(screen.getByTestId('ktp-draft-info')).toBeInTheDocument();
  });

  it('photos when the assistant is down: the 503 says to try a text PDF or a .docx', async () => {
    const log = spy();
    server.use(http.post(`${API_PREFIX}/ktp/contents`, () => HttpResponse.json(problem('tutor_unavailable'), { status: 503 })));
    const { user, dialog } = await openWizard();
    await user.click(within(dialog).getByRole('tab', { name: 'My own book' }));
    fireEvent.change(within(dialog).getByLabelText('Book file: PDF, .docx or photos'), {
      target: {
        files: [new File(['a'], 'mazmunu-1.jpg', { type: 'image/jpeg' }), new File(['b'], 'mazmunu-2.png', { type: 'image/png' })],
      },
    });
    expect(within(dialog).getByRole('list', { name: 'Chosen files' })).toHaveTextContent('mazmunu-1.jpg');
    await user.click(within(dialog).getByRole('button', { name: 'Read the contents' }));
    expect(await within(dialog).findByText('The AI assistant is not working right now: try a PDF with text or a .docx.', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(step()).toHaveTextContent('Step 1 of 3');
    const post = log.find((r) => r.path === '/ktp/contents')!;
    await waitFor(() =>
      expect(post.body).toEqual({
        fileName: 'mazmunu-1.jpg',
        images: ['data:image/jpeg;base64,/9j/AAAA', 'data:image/jpeg;base64,/9j/AAAA'],
      }),
    );
  });

  it('a PDF with a text layer sends the text of its first and last pages (pdf.js lazy-loaded)', async () => {
    const log = spy();
    const { user, dialog } = await openWizard();
    await user.click(within(dialog).getByRole('tab', { name: 'My own book' }));
    fireEvent.change(within(dialog).getByLabelText('Book file: PDF, .docx or photos'), {
      target: {
        files: [new File(['%PDF-1.7'], 'fizika-7.pdf', { type: 'application/pdf' })],
      },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Read the contents' }));
    await within(dialog).findByTestId('ktp-book-review', {}, { timeout: 5000 });
    const post = log.find((r) => r.path === '/ktp/contents')!;
    await waitFor(() => expect(post.body).not.toBeNull());
    const pages = post.body!.pages as string[];
    expect(pages).toHaveLength(20);
    expect(pages[12]).toMatch(/^57\. /);
    expect(post.body!.images).toBeUndefined();
  });
});

describe('КТП .docx', () => {
  it('downloads the whole КТП with the server’s file name; an uploaded КТП has no «preliminary» line', async () => {
    const log = spy();
    const user = userEvent.setup();
    renderApp(`/en/teacher/ktp/${KTP_ID}`);
    await screen.findByRole('heading', { level: 1, name: 'Алгебра · Grade 8' }, { timeout: 5000 });
    expect(screen.queryByTestId('ktp-draft-info')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'KTP .docx' }));
    await waitFor(() => expect(saved).toEqual(['КТП_алгебра_8-класс_2026-2027.docx']));
    expect(log.some((r) => r.method === 'GET' && r.path === `/ktp/${KTP_ID}/docx`)).toBe(true);
  });
});
