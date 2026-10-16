/**
 * A-17 analytics: activity by day, school and region; popular topics and
 * structures; hardest items; tutor questions, refusals, unanswered questions
 * (a content backlog) and LLM token use. The period lives in the URL.
 * Daily charts are single-series (events and attempts are separate charts —
 * one axis each) with a hover title per bar and a table view.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApiQuery } from '../api/hooks';
import { useAdminLang, useT } from '../i18n';
import { ErrorBox, KeyValue, PageHeader, fmtDate, fmtNum } from '../shell/ui';
import { navIcon } from '../shell/Layout';

const DAY = 86400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** URL `from`/`to` (YYYY-MM-DD) → the contract's offset date-times ([from, to+1d)). */
export function periodQuery(from?: string | null, to?: string | null) {
  const out: { from?: string; to?: string } = {};
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) out.from = `${from}T00:00:00.000Z`;
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) out.to = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + DAY).toISOString();
  return out;
}

function DailyBars({ title, rows, lang }: { title: string; rows: { date: string; value: number }[]; lang: string }) {
  const t = useT();
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((n, r) => n + r.value, 0);
  return (
    <figure className="adm-card adm-chart">
      <figcaption>
        <strong>{title}</strong> <span className="adm-muted">{fmtNum(total, lang)}</span>
        <button type="button" className="adm-btn adm-btn--ghost adm-btn--small" aria-pressed={table} onClick={() => setTable(!table)}>
          {table ? t('analytics.chart') : t('analytics.table')}
        </button>
      </figcaption>
      {table ? (
        <div className="adm-tablewrap">
        <table className="adm-table adm-table--compact">
          <tbody>
            {rows.map((r) => (
              <tr key={r.date}>
                <td>{r.date}</td>
                <td>{fmtNum(r.value, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <div className="adm-bars" role="img" aria-label={t('analytics.chartAlt', { title, total })}>
          {rows.map((r) => (
            <div key={r.date} className="adm-bars__col" title={`${r.date}: ${fmtNum(r.value, lang)}`}>
              <div className="adm-bars__bar" style={{ height: `${(r.value / max) * 100}%` }} />
            </div>
          ))}
        </div>
      )}
      {!table && rows.length > 0 && (
        <div className="adm-bars__axis adm-muted">
          <span>{rows[0].date}</span>
          <span>{rows[rows.length - 1].date}</span>
        </div>
      )}
    </figure>
  );
}

function CountTable({ title, rows, label }: { title: string; rows: { key: string; count: number }[]; label?(k: string): string }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  return (
    <div className="adm-card">
      <h2>{title}</h2>
      {rows.length ? (
        <div className="adm-tablewrap">
        <table className="adm-table adm-table--compact">
          <tbody>
            {rows.slice(0, 20).map((r) => (
              <tr key={r.key}>
                <td>{label ? label(r.key) : <code>{r.key}</code>}</td>
                <td className="adm-num">{fmtNum(r.count, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <p className="adm-muted">{t('list.empty')}</p>
      )}
    </div>
  );
}

export function Analytics() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const [sp, setSp] = useSearchParams();
  const from = sp.get('from') ?? isoDay(new Date(Date.now() - 30 * DAY));
  const to = sp.get('to') ?? isoDay(new Date());
  const q = useApiQuery('adminAnalyticsOverview', { query: periodQuery(from, to) });
  const schools = useApiQuery('adminSchoolList', { query: { limit: 100 } }, { staleTime: 60_000 });
  const schoolName = (id: string) => schools.data?.items.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  const set = (k: string, v: string) =>
    setSp((p) => {
      const n = new URLSearchParams(p);
      n.set(k, v);
      return n;
    });
  const d = q.data;
  return (
    <section>
      <PageHeader title={t('nav.analytics')} icon={navIcon('analytics')} description={t('pages.analytics')}>
        <label className="adm-filter">
          <span>{t('analytics.from')}</span>
          <input type="date" value={from} onChange={(e) => set('from', e.target.value)} />
        </label>
        <label className="adm-filter">
          <span>{t('analytics.to')}</span>
          <input type="date" value={to} onChange={(e) => set('to', e.target.value)} />
        </label>
      </PageHeader>
      <ErrorBox error={q.error} />
      {q.isLoading && <p>{t('common.loading')}</p>}
      {d && (
        <>
          <div className="adm-kpis">
            {(
              [
                ['activeSchools', d.activeSchools],
                ['activeStudents', d.activeStudents],
                ['attempts', d.attempts],
                ['events', d.events],
                ['questions', d.tutor.questions],
                ['tokens', d.tutor.inputTokens + d.tutor.outputTokens],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="adm-kpi">
                <div className="adm-kpi__value">{fmtNum(v, lang)}</div>
                <div className="adm-kpi__label">{t(`analytics.kpi.${k}`)}</div>
              </div>
            ))}
          </div>
          <div className="adm-grid">
            <DailyBars title={t('analytics.dailyEvents')} rows={d.daily.map((x) => ({ date: x.date, value: x.events }))} lang={lang} />
            <DailyBars title={t('analytics.dailyAttempts')} rows={d.daily.map((x) => ({ date: x.date, value: x.attempts }))} lang={lang} />
          </div>
          <div className="adm-grid">
            <CountTable title={t('analytics.bySchool')} rows={d.bySchool} label={schoolName} />
            <CountTable title={t('analytics.byRegion')} rows={d.byRegion} label={(k) => k} />
            <CountTable title={t('analytics.popularTopics')} rows={d.popularTopics} />
            <CountTable title={t('analytics.popularConcepts')} rows={d.popularConcepts} />
          </div>
          <div className="adm-grid">
            <div className="adm-card">
              <h2>{t('analytics.hardest')}</h2>
              <div className="adm-tablewrap">
              <table className="adm-table adm-table--compact">
                <thead>
                  <tr>
                    <th>{t('fields.key')}</th>
                    <th>{t('items.answers')}</th>
                    <th>{t('items.correctRate')}</th>
                    <th>{t('items.commonWrong')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.hardestItems.map((i) => (
                    <tr key={i.itemKey}>
                      <td>
                        <code>{i.itemKey}</code>
                      </td>
                      <td className="adm-num">{fmtNum(i.answers, lang)}</td>
                      <td className="adm-num">{i.correctRate === null ? '—' : fmtNum(i.correctRate, lang, { style: 'percent', maximumFractionDigits: 0 })}</td>
                      <td>{i.commonWrong ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            <div className="adm-card">
              <h2>{t('analytics.tutor')}</h2>
              <KeyValue
                items={[
                  [t('analytics.kpi.questions'), fmtNum(d.tutor.questions, lang)],
                  [t('analytics.refused'), fmtNum(d.tutor.refused, lang)],
                  [t('analytics.inputTokens'), fmtNum(d.tutor.inputTokens, lang)],
                  [t('analytics.outputTokens'), fmtNum(d.tutor.outputTokens, lang)],
                ]}
              />
              <h3>{t('analytics.unanswered')}</h3>
              <ul className="adm-plain">
                {d.tutor.unanswered.map((u, i) => (
                  <li key={i}>
                    <code>{u.topicKey}</code> {u.text} <span className="adm-muted">{fmtDate(u.ts, lang)}</span>
                  </li>
                ))}
                {!d.tutor.unanswered.length && <li className="adm-muted">{t('list.empty')}</li>}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
