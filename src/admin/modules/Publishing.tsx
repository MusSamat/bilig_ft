/**
 * A-13 publishing: draft → review → published → archive. Per topic: the
 * automatic pre-publish checklist, the diff against the published version (or
 * any two versions), rollback to a previous version, scheduled publishing and
 * builds. The list page publishes a whole unit (bulk) where allowed.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { WORKFLOW, type AdminTopic, type EndpointName, type WorkflowAction } from '@bilig/content-model/api';
import { useApiQuery, useCanCall, usePermissions } from '../api/hooks';
import { api } from '../api/session';
import { useAdminLang, useT } from '../i18n';
import { short } from '../lib/diff';
import { ListView, type BulkAction } from '../lists/ListView';
import { useListParams } from '../lists/useListParams';
import { useAdminPath } from '../shell/base';
import { Badge, Dialog, ErrorBox, FilterText, KeyValue, PageHeader, StatusBadge, fmtDate } from '../shell/ui';
import { TopicFilters, topicColumns } from './topics/TopicsList';
import { Icon } from '../lib/icons';
import { navIcon } from '../shell/Layout';

export const ACTION_ENDPOINT: Record<WorkflowAction, EndpointName> = {
  submit: 'adminTopicSubmit',
  reject: 'adminTopicReject',
  approve: 'adminTopicApprove',
  publish: 'adminTopicPublish',
  archive: 'adminTopicArchive',
  rollback: 'adminTopicRollback',
  restore: 'adminTopicRestore',
};

/** `datetime-local` value → ISO with the local offset (DateTimeSchema requires an offset). */
export function localToIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export async function runAction(id: string, action: WorkflowAction, extra: { message?: string; reason?: string; scheduledAt?: string; toVersion?: string } = {}) {
  const name = ACTION_ENDPOINT[action];
  const body =
    action === 'submit' ? { ...(extra.message ? { message: extra.message } : {}) }
    : action === 'reject' ? { reason: extra.reason ?? '' }
    : action === 'publish' ? { ...(extra.scheduledAt ? { scheduledAt: extra.scheduledAt } : {}) }
    : action === 'archive' ? { ...(extra.reason ? { reason: extra.reason } : {}) }
    : action === 'rollback' ? { toVersion: extra.toVersion ?? '' }
    : {};
  return api.call(name as 'adminTopicSubmit', { params: { id }, body: body as never });
}

export function PublishingList() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const nav = useNavigate();
  const list = useListParams(['q', 'subjectKey', 'status', 'unitKey']);
  const can = usePermissions();
  const [scheduledAt, setScheduledAt] = useState('');
  const [report, setReport] = useState<string | null>(null);
  const columns = useMemo(() => topicColumns(t, lang), [t, lang]);
  const bulkRun = (action: WorkflowAction) => async (rows: AdminTopic[]) => {
    const ok: string[] = [];
    const bad: string[] = [];
    for (const r of rows) {
      if (!WORKFLOW[action].from.includes(r.status)) {
        bad.push(`${r.key}: ${t('publishing.notAllowedFrom', { status: t(`enum.${r.status}`) })}`);
        continue;
      }
      try {
        await runAction(r.id, action, { scheduledAt: localToIso(scheduledAt) });
        ok.push(r.key);
      } catch (e) {
        bad.push(`${r.key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setReport([t('common.bulkDone', { count: ok.length }), ...bad].join('\n'));
  };
  const bulk: BulkAction<AdminTopic>[] = (['submit', 'publish', 'archive'] as WorkflowAction[])
    .filter((a) => can(WORKFLOW[a].permission))
    .map((a) => ({ id: a, label: t(`workflow.${a}`), run: bulkRun(a) }));
  return (
    <section>
      <PageHeader title={t('nav.publishing')} icon={navIcon('publishing')} description={t('pages.publishing')} />
      <TopicFilters list={list} />
      <div className="adm-filters">
        <FilterText label={t('publishing.unitFilter')} value={list.filters.unitKey} onApply={(v) => list.setFilter('unitKey', v)} />
        {can('content.publish') && (
          <label className="adm-filter">
            <span>{t('publishing.scheduleBulk')}</span>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </label>
        )}
      </div>
      {list.filters.unitKey && <p className="adm-hint">{t('publishing.unitHint')}</p>}
      {report && <pre className="adm-alert adm-alert--info">{report}</pre>}
      <ListView
        endpoint="adminTopicList"
        list={list}
        columns={columns}
        rowKey={(r: AdminTopic) => r.id}
        bulkActions={bulk}
        refine={list.filters.unitKey ? (rows: AdminTopic[]) => rows.filter((r) => r.unitKey === list.filters.unitKey) : undefined}
        onRowClick={(r: AdminTopic) => nav(to(`publishing/${r.id}`))}
      />
    </section>
  );
}

function Checklist({ id }: { id: string }) {
  const t = useT();
  const q = useApiQuery('adminTopicChecklist', { params: { id } });
  const c = q.data;
  return (
    <div className="adm-card">
      <h2>{t('publishing.checklist')}</h2>
      <ErrorBox error={q.error} />
      {c && (
        <>
          <ul className="adm-checklist">
            {(['schema', 'translations', 'budgets', 'altText'] as const).map((k) => (
              <li key={k} className={c[k] ? 'is-pass' : 'is-fail'}>
                <Icon id={c[k] ? 'check' : 'x'} size={18} />
                {t(`publishing.check.${k}`)}
              </li>
            ))}
          </ul>
          {c.issues.length > 0 && (
            <ul className="adm-plain">
              {c.issues.slice(0, 50).map((i, n) => (
                <li key={n}>
                  <Badge tone={i.severity === 'error' ? 'error' : 'warn'}>{t(`enum.${i.severity}`)}</Badge> <code>{i.path.join('.')}</code> {i.message}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function DiffView({ id, versions, published, latest }: { id: string; versions: string[]; published?: string; latest?: string }) {
  const t = useT();
  const [from, setFrom] = useState<string>(published ?? '');
  const [to, setTo] = useState<string>(latest ?? '');
  const q = useApiQuery('adminTopicDiff', { params: { id }, query: { ...(from ? { from } : {}), ...(to ? { to } : {}) } }, { enabled: versions.length > 0 });
  return (
    <div className="adm-card">
      <h2>{t('publishing.diff')}</h2>
      <div className="adm-filters">
        <label className="adm-filter">
          <span>{t('publishing.from')}</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">{t('publishing.publishedDefault')}</option>
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-filter">
          <span>{t('publishing.to')}</span>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">{t('publishing.latestDefault')}</option>
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorBox error={q.error} />
      {q.data && (
        <>
          <p className="adm-muted">{t('publishing.diffSummary', { from: q.data.from ?? '∅', to: q.data.to, count: q.data.changes.length })}</p>
          <div className="adm-tablewrap">
          <table className="adm-table adm-table--compact">
            <tbody>
              {q.data.changes.slice(0, 200).map((c, i) => (
                <tr key={i} className={`adm-diff adm-diff--${c.kind}`}>
                  <td>
                    <Badge tone={c.kind === 'added' ? 'ok' : c.kind === 'removed' ? 'error' : 'warn'}>{t(`publishing.kind.${c.kind}`)}</Badge>
                  </td>
                  <td>
                    <code>{c.path.join('.')}</code>
                  </td>
                  <td className="adm-mono">{short(c.before, 120)}</td>
                  <td className="adm-mono">{short(c.after, 120)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
}

function Builds({ topicKey, versionIds }: { topicKey: string; versionIds: Map<string, string> }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const q = useApiQuery('adminBuildList', { query: { topicKey, limit: 20 } });
  const canBuild = useCanCall('adminBuildCreate');
  const [error, setError] = useState<unknown>(null);
  return (
    <div className="adm-card">
      <h2>{t('publishing.builds')}</h2>
      <ErrorBox error={q.error ?? error} />
      <div className="adm-tablewrap">
      <table className="adm-table adm-table--compact">
        <tbody>
          {(q.data?.items ?? []).map((b) => (
            <tr key={b.id}>
              <td>{b.version}</td>
              <td>
                <StatusBadge status={b.status} />
              </td>
              <td>{fmtDate(b.createdAt, lang)}</td>
              <td className="adm-mono">{b.hash?.slice(0, 12) ?? '—'}</td>
              <td>
                <details>
                  <summary>{t('publishing.log')}</summary>
                  <pre className="adm-mono">{b.log.join('\n')}</pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {canBuild && versionIds.size > 0 && (
        <div className="adm-inline">
          {[...versionIds.entries()].slice(-3).map(([semver, vid]) => (
            <button
              key={vid}
              type="button"
              className="adm-btn adm-btn--small"
              onClick={async () => {
                try {
                  await api.call('adminBuildCreate', { params: { topicVersionId: vid }, body: {} });
                  void q.refetch();
                } catch (e) {
                  setError(e);
                }
              }}
            >
              {t('publishing.rebuild', { v: semver })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionDialog({ action, versions, onClose, onRun }: { action: WorkflowAction; versions: string[]; onClose(): void; onRun(extra: { message?: string; reason?: string; scheduledAt?: string; toVersion?: string }): Promise<void> }) {
  const t = useT();
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  const [toVersion, setToVersion] = useState(versions[versions.length - 2] ?? versions[0] ?? '');
  const [busy, setBusy] = useState(false);
  const needsReason = action === 'reject';
  return (
    <Dialog
      title={t(`workflow.${action}`)}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            disabled={busy || (needsReason && !text.trim()) || (action === 'rollback' && !toVersion)}
            onClick={async () => {
              setBusy(true);
              try {
                await onRun({ message: text || undefined, reason: text || undefined, scheduledAt: localToIso(when), toVersion });
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('common.confirm')}
          </button>
        </>
      }
    >
      {(action === 'submit' || action === 'reject' || action === 'archive') && (
        <label className="adm-field">
          <span>{t(action === 'submit' ? 'publishing.message' : 'publishing.reason')}</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      {action === 'publish' && (
        <div className="adm-field">
          <label htmlFor="adm-schedule-at">{t('publishing.scheduleAt')}</label>
          <input id="adm-schedule-at" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          <small className="adm-hint">{t('publishing.scheduleHint')}</small>
        </div>
      )}
      {action === 'rollback' && (
        <label className="adm-field">
          <span>{t('publishing.toVersion')}</span>
          <select value={toVersion} onChange={(e) => setToVersion(e.target.value)}>
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      )}
    </Dialog>
  );
}

export function PublishingDetail() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const qc = useQueryClient();
  const { id = '' } = useParams();
  const can = usePermissions();
  const detail = useApiQuery('adminTopicGet', { params: { id } });
  const versions = useApiQuery('adminTopicVersions', { params: { id } });
  const [action, setAction] = useState<WorkflowAction | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<string | null>(null);
  const d = detail.data;
  const vlist = versions.data?.items ?? [];
  const semvers = vlist.map((v) => v.version);
  const allowed = (d?.availableActions ?? []).filter((a) => can(WORKFLOW[a].permission));
  return (
    <section>
      <PageHeader title={`${t('nav.publishing')} · ${d?.key ?? ''}`}>
        <Link className="adm-btn adm-btn--ghost" to={to(`topics/${id}`)}>
          {t('publishing.openEditor')}
        </Link>
        <Link className="adm-btn adm-btn--ghost" to={to(`review/${id}`)}>
          {t('nav.review')}
        </Link>
      </PageHeader>
      <ErrorBox error={detail.error ?? error} />
      {d && (
        <div className="adm-card">
          <KeyValue
            items={[
              [t('fields.status'), <StatusBadge key="s" status={d.status} />],
              [t('topics.published'), d.publishedVersion ?? '—'],
              [t('topics.latest'), d.latestVersion ?? '—'],
              [t('publishing.scheduled'), d.scheduledAt ? fmtDate(d.scheduledAt, lang) : '—'],
              [t('fields.subjectKey'), d.subjectKey],
            ]}
          />
          <div className="adm-toolbar" role="group" aria-label={t('publishing.actions')}>
            {allowed.map((a) => (
              <button key={a} type="button" className={`adm-btn${a === 'publish' || a === 'approve' ? ' adm-btn--primary' : ''}`} onClick={() => setAction(a)}>
                {t(`workflow.${a}`)}
              </button>
            ))}
            {!allowed.length && <span className="adm-muted">{t('publishing.noActions')}</span>}
          </div>
          {result && <p className="adm-alert adm-alert--info">{result}</p>}
        </div>
      )}
      <div className="adm-grid">
        <Checklist id={id} />
        {d && <Builds topicKey={d.key} versionIds={new Map(vlist.map((v) => [v.version, v.id]))} />}
      </div>
      {d && <DiffView id={id} versions={semvers} />}
      <div className="adm-card">
        <h2>{t('publishing.history')}</h2>
        <div className="adm-tablewrap">
        <table className="adm-table adm-table--compact">
          <tbody>
            {[...vlist].reverse().map((v) => (
              <tr key={v.id}>
                <td>{v.version}</td>
                <td>
                  <StatusBadge status={v.reviewState} />
                </td>
                <td>{fmtDate(v.createdAt, lang)}</td>
                <td className="adm-muted">{v.authorId.slice(-6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      {action && d && (
        <ActionDialog
          action={action}
          versions={semvers}
          onClose={() => setAction(null)}
          onRun={async (extra) => {
            setError(null);
            try {
              const r = await runAction(id, action, extra);
              setResult(t('publishing.done', { status: t(`enum.${r.status}`), version: r.version }));
              setAction(null);
              await Promise.all([detail.refetch(), versions.refetch()]);
              void qc.invalidateQueries({ queryKey: ['adminTopicChecklist'] });
              void qc.invalidateQueries({ queryKey: ['adminTopicList'] });
            } catch (e) {
              setError(e);
              setAction(null);
            }
          }}
        />
      )}
    </section>
  );
}
