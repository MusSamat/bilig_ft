/** «Менин окуу китебим»: the teacher's textbooks (GET /textbooks), each opens the textbook page. */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr, textbookSubjects } from '@bilig/content-model';
import { useCatalog, useTextbooks } from '../../api/content';
import { Icon } from '../../components/Icon';
import { SubjectChip } from '../../components/SubjectChip';
import { useLang } from '../../lib/hooks';
import { textbookPath } from '../../lib/textbook';
import { EmptyState, ErrorState, Loading, btn, cx } from './ui';

export function TextbooksSection(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: catalog } = useCatalog();
  const books = useTextbooks();
  const items = books.data?.items ?? [];
  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h2 id="textbooks-title" className="font-serif text-xl font-bold text-ink">
          {t('teacher.section.textbook')}
        </h2>
        <p className="max-w-[60ch] text-base text-muted">{t('teacher.textbookLead')}</p>
      </div>
      {books.isLoading && <Loading rows={2} />}
      {books.isError && <ErrorState text={t('teacher.loadError')} onRetry={() => void books.refetch()} />}
      {books.isSuccess && items.length === 0 && (
        <EmptyState
          icon="book"
          title={t('teacher.textbooksEmpty')}
          text={t('teacher.textbooksEmptyText')}
          action={
            <Link className={btn('primary')} to={`/${lang}`}>
              <Icon name="search" className="sm" />
              {t('teacher.openCatalog')}
            </Link>
          }
        />
      )}
      {items.length > 0 && (
        <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2" aria-labelledby="textbooks-title">
          {items.map((tb) => {
            const subjects = textbookSubjects(tb)
              .map((k) => catalog?.subjects.find((s) => s.key === k))
              .filter((s) => !!s);
            const meta = [t('textbook.grade', { grade: tb.grade }), tb.part ? t('textbook.part', { part: tb.part }) : null, t('textbook.chapters', { count: tb.chapters.length })];
            return (
              <li key={tb.key}>
                <Link
                  to={textbookPath(lang, tb.key)}
                  className={cx('flex min-h-11 items-start gap-4 rounded-lg border border-line bg-chip p-4 text-ink no-underline transition-colors hover:border-accent')}
                >
                  <span className="inline-flex size-12 flex-none items-center justify-center rounded-md bg-soft text-accent" aria-hidden="true">
                    <Icon name="book" className="lg" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <b className="text-md">{tr(tb.title, lang)}</b>
                    <span className="text-sm text-muted">{meta.filter(Boolean).join(' · ')}</span>
                    {subjects.length > 0 && (
                      <span className="flex flex-wrap gap-1.5">
                        {subjects.map((s) => (
                          <SubjectChip key={s.key} subject={s} className="text-sm" />
                        ))}
                      </span>
                    )}
                  </span>
                  <Icon name="chevron-right" className="mt-1 text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
