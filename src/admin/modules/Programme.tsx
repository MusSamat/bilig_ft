/**
 * A-03 Programme: courses by grade, units, objectives with codes (generic
 * resource pages), objectives CSV import, and coverage — which objectives no
 * topic version references yet.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ObjectiveSchema, t as tl, type Objective } from '@bilig/content-model';
import { ApiError } from '../api/client';
import { useCanCall } from '../api/hooks';
import { api } from '../api/session';
import { useAdminLang, useT } from '../i18n';
import { csvRecords } from '../lib/csv';
import { useAdminPath } from '../shell/base';
import { ErrorBox, PageHeader, Tabs } from '../shell/ui';
import { SubjectFilter } from './ResourcePages';
import { Icon } from '../lib/icons';
import { navIcon } from '../shell/Layout';

interface Row {
  line: number;
  value?: Objective;
  errors: string[];
}

/** CSV columns: code,key,unitKey,ky,ru,en */
export function parseObjectivesCsv(text: string): Row[] {
  return csvRecords(text).map(({ line, rec }) => {
    const candidate = { code: rec.code, key: rec.key, unitKey: rec.unitkey ?? rec.unit, text: { ky: rec.ky ?? '', ru: rec.ru ?? '', en: rec.en ?? '' } };
    const r = ObjectiveSchema.safeParse(candidate);
    return r.success ? { line, value: r.data, errors: [] } : { line, errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  });
}

function CsvImport() {
  const t = useT();
  const [rows, setRows] = useState<Row[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const valid = rows.filter((r) => r.value);
  const run = async () => {
    setBusy(true);
    const out: string[] = [];
    for (const r of valid) {
      const o = r.value!;
      try {
        await api.call('adminObjectiveCreate', { body: o });
        out.push(t('programme.created', { key: o.key }));
      } catch (e) {
        if (e instanceof ApiError && e.code === 'conflict') {
          try {
            const cur = await api.call('adminObjectiveGet', { params: { key: o.key } });
            const { key: _k, ...rest } = o;
            await api.call('adminObjectivePatch', { params: { key: o.key }, body: { ...rest, version: cur.version }, ifMatch: cur.version });
            out.push(t('programme.updated', { key: o.key }));
          } catch (e2) {
            out.push(`${o.key}: ${e2 instanceof ApiError ? t(`errors.${e2.code}`) : String(e2)}`);
          }
        } else out.push(`${o.key}: ${e instanceof ApiError ? t(`errors.${e.code}`) + (e.detail ? ` (${e.detail})` : '') : String(e)}`);
      }
    }
    setLog(out);
    setBusy(false);
  };
  return (
    <div className="adm-card">
      <h2>{t('programme.csvTitle')}</h2>
      <p className="adm-hint">{t('programme.csvHelp')}</p>
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label={t('programme.csvFile')}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setRows(parseObjectivesCsv(await f.text()));
          setLog([]);
        }}
      />
      {rows.length > 0 && (
        <>
          <div className="adm-tablewrap">
          <table className="adm-table adm-table--compact">
            <thead>
              <tr>
                <th>{t('programme.line')}</th>
                <th>{t('fields.code')}</th>
                <th>{t('fields.key')}</th>
                <th>{t('fields.unitKey')}</th>
                <th>{t('programme.check')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line} className={r.errors.length ? 'is-fail' : undefined}>
                  <td>{r.line}</td>
                  <td>{r.value?.code}</td>
                  <td>{r.value?.key}</td>
                  <td>{r.value?.unitKey}</td>
                  <td>{r.errors.length ? r.errors.join('; ') : <Icon id="check" size={18} className="adm-ok" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <button type="button" className="adm-btn adm-btn--primary" disabled={busy || !valid.length} onClick={run}>
            {t('programme.import', { count: valid.length })}
          </button>
        </>
      )}
      {log.length > 0 && <pre className="adm-alert adm-alert--info">{log.join('\n')}</pre>}
    </div>
  );
}

async function allPages<T>(fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor: string | null }>, max = 50): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < max; i++) {
    const p = await fetchPage(cursor);
    out.push(...p.items);
    if (!p.nextCursor) break;
    cursor = p.nextCursor;
  }
  return out;
}

export interface CoverageResult {
  uncovered: Objective[];
  covered: number;
  total: number;
}

/** Objectives no topic (latest version) references. */
export async function computeCoverage(subjectKey?: string): Promise<CoverageResult> {
  const objectives = (await allPages((cursor) => api.call('adminObjectiveList', { query: { limit: 100, subjectKey, cursor } }))).map((r) => r.data);
  const topics = await allPages((cursor) => api.call('adminTopicList', { query: { limit: 100, subjectKey, cursor } }));
  const used = new Set<string>();
  for (const tp of topics) {
    if (!tp.latestVersion) continue;
    const v = await api.call('adminTopicVersionGet', { params: { id: tp.id, version: tp.latestVersion } });
    v.doc.objectiveKeys.forEach((k) => used.add(k));
  }
  const uncovered = objectives.filter((o) => !used.has(o.key));
  return { uncovered, covered: objectives.length - uncovered.length, total: objectives.length };
}

function Coverage() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const [subject, setSubject] = useState<string | undefined>();
  const [res, setRes] = useState<CoverageResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="adm-card">
      <h2>{t('programme.coverage')}</h2>
      <div className="adm-filters">
        <SubjectFilter value={subject} onApply={setSubject} />
        <button
          type="button"
          className="adm-btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              setRes(await computeCoverage(subject));
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t('common.loading') : t('programme.computeCoverage')}
        </button>
      </div>
      <ErrorBox error={error} />
      {res && (
        <>
          <p>
            {t('programme.coverageSummary', { covered: res.covered, total: res.total })}
            <meter min={0} max={res.total || 1} value={res.covered} style={{ marginInlineStart: 8 }} />
          </p>
          <div className="adm-tablewrap">
          <table className="adm-table adm-table--compact">
            <thead>
              <tr>
                <th>{t('fields.code')}</th>
                <th>{t('fields.text')}</th>
                <th>{t('fields.unitKey')}</th>
              </tr>
            </thead>
            <tbody>
              {res.uncovered.map((o) => (
                <tr key={o.key}>
                  <td>
                    <code>{o.code}</code>
                  </td>
                  <td>{tl(o.text, lang)}</td>
                  <td>{o.unitKey}</td>
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

export function Programme() {
  const t = useT();
  const to = useAdminPath();
  const [tab, setTab] = useState('structure');
  const canImport = useCanCall('adminObjectiveCreate');
  return (
    <section>
      <PageHeader title={t('nav.programme')} icon={navIcon('programme')} description={t('pages.programme')} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: 'structure',
            label: t('programme.structure'),
            content: (
              <ul className="adm-cards-nav">
                <li>
                  <Link to={to('courses')}>{t('nav.courses')}</Link>
                  <p className="adm-hint">{t('programme.coursesHint')}</p>
                </li>
                <li>
                  <Link to={to('units')}>{t('nav.units')}</Link>
                  <p className="adm-hint">{t('programme.unitsHint')}</p>
                </li>
                <li>
                  <Link to={to('objectives')}>{t('nav.objectives')}</Link>
                  <p className="adm-hint">{t('programme.objectivesHint')}</p>
                </li>
              </ul>
            ),
          },
          ...(canImport ? [{ id: 'import', label: t('programme.csvTitle'), content: <CsvImport /> }] : []),
          { id: 'coverage', label: t('programme.coverage'), content: <Coverage /> },
        ]}
      />
    </section>
  );
}
