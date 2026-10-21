/**
 * The book library in the admin (contract 0.9.3), the parts without React:
 * a PDF page → its text (a real text layer) or a JPEG; the pages sent in
 * batches of BOOK_PAGES_PER_UPLOAD with retries; which sections changed.
 * The PDF reader is the КТП one (`src/ktp/bookPdf.ts`, pdf.js in a lazy chunk).
 */
import { BOOK_PAGES_PER_UPLOAD, BOOK_PAGE_IMAGE_BYTES, type AdminBookPages, type AdminBookPatch, type Book, type BookSection, type BookStatus } from '@bilig/content-model/api';
import { dataUrlBytes, letterCount, type PdfReader } from '../../../ktp/book';

/** A page whose text layer has more letters than this goes as text; fewer — a scan, it goes as an image. */
export const PAGE_TEXT_MIN_LETTERS = 200;
/** Longest side of a page image. */
export const PAGE_IMAGE_SIDE = 1600;
/** Attempts of one batch: the first and up to 3 retries. */
export const BATCH_RETRIES = 3;

export type UploadPage = AdminBookPages['pages'][number];

/** Statuses during which the server is still working (the list refreshes itself). */
export const BUSY: readonly BookStatus[] = ['queued', 'processing'];
export const isBusy = (b: Pick<Book, 'status'>) => BUSY.includes(b.status);

export async function openPdfReader(file: Blob): Promise<PdfReader> {
  const { openPdf } = await import('../../../ktp/bookPdf');
  return openPdf(file);
}

/** Thrown with the 1-based page the upload stopped at (render or send failed). */
export class PageError extends Error {
  constructor(
    readonly page: number,
    readonly reason: 'render' | 'large' | 'send',
    readonly cause?: unknown,
  ) {
    super(`page ${page}: ${reason}`);
    this.name = 'PageError';
  }
}

/** One page: its text when the text layer is real, else a JPEG (longest side 1600, ≤ BOOK_PAGE_IMAGE_BYTES). */
export async function preparePage(reader: PdfReader, n: number): Promise<UploadPage> {
  let text = '';
  try {
    text = await reader.pageText(n);
  } catch {
    text = '';
  }
  if (letterCount([text]) > PAGE_TEXT_MIN_LETTERS) return { n, text: text.slice(0, 40_000) };
  let image: string;
  try {
    image = await reader.pageJpeg(n, PAGE_IMAGE_SIDE);
  } catch (e) {
    throw new PageError(n, 'render', e);
  }
  if (dataUrlBytes(image) > BOOK_PAGE_IMAGE_BYTES) throw new PageError(n, 'large');
  return { n, image };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface UploadOpts {
  reader: PdfReader;
  /** First page to send (1-based): a resumed upload starts where it stopped. */
  from: number;
  send(pages: UploadPage[]): Promise<unknown>;
  onProgress(sent: number, total: number): void;
  /** Stop between batches. */
  aborted?: () => boolean;
  /** Pause before a retry (ms; tests pass a short one). */
  retryDelay?: number;
}

/**
 * Pages `from..pageCount` in batches of BOOK_PAGES_PER_UPLOAD. A batch that fails
 * is sent again up to BATCH_RETRIES times; then a PageError names its first page.
 * Returns the number of pages sent (pageCount when complete).
 */
export async function uploadPages({ reader, from, send, onProgress, aborted, retryDelay = 800 }: UploadOpts): Promise<number> {
  const total = reader.pageCount();
  let next = Math.max(1, from);
  onProgress(next - 1, total);
  while (next <= total) {
    if (aborted?.()) return next - 1;
    const batch: UploadPage[] = [];
    for (let n = next; n < next + BOOK_PAGES_PER_UPLOAD && n <= total; n++) batch.push(await preparePage(reader, n));
    let attempt = 0;
    for (;;) {
      try {
        await send(batch);
        break;
      } catch (e) {
        if (attempt >= BATCH_RETRIES) throw new PageError(batch[0].n, 'send', e);
        attempt++;
        await sleep(retryDelay * attempt);
      }
    }
    next += batch.length;
    onProgress(next - 1, total);
  }
  return total;
}

/** Share of the whole reading done, 0–1: four stages of equal weight. */
export function stageShare(b: Pick<Book, 'stage' | 'progress' | 'status'>): number {
  if (b.stage === 'done' || b.status === 'review' || b.status === 'published') return 1;
  const i = ['pages', 'contents', 'sections', 'book'].indexOf(b.stage);
  const within = b.progress.total ? b.progress.done / b.progress.total : 0;
  return Math.max(0, Math.min(1, (i + within) / 4));
}

type SectionPatch = NonNullable<AdminBookPatch['sections']>[number];
const SECTION_FIELDS = ['chapterNumber', 'chapterTitle', 'number', 'kind', 'title', 'pages', 'summary', 'objectives', 'keyTerms', 'formulas', 'quantities', 'facts', 'experiments', 'questions', 'keywords', 'topicKey', 'reviewed'] as const;

/** Only the changed sections, each with only its changed fields (and its id). */
export function changedSections(before: BookSection[], after: BookSection[]): SectionPatch[] {
  const old = new Map(before.map((s) => [s.id, s]));
  const out: SectionPatch[] = [];
  for (const s of after) {
    const o = old.get(s.id);
    if (!o) continue;
    const patch: Record<string, unknown> = {};
    for (const f of SECTION_FIELDS) if (JSON.stringify(o[f]) !== JSON.stringify(s[f])) patch[f] = s[f];
    if (Object.keys(patch).length) out.push({ id: s.id, ...patch } as SectionPatch);
  }
  return out;
}

/** Sections grouped by chapter, in reading order. */
export function byChapter(sections: BookSection[]): { key: string; number: string; title: string; items: BookSection[] }[] {
  const out: { key: string; number: string; title: string; items: BookSection[] }[] = [];
  for (const s of [...sections].sort((a, b) => a.order - b.order)) {
    const key = `${s.chapterNumber}|${s.chapterTitle}`;
    const last = out[out.length - 1];
    if (last?.key === key) last.items.push(s);
    else out.push({ key, number: s.chapterNumber, title: s.chapterTitle, items: [s] });
  }
  return out;
}
