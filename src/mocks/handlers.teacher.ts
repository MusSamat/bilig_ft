/**
 * DEV/TEST-ONLY MSW pieces for contract 0.8.0 §6 «the teacher's cabinet after
 * sign-in»: the profile status `/me` reports (`setup` + `profileStatus`), a
 * class's subjects (`subjectKeys`, the trial following the classes) and
 * GET /classes/:id/subjects with the КТП status, the next lesson and progress
 * — from the teacher's plan whose subject and class link match.
 */
import { formatKgPhone, type ClassSubject, type EndpointResponse } from '@bilig/content-model/api';
import { licensesOf, mockDb, schoolIdsOf, type MockUser } from './db';
import type { route as routeFn, fail as failFn } from './handlers';

type Deps = { route: typeof routeFn; fail: typeof failFn };
type MockClass = (typeof mockDb.classes)[number];

const isTeacher = (u: MockUser): boolean => u.grants.some((g) => g.role === 'teacher');

/** Every subject of a class (`subjectKeys`, or the single 0.6.0 `subjectKey`). */
export const subjectsOfClass = (c: Pick<MockClass, 'subjectKey' | 'subjectKeys'>): string[] => c.subjectKeys ?? (c.subjectKey ? [c.subjectKey] : []);

export const ownClasses = (u: MockUser | undefined): MockClass[] => {
  const schools = schoolIdsOf(u);
  return mockDb.classes.filter((c) => schools.includes(c.schoolId));
};

/** `/me` fields of a teacher: what is filled in and the status the server computes from it. */
export function profileOf(u: MockUser): Pick<EndpointResponse<'me'>, 'setup' | 'profileStatus' | 'teachingLang'> {
  if (u.kind !== 'adult' || !isTeacher(u)) return {};
  const self = !!u.selfRegistered;
  const setup = {
    name: self ? !!u.phone && u.displayName !== formatKgPhone(u.phone) : true,
    school: self ? !!u.schoolNamed : true,
    teaching: self ? !!u.teaching : true,
    teachingLang: !!u.teachingLang,
    classWithSubject: ownClasses(u).some((c) => subjectsOfClass(c).length > 0),
  };
  const complete = setup.name && setup.school && setup.teachingLang && setup.classWithSubject;
  return { setup, profileStatus: complete ? 'complete' : 'incomplete', ...(u.teachingLang ? { teachingLang: u.teachingLang } : {}) };
}

/**
 * The subjects a class may get: a self-registered teacher's trial follows their
 * classes (grade and subjects are added to it); a school licence must already
 * cover them. Returns the unlicensed subject, if any.
 */
export function admitSubjects(user: MockUser | undefined, schoolId: string, grade: number, keys: string[]): string | null {
  const lic = licensesOf(user).find((l) => l.schoolId === schoolId) ?? mockDb.licenses.find((l) => l.schoolId === schoolId);
  if (!lic) return keys[0] ?? null;
  if (lic.trial) {
    for (const k of keys) if (!lic.subjects.includes(k)) lic.subjects.push(k);
    if (keys.length && !lic.grades.includes(grade)) lic.grades = [...lic.grades, grade].sort((a, b) => a - b);
    return null;
  }
  return keys.find((k) => !lic.subjects.includes(k)) ?? null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function classSubjectsOf(user: MockUser, c: MockClass): ClassSubject[] {
  const now = today();
  return subjectsOfClass(c).map((subjectKey) => {
    const plan = mockDb.ktp.find((p) => p.ownerId === user.id && p.subjectKey === subjectKey && Object.values(p.classLinks ?? {}).includes(c.id));
    const col = plan && Object.entries(plan.classLinks ?? {}).find(([, id]) => id === c.id)?.[0];
    if (!plan || !col) return { subjectKey, ktp: { status: 'none', planId: null, errors: 0, warnings: 0 }, nextLesson: null, progress: { done: 0, total: 0 } };
    const next = plan.rows.find((r) => (r.dates[col] ?? '') >= now);
    return {
      subjectKey,
      ktp: {
        status: 'parsed',
        planId: plan.id,
        errors: plan.issues.filter((i) => i.severity === 'error').length,
        warnings: plan.issues.filter((i) => i.severity === 'warning').length,
      },
      nextLesson: next ? { index: next.index, title: next.title, date: next.dates[col]!, topicKey: next.topicKey ?? null } : null,
      progress: { done: plan.rows.filter((r) => (r.dates[col] ?? '9999') < now).length, total: plan.rows.length },
    };
  });
}

export function teacherHandlers({ route, fail }: Deps) {
  return [
    route('classSubjects', ({ params, user }) => {
      const c = ownClasses(user).find((x) => x.id === params.id);
      return c ? { items: classSubjectsOf(user!, c) } : fail('not_found');
    }),
  ];
}
