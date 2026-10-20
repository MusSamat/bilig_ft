/**
 * «All lessons» of a КТП: sections collapsed by default with their lesson and
 * problem counts, a search by topic (or number) and «only lessons with
 * problems». Read-only rows — a row opens the lesson sheet.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KtpRow, TeachingPlan } from '@bilig/content-model/api';
import { Icon } from '../components/Icon';
import { cx, inputCls } from '../cabinet/teacher/ui';
import { useLang } from '../lib/hooks';
import { dayMonth, groupBySection, lessonProblems, searchRows } from './model';
import { useIssueText } from './Problems';

export function AllLessons({ plan, cls, onOpen, openSection }: { plan: TeachingPlan; cls: string; onOpen: (row: KtpRow) => void; openSection?: string | null }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const issueText = useIssueText();
  const [q, setQ] = useState('');
  const [only, setOnly] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set(openSection ? [openSection] : []));

  useEffect(() => {
    if (!openSection) return;
    setOpen((s) => new Set(s).add(openSection));
    requestAnimationFrame(() => document.getElementById(`ktp-sec-${openSection}`)?.scrollIntoView?.({ block: 'start' }));
  }, [openSection]);

  const groups = useMemo(() => groupBySection(plan.rows), [plan.rows]);
  const matches = useMemo(() => new Set(searchRows(plan.rows, q, lang).map((r) => r.index)), [plan.rows, q, lang]);
  const filtering = !!q.trim() || only;
  const shown = groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => matches.has(r.index) && (!only || lessonProblems(plan.issues, r.index).length > 0)) }))
    .filter((g) => g.rows.length > 0);

  const toggle = (key: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <section className="grid gap-4" aria-label={t('ktp.view.all')}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative block min-w-0 flex-1 basis-64">
          <span className="visually-hidden">{t('ktp.all.search')}</span>
          <Icon name="search" className="sm pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" className={cx(inputCls, 'ps-9')} value={q} placeholder={t('ktp.all.searchPlaceholder')} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-pill border border-line bg-chip px-4 text-base font-semibold text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={only} onChange={(e) => setOnly(e.target.checked)} />
          {t('ktp.all.onlyProblems')}
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="m-0 rounded-lg border border-dashed border-line px-4 py-6 text-center text-base text-muted" role="status">
          {only && !q.trim() ? t('ktp.all.noProblems') : t('ktp.all.none')}
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {shown.map((g) => {
            const expanded = filtering || open.has(g.key);
            const full = groups.find((x) => x.key === g.key)!;
            const sectionIssue = plan.issues.find((i) => i.code === 'section_hours_mismatch' && i.row === full.rows[0].index);
            const problems = full.rows.reduce((n, r) => n + lessonProblems(plan.issues, r.index).length, sectionIssue ? 1 : 0);
            const panel = `ktp-sec-panel-${g.key}`;
            return (
              <li key={g.key} id={`ktp-sec-${g.key}`} className="overflow-hidden rounded-lg border border-line bg-chip">
                <h3 className="m-0">
                  <button
                    type="button"
                    className="flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1 border-0 bg-transparent px-4 py-2 text-start hover:bg-soft"
                    aria-expanded={expanded}
                    aria-controls={panel}
                    disabled={filtering}
                    onClick={() => toggle(g.key)}
                  >
                    <Icon name="chevron-right" className={cx('flex-none text-muted transition-transform', expanded && 'rotate-90')} />
                    <span className="min-w-0 flex-1 text-md font-semibold text-ink">{g.title ?? t('ktp.all.untitled')}</span>
                    <span className="text-sm text-muted">{t('ktp.all.lessons', { count: full.rows.length })}</span>
                    {problems > 0 && (
                      <span className="inline-flex min-h-7 items-center gap-1 rounded-pill border border-gold px-3 text-sm font-semibold text-ink">
                        <Icon name="info" className="sm" />
                        {t('ktp.all.problems', { count: problems })}
                      </span>
                    )}
                  </button>
                </h3>
                {expanded && (
                  <div id={panel} className="grid gap-1 border-t border-line p-2">
                    {sectionIssue && (
                      <p className="m-0 flex items-start gap-1 px-2 py-1 text-sm font-semibold text-ink">
                        <Icon name="info" className="sm mt-0.5 flex-none" />
                        {issueText(sectionIssue)}
                      </p>
                    )}
                    <ul className="m-0 grid list-none gap-1 p-0">
                      {g.rows.map((r) => {
                        const rp = lessonProblems(plan.issues, r.index);
                        const date = r.dates[cls];
                        return (
                          <li key={r.index}>
                            <button
                              type="button"
                              className="grid min-h-11 w-full grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-md border-0 bg-transparent px-2 py-2 text-start hover:bg-soft md:grid-cols-[2.5rem_8rem_minmax(0,1fr)]"
                              aria-label={t('ktp.lesson.open', { n: r.index, title: r.title || t('ktp.lesson.untitled') })}
                              onClick={() => onOpen(r)}
                            >
                              <span className="text-sm font-bold text-muted">{r.index}</span>
                              <span className={cx('text-sm', date ? 'text-muted' : 'font-semibold text-bad')}>{date ? dayMonth(lang, date) : t('ktp.lesson.noDate')}</span>
                              <span className="col-start-2 grid gap-1 md:col-start-3">
                                <span className="text-base text-ink">{r.title || t('ktp.lesson.untitled')}</span>
                                {rp.map((i, n) => (
                                  <span key={n} className={cx('flex items-start gap-1 text-sm font-semibold', i.severity === 'error' ? 'text-bad' : 'text-ink')}>
                                    <Icon name={i.severity === 'error' ? 'warn' : 'info'} className="sm mt-0.5 flex-none" />
                                    {[i.class && i.class !== cls ? i.class : null, issueText(i)].filter(Boolean).join(': ')}
                                  </span>
                                ))}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
