/**
 * A-16 users: search with role / status / school filters in the URL, role
 * grants with scopes, invitations, block / unblock (bulk too), password reset,
 * 2FA reset, session revocation; invitations can be revoked and resent.
 * Pupils come back pseudonymised from the API for viewers without a school
 * scope over them (the server decides). A superadmin can reveal a pupil's real
 * name «с основанием» (ground + reason, audited); the answer is shown once and
 * never cached.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ROLES } from '@bilig/permissions';
import {
  INVITE_STATUSES,
  InviteCreateRequestSchema,
  REVEAL_GROUNDS,
  StudentRevealRequestSchema,
  UserGrantsPutSchema,
  type EndpointName,
  type Invite,
  type StudentReveal,
} from '@bilig/content-model/api';
import type { z } from 'zod';
import { useApiMutation, useApiQuery, useCanCall } from '../api/hooks';
import { api } from '../api/session';
import { SchemaForm, useValidation } from '../forms/SchemaForm';
import { useAdminLang, useT } from '../i18n';
import { ListView, type BulkAction, type Column } from '../lists/ListView';
import { useListParams } from '../lists/useListParams';
import { useAdminPath } from '../shell/base';
import { Dialog, ErrorBox, FilterSelect, FilterText, KeyValue, PageHeader, StatusBadge, Tabs, fmtDate } from '../shell/ui';
import type { AdminUserSchema } from '@bilig/content-model/api';
import { navIcon } from '../shell/Layout';

type AdminUser = z.infer<typeof AdminUserSchema>;

export const grantText = (t: ReturnType<typeof useT>, g: AdminUser['grants'][number]) =>
  `${t(`enum.${g.role}`)}${g.subrole ? ` (${t(`enum.${g.subrole}`)})` : ''}${g.scopeId ? ` · ${t(`enum.${g.scope}`)} ${g.scopeId.slice(0, 8)}` : ''}`;

function SchoolFilter({ value, onApply }: { value?: string; onApply(v: string | undefined): void }) {
  const t = useT();
  const q = useApiQuery('adminSchoolList', { query: { limit: 100 } }, { staleTime: 60_000 });
  return <FilterSelect label={t('fields.schoolId')} value={value} options={(q.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))} onApply={onApply} />;
}

function UsersTable() {
  const t = useT();
  const to = useAdminPath();
  const nav = useNavigate();
  const list = useListParams(['q', 'role', 'status', 'schoolId']);
  const canPatch = useCanCall('adminUserPatch');
  const columns = useMemo<Column<AdminUser>[]>(
    () => [
      { key: 'displayName', header: t('fields.displayName'), render: (u) => u.displayName, sortValue: (u) => u.displayName },
      { key: 'email', header: t('fields.email'), render: (u) => u.email ?? '—', sortValue: (u) => u.email },
      { key: 'kind', header: t('fields.kind'), render: (u) => t(`enum.${u.kind}`), sortValue: (u) => u.kind },
      { key: 'grants', header: t('fields.grants'), render: (u) => u.grants.map((g) => grantText(t, g)).join('; ') || '—' },
      { key: 'status', header: t('fields.status'), render: (u) => <StatusBadge status={u.status} />, sortValue: (u) => u.status },
    ],
    [t],
  );
  const setStatus = (status: 'active' | 'blocked') => async (rows: AdminUser[]) => {
    for (const u of rows) await api.call('adminUserPatch', { params: { id: u.id }, body: { status } }).catch(() => undefined);
  };
  const bulk: BulkAction<AdminUser>[] = canPatch
    ? [
        { id: 'block', label: t('users.block'), danger: true, run: setStatus('blocked') },
        { id: 'unblock', label: t('users.unblock'), run: setStatus('active') },
      ]
    : [];
  return (
    <>
      <div className="adm-filters">
        <FilterText label={t('list.search')} value={list.filters.q} onApply={(v) => list.setFilter('q', v)} />
        <FilterSelect label={t('fields.role')} value={list.filters.role} options={ROLES.filter((r) => r !== 'guest').map((r) => ({ value: r, label: t(`enum.${r}`) }))} onApply={(v) => list.setFilter('role', v)} />
        <FilterSelect label={t('fields.status')} value={list.filters.status} options={['active', 'blocked', 'invited'].map((s) => ({ value: s, label: t(`enum.${s}`) }))} onApply={(v) => list.setFilter('status', v)} />
        <SchoolFilter value={list.filters.schoolId} onApply={(v) => list.setFilter('schoolId', v)} />
      </div>
      <ListView endpoint="adminUsers" list={list} columns={columns} rowKey={(u: AdminUser) => u.id} bulkActions={bulk} onRowClick={(u: AdminUser) => nav(to(`users/${u.id}`))} />
      <p className="adm-hint">{t('users.pseudonymNote')}</p>
    </>
  );
}

/** Pre-0.3.0 servers send no `status`: derive it from the dates. */
export const inviteStatus = (i: Invite, now = Date.now()): Invite['status'] & string =>
  i.status ?? (i.acceptedAt ? 'accepted' : i.revokedAt ? 'revoked' : Date.parse(i.expiresAt) < now ? 'expired' : 'pending');

function Invites() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const qc = useQueryClient();
  const list = useListParams(['status', 'q']);
  const canInvite = useCanCall('adminInviteCreate');
  const canRevoke = useCanCall('adminInviteRevoke');
  const canResend = useCanCall('adminInviteResend');
  const [v, setV] = useState<z.input<typeof InviteCreateRequestSchema>>({ email: '', role: 'teacher', scope: 'school' });
  const issues = useValidation(InviteCreateRequestSchema, v);
  const create = useApiMutation('adminInviteCreate', ['adminInviteList']);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setError(null);
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
    } catch (e) {
      setError(e);
    } finally {
      void qc.invalidateQueries({ queryKey: ['adminInviteList'] });
    }
  };
  const columns = useMemo<Column<Invite>[]>(
    () => [
      { key: 'email', header: t('fields.email'), render: (i) => i.email, sortValue: (i) => i.email },
      { key: 'role', header: t('fields.role'), render: (i) => t(`enum.${i.role}`), sortValue: (i) => i.role },
      { key: 'scope', header: t('fields.scope'), render: (i) => `${t(`enum.${i.scope}`)}${i.scopeId ? ` ${i.scopeId.slice(0, 8)}` : ''}` },
      { key: 'status', header: t('fields.status'), render: (i) => <StatusBadge status={inviteStatus(i)} /> },
      { key: 'expiresAt', header: t('users.expires'), render: (i) => fmtDate(i.expiresAt, lang), sortValue: (i) => i.expiresAt },
      { key: 'acceptedAt', header: t('users.accepted'), render: (i) => (i.acceptedAt ? fmtDate(i.acceptedAt, lang) : '—'), sortValue: (i) => i.acceptedAt },
      {
        key: 'actions',
        header: '',
        render: (i) => {
          const status = inviteStatus(i);
          if (status === 'accepted') return null;
          return (
            <span className="adm-inline">
              {canResend && (
                <button type="button" className="adm-btn adm-btn--small" onClick={() => act(() => api.call('adminInviteResend', { params: { id: i.id }, body: {} }), t('users.inviteResent', { email: i.email }))}>
                  {t('users.resend')}
                </button>
              )}
              {canRevoke && status !== 'revoked' && (
                <button
                  type="button"
                  className="adm-btn adm-btn--small adm-btn--danger"
                  onClick={() => window.confirm(t('users.revokeConfirm', { email: i.email })) && act(() => api.call('adminInviteRevoke', { params: { id: i.id } }), t('users.inviteRevoked'))}
                >
                  {t('users.revoke')}
                </button>
              )}
            </span>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, lang, canRevoke, canResend],
  );
  return (
    <>
      {canInvite && (
        <div className="adm-card">
          <h2>{t('users.newInvite')}</h2>
          <SchemaForm schema={InviteCreateRequestSchema} value={v} onChange={setV} />
          <ErrorBox error={create.error} />
          {create.isSuccess && <p className="adm-alert adm-alert--info">{t('users.invited')}</p>}
          <button type="button" className="adm-btn adm-btn--primary" disabled={issues.length > 0 || create.isPending} onClick={() => create.mutate({ body: v })}>
            {t('users.invite')}
          </button>
        </div>
      )}
      <div className="adm-filters">
        <FilterText label={t('list.search')} value={list.filters.q} onApply={(v) => list.setFilter('q', v)} />
        <FilterSelect label={t('fields.status')} value={list.filters.status} options={INVITE_STATUSES.map((s) => ({ value: s, label: t(`enum.${s}`) }))} onApply={(v) => list.setFilter('status', v)} />
      </div>
      {msg && <p className="adm-alert adm-alert--info">{msg}</p>}
      <ErrorBox error={error} />
      <ListView endpoint="adminInviteList" list={list} columns={columns} rowKey={(i: Invite) => i.id} />
    </>
  );
}

type RevealForm = { ground: (typeof REVEAL_GROUNDS)[number] | ''; reason: string; reference: string };

/**
 * A-16 «кроме запросов с основанием»: an audited, reasoned reveal of a pupil's
 * real name. The result lives only in this dialog's state; closing drops it.
 */
function RevealDialog({ userId, onClose }: { userId: string; onClose(): void }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const [f, setF] = useState<RevealForm>({ ground: '', reason: '', reference: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<StudentReveal | null>(null);
  const body = { ground: f.ground, reason: f.reason, ...(f.reference.trim() ? { reference: f.reference } : {}) };
  const valid = StudentRevealRequestSchema.safeParse(body).success;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.call('adminUserReveal', { params: { id: userId }, body: body as z.input<typeof StudentRevealRequestSchema> }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t('users.revealTitle')}
      onClose={onClose}
      actions={
        result ? (
          <button type="button" className="adm-btn adm-btn--primary" onClick={onClose}>
            {t('common.close')}
          </button>
        ) : (
          <button type="button" className="adm-btn adm-btn--primary" disabled={!valid || busy} onClick={submit}>
            {t('users.revealSubmit')}
          </button>
        )
      }
    >
      {result ? (
        <div data-testid="reveal-result">
          <KeyValue
            items={[
              [t('fields.displayName'), <strong key="n">{result.displayName}</strong>],
              [t('users.revealedAt'), fmtDate(result.revealedAt, lang)],
              [t('users.auditId'), <code key="a">{result.auditId}</code>],
            ]}
          />
          <h3>{t('users.revealClasses')}</h3>
          {result.classes.length ? (
            <ul>
              {result.classes.map((c) => (
                <li key={c.classId}>
                  {c.className} · {c.schoolName ?? c.schoolId.slice(0, 8)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="adm-muted">—</p>
          )}
          <p className="adm-hint">{t('users.revealOnce')}</p>
        </div>
      ) : (
        <>
          <p className="adm-alert adm-alert--info">{t('users.revealNote')}</p>
          <label className="adm-field">
            <span>{t('users.ground')}</span>
            <select value={f.ground} onChange={(e) => setF({ ...f, ground: e.target.value as RevealForm['ground'] })}>
              <option value="">—</option>
              {REVEAL_GROUNDS.map((g) => (
                <option key={g} value={g}>
                  {t(`enum.${g}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="adm-field">
            <span>{t('users.reason')}</span>
            <textarea rows={3} maxLength={1000} aria-describedby="adm-reveal-reason-hint" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          </label>
          <p className="adm-hint" id="adm-reveal-reason-hint">
            {t('users.reasonHint')}
          </p>
          <label className="adm-field">
            <span>{t('users.reference')}</span>
            <input maxLength={200} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
          </label>
        </>
      )}
      <ErrorBox error={error} />
    </Dialog>
  );
}

export function UsersPage() {
  const t = useT();
  const [tab, setTab] = useState('users');
  const canInvites = useCanCall('adminInviteList');
  return (
    <section>
      <PageHeader title={t('nav.users')} icon={navIcon('users')} description={t('pages.users')} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'users', label: t('nav.users'), content: <UsersTable /> }, ...(canInvites ? [{ id: 'invites', label: t('users.invites'), content: <Invites /> }] : [])]} />
    </section>
  );
}

export function UserDetail() {
  const t = useT();
  const to = useAdminPath();
  const qc = useQueryClient();
  const { id = '' } = useParams();
  const q = useApiQuery('adminUserGet', { params: { id } });
  const [grants, setGrants] = useState<z.input<typeof UserGrantsPutSchema> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const canGrants = useCanCall('adminUserGrants');
  const u = q.data;
  const value = grants ?? (u ? { grants: u.grants } : null);
  const issues = useValidation(UserGrantsPutSchema, value);
  const act = async (name: EndpointName, ok: string, body: unknown = {}) => {
    setError(null);
    try {
      await api.call(name as 'adminUserRevokeSessions', { params: { id }, body: body as never });
      setMsg(ok);
      void qc.invalidateQueries({ queryKey: ['adminUserGet'] });
      void qc.invalidateQueries({ queryKey: ['adminUsers'] });
    } catch (e) {
      setError(e);
    }
  };
  const can = {
    patch: useCanCall('adminUserPatch'),
    sessions: useCanCall('adminUserRevokeSessions'),
    password: useCanCall('adminUserPasswordReset'),
    twofa: useCanCall('adminUserReset2fa'),
    reveal: useCanCall('adminUserReveal'),
  };
  const [revealing, setRevealing] = useState(false);
  return (
    <section>
      <PageHeader title={`${t('nav.users')} · ${u?.displayName ?? ''}`}>
        <Link className="adm-btn adm-btn--ghost" to={to('users')}>
          {t('common.back')}
        </Link>
      </PageHeader>
      <ErrorBox error={q.error ?? error} />
      {msg && <p className="adm-alert adm-alert--info">{msg}</p>}
      {u && (
        <>
          <div className="adm-card">
            <p>
              {u.email ?? '—'} · {t(`enum.${u.kind}`)} · <StatusBadge status={u.status} />
            </p>
            <div className="adm-toolbar">
              {can.patch && u.status !== 'blocked' && (
                <button type="button" className="adm-btn adm-btn--danger" onClick={() => act('adminUserPatch', t('users.blocked'), { status: 'blocked' })}>
                  {t('users.block')}
                </button>
              )}
              {can.patch && u.status === 'blocked' && (
                <button type="button" className="adm-btn" onClick={() => act('adminUserPatch', t('users.unblocked'), { status: 'active' })}>
                  {t('users.unblock')}
                </button>
              )}
              {can.sessions && (
                <button type="button" className="adm-btn" onClick={() => act('adminUserRevokeSessions', t('users.sessionsRevoked'))}>
                  {t('users.revokeSessions')}
                </button>
              )}
              {can.password && u.kind === 'adult' && (
                <button type="button" className="adm-btn" onClick={() => act('adminUserPasswordReset', t('users.passwordSent'))}>
                  {t('users.resetPassword')}
                </button>
              )}
              {can.twofa && (
                <button type="button" className="adm-btn" onClick={() => window.confirm(t('users.reset2faConfirm')) && act('adminUserReset2fa', t('users.twofaReset'))}>
                  {t('users.reset2fa')}
                </button>
              )}
              {can.reveal && u.kind === 'student' && (
                <button type="button" className="adm-btn" onClick={() => setRevealing(true)}>
                  {t('users.reveal')}
                </button>
              )}
            </div>
          </div>
          <div className="adm-card">
            <h2>{t('fields.grants')}</h2>
            {value && <SchemaForm schema={UserGrantsPutSchema} value={value} onChange={setGrants} readOnly={!canGrants} />}
            {canGrants && (
              <button
                type="button"
                className="adm-btn adm-btn--primary"
                disabled={!grants || issues.length > 0}
                onClick={async () => {
                  setError(null);
                  try {
                    await api.call('adminUserGrants', { params: { id }, body: grants! });
                    setGrants(null);
                    setMsg(t('users.grantsSaved'));
                    void q.refetch();
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                {t('common.save')}
              </button>
            )}
            <p className="adm-hint">{t('users.grantsNote')}</p>
          </div>
        </>
      )}
      {revealing && <RevealDialog userId={id} onClose={() => setRevealing(false)} />}
    </section>
  );
}
