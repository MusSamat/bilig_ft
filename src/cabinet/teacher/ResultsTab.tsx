/**
 * «Жыйынтыктар»: for one assignment — who finished, the average score and the
 * hardest questions. The assignment comes from `?assignment=` (links from the
 * assignments list) or is the latest one. Results are not paginated by the
 * contract, so the student table pages on the client.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import type { SchoolClass } from '@bilig/content-model/api';
import { api } from '../../api/client';
import { useTopicPackage } from '../../api/content';
import { useLang } from '../../lib/hooks';
import { formatDate, formatPercent } from '../format';
import { useAssignments, useTopicTitle } from './AssignmentsTab';
import { Pager } from './Pager';
import { EmptyState, ErrorState, Field, Loading, cx, inputCls } from './ui';

const PAGE = 20;
const STATUS_TONE = { done: 'text-ok', in_progress: 'text-accent', not_started: 'text-muted' } as const;

export function ResultsTab({ cls }: { cls: SchoolClass }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const list = useAssignments(cls.id);
  const topicTitle = useTopicTitle();
  const assignments = list.data?.pages.flatMap((p) => p.items) ?? [];
  const asked = params.get('assignment');
  const id = (asked && assignments.some((a) => a.id === asked) ? asked : assignments[0]?.id) ?? '';
  const current = assignments.find((a) => a.id === id);
  const results = useQuery({ queryKey: ['results', id], queryFn: () => api('assignmentResults', { params: { id } }), enabled: !!id });
  const pkg = useTopicPackage(current?.topicKey);
  const [page, setPage] = useState(0);

  if (list.isLoading) return <Loading rows={3} />;
  if (list.isError) return <ErrorState text={t('teacher.loadError')} onRetry={() => void list.refetch()} />;
  if (!assignments.length) return <EmptyState icon="chart" title={t('teacher.resultsEmpty')} text={t('teacher.resultsEmptyText')} />;

  const r = results.data;
  const rows = r?.students ?? [];
  const pages = Math.ceil(rows.length / PAGE);
  const done = rows.filter((s) => s.status === 'done').length;
  const prompt = (itemKey: string) => {
    const item = pkg.data?.pkg.items.find((i) => i.key === itemKey);
    return item ? tr(item.prompt, lang) : itemKey;
  };

  return (
    <div className="grid gap-5">
      <h2 className="font-serif text-lg font-bold text-ink">{t('teacher.tab.results')}</h2>
      <Field id="results-assignment" label={t('teacher.chooseAssignment')} className="max-w-130">
        <select
          id="results-assignment"
          className={inputCls}
          value={id}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            next.set('assignment', e.target.value);
            setParams(next, { replace: true });
            setPage(0);
          }}
        >
          {assignments.map((a) => (
            <option key={a.id} value={a.id}>
              {topicTitle(a.topicKey)}
              {a.dueAt ? ` · ${formatDate(lang, a.dueAt)}` : ''}
            </option>
          ))}
        </select>
      </Field>
      {results.isLoading && <Loading rows={2} />}
      {results.isError && <ErrorState text={t('teacher.loadError')} onRetry={() => void results.refetch()} />}
      {r && (
        <>
          <dl className="m-0 grid grid-cols-2 gap-3 md:max-w-130">
            <div className="grid gap-1 rounded-lg border border-line bg-chip p-4">
              <dt className="text-sm text-muted">{t('teacher.average')}</dt>
              <dd className="m-0 font-serif text-2xl font-bold text-ink">{r.averageScore === null ? '—' : formatPercent(lang, r.averageScore)}</dd>
            </div>
            <div className="grid gap-1 rounded-lg border border-line bg-chip p-4">
              <dt className="text-sm text-muted">{t('teacher.doneLabel')}</dt>
              <dd className="m-0 font-serif text-2xl font-bold text-ink">
                <span aria-hidden="true">
                  {done}/{rows.length}
                </span>
                <span className="sr-only">{t('teacher.doneCount', { done, total: rows.length })}</span>
              </dd>
            </div>
          </dl>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-base">
              <thead>
                <tr className="text-left text-sm text-muted">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t('teacher.student')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t('teacher.statusCol')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {t('teacher.scoreCol')}
                  </th>
                  <th scope="col" className="hidden px-4 py-3 font-semibold md:table-cell">
                    {t('teacher.finished')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * PAGE, page * PAGE + PAGE).map((s) => (
                  <tr key={s.studentId} className="border-t border-line">
                    <td className="px-4 py-3 font-semibold text-ink">{s.displayName}</td>
                    <td className={cx('px-4 py-3', STATUS_TONE[s.status])}>{t(`teacher.status.${s.status}`)}</td>
                    <td className="px-4 py-3 text-right text-ink">{s.score !== undefined ? formatPercent(lang, s.score) : '—'}</td>
                    <td className="hidden px-4 py-3 text-muted md:table-cell">{s.finishedAt ? formatDate(lang, s.finishedAt, true) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pages={pages} onPage={setPage} />
          <section className="grid gap-2" aria-labelledby="hardest-title">
            <h3 id="hardest-title" className="font-serif text-md font-bold text-ink">
              {t('teacher.hardest')}
            </h3>
            {r.hardestItems.length === 0 ? (
              <p className="text-base text-muted">{t('teacher.hardestEmpty')}</p>
            ) : (
              <ol className="m-0 grid gap-2 ps-5">
                {r.hardestItems.slice(0, 5).map((h) => (
                  <li key={h.itemKey} className="text-base text-ink">
                    {prompt(h.itemKey)} — <b>{t('teacher.correctRate', { value: formatPercent(lang, h.correctRate) })}</b>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
