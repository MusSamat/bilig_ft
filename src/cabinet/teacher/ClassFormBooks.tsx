/**
 * «Окуу китептери» in the new class form (contract 0.9.3): for every chosen
 * subject, the published books of the chosen grade as small cover cards —
 * the teacher's teaching language first, «Китепсиз» as the first option.
 * When exactly one book of that language fits, it is preselected **visibly**
 * (a «Сунуш» chip; the teacher sees it and can change it). No book for a
 * subject → one quiet line, never an empty picker.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Book } from '@bilig/content-model/api';
import { Icon } from '../../components/Icon';
import { useCatalog } from '../../api/content';
import { t as tr } from '@bilig/content-model';
import { BookCover, suggestedBook, useLibraryBooks, useTeachingLang } from '../../ktp/library';
import { useLang } from '../../lib/hooks';
import { cx } from './ui';

export type FormBooks = Record<string, string | null>;

/** `onPick(subject, id)` — the parent merges it into its latest state (two subjects may preselect in one tick). */
export function ClassFormBooks({ grade, subjectKeys, value, onPick, disabled }: { grade: number | ''; subjectKeys: string[]; value: FormBooks; onPick: (subjectKey: string, id: string | null) => void; disabled?: boolean }): JSX.Element | null {
  const { t } = useTranslation();
  if (grade === '' || !subjectKeys.length) return null;
  return (
    <fieldset className="m-0 grid gap-3 border-0 p-0">
      <legend className="mb-1 p-0 text-base font-semibold text-ink">{t('teacher.classForm.books')}</legend>
      <p className="m-0 text-sm text-muted">{t('teacher.classForm.booksHint')}</p>
      {subjectKeys.map((k) => (
        <SubjectBooks key={`${k}-${grade}`} grade={grade} subjectKey={k} value={value[k]} onChange={(id) => onPick(k, id)} disabled={disabled} />
      ))}
    </fieldset>
  );
}

function SubjectBooks({ grade, subjectKey, value, onChange, disabled }: { grade: number; subjectKey: string; value: string | null | undefined; onChange: (id: string | null) => void; disabled?: boolean }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const catalog = useCatalog();
  const teachingLang = useTeachingLang();
  const list = useLibraryBooks({ grade, subjectKey, kind: 'textbook' });
  const subject = catalog.data?.subjects.find((s) => s.key === subjectKey);
  const name = subject ? tr(subject.title, lang) : subjectKey;
  const items = [...(list.data?.items ?? [])].sort((a, b) => Number(b.lang === teachingLang) - Number(a.lang === teachingLang));
  const suggestion = suggestedBook(items, teachingLang);
  // Preselect the one fitting book once (undefined = untouched); the teacher sees it marked and can change it.
  const offered = useRef(false);
  useEffect(() => {
    if (offered.current || value !== undefined || !suggestion) return;
    offered.current = true;
    onChange(suggestion.id);
  }, [suggestion, value, onChange]);

  const groupId = `class-books-${subjectKey}`;
  return (
    <div className="grid gap-2 rounded-lg border border-line p-3" role="group" aria-labelledby={groupId}>
      <span id={groupId} className="text-sm font-semibold text-ink">
        {name}
      </span>
      {list.isLoading ? (
        <span className="text-sm text-muted">{t('common.loading')}</span>
      ) : list.isError ? (
        <span className="text-sm text-bad">{t('teacherHome.book.loadError')}</span>
      ) : items.length === 0 ? (
        <span className="flex items-center gap-2 text-sm text-muted">
          <Icon name="book" className="sm" />
          {t('teacher.classForm.noBooks', { grade })}
        </span>
      ) : (
        <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1" aria-label={t('teacherHome.book.list')}>
          <li className="shrink-0">
            <button
              type="button"
              aria-pressed={value === null || value === undefined}
              disabled={disabled}
              onClick={() => onChange(null)}
              className={cx('grid h-full w-24 place-content-center gap-1 rounded-lg border p-2 text-center text-sm text-muted', value ? 'border-line' : 'border-accent ring-2 ring-accent')}
            >
              <Icon name="x" className="mx-auto" />
              {t('teacherHome.book.clear')}
            </button>
          </li>
          {items.map((b) => (
            <li key={b.id} className="shrink-0">
              <BookChoice book={b} selected={value === b.id} recommended={suggestion?.id === b.id} disabled={disabled} onPick={() => onChange(b.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BookChoice({ book, selected, recommended, disabled, onPick }: { book: Book; selected: boolean; recommended: boolean; disabled?: boolean; onPick: () => void }): JSX.Element {
  const { t } = useTranslation();
  const meta = [book.lang.toUpperCase(), book.year, book.authors[0]].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={t('teacherHome.book.pick', { title: book.title, meta })}
      disabled={disabled}
      onClick={onPick}
      className={cx('grid w-28 content-start gap-1 rounded-lg border bg-chip p-1.5 text-start text-ink hover:border-accent', selected ? 'border-accent ring-2 ring-accent' : 'border-line')}
    >
      <BookCover book={book} />
      <b className="line-clamp-2 text-sm">{book.title}</b>
      <span className="line-clamp-1 text-sm text-muted">{meta}</span>
      {recommended && (
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
          <Icon name="check" className="sm" />
          {t('teacher.classForm.recommended')}
        </span>
      )}
    </button>
  );
}
