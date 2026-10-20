/**
 * «Сотрудники» (v0.8.0, staff.manage — SuperAdmin only): managers and
 * SuperAdmins with status, 2FA and last sign-in; invite a manager with
 * grouped permission checkboxes (MANAGER_ASSIGNABLE); change a manager's
 * permissions (with a reason); block / restore / delete with a reason and an
 * explicit confirm. Your own row is locked; fewer than two active SuperAdmins
 * raises a warning and the last two cannot be blocked or deleted.
 */
import { useId, useMemo, useState, type FormEvent } from 'react';
import { EmailSchema, type StaffMember } from '@bilig/content-model/api';
import type { Permission } from '@bilig/permissions';
import { useApiMutation, useApiQuery } from '../api/hooks';
import { useSession } from '../api/session';
import { useAdminLang, useT } from '../i18n';
import { Icon } from '../lib/icons';
import { toast } from '../shell/toast';
import { permKey, permissionGroups } from './labels';
import {
  Chip,
  Empty,
  ErrorLine,
  Field,
  Loading,
  Notice,
  PageTitle,
  ReasonField,
  Sheet,
  Td,
  btn,
  cx,
  described,
  fmtDateTime,
  initials,
  inputCls,
  tableCls,
  tbodyCls,
  thCls,
  theadCls,
  trCls,
} from './ui';

const STATUS_TONE = { active: 'ok', invited: 'warn', blocked: 'bad', deleted: 'neutral' } as const;

/** Grouped checkboxes with a plain description per permission. */
export function PermissionPicker({ value, onChange, disabled }: { value: Permission[]; onChange(v: Permission[]): void; disabled?: boolean }) {
  const t = useT();
  const groups = useMemo(permissionGroups, []);
  const toggle = (p: Permission, on: boolean) => onChange(on ? [...new Set([...value, p])] : value.filter((x) => x !== p));
  return (
    <div className="grid gap-4">
      {groups.map(({ group, perms }) => (
        <fieldset key={group} className="m-0 grid gap-1 rounded-lg border border-line p-3 md:p-4" disabled={disabled}>
          <legend className="px-1 text-base font-bold text-ink">{t(`perm.group.${group}`)}</legend>
          <p className="mb-1 text-sm text-muted">{t(`perm.groupHint.${group}`)}</p>
          {perms.map((p) => (
            <label key={p} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-soft">
              <input type="checkbox" className="mt-1 size-5 flex-none accent-[var(--accent)]" checked={value.includes(p)} onChange={(e) => toggle(p, e.target.checked)} />
              <span className="grid gap-0.5">
                <span className="text-base font-semibold text-ink">{t(`perm.${permKey(p)}.title`)}</span>
                <span className="text-sm text-muted">{t(`perm.${permKey(p)}.desc`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

function InviteSheet({ onClose }: { onClose(): void }) {
  const t = useT();
  const nameId = useId();
  const emailId = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [perms, setPerms] = useState<Permission[]>(['teacher.view']);
  const [tried, setTried] = useState(false);
  const invite = useApiMutation('staffInvite', ['staffList']);
  const errs = {
    name: name.trim().length < 2 ? t('staff.invite.nameError') : null,
    email: !EmailSchema.safeParse(email.trim()).success ? t('staff.invite.emailError') : null,
    perms: perms.length === 0 ? t('staff.invite.permsError') : null,
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (errs.name || errs.email || errs.perms) return;
    try {
      await invite.mutateAsync({ body: { email: email.trim(), displayName: name.trim(), permissions: perms } });
      toast('staff.invite.sent', { params: { email: email.trim() } });
      onClose();
    } catch {
      /* shown below */
    }
  };
  return (
    <Sheet
      title={t('staff.invite.title')}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className={btn('ghost')} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="staff-invite" className={btn('primary')} disabled={invite.isPending}>
            <Icon id="mail" size={18} />
            {t('staff.invite.submit')}
          </button>
        </>
      }
    >
      <form id="staff-invite" className="grid gap-5" onSubmit={submit} noValidate>
        <p className="text-base text-muted">{t('staff.invite.intro')}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id={nameId} label={t('staff.invite.name')} error={tried ? errs.name : null}>
            <input id={nameId} className={inputCls} autoComplete="off" value={name} aria-invalid={tried && !!errs.name} aria-describedby={described(nameId)} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id={emailId} label={t('staff.invite.email')} error={tried ? errs.email : null}>
            <input id={emailId} type="email" className={inputCls} autoComplete="off" value={email} aria-invalid={tried && !!errs.email} aria-describedby={described(emailId)} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-2">
          <h3 className="m-0 text-base font-bold text-ink">{t('staff.invite.perms')}</h3>
          <PermissionPicker value={perms} onChange={setPerms} />
          {tried && errs.perms && (
            <p className="text-sm font-semibold text-bad" role="alert">
              {errs.perms}
            </p>
          )}
        </div>
        <ErrorLine error={invite.error} />
      </form>
    </Sheet>
  );
}

type StaffAction = 'block' | 'restore' | 'delete';
const ACTION_ENDPOINT = { block: 'staffBlock', restore: 'staffRestore', delete: 'staffDelete' } as const;

function ActionDialog({ member, action, onClose, onDone }: { member: StaffMember; action: StaffAction; onClose(): void; onDone(m: StaffMember): void }) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const run = useApiMutation(ACTION_ENDPOINT[action], ['staffList']);
  const err = reason.trim().length < 3 ? t('staffui.reasonShort', { min: 3 }) : null;
  const go = async () => {
    setTried(true);
    if (err) return;
    try {
      const m = await run.mutateAsync({ params: { userId: member.userId }, body: { reason: reason.trim() } });
      toast(`staff.done.${action}`, { params: { name: member.displayName } });
      onDone(m);
    } catch {
      /* shown below */
    }
  };
  return (
    <Sheet
      title={t(`staff.action.${action}.title`, { name: member.displayName })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btn('ghost')} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={btn(action === 'restore' ? 'primary' : 'danger')} disabled={run.isPending} onClick={go}>
            <Icon id={action === 'restore' ? 'reset' : action === 'block' ? 'lock' : 'trash'} size={18} />
            {t(`staff.action.${action}.confirm`)}
          </button>
        </>
      }
    >
      <p className="text-base text-ink">{t(`staff.action.${action}.text`)}</p>
      <ReasonField value={reason} onChange={setReason} min={3} error={tried ? err : null} />
      <ErrorLine error={run.error} />
    </Sheet>
  );
}

function MemberSheet({ member, superCount, onClose }: { member: StaffMember; superCount: number; onClose(): void }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const [perms, setPerms] = useState<Permission[]>(member.permissions);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [action, setAction] = useState<StaffAction | null>(null);
  const [cur, setCur] = useState(member);
  const patch = useApiMutation('staffPatch', ['staffList']);
  const changed = [...perms].sort().join() !== [...cur.permissions].sort().join();
  const reasonErr = reason.trim().length < 3 ? t('staffui.reasonShort', { min: 3 }) : null;
  const lastSupers = cur.role === 'superadmin' && cur.status === 'active' && superCount <= 2;
  const isManager = cur.role === 'manager' && cur.status !== 'deleted';
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (reasonErr || !changed) return;
    try {
      const m = await patch.mutateAsync({ params: { userId: cur.userId }, body: { permissions: perms, reason: reason.trim() } });
      setCur(m);
      setPerms(m.permissions);
      setReason('');
      setTried(false);
      toast('staff.done.perms', { params: { name: m.displayName } });
    } catch {
      /* shown below */
    }
  };
  return (
    <>
      <Sheet
        title={cur.displayName}
        onClose={onClose}
        side
        footer={
          isManager ? (
            <button type="submit" form="staff-perms" className={btn('primary')} disabled={patch.isPending || !changed}>
              <Icon id="check" size={18} />
              {t('staff.member.save')}
            </button>
          ) : undefined
        }
      >
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
          <dt className="text-muted">{t('staff.col.email')}</dt>
          <dd className="m-0 break-all text-ink">{cur.email}</dd>
          <dt className="text-muted">{t('staff.col.role')}</dt>
          <dd className="m-0 text-ink">{t(`staff.role.${cur.role}`)}</dd>
          <dt className="text-muted">{t('staff.col.status')}</dt>
          <dd className="m-0">
            <Chip tone={STATUS_TONE[cur.status]}>{t(`staff.status.${cur.status}`)}</Chip>
          </dd>
          <dt className="text-muted">{t('staff.col.totp')}</dt>
          <dd className="m-0 text-ink">{cur.totpEnabled ? t('staff.totpOn') : t('staff.totpOff')}</dd>
          <dt className="text-muted">{t('staff.col.lastLogin')}</dt>
          <dd className="m-0 text-ink">{fmtDateTime(cur.lastLoginAt, lang)}</dd>
          <dt className="text-muted">{t('staff.member.created')}</dt>
          <dd className="m-0 text-ink">{fmtDateTime(cur.createdAt, lang)}</dd>
        </dl>

        {isManager ? (
          <form id="staff-perms" className="grid gap-4" onSubmit={save} noValidate>
            <h3 className="m-0 text-base font-bold text-ink">{t('staff.member.perms')}</h3>
            <PermissionPicker value={perms} onChange={setPerms} />
            <ReasonField value={reason} onChange={setReason} min={3} error={tried ? reasonErr : null} hint={t('staff.member.reasonHint')} />
            <ErrorLine error={patch.error} />
          </form>
        ) : cur.role === 'superadmin' ? (
          <Notice tone="info">{t('staff.member.superAll')}</Notice>
        ) : null}

        <section className="grid gap-3 border-t border-line pt-5" aria-labelledby="staff-danger">
          <h3 id="staff-danger" className="m-0 text-base font-bold text-ink">
            {t('staff.member.account')}
          </h3>
          {lastSupers && <Notice>{t('staff.member.lastSupers')}</Notice>}
          <div className="flex flex-wrap gap-3">
            {(cur.status === 'active' || cur.status === 'invited') && (
              <button type="button" className={btn('secondary')} disabled={lastSupers} onClick={() => setAction('block')}>
                <Icon id="lock" size={18} />
                {t('staff.action.block.button')}
              </button>
            )}
            {(cur.status === 'blocked' || cur.status === 'deleted') && (
              <button type="button" className={btn('secondary')} onClick={() => setAction('restore')}>
                <Icon id="reset" size={18} />
                {t('staff.action.restore.button')}
              </button>
            )}
            {cur.status !== 'deleted' && (
              <button type="button" className={btn('danger')} disabled={lastSupers} onClick={() => setAction('delete')}>
                <Icon id="trash" size={18} />
                {t('staff.action.delete.button')}
              </button>
            )}
          </div>
        </section>
      </Sheet>
      {action && (
        <ActionDialog
          member={cur}
          action={action}
          onClose={() => setAction(null)}
          onDone={(m) => {
            setCur(m);
            setAction(null);
          }}
        />
      )}
    </>
  );
}

export function StaffPage() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const meId = useSession((s) => s.me?.id);
  const q = useApiQuery('staffList');
  const [inviting, setInviting] = useState(false);
  const [open, setOpen] = useState<StaffMember | null>(null);
  const items = q.data?.items ?? [];
  const superCount = items.filter((m) => m.role === 'superadmin' && m.status === 'active').length;

  return (
    <div className="grid gap-5">
      <PageTitle
        title={t('staff.title')}
        description={t('staff.lead')}
        icon="users"
        action={
          <button type="button" className={btn('primary')} onClick={() => setInviting(true)}>
            <Icon id="plus" size={18} />
            {t('staff.invite.open')}
          </button>
        }
      />
      {q.isSuccess && superCount < 2 && <Notice>{t('staff.fewSupers', { count: superCount })}</Notice>}
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorLine error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <Empty icon="users" title={t('staff.empty')} text={t('staff.emptyHint')} />
      ) : (
        <table className={tableCls}>
          <caption className="sr-only">{t('staff.title')}</caption>
          <thead className={theadCls}>
            <tr>
              <th className={thCls}>{t('staff.col.name')}</th>
              <th className={thCls}>{t('staff.col.role')}</th>
              <th className={thCls}>{t('staff.col.status')}</th>
              <th className={thCls}>{t('staff.col.totp')}</th>
              <th className={thCls}>{t('staff.col.lastLogin')}</th>
              <th className={thCls}>
                <span className="sr-only">{t('staff.col.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody className={tbodyCls}>
            {items.map((m) => {
              const self = m.userId === meId;
              return (
                <tr key={m.userId} className={trCls} data-testid={`staff-row-${m.email}`}>
                  <Td label={t('staff.col.name')}>
                    <span className="flex items-center gap-3">
                      <span className="inline-flex size-10 flex-none items-center justify-center rounded-pill bg-soft text-sm font-bold text-accent" aria-hidden="true">
                        {initials(m.displayName)}
                      </span>
                      <span className="grid min-w-0">
                        <b className="font-semibold">
                          {m.displayName}
                          {self && <span className="ml-2 text-sm font-normal text-muted">{t('staff.you')}</span>}
                        </b>
                        <span className="break-all text-sm text-muted">{m.email}</span>
                      </span>
                    </span>
                  </Td>
                  <Td label={t('staff.col.role')}>
                    <span className="grid gap-0.5 whitespace-nowrap">
                      <span>{t(`staff.role.${m.role}`)}</span>
                      {m.role === 'manager' && <span className="text-sm text-muted">{t('staff.permsCount', { count: m.permissions.length })}</span>}
                    </span>
                  </Td>
                  <Td label={t('staff.col.status')}>
                    <Chip tone={STATUS_TONE[m.status]}>{t(`staff.status.${m.status}`)}</Chip>
                  </Td>
                  <Td label={t('staff.col.totp')}>
                    <span className={cx('inline-flex items-center gap-1.5', m.totpEnabled ? 'text-ok' : 'text-muted')}>
                      <Icon id={m.totpEnabled ? 'shield' : 'warn'} size={18} />
                      {m.totpEnabled ? t('staff.totpOn') : t('staff.totpOff')}
                    </span>
                  </Td>
                  <Td label={t('staff.col.lastLogin')}>{fmtDateTime(m.lastLoginAt, lang)}</Td>
                  <Td label={t('staff.col.actions')} className="md:text-right">
                    {self ? (
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted" title={t('staff.selfLocked')}>
                        <Icon id="lock" size={16} />
                        {t('staff.selfLocked')}
                      </span>
                    ) : (
                      <button type="button" className={btn('secondary', 'px-4')} onClick={() => setOpen(m)} aria-label={t('staff.manageOf', { name: m.displayName })}>
                        {t('staff.manage')}
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {inviting && <InviteSheet onClose={() => setInviting(false)} />}
      {open && <MemberSheet member={open} superCount={superCount} onClose={() => setOpen(null)} />}
    </div>
  );
}
