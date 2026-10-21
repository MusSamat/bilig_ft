/**
 * The PDF reader of «КТП from a textbook» on pdf.js. Imported only with
 * `import('./bookPdf')`, so pdf.js and its worker are a lazy chunk, never in
 * the initial bundle. The legacy build runs on the older phones and tablets
 * teachers have (no `Promise.withResolvers` needed).
 */
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { CONTENTS_MAX_IMAGE_BYTES } from '@bilig/content-model/api';
import type { PdfReader } from './book';
import { canvasToJpeg } from './bookImage';

GlobalWorkerOptions.workerSrc = workerUrl;

export async function openPdf(file: Blob): Promise<PdfReader> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({ data, isEvalSupported: false }).promise;
  return {
    pageCount: () => doc.numPages,
    async pageText(n) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let out = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        out += item.str;
        if (item.hasEOL) out += '\n';
      }
      page.cleanup();
      return out.replace(/[ \t]+\n/g, '\n').trim();
    },
    async pageJpeg(n, maxSide) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: maxSide / Math.max(base.width, base.height),
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();
      const url = await canvasToJpeg(canvas, CONTENTS_MAX_IMAGE_BYTES);
      canvas.width = canvas.height = 0; // free the bitmap now, not at GC
      return url;
    },
    close: () => void doc.destroy(),
  };
}
