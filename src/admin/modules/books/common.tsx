/** Shared pieces of the Books module: status chip, stage progress, subject options. */
import { LANGS } from '@bilig/content-model';
import type { Book, BookStatus } from '@bilig/content-model/api';
import { useT } from '../../i18n';
import { useSuggestions } from '../../lib/suggest';
import { Chip, type Tone } from '../../staff/ui';
import { stageShare } from './model';

export const GRADES = Array.from({ length: 12 }, (_, i) => i + 1);
export { LANGS };

const TONE: Record<BookStatus, Tone> = { uploading: 'neutral', queued: 'neutral', processing: 'accent', review: 'warn', published: 'ok', failed: 'bad', archived: 'neutral' };

export function BookStatusChip({ status }: { status: BookStatus }) {
  const t = useT();
  return <Chip tone={TONE[status]}>{t(`books.status.${status}`)}</Chip>;
}

/** Stage + done/total and a bar of the whole reading; for an uploading book, the pages received. */
export function StageProgress({ book, compact }: { book: Book; compact?: boolean }) {
  const t = useT();
  const uploading = book.status === 'uploading';
  const share = uploading ? (book.pageCount ? book.pagesUploaded / book.pageCount : 0) : stageShare(book);
  const label = uploading
    ? t('books.progress.pages', { done: book.pagesUploaded, total: book.pageCount })
    : book.stage === 'done'
      ? t('books.stage.done')
      : t('books.progress.stage', { stage: t(`books.stage.${book.stage}`), done: book.progress.done, total: book.progress.total });
  return (
    <span className={compact ? 'grid min-w-36 gap-1' : 'grid gap-1.5'}>
      <span className="text-sm text-muted">{label}</span>
      <span className="block h-2 overflow-hidden rounded-pill bg-soft" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
        <span className={book.status === 'failed' ? 'block h-full rounded-pill bg-bad' : 'block h-full rounded-pill bg-accent'} style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
    </span>
  );
}

/** Subjects for selects: the admin's subject dictionary (key + title). */
export function useSubjectOptions(): { value: string; label: string }[] {
  const s = useSuggestions(['subjects']);
  return (s.subjectKey ?? []).map((o) => ({ value: o.value, label: o.label ?? o.value }));
}

export const fmtUsd = (n: number, lang: string) => new Intl.NumberFormat(lang === 'ky' ? 'ky-KG' : 'ru-RU', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
