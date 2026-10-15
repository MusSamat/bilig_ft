/** Shared slide rendering for exports: snapshot images to PNG, slide → canvas (PDF). */
import type { Slide } from '@bilig/content-model/api';

export interface ExportContext {
  title: string;
  hue: number;
  images: Map<string, string>;
  labels: { steps: string };
}

/** Load an image data URL and re-encode as PNG (PowerPoint/PDF do not read WebP). */
export async function toPng(dataUrl: string): Promise<{ data: string; w: number; h: number }> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return { data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight };
}

export const slideImageId = (s: Slide): string | undefined =>
  s.kind === 'snapshot' ? s.snapshotId : s.kind === 'concept' ? s.snapshotId : undefined;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Draw one 16:9 slide (1280×720) for the PDF export — system fonts cover Kyrgyz Cyrillic. */
export async function drawSlide(s: Slide, ctx: ExportContext): Promise<HTMLCanvasElement> {
  const W = 1280;
  const H = 720;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  g.fillStyle = `hsl(${ctx.hue} 60% 40%)`;
  g.fillRect(0, 0, W, 12);
  const font = (px: number, bold = false) => `${bold ? '700 ' : ''}${px}px "Noto Sans", system-ui, sans-serif`;
  const title = s.kind === 'snapshot' ? s.caption ?? ctx.title : s.title;
  g.fillStyle = `hsl(${ctx.hue} 60% 25%)`;
  g.font = font(s.kind === 'title' ? 60 : 44, true);
  const titleLines = wrap(g, title, W - 140);
  titleLines.forEach((l, i) => g.fillText(l, 70, (s.kind === 'title' ? 300 : 100) + i * 56));
  g.fillStyle = '#222';
  let y = (s.kind === 'title' ? 300 : 100) + titleLines.length * 56 + 20;
  const imgId = slideImageId(s);
  const img = imgId ? ctx.images.get(imgId) : undefined;
  const textWidth = img && s.kind !== 'snapshot' ? W / 2 - 100 : W - 140;
  const lines = (text: string, px: number) => {
    g.font = font(px);
    for (const l of wrap(g, text, textWidth)) {
      g.fillText(l, 70, y);
      y += px * 1.35;
    }
  };
  if (s.kind === 'title' && s.subtitle) lines(s.subtitle, 30);
  if (s.kind === 'concept' || s.kind === 'text') lines(s.text, 26);
  if (s.kind === 'process') {
    if (s.equation) lines(s.equation, 30);
    y += 10;
    lines(ctx.labels.steps, 26);
    s.steps.forEach((st, i) => lines(`${i + 1}. ${st}`, 24));
  }
  if (img) {
    const el = new Image();
    el.src = img;
    await el.decode().catch(() => undefined);
    const box = s.kind === 'snapshot' ? { x: 140, y: 170, w: W - 280, h: H - 220 } : { x: W / 2, y: 150, w: W / 2 - 70, h: H - 220 };
    const r = Math.min(box.w / (el.naturalWidth || 1), box.h / (el.naturalHeight || 1));
    const w = (el.naturalWidth || 1) * r;
    const h = (el.naturalHeight || 1) * r;
    g.drawImage(el, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
  }
  return c;
}
