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
}

export const SCHOOL_ID = '0192a000-0000-7000-8000-000000000001';
export const CLASS_ID = '0192a000-0000-7000-8000-0000000000c1';
export const TEACHER_ID = '0192a000-0000-7000-8000-0000000000a1';
export const KTP_ID = '0192a000-0000-7000-8000-0000000000f1';
export const CLASS_CODE = 'ABC123';
export const STUDENT_PIN = '1234';
export const TEACHER_EMAIL = 'teacher@bilig.kg';
export const TEACHER_PASSWORD = 'bilig-teacher-2026';
/** v0.6.0: the mock's fixed e-mail code (like the server's AUTH_FIXED_OTP). Never shown in the UI. */
export const REGISTER_CODE = '012345';
export const SCHOOL_NAME = 'Бишкек ш., №5 мектеп-гимназия';

const studentId = (n: number) => `0192a000-0000-7000-8000-0000000005${String(n).padStart(2, '0')}`;
const STUDENT_NAMES = ['Айбек Т.', 'Нургуль А.', 'Мирлан К.', 'Айпери С.', 'Бектур Ж.'];

function seed(): MockState {
  const teacher: MockUser = {
    id: TEACHER_ID,
    kind: 'adult',
    displayName: 'Гүлнара Асанова',
    email: TEACHER_EMAIL,
    password: TEACHER_PASSWORD,
    locale: 'ky',
    grants: [{ role: 'teacher', scope: 'school', scopeId: SCHOOL_ID }],
  };
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
  const due = new Date(Date.now() + 5 * 86400_000).toISOString();
  return {
    users: [teacher, ...students],
    classes: [{ id: CLASS_ID, schoolId: SCHOOL_ID, name: '7А', grade: 7, joinCode: CLASS_CODE, joinCodeEnabled: true }],
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
    ],
    registrations: {},
    ktp: [buildKtpPlan(KTP_ID, TEACHER_ID, 'КТП 8-класс алгебра 2026-2027.docx', new Date(Date.now() - 2 * 86400_000).toISOString())],
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

export function resetMockDb(): void {
  mockDb = seed();
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
