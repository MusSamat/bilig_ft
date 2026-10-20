/**
 * «Тапшырмалар»: what the class has to do (topic, activities, due date). One
 * primary action — «Тапшырма берүү» in a sheet; each row links to its results.
 */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
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
import { classHref } from './ClassesSection';
import { EmptyState, ErrorState, Field, Loading, Sheet, btn, inputCls } from './ui';

type Activity = (typeof ASSIGNMENT_ACTIVITIES)[number];

export const useAssignments = (classId: string) =>
  useInfiniteQuery({
    queryKey: ['assignments', classId],
    queryFn: ({ pageParam }) => api('assignmentList', { params: { id: classId }, query: { limit: 20, cursor: pageParam ?? undefined } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

export function useTopicTitle(): (key: string) => string {
  const lang = useLang();
  const { data } = useCatalog();
  return (key) => {
    const tp = data?.topics.find((x) => x.key === key);
    return tp ? tr(tp.title, lang) : key;
  };
}

export function AssignmentsTab({ cls }: { cls: SchoolClass }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const list = useAssignments(cls.id);
  const topicTitle = useTopicTitle();
  const [giving, setGiving] = useState(false);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const give = (
    <button type="button" className={btn('primary')} onClick={() => setGiving(true)}>
      <Icon name="plus" className="sm" />
      {t('teacher.give')}
    </button>
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-bold text-ink">{t('teacher.tab.assignments')}</h2>
        {items.length > 0 && give}
      </div>
      {list.isLoading && <Loading rows={2} />}
      {list.isError && <ErrorState text={t('teacher.loadError')} onRetry={() => void list.refetch()} />}
      {list.isSuccess && items.length === 0 && <EmptyState icon="target" title={t('teacher.assignmentsEmpty')} text={t('teacher.assignmentsEmptyText')} action={give} />}
      {items.length > 0 && (
        <ul className="m-0 grid list-none divide-y divide-line rounded-lg border border-line p-0">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="grid min-w-0 flex-1 basis-48 gap-1">
                <b className="text-md text-ink">{topicTitle(a.topicKey)}</b>
                <span className="text-sm text-muted">
                  {a.dueAt ? t('teacher.due', { date: formatDate(lang, a.dueAt) }) : t('teacher.noDue')}
                  {' · '}
                  {a.activities.map((x) => t(`teacher.activity.${x}`)).join(', ')}
                </span>
              </div>
              <Link className={btn('ghost')} to={`${classHref(cls.id, 'results')}&assignment=${a.id}`}>
                <Icon name="chart" className="sm" />
                {t('teacher.seeResults')}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage && (
        <div>
          <button type="button" className={btn('secondary')} onClick={() => void list.fetchNextPage()}>
            {t('teacher.loadMore')}
          </button>
        </div>
      )}
      {giving && <GiveSheet cls={cls} onClose={() => setGiving(false)} />}
    </div>
  );
}

function GiveSheet({ cls, onClose }: { cls: SchoolClass; onClose: () => void }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const { data: catalog } = useCatalog();
  const [topicKey, setTopicKey] = useState('');
  const [acts, setActs] = useState<Activity[]>(['tour', 'quiz']);
  const [due, setDue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Topics grouped by subject; the class's own subject first.
  const subjects = [...(catalog?.subjects ?? [])].sort((a, b) => (a.key === cls.subjectKey ? -1 : b.key === cls.subjectKey ? 1 : a.order - b.order));
  const groups = subjects.map((s) => ({ s, topics: (catalog?.topics ?? []).filter((tp) => tp.subjectKey === s.key) })).filter((g) => g.topics.length);

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
      await qc.invalidateQueries({ queryKey: ['assignments', cls.id] });
      onClose();
    } catch (err) {
      setError(t(errorKey(err)));
      setBusy(false);
    }
  };

  return (
    <Sheet title={t('teacher.newAssignment')} onClose={onClose}>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <Field id="give-topic" label={t('teacher.topic')}>
          <select id="give-topic" className={inputCls} value={topicKey} onChange={(e) => setTopicKey(e.target.value)}>
            <option value="">{t('teacher.chooseTopic')}</option>
            {groups.map(({ s, topics }) => (
              <optgroup key={s.key} label={tr(s.title, lang)}>
                {topics.map((tp) => (
                  <option key={tp.key} value={tp.key}>
                    {tr(tp.title, lang)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <fieldset className="m-0 grid gap-1 border-0 p-0">
          <legend className="mb-1 text-sm font-semibold text-ink">{t('teacher.activities')}</legend>
          <div className="flex flex-wrap gap-x-5">
            {ASSIGNMENT_ACTIVITIES.map((a) => (
              <label key={a} className="inline-flex min-h-11 items-center gap-2 text-base text-ink">
                <input type="checkbox" className="size-5" checked={acts.includes(a)} onChange={(e) => setActs((s) => (e.target.checked ? [...s, a] : s.filter((x) => x !== a)))} />
                {t(`teacher.activity.${a}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <Field id="give-due" label={t('teacher.dueAt')} hint={t('teacher.dueHint')}>
          <input id="give-due" className={inputCls} type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-describedby="give-due-hint" />
        </Field>
        <p className="text-sm font-semibold text-bad empty:hidden" role="alert">
          {error ?? ''}
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className={btn('primary')} disabled={busy}>
            <Icon name="check" className="sm" />
            {t('teacher.giveSubmit')}
          </button>
          <button type="button" className={btn('ghost')} onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
