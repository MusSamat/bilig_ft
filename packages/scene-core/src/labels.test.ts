import { describe, it, expect } from 'vitest';
import { placeLabels } from './labels.js';

const box = (p: { left: number; top: number }, w = 80, h = 20) => ({ l: p.left, t: p.top, r: p.left + w, b: p.top + h });
const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

describe('placeLabels (W-22)', () => {
  it('never overlaps visible labels, even for coincident anchors', () => {
    const labels = Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, x: 200, y: 200, width: 80, height: 20 }));
    const out = placeLabels(labels, { width: 400, height: 400 });
    const vis = out.filter((p) => p.visible).map((p) => box(p));
    expect(vis.length).toBeGreaterThan(3);
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) expect(overlap(vis[i], vis[j])).toBe(false);
  });
  it('places the highest priority label in its preferred slot (above the anchor)', () => {
    const out = placeLabels(
      [
        { key: 'a', x: 100, y: 100, width: 80, height: 20 },
        { key: 'sel', x: 100, y: 100, width: 80, height: 20, priority: 10 },
      ],
      { width: 300, height: 300 },
    );
    expect(out[1]).toEqual({ key: 'sel', left: 60, top: 74, visible: true });
    expect(out[0].visible).toBe(true);
    expect(out[0].top).not.toBe(74);
  });
  it('hides labels whose anchors are hidden or that fit nowhere', () => {
    const out = placeLabels(
      [
        { key: 'h', x: 10, y: 10, width: 10, height: 10, hidden: true },
        { key: 'big', x: 5, y: 5, width: 500, height: 500 },
      ],
      { width: 100, height: 100 },
    );
    expect(out.map((o) => o.visible)).toEqual([false, false]);
  });
});
