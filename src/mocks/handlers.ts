/**
 * DEV/TEST-ONLY MSW handlers for the whole client-facing API (TZ §9), built
 * from the contract's ENDPOINTS table: request bodies are validated with the
 * route's schema, responses are typed with `EndpointResponse`, errors are
 * RFC 9457 problems.
 */
import { HttpResponse, delay, http, type HttpHandler } from 'msw';
import { z } from 'zod';
import {
  checkAnswer,
  draftSignature,
  groundedAnswer,
  groundedGenerate,
  sampleItems,
  suggestQuestions,
  t,
  textbookSubjects,
  textbookTopicKeys,
  type ContentPackage,
  type Lang,
  type Localized,
} from '@bilig/content-model';
import { mergeProgress as mergeProgressState } from '@bilig/scene-core';
import {
  API_PREFIX,
  ENDPOINTS,
  HEADERS,
  TopicDeckQuerySchema,
  encodeSseEvent,
  problem,
  type AdminGenerated,
  type EndpointBody,
  type EndpointName,
  type EndpointResponse,
  type ErrorCode,
  type Progress,
  type SyncRequest,
} from '@bilig/content-model/api';
import type { Permission } from '@bilig/permissions';
import { PACKAGES, TEXTBOOKS, buildCatalog, packageByKey } from './data';
import { cabinetHandlers } from './handlers.cabinet';
import { ktpHandlers } from './handlers.ktp';
import { registerHandlers } from './handlers.register';
import { staffHandlers } from './handlers.staff';
import { admitSubjects, profileOf, teacherHandlers } from './handlers.teacher';
import {
  CLASS_ID,
  mockDb,
  newId,
  issueToken,
  licensesOf,
  permissionsOf,
  schoolIdsOf,
  saveMockDb,
  userById,
  type MockAttempt,
  type MockUser,
} from './db';

const now = () => new Date().toISOString();
const FILES_BASE = '/mock-files';

export const fail = (code: ErrorCode, extra: Parameters<typeof problem>[1] = {}) => {
  const body = problem(code, extra);
  return HttpResponse.json(body, { status: body.status, headers: { 'Content-Type': 'application/problem+json' } });
};

const langOf = (req: Request): Lang => {
  const l = req.headers.get(HEADERS.acceptLanguage)?.slice(0, 2);
  return l === 'ru' || l === 'en' ? l : 'ky';
};

function currentUser(req: Request): MockUser | undefined {
  const auth = req.headers.get(HEADERS.authorization);
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  return token ? userById(mockDb.tokens[token]) : undefined;
}

type Ctx = { req: Request; params: Record<string, string>; body: unknown; user: MockUser | undefined; url: URL };
type Resolver<N extends EndpointName> = (ctx: Ctx) => Promise<EndpointResponse<N> | Response> | EndpointResponse<N> | Response;

const toMswPath = (p: string) => API_PREFIX + p;

/** Register a contract route: offline flag, auth/permission check, body validation. */
export function route<N extends EndpointName>(name: N, resolve: Resolver<N>): HttpHandler {
  const def = ENDPOINTS[name] as { method: string; path: string; auth: Permission | 'session' | null; body?: z.ZodTypeAny };
  const method = def.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  return http[method](toMswPath(def.path), async ({ request, params }) => {
    if (mockDb.flags.offline) return HttpResponse.error();
    if (mockDb.flags.latencyMs) await delay(mockDb.flags.latencyMs);
    const user = currentUser(request);
    if (def.auth === 'session' && !user) return fail('unauthorized');
    if (def.auth && def.auth !== 'session') {
      const perms = permissionsOf(user);
      if (!perms.includes(def.auth)) return fail(user ? 'forbidden' : 'unauthorized');
    }
    let body: unknown = undefined;
    if (def.body) {
      let raw: unknown = {};
      try {
        raw = await request.json();
      } catch {
        raw = {};
      }
      const parsed = def.body.safeParse(raw);
      if (!parsed.success) {
        return fail('validation_failed', { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) });
      }
      body = parsed.data;
    }
    const out = await resolve({ req: request, params: params as Record<string, string>, body, user, url: new URL(request.url) });
    saveMockDb();
    return out instanceof Response ? out : HttpResponse.json(out as object);
  });
}

const meOf = (u: MockUser): EndpointResponse<'me'> => ({
  id: u.id,
  kind: u.kind,
  displayName: u.displayName,
  ...(u.email ? { email: u.email } : {}),
  locale: u.locale,
  grants: u.grants,
  permissions: permissionsOf(u),
  ...(u.teaching ? { teaching: u.teaching } : {}),
  ...(u.kind === 'adult' && schoolIdsOf(u).length ? { licenses: licensesOf(u) } : {}),
  ...(u.phone ? { phone: u.phone } : {}),
  // v0.7.0 / v0.8.0: what a teacher has filled in and the profile status computed from it.
  ...profileOf(u),
});

const tokenFor = (u: MockUser): EndpointResponse<'login'> => ({ accessToken: issueToken(u.id), tokenType: 'Bearer', expiresIn: 900 });

const classWithCount = (c: (typeof mockDb.classes)[number]) => ({
  ...c,
  studentCount: mockDb.users.filter((u) => u.kind === 'student' && u.classId === c.id).length,
});

function page<T>(items: T[], url: URL): { items: T[]; nextCursor: string | null } {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
  const start = Number(url.searchParams.get('cursor') ?? 0) || 0;
  const slice = items.slice(start, start + limit);
  return { items: slice, nextCursor: start + limit < items.length ? String(start + limit) : null };
}

const studentDto = (u: MockUser) => ({ id: u.id, classId: u.classId!, displayName: u.displayName, hasConsent: !!u.hasConsent });

const randomPin = () => String(Math.floor(1000 + Math.random() * 9000));

function scoreAttempt(a: MockAttempt): number {
  if (!a.itemKeys.length) return 0;
  return a.answers.reduce((n, x) => n + x.score, 0) / a.itemKeys.length;
}

function attemptDto(a: MockAttempt): EndpointResponse<'attemptCreate'> {
  const { userId: _u, answers: _a, ...rest } = a;
  return rest;
}

function gradeAnswer(pkg: ContentPackage | undefined, itemKey: string, response: unknown) {
  const item = pkg?.items.find((i) => i.key === itemKey);
  if (!item) return { correct: false, score: 0, explanation: undefined };
  const res = checkAnswer(item, response as Parameters<typeof checkAnswer>[1]);
  return { ...res, explanation: item.explanation };
}

const progressKey = (userId: string, topicKey: string) => `${userId}:${topicKey}`;

// --- Tutor -----------------------------------------------------------------

/** Mock tutor: the contract's grounded answer, `[[key]]` markers turned into citations (like the server's parser). */
function tutorAnswer(question: string, topicKey: string, lang: Lang, conceptKey?: string, quote?: string, intent?: 'ask' | 'explain' | 'simpler' | 'example') {
  const pkg = packageByKey(topicKey);
  if (!pkg) return { text: '', cite: [] as string[], suggestions: [] as string[] };
  const a = groundedAnswer(pkg, lang, { question, conceptKey, quote, intent });
  const valid = new Set(pkg.concepts.map((c) => c.key));
  const cite = [...new Set([...a.text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]).filter((k) => valid.has(k)))];
  const text = a.text.replace(/\s?\[\[[^\]]+\]\]/g, '').trim();
  return { text, cite, suggestions: a.noAnswer ? suggestQuestions(pkg, lang, { conceptKey }) : [] };
}

/** Pool rule shared with the server: approved unless heavily reported, new until the first report. */
const servable = (g: AdminGenerated) => (g.status === 'approved' && g.bad < 3) || (g.status === 'new' && g.bad === 0);

// --- Search ------------------------------------------------------------------

function searchAll(q: string, lang: Lang) {
  const needle = q.toLowerCase();
  const hit = (v: Localized) => (['ky', 'ru', 'en'] as const).some((l) => v[l].toLowerCase().includes(needle));
  const items: EndpointResponse<'search'>['items'] = [];
  for (const pkg of PACKAGES) {
    if (hit(pkg.topic.title)) items.push({ kind: 'topic', key: pkg.topic.key, subjectKey: pkg.subject.key, title: t(pkg.topic.title, lang), snippet: t(pkg.topic.description, lang), score: 2 });
    for (const c of pkg.concepts) {
      if (hit(c.title)) items.push({ kind: 'concept', key: c.key, topicKey: pkg.topic.key, subjectKey: pkg.subject.key, title: t(c.title, lang), snippet: t(c.description, lang), score: 1 });
    }
  }
  return items;
}

// --- Thumbnails (stand-ins for build-time WebP renders) -------------------------

function thumbSvg(path: string): string {
  const pkg = PACKAGES.find((p) => p.topic.samples.some((s) => path.endsWith(s.thumb)) || path.endsWith(`${p.topic.key}.webp`));
  const hue = pkg?.subject.hue ?? 220;
  const n = (pkg?.topic.conceptKeys.length ?? 3) + 2;
  const circles = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return `<circle cx="${80 + Math.cos(a) * 34}" cy="${60 + Math.sin(a) * 26}" r="${10 + (i % 3) * 4}" fill="hsl(${(hue + i * 40) % 360} 65% 55%)"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><defs><radialGradient id="g"><stop offset="0" stop-color="hsl(${hue} 50% 30%)"/><stop offset="1" stop-color="hsl(${hue} 40% 12%)"/></radialGradient></defs><rect width="160" height="120" fill="url(#g)"/><circle cx="80" cy="60" r="48" fill="none" stroke="hsl(${hue} 70% 70%)" stroke-opacity=".5" stroke-width="2"/>${circles}</svg>`;
}

// ------------------------------------------------------------------------------

export const handlers: HttpHandler[] = [
  // v0.8.0 first: the support-session guard and the staff sign-in fall through when they do not apply.
  ...staffHandlers({ route, fail, meOf, tokenFor }),
  ...cabinetHandlers,
  ...registerHandlers({ route, fail, tokenFor }),
  route('health', () => ({ status: 'ok', version: 'mock', contract: '0.2.0' })),

  // Auth -------------------------------------------------------------------
  route('login', ({ body }) => {
    // v0.7.0: exactly one of `phone` (E.164, normalized by the schema) and `email`.
    const b = body as EndpointBody<'login'>;
    const u = mockDb.users.find((x) => (b.phone ? x.phone === b.phone : x.email === b.email?.toLowerCase()) && x.password === b.password);
    return u ? tokenFor(u) : fail('invalid_credentials');
  }),
  route('classCode', ({ body }) => {
    const code = (body as { code: string }).code;
    const c = mockDb.classes.find((x) => x.joinCode === code && x.joinCodeEnabled);
    if (!c) return fail('class_code_invalid');
    return {
      classId: c.id,
      className: c.name,
      students: mockDb.users.filter((u) => u.kind === 'student' && u.classId === c.id).map((u) => ({ id: u.id, displayName: u.displayName })),
    };
  }),
  route('studentLogin', ({ body }) => {
    const b = body as { classId: string; studentId: string; pin: string };
    const u = mockDb.users.find((x) => x.id === b.studentId && x.classId === b.classId);
    if (!u) return fail('invalid_credentials');
    if ((u.pinFailures ?? 0) >= 5) return fail('pin_locked', { retryAfter: 900 });
    if (u.pin !== b.pin) {
      u.pinFailures = (u.pinFailures ?? 0) + 1;
      return fail('invalid_credentials');
    }
    u.pinFailures = 0;
    return tokenFor(u);
  }),
  route('refresh', () => {
    const u = userById(mockDb.sessionUserId);
    return u ? tokenFor(u) : fail('unauthorized');
  }),
  route('logout', () => {
    mockDb.sessionUserId = null;
    return { ok: true as const };
  }),
  route('logoutAll', ({ user }) => {
    mockDb.sessionUserId = null;
    for (const [tok, id] of Object.entries(mockDb.tokens)) if (id === user?.id) delete mockDb.tokens[tok];
    return { ok: true as const };
  }),

  // Me -----------------------------------------------------------------------
  route('me', ({ user }) => meOf(user!)),
  route('mePatch', ({ user, body }) => {
    const { teaching, ...rest } = body as EndpointBody<'mePatch'>;
    if (teaching) {
      // Only a self-registered teacher (trial licence) changes what they teach; the trial follows.
      const trial = licensesOf(user).find((l) => l.trial);
      if (!trial) return fail('forbidden', { detail: 'not_self_registered' });
      trial.subjects = teaching.subjects;
      trial.grades = teaching.grades;
      user!.teaching = teaching;
    }
    const { schoolName, region, ...own } = rest;
    if (schoolName !== undefined || region !== undefined) {
      // v0.7.0: only a self-registered teacher's own school can be renamed here.
      const trial = licensesOf(user).find((l) => l.trial);
      if (!user!.selfRegistered || !trial) return fail('forbidden', { detail: 'not_own_school' });
      if (schoolName) {
        for (const l of mockDb.licenses) if (l.schoolId === trial.schoolId) l.schoolName = schoolName;
        user!.schoolNamed = true;
      }
    }
    Object.assign(user!, own);
    return meOf(user!);
  }),

  // Catalog --------------------------------------------------------------------
  route('catalog', () => buildCatalog()),
  route('subjects', () => {
    const c = buildCatalog();
    return { groups: c.groups, subjects: c.subjects };
  }),
  route('subjectCourses', ({ params }) => ({ items: buildCatalog().courses.filter((c) => c.subjectKey === params.key) })),
  route('course', ({ params }) => {
    const cat = buildCatalog();
    const course = cat.courses.find((c) => c.key === params.key);
    if (!course) return fail('not_found');
    const units = cat.units.filter((u) => u.courseKey === course.key);
    const unitKeys = new Set(units.map((u) => u.key));
    return {
      course,
      units,
      objectives: PACKAGES.flatMap((p) => p.objectives ?? []).filter((o) => unitKeys.has(o.unitKey)),
      topics: cat.topics.filter((t) => unitKeys.has(t.unitKey)),
    };
  }),
  route('topicManifest', ({ params }) => {
    const pkg = packageByKey(params.key);
    if (!pkg) return fail('not_found');
    return {
      manifest: pkg.manifest,
      packageUrl: `${API_PREFIX}/packages/${encodeURIComponent(pkg.topic.key)}`,
      filesBaseUrl: `${FILES_BASE}/${pkg.topic.key}/`,
    };
  }),
  route('topicPackage', ({ params }) => packageByKey(params.key) ?? fail('not_found')),
  // v0.6.0: the topic's ready-made presentation — a small placeholder file with the server-style Content-Disposition.
  route('topicDeck', ({ params, url, req }) => {
    const pkg = packageByKey(params.key);
    if (!pkg) return fail('not_found');
    const q = TopicDeckQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!q.success) return fail('validation_failed', { issues: q.error.issues.map((i) => ({ path: i.path, message: i.message })) });
    const lang = q.data.lang ?? langOf(req);
    const { format } = q.data;
    const type = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    const magic = format === 'pdf' ? '%PDF-1.4' : 'PK\u0003\u0004';
    const name = `${t(pkg.topic.title, lang)}.${format}`;
    return new HttpResponse(new Blob([`${magic} bilig mock deck ${pkg.topic.key} ${lang}\n`], { type }), {
      headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="deck.${format}"; filename*=UTF-8''${encodeURIComponent(name)}` },
    });
  }),
  route('textbooks', ({ url }) => {
    const grade = Number(url.searchParams.get('grade')) || undefined;
    const subjectKey = url.searchParams.get('subjectKey');
    return {
      items: TEXTBOOKS.filter((tb) => (!grade || tb.grade === grade) && (!subjectKey || textbookSubjects(tb).includes(subjectKey))),
    };
  }),
  route('textbook', ({ params }) => {
    const textbook = TEXTBOOKS.find((tb) => tb.key === params.key);
    if (!textbook) return fail('not_found');
    const keys = textbookTopicKeys(textbook);
    const topics = buildCatalog().topics.filter((tp) => keys.includes(tp.key));
    return { textbook, topics: keys.map((k) => topics.find((tp) => tp.key === k)!).filter(Boolean) };
  }),
  route('search', ({ url, req }) => {
    const q = url.searchParams.get('q') ?? '';
    const lang = (url.searchParams.get('lang') as Lang | null) ?? langOf(req);
    return { items: q.trim() ? searchAll(q, lang).slice(0, Number(url.searchParams.get('limit') ?? 10)) : [] };
  }),

  // Learning --------------------------------------------------------------------
  route('progressGet', ({ user, params }) => {
    const p = mockDb.progress[progressKey(user!.id, params.topicKey)];
    return p ?? { topicKey: params.topicKey, visitedConcepts: [], completedActivities: [], updatedAt: now() };
  }),
  route('progressPut', ({ user, params, body }) => {
    const k = progressKey(user!.id, params.topicKey);
    const prev = mockDb.progress[k] ?? { topicKey: params.topicKey, visitedConcepts: [], completedActivities: [], updatedAt: now() };
    const merged = mergeProgressState(prev, body as Omit<Progress, 'topicKey'>);
    const next: Progress = { topicKey: params.topicKey, visitedConcepts: merged.visitedConcepts, completedActivities: merged.completedActivities, updatedAt: merged.updatedAt ?? now() };
    mockDb.progress[k] = next;
    return next;
  }),
  route('attemptCreate', ({ user, body }) => {
    const b = body as { clientId: string; topicKey: string; topicVersion: string; assignmentId?: string; seed: string };
    const existing = mockDb.attempts.find((a) => a.clientId === b.clientId);
    if (existing) return attemptDto(existing);
    const pkg = packageByKey(b.topicKey);
    const quiz = pkg?.topic.activities.quiz;
    if (!pkg || !quiz) return fail('not_found');
    const a: MockAttempt = {
      id: newId(),
      clientId: b.clientId,
      topicKey: b.topicKey,
      topicVersion: b.topicVersion,
      ...(b.assignmentId ? { assignmentId: b.assignmentId } : {}),
      itemKeys: sampleItems(quiz.itemKeys, quiz.sampleSize, b.seed),
      startedAt: now(),
      userId: user!.id,
      answers: [],
    };
    mockDb.attempts.push(a);
    return attemptDto(a);
  }),
  route('attemptAnswer', ({ params, body }) => {
    const a = mockDb.attempts.find((x) => x.id === params.id);
    if (!a) return fail('not_found');
    const b = body as { itemKey: string; response: unknown; timeMs: number };
    const g = gradeAnswer(packageByKey(a.topicKey), b.itemKey, b.response);
    a.answers = [...a.answers.filter((x) => x.itemKey !== b.itemKey), { itemKey: b.itemKey, response: b.response, correct: g.correct, score: g.score, timeMs: b.timeMs }];
    return { itemKey: b.itemKey, correct: g.correct, score: g.score, ...(g.explanation ? { explanation: g.explanation } : {}) };
  }),
  route('attemptFinish', ({ params }) => {
    const a = mockDb.attempts.find((x) => x.id === params.id);
    if (!a) return fail('not_found');
    a.finishedAt ??= now();
    a.score = scoreAttempt(a);
    return {
      attempt: attemptDto(a),
      correctCount: a.answers.filter((x) => x.correct).length,
      total: a.itemKeys.length,
      answers: a.answers.map((x) => ({ itemKey: x.itemKey, correct: x.correct, score: x.score })),
    };
  }),
  route('sync', ({ req, user, body }) => {
    const key = req.headers.get(HEADERS.idempotencyKey)!;
    const raw = JSON.stringify(body);
    const prior = mockDb.idempotency[key];
    if (prior) return prior.body === raw ? (prior.response as EndpointResponse<'sync'>) : fail('idempotency_conflict');
    const b = body as SyncRequest;
    const attempts = b.attempts.map((oa) => {
      const dup = mockDb.attempts.find((a) => a.clientId === oa.clientId);
      if (dup) return { clientId: oa.clientId, status: 'duplicate' as const, id: dup.id, score: dup.score };
      const pkg = packageByKey(oa.topicKey);
      if (!pkg) return { clientId: oa.clientId, status: 'rejected' as const, reason: 'unknown_topic' };
      const a: MockAttempt = {
        id: newId(),
        clientId: oa.clientId,
        topicKey: oa.topicKey,
        topicVersion: oa.topicVersion,
        ...(oa.assignmentId ? { assignmentId: oa.assignmentId } : {}),
        itemKeys: oa.itemKeys,
        startedAt: oa.startedAt,
        finishedAt: oa.finishedAt ?? now(),
        userId: user!.id,
        answers: oa.answers.map((x) => {
          const g = gradeAnswer(pkg, x.itemKey, x.response);
          return { itemKey: x.itemKey, response: x.response, correct: g.correct, score: g.score, timeMs: x.timeMs };
        }),
      };
      a.score = scoreAttempt(a);
      mockDb.attempts.push(a);
      return { clientId: oa.clientId, status: 'created' as const, id: a.id, score: a.score };
    });
    const progress = b.progress.map((p) => {
      const k = progressKey(user!.id, p.topicKey);
      const merged = mergeProgressState(mockDb.progress[k] ?? { visitedConcepts: [], completedActivities: [] }, p);
      const next: Progress = { topicKey: p.topicKey, visitedConcepts: merged.visitedConcepts, completedActivities: merged.completedActivities, updatedAt: merged.updatedAt ?? now() };
      mockDb.progress[k] = next;
      return next;
    });
    const response: EndpointResponse<'sync'> = { attempts, progress, events: { accepted: b.events.length, duplicates: 0 } };
    mockDb.idempotency[key] = { body: raw, response };
    mockDb.syncLog.push({ key, attempts: b.attempts.length });
    return response;
  }),
  route('events', ({ body }) => ({ accepted: (body as { events: unknown[] }).events.length, duplicates: 0 })),

  // Classes --------------------------------------------------------------------
  route('classList', ({ url, user }) => {
    const schools = schoolIdsOf(user);
    return page(mockDb.classes.filter((c) => !schools.length || schools.includes(c.schoolId)).map(classWithCount), url);
  }),
  route('classGet', ({ params }) => {
    const c = mockDb.classes.find((x) => x.id === params.id);
    return c ? classWithCount(c) : fail('not_found');
  }),
  route('classCreate', ({ body, user }) => {
    const b = body as EndpointBody<'classCreate'>;
    const schoolId = b.schoolId ?? schoolIdsOf(user)[0] ?? mockDb.classes[0]?.schoolId ?? newId();
    // v0.8.0: subjectKeys win over subjectKey; the trial follows the class.
    const keys = b.subjectKeys ?? (b.subjectKey ? [b.subjectKey] : []);
    const bad = admitSubjects(user, schoolId, b.grade, keys);
    if (bad) return fail('validation_failed', { issues: [{ path: ['subjectKeys'], message: 'not licensed' }] });
    const code = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X').replace(/[^A-Z0-9]/g, 'X');
    const c = { id: newId(), schoolId, name: b.name, grade: b.grade, joinCode: code, joinCodeEnabled: true, ...(keys.length ? { subjectKey: keys[0], subjectKeys: keys } : {}) };
    mockDb.classes.push(c);
    return classWithCount(c);
  }),
  route('classPatch', ({ params, body, user }) => {
    const c = mockDb.classes.find((x) => x.id === params.id);
    if (!c) return fail('not_found');
    const b = { ...(body as EndpointBody<'classPatch'>) };
    if (b.subjectKeys) b.subjectKey = b.subjectKeys[0] ?? null;
    else if (b.subjectKey !== undefined) b.subjectKeys = b.subjectKey ? [b.subjectKey] : [];
    if (b.subjectKeys && admitSubjects(user, c.schoolId, b.grade ?? c.grade, b.subjectKeys)) return fail('validation_failed', { issues: [{ path: ['subjectKeys'], message: 'not licensed' }] });
    Object.assign(c, b);
    return classWithCount(c);
  }),
  route('classJoinCode', ({ params }) => {
    const c = mockDb.classes.find((x) => x.id === params.id);
    if (!c) return fail('not_found');
    c.joinCode = Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, 'Z').padEnd(6, 'Z');
    return { joinCode: c.joinCode };
  }),
  route('classStudentsAdd', ({ params, body }) => {
    const c = mockDb.classes.find((x) => x.id === params.id);
    if (!c) return fail('not_found');
    const b = body as { students?: { displayName: string }[]; csv?: string };
    const names = b.students
      ? b.students.map((s) => s.displayName)
      : (b.csv ?? '')
          .split(/\r?\n/)
          .map((l) => l.split(/[;,]/)[0].trim())
          .filter((l, i) => l && !(i === 0 && /^(name|имя|аты)/i.test(l)));
    const items = names.map((displayName) => {
      const u: MockUser = {
        id: newId(),
        kind: 'student',
        displayName,
        pin: randomPin(),
        locale: 'ky',
        grants: [{ role: 'student', scope: 'class', scopeId: c.id }],
        classId: c.id,
        hasConsent: false,
      };
      mockDb.users.push(u);
      return { student: studentDto(u), pin: u.pin! };
    });
    return { items };
  }),
  route('studentResetPin', ({ params }) => {
    const u = mockDb.users.find((x) => x.id === params.id && x.kind === 'student');
    if (!u) return fail('not_found');
    u.pin = randomPin();
    u.pinFailures = 0;
    return { pin: u.pin };
  }),
  route('assignmentList', ({ params, url }) =>
    page(
      mockDb.assignments.filter((a) => a.classId === params.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      url,
    ),
  ),
  route('assignmentCreate', ({ params, body, user }) => {
    const a = { ...(body as { topicKey: string; activities: ('tour' | 'quiz' | 'process' | 'comparison')[]; dueAt?: string }), id: newId(), classId: params.id, createdBy: user!.id, createdAt: now() };
    mockDb.assignments.push(a);
    return a;
  }),
  route('assignmentResults', ({ params }) => {
    const asg = mockDb.assignments.find((a) => a.id === params.id);
    if (!asg) return fail('not_found');
    const students = mockDb.users.filter((u) => u.kind === 'student' && u.classId === asg.classId);
    const attempts = mockDb.attempts.filter((a) => a.assignmentId === asg.id);
    const rows = students.map((s) => {
      const best = attempts.filter((a) => a.userId === s.id).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      return {
        studentId: s.id,
        displayName: s.displayName,
        status: best?.finishedAt ? ('done' as const) : best ? ('in_progress' as const) : ('not_started' as const),
        ...(best?.score !== undefined ? { score: best.score } : {}),
        ...(best?.finishedAt ? { finishedAt: best.finishedAt } : {}),
      };
    });
    const done = rows.filter((r) => r.score !== undefined);
    const byItem = new Map<string, { n: number; ok: number }>();
    for (const a of attempts) for (const x of a.answers) {
      const e = byItem.get(x.itemKey) ?? { n: 0, ok: 0 };
      e.n += 1;
      e.ok += x.correct ? 1 : 0;
      byItem.set(x.itemKey, e);
    }
    return {
      assignmentId: asg.id,
      students: rows,
      averageScore: done.length ? done.reduce((n, r) => n + (r.score ?? 0), 0) / done.length : null,
      hardestItems: [...byItem.entries()].map(([itemKey, e]) => ({ itemKey, correctRate: e.ok / e.n })).sort((a, b) => a.correctRate - b.correctRate),
    };
  }),

  // Tutor (SSE) -----------------------------------------------------------------
  route('tutorAsk', ({ body, req }) => {
    if (mockDb.flags.tutorDown) return fail('tutor_unavailable');
    const b = body as EndpointBody<'tutorAsk'>;
    const { text, cite, suggestions } = tutorAnswer(b.question, b.topicKey, b.lang, b.conceptKey ?? b.context?.quote?.conceptKey, b.context?.quote?.text, b.intent);
    if (!req.headers.get('Accept')?.includes('text/event-stream')) {
      return { answer: text, citations: cite, ...(suggestions.length ? { suggestions } : {}) };
    }
    const enc = new TextEncoder();
    const words = text.split(/(\s+)/);
    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        for (const w of words) {
          if (w) ctrl.enqueue(enc.encode(encodeSseEvent({ type: 'token', text: w })));
          if (mockDb.flags.latencyMs) await delay(10);
        }
        for (const k of cite) ctrl.enqueue(enc.encode(encodeSseEvent({ type: 'citation', conceptKey: k })));
        if (suggestions.length) ctrl.enqueue(enc.encode(encodeSseEvent({ type: 'suggestions', items: suggestions })));
        ctrl.enqueue(enc.encode(encodeSseEvent({ type: 'done', threadId: newId() })));
        ctrl.close();
      },
    });
    return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  }),

  // v0.4.0: generated examples / questions — pool first, then the grounded generator.
  route('tutorGenerate', ({ body }) => {
    if (mockDb.flags.tutorDown) return fail('tutor_unavailable');
    const b = body as z.output<(typeof ENDPOINTS)['tutorGenerate']['body']>;
    const pkg = packageByKey(b.topicKey);
    if (!pkg) return fail('not_found');
    const pool = (mockDb.generated ??= []).filter((g) => g.topicKey === b.topicKey && (g.conceptKey ?? null) === (b.conceptKey ?? null) && g.kind === b.kind && g.lang === b.lang);
    const picked = pool.filter((g) => servable(g) && !b.exclude.includes(g.id)).slice(0, b.count);
    const need = b.count - picked.length;
    const fresh: AdminGenerated[] = [];
    if (need > 0) {
      const avoid = pool.map((g) => draftSignature(g.quiz?.prompt ?? g.example?.text ?? ''));
      const r = groundedGenerate(pkg, b.lang, b.kind, { conceptKey: b.conceptKey, count: need, avoid });
      const base = { kind: b.kind, topicKey: b.topicKey, ...(b.conceptKey ? { conceptKey: b.conceptKey } : {}), lang: b.lang, status: 'new' as const, good: 0, bad: 0, reasons: {}, served: 0, createdAt: now() };
      for (const q of r.quiz) {
        const id = newId();
        fresh.push({ ...base, id, quiz: { id, ...q } });
      }
      for (const e of r.examples) {
        const id = newId();
        fresh.push({ ...base, id, example: { id, ...e } });
      }
      mockDb.generated.push(...fresh);
    }
    const out = [...picked, ...fresh];
    for (const g of out) g.served++;
    const reviewed = (g: AdminGenerated) => (g.status === 'approved' ? { reviewed: true } : {});
    return {
      kind: b.kind,
      lang: b.lang,
      examples: b.kind === 'quiz' ? [] : out.map((g) => ({ ...g.example!, ...reviewed(g) })),
      quiz: b.kind === 'quiz' ? out.map((g) => ({ ...g.quiz!, ...reviewed(g) })) : [],
      exhausted: out.length < b.count,
    };
  }),
  route('tutorGeneratedFeedback', ({ body, params }) => {
    const g = (mockDb.generated ??= []).find((x) => x.id === params.id);
    if (!g) return fail('not_found');
    const v = body as EndpointBody<'tutorGeneratedFeedback'>;
    if (v.vote === 'good') g.good++;
    else {
      g.bad++;
      g.reasons = { ...g.reasons, [v.reason]: (g.reasons[v.reason] ?? 0) + 1 };
    }
    return { ok: true as const };
  }),
  route('adminGeneratedList', ({ url }) => {
    const q = Object.fromEntries(url.searchParams);
    const rows = (mockDb.generated ??= []).filter(
      (g) => (!q.status || g.status === q.status) && (!q.kind || g.kind === q.kind) && (!q.topicKey || g.topicKey === q.topicKey) && (!q.reported || (g.bad > 0) === (q.reported === 'true')),
    );
    return page(rows, url);
  }),
  route('adminGeneratedPatch', ({ body, params, user }) => {
    const g = (mockDb.generated ??= []).find((x) => x.id === params.id);
    if (!g) return fail('not_found');
    const p = body as EndpointBody<'adminGeneratedPatch'>;
    if (p.status === 'promoted' && !p.promotedTo) return fail('validation_failed');
    g.status = p.status;
    if (p.status === 'new') {
      delete g.reviewedAt;
      delete g.reviewedBy;
    } else {
      g.reviewedAt = now();
      g.reviewedBy = user!.id;
    }
    if (p.promotedTo) g.promotedTo = p.promotedTo;
    else delete g.promotedTo;
    return g;
  }),

  // Decks ---------------------------------------------------------------------
  route('presentationList', ({ user, url }) =>
    page(
      mockDb.presentations.filter((p) => p.ownerId === user!.id).map(({ slides: _s, ...rest }) => rest),
      url,
    ),
  ),
  route('presentationCreate', ({ user, body }) => {
    const b = body as { topicKey: string; title: string; lang: Lang; slides?: EndpointResponse<'presentationGet'>['slides'] };
    const p = { id: newId(), ownerId: user!.id, topicKey: b.topicKey, title: b.title, lang: b.lang, slides: b.slides ?? [], updatedAt: now(), version: 1 };
    mockDb.presentations.push(p);
    return p;
  }),
  route('presentationGet', ({ params, user }) => mockDb.presentations.find((p) => p.id === params.id && p.ownerId === user!.id) ?? fail('not_found')),
  route('presentationPatch', ({ params, body, req }) => {
    const p = mockDb.presentations.find((x) => x.id === params.id);
    if (!p) return fail('not_found');
    const ifMatch = req.headers.get(HEADERS.ifMatch);
    const b = body as { title?: string; slides?: typeof p.slides; version: number };
    if (String(p.version) !== (ifMatch ?? String(b.version))) return fail('version_mismatch');
    if (b.title) p.title = b.title;
    if (b.slides) p.slides = b.slides;
    p.version += 1;
    p.updatedAt = now();
    return p;
  }),
  route('presentationExport', () => ({ jobId: newId(), status: 'queued' as const })),
  route('snapshotCreate', ({ body }) => {
    const b = body as { topicKey: string; topicVersion: string; image: string; sceneState: EndpointResponse<'snapshotCreate'>['sceneState'] };
    const s = { id: newId(), topicKey: b.topicKey, topicVersion: b.topicVersion, imageUrl: b.image, sceneState: b.sceneState, createdAt: now() };
    mockDb.snapshots.push(s);
    return s;
  }),

  // Extensions (CONTRACT_REQUESTS.md) ---------------------------------------------
  route('meAssignments', ({ user }) => {
    const classId = user!.classId ?? CLASS_ID;
    const cls = mockDb.classes.find((c) => c.id === classId);
    const items = mockDb.assignments
      .filter((a) => a.classId === classId)
      .map((a) => {
        const mine = mockDb.attempts.filter((x) => x.assignmentId === a.id && x.userId === user!.id);
        const done = mine.filter((x) => x.finishedAt);
        return {
          ...a,
          className: cls?.name ?? '',
          status: done.length ? ('done' as const) : mine.length ? ('in_progress' as const) : ('not_started' as const),
          ...(done.length ? { score: Math.max(...done.map((x) => x.score ?? 0)) } : {}),
        };
      });
    return { items };
  }),
  route('classStudents', ({ params, url }) =>
    page(
      mockDb.users.filter((u) => u.kind === 'student' && u.classId === params.id).map(studentDto),
      url,
    ),
  ),
  route('meSessionRevoke', () => ({ ok: true as const })),

  // v0.5.0 КТП → сабак планы
  ...ktpHandlers({ route, fail }),
  // v0.8.0 the teacher's home: a class's subjects
  ...teacherHandlers({ route, fail }),

  // CDN stand-in for package files (thumbnails) ---------------------------------------
  http.get(`${FILES_BASE}/*`, ({ request }) => {
    if (mockDb.flags.offline) return HttpResponse.error();
    const path = new URL(request.url).pathname;
    if (/\.(webp|png|jpg)$/.test(path)) {
      return new HttpResponse(thumbSvg(path), { headers: { 'Content-Type': 'image/svg+xml' } });
    }
    return new HttpResponse(null, { status: 404 });
  }),
];
