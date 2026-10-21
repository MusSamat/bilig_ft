/**
 * A book's cover (GET /books/:id/cover): an authed request, so it is fetched
 * as a blob and shown through an object URL; a book icon while it loads, when
 * there is none (`coverUrl` null) or when it fails.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Book } from '@bilig/content-model/api';
import { api } from '../../api/session';
import { Icon } from '../../lib/icons';
import { cx } from '../../staff/ui';

export function useBlobUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob || typeof URL.createObjectURL !== 'function') return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function useCover(book: Pick<Book, 'id' | 'coverUrl' | 'updatedAt'>) {
  const q = useQuery({
    queryKey: ['bookCover', book.id, book.coverUrl],
    queryFn: async ({ signal }) => (await api.callBinary('bookCover', { params: { id: book.id }, signal })).blob,
    enabled: !!book.coverUrl,
    staleTime: Infinity,
    retry: false,
  });
  return useBlobUrl(q.data);
}

/** The cover in a 3:4 frame (the width comes from the parent). */
export function BookCover({ book, className }: { book: Pick<Book, 'id' | 'coverUrl' | 'updatedAt' | 'title'>; className?: string }) {
  const url = useCover(book);
  return (
    <span className={cx('relative block aspect-[3/4] w-full overflow-hidden rounded-md border border-line bg-soft', className)} data-testid="book-cover">
      {url ? (
        <img src={url} alt="" className="block size-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-accent" aria-hidden="true">
          <Icon id="book" size={40} />
        </span>
      )}
    </span>
  );
}
