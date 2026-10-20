/**
 * Home «Менин класстарым» (contract 0.8.0 §6.2): a tile for each class the
 * teacher added — the label exactly as typed, the grade, subject chips and the
 * number of students — and a «+ Класс кошуу» tile that opens the class sheet.
 * No empty grade tiles: only the teacher's own classes. Gentle hints (upload a
 * КТП, confirm the phone) sit under the tiles and never block anything.
 * A tile opens the class (`?class=<id>`): its subjects first.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { SchoolClass } from '@bilig/content-model/api';
import { api } from '../../api/client';
import { usePermission, useSession } from '../../api/session';
import { Icon } from '../../components/Icon';
import { NewClassSheet } from './ClassForm';
import { SubjectKeyChip } from './TeachingPicker';
import { ErrorState, Skeleton, btn, cx } from './ui';

export const useClasses = () =>
  useInfiniteQuery({
    queryKey: ['classes'],
    queryFn: ({ pageParam }) => api('classList', { query: { limit: 20, cursor: pageParam ?? undefined } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

/** Every subject of a class: `subjectKeys` (0.8.0) or the single 0.6.0 `subjectKey`. */
export const classSubjectKeys = (c: Pick<SchoolClass, 'subjectKey' | 'subjectKeys'>): string[] => c.subjectKeys ?? (c.subjectKey ? [c.subjectKey] : []);

/** `?class=<id>` keeping the current language path. */
export const classHref = (id: string, view?: string): string => `?class=${encodeURIComponent(id)}${view ? `&view=${view}` : ''}`;

const TILE = 'relative grid min-h-40 content-start gap-3 rounded-xl border p-5 transition-colors';

export function ClassesSection(): JSX.Element {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const classes = useClasses();
  const list = classes.data?.pages.flatMap((p) => p.items) ?? [];
  const [adding, setAdding] = useState(false);
  // `?add=6&subject=geo`: a locked topic sends the teacher here to add a class of its grade and subject.
  const asked = Number(params.get('add'));
  const askedGrade = Number.isInteger(asked) && asked >= 1 && asked <= 12 ? asked : null;
  const askedSubject = params.get('subject');
  const prefill = askedGrade ? { name: '', grade: askedGrade, subjectKeys: askedSubject ? [askedSubject] : [] } : undefined;
  const closeAdd = () => {
    setAdding(false);
    if (prefill) setParams({}, { replace: true });
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h2 id="classes-title" className="font-serif text-xl font-bold text-ink">
          {t('teacher.section.classes')}
        </h2>
        <p className="text-base text-muted">{t('teacherHome.lead')}</p>
      </div>
      {classes.isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label={t('common.loading')}>
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}
      {classes.isError && <ErrorState text={t('teacher.loadError')} onRetry={() => void classes.refetch()} />}
      {classes.isSuccess && (
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3" aria-labelledby="classes-title">
          {list.map((c) => (
            <ClassTile key={c.id} cls={c} />
          ))}
          <li className="grid">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={cx(TILE, 'cursor-pointer place-content-center justify-items-center border-2 border-dashed border-accent bg-transparent text-center text-accent hover:bg-soft')}
            >
              <span className="inline-flex size-12 items-center justify-center rounded-pill bg-soft" aria-hidden="true">
                <Icon name="plus" className="lg" />
              </span>
              <span className="text-md font-semibold">{t('teacherHome.addTile')}</span>
              {list.length === 0 && <span className="text-sm text-muted">{t('teacher.classesEmptyText')}</span>}
            </button>
          </li>
        </ul>
      )}
      {classes.hasNextPage && (
        <div>
          <button type="button" className={btn('secondary')} onClick={() => void classes.fetchNextPage()} disabled={classes.isFetchingNextPage}>
            {t('teacher.loadMore')}
          </button>
        </div>
      )}
      <Hints />
      {(adding || !!prefill) && <NewClassSheet initial={prefill} onClose={closeAdd} onCreated={(c) => setParams({ class: c.id }, { replace: false })} />}
    </div>
  );
}

function ClassTile({ cls }: { cls: SchoolClass }): JSX.Element {
  const { t } = useTranslation();
  const subjects = classSubjectKeys(cls);
  return (
    <li className={cx(TILE, 'border-edge bg-panel shadow-panel hover:border-accent')} data-testid="class-tile">
      <div className="flex items-start justify-between gap-2">
        <h3 className="m-0 min-w-0 break-words font-serif text-2xl font-bold">
          {/* The whole tile is clickable through the link's ::after. */}
          <Link to={classHref(cls.id)} className="text-ink no-underline after:absolute after:inset-0 after:rounded-xl after:content-['']" aria-label={t('teacher.openClass', { name: cls.name })}>
            {cls.name}
          </Link>
        </h3>
        <Icon name="chevron-right" className="mt-2 flex-none text-muted" />
      </div>
      <p className="text-sm text-muted">
        {t('teacher.gradeN', { n: cls.grade })} · {t('teacher.students', { count: cls.studentCount })}
      </p>
      {subjects.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {subjects.map((k) => (
            <SubjectKeyChip key={k} subjectKey={k} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">{t('teacherHome.noSubjects')}</p>
      )}
    </li>
  );
}

/** Gentle hints: never block, never shout. */
function Hints(): JSX.Element | null {
  const { t } = useTranslation();
  const me = useSession((s) => s.me);
  const canPlan = usePermission('lesson.plan');
  const ktp = useQuery({ queryKey: ['ktp', 'list', 'peek'], queryFn: () => api('ktpList', { query: { limit: 1 } }), enabled: canPlan, retry: false });
  const noKtp = canPlan && ktp.isSuccess && ktp.data.items.length === 0;
  const noPhone = !!me && !me.phone;
  if (!noKtp && !noPhone) return null;
  return (
    <section className="grid gap-2" aria-labelledby="hints-title">
      <h3 id="hints-title" className="text-sm font-semibold text-muted">
        {t('teacherHome.hints.title')}
      </h3>
      <ul className="m-0 grid list-none gap-2 p-0">
        {noKtp && (
          <li className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-chip px-4 py-3">
            <Icon name="cal" className="flex-none text-accent" />
            <span className="min-w-0 flex-1 basis-60 text-base text-ink">{t('teacherHome.hints.ktp')}</span>
            <Link to="?tab=ktp" className={btn('ghost')}>
              {t('teacherHome.hints.ktpAction')}
              <Icon name="arrow-right" className="sm" />
            </Link>
          </li>
        )}
        {noPhone && (
          <li className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-chip px-4 py-3">
            <Icon name="shield" className="flex-none text-accent" />
            <span className="min-w-0 flex-1 basis-60 text-base text-ink">{t('teacherHome.hints.phone')}</span>
          </li>
        )}
      </ul>
    </section>
  );
}
