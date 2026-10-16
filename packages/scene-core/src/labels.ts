/**
 * Label layout without overlaps (TZ W-22 «расстановка подписей с учётом
 * перекрытий»). Pure 2D math over projected anchor points: the engine projects
 * each anchor to screen space, measures the label, and asks for placements.
 * Greedy by priority (selected first), trying a ring of candidate offsets;
 * a label that fits nowhere is hidden rather than drawn on top of another.
 */

export interface LabelInput {
  key: string;
  /** Anchor in screen pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Higher is placed first (selected structure, then nearer ones). */
  priority?: number;
  /** Anchor is behind the camera / off-screen. */
  hidden?: boolean;
}

export interface LabelPlacement {
  key: string;
  /** Top-left corner of the label box. */
  left: number;
  top: number;
  visible: boolean;
}

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

const GAP = 6;

/** Candidate top-left offsets relative to the anchor (label size w×h). */
function candidates(x: number, y: number, w: number, h: number, GAP: number): Box[] {
  const offs: [number, number][] = [
    [-w / 2, -h - GAP], // above
    [GAP, -h / 2], // right
    [-w - GAP, -h / 2], // left
    [-w / 2, GAP], // below
    [GAP, -h - GAP], // above-right
    [-w - GAP, -h - GAP], // above-left
    [GAP, GAP], // below-right
    [-w - GAP, GAP], // below-left
    [-w / 2, -2 * h - 2 * GAP], // far above
    [-w / 2, h + 2 * GAP], // far below
  ];
  return offs.map(([dx, dy]) => ({ l: x + dx, t: y + dy, r: x + dx + w, b: y + dy + h }));
}

const overlaps = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

export function placeLabels(
  labels: readonly LabelInput[],
  viewport: { width: number; height: number },
  opts: { gap?: number } = {},
): LabelPlacement[] {
  const gap = opts.gap ?? GAP;
  const order = [...labels].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.key.localeCompare(b.key));
  const placed: Box[] = [];
  const out = new Map<string, LabelPlacement>();
  for (const lab of order) {
    if (lab.hidden) {
      out.set(lab.key, { key: lab.key, left: lab.x, top: lab.y, visible: false });
      continue;
    }
    const fit = candidates(lab.x, lab.y, lab.width, lab.height, gap).find(
      (c) =>
        c.l >= 0 &&
        c.t >= 0 &&
        c.r <= viewport.width &&
        c.b <= viewport.height &&
        !placed.some((p) => overlaps(p, c)),
    );
    if (fit) {
      placed.push(fit);
      out.set(lab.key, { key: lab.key, left: fit.l, top: fit.t, visible: true });
    } else {
      out.set(lab.key, { key: lab.key, left: lab.x, top: lab.y, visible: false });
    }
  }
  return labels.map((l) => out.get(l.key)!);
}
