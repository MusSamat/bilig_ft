/**
 * Page images for POST /ktp/contents: a photo (or a rendered PDF page) as a
 * JPEG data URL, longest side ≤ `maxSide`, re-encoded smaller until it fits
 * `maxBytes`. Browser canvas only (jsdom has none: tests mock this module).
 */

const QUALITIES = [0.82, 0.7, 0.55, 0.4];

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const toBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/** Canvas → JPEG data URL of at most `maxBytes` (lower quality first, then a smaller size). */
export async function canvasToJpeg(canvas: HTMLCanvasElement, maxBytes: number): Promise<string> {
  let src = canvas;
  for (let shrink = 0; shrink < 3; shrink++) {
    for (const q of QUALITIES) {
      const blob = await toBlob(src, q);
      if (blob && blob.size <= maxBytes) return blobToDataUrl(blob);
    }
    const next = document.createElement('canvas');
    next.width = Math.round(src.width * 0.75);
    next.height = Math.round(src.height * 0.75);
    next.getContext('2d')!.drawImage(src, 0, 0, next.width, next.height);
    src = next;
  }
  throw new Error('image too large');
}

async function decode(file: Blob): Promise<{
  img: CanvasImageSource;
  width: number;
  height: number;
  done: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file);
    return {
      img: bmp,
      width: bmp.width,
      height: bmp.height,
      done: () => bmp.close(),
    };
  }
  const url = URL.createObjectURL(file);
  const el = new Image();
  el.src = url;
  await el.decode();
  return {
    img: el,
    width: el.naturalWidth,
    height: el.naturalHeight,
    done: () => URL.revokeObjectURL(url),
  };
}

/** A photo → JPEG data URL, longest side ≤ `maxSide`. */
export async function imageToJpeg(file: Blob, maxSide: number, maxBytes: number): Promise<string> {
  const { img, width, height, done } = await decode(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; // transparent PNGs become white pages, not black ones
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await canvasToJpeg(canvas, maxBytes);
  } finally {
    done();
  }
}
