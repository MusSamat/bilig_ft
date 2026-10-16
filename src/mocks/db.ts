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
}

export const SCHOOL_ID = '0192a000-0000-7000-8000-000000000001';
export const CLASS_ID = '0192a000-0000-7000-8000-0000000000c1';
export const TEACHER_ID = '0192a000-0000-7000-8000-0000000000a1';
export const CLASS_CODE = 'ABC123';
export const STUDENT_PIN = '1234';
export const TEACHER_EMAIL = 'teacher@bilig.kg';
export const TEACHER_PASSWORD = 'bilig-teacher-2026';

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
