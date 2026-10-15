/** Assignments (W-53, scenario «Учитель» 3): topic + activities + due date; paginated list. */
import { useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { ASSIGNMENT_ACTIVITIES, type SchoolClass } from '@bilig/content-model/api';
import { api } from '../../api/client';
import { useCatalog } from '../../api/content';
import { Icon } from '../../components/Icon';
import { useLang } from '../../lib/hooks';
import { toast } from '../../state/ui';
import { errorKey, formatDate } from '../format';

type Activity = (typeof ASSIGNMENT_ACTIVITIES)[number];

export const useAssignments = (classId: string) =>
  useInfiniteQuery({
    queryKey: ['assignments', classId],
    queryFn: ({ pageParam }) => api('assignmentList', { params: { id: classId }, query: { limit: 20, cursor: pageParam ?? undefined } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

export function AssignmentsTab({ cls }: { cls: SchoolClass }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const { data: catalog } = useCatalog();
  const list = useAssignments(cls.id);
  const [topicKey, setTopicKey] = useState('');
  const [acts, setActs] = useState<Activity[]>(['tour', 'quiz']);
  const [due, setDue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const topicTitle = (key: string) => {
    const tp = catalog?.topics.find((x) => x.key === key);
    return tp ? tr(tp.title, lang) : key;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!topicKey) return setError(t('teacher.chooseTopic'));
    if (!acts.length) return setError(t('teacher.needActivity'));
    setBusy(true);
    setError(null);
    try {
      await api('assignmentCreate', {
        params: { id: cls.id },
        body: { topicKey, activities: acts, ...(due ? { dueAt: new Date(`${due}T23:59:00`).toISOString() } : {}) },
      });
      toast({ key: 'teacher.assigned', kind: 'success' });
      setTopicKey('');
      setDue('');
      await qc.invalidateQueries({ queryKey: ['assignments', cls.id] });
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <form className="stack card" onSubmit={submit} noValidate>
        <h3>{t('teacher.newAssignment')}</h3>
        <label className="field">
          <span>{t('teacher.topic')}</span>
          <select className="input" value={topicKey} onChange={(e) => setTopicKey(e.target.value)}>
            <option value="">{t('teacher.chooseTopic')}</option>
            {catalog?.topics.map((tp) => (
              <option key={tp.key} value={tp.key}>
                {tr(tp.title, lang)}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="checks">
          <legend className="small">{t('teacher.activities')}</legend>
          {ASSIGNMENT_ACTIVITIES.map((a) => (
            <label key={a}>
              <input type="checkbox" checked={acts.includes(a)} onChange={(e) => setActs((s) => (e.target.checked ? [...s, a] : s.filter((x) => x !== a)))} />
              {t(`teacher.activity.${a}`)}
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>{t('teacher.dueAt')}</span>
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <p className="error-text" role="alert">
          {error ?? ''}
        </p>
        <div>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            <Icon name="plus" size={16} />
            {t('teacher.give')}
          </button>
        </div>
      </form>

      {list.isError && <p className="error-text">{t('teacher.loadError')}</p>}
      {!list.isLoading && items.length === 0 && <p className="muted">{t('teacher.assignmentsEmpty')}</p>}
      <ul className="assignment-list">
        {items.map((a) => (
          <li key={a.id} className="assignment">
            <b>{topicTitle(a.topicKey)}</b>
            <span className="muted small">
              {a.dueAt ? t('teacher.due', { date: formatDate(lang, a.dueAt) }) : t('teacher.noDue')}
              {' · '}
              {a.activities.map((x) => t(`teacher.activity.${x}`)).join(', ')}
            </span>
          </li>
        ))}
      </ul>
      {list.hasNextPage && (
        <div>
          <button type="button" className="btn btn--sm" onClick={() => void list.fetchNextPage()}>
            {t('teacher.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}
