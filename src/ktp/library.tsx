/**
 * The Bilig book library for teachers (contract 0.9.3): published books
 * (GET /books), a book's cover (an authed image → object URL) and choosing
 * the book of a class's subject (PATCH /classes/:id { books }).
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LANGS, type Lang } from '@bilig/content-model';
import type { Book, BookKind, SchoolClass } from '@bilig/content-model/api';
import { api, rawCall } from '../api/client';
import { useSession } from '../api/session';
import { Icon } from '../components/Icon';
import { cx } from '../cabinet/teacher/ui';

export type LibraryQuery = { grade?: number; subjectKey?: string; lang?: Lang; kind?: BookKind };

export const libraryKeys = { list: (q: LibraryQuery) => ['books', 'list', q] as const };

export const useLibraryBooks = (q: LibraryQuery, enabled = true) =>
  useQuery({ queryKey: libraryKeys.list(q), queryFn: ({ signal }) => api('bookList', { query: q, signal }), enabled, staleTime: 60_000 });

/** The language the teacher teaches in, when books exist in it (uz: none yet → every language). */
export function useTeachingLang(): Lang | undefined {
  const l = useSession((s) => s.me?.teachingLang);
  return LANGS.includes(l as Lang) ? (l as Lang) : undefined;
}

/** The one published book of this grade, subject and the teacher's language — offered, never set silently. */
export function suggestedBook(books: Book[], lang: Lang | undefined): Book | null {
  const own = lang ? books.filter((b) => b.lang === lang) : books;
  return own.length === 1 ? own[0] : null;
}

export async function setClassBook(cls: SchoolClass, subjectKey: string, bookId: string | null): Promise<SchoolClass> {
  return api('classPatch', { params: { id: cls.id }, body: { books: { [subjectKey]: bookId } } });
}

function useCoverUrl(book: Pick<Book, 'id' | 'coverUrl'>): string | null {
  const q = useQuery({
    queryKey: ['books', 'cover', book.id, book.coverUrl],
    queryFn: async ({ signal }) => (await rawCall('bookCover', { params: { id: book.id }, signal, headers: { Accept: 'image/*' } })).blob(),
    enabled: !!book.coverUrl,
    staleTime: Infinity,
    retry: false,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!q.data || typeof URL.createObjectURL !== 'function') return setUrl(null);
    const u = URL.createObjectURL(q.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [q.data]);
  return url;
}

/** A 3:4 cover, a book icon while loading or without one. */
export function BookCover({ book, className }: { book: Pick<Book, 'id' | 'coverUrl'>; className?: string }): JSX.Element {
  const url = useCoverUrl(book);
  return (
    <span className={cx('relative block aspect-[3/4] w-full overflow-hidden rounded-md border border-line bg-soft', className)} data-testid="book-cover">
      {url ? (
        <img src={url} alt="" className="block size-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-accent" aria-hidden="true">
          <Icon name="book" className="lg" />
        </span>
      )}
    </span>
  );
}
