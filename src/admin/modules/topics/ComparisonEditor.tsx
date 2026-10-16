/**
 * A-09 comparisons: columns are topic concepts or samples, rows are property
 * types. Values are pulled from the dictionary (with topic overrides); a manual
 * value can be entered only where the concept has no such property.
 */
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ComparisonSchema,
  PROPERTY_TYPES,
  applyOverride,
  formatPropValue,
  t as tl,
  type Comparison,
  type ComparisonColumn,
  type Concept,
  type Localized,
  type ResolvedConcept,
} from '@bilig/content-model';
import { useCanCall } from '../../api/hooks';
import { api } from '../../api/session';
import { IssueSummary, useValidation } from '../../forms/SchemaForm';
import { useAdminLang, useT } from '../../i18n';
import { DraftBanner, SaveBar, useVersionedEditor, type Versioned } from '../../lib/versioned';
import { useAdminPath } from '../../shell/base';
import { ErrorBox, PageHeader } from '../../shell/ui';
import { fetchTopicState, useInvalidateTopic, useTopicState } from './useTopic';

const EMPTY: Comparison = { columns: [], rows: [] };
const colId = (c: ComparisonColumn) => `${c.kind}:${c.key}`;

/** Dictionary value for a cell, or null when the concept has no such property (→ manual allowed). */
export function cellValue(concept: ResolvedConcept | undefined, row: string, lang: 'ky' | 'ru' | 'en'): string | null {
  const p = concept?.props.find((x) => x.type === row);
  return p ? formatPropValue(p, lang) : null;
}

export function setManual(cmp: Comparison, column: string, row: string, value: Localized | undefined): Comparison {
  const rest = (cmp.manual ?? []).filter((m) => !(m.column === column && m.row === row));
  const manual = value && (value.ky || value.ru || value.en) ? [...rest, { column, row, value }] : rest;
  return { ...cmp, manual: manual.length ? manual : undefined };
}

export function ComparisonEditor() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const { id = '' } = useParams();
  const q = useTopicState(id);
  const invalidate = useInvalidateTopic();
  const canSave = useCanCall('adminComparisonPut');
  const canDelete = useCanCall('adminComparisonDelete');
  const doc = q.data?.doc;
  const conceptQs = useQueries({
    queries: (doc?.conceptKeys ?? []).map((k) => ({ queryKey: ['adminConceptGet', { key: k }, {}], queryFn: () => api.call('adminConceptGet', { params: { key: k } }), staleTime: 60_000 })),
  });
  const concepts = useMemo(() => {
    const m = new Map<string, ResolvedConcept>();
    conceptQs.forEach((cq) => {
      const c = cq.data?.data as Concept | undefined;
      if (c) m.set(c.key, applyOverride(c, doc?.overrides[c.key]));
    });
    return m;
  }, [conceptQs, doc]);
  const server = useMemo<Versioned<Comparison> | undefined>(() => (q.data ? { value: q.data.doc.activities.comparison ?? EMPTY, version: q.data.detail.version } : undefined), [q.data]);
  const editor = useVersionedEditor<Comparison>({
    draftKey: `comparison:${id}`,
    server,
    save: async (comparison, version) => {
      await api.call('adminComparisonPut', { params: { topicKey: q.data!.detail.key }, body: { comparison, version }, ifMatch: version });
      invalidate(id);
      const st = await fetchTopicState(id);
      return { value: st.doc.activities.comparison ?? comparison, version: st.detail.version };
    },
    reload: async () => {
      const st = await fetchTopicState(id);
      return { value: st.doc.activities.comparison ?? EMPTY, version: st.detail.version };
    },
  });
  const issues = useValidation(ComparisonSchema, editor.value);
  if (q.isLoading) return <p>{t('common.loading')}</p>;
  if (!q.data || !doc) return <ErrorBox error={q.error} />;
  const cmp = editor.value ?? EMPTY;
  const readOnly = !canSave;
  const candidates: ComparisonColumn[] = [...doc.conceptKeys.map((key) => ({ kind: 'concept' as const, key })), ...doc.samples.map((s) => ({ kind: 'sample' as const, key: s.key }))];
  const selected = new Set(cmp.columns.map(colId));
  const toggleCol = (c: ComparisonColumn) => editor.setValue({ ...cmp, columns: selected.has(colId(c)) ? cmp.columns.filter((x) => colId(x) !== colId(c)) : [...cmp.columns, c] });
  const propKeys = [...new Set([...Object.keys(PROPERTY_TYPES), ...[...concepts.values()].flatMap((c) => c.props.map((p) => p.type))])];
  const toggleRow = (r: string) => editor.setValue({ ...cmp, rows: cmp.rows.includes(r) ? cmp.rows.filter((x) => x !== r) : [...cmp.rows, r] });
  const colTitle = (c: ComparisonColumn) => (c.kind === 'concept' ? tl(concepts.get(c.key)?.title, lang) || c.key : tl(doc.samples.find((s) => s.key === c.key)?.title, lang) || c.key);

  return (
    <section>
      <PageHeader title={`${t('activities.comparison')} · ${q.data.detail.key}`}>
        <Link className="adm-btn adm-btn--ghost" to={to(`topics/${id}?tab=activities`)}>
          {t('common.back')}
        </Link>
        {canDelete && doc.activities.comparison && (
          <button
            type="button"
            className="adm-btn adm-btn--danger"
            onClick={async () => {
              await api.call('adminComparisonDelete', { params: { topicKey: q.data!.detail.key }, ifMatch: q.data!.detail.version });
              invalidate(id);
            }}
          >
            {t('common.delete')}
          </button>
        )}
      </PageHeader>
      <DraftBanner editor={editor} />
      <div className="adm-grid">
        <fieldset className="adm-card">
          <legend>{t('comparison.columns')}</legend>
          {candidates.map((c) => (
            <label key={colId(c)} className="adm-filter--check adm-block">
              <input type="checkbox" disabled={readOnly} checked={selected.has(colId(c))} onChange={() => toggleCol(c)} /> {t(`enum.${c.kind}`)}: {colTitle(c)}
            </label>
          ))}
        </fieldset>
        <fieldset className="adm-card">
          <legend>{t('comparison.rows')}</legend>
          {propKeys.map((r) => (
            <label key={r} className="adm-filter--check adm-block">
              <input type="checkbox" disabled={readOnly} checked={cmp.rows.includes(r)} onChange={() => toggleRow(r)} /> {PROPERTY_TYPES[r]?.label[lang] ?? r}
            </label>
          ))}
        </fieldset>
      </div>
      {cmp.columns.length > 0 && cmp.rows.length > 0 && (
        <div className="adm-tablewrap">
        <table className="adm-table adm-comparison">
          <thead>
            <tr>
              <th />
              {cmp.columns.map((c) => (
                <th key={colId(c)}>{colTitle(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cmp.rows.map((r) => (
              <tr key={r}>
                <th>{PROPERTY_TYPES[r]?.label[lang] ?? r}</th>
                {cmp.columns.map((c) => {
                  const dict = c.kind === 'concept' ? cellValue(concepts.get(c.key), r, lang) : null;
                  const manual = cmp.manual?.find((m) => m.column === c.key && m.row === r)?.value;
                  return (
                    <td key={colId(c)}>
                      {dict !== null ? (
                        <span title={t('comparison.fromDictionary')}>{dict}</span>
                      ) : (
                        <input
                          aria-label={t('comparison.manual', { column: colTitle(c), row: r })}
                          readOnly={readOnly}
                          className="adm-manual"
                          value={manual?.[lang === 'ky' ? 'ky' : 'ru'] ?? ''}
                          placeholder={t('comparison.manualPlaceholder')}
                          onChange={(e) => {
                            const base = manual ?? { ky: '', ru: '', en: '' };
                            editor.setValue(setManual(cmp, c.key, r, { ...base, [lang === 'ky' ? 'ky' : 'ru']: e.target.value }));
                          }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <p className="adm-hint">{t('comparison.hint')}</p>
      {issues.length > 0 && editor.dirty && <IssueSummary issues={issues} />}
      <SaveBar editor={editor} disabled={issues.length > 0} canSave={!readOnly} />
    </section>
  );
}
