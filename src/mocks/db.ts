/**
 * DEV/TEST-ONLY in-memory state of the mock API (MSW). Persisted to
 * sessionStorage in the browser so a reload keeps the mock session, like a
 * refresh cookie would. Credentials below exist only in the mock.
 */
import { grantedPermissions, type Principal, type RoleGrant } from '@bilig/permissions';
import type { Lang } from '@bilig/content-model';
import type {
  AdminGenerated,
  Assignment,
  Attempt,
  Presentation,
  Progress,
  SchoolClass,
  SnapshotResponse,
} from '@bilig/content-model/api';
import { buildKtpPlan, type MockKtpPlan } from './ktp';

export interface MockUser {
  id: string;
  kind: 'adult' | 'student';
  displayName: string;
  email?: string;
  password?: string;
  pin?: string;
  locale: Lang;
  grants: RoleGrant[];
  classId?: string;
  hasConsent?: boolean;
  pinFailures?: number;
  /** v0.6.0: what a self-registered teacher teaches. */
  teaching?: { subjects: string[]; grades: number[] };
  /** v0.7.0: the verified WhatsApp number (E.164). */
  phone?: string;
  /** v0.7.0: registered by phone; `/me` reports the setup checklist. */
  selfRegistered?: boolean;
  /** v0.7.0: the teacher has named their own school in the cabinet. */
  schoolNamed?: boolean;
  /** v0.8.0: the language the teacher teaches in. */
  teachingLang?: 'ky' | 'ru' | 'uz' | 'en';
}

/** v0.7.0: a one-time code sent to a number's WhatsApp (key `${purpose}:${phone}`). */
export interface MockOtp {
  phone: string;
  purpose: 'register' | 'reset';
  /** register: the number already has an account (it got «you already have an account», no code). reset: unknown number. */
  noAccountMatch: boolean;
  attempts: number;
  sentAt: number;
  expiresAt: number;
}

/** v0.7.0: a verified number's single-use token for register/complete or password/set. */
export interface MockOtpToken {
  phone: string;
  purpose: 'register' | 'reset';
  expiresAt: number;
}

/** v0.6.0: a school's licence (trial for self-registered teachers). */
export interface MockLicense {
  schoolId: string;
  schoolName: string;
  subjects: string[];
  grades: number[];
  startsAt: string;
  endsAt: string;
  trial: boolean;
}

/** v0.6.0: a pending self-registration waiting for its e-mail code. */
export interface MockRegistration {
  email: string;
  displayName: string;
  password: string;
  locale: Lang;
  teaching?: { subjects: string[]; grades: number[] };
  schoolName?: string;
  region?: string;
  /** The address already has an account: it got a «you already have an account» mail, no code. */
  existing: boolean;
  /** Wrong tries for the current code (5 burn it). */
  attempts: number;
  sentAt: number;
  expiresAt: number;
}

export interface MockAnswer {
  itemKey: string;
  response: unknown;
  correct: boolean;
  score: number;
  timeMs: number;
}

export interface MockAttempt extends Attempt {
  userId: string;
  answers: MockAnswer[];
}

export interface MockState {
  users: MockUser[];
  classes: Omit<SchoolClass, 'studentCount'>[];
  assignments: Assignment[];
  attempts: MockAttempt[];
  progress: Record<string, Progress>; // `${userId}:${topicKey}`
  presentations: Presentation[];
  snapshots: SnapshotResponse[];
  tokens: Record<string, string>; // token → userId
  /** The refresh cookie: who is signed in on this browser. */
  sessionUserId: string | null;
  idempotency: Record<string, { body: string; response: unknown }>;
  /** Every POST /sync batch received (for e2e assertions). */
  syncLog: { key: string; attempts: number }[];
  flags: { offline: boolean; tutorDown: boolean; latencyMs: number };
  /** v0.4.0: generated examples / questions (pool + review state). */
  generated: AdminGenerated[];
  /** v0.5.0: teachers' КТП (owner-only). */
  ktp: MockKtpPlan[];
  /** v0.6.0: licences per school; pending registrations by e-mail. */
  licenses: MockLicense[];
  registrations: Record<string, MockRegistration>;
  /** v0.7.0: WhatsApp codes and verified-number tokens. */
  otps: Record<string, MockOtp>;
  otpTokens: Record<string, MockOtpToken>;
}

export const SCHOOL_ID = '0192a000-0000-7000-8000-000000000001';
export const CLASS_ID = '0192a000-0000-7000-8000-0000000000c1';
export const TEACHER_ID = '0192a000-0000-7000-8000-0000000000a1';
export const KTP_ID = '0192a000-0000-7000-8000-0000000000f1';
export const CLASS_CODE = 'ABC123';
export const STUDENT_PIN = '1234';
export const TEACHER_EMAIL = 'teacher@bilig.kg';
export const TEACHER_PASSWORD = 'bilig-teacher-2026';
/** v0.7.0: the same mock teacher also signs in with this WhatsApp number (+996 555 00 00 01). */
export const TEACHER_PHONE = '+996555000001';
/** The mock's fixed one-time code, e-mail (v0.6.0) and WhatsApp (v0.7.0), like the server's AUTH_FIXED_OTP. Never shown in the UI. */
export const REGISTER_CODE = '012345';
export const SCHOOL_NAME = 'Бишкек ш., №5 мектеп-гимназия';
/**
 * v0.7.0 phone-registered teachers (password as the e-mail teacher's):
 * FRESH just registered — name, school and teaching still to fill (setup all
 * false, trial with no subjects); READY finished the setup.
 */
export const FRESH_TEACHER_ID = '0192a000-0000-7000-8000-0000000000a2';
export const FRESH_PHONE = '+996555123456';
export const FRESH_SCHOOL_ID = '0192a000-0000-7000-8000-000000000002';
export const READY_TEACHER_ID = '0192a000-0000-7000-8000-0000000000a3';
export const READY_PHONE = '+996700987654';
export const READY_SCHOOL_ID = '0192a000-0000-7000-8000-000000000003';
export const TRIAL_DAYS = 30;
/**
 * v0.8.0: READY's classes as typed («8Б», «8-В», «9 А») with their subjects, and
 * READY's algebra КТП: column 8б is matched to «8Б» by name, 8в is not linked
 * («8-В» differs by the hyphen), so 8-В's algebra shows «no КТП» until linked.
 * HALF named themself and their school but has no teaching language or class yet.
 */
export const READY_8B_ID = '0192a000-0000-7000-8000-0000000000c2';
export const READY_8V_ID = '0192a000-0000-7000-8000-0000000000c3';
export const READY_9A_ID = '0192a000-0000-7000-8000-0000000000c4';
export const READY_KTP_ID = '0192a000-0000-7000-8000-0000000000f2';
export const HALF_TEACHER_ID = '0192a000-0000-7000-8000-0000000000a4';
export const HALF_PHONE = '+996700111222';
export const HALF_SCHOOL_ID = '0192a000-0000-7000-8000-000000000004';

const studentId = (n: number) => `0192a000-0000-7000-8000-0000000005${String(n).padStart(2, '0')}`;
const STUDENT_NAMES = ['Айбек Т.', 'Нургуль А.', 'Мирлан К.', 'Айпери С.', 'Бектур Ж.'];

function seed(): MockState {
  const teacher: MockUser = {
    id: TEACHER_ID,
    kind: 'adult',
    displayName: 'Гүлнара Асанова',
    email: TEACHER_EMAIL,
    phone: TEACHER_PHONE,
    password: TEACHER_PASSWORD,
    locale: 'ky',
    grants: [{ role: 'teacher', scope: 'school', scopeId: SCHOOL_ID }],
    teachingLang: 'ky',
  };
  const fresh: MockUser = {
    id: FRESH_TEACHER_ID,
    kind: 'adult',
    displayName: '+996 555 12 34 56',
    phone: FRESH_PHONE,
    password: TEACHER_PASSWORD,
    locale: 'ky',
    grants: [{ role: 'teacher', scope: 'school', scopeId: FRESH_SCHOOL_ID }],
    selfRegistered: true,
  };
  const ready: MockUser = {
    id: READY_TEACHER_ID,
    kind: 'adult',
    displayName: 'Айгүл Осмонова',
    phone: READY_PHONE,
    password: TEACHER_PASSWORD,
    locale: 'ky',
    grants: [{ role: 'teacher', scope: 'school', scopeId: READY_SCHOOL_ID }],
    teaching: { subjects: ['math', 'phys', 'chem'], grades: [8, 9] },
    selfRegistered: true,
    schoolNamed: true,
    teachingLang: 'ky',
  };
  const half: MockUser = {
    id: HALF_TEACHER_ID,
    kind: 'adult',
    displayName: 'Бакыт Асанов',
    phone: HALF_PHONE,
    password: TEACHER_PASSWORD,
    locale: 'ky',
    grants: [{ role: 'teacher', scope: 'school', scopeId: HALF_SCHOOL_ID }],
    selfRegistered: true,
    schoolNamed: true,
  };
  const trial = (schoolId: string, schoolName: string, subjects: string[], grades: number[], usedDays: number): MockLicense => ({
    schoolId,
    schoolName,
    subjects,
    grades,
    startsAt: new Date(Date.now() - usedDays * 86400_000).toISOString(),
    endsAt: new Date(Date.now() + (TRIAL_DAYS - usedDays) * 86400_000).toISOString(),
    trial: true,
  });
  const students: MockUser[] = STUDENT_NAMES.map((displayName, i) => ({
    id: studentId(i + 1),
    kind: 'student',
    displayName,
    pin: STUDENT_PIN,
    locale: 'ky',
    grants: [{ role: 'student', scope: 'class', scopeId: CLASS_ID }],
    classId: CLASS_ID,
    hasConsent: true,
  }));
  const readyStudents: MockUser[] = ['Элнура К.', 'Тилек М.', 'Аруузат Ж.'].map((displayName, i) => ({
    id: `0192a000-0000-7000-8000-0000000006${String(i + 1).padStart(2, '0')}`,
    kind: 'student',
    displayName,
    pin: STUDENT_PIN,
    locale: 'ky',
    grants: [{ role: 'student', scope: 'class', scopeId: READY_8B_ID }],
    classId: READY_8B_ID,
    hasConsent: true,
  }));
  const readyKtp = buildKtpPlan(READY_KTP_ID, READY_TEACHER_ID, 'КТП алгебра 8-класс.docx', new Date(Date.now() - 5 * 86400_000).toISOString());
  readyKtp.classLinks = { '8б': READY_8B_ID, '8в': null };
  // A topic linked to the lesson of 20 October (the «next lesson» on the demo day).
  const linked = readyKtp.rows.find((r) => r.index === 22);
  if (linked) linked.topicKey = 'pythagorean-theorem';
  const due = new Date(Date.now() + 5 * 86400_000).toISOString();
  return {
    users: [teacher, fresh, ready, half, ...students, ...readyStudents],
    classes: [
      { id: CLASS_ID, schoolId: SCHOOL_ID, name: '7А', grade: 7, joinCode: CLASS_CODE, joinCodeEnabled: true, subjectKey: 'bio', subjectKeys: ['bio'] },
      { id: READY_8B_ID, schoolId: READY_SCHOOL_ID, name: '8Б', grade: 8, joinCode: 'BEE8B2', joinCodeEnabled: true, subjectKey: 'math', subjectKeys: ['math', 'phys'] },
      { id: READY_8V_ID, schoolId: READY_SCHOOL_ID, name: '8-В', grade: 8, joinCode: 'VEE8V3', joinCodeEnabled: true, subjectKey: 'math', subjectKeys: ['math'] },
      { id: READY_9A_ID, schoolId: READY_SCHOOL_ID, name: '9 А', grade: 9, joinCode: 'NINE9A', joinCodeEnabled: false, subjectKey: 'chem', subjectKeys: ['chem', 'phys'] },
    ],
    assignments: [
      {
        id: '0192a000-0000-7000-8000-0000000000e1',
        classId: CLASS_ID,
        topicKey: 'animal-cell',
        activities: ['tour', 'quiz'],
        dueAt: due,
        createdBy: TEACHER_ID,
        createdAt: new Date(Date.now() - 86400_000).toISOString(),
      },
    ],
    attempts: [],
    progress: {},
    presentations: [],
    snapshots: [],
    tokens: {},
    sessionUserId: null,
    idempotency: {},
    syncLog: [],
    flags: { offline: false, tutorDown: false, latencyMs: 0 },
    generated: [],
    licenses: [
      {
        schoolId: SCHOOL_ID,
        schoolName: SCHOOL_NAME,
        subjects: ['bio', 'chem', 'phys', 'math'],
        grades: [5, 6, 7, 8, 9, 10, 11],
        startsAt: new Date(Date.now() - 60 * 86400_000).toISOString(),
        endsAt: new Date(Date.now() + 240 * 86400_000).toISOString(),
        trial: false,
      },
      trial(FRESH_SCHOOL_ID, 'Менин мектебим', [], [], 0),
      trial(READY_SCHOOL_ID, 'Ош ш., №12 мектеп', ['math', 'phys', 'chem'], [8, 9], 6),
      trial(HALF_SCHOOL_ID, 'Талас ш., №3 мектеп', [], [], 2),
    ],
    registrations: {},
    otps: {},
    otpTokens: {},
    ktp: [buildKtpPlan(KTP_ID, TEACHER_ID, 'КТП 8-класс алгебра 2026-2027.docx', new Date(Date.now() - 2 * 86400_000).toISOString()), readyKtp],
  };
}

const STORAGE_KEY = 'bilig.mock.state';
const canPersist = () => typeof sessionStorage !== 'undefined' && typeof window !== 'undefined' && !('__vitest_worker__' in globalThis);

function load(): MockState {
  if (canPersist()) {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const state = JSON.parse(raw) as MockState;
        state.generated ??= [];
        state.ktp ??= [];
        state.licenses ??= [];
        state.registrations ??= {};
        state.otps ??= {};
        state.otpTokens ??= {};
        return state;
      }
    } catch {
      /* fall through */
    }
  }
  return seed();
}

export let mockDb: MockState = load();

export function saveMockDb(): void {
  if (!canPersist()) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(mockDb));
  } catch {
    /* quota */
  }
}

/** Extra mock state that resets together with this one (v0.8.0 staff fixtures). */
export const resetHooks: (() => void)[] = [];

export function resetMockDb(): void {
  mockDb = seed();
  resetHooks.forEach((h) => h());
  saveMockDb();
}

export const principalOf = (u: MockUser | undefined): Principal => ({ userId: u?.id ?? null, grants: u?.grants ?? [] });
export const permissionsOf = (u: MockUser | undefined) => grantedPermissions(principalOf(u));
export const userById = (id: string | null | undefined) => mockDb.users.find((u) => u.id === id);

export function issueToken(userId: string): string {
  const token = `mock.${userId}.${Math.random().toString(36).slice(2)}`;
  mockDb.tokens[token] = userId;
  mockDb.sessionUserId = userId;
  saveMockDb();
  return token;
}

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : '0192a000-0000-7000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');

/** Schools the user works in (teacher / school-admin grants). */
export const schoolIdsOf = (u: MockUser | undefined): string[] =>
  (u?.grants ?? []).filter((g) => g.scope === 'school' && g.scopeId).map((g) => g.scopeId!);

/** Active licences of the user's schools. */
export const licensesOf = (u: MockUser | undefined): MockLicense[] => {
  const ids = schoolIdsOf(u);
  const now = Date.now();
  return mockDb.licenses.filter((l) => ids.includes(l.schoolId) && Date.parse(l.endsAt) > now);
};
