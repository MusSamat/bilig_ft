/** Generic list + editor pages over a `ResourceDef`. */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ITEM_TYPES, SUBJECT_STATUSES } from '@bilig/content-model';
import { ENDPOINTS, type EndpointDef, type EndpointName } from '@bilig/content-model/api';
import { ApiError } from '../api/client';
import { useCanCall } from '../api/hooks';
import { api } from '../api/session';
import { SchemaForm, useValidation } from '../forms/SchemaForm';
import { defaultFor, withRemovals } from '../forms/zod-utils';
import { useAdminLang, useT } from '../i18n';
import { clearDraft, readDraft, useAutosave } from '../lib/draft';
import { useSuggestions } from '../lib/suggest';
import { DraftBanner, SaveBar, useVersionedEditor, type Versioned } from '../lib/versioned';
import { ListView, type BulkAction } from '../lists/ListView';
import { useListParams } from '../lists/useListParams';
import { useAdminPath } from '../shell/base';
import { navIcon } from '../shell/Layout';
import { useScopedHue } from '../shell/theme';
import { ErrorBox, FilterSelect, FilterText, PageHeader, Skeleton } from '../shell/ui';
import { recordKey, type AdminRec, type ResourceDef, type ResourceFilter } from './resources';
import { Icon } from '../lib/icons';

/* eslint-disable @typescript-eslint/no-explicit-any */
const call = (name: EndpointName, opts: unknown) => api.call(name as any, opts as any) as Promise<any>;

/** Load one record by its key (every dictionary has a GET since contract 0.3.0). */
export function fetchRecord(def: ResourceDef, key: string): Promise<AdminRec> {
  return call(def.get, { params: { [def.param]: key } });
}

export function SubjectFilter({ value, onApply }: { value?: string; onApply(v: string | undefined): void }) {
  const t = useT();
  const s = useSuggestions(['subjects']);
  return <FilterSelect label={t('fields.subjectKey')} value={value} options={(s.subjectKey ?? []).map((o) => ({ value: o.value, label: o.label ?? o.value }))} onApply={onApply} />;
}

/** The filter controls a `ResourceDef` asks for; every value lives in the URL and goes to the server. */
function ResourceFilters({ def, list }: { def: ResourceDef; list: ReturnType<typeof useListParams> }) {
  const t = useT();
  const has = (f: ResourceFilter) => def.filters.includes(f);
  const s = useSuggestions([...(has('unitKey') ? (['units'] as const) : []), ...(has('objectiveKey') ? (['objectives'] as const) : [])]);
  const opts = (field: string) => {
    const o = (s[field] ?? []).map((x) => ({ value: x.value, label: x.label ?? x.value }));
    const cur = list.filters[field];
    return cur && !o.some((x) => x.value === cur) ? [...o, { value: cur, label: cur }] : o;
  };
  const set = (f: string) => (v: string | undefined) => list.setFilter(f, v);
  return (
    <div className="adm-filters">
      {has('q') && <FilterText label={t('list.search')} value={list.filters.q} onApply={set('q')} />}
      {has('subjectKey') && <SubjectFilter value={list.filters.subjectKey} onApply={set('subjectKey')} />}
      {has('status') && <FilterSelect label={t('fields.status')} value={list.filters.status} options={SUBJECT_STATUSES.map((v) => ({ value: v, label: t(`enum.${v}`) }))} onApply={set('status')} />}
      {has('unitKey') && <FilterSelect label={t('fields.unitKey')} value={list.filters.unitKey} options={opts('unitKey')} onApply={set('unitKey')} />}
      {has('kind') && <FilterText label={t('fields.kind')} value={list.filters.kind} onApply={set('kind')} />}
      {has('type') && <FilterSelect label={t('fields.type')} value={list.filters.type} options={ITEM_TYPES.map((v) => ({ value: v, label: t(`enum.${v}`) }))} onApply={set('type')} />}
      {has('objectiveKey') && <FilterSelect label={t('fields.objectiveKey')} value={list.filters.objectiveKey} options={opts('objectiveKeys')} onApply={set('objectiveKey')} />}
    </div>
  );
}

export function ResourceList({ def, toolbar, children }: { def: ResourceDef; toolbar?: ReactNode; children?: ReactNode }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const nav = useNavigate();
  const list = useListParams(def.filters);
  const canCreate = useCanCall(def.create);
  const canDelete = useCanCall(def.del ?? 'me') && !!def.del;
  const [report, setReport] = useState<string | null>(null);
  const columns = useMemo(() => def.columns(t, lang), [def, t, lang]);
  const bulk: BulkAction<AdminRec>[] = canDelete
    ? [
        {
          id: 'delete',
          danger: true,
          label: t('common.deleteSelected'),
          run: async (rows) => {
            if (!window.confirm(t('common.confirmDelete', { count: rows.length }))) return;
            const failed: string[] = [];
            for (const r of rows) {
              try {
                await call(def.del!, { params: { [def.param]: recordKey(def, r) }, ifMatch: r.version });
              } catch (e) {
                failed.push(`${recordKey(def, r)}: ${e instanceof ApiError ? t(`errors.${e.code}`) + (e.detail ? ` (${e.detail})` : '') : String(e)}`);
              }
            }
            setReport(failed.length ? t('common.bulkFailed', { count: failed.length }) + '\n' + failed.join('\n') : t('common.bulkDone', { count: rows.length }));
          },
        },
      ]
    : [];
  return (
    <section>
      <PageHeader title={t(def.titleKey)} icon={navIcon(def.id)} description={t(`pages.${def.id}`, { defaultValue: '' }) || undefined}>
        {toolbar}
        {canCreate && (
          <Link className="adm-btn adm-btn--primary" to={to(`${def.id}/new`)}>
            <Icon id="plus" size={18} />
            {t('common.create')}
          </Link>
        )}
      </PageHeader>
      {children}
      <ResourceFilters def={def} list={list} />
      {report && <pre className="adm-alert adm-alert--info">{report}</pre>}
      <ListView
        endpoint={def.list}
        list={list}
        columns={columns}
        rowKey={(r: AdminRec) => recordKey(def, r)}
        bulkActions={bulk}
        onRowClick={(r: AdminRec) => nav(to(`${def.id}/${encodeURIComponent(recordKey(def, r))}`))}
      />
    </section>
  );
}

export interface ResourceEditProps {
  def: ResourceDef;
  /** Side panel next to the form (usage, stats …). */
  side?(key: string, rec: AdminRec | undefined): ReactNode;
  /** Disable delete with a reason (e.g. a used concept). */
  deleteBlocked?(key: string): string | null;
}

export function ResourceEdit(props: ResourceEditProps) {
  const { key = '' } = useParams();
  return key === 'new' ? <ResourceCreate {...props} /> : <ResourceUpdate {...props} recKey={key} />;
}

function ResourceCreate({ def }: ResourceEditProps) {
  const t = useT();
  const to = useAdminPath();
  const nav = useNavigate();
  const qc = useQueryClient();
  const draftKey = `${def.id}:new`;
  const [value, setValue] = useState<any>(() => readDraft(draftKey)?.value ?? defaultFor(def.schema, { includeOptional: false }));
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const issues = useValidation(def.schema, value);
  const suggest = useSuggestions(def.suggest);
  useAutosave(draftKey, value, null, true);
  return (
    <section>
      <PageHeader title={`${t(def.titleKey)} · ${t('common.new')}`}>
        <Link to={to(def.id)} className="adm-btn adm-btn--ghost">
          <Icon id="prev" size={18} />
          {t('common.back')}
        </Link>
      </PageHeader>
      <SchemaForm schema={def.schema} value={value} onChange={setValue} suggest={suggest} hidden={def.hidden} />
      <ErrorBox error={error} />
      <div className="adm-savebar">
        <span className="adm-savebar__status" role="status">
          <Icon id="clock" size={18} />
          <span>{t('draft.newLocal')}</span>
        </span>
        <span className="adm-savebar__actions">
        <button
          type="button"
          className="adm-btn adm-btn--primary"
          disabled={saving || issues.length > 0}
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              const rec = (await call(def.create, { body: value })) as AdminRec;
              clearDraft(draftKey);
              void qc.invalidateQueries({ queryKey: [def.list] });
              nav(to(`${def.id}/${encodeURIComponent(recordKey(def, rec))}`), { replace: true });
            } catch (e) {
              setError(e);
            } finally {
              setSaving(false);
            }
          }}
        >
          <Icon id="check" size={18} />
          {t('common.create')}
        </button>
        </span>
      </div>
    </section>
  );
}

function ResourceUpdate({ def, recKey, side, deleteBlocked }: ResourceEditProps & { recKey: string }) {
  const t = useT();
  const to = useAdminPath();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['record', def.id, recKey], queryFn: () => fetchRecord(def, recKey) });
  const canPatch = useCanCall(def.patch);
  const canDelete = useCanCall(def.del ?? 'me') && !!def.del;
  const suggest = useSuggestions(def.suggest);
  const [delError, setDelError] = useState<unknown>(null);
  const server = useMemo<Versioned<any> | undefined>(() => (q.data ? { value: q.data.data, version: q.data.version } : undefined), [q.data]);
  const editor = useVersionedEditor<any>({
    draftKey: `${def.id}:${recKey}`,
    server,
    save: async (value, version) => {
      // A cleared optional field goes out as null so the server removes it (contract 0.3.0).
      const stored = qc.getQueryData<AdminRec>(['record', def.id, recKey])?.data;
      const body = def.patchBody(withRemovals((ENDPOINTS[def.patch] as EndpointDef).body, value, stored), version);
      const r = (await call(def.patch, { params: { [def.param]: recKey }, body, ifMatch: version })) as AdminRec;
      qc.setQueryData(['record', def.id, recKey], r);
      void qc.invalidateQueries({ queryKey: [def.list] });
      return { value: r.data, version: r.version };
    },
    reload: async () => {
      const r = await fetchRecord(def, recKey);
      qc.setQueryData(['record', def.id, recKey], r);
      return { value: r.data, version: r.version };
    },
  });
  const issues = useValidation(def.schema, editor.value);
  useScopedHue(def.id === 'subjects' ? (q.data?.data as { hue?: number } | undefined)?.hue : undefined);
  const blocked = deleteBlocked?.(recKey) ?? null;

  if (q.isLoading) return <Skeleton lines={8} />;
  if (q.error) return <ErrorBox error={q.error} />;
  return (
    <section className="adm-split">
      <div className="adm-split__main">
        <PageHeader title={`${t(def.titleKey)} · ${recKey}`}>
          <Link to={to(def.id)} className="adm-btn adm-btn--ghost">
            <Icon id="prev" size={18} />
            {t('common.back')}
          </Link>
          {canDelete && (
            <button
              type="button"
              className="adm-btn adm-btn--danger"
              disabled={!!blocked}
              title={blocked ?? undefined}
              onClick={async () => {
                if (!window.confirm(t('common.confirmDelete', { count: 1 }))) return;
                try {
                  await call(def.del!, { params: { [def.param]: recKey }, ifMatch: editor.version });
                  void qc.invalidateQueries({ queryKey: [def.list] });
                  nav(to(def.id));
                } catch (e) {
                  setDelError(e);
                }
              }}
            >
              <Icon id="trash" size={18} />
              {t('common.delete')}
            </button>
          )}
        </PageHeader>
        {blocked && <p className="adm-hint">{blocked}</p>}
        <ErrorBox error={delError} />
        <DraftBanner editor={editor} />
        {editor.value !== undefined && (
          <SchemaForm schema={def.schema} value={editor.value} onChange={editor.setValue} readOnly={!canPatch} suggest={suggest} hidden={[def.keyField, ...(def.hidden ?? [])]} />
        )}
        <SaveBar editor={editor} disabled={issues.length > 0} canSave={canPatch} />
      </div>
      {side && <aside className="adm-split__side">{side(recKey, q.data)}</aside>}
    </section>
  );
}
