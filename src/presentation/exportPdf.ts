/** PDF export (W-52): slides drawn to canvas (full Cyrillic via system fonts) → jsPDF, lazy-loaded. */
import type { Slide } from '@bilig/content-model/api';
import { drawSlide, type ExportContext } from './render';

export async function exportPdf(slides: Slide[], ctx: ExportContext, fileName: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1280, 720], hotfixes: ['px_scaling'] });
  for (let i = 0; i < slides.length; i++) {
    if (i > 0) doc.addPage([1280, 720], 'landscape');
    const canvas = await drawSlide(slides[i], ctx);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 1280, 720);
  }
  doc.save(`${fileName}.pdf`);
}
