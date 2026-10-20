/**
 * A-06 topic editor. Tabs: Basic, Scene, Structures, Activities, Texts,
 * Rights & sources; live preview on the right. Saving writes a new draft
 * TopicVersion with `If-Match: <topic.version>` and `basedOn: <latest semver>`
 * (a parallel edit → 409 → conflict dialog). Unsaved edits autosave locally.
 */
import { useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { ActivitiesSchema, QuizSpecSchema, TopicSchema, conceptForNode, type Topic } from '@bilig/content-model';
import { useApiMutation, useCanCall } from '../../api/hooks';
import { api } from '../../api/session';
import { SchemaForm, IssueSummary, useValidation } from '../../forms/SchemaForm';
import { adminRegistry } from '../../forms/editors';
import { activities, registerActivity, type ActivityDef } from '../../forms/registry';
import { getAt, setAt, collectIssues } from '../../forms/zod-utils';
import { useAdminLang, useT } from '../../i18n';
import { usePreviewBridge } from '../../lib/preview-bridge';
import { useSuggestions } from '../../lib/suggest';
import { DraftBanner, SaveBar, useVersionedEditor, type Versioned } from '../../lib/versioned';
import { useAdminPath } from '../../shell/base';
import { RequestDeletionButton } from '../../staff/deletion';
import { ErrorBox, PageHeader, StatusBadge, Tabs, fmtDate } from '../../shell/ui';
import { TopicPreview } from './Preview';
import { fetchTopicState, saveTopicDoc, useInvalidateTopic, useTopicState } from './useTopic';

const shape = TopicSchema.shape;
const part = <K extends keyof typeof shape>(...keys: K[]) => z.object(Object.fromEntries(keys.map((k) => [k, shape[k]])) as Pick<typeof shape, K>);

export const TAB_SCHEMAS = {
  basic: part('title', 'formula', 'classification', 'description', 'goal', 'objectiveKeys', 'durationMin'),
  scene: part('scene', 'samples'),
  structures: part('conceptKeys', 'overrides'),
  texts: part('examples', 'i18n'),
  rights: part('rights'),
};
const TAB_FIELDS: Record<string, string[]> = {
  basic: Object.keys(TAB_SCHEMAS.basic.shape),
  scene: ['scene', 'samples'],
  structures: ['conceptKeys', 'overrides'],
  activities: ['activities'],
  texts: ['examples', 'i18n'],
  rights: ['rights'],
};

// Built-in activities (A-07 tour and A-09 comparison have their own screens).
let activitiesRegistered = false;
export function registerTopicActivities() {
  if (activitiesRegistered) return;
  activitiesRegistered = true;
  const steps = (v: unknown) => String((v as { steps?: unknown[] } | undefined)?.steps?.length ?? 0);
  registerActivity({ id: 'tour', titleKey: 'activities.tour', path: ['activities', 'tour'], route: 'tour', summary: steps });
  registerActivity({ id: 'processes', titleKey: 'activities.processes', path: ['activities', 'processKeys'], schema: ActivitiesSchema.shape.processKeys, summary: (v) => String((v as unknown[] | undefined)?.length ?? 0) });
  registerActivity({ id: 'comparison', titleKey: 'activities.comparison', path: ['activities', 'comparison'], route: 'comparison', summary: (v) => String((v as { columns?: unknown[] } | undefined)?.columns?.length ?? 0) });
  registerActivity({ id: 'quiz', titleKey: 'activities.quiz', path: ['activities', 'quiz'], schema: QuizSpecSchema.optional(), summary: (v) => String((v as { itemKeys?: unknown[] } | undefined)?.itemKeys?.length ?? 0) });
}

function PartForm({ schema, doc, onChange, suggest, readOnly }: { schema: z.AnyZodObject; doc: Topic; onChange(d: Topic): void; suggest: Record<string, { value: string; label?: string }[]>; readOnly: boolean }) {
  const keys = Object.keys(schema.shape) as (keyof Topic)[];
  const value = Object.fromEntries(keys.map((k) => [k, doc[k]]));
  return <SchemaForm schema={schema} value={value} readOnly={readOnly} suggest={suggest} showIssues onChange={(v) => onChange({ ...doc, ...(v as Partial<Topic>) })} />;
}

function NodeBinding({ doc, onChange, readOnly }: { doc: Topic; onChange(d: Topic): void; readOnly: boolean }) {
  const t = useT();
  const getNodes = usePreviewBridge((s) => s.bridge.getNodes);
  const [probe, setProbe] = useState('');
  const resolved = useMemo(() => doc.conceptKeys.map((k) => ({ key: k, nodes: doc.overrides[k]?.nodes })), [doc]);
  const nodes = getNodes?.() ?? [];
  const bind = (node: string, conceptKey: string) => {
    const ov = doc.overrides[conceptKey] ?? {};
    onChange({ ...doc, overrides: { ...doc.overrides, [conceptKey]: { ...ov, nodes: [...new Set([...(ov.nodes ?? []), node])] } } });
  };
  return (
    <div className="adm-card">
      <h3>{t('structures.binding')}</h3>
      {nodes.length ? (
        <div className="adm-tablewrap">
        <table className="adm-table adm-table--compact">
          <tbody>
            {nodes.map((n) => (
              <tr key={n}>
                <td>
                  <code>{n}</code>
                </td>
                <td>
                  <select aria-label={t('structures.pickConcept', { node: n })} disabled={readOnly} value={conceptForNode(n, resolved as never) ?? ''} onChange={(e) => e.target.value && bind(n, e.target.value)}>
                    <option value="">—</option>
                    {doc.conceptKeys.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <p className="adm-hint">{t('structures.needsViewer')}</p>
      )}
      <label className="adm-field">
        <span>{t('structures.probe')}</span>
        <input value={probe} onChange={(e) => setProbe(e.target.value)} placeholder="Mito_01" />
      </label>
      {probe && <p>{t('structures.probeResult', { node: probe, concept: conceptForNode(probe, resolved as never) ?? '—' })}</p>}
    </div>
  );
}

function ActivitiesTab({ doc, onChange, topicId, readOnly, suggest }: { doc: Topic; onChange(d: Topic): void; topicId: string; readOnly: boolean; suggest: Record<string, { value: string; label?: string }[]> }) {
  const t = useT();
  const to = useAdminPath();
  const lang = useAdminLang((s) => s.lang);
  const list: ActivityDef[] = [...activities.values()];
  return (
    <div className="adm-activities">
      {list.map((a) => {
        const value = getAt(doc, a.path);
        const issues = a.schema ? collectIssues(a.schema, value) : [];
        const Inline = a.inline;
        return (
          <div key={a.id} className="adm-card">
            <h3>
              {t(a.titleKey)} {a.summary && <span className="adm-muted">({a.summary(value)})</span>}
            </h3>
            {a.route && (
              <Link className="adm-btn adm-btn--small" to={to(`topics/${topicId}/${a.route}`)}>
                {t('activities.open')}
              </Link>
            )}
            {Inline ? (
              <Inline schema={a.schema ?? z.unknown()} value={value} path={a.path} label="" ctx={{ t, registry: adminRegistry, issues: new Map(), readOnly, suggest, lang }} onChange={(v: unknown) => onChange(setAt(doc, a.path, v))} />
            ) : (
              a.schema && (
                <SchemaFormLike schema={a.schema} value={value} readOnly={readOnly} suggest={suggest} onChange={(v) => onChange(setAt(doc, a.path, v))} label={t(a.titleKey)} fieldKey={String(a.path[a.path.length - 1])} />
              )
            )}
            {issues.length > 0 && <IssueSummary issues={issues} />}
          </div>
        );
      })}
    </div>
  );
}

/** One schema field outside a whole-object form (keeps the field key for labels/suggestions). */
function SchemaFormLike({ schema, value, onChange, readOnly, suggest, fieldKey }: { schema: z.ZodTypeAny; value: unknown; onChange(v: unknown): void; readOnly: boolean; suggest: Record<string, { value: string; label?: string }[]>; label: string; fieldKey: string }) {
  const wrapped = useMemo(() => z.object({ [fieldKey]: schema }), [schema, fieldKey]);
  return <SchemaForm schema={wrapped} value={{ [fieldKey]: value }} readOnly={readOnly} suggest={suggest} onChange={(v) => onChange((v as Record<string, unknown>)[fieldKey])} />;
}

/** What a rights entry can cover: the scene asset and the sample thumbnails (package-relative paths). */
export function coverOptions(doc: Topic): { value: string; label?: string }[] {
  const out = new Map<string, string | undefined>();
  if (doc.scene?.asset) out.set(doc.scene.asset, undefined);
  for (const s of doc.samples ?? []) if (s.thumb) out.set(s.thumb, s.key);
  return [...out].map(([value, label]) => ({ value, ...(label ? { label } : {}) }));
}

/** The publish checklist's `rights_missing`: a 3D asset with no entry that covers it (or the whole topic). */
export const rightsMissing = (doc: Topic) => !!doc.scene?.asset && !(doc.rights ?? []).some((r) => !r.covers || r.covers === doc.scene?.asset);

function RightsTab({ doc, onChange, suggest, readOnly }: { doc: Topic; onChange(d: Topic): void; suggest: Record<string, { value: string; label?: string }[]>; readOnly: boolean }) {
  const t = useT();
  const to = useAdminPath();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const asset = doc.scene?.asset;
  // Copy the licence / author / source recorded at upload (A-05) into an entry covering the scene asset.
  const fromAsset = async () => {
    if (!asset) return;
    setBusy(true);
    setError(null);
    try {
      const page = await api.call('adminAssetList', { query: { q: asset, limit: 10 } });
      const a = page.items.find((x) => x.key === asset || x.filename === asset) ?? page.items[0];
      if (!a?.license || !a.author || !a.source) throw new Error(t('rights.assetNoMeta', { key: asset }));
      onChange({ ...doc, rights: [...(doc.rights ?? []), { license: a.license, author: a.author, source: a.source, covers: asset }] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="adm-card">
      <h3>{t('rights.title')}</h3>
      <p>
        {t('rights.asset')}: <code>{asset ?? '—'}</code> · <Link to={to('assets')}>{t('nav.assets')}</Link>
      </p>
      {rightsMissing(doc) && (
        <p className="adm-alert adm-alert--warn" role="status">
          {t('rights.missing')}
        </p>
      )}
      <PartForm schema={TAB_SCHEMAS.rights} doc={doc} onChange={onChange} suggest={{ ...suggest, covers: coverOptions(doc) }} readOnly={readOnly} />
      {asset && !readOnly && (
        <button type="button" className="adm-btn adm-btn--small" disabled={busy} onClick={fromAsset}>
          {t('rights.fromAsset')}
        </button>
      )}
      <ErrorBox error={error} />
      <p className="adm-hint">{t('rights.hint')}</p>
    </div>
  );
}

function TopicMeta({ id, detail, onChanged }: { id: string; detail: { demo: boolean; unitKey: string; version: number }; onChanged(): void }) {
  const t = useT();
  const patch = useApiMutation('adminTopicPatch', ['adminTopicList']);
  const canPatch = useCanCall('adminTopicPatch');
  const suggest = useSuggestions(['units']);
  const [unit, setUnit] = useState(detail.unitKey);
  return (
    <div className="adm-card adm-inline">
      <label className="adm-filter adm-filter--check">
        <input
          type="checkbox"
          checked={detail.demo}
          disabled={!canPatch || patch.isPending}
          onChange={(e) => patch.mutate({ params: { id }, body: { demo: e.target.checked, version: detail.version }, ifMatch: detail.version }, { onSuccess: onChanged })}
        />
        <span>{t('fields.demo')}</span>
      </label>
      <label className="adm-filter">
        <span>{t('fields.unitKey')}</span>
        <input list="adm-units" value={unit} disabled={!canPatch} onChange={(e) => setUnit(e.target.value)} />
        <datalist id="adm-units">
          {(suggest.unitKey ?? []).map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </datalist>
      </label>
      {canPatch && unit !== detail.unitKey && (
        <button type="button" className="adm-btn adm-btn--small" onClick={() => patch.mutate({ params: { id }, body: { unitKey: unit, version: detail.version }, ifMatch: detail.version }, { onSuccess: onChanged })}>
          {t('topics.moveUnit')}
        </button>
      )}
      <ErrorBox error={patch.error} />
    </div>
  );
}

export function TopicEditor() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'basic';
  const q = useTopicState(id);
  const invalidate = useInvalidateTopic();
  const canSave = useCanCall('adminTopicVersionCreate');
  const suggest = useSuggestions(['objectives', 'concepts', 'processes', 'items']);
  const latest = useRef<string | undefined>();
  const server = useMemo<Versioned<Topic> | undefined>(() => (q.data ? { value: q.data.doc, version: q.data.detail.version } : undefined), [q.data]);
  const editor = useVersionedEditor<Topic>({
    draftKey: `topic:${id}`,
    server,
    save: async (doc, version) => {
      const st = await saveTopicDoc(id, doc, version, latest.current ?? q.data?.detail.latestVersion);
      latest.current = st.detail.latestVersion;
      invalidate(id);
      return { value: st.doc, version: st.detail.version };
    },
    reload: async () => {
      const st = await fetchTopicState(id);
      latest.current = st.detail.latestVersion;
      return { value: st.doc, version: st.detail.version };
    },
  });
  if (q.data && latest.current === undefined) latest.current = q.data.detail.latestVersion;
  const doc = editor.value;
  const issues = useValidation(TopicSchema, doc);
  const tabIssues = (tabId: string) => issues.filter((i) => TAB_FIELDS[tabId]?.includes(String(i.path[0]))).length;
  const label = (tabId: string) => (
    <>
      {t(`topics.tab.${tabId}`)}
      {tabIssues(tabId) > 0 && <span className="adm-badge adm-badge--error"> {tabIssues(tabId)}</span>}
    </>
  );

  if (q.isLoading) return <p>{t('common.loading')}</p>;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const { detail } = q.data;
  const readOnly = !canSave || detail.status === 'archived';
  const set = (d: Topic) => editor.setValue(d);

  return (
    <section className="adm-split adm-split--wide">
      <div className="adm-split__main">
        <PageHeader title={`${t('nav.topics')} · ${detail.key}`}>
          <StatusBadge status={detail.status} />
          <span className="adm-muted">
            {t('topics.versions', { latest: detail.latestVersion ?? '—', published: detail.publishedVersion ?? '—' })} · {fmtDate(detail.updatedAt, lang)}
          </span>
          <Link className="adm-btn adm-btn--ghost" to={to(`publishing/${id}`)}>
            {t('nav.publishing')}
          </Link>
          <RequestDeletionButton kind="topic" targetId={id} label={detail.key} />
        </PageHeader>
        <TopicMeta id={id} detail={detail} onChanged={() => invalidate(id)} />
        <DraftBanner editor={editor} />
        {doc && (
          <Tabs
            value={tab}
            onChange={(v) => setSp((p) => {
              const n = new URLSearchParams(p);
              n.set('tab', v);
              return n;
            }, { replace: true })}
            tabs={[
              { id: 'basic', label: label('basic'), content: <PartForm schema={TAB_SCHEMAS.basic} doc={doc} onChange={set} suggest={suggest} readOnly={readOnly} /> },
              { id: 'scene', label: label('scene'), content: <PartForm schema={TAB_SCHEMAS.scene} doc={doc} onChange={set} suggest={suggest} readOnly={readOnly} /> },
              {
                id: 'structures',
                label: label('structures'),
                content: (
                  <>
                    <PartForm schema={TAB_SCHEMAS.structures} doc={doc} onChange={set} suggest={{ ...suggest, 'overrides.$key': doc.conceptKeys.map((k) => ({ value: k })) }} readOnly={readOnly} />
                    <NodeBinding doc={doc} onChange={set} readOnly={readOnly} />
                  </>
                ),
              },
              { id: 'activities', label: label('activities'), content: <ActivitiesTab doc={doc} onChange={set} topicId={id} readOnly={readOnly} suggest={suggest} /> },
              { id: 'texts', label: label('texts'), content: <PartForm schema={TAB_SCHEMAS.texts} doc={doc} onChange={set} suggest={suggest} readOnly={readOnly} /> },
              { id: 'rights', label: label('rights'), content: <RightsTab doc={doc} onChange={set} suggest={suggest} readOnly={readOnly} /> },
            ]}
          />
        )}
        {issues.length > 0 && editor.dirty && <IssueSummary issues={issues} />}
        <SaveBar editor={editor} disabled={issues.length > 0} canSave={!readOnly} />
      </div>
      <aside className="adm-split__side">{doc && <TopicPreview doc={doc} subjectKey={detail.subjectKey} version={detail.latestVersion} />}</aside>
    </section>
  );
}

