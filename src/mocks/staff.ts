/**
 * DEV/TEST-ONLY v0.8.0 staff fixtures for the mock API: two SuperAdmins, two
 * managers with different ticked permissions (+ one invited), extra teachers
 * (some with incomplete profiles), a journal with events of every group, an
 * alert and deletion requests. Staff sign in at /admin with e-mail +
 * password + the fixed 2FA code (like the server's AUTH_FIXED_TOTP).
 */
import type { AuditEvent, DeletionRequest, StaffMember, TeacherSummary } from '@bilig/content-model/api';
import type { Permission } from '@bilig/permissions';
import { FRESH_TEACHER_ID, READY_TEACHER_ID, SCHOOL_NAME, TEACHER_ID, type MockUser } from './db';

export const STAFF_PASSWORD = 'bilig-staff-2026';
/** The fixed staff 2FA code in the mock (the server's AUTH_FIXED_TOTP test mode). Never shown in the UI. */
export const STAFF_TOTP = '012345';
export const SUPER_EMAIL = 'super@bilig.kg';
export const SUPER2_EMAIL = 'super2@bilig.kg';
export const MANAGER_EMAIL = 'manager@bilig.kg';
export const CONTENT_MANAGER_EMAIL = 'content@bilig.kg';

const sid = (n: number) => `0192a000-0000-7000-8000-0000000008${String(n).padStart(2, '0')}`;
export const SUPER_ID = sid(1);
export const SUPER2_ID = sid(2);
export const MANAGER_ID = sid(3);
export const CONTENT_MANAGER_ID = sid(4);
export const INVITED_ID = sid(5);
const tid = (n: number) => `0192a000-0000-7000-8000-0000000009${String(n).padStart(2, '0')}`;

const MANAGER_PERMS: Permission[] = ['teacher.view', 'teacher.edit', 'audit.read', 'deletion.request'];
const CONTENT_PERMS: Permission[] = ['content.draft.edit', 'model.upload', 'content.review', 'audit.read', 'deletion.request'];

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

export function staffUsers(): MockUser[] {
  const adult = (id: string, displayName: string, email: string, grants: MockUser['grants'], extra: Partial<MockUser> = {}): MockUser => ({
    id,
    kind: 'adult',
    displayName,
    email,
    password: STAFF_PASSWORD,
    locale: 'ru',
    grants,
    ...extra,
  });
  return [
    adult(SUPER_ID, 'Айдана Мамбетова', SUPER_EMAIL, [{ role: 'superadmin', scope: 'platform' }]),
    adult(SUPER2_ID, 'Тимур Касымов', SUPER2_EMAIL, [{ role: 'superadmin', scope: 'platform' }]),
    adult(MANAGER_ID, 'Бермет Жумабаева', MANAGER_EMAIL, [{ role: 'manager', scope: 'platform', permissions: MANAGER_PERMS }]),
    adult(CONTENT_MANAGER_ID, 'Эрлан Токтосунов', CONTENT_MANAGER_EMAIL, [{ role: 'manager', scope: 'platform', permissions: CONTENT_PERMS }]),
    adult(INVITED_ID, 'Нурбек Абдыкадыров', 'nurbek@bilig.kg', [{ role: 'manager', scope: 'platform', permissions: ['teacher.view'] }], { password: undefined }),
  ];
}

/** Extra teachers for the list (summaries only; they also exist as mock users). */
const EXTRA_TEACHERS: { id: string; name: string; phone: string | null; email: string | null; school: string; region: string; lang: TeacherSummary['teachingLang']; classes: number; subjects: string[]; complete: boolean; status: TeacherSummary['status']; activeMin: number | null }[] = [
  { id: tid(1), name: 'Жылдыз Садыкова', phone: '+996555210011', email: null, school: 'Нарын ш., №3 мектеп', region: 'Нарын', lang: 'ky', classes: 3, subjects: ['phys', 'math'], complete: true, status: 'active', activeMin: 90 },
  { id: tid(2), name: 'Ольга Ким', phone: '+996777400222', email: 'olga.kim@mail.kg', school: 'Бишкек ш., №61 гимназия', region: 'Бишкек', lang: 'ru', classes: 2, subjects: ['chem'], complete: true, status: 'active', activeMin: 60 * 26 },
  { id: tid(3), name: 'Азамат Бейшеев', phone: '+996700330033', email: null, school: '', region: 'Ош', lang: null, classes: 0, subjects: [], complete: false, status: 'active', activeMin: 60 * 24 * 3 },
  { id: tid(4), name: 'Дилноза Юсупова', phone: '+996555440044', email: null, school: 'Ош ш., №28 мектеп', region: 'Ош', lang: 'uz', classes: 1, subjects: [], complete: false, status: 'active', activeMin: null },
  { id: tid(5), name: 'Канат Орозбеков', phone: '+996555550055', email: 'kanat@school.kg', school: 'Каракол ш., №1 мектеп', region: 'Ысык-Көл', lang: 'ky', classes: 4, subjects: ['bio', 'geo'], complete: true, status: 'blocked', activeMin: 60 * 24 * 40 },
];

export function extraTeacherUsers(): MockUser[] {
  return EXTRA_TEACHERS.map((x) => ({
    id: x.id,
    kind: 'adult',
    displayName: x.name,
    ...(x.phone ? { phone: x.phone } : {}),
    ...(x.email ? { email: x.email } : {}),
    password: 'bilig-teacher-2026',
    locale: 'ky',
    grants: [{ role: 'teacher', scope: 'school', scopeId: '0192a000-0000-7000-8000-000000000009' }],
  }));
}

export interface StaffState {
  members: Record<string, Pick<StaffMember, 'status' | 'totpEnabled' | 'createdAt' | 'createdBy' | 'lastLoginAt'>>;
  teachers: Record<string, Omit<TeacherSummary, 'id' | 'displayName' | 'phone' | 'email'>>;
  journal: AuditEvent[];
  alerts: { id: string; at: string; kind: 'mass_deletion' | 'chain_broken' | 'support_edit'; actor: { id: string | null; displayName: string | null }; summary: string; seenAt: string | null }[];
  deletions: DeletionRequest[];
  /** support token → session */
  support: Record<string, { id: string; teacherId: string; actorId: string; mode: 'view' | 'edit'; reason: string | null; startedAt: string; expiresAt: string; endedAt: string | null }>;
}

const uid = (n: number) => `0192a000-0000-7000-8000-00000000a${String(n).padStart(3, '0')}`;

function seedJournal(): AuditEvent[] {
  const who = {
    super: { id: SUPER_ID, displayName: 'Айдана Мамбетова', role: 'superadmin' },
    super2: { id: SUPER2_ID, displayName: 'Тимур Касымов', role: 'superadmin' },
    mgr: { id: MANAGER_ID, displayName: 'Бермет Жумабаева', role: 'manager' },
    cm: { id: CONTENT_MANAGER_ID, displayName: 'Эрлан Токтосунов', role: 'manager' },
  };
  const teacher = { id: TEACHER_ID, displayName: 'Гүлнара Асанова' };
  type Row = [number, keyof typeof who | null, AuditEvent['group'], string, AuditEvent['target'], Partial<AuditEvent>?];
  const rows: Row[] = [
    [60 * 30, 'super', 'auth', 'auth.login', { type: 'staff', id: SUPER_ID, label: 'Айдана Мамбетова' }],
    [60 * 29, 'super', 'staff', 'staff.invited', { type: 'staff', id: MANAGER_ID, label: 'Бермет Жумабаева' }, { after: { email: MANAGER_EMAIL, permissions: ['teacher.view', 'audit.read'] } }],
    [60 * 28, 'mgr', 'staff', 'staff.invite_accepted', { type: 'staff', id: MANAGER_ID, label: 'Бермет Жумабаева' }],
    [60 * 27, 'super', 'staff', 'staff.permissions_changed', { type: 'staff', id: MANAGER_ID, label: 'Бермет Жумабаева' }, { before: { permissions: ['teacher.view', 'audit.read'] }, after: { permissions: MANAGER_PERMS }, reason: 'Будет вести поддержку учителей Оша' }],
    [60 * 26, null, 'auth', 'auth.login_failed', { type: 'staff', id: CONTENT_MANAGER_ID, label: CONTENT_MANAGER_EMAIL }, { result: 'denied' }],
    [60 * 25, 'cm', 'auth', 'auth.totp_failed', { type: 'staff', id: CONTENT_MANAGER_ID, label: 'Эрлан Токтосунов' }, { result: 'denied' }],
    [60 * 24, 'cm', 'content', 'content.created', { type: 'topic', id: 'electric-circuit', label: 'Электр чынжыры' }],
    [60 * 23, 'cm', 'content', 'content.submitted', { type: 'topic', id: 'electric-circuit', label: 'Электр чынжыры' }],
    [60 * 22, 'super2', 'content', 'content.reviewed', { type: 'topic', id: 'electric-circuit', label: 'Электр чынжыры' }, { after: { review: 'approved' } }],
    [60 * 21, 'super2', 'content', 'content.published', { type: 'topic', id: 'electric-circuit', label: 'Электр чынжыры' }, { before: { version: '1.0.0' }, after: { version: '1.1.0' } }],
    [60 * 6, 'mgr', 'support', 'support.started', { type: 'teacher', id: TEACHER_ID, label: teacher.displayName }, { onBehalfOf: teacher, reason: null, after: { mode: 'view' } }],
    [60 * 5.9, 'mgr', 'support', 'support.ended', { type: 'teacher', id: TEACHER_ID, label: teacher.displayName }, { onBehalfOf: teacher }],
    [60 * 5, 'mgr', 'support', 'support.started', { type: 'teacher', id: TEACHER_ID, label: teacher.displayName }, { onBehalfOf: teacher, reason: 'Учитель просит поправить название класса 7А', after: { mode: 'edit' } }],
    [60 * 4.9, 'mgr', 'teacher_data', 'teacher_data.class_changed', { type: 'class', id: '0192a000-0000-7000-8000-0000000000c1', label: '7А' }, { onBehalfOf: teacher, before: { name: '7 а' }, after: { name: '7А' } }],
    [60 * 4.8, 'mgr', 'teacher_data', 'teacher_data.profile_changed', { type: 'teacher', id: TEACHER_ID, label: teacher.displayName }, { onBehalfOf: teacher, before: { teachingLang: null }, after: { teachingLang: 'ky' } }],
    [60 * 4.7, 'mgr', 'support', 'support.action', { type: 'teacher', id: TEACHER_ID, label: teacher.displayName }, { onBehalfOf: teacher, result: 'denied', reason: 'support_forbidden: /me/2fa' }],
    [60 * 4.6, 'mgr', 'support', 'support.ended', { type: 'teacher', id: TEACHER_ID, label: teacher.displayName }, { onBehalfOf: teacher }],
    [60 * 3, 'mgr', 'deletion', 'deletion.requested', { type: 'teacher', id: tid(3), label: 'Азамат Бейшеев' }, { reason: 'Дубликат учётной записи, учитель зарегистрировался дважды' }],
    [60 * 2.5, 'cm', 'content', 'content.deletion_requested', { type: 'concept', id: 'bio.old-cell', label: 'Клетка (старая версия)' }],
    [60 * 2, 'super', 'export', 'export.journal_csv', { type: 'journal', id: 'export', label: 'group=support' }, { after: { rows: 7 } }],
    [60 * 1.5, 'super2', 'content', 'content.deleted', { type: 'item', id: 'q-legacy-1', label: 'q-legacy-1' }],
    [60 * 1.4, 'super2', 'export', 'export.mass_operation', { type: 'item', id: 'bulk', label: '12 заданий' }, { after: { archived: 12 } }],
    [60, 'super', 'deletion', 'deletion.rejected', { type: 'concept', id: 'bio.old-cell', label: 'Клетка (старая версия)' }, { reason: 'Понятие ещё используется в двух темах' }],
    [30, 'super', 'staff', 'staff.blocked', { type: 'staff', id: INVITED_ID, label: 'Нурбек Абдыкадыров' }, { before: { status: 'active' }, after: { status: 'blocked' }, reason: 'Ушёл из проекта' }],
    [25, 'super', 'staff', 'staff.restored', { type: 'staff', id: INVITED_ID, label: 'Нурбек Абдыкадыров' }, { before: { status: 'blocked' }, after: { status: 'invited' }, reason: 'Вернулся в проект' }],
    [10, 'super', 'auth', 'auth.logout', { type: 'staff', id: SUPER_ID, label: 'Айдана Мамбетова' }],
  ];
  return rows.map(([min, actor, group, action, target, extra = {}], i) => ({
    id: uid(i + 1),
    seq: i + 1,
    at: ago(min),
    actor: actor ? who[actor] : { id: null, displayName: null, role: null },
    onBehalfOf: null,
    group,
    action,
    target,
    before: null,
    after: null,
    reason: null,
    result: 'ok',
    ip: '178.217.174.' + (10 + i),
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130',
    requestId: `req-${(1000 + i).toString(16)}`,
    supportSessionId: group === 'support' || group === 'teacher_data' ? '0192a000-0000-7000-8000-0000000007a1' : null,
    ...extra,
  }));
}

export function seedStaff(): StaffState {
  const member = (status: StaffMember['status'], createdMin: number, lastMin: number | null, totp = true, createdBy: string | null = SUPER_ID) => ({
    status,
    totpEnabled: totp,
    createdAt: ago(createdMin),
    createdBy,
    lastLoginAt: lastMin === null ? null : ago(lastMin),
  });
  const teachers: StaffState['teachers'] = {
    [TEACHER_ID]: { schoolName: SCHOOL_NAME, region: 'Бишкек', teachingLang: 'ky', classes: 1, subjects: ['bio', 'chem'], profileStatus: 'complete', status: 'active', createdAt: ago(60 * 24 * 90), lastActiveAt: ago(45) },
    [FRESH_TEACHER_ID]: { schoolName: 'Менин мектебим', region: '', teachingLang: null, classes: 0, subjects: [], profileStatus: 'incomplete', status: 'active', createdAt: ago(60 * 3), lastActiveAt: ago(60 * 3) },
    [READY_TEACHER_ID]: { schoolName: 'Ош ш., №12 мектеп', region: 'Ош', teachingLang: 'ky', classes: 2, subjects: ['bio', 'chem'], profileStatus: 'complete', status: 'active', createdAt: ago(60 * 24 * 6), lastActiveAt: ago(60 * 5) },
  };
  for (const x of EXTRA_TEACHERS)
    teachers[x.id] = {
      schoolName: x.school,
      region: x.region,
      teachingLang: x.lang,
      classes: x.classes,
      subjects: x.subjects,
      profileStatus: x.complete ? 'complete' : 'incomplete',
      status: x.status,
      createdAt: ago(60 * 24 * 20),
      lastActiveAt: x.activeMin === null ? null : ago(x.activeMin),
    };
  return {
    members: {
      [SUPER_ID]: member('active', 60 * 24 * 400, 15, true, null),
      [SUPER2_ID]: member('active', 60 * 24 * 300, 60 * 20, true, SUPER_ID),
      [MANAGER_ID]: member('active', 60 * 24 * 30, 60 * 3),
      [CONTENT_MANAGER_ID]: member('active', 60 * 24 * 60, 60 * 24),
      [INVITED_ID]: member('invited', 60 * 24, null, false),
    },
    teachers,
    journal: seedJournal(),
    alerts: [
      { id: uid(901), at: ago(80), kind: 'mass_deletion', actor: { id: SUPER2_ID, displayName: 'Тимур Касымов' }, summary: '12 удалений за 6 минут', seenAt: null },
      { id: uid(902), at: ago(60 * 5), kind: 'support_edit', actor: { id: MANAGER_ID, displayName: 'Бермет Жумабаева' }, summary: 'Режим правки: Гүлнара Асанова', seenAt: ago(60 * 4) },
    ],
    deletions: [
      {
        id: uid(801),
        kind: 'teacher',
        targetId: tid(3),
        targetLabel: 'Азамат Бейшеев',
        reason: 'Дубликат учётной записи, учитель зарегистрировался дважды',
        status: 'pending',
        requestedBy: { id: MANAGER_ID, displayName: 'Бермет Жумабаева' },
        requestedAt: ago(60 * 3),
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
      },
      {
        id: uid(802),
        kind: 'topic',
        targetId: 'demo-old-atoms',
        targetLabel: 'Атомдор (эски версия)',
        reason: 'Заменена новой темой «Атомдун түзүлүшү», старая путает учеников',
        status: 'pending',
        requestedBy: { id: CONTENT_MANAGER_ID, displayName: 'Эрлан Токтосунов' },
        requestedAt: ago(90),
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
      },
      {
        id: uid(803),
        kind: 'concept',
        targetId: 'bio.old-cell',
        targetLabel: 'Клетка (старая версия)',
        reason: 'Устаревшее понятие, есть новое bio.cell',
        status: 'rejected',
        requestedBy: { id: CONTENT_MANAGER_ID, displayName: 'Эрлан Токтосунов' },
        requestedAt: ago(60 * 2.5),
        decidedBy: { id: SUPER_ID, displayName: 'Айдана Мамбетова' },
        decidedAt: ago(60),
        decisionNote: 'Понятие ещё используется в двух темах',
      },
    ],
    support: {},
  };
}

const STORAGE_KEY = 'bilig.mock.staff';
const canPersist = () => typeof sessionStorage !== 'undefined' && typeof window !== 'undefined' && !('__vitest_worker__' in globalThis);
let state: StaffState | null = null;

/** The staff mock state (lazy: seeded on first use, kept in sessionStorage in the browser). */
export function staffDb(): StaffState {
  if (state) return state;
  if (canPersist()) {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) return (state = JSON.parse(raw) as StaffState);
    } catch {
      /* fall through */
    }
  }
  return (state = seedStaff());
}

export function saveStaffDb(): void {
  if (!state || !canPersist()) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

export function resetStaffDb(): void {
  state = seedStaff();
  saveStaffDb();
}
