/**
 * Specimen previews: the package's pre-rendered WebP when it exists, else a
 * small live render of the topic's 3D scene captured once on the device and
 * cached in IndexedDB, else the caller's hue gradient.
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { db, nowIso } from './db';

const useThumbs = create<{ map: Record<string, string>; set(k: string, v: string): void }>((set) => ({
  map: {},
  set: (k, v) => set((s) => ({ map: { ...s.map, [k]: v } })),
}));

export function useLiveThumb(topicKey: string | undefined): string | undefined {
  const cached = useThumbs((s) => (topicKey ? s.map[topicKey] : undefined));
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!topicKey || cached || tried) return;
    setTried(true);
    void db.thumbs
      .get(topicKey)
      .then((row) => row && useThumbs.getState().set(topicKey, row.image))
      .catch(() => undefined);
  }, [topicKey, cached, tried]);
  return cached;
}

/** Downscale a captured frame (center crop) and store it as the topic's preview. */
export async function storeLiveThumb(topicKey: string, frame: string, size = 168): Promise<void> {
  if (typeof document === 'undefined') return;
  const img = new Image();
  img.src = frame;
  await img.decode().catch(() => undefined);
  if (!img.width) return;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return;
  const side = Math.min(img.width, img.height) * 0.86;
  g.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
  const data = c.toDataURL('image/webp', 0.82);
  const image = data.startsWith('data:image/webp') ? data : c.toDataURL('image/png');
  useThumbs.getState().set(topicKey, image);
  await db.thumbs.put({ topicKey, image, updatedAt: nowIso() }).catch(() => undefined);
}

export const hasLiveThumb = (topicKey: string): boolean => !!useThumbs.getState().map[topicKey];
