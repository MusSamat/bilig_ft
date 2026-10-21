/**
 * The admin's book upload queue: books picked together are uploaded one after
 * another (create → every page → «process»). It lives in memory for the tab:
 * leaving the Books page keeps it running, and a failed book is resumed from
 * the page it stopped at (the book is not created again).
 */
import { create } from 'zustand';
import type { AdminBookCreate, Book } from '@bilig/content-model/api';
import type { PdfReader } from '../../../ktp/book';
import { api } from '../../api/session';
import { PageError, openPdfReader, uploadPages } from './model';

export type JobState = 'waiting' | 'opening' | 'uploading' | 'starting' | 'done' | 'failed';

export interface UploadJob {
  key: string;
  file: File;
  meta: Omit<AdminBookCreate, 'fileName' | 'pageCount'>;
  state: JobState;
  bookId: string | null;
  /** Pages sent so far. */
  sent: number;
  total: number;
  /** The page the upload stopped at, with the reason (an i18n key under `books.upload.err`). */
  failedPage: number | null;
  error: string | null;
}

interface QueueState {
  jobs: UploadJob[];
  running: boolean;
  add(items: { file: File; meta: UploadJob['meta'] }[]): void;
  retry(key: string): void;
  remove(key: string): void;
  clearDone(): void;
}

let seq = 0;
const patch = (key: string, p: Partial<UploadJob>) => useUploads.setState((s) => ({ jobs: s.jobs.map((j) => (j.key === key ? { ...j, ...p } : j)) }));

/** Tests replace the PDF reader and the retry pause. */
export const uploadDeps = { open: openPdfReader as (f: File) => Promise<PdfReader>, retryDelay: 800, onBook: (_b: Book) => {} };

export const useUploads = create<QueueState>((set) => ({
  jobs: [],
  running: false,
  add(items) {
    set((s) => ({ jobs: [...s.jobs, ...items.map((i) => ({ key: `u${++seq}`, file: i.file, meta: i.meta, state: 'waiting' as const, bookId: null, sent: 0, total: 0, failedPage: null, error: null }))] }));
    void run();
  },
  retry(key) {
    patch(key, { state: 'waiting', error: null });
    void run();
  },
  remove(key) {
    set((s) => ({ jobs: s.jobs.filter((j) => j.key !== key || (j.state !== 'waiting' && j.state !== 'failed' && j.state !== 'done')) }));
  },
  clearDone() {
    set((s) => ({ jobs: s.jobs.filter((j) => j.state !== 'done') }));
  },
}));

async function runJob(job: UploadJob): Promise<void> {
  patch(job.key, { state: 'opening', failedPage: null, error: null });
  let reader: PdfReader;
  try {
    reader = await uploadDeps.open(job.file);
  } catch {
    patch(job.key, { state: 'failed', error: 'pdf' });
    return;
  }
  try {
    const total = reader.pageCount();
    if (!total) return patch(job.key, { state: 'failed', error: 'empty' });
    let bookId = job.bookId;
    if (!bookId) {
      const book = await api.call('adminBookCreate', { body: { fileName: job.file.name.slice(0, 200), pageCount: total, ...job.meta } });
      bookId = book.id;
      uploadDeps.onBook(book);
      patch(job.key, { bookId, total });
    }
    patch(job.key, { state: 'uploading', total });
    const id = bookId;
    await uploadPages({
      reader,
      from: job.sent + 1,
      retryDelay: uploadDeps.retryDelay,
      send: (pages) => api.call('adminBookPages', { params: { id }, body: { pages } }),
      onProgress: (sent) => patch(job.key, { sent }),
    });
    patch(job.key, { state: 'starting' });
    uploadDeps.onBook(await api.call('adminBookProcess', { params: { id }, body: {} }));
    patch(job.key, { state: 'done' });
  } catch (e) {
    if (e instanceof PageError) patch(job.key, { state: 'failed', failedPage: e.page, error: e.reason });
    else patch(job.key, { state: 'failed', error: 'send' });
  } finally {
    reader.close();
  }
}

/** One book at a time, in the order they were added. */
async function run(): Promise<void> {
  if (useUploads.getState().running) return;
  useUploads.setState({ running: true });
  try {
    for (;;) {
      const next = useUploads.getState().jobs.find((j) => j.state === 'waiting');
      if (!next) break;
      // The latest state of the job (a retry keeps its book and the pages already sent).
      await runJob(next);
    }
  } finally {
    useUploads.setState({ running: false });
  }
}

/** Tests: an empty queue. */
export const resetUploads = () => useUploads.setState({ jobs: [], running: false });
