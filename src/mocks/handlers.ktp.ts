/**
 * DEV/TEST-ONLY MSW handlers for КТП → сабак планы (contract 0.5.0): an
 * in-memory store per owner, upload (returns the fixture plan), PATCH with
 * If-Match and recomputed issues, delete, and .docx downloads (a small
 * placeholder file with the server-style Content-Disposition).
 */
import { HttpResponse } from 'msw';
import { DOCX_MEDIA_TYPE, HEADERS, KTP_MAX_BYTES, KtpLessonPlanQuerySchema, KtpLessonPlansQuerySchema, type KtpPatchRequest } from '@bilig/content-model/api';
import { mockDb, newId, schoolIdsOf } from './db';
import { buildKtpPlan, computeIssues, planDto, planSummary, sameClassName, type MockKtpPlan } from './ktp';
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
