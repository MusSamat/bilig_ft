/**
 * Results (W-53, scenario «Учитель» 6): who finished, average score, hardest
 * questions. GET /assignments/:id/results is not paginated in the contract
 * (see CONTRACT_REQUESTS.md), so the student table pages on the client.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import type { SchoolClass } from '@bilig/content-model/api';
import { api } from '../../api/client';
import { useCatalog, useTopicPackage } from '../../api/content';
import { useLang } from '../../lib/hooks';
import { formatDate, formatPercent } from '../format';
import { useAssignments } from './AssignmentsTab';
import { Pager } from './Pager';

const PAGE = 20;

export function ResultsTab({ cls }: { cls: SchoolClass }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: catalog } = useCatalog();
  const list = useAssignments(cls.id);
  const assignments = list.data?.pages.flatMap((p) => p.items) ?? [];
  const [chosen, setChosen] = useState<string>('');
  const id = chosen || assignments[0]?.id || '';
  const current = assignments.find((a) => a.id === id);
  const results = useQuery({ queryKey: ['results', id], queryFn: () => api('assignmentResults', { params: { id } }), enabled: !!id });
  const pkg = useTopicPackage(current?.topicKey);
  const [page, setPage] = useState(0);
  const topicTitle = (key: string) => {
    const tp = catalog?.topics.find((x) => x.key === key);
    return tp ? tr(tp.title, lang) : key;
  };

  if (!list.isLoading && !assignments.length) return <p className="muted">{t('teacher.assignmentsEmpty')}</p>;
  const r = results.data;
  const rows = r?.students ?? [];
  const pages = Math.ceil(rows.length / PAGE);
  const done = rows.filter((s) => s.status === 'done').length;
  const prompt = (itemKey: string) => {
    const item = pkg.data?.pkg.items.find((i) => i.key === itemKey);
    return item ? tr(item.prompt, lang) : itemKey;
  };

  return (
    <div className="stack">
      <label className="field">
        <span>{t('teacher.chooseAssignment')}</span>
        <select
          className="input"
          value={id}
          onChange={(e) => {
            setChosen(e.target.value);
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
      </label>
      {results.isLoading && <p className="muted">{t('common.loading')}</p>}
      {results.isError && <p className="error-text">{t('teacher.loadError')}</p>}
      {r && (
        <>
          <div className="row">
            <span className="badge badge--accent">
              {t('teacher.average')}: {r.averageScore === null ? t('teacher.averageNone') : formatPercent(lang, r.averageScore)}
            </span>
            <span className="badge">{t('teacher.doneCount', { done, total: rows.length })}</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('teacher.student')}</th>
                  <th scope="col">{t('teacher.statusCol')}</th>
                  <th scope="col">{t('teacher.scoreCol')}</th>
                  <th scope="col">{t('teacher.finished')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * PAGE, page * PAGE + PAGE).map((s) => (
                  <tr key={s.studentId}>
                    <td>{s.displayName}</td>
                    <td>{t(`teacher.status.${s.status}`)}</td>
                    <td>{s.score !== undefined ? formatPercent(lang, s.score) : ''}</td>
                    <td>{s.finishedAt ? formatDate(lang, s.finishedAt, true) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pages={pages} onPage={setPage} />
          <h3>{t('teacher.hardest')}</h3>
          {r.hardestItems.length === 0 ? (
            <p className="muted">{t('teacher.hardestEmpty')}</p>
          ) : (
            <ol className="stack">
              {r.hardestItems.slice(0, 5).map((h) => (
                <li key={h.itemKey}>
                  {prompt(h.itemKey)} — <b>{t('teacher.correctRate', { value: formatPercent(lang, h.correctRate) })}</b>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
