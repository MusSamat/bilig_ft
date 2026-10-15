/** PPTX export (W-52), client-side with pptxgenjs — loaded lazily only when exporting. */
import type { Slide } from '@bilig/content-model/api';
import { slideImageId, toPng, type ExportContext } from './render';

export async function exportPptx(slides: Slide[], ctx: ExportContext, fileName: string): Promise<void> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = ctx.title;
  const color = (l: number) => {
    const c = document.createElement('canvas').getContext('2d')!;
    c.fillStyle = `hsl(${ctx.hue} 60% ${l}%)`;
    return c.fillStyle.replace('#', '').toUpperCase();
  };
  const accent = color(30);
  for (const s of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addShape('rect', { x: 0, y: 0, w: 10, h: 0.12, fill: { color: accent } });
    const imgId = slideImageId(s);
    const raw = imgId ? ctx.images.get(imgId) : undefined;
    const img = raw ? await toPng(raw).catch(() => undefined) : undefined;
    if (s.kind === 'title') {
      slide.addText(s.title, { x: 0.6, y: 2.0, w: 8.8, h: 1.2, fontSize: 40, bold: true, color: accent });
      if (s.subtitle) slide.addText(s.subtitle, { x: 0.6, y: 3.2, w: 8.8, h: 0.8, fontSize: 20, color: '444444' });
    } else if (s.kind === 'snapshot') {
      slide.addText(s.caption ?? ctx.title, { x: 0.5, y: 0.3, w: 9, h: 0.7, fontSize: 26, bold: true, color: accent });
    } else {
      slide.addText(s.title, { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 30, bold: true, color: accent });
      const body =
        s.kind === 'process'
          ? [s.equation ?? '', `${ctx.labels.steps}:`, ...s.steps.map((x, i) => `${i + 1}. ${x}`)].filter(Boolean).join('\n')
          : s.text;
      slide.addText(body, { x: 0.5, y: 1.2, w: img ? 4.5 : 9, h: 4, fontSize: 18, color: '222222', valign: 'top' });
    }
    if (img) {
      const box = s.kind === 'snapshot' ? { x: 1, y: 1.1, w: 8, h: 4.3 } : { x: 5.2, y: 1.2, w: 4.4, h: 4 };
      const r = Math.min(box.w / img.w, box.h / img.h);
      slide.addImage({ data: img.data, x: box.x + (box.w - img.w * r) / 2, y: box.y + (box.h - img.h * r) / 2, w: img.w * r, h: img.h * r });
    }
    if (s.notes) slide.addNotes(s.notes);
  }
  await pptx.writeFile({ fileName: `${fileName}.pptx` });
}
