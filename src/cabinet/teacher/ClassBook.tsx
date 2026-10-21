/**
 * «Окуу китеби» of a class's subject (contract 0.9.3): the chosen library
 * book with «Тандоо», a sheet of published books of the class's grade and
 * subject as cover cards (the teacher's teaching language first, «all
 * languages» on demand), and — when exactly one book fits and none is chosen
 * — a one-click suggestion. Nothing is chosen without the teacher.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Book, SchoolClass } from '@bilig/content-model/api';
import { Icon } from '../../components/Icon';
import { BookCover, setClassBook, suggestedBook, useLibraryBooks, useTeachingLang } from '../../ktp/library';
import { toast } from '../../state/ui';
import { errorKey } from '../format';
import { EmptyState, ErrorState, Loading, Sheet, btn, cx } from './ui';

/** The class's books of a subject: all published ones (any language) and the chosen one. */
export function useClassBook(cls: SchoolClass, subjectKey: string, enabled = true) {
  const list = useLibraryBooks({ grade: cls.grade, subjectKey }, enabled);
  const lang = useTeachingLang();
  const items = list.data?.items ?? [];
  const chosenId = cls.books?.[subjectKey] ?? null;
  const chosen = chosenId ? (items.find((b) => b.id === chosenId) ?? null) : null;
  return { list, items, chosenId, chosen, suggestion: chosenId ? null : suggestedBook(items, lang) };
}

export function ClassBookLine({ cls, subjectKey, subjectTitle, book, onClass }: { cls: SchoolClass; subjectKey: string; subjectTitle: string; book: ReturnType<typeof useClassBook>; onClass: (c: SchoolClass) => void }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const choose = async (id: string | null) => {
    setBusy(true);
    try {
      const saved = await setClassBook(cls, subjectKey, id);
      onClass(saved);
      void qc.invalidateQueries({ queryKey: ['classes'] });
      toast({ key: id ? 'teacherHome.book.chosen' : 'teacherHome.book.cleared', kind: 'success' });
      setOpen(false);
    } catch (e) {
      toast({ key: errorKey(e), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const { chosen, chosenId, suggestion } = book;
  const label = t('teacherHome.book.chooseLabel', { subject: subjectTitle, name: cls.name });
  return (
    <div className="grid gap-2 rounded-lg border border-line p-3" data-testid="class-book">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="book" className="sm text-accent" />
        <span className="min-w-0 flex-1 text-base text-ink">
          <span className="text-muted">{t('teacherHome.book.label')}: </span>
          <b>{chosen ? chosen.title : chosenId ? t('teacherHome.book.unavailable') : t('teacherHome.book.none')}</b>
        </span>
        <button type="button" className={btn('ghost', 'min-h-11 px-3')} onClick={() => setOpen(true)} aria-label={label} disabled={busy}>
          {t('teacherHome.book.choose')}
        </button>
      </div>
      {suggestion && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-soft p-2">
          <span className="min-w-0 flex-1 text-sm text-ink">{t('teacherHome.book.suggest', { title: suggestion.title })}</span>
          <button type="button" className={btn('secondary', 'min-h-11')} disabled={busy} onClick={() => void choose(suggestion.id)}>
            <Icon name="check" className="sm" />
            {t('teacherHome.book.useThis')}
          </button>
        </div>
      )}
      {open && <BookPickerSheet cls={cls} subjectKey={subjectKey} subjectTitle={subjectTitle} current={chosenId} busy={busy} onPick={(id) => void choose(id)} onClose={() => setOpen(false)} />}
    </div>
  );
}

function BookPickerSheet({ cls, subjectKey, subjectTitle, current, busy, onPick, onClose }: { cls: SchoolClass; subjectKey: string; subjectTitle: string; current: string | null; busy: boolean; onPick: (id: string | null) => void; onClose: () => void }): JSX.Element {
  const { t } = useTranslation();
  const teachingLang = useTeachingLang();
  const [all, setAll] = useState(!teachingLang);
  const list = useLibraryBooks({ grade: cls.grade, subjectKey, ...(all || !teachingLang ? {} : { lang: teachingLang }) });
  const items = list.data?.items ?? [];
  return (
    <Sheet title={t('teacherHome.book.sheetTitle', { subject: subjectTitle, name: cls.name })} onClose={onClose} wide>
      <p className="m-0 text-base text-muted">{t('teacherHome.book.sheetLead', { grade: cls.grade })}</p>
      {teachingLang && (
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-base text-ink">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          {t('teacherHome.book.allLangs')}
        </label>
      )}
      {list.isLoading ? (
        <Loading rows={2} />
      ) : list.isError ? (
        <ErrorState text={t('teacherHome.book.loadError')} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon="book" title={t('teacherHome.book.empty')} text={t('teacherHome.book.emptyText')} />
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3" aria-label={t('teacherHome.book.list')}>
          {items.map((b) => (
            <li key={b.id} className="min-w-0">
              <BookCard book={b} selected={b.id === current} disabled={busy} onPick={() => onPick(b.id)} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap justify-between gap-3">
        {current ? (
          <button type="button" className={btn('ghost')} disabled={busy} onClick={() => onPick(null)}>
            <Icon name="x" className="sm" />
            {t('teacherHome.book.clear')}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className={btn('secondary')} onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </Sheet>
  );
}

export function BookCard({ book, selected, disabled, onPick }: { book: Book; selected?: boolean; disabled?: boolean; onPick: () => void }): JSX.Element {
  const { t } = useTranslation();
  const meta = [t('teacher.gradeN', { n: book.grade }), book.part ? t('teacherHome.book.part', { n: book.part }) : null, book.year].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      className={cx('grid h-full w-full content-start gap-2 rounded-lg border bg-chip p-2 text-start text-ink transition-colors hover:border-accent disabled:opacity-50', selected ? 'border-accent ring-2 ring-accent' : 'border-line')}
      aria-pressed={selected}
      aria-label={t('teacherHome.book.pick', { title: book.title, meta })}
      disabled={disabled}
      onClick={onPick}
    >
      <BookCover book={book} />
      <b className="line-clamp-2 text-base">{book.title}</b>
      <span className="text-sm text-muted">{meta}</span>
      {book.authors.length > 0 && <span className="line-clamp-2 text-sm text-muted">{book.authors.join(', ')}</span>}
      <span className="text-sm font-semibold text-muted">{book.lang.toUpperCase()}</span>
    </button>
  );
}
