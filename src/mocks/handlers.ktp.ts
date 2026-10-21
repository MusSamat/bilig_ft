/**
 * DEV/TEST-ONLY MSW handlers for КТП → сабак планы (contract 0.5.0): an
 * in-memory store per owner, upload (returns the fixture plan), PATCH with
 * If-Match and recomputed issues, delete, and .docx downloads (a small
 * placeholder file with the server-style Content-Disposition).
 */
import { HttpResponse, delay } from 'msw';
import { t as tr, type Lang } from '@bilig/content-model';
import {
  DOCX_MEDIA_TYPE,
  HEADERS,
  KTP_MAX_BYTES,
  KtpLessonPlanQuerySchema,
  KtpLessonPlansQuerySchema,
  SCHOOL_WEEKS,
  type KtpContentsRequest,
  type KtpContentsResponse,
  type KtpFromTextbookRequest,
  type KtpPatchRequest,
} from '@bilig/content-model/api';
import catalogBase from './content/catalog.json';
import draftFixture from './content/textbook-draft-fizika-7.json';
import { TEXTBOOKS } from './data';
import { mockDb, newId, schoolIdsOf } from './db';
import { buildFromTextbook, buildKtpPlan, computeIssues, planDto, planSummary, sameClassName, type BookLine, type MockKtpPlan } from './ktp';
import type { route as routeFn, fail as failFn } from './handlers';

type Deps = { route: typeof routeFn; fail: typeof failFn };

const now = () => new Date().toISOString();

/** A tiny stand-in for a .docx (the client only saves the bytes). */
const placeholderDocx = (text: string) =>
  new Blob([`PK\u0003\u0004 bilig mock lesson plan\n${text}\n`], {
    type: DOCX_MEDIA_TYPE,
  });

const docxResponse = (name: string, text: string) =>
  new HttpResponse(placeholderDocx(text), {
    headers: {
      'Content-Type': DOCX_MEDIA_TYPE,
      'Content-Disposition': `attachment; filename="plan.docx"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });

/** v0.9.2: the school year a request is made in (September on = this year's). */
const schoolYear = (d = new Date()) => (d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1);
const planLang = (l: Lang | undefined): 'ky' | 'ru' | 'en' => (l === 'ru' || l === 'en' ? l : 'ky');
const subjectName = (key: string | null | undefined, lang: 'ky' | 'ru' | 'en') => {
  const s = (catalogBase as { subjects: { key: string; title: Record<string, string> }[] }).subjects.find((x) => x.key === key);
  return s ? (s.title[lang] ?? s.title.ky).toLocaleLowerCase(lang) : '';
};

const base64Bytes = (b64: string) => Math.floor((b64.replace(/=+$/, '').length * 3) / 4);

export function ktpHandlers({ route, fail }: Deps) {
  const mine = (id: string, userId: string | undefined): MockKtpPlan | undefined => mockDb.ktp.find((p) => p.id === id && p.ownerId === userId);
  const stale = (req: Request, p: MockKtpPlan, bodyVersion?: number) => {
    const h = req.headers.get(HEADERS.ifMatch);
    if (h === null && bodyVersion === undefined) return fail('precondition_required');
    if (String(p.version) !== (h ?? String(bodyVersion))) return fail('version_mismatch');
    return null;
  };

  return [
    route('ktpList', ({ user, url }) => {
      const items = mockDb.ktp
        .filter((p) => p.ownerId === user!.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(planSummary);
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
      const start = Number(url.searchParams.get('cursor') ?? 0) || 0;
      return {
        items: items.slice(start, start + limit),
        nextCursor: start + limit < items.length ? String(start + limit) : null,
      };
    }),
    route('ktpCreate', ({ user, body }) => {
      const b = body as { fileName: string; data: string };
      if (!/\.docx$/i.test(b.fileName))
        return fail('validation_failed', {
          issues: [{ path: ['fileName'], message: 'Expected a .docx file' }],
        });
      if (base64Bytes(b.data) > KTP_MAX_BYTES) return fail('payload_too_large');
      const plan = buildKtpPlan(newId(), user!.id, b.fileName);
      // v0.8.0: link each КТП column to the teacher's class of the same name.
      const own = mockDb.classes.filter((c) => schoolIdsOf(user).includes(c.schoolId));
      plan.classLinks = Object.fromEntries(plan.classes.map((col) => [col, own.find((c) => sameClassName(c.name, col))?.id ?? null]));
      mockDb.ktp.push(plan);
      return planDto(plan);
    }),
    // v0.9.2: the contents of a book. Text and .docx come back at once; images «need the assistant» (slower, 503 when it is down).
    route('ktpContents', async ({ body }) => {
      const b = body as KtpContentsRequest;
      const images = !!b.images?.length;
      if (images) {
        if (mockDb.flags.tutorDown) return fail('tutor_unavailable');
        await delay(600);
      }
      if (b.docx && base64Bytes(b.docx) > KTP_MAX_BYTES) return fail('payload_too_large');
      const res: KtpContentsResponse = {
        draft: { ...(draftFixture.draft as KtpContentsResponse['draft']), ...(b.grade ? { grade: b.grade } : {}), ...(b.subjectKey ? { subjectKey: b.subjectKey } : {}) },
        source: images ? 'assistant' : 'text',
        contentsPages: images ? [Math.min(2, b.images!.length - 1)] : [0],
        warnings: draftFixture.warnings as KtpContentsResponse['warnings'],
      };
      return res;
    }),
    route('ktpFromTextbook', ({ user, body }) => {
      const b = body as KtpFromTextbookRequest;
      let lines: BookLine[];
      let subjectKey: string | null;
      let grade: number | null;
      let lang = planLang(b.lang);
      let sourceName: string;
      if (b.textbookKey) {
        const tb = TEXTBOOKS.find((x) => x.key === b.textbookKey);
        if (!tb) return fail('not_found');
        const chapters = tb.chapters.filter((c) => !b.subjectKey || c.subjectKey === b.subjectKey);
        if (!chapters.length) return fail('validation_failed', { issues: [{ path: ['subjectKey'], message: 'The textbook has no chapters of this subject' }] });
        lines = chapters.flatMap((c) =>
          c.lessons.map((l) => ({ chapter: { number: c.number, title: tr(c.title, lang) }, number: l.number, kind: l.kind, title: tr(l.title, lang), pages: l.pages, topicKey: l.topicKeys[0] ?? null })),
        );
        subjectKey = b.subjectKey ?? chapters[0].subjectKey;
        grade = tb.grade;
        sourceName = tr(tb.shortTitle ?? tb.title, lang);
      } else if (b.bookId) {
        // v0.9.3: a published book of the library, line by line from its sections.
        const book = mockDb.books.find((x) => x.id === b.bookId && x.status === 'published');
        if (!book) return fail('not_found');
        lang = planLang(b.lang ?? book.lang);
        lines = [...book.sections]
          .sort((x, y) => x.order - y.order)
          .map((s) => ({ chapter: { number: s.chapterNumber, title: s.chapterTitle }, number: s.number, kind: s.kind, title: s.title, pages: s.pages, topicKey: s.topicKey }));
        subjectKey = book.subjectKey;
        grade = book.grade;
        sourceName = book.title;
      } else {
        const d = b.draft!;
        lang = planLang(b.lang ?? d.lang);
        lines = d.chapters.flatMap((c) => c.lessons.map((l) => ({ chapter: { number: c.number, title: c.title }, number: l.number, kind: l.kind, title: l.title, pages: l.pages, topicKey: l.topicKey ?? null })));
        subjectKey = d.subjectKey;
        grade = d.grade;
        sourceName = d.title;
      }
      const classes = [...new Set((b.classes ?? []).map((c) => c.replace(/\s+/g, '')))];
      const plan = buildFromTextbook({
        id: newId(),
        ownerId: user!.id,
        lines,
        subjectKey,
        subjectName: subjectName(subjectKey, lang),
        grade,
        lang,
        year: b.year ?? schoolYear(),
        classes,
        hoursPerWeek: b.hoursPerWeek,
        weeks: b.weeks ?? SCHOOL_WEEKS,
        sourceName,
      });
      const own = mockDb.classes.filter((c) => schoolIdsOf(user).includes(c.schoolId));
      plan.classLinks = Object.fromEntries(plan.classes.map((col) => [col, own.find((c) => sameClassName(c.name, col))?.id ?? null]));
      mockDb.ktp.push(plan);
      return planDto(plan);
    }),
    route('ktpDocx', ({ params, user }) => {
      const p = mine(params.id, user?.id);
      if (!p) return fail('not_found');
      const name = [p.subjectName || 'ktp', p.grade ? `${p.grade}-класс` : null, p.year ? `${p.year}-${p.year + 1}` : null].filter(Boolean).join('_');
      return docxResponse(`КТП_${name}.docx`, `${p.title}\n${p.rows.length} lessons`);
    }),
    route('ktpGet', ({ params, user }) => {
      const p = mine(params.id, user?.id);
      return p ? planDto(p) : fail('not_found');
    }),
    route('ktpPatch', ({ params, user, body, req }) => {
      const p = mine(params.id, user?.id);
      if (!p) return fail('not_found');
      const b = body as KtpPatchRequest;
      const bad = stale(req, p, b.version);
      if (bad) return bad;
      const { version: _v, rows, classLinks, ...fields } = b;
      if (classLinks) {
        const own = new Set(mockDb.classes.filter((c) => schoolIdsOf(user).includes(c.schoolId)).map((c) => c.id));
        const bad = Object.entries(classLinks).find(([col, id]) => !p.classes.includes(col) || (id !== null && !own.has(id)));
        if (bad) return fail('validation_failed', { issues: [{ path: ['classLinks', bad[0]], message: 'Unknown column or class' }] });
        p.classLinks = { ...p.classLinks, ...classLinks };
      }
      Object.assign(p, fields);
      for (const rp of rows ?? []) {
        const r = p.rows.find((x) => x.index === rp.index);
        if (!r)
          return fail('validation_failed', {
            issues: [{ path: ['rows', rp.index], message: 'No such lesson' }],
          });
        const { index: _i, dates, topicKey, ...rest } = rp;
        Object.assign(r, rest);
        if (dates) {
          r.dates = { ...r.dates, ...dates };
          for (const c of Object.keys(dates)) delete p.raw[String(r.index)]?.[c];
        }
        if (topicKey !== undefined) {
          r.topicKey = topicKey;
          if (topicKey === null) delete r.match;
          else r.match = { auto: false, score: 1 };
        }
      }
      p.totalHours = p.rows.reduce((n, r) => n + r.hours, 0);
      p.issues = computeIssues(p);
      p.version += 1;
      p.updatedAt = now();
      return planDto(p);
    }),
    route('ktpDelete', ({ params, user, req }) => {
      const p = mine(params.id, user?.id);
      if (!p) return fail('not_found');
      const bad = stale(req, p);
      if (bad) return bad;
      mockDb.ktp = mockDb.ktp.filter((x) => x !== p);
      return { ok: true as const };
    }),
    route('ktpLessonPlan', ({ params, user, url }) => {
      const p = mine(params.id, user?.id);
      if (!p) return fail('not_found');
      const q = KtpLessonPlanQuerySchema.safeParse(Object.fromEntries(url.searchParams));
      const row = p.rows.find((r) => r.index === Number(params.index));
      if (!q.success || !row || !p.classes.includes(q.data.class)) return fail('validation_failed');
      return docxResponse(`Сабак-планы_${q.data.class}_${row.index}.docx`, `${q.data.class} #${row.index} ${row.title}`);
    }),
    route('ktpLessonPlans', ({ params, user, url }) => {
      const p = mine(params.id, user?.id);
      if (!p) return fail('not_found');
      const q = KtpLessonPlansQuerySchema.safeParse(Object.fromEntries(url.searchParams));
      if (!q.success || !p.classes.includes(q.data.class) || q.data.to > p.rows.length) {
        return fail('validation_failed', {
          issues: q.success ? [] : q.error.issues.map((i) => ({ path: i.path, message: i.message })),
        });
      }
      return docxResponse(`Сабак-пландары_${q.data.class}_${q.data.from}-${q.data.to}.docx`, `${q.data.class} ${q.data.from}..${q.data.to}`);
    }),
  ];
}
