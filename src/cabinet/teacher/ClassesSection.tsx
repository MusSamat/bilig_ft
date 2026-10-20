/**
 * «Менин класстарым»: class cards (name, grade, subject, students, join code
 * with copy), server pagination, and «Класс кошуу» in a sheet. Opening a card
 * goes to the class view (`?class=<id>`).
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { SchoolClass } from '@bilig/content-model/api';
import { api } from '../../api/client';
import { useSession } from '../../api/session';
import { Icon } from '../../components/Icon';
import { NewClassSheet } from './ClassForm';
import { SubjectKeyChip } from './TeachingPicker';
import { CopyButton, EmptyState, ErrorState, Loading, btn, cardCls, cx } from './ui';

export const useClasses = () =>
  useInfiniteQuery({
    queryKey: ['classes'],
    queryFn: ({ pageParam }) => api('classList', { query: { limit: 20, cursor: pageParam ?? undefined } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

/** `?class=<id>` keeping the current language path. */
export const classHref = (id: string, view?: string): string => `?class=${encodeURIComponent(id)}${view ? `&view=${view}` : ''}`;

export function ClassesSection(): JSX.Element {
  const { t } = useTranslation();
  const [, setParams] = useSearchParams();
  const classes = useClasses();
  const list = classes.data?.pages.flatMap((p) => p.items) ?? [];
  const [adding, setAdding] = useState(false);
  // One primary action per view: while the account setup is open, that checklist leads.
  const setupOpen = useSession((s) => !!s.me?.setup && !Object.values(s.me.setup).every(Boolean));
  const add = (
    <button type="button" className={btn(setupOpen ? 'secondary' : 'primary')} onClick={() => setAdding(true)}>
      <Icon name="plus" className="sm" />
      {t('teacher.addClass')}
    </button>
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="classes-title" className="font-serif text-xl font-bold text-ink">
          {t('teacher.section.classes')}
        </h2>
        {list.length > 0 && add}
      </div>
      {classes.isLoading && <Loading rows={2} />}
      {classes.isError && <ErrorState text={t('teacher.loadError')} onRetry={() => void classes.refetch()} />}
      {classes.isSuccess && list.length === 0 && <EmptyState icon="users" title={t('teacher.classesEmpty')} text={t('teacher.classesEmptyText')} action={add} />}
      {list.length > 0 && (
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3" aria-labelledby="classes-title">
          {list.map((c) => (
            <ClassCard key={c.id} cls={c} />
          ))}
        </ul>
      )}
      {classes.hasNextPage && (
        <div>
          <button type="button" className={btn('secondary')} onClick={() => void classes.fetchNextPage()} disabled={classes.isFetchingNextPage}>
            {t('teacher.loadMore')}
          </button>
        </div>
      )}
      {adding && <NewClassSheet onClose={() => setAdding(false)} onCreated={(c) => setParams({ class: c.id }, { replace: false })} />}
    </div>
  );
}

function ClassCard({ cls }: { cls: SchoolClass }): JSX.Element {
  const { t } = useTranslation();
  return (
    <li className={cx(cardCls, 'relative grid content-start gap-3 p-5 transition-colors hover:border-accent md:p-5')}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="m-0 font-serif text-xl font-bold">
          {/* The whole card is clickable through the link's ::after; the copy button sits above it. */}
          <Link to={classHref(cls.id)} className="text-ink no-underline after:absolute after:inset-0 after:rounded-xl after:content-['']" aria-label={t('teacher.openClass', { name: cls.name })}>
            {cls.name}
          </Link>
        </h3>
        <Icon name="chevron-right" className="mt-1 text-muted" />
      </div>
      <p className="text-sm text-muted">
        {t('teacher.gradeN', { n: cls.grade })} · {t('teacher.students', { count: cls.studentCount })}
      </p>
      {cls.subjectKey && (
        <div>
          <SubjectKeyChip subjectKey={cls.subjectKey} />
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="text-sm text-muted">
          {t('teacher.codeShort')}{' '}
          {cls.joinCodeEnabled ? <b className="font-mono text-md tracking-[0.2em] text-ink">{cls.joinCode}</b> : <span>{t('teacher.codeOff')}</span>}
        </span>
        {cls.joinCodeEnabled && <CopyButton value={cls.joinCode} label={t('teacher.copyCodeOf', { name: cls.name })} className="relative z-10" />}
      </div>
    </li>
  );
}
