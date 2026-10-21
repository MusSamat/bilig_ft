/**
 * «КТП from a textbook» (contract 0.9.2): the teacher's own book is prepared in
 * the browser before POST /ktp/contents — a PDF becomes the text of its first
 * and last pages (or, for a scan, JPEGs of them: pdf.js in a lazy chunk), a
 * .docx goes as base64, photos of the «Мазмуну» pages are downscaled to JPEG.
 * Nothing here talks to the server; the pure helpers are unit-tested.
 */
import { CONTENTS_MAX_IMAGES, CONTENTS_MAX_IMAGE_BYTES, KTP_MAX_BYTES, type KtpContentsRequest } from '@bilig/content-model/api';
import { fileToBase64 } from './model';
import { imageToJpeg } from './bookImage';

export { CONTENTS_MAX_IMAGES, CONTENTS_MAX_IMAGE_BYTES };

/** What POST /ktp/contents gets from a book (one of images, pages, docx). */
export type BookBody = Pick<KtpContentsRequest, 'fileName' | 'images' | 'imagePages' | 'pages' | 'docx'>;

/** «Preparing pages 3/20». */
export type PrepProgress = { done: number; total: number };
export type OnProgress = (p: PrepProgress) => void;

/** The PDF reader behind a small interface (the real one is pdf.js in `bookPdf.ts`, a lazy chunk). */
export interface PdfReader {
  /** Number of pages. */
  pageCount(): number;
  /** Text of a page (1-based), lines joined with `\n`. */
  pageText(n: number): Promise<string>;
  /** A page (1-based) as a JPEG data URL, longest side ≤ `maxSide`. */
  pageJpeg(n: number, maxSide: number): Promise<string>;
  close(): void;
}

export const BOOK_ACCEPT = '.pdf,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp';

/** First pages and last pages of a book taken for the contents search. */
export const FIRST_PAGES = 12;
export const LAST_PAGES = 8;
/** A PDF whose chosen pages hold fewer letters than this is a scan: its pages go as images. */
export const TEXT_LAYER_MIN_LETTERS = 300;
export const PDF_IMAGE_SIDE = 1400;
export const PHOTO_SIDE = 1600;

export type BookKind = 'pdf' | 'docx' | 'image';

export function bookKind(file: File): BookKind | null {
  const n = file.name.toLowerCase();
  if (n.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (n.endsWith('.docx')) return 'docx';
  if (/\.(jpe?g|png|webp)$/.test(n) || /^image\/(jpeg|png|webp)$/.test(file.type)) return 'image';
  return null;
}

/** Client checks of the picked files; an i18n key (`ktp.book.err.*`) or null. */
export function checkBookFiles(files: File[]): string | null {
  if (!files.length) return 'ktp.book.err.none';
  const kinds = files.map(bookKind);
  if (kinds.some((k) => k === null)) return 'ktp.book.err.type';
  if (files.some((f) => f.size === 0)) return 'ktp.book.err.empty';
  if (files.length > 1 && kinds.some((k) => k !== 'image')) return 'ktp.book.err.oneFile';
  if (kinds[0] === 'image' && files.length > CONTENTS_MAX_IMAGES) return 'ktp.book.err.tooMany';
  if (kinds[0] === 'docx' && files[0].size > KTP_MAX_BYTES) return 'ktp.book.err.docxLarge';
  return null;
}

/** PDF pages to read (1-based, ascending): the first 12 and the last 8, no repeats for a short book. */
export function pickPages(count: number, first = FIRST_PAGES, last = LAST_PAGES): number[] {
  const set = new Set<number>();
  for (let p = 1; p <= Math.min(first, count); p++) set.add(p);
  for (let p = Math.max(1, count - last + 1); p <= count; p++) set.add(p);
  return [...set].sort((a, b) => a - b);
}

/** Letters (any script) in the texts. */
export const letterCount = (texts: string[]): number => texts.reduce((n, s) => n + (s.match(/\p{L}/gu)?.length ?? 0), 0);

export const hasTextLayer = (texts: string[]): boolean => letterCount(texts) > TEXT_LAYER_MIN_LETTERS;

/** Bytes of a data URL / base64 string once decoded. */
export const dataUrlBytes = (s: string): number => {
  const b64 = s.slice(s.indexOf(',') + 1).replace(/=+$/, '');
  return Math.floor((b64.length * 3) / 4);
};

export class BookError extends Error {
  constructor(readonly i18nKey: string) {
    super(i18nKey);
    this.name = 'BookError';
  }
}

/** PDF → `pages` (text layer) or `images` + `imagePages` (a scan). */
export async function preparePdfWith(reader: PdfReader, fileName: string, onProgress?: OnProgress): Promise<BookBody> {
  try {
    const pages = pickPages(reader.pageCount());
    if (!pages.length) throw new BookError('ktp.book.err.empty');
    const total = pages.length;
    const texts: string[] = [];
    for (const p of pages) texts.push(await reader.pageText(p));
    if (hasTextLayer(texts)) return { fileName, pages: texts };
    const images: string[] = [];
    for (const [i, p] of pages.entries()) {
      onProgress?.({ done: i, total });
      const img = await reader.pageJpeg(p, PDF_IMAGE_SIDE);
      if (dataUrlBytes(img) <= CONTENTS_MAX_IMAGE_BYTES) images.push(img);
    }
    onProgress?.({ done: total, total });
    if (!images.length) throw new BookError('ktp.book.err.read');
    return { fileName, images, imagePages: pages.slice(0, images.length) };
  } finally {
    reader.close();
  }
}

/** Pick the files apart and prepare the body of POST /ktp/contents. */
export async function prepareBook(files: File[], onProgress?: OnProgress): Promise<BookBody> {
  const bad = checkBookFiles(files);
  if (bad) throw new BookError(bad);
  const kind = bookKind(files[0])!;
  const fileName = files[0].name.slice(0, 200);
  if (kind === 'docx') return { fileName, docx: await fileToBase64(files[0]) };
  if (kind === 'pdf') {
    let reader: PdfReader;
    try {
      const { openPdf } = await import('./bookPdf');
      reader = await openPdf(files[0]);
    } catch {
      throw new BookError('ktp.book.err.pdf');
    }
    return preparePdfWith(reader, fileName, onProgress);
  }
  const images: string[] = [];
  for (const [i, f] of files.entries()) {
    onProgress?.({ done: i, total: files.length });
    let img: string;
    try {
      img = await imageToJpeg(f, PHOTO_SIDE, CONTENTS_MAX_IMAGE_BYTES);
    } catch {
      throw new BookError('ktp.book.err.image');
    }
    if (dataUrlBytes(img) > CONTENTS_MAX_IMAGE_BYTES) throw new BookError('ktp.book.err.imageLarge');
    images.push(img);
  }
  onProgress?.({ done: files.length, total: files.length });
  return { fileName, images };
}
