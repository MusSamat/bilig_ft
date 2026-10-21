/** «Учебники» (contract 0.9.3): upload queue, the book page, section edits, publish, cover. */
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOK_PAGE_IMAGE_BYTES, type Book, type BookSection } from '@bilig/content-model/api';
import { PERMISSIONS } from '@bilig/permissions';
import { imageToJpeg } from '../../../ktp/bookImage';
import type { PdfReader } from '../../../ktp/book';
import { meFixture, mockApi, page, renderAdmin, type Call } from '../../test/utils';
import { resetUploads, uploadDeps } from './uploadQueue';

configure({ asyncUtilTimeout: 5000 });

vi.mock('../../../ktp/bookImage', () => ({
  imageToJpeg: vi.fn(async () => 'data:image/jpeg;base64,/9j/COVER'),
  canvasToJpeg: vi.fn(async () => 'data:image/jpeg;base64,/9j/AAAA'),
}));

const ID1 = '0192a000-0000-7000-8000-00000000bb01';
const ID2 = '0192a000-0000-7000-8000-00000000bb02';
const S1 = '0192a000-0000-7000-8000-00000000cc01';
const S2 = '0192a000-0000-7000-8000-00000000cc02';
const AT = '2026-10-20T08:00:00.000Z';

const book = (o: Partial<Book> = {}): Book => ({
  id: ID1,
  title: 'Физика, 7-класс',
  subjectKey: 'phys',
  grade: 7,
  lang: 'ky',
  part: null,
  authors: [],
  publisher: '',
  year: null,
  summary: '',
  status: 'uploading',
  stage: 'pages',
  progress: { done: 0, total: 8 },
  error: null,
  pageCount: 8,
  pagesUploaded: 0,
  sectionCount: 0,
  usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 },
  fileName: 'fizika-7.pdf',
  coverUrl: null,
  createdAt: AT,
  updatedAt: AT,
  publishedAt: null,
  ...o,
});

const section = (id: string, o: Partial<BookSection> = {}): BookSection => ({
  id,
  order: 0,
  chapterNumber: '1',
  chapterTitle: 'Механика. Кинематиканын негиздери',
  number: '6',
  kind: 'lesson',
  title: 'Кыймылдын ылдамдыгы. Бир калыптагы кыймыл',
  pages: { from: 22, to: 23 },
  summary: 'Бир калыптагы кыймыл.',
  objectives: ['Ылдамдыкты эсептейт'],
  keyTerms: [{ term: 'ылдамдык', definition: 'жолдун убакытка катышы' }],
  formulas: [{ formula: 'v = s / t', meaning: 'ылдамдык' }],
  quantities: [{ name: 'ылдамдык', symbol: 'v', unit: 'м/с' }],
  facts: [],
  experiments: [],
  questions: ['Ылдамдык деген эмне?'],
  keywords: ['ылдамдык'],
  topicKey: 'sim-kinematics',
  reviewed: false,
  ...o,
});

const subjects = page([
  { id: '0192a000-0000-7000-8000-0000000007a1', version: 1, updatedAt: AT, data: { key: 'phys', title: { ky: 'Физика', ru: 'Физика', en: 'Physics' }, icon: 'orbit', hue: 28, group: 'natural', order: 2, status: 'live' } },
  { id: '0192a000-0000-7000-8000-0000000007a2', version: 1, updatedAt: AT, data: { key: 'chem', title: { ky: 'Химия', ru: 'Химия', en: 'Chemistry' }, icon: 'flask', hue: 160, group: 'natural', order: 3, status: 'live' } },
]);

/** A PDF of `n` pages: the first `textPages` have a text layer, the rest are scans. */
function fakeReader(n: number, textPages: number): PdfReader & { closed: boolean } {
  const r = {
    closed: false,
    pageCount: () => n,
    pageText: async (p: number) => (p <= textPages ? `${p}-бет. ${'Кыймылдын ылдамдыгы бирдей убакытта бирдей жол. '.repeat(6)}` : `${p}`),
    pageJpeg: async (p: number) => `data:image/jpeg;base64,/9j/PAGE${p}`,
    close: () => void (r.closed = true),
  };
  return r;
}

const realOpen = uploadDeps.open;
beforeEach(() => {
  resetUploads();
  uploadDeps.retryDelay = 1;
});
afterEach(() => {
  uploadDeps.open = realOpen;
});

describe('books: upload', () => {
  it('queues several PDFs: create → pages in batches (text or image, a failed batch retried) → process → progress → review', async () => {
    const readers: Record<string, ReturnType<typeof fakeReader>> = { 'fizika-7.pdf': fakeReader(8, 4), 'ximiya-7.pdf': fakeReader(2, 2) };
    uploadDeps.open = async (f) => readers[f.name];
    const store = new Map<string, Book>();
    let failOnce = true;
    const api = mockApi({
      'GET /admin/subjects': { body: subjects },
      'GET /admin/books': () => ({ body: { items: [...store.values()] } }),
      'POST /admin/books': (c) => {
        const b = c.body as { fileName: string; subjectKey: string; grade: number; lang: 'ky'; pageCount: number; title?: string };
        const created = book({ id: store.size ? ID2 : ID1, fileName: b.fileName, subjectKey: b.subjectKey, grade: b.grade, lang: b.lang, pageCount: b.pageCount, title: b.title ?? b.fileName });
        store.set(created.id, created);
        return { body: created };
      },
      'POST /admin/books/:id/pages': (c, p) => {
        const pages = (c.body as { pages: { n: number }[] }).pages;
        if (pages[0].n === 7 && failOnce) {
          failOnce = false;
          return { status: 503, body: { type: 'about:blank', title: 'x', status: 503, code: 'internal' } };
        }
        const b = store.get(p.id)!;
        const next = { ...b, pagesUploaded: b.pagesUploaded + pages.length, coverUrl: `/api/v1/books/${b.id}/cover` };
        store.set(b.id, next);
        return { body: next };
      },
      'POST /admin/books/:id/process': (_c, p) => {
        const next = { ...store.get(p.id)!, status: 'processing' as const, stage: 'sections' as const, progress: { done: 3, total: 7 } };
        store.set(p.id, next);
        return { body: next };
      },
      'GET /admin/books/:id': (_c, p) => ({ body: { book: { ...store.get(p.id)!, status: 'review', stage: 'done', sectionCount: 1 }, sections: [section(S1)] } }),
    });
    const user = userEvent.setup();
    renderAdmin('/admin/books');
    expect(await screen.findByRole('link', { name: 'Учебники' })).toBeInTheDocument();
    await screen.findByText('Учебников пока нет');

    await user.click(screen.getByRole('button', { name: 'Загрузить учебники' }));
    const dialog = await screen.findByRole('dialog', { name: 'Загрузка учебников' });
    await user.selectOptions(within(dialog).getByLabelText('Класс'), '7');
    await waitFor(() => expect(within(dialog).getByLabelText('Предмет (для всех)')).toHaveTextContent('Физика'));
    await user.selectOptions(within(dialog).getByLabelText('Предмет (для всех)'), 'phys');
    await user.upload(within(dialog).getByLabelText('Выбрать PDF'), [new File(['%PDF'], 'fizika-7.pdf', { type: 'application/pdf' }), new File(['%PDF'], 'ximiya-7.pdf', { type: 'application/pdf' })]);
    await user.selectOptions(within(dialog).getByLabelText('Предмет: ximiya-7.pdf'), 'chem');
    await user.click(within(dialog).getByRole('button', { name: 'Добавить в очередь (2)' }));

    // Both books are uploaded one after another and their reading started.
    await waitFor(() => expect(api.find('POST', /\/process$/)).toHaveLength(2));
    const creates = api.find('POST', '/admin/books').map((c) => c.body);
    expect(creates).toEqual([
      { fileName: 'fizika-7.pdf', pageCount: 8, grade: 7, lang: 'ky', subjectKey: 'phys' },
      { fileName: 'ximiya-7.pdf', pageCount: 2, grade: 7, lang: 'ky', subjectKey: 'chem' },
    ]);
    const batches = api.find('POST', `/admin/books/${ID1}/pages`).map((c: Call) => (c.body as { pages: { n: number; text?: string; image?: string }[] }).pages);
    expect(batches.map((b) => b.map((p) => p.n))).toEqual([[1, 2, 3, 4, 5, 6], [7, 8], [7, 8]]);
    expect(batches[0].slice(0, 4).every((p) => p.text && !p.image)).toBe(true);
    expect(batches[0][4]).toEqual({ n: 5, image: 'data:image/jpeg;base64,/9j/PAGE5' });
    expect(api.find('POST', `/admin/books/${ID2}/pages`)).toHaveLength(1);
    expect(readers['fizika-7.pdf'].closed && readers['ximiya-7.pdf'].closed).toBe(true);

    const jobs = await screen.findAllByTestId('upload-job');
    await waitFor(() => expect(jobs[0]).toHaveTextContent('Загружено, ИИ читает'));
    expect(within(jobs[0]).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '8');
    // The list shows the reading's stage and progress.
    const cards = await screen.findAllByTestId('book-card');
    await waitFor(() => expect(cards[0]).toHaveTextContent('Параграфы: 3 / 7'));
    expect(cards[0]).toHaveTextContent('Читается');

    await user.click(cards[0]);
    await screen.findByRole('heading', { level: 1, name: 'fizika-7.pdf' });
    expect(screen.getByText('На проверке')).toBeInTheDocument();
    expect(screen.getAllByTestId('book-section')).toHaveLength(1);
  });

  it('a batch that keeps failing stops at its page; «Продолжить» resumes from there without a new book', async () => {
    uploadDeps.open = async () => fakeReader(8, 8);
    let down = true;
    const api = mockApi({
      'GET /admin/subjects': { body: subjects },
      'GET /admin/books': { body: { items: [] } },
      'POST /admin/books': { body: book() },
      'POST /admin/books/:id/pages': (c) => (down && (c.body as { pages: { n: number }[] }).pages[0].n === 7 ? { status: 503, body: { type: 'about:blank', title: 'x', status: 503, code: 'internal' } } : { body: book() }),
      'POST /admin/books/:id/process': { body: book({ status: 'queued' }) },
    });
    const user = userEvent.setup();
    renderAdmin('/admin/books');
    await user.click(await screen.findByRole('button', { name: 'Загрузить учебники' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Класс'), '7');
    await waitFor(() => expect(within(dialog).getByLabelText('Предмет (для всех)')).toHaveTextContent('Физика'));
    await user.selectOptions(within(dialog).getByLabelText('Предмет (для всех)'), 'phys');
    await user.upload(within(dialog).getByLabelText('Выбрать PDF'), new File(['%PDF'], 'fizika-7.pdf', { type: 'application/pdf' }));
    await user.click(within(dialog).getByRole('button', { name: 'Добавить в очередь (1)' }));

    const job = await screen.findByTestId('upload-job');
    await waitFor(() => expect(within(job).getByRole('alert')).toHaveTextContent('Остановилось на странице 7: сервер не принял (3 повтора)'));
    expect(api.find('POST', `/admin/books/${ID1}/pages`)).toHaveLength(1 + 4);
    down = false;
    await user.click(within(job).getByRole('button', { name: 'Продолжить' }));
    await waitFor(() => expect(api.find('POST', `/admin/books/${ID1}/process`)).toHaveLength(1));
    expect(api.find('POST', '/admin/books')).toHaveLength(1);
    expect((api.find('POST', `/admin/books/${ID1}/pages`).at(-1)!.body as { pages: { n: number }[] }).pages.map((p) => p.n)).toEqual([7, 8]);
  });
});

describe('books: the book page', () => {
  const detail = () => ({
    book: book({ status: 'review', stage: 'done', pagesUploaded: 8, sectionCount: 2, coverUrl: `/api/v1/books/${ID1}/cover`, usage: { inputTokens: 1200, cachedInputTokens: 300, outputTokens: 80, costUsd: 0.42 } }),
    sections: [section(S1), section(S2, { order: 1, number: '9', title: 'Ылдамдануу', topicKey: null, reviewed: true, chapterNumber: '1' })],
  });

  it('edits one section: the PATCH carries only that section and its changed fields; then publish', async () => {
    const api = mockApi({
      'GET /admin/subjects': { body: subjects },
      'GET /admin/books/:id': { body: detail() },
      'PATCH /admin/books/:id': (c) => {
        const d = detail();
        const p = (c.body as { sections: Partial<BookSection>[] }).sections[0];
        return { body: { ...d, sections: d.sections.map((s) => (s.id === p.id ? { ...s, ...p } : s)) } };
      },
      'POST /admin/books/:id/publish': { body: book({ status: 'published', stage: 'done', publishedAt: AT }) },
    });
    const user = userEvent.setup();
    renderAdmin(`/admin/books/${ID1}`);
    const rows = await screen.findAllByTestId('book-section');
    expect(within(rows[0]).getByText('ИИ')).toBeInTheDocument();
    expect(within(rows[1]).queryByText('ИИ')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1. Механика. Кинематиканын негиздери' })).toBeInTheDocument();
    expect(screen.getByText(/0,42\s\$/)).toBeInTheDocument();

    await user.click(within(rows[0]).getByRole('button', { name: /^Раскрыть: § 6/ }));
    const summary = within(rows[0]).getByLabelText('Краткое содержание');
    await user.clear(summary);
    await user.type(summary, 'Ылдамдык — жолдун убакытка катышы.');
    await user.type(within(rows[0]).getByLabelText('Ключевые слова'), 'бир калыптагы кыймыл{Enter}');
    await user.click(within(rows[0]).getByRole('checkbox', { name: /^Проверено/ }));
    expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(api.find('PATCH', `/admin/books/${ID1}`)).toHaveLength(1));
    expect(api.find('PATCH', `/admin/books/${ID1}`)[0].body).toEqual({
      sections: [{ id: S1, summary: 'Ылдамдык — жолдун убакытка катышы.', keywords: ['ылдамдык', 'бир калыптагы кыймыл'], reviewed: true }],
    });
    await waitFor(() => expect(within(screen.getAllByTestId('book-section')[0]).queryByText('ИИ')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await waitFor(() => expect(api.find('POST', `/admin/books/${ID1}/publish`)).toHaveLength(1));
    expect(await screen.findByText('Опубликован')).toBeInTheDocument();
  });

  it('uploads a new cover as a ≤1600 px JPEG data URL', async () => {
    const api = mockApi({
      'GET /admin/subjects': { body: subjects },
      'GET /admin/books/:id': { body: detail() },
      'POST /admin/books/:id/cover': { body: book({ status: 'review', coverUrl: `/api/v1/books/${ID1}/cover?v=2` }) },
    });
    const user = userEvent.setup();
    renderAdmin(`/admin/books/${ID1}`);
    const input = await screen.findByLabelText('Загрузить новую обложку');
    const file = new File(['png'], 'cover.png', { type: 'image/png' });
    await user.upload(input, file);
    await waitFor(() => expect(api.find('POST', `/admin/books/${ID1}/cover`)).toHaveLength(1));
    expect(api.find('POST', `/admin/books/${ID1}/cover`)[0].body).toEqual({ image: 'data:image/jpeg;base64,/9j/COVER' });
    expect(imageToJpeg).toHaveBeenCalledWith(file, 1600, BOOK_PAGE_IMAGE_BYTES);
    // The cover itself is an authed GET, fetched as a blob.
    await waitFor(() => expect(api.find('GET', `/books/${ID1}/cover`).length).toBeGreaterThan(0));
    expect(api.find('GET', `/books/${ID1}/cover`)[0].headers.authorization).toBe('Bearer test-token');
  });

  it('without content.publish there is no Publish / Archive', async () => {
    mockApi({ 'GET /admin/books/:id': { body: detail() }, 'GET /admin/subjects': { body: subjects } });
    renderAdmin(`/admin/books/${ID1}`, { me: meFixture(PERMISSIONS.filter((p) => p !== 'content.publish')) });
    await screen.findAllByTestId('book-section');
    expect(screen.queryByRole('button', { name: 'Опубликовать' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'В архив' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /^Раскрыть/ })[0]);
    expect(screen.getAllByLabelText('Краткое содержание')[0]).toBeEnabled();
  });
});
