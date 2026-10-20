/**
 * DEV/TEST-ONLY MSW handlers for contract 0.8.0: staff sign-in with the fixed
 * 2FA code, staff management, teachers, support sessions (a client token in
 * the teacher's name with view / edit rules), the journal (filters, CSV,
 * chain check, alerts) and deletion requests. Wired in front of the other
 * handlers: the sign-in, /me and the support guard fall through when they do
 * not apply.
 */
import { HttpResponse, http, type HttpHandler } from 'msw';
import {
  API_PREFIX,
  HEADERS,
  type AuditEvent,
  type EndpointBody,
  type EndpointResponse,
  type StaffMember,
  type TeacherSummary,
} from '@bilig/content-model/api';
import { MANAGER_ASSIGNABLE, type Permission } from '@bilig/permissions';
import { mockDb, newId, permissionsOf, resetHooks, saveMockDb, userById, type MockUser } from './db';
import { STAFF_TOTP, extraTeacherUsers, resetStaffDb, saveStaffDb, staffDb, staffUsers } from './staff';

export interface StaffDeps {
  route: typeof import('./handlers').route;
  fail: typeof import('./handlers').fail;
  meOf: (u: MockUser) => EndpointResponse<'me'>;
  tokenFor: (u: MockUser) => { accessToken: string; tokenType: 'Bearer'; expiresIn: number };
}

function ensureStaffUsers(): void {
  for (const u of [...staffUsers(), ...extraTeacherUsers()]) if (!userById(u.id)) mockDb.users.push(u);
}
ensureStaffUsers();
resetHooks.push(() => {
  resetStaffDb();
  ensureStaffUsers();
});

const now = () => new Date().toISOString();
const bearer = (req: Request) => {
  const a = req.headers.get(HEADERS.authorization);
  return a?.startsWith('Bearer ') ? a.slice(7) : '';
};
const roleOf = (u: MockUser) => (u.grants.some((g) => g.role === 'superadmin') ? 'superadmin' : u.grants.some((g) => g.role === 'manager') ? 'manager' : null);
const isTeacher = (u: MockUser) => u.grants.some((g) => g.role === 'teacher') && !roleOf(u);
const isStaffAccount = (u: MockUser) => !!roleOf(u) || u.grants.some((g) => g.role === 'author' || g.role === 'editor');

function memberOf(u: MockUser): StaffMember {
  const m = staffDb().members[u.id] ?? { status: 'active', totpEnabled: true, createdAt: now(), createdBy: null, lastLoginAt: null };
  const role = roleOf(u) ?? 'manager';
  return {
    userId: u.id,
    email: u.email ?? `${u.id}@bilig.kg`,
    displayName: u.displayName,
    role,
    permissions: role === 'manager' ? [...(u.grants.find((g) => g.role === 'manager')?.permissions ?? [])] : [],
    ...m,
  };
}

function summaryOf(u: MockUser): TeacherSummary {
  const x = staffDb().teachers[u.id] ?? {
    schoolName: '',
    region: '',
    teachingLang: null,
    classes: 0,
    subjects: [],
    profileStatus: 'incomplete' as const,
    status: 'active' as const,
    createdAt: now(),
    lastActiveAt: null,
  };
  return { id: u.id, displayName: u.displayName, phone: u.phone ?? null, email: u.email ?? null, ...x };
}

/** Append a chained journal event (the mock does not hash; seq is the chain position). */
function journal(e: Partial<AuditEvent> & Pick<AuditEvent, 'group' | 'action' | 'target'>, actor?: MockUser, req?: Request): AuditEvent {
  const db = staffDb();
  const ev: AuditEvent = {
    id: newId(),
    seq: (db.journal.at(-1)?.seq ?? 0) + 1,
    at: now(),
    actor: actor ? { id: actor.id, displayName: actor.displayName, role: roleOf(actor) ?? 'teacher' } : { id: null, displayName: null, role: null },
    onBehalfOf: null,
    before: null,
    after: null,
    reason: null,
    result: 'ok',
    ip: '127.0.0.1',
    userAgent: req?.headers.get('user-agent') ?? 'mock',
    requestId: `req-${Math.random().toString(16).slice(2, 8)}`,
    supportSessionId: null,
    ...e,
  };
  db.journal.push(ev);
  saveStaffDb();
  return ev;
}

function pageOf<T>(items: T[], url: URL, max = 100) {
  const limit = Math.min(max, Math.max(1, Number(url.searchParams.get('limit') ?? 25)));
  const start = Number(url.searchParams.get('cursor') ?? 0) || 0;
  return { items: items.slice(start, start + limit), nextCursor: start + limit < items.length ? String(start + limit) : null };
}

/** Support sessions: the active one behind a bearer token (expired ones are dropped). */
function supportOf(token: string) {
  const s = staffDb().support[token];
  if (!s) return null;
  if (s.endedAt || Date.parse(s.expiresAt) <= Date.now()) {
    delete mockDb.tokens[token];
    return { ...s, expired: true as const };
  }
  return { ...s, expired: false as const };
}

/** In every mode: password, phone, e-mail, 2FA, deleting the account, payment, ending other sessions. */
const FORBIDDEN_IN_SUPPORT = [/^\/me\/2fa/, /^\/me\/sessions\//, /^\/auth\/logout-all/, /^\/auth\/password/, /^\/me\/delete/, /^\/payments?/];

function filterJournal(user: MockUser | undefined, url: URL): AuditEvent[] {
  const p = url.searchParams;
  const all = permissionsOf(user).includes('staff.manage');
  return staffDb()
    .journal.filter((e) => all || e.actor.id === user?.id)
    .filter((e) => !p.get('actorId') || e.actor.id === p.get('actorId'))
    .filter((e) => !p.get('onBehalfOfId') || e.onBehalfOf?.id === p.get('onBehalfOfId') || e.target.id === p.get('onBehalfOfId'))
    .filter((e) => !p.get('group') || e.group === p.get('group'))
    .filter((e) => !p.get('action') || e.action.includes(p.get('action')!))
    .filter((e) => !p.get('targetType') || e.target.type === p.get('targetType'))
    .filter((e) => !p.get('targetId') || e.target.id === p.get('targetId'))
    .filter((e) => !p.get('result') || e.result === p.get('result'))
    .filter((e) => !p.get('from') || e.at >= p.get('from')!)
    .filter((e) => !p.get('to') || e.at <= p.get('to')!)
    .sort((a, b) => b.seq - a.seq);
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function staffHandlers({ route, fail, meOf, tokenFor }: StaffDeps): HttpHandler[] {
  const superCount = () => mockDb.users.filter((u) => roleOf(u) === 'superadmin' && staffDb().members[u.id]?.status === 'active').length;
  const selfOrMissing = (user: MockUser | undefined, id: string) => {
    const target = userById(id);
    if (!target || !roleOf(target)) return fail('not_found');
    if (target.id === user?.id) return fail('forbidden', { detail: 'self' });
    return target;
  };
  const staffAction = (action: 'block' | 'restore' | 'delete') =>
    route(action === 'block' ? 'staffBlock' : action === 'restore' ? 'staffRestore' : 'staffDelete', ({ user, params, body, req }) => {
      const target = selfOrMissing(user, params.userId);
      if (target instanceof Response) return target;
      const m = staffDb().members[target.id];
      const before = m.status;
      if (action !== 'restore' && roleOf(target) === 'superadmin' && before === 'active' && superCount() <= 2) return fail('conflict', { detail: 'min_superadmins' });
      m.status = action === 'block' ? 'blocked' : action === 'delete' ? 'deleted' : m.totpEnabled ? 'active' : 'invited';
      if (action !== 'restore') for (const [tok, id] of Object.entries(mockDb.tokens)) if (id === target.id) delete mockDb.tokens[tok];
      const reason = (body as { reason: string }).reason;
      journal({ group: 'staff', action: `staff.${action === 'block' ? 'blocked' : action === 'delete' ? 'deleted' : 'restored'}`, target: { type: 'staff', id: target.id, label: target.displayName }, before: { status: before }, after: { status: m.status }, reason }, user, req);
      return memberOf(target);
    });

  return [
    // Support guard: expired sessions, forbidden areas, read-only view mode, journaled writes.
    http.all(`${API_PREFIX}/*`, ({ request }) => {
      const tok = bearer(request);
      const s = tok ? supportOf(tok) : null;
      if (!s) return undefined;
      const path = new URL(request.url).pathname.slice(API_PREFIX.length);
      if (/^\/admin\/support\/[^/]+\/end$/.test(path)) return undefined;
      if (s.expired) return fail('unauthorized', { detail: 'support_expired' });
      const write = request.method !== 'GET' && request.method !== 'HEAD';
      const actor = userById(s.actorId);
      const teacher = userById(s.teacherId);
      const onBehalfOf = teacher ? { id: teacher.id, displayName: teacher.displayName } : null;
      if (FORBIDDEN_IN_SUPPORT.some((r) => r.test(path))) {
        journal({ group: 'support', action: 'support.action', target: { type: 'teacher', id: s.teacherId, label: teacher?.displayName ?? null }, onBehalfOf, result: 'denied', reason: `support_forbidden: ${path}`, supportSessionId: s.id }, actor, request);
        return fail('forbidden', { detail: 'support_forbidden' });
      }
      if (!write) return undefined;
      if (s.mode === 'view') {
        journal({ group: 'support', action: 'support.action', target: { type: 'teacher', id: s.teacherId, label: teacher?.displayName ?? null }, onBehalfOf, result: 'denied', reason: `support_read_only: ${request.method} ${path}`, supportSessionId: s.id }, actor, request);
        return fail('forbidden', { detail: 'support_read_only' });
      }
      journal({ group: 'teacher_data', action: 'support.action', target: { type: 'teacher', id: s.teacherId, label: teacher?.displayName ?? null }, onBehalfOf, reason: `${request.method} ${path}`, supportSessionId: s.id }, actor, request);
      return undefined;
    }),

    // Staff sign-in: e-mail + password + the fixed 2FA code; others fall through to the common login.
    http.post(`${API_PREFIX}/auth/login`, async ({ request }) => {
      ensureStaffUsers();
      let b: { email?: string; password?: string; totp?: string } = {};
      try {
        b = (await request.clone().json()) as typeof b;
      } catch {
        return undefined;
      }
      const u = b.email ? mockDb.users.find((x) => x.email === b.email!.toLowerCase()) : undefined;
      if (!u || !roleOf(u)) return undefined;
      const m = staffDb().members[u.id];
      if (!u.password || u.password !== b.password || m?.status === 'blocked' || m?.status === 'deleted') {
        journal({ group: 'auth', action: 'auth.login_failed', target: { type: 'staff', id: u.id, label: u.email ?? null }, result: 'denied' }, undefined, request);
        return fail('invalid_credentials');
      }
      if (!b.totp) return fail('totp_required');
      if (b.totp !== STAFF_TOTP) {
        journal({ group: 'auth', action: 'auth.totp_failed', target: { type: 'staff', id: u.id, label: u.displayName }, result: 'denied' }, u, request);
        return fail('invalid_credentials');
      }
      if (m) m.lastLoginAt = now();
      journal({ group: 'auth', action: 'auth.login', target: { type: 'staff', id: u.id, label: u.displayName } }, u, request);
      const res = tokenFor(u);
      saveMockDb();
      return HttpResponse.json(res);
    }),

    // GET /me inside a support session: the teacher's profile + `support`.
    http.get(`${API_PREFIX}/me`, ({ request }) => {
      const tok = bearer(request);
      const s = tok ? supportOf(tok) : null;
      if (!s || s.expired) return undefined;
      const teacher = userById(s.teacherId);
      const actor = userById(s.actorId);
      if (!teacher || !actor) return fail('unauthorized');
      return HttpResponse.json({ ...meOf(teacher), support: { sessionId: s.id, mode: s.mode, actor: { id: actor.id, displayName: actor.displayName }, expiresAt: s.expiresAt } });
    }),

    // Staff --------------------------------------------------------------------
    route('staffList', () => ({ items: mockDb.users.filter((u) => roleOf(u)).map(memberOf) })),
    route('staffInvite', ({ user, body, req }) => {
      const b = body as EndpointBody<'staffInvite'>;
      const bad = b.permissions.filter((p) => !MANAGER_ASSIGNABLE.includes(p));
      if (bad.length) return fail('validation_failed', { issues: [{ path: ['permissions'], message: `not assignable: ${bad.join(', ')}` }] });
      if (mockDb.users.some((u) => u.email === b.email.toLowerCase())) return fail('conflict', { detail: 'email_taken' });
      const u: MockUser = { id: newId(), kind: 'adult', displayName: b.displayName, email: b.email.toLowerCase(), locale: 'ru', grants: [{ role: 'manager', scope: 'platform', permissions: b.permissions as Permission[] }] };
      mockDb.users.push(u);
      staffDb().members[u.id] = { status: 'invited', totpEnabled: false, createdAt: now(), createdBy: user?.id ?? null, lastLoginAt: null };
      journal({ group: 'staff', action: 'staff.invited', target: { type: 'staff', id: u.id, label: u.displayName }, after: { email: u.email, permissions: b.permissions } }, user, req);
      return { ok: true as const };
    }),
    route('staffPatch', ({ user, params, body, req }) => {
      const target = selfOrMissing(user, params.userId);
      if (target instanceof Response) return target;
      const b = body as EndpointBody<'staffPatch'>;
      const grant = target.grants.find((g) => g.role === 'manager');
      const before = { permissions: [...(grant?.permissions ?? [])], displayName: target.displayName };
      if (b.permissions) {
        if (!grant) return fail('conflict', { detail: 'not_manager' });
        const bad = b.permissions.filter((p) => !MANAGER_ASSIGNABLE.includes(p));
        if (bad.length) return fail('validation_failed', { issues: [{ path: ['permissions'], message: `not assignable: ${bad.join(', ')}` }] });
        grant.permissions = b.permissions as Permission[];
      }
      if (b.displayName) target.displayName = b.displayName;
      journal({ group: 'staff', action: 'staff.permissions_changed', target: { type: 'staff', id: target.id, label: target.displayName }, before, after: { permissions: grant?.permissions ?? [], displayName: target.displayName }, reason: b.reason }, user, req);
      return memberOf(target);
    }),
    staffAction('block'),
    staffAction('restore'),
    staffAction('delete'),

    // Teachers -----------------------------------------------------------------
    route('teacherList', ({ url }) => {
      const p = url.searchParams;
      const q = (p.get('q') ?? '').trim().toLowerCase();
      const digits = q.replace(/\D/g, '');
      const items = mockDb.users
        .filter(isTeacher)
        .map(summaryOf)
        .filter((x) => !p.get('status') || x.status === p.get('status'))
        .filter((x) => !p.get('profileStatus') || x.profileStatus === p.get('profileStatus'))
        .filter(
          (x) =>
            !q ||
            x.displayName.toLowerCase().includes(q) ||
            (x.email ?? '').toLowerCase().includes(q) ||
            x.schoolName.toLowerCase().includes(q) ||
            (digits.length >= 3 && (x.phone ?? '').includes(digits)),
        )
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
      return pageOf(items, url);
    }),
    route('teacherGet', ({ params }) => {
      const u = userById(params.id);
      return u && isTeacher(u) ? summaryOf(u) : fail('not_found');
    }),
    route('supportStart', ({ user, params, body, req }) => {
      const b = body as EndpointBody<'supportStart'>;
      const teacher = userById(params.id);
      if (!teacher || !user) return fail('not_found');
      if (isStaffAccount(teacher) || !isTeacher(teacher)) return fail('forbidden', { detail: 'staff_account' });
      if (summaryOf(teacher).status !== 'active') return fail('conflict', { detail: 'teacher_not_active' });
      if (b.mode === 'edit') {
        if (!permissionsOf(user).includes('teacher.edit')) return fail('forbidden');
        if (b.totp !== STAFF_TOTP) return fail('invalid_credentials');
      }
      const ttl = b.mode === 'edit' ? 1800 : 900;
      const token = `mock.support.${Math.random().toString(36).slice(2)}`;
      mockDb.tokens[token] = teacher.id; // not the refresh cookie: the staff session stays as it is
      const session = {
        id: newId(),
        teacherId: teacher.id,
        actorId: user.id,
        mode: b.mode,
        reason: b.reason ?? null,
        startedAt: now(),
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
        endedAt: null,
      };
      staffDb().support[token] = session;
      const role = roleOf(user) ?? 'manager';
      journal({ group: 'support', action: 'support.started', target: { type: 'teacher', id: teacher.id, label: teacher.displayName }, onBehalfOf: { id: teacher.id, displayName: teacher.displayName }, reason: session.reason, after: { mode: b.mode }, supportSessionId: session.id }, user, req);
      if (b.mode === 'edit') staffDb().alerts.unshift({ id: newId(), at: now(), kind: 'support_edit', actor: { id: user.id, displayName: user.displayName }, summary: `${teacher.displayName}: ${session.reason ?? ''}`, seenAt: null });
      return {
        session: {
          id: session.id,
          mode: b.mode,
          teacher: { id: teacher.id, displayName: teacher.displayName },
          actor: { id: user.id, displayName: user.displayName, role },
          reason: session.reason,
          startedAt: session.startedAt,
          expiresAt: session.expiresAt,
          endedAt: null,
        },
        accessToken: token,
        tokenType: 'Bearer' as const,
        expiresIn: ttl,
      };
    }),
    route('supportEnd', ({ user, params, req }) => {
      const entry = Object.entries(staffDb().support).find(([, s]) => s.id === params.sessionId);
      if (!entry) return fail('not_found');
      const [tok, s] = entry;
      if (!s.endedAt) {
        s.endedAt = now();
        delete mockDb.tokens[tok];
        const teacher = userById(s.teacherId);
        journal({ group: 'support', action: 'support.ended', target: { type: 'teacher', id: s.teacherId, label: teacher?.displayName ?? null }, onBehalfOf: teacher ? { id: teacher.id, displayName: teacher.displayName } : null, supportSessionId: s.id }, userById(s.actorId) ?? user, req);
      }
      return { ok: true as const };
    }),

    // Journal ------------------------------------------------------------------
    route('journal', ({ user, url }) => pageOf(filterJournal(user, url), url, 200)),
    route('journalExport', ({ user, url, req }) => {
      const rows = filterJournal(user, url);
      const head = ['seq', 'at', 'actor', 'role', 'on_behalf_of', 'group', 'action', 'target_type', 'target_id', 'target_label', 'result', 'reason', 'ip', 'request_id'];
      const lines = rows.map((e) => [e.seq, e.at, e.actor.displayName, e.actor.role, e.onBehalfOf?.displayName, e.group, e.action, e.target.type, e.target.id, e.target.label, e.result, e.reason, e.ip, e.requestId].map(csvCell).join(','));
      journal({ group: 'export', action: 'export.journal_csv', target: { type: 'journal', id: 'export', label: url.search || 'all' }, after: { rows: rows.length } }, user, req);
      return new HttpResponse(`﻿${[head.join(','), ...lines].join('\r\n')}\r\n`, {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="journal-${now().slice(0, 10)}.csv"` },
      });
    }),
    route('journalVerify', () => ({ ok: true, checked: staffDb().journal.length, brokenAt: null })),
    route('journalAlerts', () => ({ items: staffDb().alerts })),
    route('journalAlertSeen', ({ params }) => {
      const a = staffDb().alerts.find((x) => x.id === params.id);
      if (!a) return fail('not_found');
      a.seenAt ??= now();
      saveStaffDb();
      return { ok: true as const };
    }),

    // Deletion requests ----------------------------------------------------------
    route('deletionList', ({ user, url }) => {
      const status = url.searchParams.get('status');
      const all = permissionsOf(user).includes('deletion.approve');
      const items = staffDb()
        .deletions.filter((d) => all || d.requestedBy.id === user?.id)
        .filter((d) => !status || d.status === status)
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
      return pageOf(items, url);
    }),
    route('deletionCreate', ({ user, body, req }) => {
      const b = body as EndpointBody<'deletionCreate'>;
      const label = b.kind === 'teacher' ? userById(b.targetId)?.displayName : b.targetId;
      if (!label) return fail('not_found');
      const d = {
        id: newId(),
        kind: b.kind,
        targetId: b.targetId,
        targetLabel: label,
        reason: b.reason,
        status: 'pending' as const,
        requestedBy: { id: user!.id, displayName: user!.displayName },
        requestedAt: now(),
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
      };
      staffDb().deletions.unshift(d);
      journal({ group: 'deletion', action: 'deletion.requested', target: { type: b.kind, id: b.targetId, label }, reason: b.reason }, user, req);
      return d;
    }),
    ...(['approve', 'reject'] as const).map((decision) =>
      route(decision === 'approve' ? 'deletionApprove' : 'deletionReject', ({ user, params, body, req }) => {
        const b = body as EndpointBody<'deletionApprove'>;
        const d = staffDb().deletions.find((x) => x.id === params.id);
        if (!d) return fail('not_found');
        if (d.status !== 'pending') return fail('conflict', { detail: 'already_decided' });
        if (b.totp !== STAFF_TOTP) return fail('invalid_credentials');
        d.status = decision === 'approve' ? 'approved' : 'rejected';
        d.decidedBy = { id: user!.id, displayName: user!.displayName };
        d.decidedAt = now();
        d.decisionNote = b.note ?? null;
        if (decision === 'approve' && d.kind === 'teacher' && staffDb().teachers[d.targetId]) staffDb().teachers[d.targetId].status = 'deleted';
        journal({ group: 'deletion', action: `deletion.${decision === 'approve' ? 'approved' : 'rejected'}`, target: { type: d.kind, id: d.targetId, label: d.targetLabel }, reason: b.note ?? null }, user, req);
        return d;
      }),
    ),
  ];
}
