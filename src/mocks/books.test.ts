/** The mock's simulated reading of a book (stages in time, then review with the Physics 7 sample). */
import { describe, expect, it } from 'vitest';
import { BookDetailSchema } from '@bilig/content-model/api';
import { advanceBook, bookDto, newMockBook, seedBooks } from './books';

describe('mock book reading', () => {
  it('queued → pages → contents → sections → book → review, with progress and cost', () => {
    const b = newMockBook({ id: '0192a000-0000-7000-8000-00000000dd01', fileName: 'f.pdf', subjectKey: 'phys', grade: 7, lang: 'ky', pageCount: 50 });
    b.pagesUploaded = 50;
    const t0 = 1_000_000;
    b.run = { startedAt: t0, from: 'pages' };
    b.status = 'queued';
    expect(advanceBook(b, t0 + 100)).toMatchObject({ status: 'queued', stage: 'pages' });
    expect(advanceBook(b, t0 + 600 + 1000)).toMatchObject({ status: 'processing', stage: 'pages', progress: { done: 25, total: 50 } });
    expect(advanceBook(b, t0 + 600 + 2000 + 100)).toMatchObject({ stage: 'contents' });
    expect(advanceBook(b, t0 + 600 + 2000 + 900 + 1200)).toMatchObject({ stage: 'sections', progress: { done: 3, total: 7 } });
    expect(b.usage.costUsd).toBeGreaterThan(0);
    advanceBook(b, t0 + 60_000);
    expect(b).toMatchObject({ status: 'review', stage: 'done', sectionCount: 7 });
    expect(b.sections.every((s) => !s.reviewed)).toBe(true);
    expect(BookDetailSchema.safeParse({ book: bookDto(b), sections: b.sections }).success).toBe(true);
  });

  it('the seeded «Физика 7» is published and valid', () => {
    const [b] = seedBooks();
    expect(BookDetailSchema.parse({ book: bookDto(b), sections: b.sections }).book.status).toBe('published');
  });
});
