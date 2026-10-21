import { describe, expect, it, vi } from 'vitest';
import { KtpContentsResponseSchema, TextbookDraftSchema, type KtpRow, type TeachingPlan } from '@bilig/content-model/api';
import fixture from '../mocks/content/textbook-draft-fizika-7.json';
import { BookError, checkBookFiles, dataUrlBytes, hasTextLayer, pickPages, preparePdfWith, type PdfReader } from './book';
import { fromContents, liveWarnings, toDraft, warningCount } from './draft';
import { currentSchoolYear, isDraftPlan, planForView } from './model';

const file = (name: string, size = 10, type = '') => new File([new Uint8Array(size)], name, { type });

function fakePdf(count: number, text: (n: number) => string): PdfReader & { closed: boolean; rendered: number[] } {
  const r = {
    closed: false,
    rendered: [] as number[],
    pageCount: () => count,
    pageText: async (n: number) => text(n),
    pageJpeg: async (n: number) => {
      r.rendered.push(n);
      return 'data:image/jpeg;base64,/9j/AAAA';
    },
    close: () => void (r.closed = true),
  };
  return r;
}

describe('book preparation', () => {
  it('takes the first 12 and the last 8 pages, without repeats in a short book', () => {
    expect(pickPages(100)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 93, 94, 95, 96, 97, 98, 99, 100]);
    expect(pickPages(15)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(pickPages(3)).toEqual([1, 2, 3]);
    expect(pickPages(0)).toEqual([]);
  });

  it('calls a PDF with more than 300 letters on those pages a text PDF', () => {
    expect(hasTextLayer(['  12  ', '— 4 —'])).toBe(false);
    expect(hasTextLayer(['Мазмуну '.repeat(50)])).toBe(true);
  });

  it('sends the text of a PDF with a text layer, page images of a scan', async () => {
    const text = fakePdf(40, (n) => `§ ${n} Кыймылдын ылдамдыгы ......... ${n * 2}`);
    const a = await preparePdfWith(text, 'fizika.pdf');
    expect(a.pages).toHaveLength(20);
    expect(a.pages![0]).toBe('§ 1 Кыймылдын ылдамдыгы ......... 2');
    expect(a.images).toBeUndefined();
    expect(text.closed).toBe(true);

    const scan = fakePdf(30, () => '');
    const progress = vi.fn();
    const b = await preparePdfWith(scan, 'scan.pdf', progress);
    expect(b.pages).toBeUndefined();
    expect(b.images).toHaveLength(20);
    expect(b.imagePages).toEqual([...Array.from({ length: 12 }, (_, i) => i + 1), 23, 24, 25, 26, 27, 28, 29, 30]);
    expect(progress).toHaveBeenLastCalledWith({ done: 20, total: 20 });
    expect(progress).toHaveBeenCalledWith({ done: 3, total: 20 });
    expect(scan.closed).toBe(true);
  });

  it('checks the picked files', () => {
    expect(checkBookFiles([])).toBe('ktp.book.err.none');
    expect(checkBookFiles([file('book.djvu')])).toBe('ktp.book.err.type');
    expect(checkBookFiles([file('a.pdf'), file('b.pdf')])).toBe('ktp.book.err.oneFile');
    expect(checkBookFiles([file('a.pdf', 0)])).toBe('ktp.book.err.empty');
    expect(checkBookFiles(Array.from({ length: 25 }, (_, i) => file(`p${i}.jpg`)))).toBe('ktp.book.err.tooMany');
    expect(checkBookFiles([file('p1.JPG'), file('p2.png'), file('p3', 10, 'image/webp')])).toBeNull();
    expect(checkBookFiles([file('book.docx', 5 * 1024 * 1024)])).toBe('ktp.book.err.docxLarge');
    expect(new BookError('ktp.book.err.pdf').i18nKey).toBe('ktp.book.err.pdf');
    expect(dataUrlBytes('data:image/jpeg;base64,AAAA')).toBe(3);
  });
});

describe('contents draft', () => {
  const res = KtpContentsResponseSchema.parse({
    ...fixture,
    source: 'text',
    contentsPages: [0],
  });

  it('the mock fixture is a valid draft (real Physics 7 contents)', () => {
    expect(TextbookDraftSchema.safeParse(fixture.draft).success).toBe(true);
  });

  it('round-trips, keeps warnings on their rows and drops «no pages» once filled', () => {
    const d = fromContents(res);
    expect(warningCount(d)).toBe(7);
    const out = toDraft(d);
    // A lesson without a topic goes without `topicKey`: the server may still match it by title.
    const strip = {
      ...res.draft,
      chapters: res.draft.chapters.map((c) => ({
        ...c,
        lessons: c.lessons.map(({ topicKey, ...l }) => (topicKey ? { ...l, topicKey } : l)),
      })),
    };
    expect(out.ok && out.draft).toEqual(strip);
    const noPages = d.chapters[1].lessons[3];
    expect(liveWarnings(noPages)).toEqual(['no_pages']);
    expect(liveWarnings({ ...noPages, from: '50' })).toEqual([]);
  });

  it('maps schema problems back onto the rows', () => {
    const d = fromContents(res);
    const l = d.chapters[0].lessons[1];
    const bad = {
      ...d,
      chapters: [
        {
          ...d.chapters[0],
          lessons: [{ ...l, title: ' ', from: '12', to: '9' }],
        },
      ],
    };
    const out = toDraft(bad);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors[l.id]).toMatch(/^ktp\.book\.review\.err\.(lesson|pages)$/);
    const pages = toDraft({
      ...d,
      chapters: [{ ...d.chapters[0], lessons: [{ ...l, from: 'x' }] }],
    });
    expect(!pages.ok && pages.errors[l.id]).toBe('ktp.book.review.err.pages');
    // A single page is from = to.
    const one = toDraft({
      ...d,
      chapters: [{ ...d.chapters[0], lessons: [{ ...l, from: '7', to: '' }] }],
    });
    expect(one.ok && one.draft.chapters[0].lessons[0].pages).toEqual({
      from: 7,
      to: 7,
    });
  });
});

describe('preliminary КТП', () => {
  const row = (dates: KtpRow['dates']): KtpRow => ({
    index: 1,
    number: 1,
    title: 'x',
    hours: 1,
    type: 'new',
    dates,
    homework: '',
    note: '',
    topicKey: null,
  });
  const plan = (title: string, rows: KtpRow[]) =>
    ({
      title,
      rows,
      issues: [
        { code: 'date_missing', severity: 'warning', row: 1, class: '7а' },
        { code: 'hours_mismatch', severity: 'warning' },
      ],
    }) as unknown as TeachingPlan;

  it('is known by its title or by having no dates at all, and «no date» is no problem there', () => {
    expect(isDraftPlan(plan('Физика, 7-класс, 2026–2027 (алдын ала)', [row({ '7а': '2026-09-02' })]))).toBe(true);
    expect(isDraftPlan(plan('Physics, grade 7 (draft)', []))).toBe(true);
    expect(isDraftPlan(plan('КТП', [row({ '7а': null })]))).toBe(true);
    expect(isDraftPlan(plan('КТП', [row({ '7а': '2026-09-02' })]))).toBe(false);
    expect(planForView(plan('x (предварительный)', [row({})])).issues.map((i) => i.code)).toEqual(['hours_mismatch']);
    expect(planForView(plan('КТП', [row({ '7а': '2026-09-02' })])).issues).toHaveLength(2);
  });

  it('the school year starts in September', () => {
    expect(currentSchoolYear(new Date(2026, 9, 21))).toBe(2026);
    expect(currentSchoolYear(new Date(2027, 4, 1))).toBe(2026);
    expect(currentSchoolYear(new Date(2026, 8, 1))).toBe(2026);
  });
});
