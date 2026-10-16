/**
 * A-11 translations: keys with ru → ky → en side by side; filters in the URL
 * (target locale, status, «не переведено», «изменился источник», search);
 * status per key/locale (machine draft is badged); inline edits and bulk
 * «проверено» saved with one PATCH; CSV / XLIFF import and export; glossary
 * terms highlighted in the source, forbidden variants flagged in targets.
 *
 * The contract lists one locale per request, so the other two columns are
 * fetched from the same cursor (keys are paged in key order in every locale).
 */
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useMemo, useState } from 'react';
import { I18N_STATUSES, LANGS, findForbidden, type GlossaryTerm, type I18nStatus, type Lang } from '@bilig/content-model';
import type { LocaleString } from '@bilig/content-model/api';
import { useApiQuery, useCanCall } from '../api/hooks';
import { api } from '../api/session';
import { useT } from '../i18n';
import { highlightTerms } from '../lib/glossary';
import { Pager } from '../lists/ListView';
import { useListParams } from '../lists/useListParams';
import { Badge, ErrorBox, FilterCheck, FilterSelect, FilterText, PageHeader, StatusBadge, downloadBlob } from '../shell/ui';
import { navIcon } from '../shell/Layout';

type Edit = { value: string; status: I18nStatus };
const ek = (key: string, locale: Lang) => `${key}\u0000${locale}`;
export const TRANSLATION_FILTERS = ['locale', 'status', 'untranslated', 'sourceChanged', 'q'] as const;

export async function loadGlossary(): Promise<GlossaryTerm[]> {
  const out: GlossaryTerm[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const p = await api.call('adminGlossaryList', { query: { limit: 100, ...(cursor ? { cursor } : {}) } });
    out.push(...p.items.map((r) => r.data));
    if (!p.nextCursor) break;
    cursor = p.nextCursor;
  }
  return out;
}

function Highlighted({ text, glossary, lang }: { text: string; glossary: GlossaryTerm[]; lang: Lang }) {
  const t = useT();
  return (
    <>
      {highlightTerms(text, glossary, lang).map((s, i) =>
        s.term ? (
          <mark key={i} className="adm-term" title={t('translations.term', { ky: s.term.ky, ru: s.term.ru, en: s.term.en })}>
            {s.text}
          </mark>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </>
  );
}

function ImportExport({ locale }: { locale: Lang }) {
  const t = useT();
  const qc = useQueryClient();
  const canImport = useCanCall('adminStringsImport');
  const canExport = useCanCall('adminStringsExport');
  const [fmt, setFmt] = useState<'csv' | 'xliff'>('xliff');
  const [importStatus, setImportStatus] = useState<I18nStatus | ''>('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  return (
    <div className="adm-card adm-inline">
      <label className="adm-filter">
        <span>{t('translations.format')}</span>
        <select value={fmt} onChange={(e) => setFmt(e.target.value as 'csv' | 'xliff')}>
          <option value="xliff">XLIFF</option>
          <option value="csv">CSV</option>
        </select>
      </label>
      {canExport && (
        <>
          <button
            type="button"
            className="adm-btn adm-btn--small"
            onClick={async () => {
              try {
                const r = await api.callBinary('adminStringsExport', { query: { format: fmt, locale, source: 'ru' } });
                downloadBlob(r.blob, r.filename ?? `bilig-${locale}.${fmt === 'csv' ? 'csv' : 'xlf'}`);
              } catch (e) {
                setError(e);
              }
            }}
          >
            {t('translations.export')}
          </button>
          <button
            type="button"
            className="adm-btn adm-btn--small adm-btn--ghost"
            onClick={async () => {
              try {
                const r = await api.callBinary('adminStringsExport', { query: { format: fmt, locale, source: 'ru', untranslated: 'true' } });
                downloadBlob(r.blob, r.filename ?? `bilig-${locale}-todo.${fmt === 'csv' ? 'csv' : 'xlf'}`);
              } catch (e) {
                setError(e);
              }
            }}
          >
            {t('translations.exportUntranslated')}
          </button>
        </>
      )}
      {canImport && (
        <>
          <label className="adm-filter">
            <span>{t('translations.importStatus')}</span>
            <select value={importStatus} onChange={(e) => setImportStatus(e.target.value as I18nStatus | '')}>
              <option value="">{t('translations.keepStatus')}</option>
              {I18N_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`enum.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="adm-filter">
            <span>{t('translations.import')}</span>
            <input
              type="file"
              accept=".csv,.xlf,.xliff,text/csv,application/xliff+xml"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setError(null);
                try {
                  const format = /\.csv$/i.test(f.name) ? 'csv' : 'xliff';
                  const r = await api.call('adminStringsImport', { body: { format, locale, content: await f.text(), ...(importStatus ? { status: importStatus } : {}) } });
                  setResult(t('translations.importResult', { updated: r.updated, unchanged: r.unchanged, unknown: r.unknownKeys.length, errors: r.errors.length }) + (r.errors.length ? '\n' + r.errors.map((x) => `${x.line ?? ''}: ${x.message}`).join('\n') : ''));
                  void qc.invalidateQueries({ queryKey: ['adminStrings'] });
                } catch (err) {
                  setError(err);
                }
              }}
            />
          </label>
        </>
      )}
      <ErrorBox error={error} />
      {result && <pre className="adm-alert adm-alert--info">{result}</pre>}
    </div>
  );
}

export function Translations() {
  const t = useT();
  const qc = useQueryClient();
  const list = useListParams(TRANSLATION_FILTERS, 50);
  const target = (list.filters.locale === 'en' || list.filters.locale === 'ru' ? list.filters.locale : 'ky') as Lang;
  const status = I18N_STATUSES.includes(list.filters.status as I18nStatus) ? (list.filters.status as I18nStatus) : undefined;
  const canPatch = useCanCall('adminStringsPatch');
  const main = useApiQuery(
    'adminStrings',
    {
      query: {
        locale: target,
        ...(status ? { status } : {}),
        ...(list.filters.untranslated === 'true' ? { untranslated: 'true' } : {}),
        ...(list.filters.sourceChanged === 'true' ? { sourceChanged: 'true' } : {}),
        ...(list.cursor ? { cursor: list.cursor } : {}),
        limit: list.limit,
      },
    },
    { placeholderData: keepPreviousData },
  );
  const others = LANGS.filter((l) => l !== target);
  const side = others.map((l) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useApiQuery('adminStrings', { query: { locale: l, ...(list.cursor ? { cursor: list.cursor } : {}), limit: 500 } }, { placeholderData: keepPreviousData, enabled: !!main.data });
  });
  const glossary = useQuery({ queryKey: ['glossary-all'], queryFn: loadGlossary, staleTime: 5 * 60_000, enabled: useCanCall('adminGlossaryList') });
  const terms = glossary.data ?? [];
  const [edits, setEdits] = useState<Map<string, Edit>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const byLocale = useMemo(() => {
    const m = new Map<Lang, Map<string, LocaleString>>();
    m.set(target, new Map((main.data?.items ?? []).map((r) => [r.key, r])));
    others.forEach((l, i) => m.set(l, new Map((side[i].data?.items ?? []).map((r) => [r.key, r]))));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [main.data, side[0].data, side[1].data, target]);

  let rows = main.data?.items ?? [];
  const qtext = list.filters.q?.toLowerCase();
  if (qtext) rows = rows.filter((r) => r.key.toLowerCase().includes(qtext) || LANGS.some((l) => byLocale.get(l)?.get(r.key)?.value.toLowerCase().includes(qtext)));

  const cell = (key: string, l: Lang) => {
    const e = edits.get(ek(key, l));
    const row = byLocale.get(l)?.get(key);
    return { value: e?.value ?? row?.value ?? '', status: e?.status ?? row?.status, row, edited: !!e };
  };
  const setCell = (key: string, l: Lang, patch: Partial<Edit>) => {
    const cur = cell(key, l);
    const next = new Map(edits);
    next.set(ek(key, l), { value: patch.value ?? cur.value, status: patch.status ?? (patch.value !== undefined && cur.status === 'machine' ? 'draft' : (cur.status ?? 'draft')) });
    setEdits(next);
  };
  const save = async (items: { key: string; locale: Lang; value: string; status: I18nStatus }[]) => {
    if (!items.length) return;
    setSaving(true);
    setError(null);
    try {
      for (let i = 0; i < items.length; i += 1000) await api.call('adminStringsPatch', { body: { items: items.slice(i, i + 1000) } });
      setEdits(new Map());
      setSelected(new Set());
      await qc.invalidateQueries({ queryKey: ['adminStrings'] });
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };
  const pending = [...edits.entries()].map(([k, v]) => {
    const [key, locale] = k.split('\u0000') as [string, Lang];
    return { key, locale, ...v };
  });

  return (
    <section>
      <PageHeader title={t('nav.translations')} icon={navIcon('translations')} description={t('pages.translations')}>
        {canPatch && (
          <>
            <button type="button" className="adm-btn" disabled={!selected.size || saving} onClick={() => save([...selected].map((key) => ({ key, locale: target, value: cell(key, target).value, status: 'reviewed' as const })))}>
              {t('translations.markReviewed', { count: selected.size })}
            </button>
            <button type="button" className="adm-btn adm-btn--primary" disabled={!pending.length || saving} onClick={() => save(pending)}>
              {saving ? t('common.saving') : t('translations.save', { count: pending.length })}
            </button>
          </>
        )}
      </PageHeader>
      <div className="adm-filters" role="search">
        <FilterSelect label={t('translations.target')} value={target} options={LANGS.map((l) => ({ value: l, label: l }))} onApply={(v) => list.setFilter('locale', v)} />
        <FilterSelect label={t('fields.status')} value={status} options={I18N_STATUSES.map((s) => ({ value: s, label: t(`enum.${s}`) }))} onApply={(v) => list.setFilter('status', v)} />
        <FilterCheck label={t('translations.untranslated')} value={list.filters.untranslated} onApply={(v) => list.setFilter('untranslated', v)} />
        <FilterCheck label={t('translations.sourceChanged')} value={list.filters.sourceChanged} onApply={(v) => list.setFilter('sourceChanged', v)} />
        <FilterText label={t('list.search')} value={list.filters.q} onApply={(v) => list.setFilter('q', v)} />
      </div>
      {list.filters.q && <p className="adm-hint">{t('translations.searchPageOnly')}</p>}
      <ImportExport locale={target} />
      <ErrorBox error={error ?? main.error} />
      <div className="adm-tablewrap">
      <table className="adm-table adm-translations">
        <thead>
          <tr>
            {canPatch && (
              <th className="adm-table__check">
                <input type="checkbox" aria-label={t('list.selectAll')} checked={rows.length > 0 && rows.every((r) => selected.has(r.key))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.key)) : new Set())} />
              </th>
            )}
            <th>{t('translations.key')}</th>
            {(['ru', 'ky', 'en'] as const).map((l) => (
              <th key={l} className={l === target ? 'is-target' : undefined}>
                {l}
                {l === 'ru' ? ` · ${t('translations.source')}` : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {main.isLoading && (
            <tr>
              <td colSpan={5}>{t('common.loading')}</td>
            </tr>
          )}
          {!main.isLoading && !rows.length && (
            <tr>
              <td colSpan={5} className="adm-muted">
                {t('list.empty')}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.key} data-testid={`row-${r.key}`}>
              {canPatch && (
                <td className="adm-table__check">
                  <input type="checkbox" aria-label={t('list.selectRow', { key: r.key })} checked={selected.has(r.key)} onChange={() => { const n = new Set(selected); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); setSelected(n); }} />
                </td>
              )}
              <td>
                <code className="adm-key">{r.key}</code>
                {r.sourceChanged && <Badge tone="warn">{t('translations.sourceChangedBadge')}</Badge>}
              </td>
              {(['ru', 'ky', 'en'] as const).map((l) => {
                const c = cell(r.key, l);
                const forbidden = l !== 'ru' && c.value ? findForbidden(c.value, terms, l) : [];
                return (
                  <td key={l} className={`${l === target ? 'is-target' : ''}${c.edited ? ' is-edited' : ''}`}>
                    {l === 'ru' && !canPatch ? (
                      <Highlighted text={c.value} glossary={terms} lang="ru" />
                    ) : (
                      <>
                        {l === 'ru' && c.value && (
                          <div className="adm-source">
                            <Highlighted text={c.value} glossary={terms} lang="ru" />
                          </div>
                        )}
                        <textarea rows={2} aria-label={t('translations.cell', { key: r.key, lang: l })} readOnly={!canPatch} value={c.value} onChange={(e) => setCell(r.key, l, { value: e.target.value })} />
                      </>
                    )}
                    <div className="adm-inline">
                      {c.status === 'machine' && <Badge tone="warn">{t('translations.machine')}</Badge>}
                      {c.status && c.status !== 'machine' && <StatusBadge status={c.status} />}
                      {canPatch && c.row && (
                        <select aria-label={t('translations.statusOf', { key: r.key, lang: l })} value={c.status} onChange={(e) => setCell(r.key, l, { status: e.target.value as I18nStatus })}>
                          {I18N_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {t(`enum.${s}`)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {forbidden.map((f) => (
                      <div key={f.variant} className="adm-field-errors">
                        {t('translations.forbidden', { variant: f.variant, suggestion: f.suggestion })}
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <Pager list={list} nextCursor={main.data?.nextCursor ?? null} fetching={main.isFetching} />
      <p className="adm-hint">{t('translations.lockNote')}</p>
    </section>
  );
}
