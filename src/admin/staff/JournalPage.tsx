/**
 * «Журнал действий» (v0.8.0, audit.read; a manager sees their own records,
 * SuperAdmin all): filters kept in the URL and sent as the journal's query
 * (staff member, group, action, period, object, result), a table in plain
 * words, a detail drawer (before / after diff, request info), CSV export.
 * SuperAdmin also gets the hash-chain check and the alerts with «seen».
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AUDIT_GROUPS, type AuditEvent, type AuditEventQuery } from '@bilig/content-model/api';
import { useApiMutation, useApiQuery, useCanCall } from '../api/hooks';
import { api } from '../api/session';
import { useAdminLang, useT, type TFn } from '../i18n';
import { Icon } from '../lib/icons';
import { diffJson, short } from '../lib/diff';
import { toast } from '../shell/toast';
import { downloadBlob } from '../shell/ui';
import {
  Card,
  Chip,
  Empty,
  ErrorLine,
  Loading,
  Notice,
  PageTitle,
  Pager,
  Sheet,
  Td,
  btn,
  cx,
  fmtDateTime,
  inputCls,
  tableCls,
  tbodyCls,
  thCls,
  theadCls,
  trCls,
} from './ui';

/** URL params that map 1:1 to the journal query. */
const PASS = ['actorId', 'onBehalfOfId', 'group', 'action', 'targetType', 'targetId', 'result'] as const;
const TARGET_TYPES = ['teacher', 'staff', 'class', 'ktp', 'topic', 'concept', 'item', 'asset', 'deletion_request', 'support_session', 'journal'] as const;
const RESULT_TONE = { ok: 'ok', denied: 'warn', failed: 'bad' } as const;

const dayStart = (d: string) => new Date(`${d}T00:00:00`).toISOString();
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999`).toISOString();

/** The journal query built from the URL (`from`/`to` are dates there, ISO instants in the query). */
export function journalQuery(sp: URLSearchParams): AuditEventQuery {
  const q: Record<string, string> = {};
  for (const k of PASS) {
    const v = sp.get(k);
    if (v) q[k] = v;
  }
  const from = sp.get('from');
  const to = sp.get('to');
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) q.from = dayStart(from);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) q.to = dayEnd(to);
  return q as AuditEventQuery;
}

/** «staff.blocked» → «Заблокирован сотрудник» (unknown codes fall back to the code itself). */
export const actionText = (t: TFn, action: string) => t(`journal.action.${action.replace(/\./g, '_')}`, { defaultValue: action });

function Detail({ ev, onClose }: { ev: AuditEvent; onClose(): void }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const changes = useMemo(() => diffJson(ev.before ?? undefined, ev.after ?? undefined), [ev]);
  const kv = (rows: [string, ReactNode][]) => (
    <dl className="m-0 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-base">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="m-0 min-w-0 break-words text-ink">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <Sheet title={actionText(t, ev.action)} onClose={onClose} side>
      {kv([
        [t('journal.col.at'), fmtDateTime(ev.at, lang)],
        [t('journal.col.who'), ev.actor.displayName ? `${ev.actor.displayName}${ev.actor.role ? ` · ${t(`journal.role.${ev.actor.role}`, { defaultValue: ev.actor.role })}` : ''}` : t('journal.system')],
        [t('journal.col.onBehalf'), ev.onBehalfOf?.displayName ?? '—'],
        [t('journal.col.group'), t(`journal.group.${ev.group}`)],
        [t('journal.col.target'), `${ev.target.label ?? ev.target.id} (${t(`journal.target.${ev.target.type}`, { defaultValue: ev.target.type })})`],
        [t('journal.col.result'), <Chip key="r" tone={RESULT_TONE[ev.result]}>{t(`journal.result.${ev.result}`)}</Chip>],
        [t('journal.reason'), ev.reason ?? '—'],
      ])}
      <section className="grid gap-2" aria-labelledby="j-diff">
        <h3 id="j-diff" className="m-0 text-base font-bold text-ink">
          {t('journal.changes')}
        </h3>
        {changes.length === 0 ? (
          <p className="text-base text-muted">{t('journal.noChanges')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm text-ink">
              <thead>
                <tr>
                  <th className={thCls}>{t('journal.field')}</th>
                  <th className={thCls}>{t('journal.before')}</th>
                  <th className={thCls}>{t('journal.after')}</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className="px-3 py-2 font-mono">{c.path.join('.') || '—'}</td>
                    <td className="px-3 py-2 text-bad">{c.kind === 'added' ? '—' : short(c.before, 120)}</td>
                    <td className="px-3 py-2 text-ok">{c.kind === 'removed' ? '—' : short(c.after, 120)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="grid gap-2" aria-labelledby="j-req">
        <h3 id="j-req" className="m-0 text-base font-bold text-ink">
          {t('journal.request')}
        </h3>
        {kv([
          ['IP', ev.ip ?? '—'],
          [t('journal.ua'), ev.userAgent ?? '—'],
          [t('journal.requestId'), ev.requestId ? <code key="r">{ev.requestId}</code> : '—'],
          [t('journal.supportSession'), ev.supportSessionId ? <code key="s">{ev.supportSessionId}</code> : '—'],
          [t('journal.seq'), `#${ev.seq}`],
        ])}
      </section>
    </Sheet>
  );
}

/** SuperAdmin: walk the hash chain. */
function ChainCheck() {
  const t = useT();
  const [state, setState] = useState<{ busy: boolean; res?: { ok: boolean; checked: number; brokenAt: number | null }; error?: unknown }>({ busy: false });
  const run = async () => {
    setState({ busy: true });
    try {
      setState({ busy: false, res: await api.call('journalVerify') });
    } catch (error) {
      setState({ busy: false, error });
    }
  };
  return (
    <Card title={t('journal.chain.title')} titleId="j-chain" className="grid content-start gap-3">
      <p className="text-base text-muted">{t('journal.chain.text')}</p>
      <button type="button" className={btn('secondary', 'w-fit')} disabled={state.busy} onClick={run}>
        <Icon id="shield" size={18} />
        {state.busy ? t('journal.chain.running') : t('journal.chain.run')}
      </button>
      {state.res &&
        (state.res.ok ? (
          <Notice tone="ok">{t('journal.chain.ok', { count: state.res.checked })}</Notice>
        ) : (
          <Notice>{t('journal.chain.broken', { seq: state.res.brokenAt ?? '?', count: state.res.checked })}</Notice>
        ))}
      <ErrorLine error={state.error} />
    </Card>
  );
}

function Alerts() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const q = useApiQuery('journalAlerts');
  const seen = useApiMutation('journalAlertSeen', ['journalAlerts']);
  const items = [...(q.data?.items ?? [])].sort((a, b) => Number(!!a.seenAt) - Number(!!b.seenAt) || b.at.localeCompare(a.at));
  const unseen = items.filter((a) => !a.seenAt).length;
  return (
    <Card title={t('journal.alerts.title', { count: unseen })} titleId="j-alerts" className="grid content-start gap-3">
      {q.isLoading ? (
        <Loading rows={2} />
      ) : q.error ? (
        <ErrorLine error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <p className="text-base text-muted">{t('journal.alerts.empty')}</p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {items.map((a) => (
            <li key={a.id} className={cx('flex flex-wrap items-center gap-3 rounded-lg border p-3', a.seenAt ? 'border-line' : 'border-gold bg-soft')} data-testid={`alert-${a.id}`}>
              <Icon id={a.kind === 'support_edit' ? 'pencil' : 'warn'} size={20} className={a.seenAt ? 'text-muted' : 'text-bad'} />
              <span className="grid min-w-0 flex-1">
                <b className="text-base font-semibold text-ink">{t(`journal.alerts.kind.${a.kind}`)}</b>
                <span className="text-sm text-muted">
                  {a.summary} · {a.actor.displayName ?? t('journal.system')} · {fmtDateTime(a.at, lang)}
                </span>
              </span>
              {a.seenAt ? (
                <span className="text-sm text-muted">{t('journal.alerts.seenAt', { at: fmtDateTime(a.seenAt, lang) })}</span>
              ) : (
                <button type="button" className={btn('secondary', 'px-4')} disabled={seen.isPending} onClick={() => seen.mutate({ params: { id: a.id }, body: {} })}>
                  <Icon id="check" size={18} />
                  {t('journal.alerts.seen')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Filters({ sp, set, reset }: { sp: URLSearchParams; set(k: string, v: string): void; reset(): void }) {
  const t = useT();
  const id = useId();
  const canStaff = useCanCall('staffList');
  const staff = useApiQuery('staffList', {}, { enabled: canStaff });
  const [action, setAction] = useState(sp.get('action') ?? '');
  const [targetId, setTargetId] = useState(sp.get('targetId') ?? '');
  const group = sp.get('group') ?? '';
  const any = [...PASS, 'from', 'to'].some((k) => sp.get(k));
  const lbl = 'grid gap-1.5 text-sm font-semibold text-ink';
  return (
    <form
      className="grid gap-3 rounded-xl border border-edge bg-panel p-4 md:grid-cols-3 xl:grid-cols-4"
      aria-label={t('journal.filters')}
      onSubmit={(e) => {
        e.preventDefault();
        set('action', action.trim());
        set('targetId', targetId.trim());
      }}
    >
      {canStaff && (
        <label className={lbl}>
          {t('journal.filter.actor')}
          <select className={inputCls} value={sp.get('actorId') ?? ''} onChange={(e) => set('actorId', e.target.value)}>
            <option value="">{t('journal.filter.anyone')}</option>
            {(staff.data?.items ?? []).map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={lbl}>
        {t('journal.filter.group')}
        <select className={inputCls} value={group} onChange={(e) => set('group', e.target.value)}>
          <option value="">{t('journal.filter.any')}</option>
          {AUDIT_GROUPS.map((g) => (
            <option key={g} value={g}>
              {t(`journal.group.${g}`)}
            </option>
          ))}
        </select>
      </label>
      <label className={lbl}>
        {t('journal.filter.action')}
        <input className={inputCls} list={`${id}-actions`} value={action} placeholder={t('journal.filter.actionHint')} onChange={(e) => setAction(e.target.value)} onBlur={() => action.trim() !== (sp.get('action') ?? '') && set('action', action.trim())} />
        <datalist id={`${id}-actions`}>
          {ACTIONS.filter((a) => !group || a.startsWith(`${group}.`)).map((a) => (
            <option key={a} value={a} label={actionText(t, a)} />
          ))}
        </datalist>
      </label>
      <label className={lbl}>
        {t('journal.filter.result')}
        <select className={inputCls} value={sp.get('result') ?? ''} onChange={(e) => set('result', e.target.value)}>
          <option value="">{t('journal.filter.any')}</option>
          {(['ok', 'denied', 'failed'] as const).map((r) => (
            <option key={r} value={r}>
              {t(`journal.result.${r}`)}
            </option>
          ))}
        </select>
      </label>
      <label className={lbl}>
        {t('journal.filter.from')}
        <input type="date" className={inputCls} value={sp.get('from') ?? ''} onChange={(e) => set('from', e.target.value)} />
      </label>
      <label className={lbl}>
        {t('journal.filter.to')}
        <input type="date" className={inputCls} value={sp.get('to') ?? ''} onChange={(e) => set('to', e.target.value)} />
      </label>
      <label className={lbl}>
        {t('journal.filter.targetType')}
        <select className={inputCls} value={sp.get('targetType') ?? ''} onChange={(e) => set('targetType', e.target.value)}>
          <option value="">{t('journal.filter.any')}</option>
          {TARGET_TYPES.map((x) => (
            <option key={x} value={x}>
              {t(`journal.target.${x}`)}
            </option>
          ))}
        </select>
      </label>
      <label className={lbl}>
        {t('journal.filter.targetId')}
        <input className={inputCls} value={targetId} onChange={(e) => setTargetId(e.target.value)} onBlur={() => targetId.trim() !== (sp.get('targetId') ?? '') && set('targetId', targetId.trim())} />
      </label>
      <div className="flex flex-wrap items-end gap-3 md:col-span-full">
        <button type="submit" className={btn('secondary')}>
          <Icon id="filter" size={18} />
          {t('journal.filter.apply')}
        </button>
        {any && (
          <button
            type="button"
            className={btn('ghost')}
            onClick={() => {
              setAction('');
              setTargetId('');
              reset();
            }}
          >
            <Icon id="x" size={18} />
            {t('journal.filter.reset')}
          </button>
        )}
        {sp.get('onBehalfOfId') && <Chip tone="accent">{t('journal.filter.onBehalf')}</Chip>}
      </div>
    </form>
  );
}

/** Known action codes (labels in `journal.action.*`; the server may add more). */
export const ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.totp_failed',
  'auth.logout',
  'staff.invited',
  'staff.invite_accepted',
  'staff.blocked',
  'staff.restored',
  'staff.permissions_changed',
  'staff.deleted',
  'support.started',
  'support.ended',
  'support.action',
  'content.created',
  'content.submitted',
  'content.reviewed',
  'content.published',
  'content.deletion_requested',
  'content.deleted',
  'teacher_data.profile_changed',
  'teacher_data.class_created',
  'teacher_data.class_changed',
  'teacher_data.subject_changed',
  'teacher_data.ktp_uploaded',
  'export.journal_csv',
  'export.mass_operation',
  'deletion.requested',
  'deletion.approved',
  'deletion.rejected',
];

export function JournalPage() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const [sp, setSp] = useSearchParams();
  const isSuper = useCanCall('journalVerify');
  const [trail, setTrail] = useState<string[]>([]);
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const [exporting, setExporting] = useState(false);
  const query = journalQuery(sp);
  const q = useApiQuery('journal', { query: { ...query, ...(trail.length ? { cursor: trail[trail.length - 1] } : {}), limit: 50 } });
  const set = (k: string, v: string) => {
    setTrail([]);
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );
  };
  const exportCsv = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await api.callBinary('journalExport', { query });
      downloadBlob(blob, filename ?? `journal-${new Date().toISOString().slice(0, 10)}.csv`);
      toast('journal.exported');
    } catch {
      toast('journal.exportFailed', { tone: 'bad' });
    } finally {
      setExporting(false);
    }
  };
  const items = q.data?.items ?? [];
  return (
    <div className="grid gap-5">
      <PageTitle
        title={t('journal.title')}
        description={t(isSuper ? 'journal.leadSuper' : 'journal.leadManager')}
        icon="a-audit"
        action={
          <button type="button" className={btn('secondary')} disabled={exporting} onClick={exportCsv}>
            <Icon id="download" size={18} />
            {t('journal.export')}
          </button>
        }
      />
      {isSuper && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <ChainCheck />
          <Alerts />
        </div>
      )}
      <Filters key={sp.toString() === '' ? 'empty' : 'set'} sp={sp} set={set} reset={() => setSp(new URLSearchParams(), { replace: true })} />
      {q.isLoading ? (
        <Loading rows={6} />
      ) : q.error ? (
        <ErrorLine error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <Empty icon="a-audit" title={t('journal.empty')} text={t('journal.emptyHint')} />
      ) : (
        <table className={tableCls}>
          <caption className="sr-only">{t('journal.title')}</caption>
          <thead className={theadCls}>
            <tr>
              <th className={thCls}>{t('journal.col.at')}</th>
              <th className={thCls}>{t('journal.col.who')}</th>
              <th className={thCls}>{t('journal.col.onBehalf')}</th>
              <th className={thCls}>{t('journal.col.action')}</th>
              <th className={thCls}>{t('journal.col.target')}</th>
              <th className={thCls}>{t('journal.col.result')}</th>
            </tr>
          </thead>
          <tbody className={tbodyCls}>
            {items.map((ev) => (
              <tr key={ev.id} className={cx(trCls, 'cursor-pointer hover:bg-soft')} onClick={() => setOpen(ev)} data-testid={`journal-row-${ev.seq}`}>
                <Td label={t('journal.col.at')}>
                  <button
                    type="button"
                    className="min-h-11 cursor-pointer border-0 bg-transparent p-0 text-left font-semibold whitespace-nowrap text-accent underline-offset-4 hover:underline"
                    aria-label={t('journal.openRow', { action: actionText(t, ev.action), at: fmtDateTime(ev.at, lang) })}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(ev);
                    }}
                  >
                    {fmtDateTime(ev.at, lang)}
                  </button>
                </Td>
                <Td label={t('journal.col.who')}>
                  <span className="grid">
                    <span>{ev.actor.displayName ?? t('journal.system')}</span>
                    {ev.actor.role && <span className="text-sm text-muted">{t(`journal.role.${ev.actor.role}`, { defaultValue: ev.actor.role })}</span>}
                  </span>
                </Td>
                <Td label={t('journal.col.onBehalf')}>{ev.onBehalfOf?.displayName ?? '—'}</Td>
                <Td label={t('journal.col.action')}>
                  <span className="grid">
                    <span>{actionText(t, ev.action)}</span>
                    <span className="text-sm text-muted">{t(`journal.group.${ev.group}`)}</span>
                  </span>
                </Td>
                <Td label={t('journal.col.target')}>
                  <span className="grid">
                    <span className="break-words">{ev.target.label ?? ev.target.id}</span>
                    <span className="text-sm text-muted">{t(`journal.target.${ev.target.type}`, { defaultValue: ev.target.type })}</span>
                  </span>
                </Td>
                <Td label={t('journal.col.result')}>
                  <Chip tone={RESULT_TONE[ev.result]}>{t(`journal.result.${ev.result}`)}</Chip>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager trail={trail} next={q.data?.nextCursor} onBack={() => setTrail((c) => c.slice(0, -1))} onNext={(n) => setTrail((c) => [...c, n])} />
      {open && <Detail ev={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
