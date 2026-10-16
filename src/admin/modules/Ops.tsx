/**
 * A-18 tutor settings (PUT with If-Match → conflict dialog) and the
 * regression run over the stored test questions, and A-19 audit log
 * (read-only; filters actor / action / target / period in the URL).
 */
import { useMemo, useState } from 'react';
import { TUTOR_REGRESSION_MAX, TutorSettingsSchema, type TutorRegressionResult, type TutorSettings } from '@bilig/content-model/api';
import type { z } from 'zod';
import { ApiError } from '../api/client';
import { useApiMutation, useApiQuery, useCanCall } from '../api/hooks';
import { api } from '../api/session';
import { SchemaForm, useValidation } from '../forms/SchemaForm';
import { useAdminLang, useT } from '../i18n';
import { DraftBanner, SaveBar, useVersionedEditor, type Versioned } from '../lib/versioned';
import { ListView, type Column } from '../lists/ListView';
import { useListParams } from '../lists/useListParams';
import { Icon } from '../lib/icons';
import { Badge, EmptyState, ErrorBox, FilterText, PageHeader, fmtDate, fmtNum } from '../shell/ui';
import type { AuditEntrySchema } from '@bilig/content-model/api';
import { navIcon } from '../shell/Layout';

type Settings = Omit<TutorSettings, 'version'>;

export function TutorSettingsPage() {
  const t = useT();
  const q = useApiQuery('adminTutorSettingsGet');
  const canPut = useCanCall('adminTutorSettingsPut');
  const server = useMemo<Versioned<Settings> | undefined>(() => {
    if (!q.data) return undefined;
    const { version, ...value } = q.data;
    return { value, version };
  }, [q.data]);
  const editor = useVersionedEditor<Settings>({
    draftKey: 'tutor-settings',
    server,
    save: async (value, version) => {
      const { version: v, ...rest } = await api.call('adminTutorSettingsPut', { body: { ...value, version }, ifMatch: version });
      return { value: rest, version: v };
    },
    reload: async () => {
      const { version, ...value } = await api.call('adminTutorSettingsGet');
      return { value, version };
    },
  });
  const schema = useMemo(() => TutorSettingsSchema.omit({ version: true }), []);
  const issues = useValidation(schema, editor.value);
  return (
    <section>
      <PageHeader title={t('nav.tutor')} icon={navIcon('tutor')} description={t('pages.tutor')}>{editor.version !== undefined && <span className="adm-muted">{t('common.version', { v: editor.version })}</span>}</PageHeader>
      <ErrorBox error={q.error} />
      <DraftBanner editor={editor} />
      {editor.value && <SchemaForm schema={schema} value={editor.value} onChange={editor.setValue} readOnly={!canPut} />}
      <p className="adm-hint">{t('tutor.note')}</p>
      <SaveBar editor={editor} disabled={issues.length > 0} canSave={canPut} />
      {q.data && <RegressionRun questions={q.data.regressionQuestions} unsaved={editor.dirty} />}
    </section>
  );
}

type Question = TutorSettings['regressionQuestions'][number];
type RegressionItem = TutorRegressionResult['items'][number];

/** Outcome of one regression question as a badge. */
function Outcome({ item }: { item: RegressionItem }) {
  const t = useT();
  if (item.error) return <Badge tone="error">{t('tutor.regression.error', { code: item.error })}</Badge>;
  if (item.refused) return <Badge tone="warn">{t('tutor.regression.refused')}</Badge>;
  if (item.noAnswer) return <Badge tone="warn">{t('tutor.regression.noAnswer')}</Badge>;
  return item.passed ? <Badge tone="ok">{t('tutor.regression.passed')}</Badge> : <Badge tone="error">{t('tutor.regression.failed')}</Badge>;
}

/**
 * A-18 «набор тестовых вопросов для регрессии»: runs the SAVED questions
 * (all, or the selected ones — at most TUTOR_REGRESSION_MAX per run) with the
 * same grounding and refusal rules as the tutor; tokens count against the budget.
 */
export function RegressionRun({ questions, unsaved }: { questions: readonly Question[]; unsaved: boolean }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const canRun = useCanCall('adminTutorRegression');
  const run = useApiMutation('adminTutorRegression');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [topicKey, setTopicKey] = useState('');
  if (!canRun) return null;
  const count = selected.size || questions.length;
  const tooMany = count > TUTOR_REGRESSION_MAX;
  const toggle = (i: number) => {
    const n = new Set(selected);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    setSelected(n);
  };
  const res = run.data;
  const offline = run.error instanceof ApiError && run.error.code === 'tutor_unavailable';
  return (
    <div className="adm-card">
      <h2 className="adm-card__title">
        <Icon id="play" />
        <span>{t('tutor.regression.title')}</span>
      </h2>
      <p className="adm-hint">{t('tutor.regression.hint', { max: TUTOR_REGRESSION_MAX })}</p>
      {unsaved && <p className="adm-alert adm-alert--info">{t('tutor.regression.unsaved')}</p>}
      {questions.length === 0 ? (
        <EmptyState title={t('tutor.regression.none')} />
      ) : (
        <>
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th className="adm-table__check">
                    <span className="adm-sr">{t('tutor.regression.select')}</span>
                  </th>
                  <th>#</th>
                  <th>{t('fields.lang')}</th>
                  <th>{t('tutor.regression.question')}</th>
                  <th>{t('fields.topicKey')}</th>
                  <th>{t('fields.expectConcepts')}</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((qn, i) => (
                  <tr key={i} className={selected.has(i) ? 'is-selected' : undefined}>
                    <td className="adm-table__check">
                      <input type="checkbox" aria-label={t('tutor.regression.selectOne', { n: i + 1 })} checked={selected.has(i)} onChange={() => toggle(i)} />
                    </td>
                    <td>{i + 1}</td>
                    <td>
                      <span className="adm-lang-tag">{qn.lang}</span>
                    </td>
                    <td>{qn.question}</td>
                    <td>{qn.topicKey ? <code>{qn.topicKey}</code> : <span className="adm-muted">—</span>}</td>
                    <td>{qn.expectConcepts?.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="adm-filters">
            <label className="adm-filter">
              <span>{t('tutor.regression.defaultTopic')}</span>
              <input value={topicKey} onChange={(e) => setTopicKey(e.target.value)} placeholder="bio.animal-cell" />
            </label>
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              disabled={run.isPending || tooMany}
              onClick={() =>
                run.mutate({
                  body: {
                    ...(topicKey.trim() ? { topicKey: topicKey.trim() } : {}),
                    ...(selected.size ? { indexes: [...selected].sort((a, b) => a - b) } : {}),
                  },
                })
              }
            >
              <Icon id="play" size={18} />
              {run.isPending ? t('tutor.regression.running') : t('tutor.regression.run', { count })}
            </button>
          </div>
          {tooMany && <p className="adm-hint">{t('tutor.regression.tooMany', { max: TUTOR_REGRESSION_MAX })}</p>}
        </>
      )}
      {offline && <p className="adm-hint">{t('tutor.regression.offline')}</p>}
      <ErrorBox error={run.error} />
      {res && (
        <div role="region" aria-label={t('tutor.regression.results')}>
          <p>
            <Badge tone={res.failed ? 'error' : 'ok'}>{t('tutor.regression.summary', { passed: res.passed, failed: res.failed })}</Badge>{' '}
            <span className="adm-muted">
              {res.model} · {fmtDate(res.ranAt, lang)}
            </span>
          </p>
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('tutor.regression.question')}</th>
                  <th>{t('tutor.regression.result')}</th>
                  <th>{t('tutor.regression.citations')}</th>
                  <th>{t('tutor.regression.missing')}</th>
                  <th>{t('tutor.regression.answer')}</th>
                  <th>{t('tutor.regression.tokens')}</th>
                </tr>
              </thead>
              <tbody>
                {res.items.map((it) => (
                  <tr key={it.index}>
                    <td>{it.index + 1}</td>
                    <td>
                      <span className="adm-lang-tag">{it.lang}</span> {it.question}
                      {it.topicKey && (
                        <div className="adm-muted">
                          <code>{it.topicKey}</code>
                        </div>
                      )}
                    </td>
                    <td>
                      <Outcome item={it} />
                    </td>
                    <td>{it.citations.join(', ') || '—'}</td>
                    <td>{it.missing.length ? <strong>{it.missing.join(', ')}</strong> : '—'}</td>
                    <td>
                      {it.answer ? (
                        <details>
                          <summary>{t('audit.show')}</summary>
                          <p style={{ whiteSpace: 'pre-wrap' }}>{it.answer}</p>
                        </details>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {fmtNum(it.inputTokens, lang)} / {fmtNum(it.outputTokens, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

type Audit = z.infer<typeof AuditEntrySchema>;

/** `YYYY-MM-DD` (local day) → ISO instant at its start; `endOf` → start of the next day (the API's `to` is exclusive). */
export function dayToIso(day: string | undefined, endOf = false): string | undefined {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + (endOf ? 1 : 0)).toISOString();
}

function FilterDay({ label, value, onApply }: { label: string; value?: string; onApply(v: string | undefined): void }) {
  return (
    <label className="adm-filter">
      <span>{label}</span>
      <input type="date" value={value ?? ''} onChange={(e) => onApply(e.target.value || undefined)} />
    </label>
  );
}

const AUDIT_FILTERS = ['actorId', 'action', 'targetType', 'targetId', 'from', 'to'];

export function AuditLog() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const list = useListParams(AUDIT_FILTERS);
  // The URL keeps the days as typed; the API gets instants (an inclusive «по» day).
  const period = useMemo(() => ({ from: dayToIso(list.filters.from), to: dayToIso(list.filters.to, true) }), [list.filters.from, list.filters.to]);
  const columns = useMemo<Column<Audit>[]>(
    () => [
      { key: 'ts', header: t('audit.ts'), render: (a) => fmtDate(a.ts, lang), sortValue: (a) => a.ts },
      { key: 'actorId', header: t('audit.actor'), render: (a) => (a.actorId ? <button type="button" className="adm-link" onClick={(e) => { e.stopPropagation(); list.setFilter('actorId', a.actorId!); }}>{a.actorId.slice(0, 8)}</button> : <span className="adm-muted">{t('audit.anonymous')}</span>), sortValue: (a) => a.actorId ?? undefined },
      { key: 'action', header: t('audit.action'), render: (a) => <code>{a.action}</code>, sortValue: (a) => a.action },
      { key: 'target', header: t('audit.target'), render: (a) => <button type="button" className="adm-link" title={a.targetId} onClick={(e) => { e.stopPropagation(); list.setFilters({ targetType: a.targetType, targetId: a.targetId }); }}>{`${a.targetType}:${a.targetId.slice(0, 12)}`}</button>, sortValue: (a) => `${a.targetType}:${a.targetId}` },
      { key: 'ip', header: 'IP', render: (a) => a.ip ?? '—' },
      { key: 'diff', header: t('audit.diff'), render: (a) => (a.diff === undefined ? '—' : <details><summary>{t('audit.show')}</summary><pre className="adm-mono">{JSON.stringify(a.diff, null, 2)}</pre></details>) },
    ],
    [t, lang, list],
  );
  return (
    <section>
      <PageHeader title={t('nav.audit')} icon={navIcon('audit')} description={t('pages.audit')} />
      <div className="adm-filters">
        <FilterText label={t('audit.actorPrefix')} value={list.filters.actorId} onApply={(v) => list.setFilter('actorId', v)} />
        <FilterText label={t('audit.action')} value={list.filters.action} onApply={(v) => list.setFilter('action', v)} />
        <FilterText label={t('audit.targetType')} value={list.filters.targetType} onApply={(v) => list.setFilter('targetType', v)} />
        <FilterText label={t('audit.targetId')} value={list.filters.targetId} onApply={(v) => list.setFilter('targetId', v)} />
        <FilterDay label={t('audit.from')} value={list.filters.from} onApply={(v) => list.setFilter('from', v)} />
        <FilterDay label={t('audit.to')} value={list.filters.to} onApply={(v) => list.setFilter('to', v)} />
      </div>
      <ListView endpoint="adminAudit" list={list} columns={columns} rowKey={(a: Audit) => a.id} extraQuery={period} />
      <p className="adm-hint">{t('audit.readOnly')}</p>
    </section>
  );
}
