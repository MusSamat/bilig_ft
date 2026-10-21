/**
 * DEV/TEST-ONLY MSW handlers of the book library (contract 0.9.3): staff
 * create a book, send its pages in batches, start the (simulated) reading,
 * fix and publish it; teachers list published books and fetch covers.
 * The admin's subject list is served from the catalog so the forms have
 * real subject keys in mock mode.
 */
import { HttpResponse, http } from 'msw';
import { API_PREFIX, HEADERS, type AdminBookPatch, type BookStatus, type EndpointBody, type EndpointResponse } from '@bilig/content-model/api';
import catalogBase from './content/catalog.json';
import { advanceBook, bookCovers, bookDto, coverPath, coverSvg, newMockBook, type MockBook } from './books';
import { mockDb, newId, permissionsOf, userById } from './db';
import type { route as routeFn, fail as failFn } from './handlers';

type Deps = { route: typeof routeFn; fail: typeof failFn };

const now = () => new Date().toISOString();
const byId = (id: string): MockBook | undefined => {
  const b = mockDb.books.find((x) => x.id === id);
  return b ? advanceBook(b) : undefined;
};
const detail = (b: MockBook) => ({ book: bookDto(b), sections: [...b.sections].sort((x, y) => x.order - y.order) });

function filtered(url: URL, statuses?: BookStatus[]) {
  const q = url.searchParams;
  const grade = q.get('grade');
  return mockDb.books
    .map((b) => advanceBook(b))
    .filter((b) => (!statuses || statuses.includes(b.status)) && (!grade || b.grade === Number(grade)) && (!q.get('subjectKey') || b.subjectKey === q.get('subjectKey')) && (!q.get('lang') || b.lang === q.get('lang')) && (!q.get('status') || b.status === q.get('status')) && (!q.get('kind') || b.kind === q.get('kind')))
    .sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt));
}

function dataUrlToBlob(url: string): Blob | null {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(url);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

export function bookHandlers({ route, fail }: Deps) {
  return [
    // --- staff ---------------------------------------------------------------------------
    route('adminBookList', ({ url }) => ({ items: filtered(url).map(bookDto) })),
    route('adminBookCreate', ({ body }) => {
      const b = body as EndpointBody<'adminBookCreate'>;
      const book = newMockBook({ id: newId(), ...b });
      mockDb.books.push(book);
      return bookDto(book);
    }),
    route('adminBookGet', ({ params }) => {
      const b = byId(params.id);
      return b ? detail(b) : fail('not_found');
    }),
    route('adminBookPages', ({ params, body }) => {
      const b = byId(params.id);
      if (!b) return fail('not_found');
      if (b.status !== 'uploading' && b.status !== 'failed') return fail('conflict', { detail: `The book is ${b.status}` });
      const { pages } = body as EndpointBody<'adminBookPages'>;
      const bad = pages.find((p) => p.n > b.pageCount);
      if (bad) return fail('validation_failed', { issues: [{ path: ['pages'], message: `Page ${bad.n} > ${b.pageCount}` }] });
      for (const p of pages) {
        if (!b.pages.includes(p.n)) b.pages.push(p.n);
        if (p.n === 1 && !bookCovers.has(b.id) && p.image) bookCovers.set(b.id, p.image);
      }
      b.pagesUploaded = b.pages.length;
      b.progress = { done: b.pagesUploaded, total: b.pageCount };
      if (b.pages.includes(1)) b.coverUrl = coverPath(b.id);
      b.updatedAt = now();
      return bookDto(b);
    }),
    route('adminBookProcess', ({ params, body }) => {
      const b = byId(params.id);
      if (!b) return fail('not_found');
      const { from } = body as EndpointBody<'adminBookProcess'>;
      if (b.status === 'queued' || b.status === 'processing') return fail('conflict', { detail: 'Already being read' });
      if (b.pagesUploaded < b.pageCount) return fail('conflict', { detail: `${b.pageCount - b.pagesUploaded} pages are missing` });
      b.run = { startedAt: Date.now(), from: from ?? 'pages' };
      b.status = 'queued';
      b.error = null;
      advanceBook(b);
      return bookDto(b);
    }),
    route('adminBookPatch', ({ params, body }) => {
      const b = byId(params.id);
      if (!b) return fail('not_found');
      const { sections, ...meta } = body as AdminBookPatch;
      for (const s of sections ?? []) {
        const cur = b.sections.find((x) => x.id === s.id);
        if (!cur) return fail('validation_failed', { issues: [{ path: ['sections', s.id], message: 'No such section' }] });
      }
      for (const s of sections ?? []) Object.assign(b.sections.find((x) => x.id === s.id)!, s);
      Object.assign(b, meta);
      b.updatedAt = now();
      return detail(b);
    }),
    route('adminBookCover', ({ params, body }) => {
      const b = byId(params.id);
      if (!b) return fail('not_found');
      bookCovers.set(b.id, (body as EndpointBody<'adminBookCover'>).image);
      b.coverUrl = `${coverPath(b.id)}?v=${Date.now()}`;
      b.updatedAt = now();
      return bookDto(b);
    }),
    route('adminBookPublish', ({ params }) => {
      const b = byId(params.id);
      if (!b) return fail('not_found');
      if (b.status !== 'review' && b.status !== 'archived' && b.status !== 'published') return fail('conflict', { detail: `The book is ${b.status}` });
      b.status = 'published';
      b.publishedAt = now();
      b.updatedAt = b.publishedAt;
      return bookDto(b);
    }),
    route('adminBookArchive', ({ params }) => {
      const b = byId(params.id);
      if (!b) return fail('not_found');
      b.status = 'archived';
      b.updatedAt = now();
      return bookDto(b);
    }),
    route('adminSubjectList', () => ({
      items: (catalogBase as unknown as { subjects: EndpointResponse<'adminSubjectList'>['items'][number]['data'][] }).subjects.map((s, i) => ({ id: `0192a000-0000-7000-8000-0000000007${String(i).padStart(2, '0')}`, data: s, version: 1, updatedAt: '2026-09-01T08:00:00.000Z' })),
      nextCursor: null,
    })),

    // --- teachers ------------------------------------------------------------------------
    route('bookList', ({ url }) => ({ items: filtered(url, ['published']).map(bookDto) })),
    route('bookGet', ({ params }) => {
      const b = byId(params.id);
      return b && b.status === 'published' ? detail(b) : fail('not_found');
    }),
    // The cover, for teachers (lesson.plan) and staff (content.draft.edit) alike.
    http.get(`${API_PREFIX}/books/:id/cover`, ({ request, params }) => {
      const auth = request.headers.get(HEADERS.authorization);
      const user = auth?.startsWith('Bearer ') ? userById(mockDb.tokens[auth.slice(7)]) : undefined;
      const perms = permissionsOf(user);
      if (!perms.includes('lesson.plan') && !perms.includes('content.draft.edit')) return fail(user ? 'forbidden' : 'unauthorized');
      const b = mockDb.books.find((x) => x.id === params.id);
      if (!b || !b.coverUrl) return fail('not_found');
      const own = bookCovers.get(b.id);
      const blob = own ? dataUrlToBlob(own) : null;
      if (blob) return new HttpResponse(blob, { headers: { 'Content-Type': blob.type } });
      return new HttpResponse(coverSvg(b), { headers: { 'Content-Type': 'image/svg+xml' } });
    }),
  ];
}
