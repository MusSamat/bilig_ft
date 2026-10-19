/**
 * `forces` (8.3 forces): a block on a table with applied forces, gravity and
 * the normal force, friction limited by μN, the resultant as the vector sum
 * and an optional spring scale (dynamometer) pulling along the first force.
 */
import type { Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import {
  COLORS, LABELS, MODE, arrowLook, boolOr, clamp, idOr, listOf, numOr, obj, on, qty, text, uniqueBy, L, tr,
  type SimModel,
} from './common.js';

export interface AppliedForce {
  id: string;
  /** N */
  magnitude: number;
  /** 0 = right, 90 = up. */
  angleDeg: number;
}
export interface ForcesParams {
  mass: number;
  forces: AppliedForce[];
  gravity: boolean;
  /** μ (static and kinetic). */
  friction: number;
  dynamometer: boolean;
  g: number;
}
export const DEFAULT_FORCES: ForcesParams = { mass: 1, forces: [], gravity: true, friction: 0, dynamometer: false, g: 9.81 };

export function parseForcesParams(raw: unknown): ForcesParams {
  const p = obj(raw);
  const forces = uniqueBy(
    listOf(p.forces, (x) => {
      const o = obj(x);
      const id = idOr(o.id);
      const magnitude = numOr(o.magnitude, 0, 1e7, NaN);
      if (!id || !Number.isFinite(magnitude)) return null;
      return { id, magnitude, angleDeg: numOr(o.angleDeg, -1e4, 1e4, 0) };
    }),
    (f) => f.id,
  );
  return {
    mass: numOr(p.mass, 1e-4, 1e6, DEFAULT_FORCES.mass),
    forces,
    gravity: boolOr(p.gravity, DEFAULT_FORCES.gravity),
    friction: numOr(p.friction, 0, 10, DEFAULT_FORCES.friction),
    dynamometer: boolOr(p.dynamometer, DEFAULT_FORCES.dynamometer),
    g: numOr(p.g, 0.01, 1000, DEFAULT_FORCES.g),
  };
}

type V2 = [number, number];
const DEG = Math.PI / 180;
const EPS = 1e-9;

export interface ForcesState {
  applied: { id: string; vector: V2; magnitude: number }[];
  /** m·g (0 without gravity). */
  weight: number;
  /** Normal force, N (0 when the block is lifted off the table). */
  normal: number;
  /** Friction along x, N (signed; opposes motion or the tendency to move). */
  friction: number;
  /** Static friction holds the block. */
  held: boolean;
  /** The applied forces lift the block off the table. */
  lifted: boolean;
  resultant: V2;
  acceleration: V2;
}

/**
 * Σ F = applied + gravity + normal + friction. On the table N = mg − F_y;
 * friction: static −F_x while |F_x| ≤ μN (block at rest), else kinetic
 * −sign(F_x)·μN.
 */
export function forcesState(p: ForcesParams): ForcesState {
  const applied = p.forces.map((f) => ({ id: f.id, magnitude: f.magnitude, vector: [f.magnitude * Math.cos(f.angleDeg * DEG), f.magnitude * Math.sin(f.angleDeg * DEG)] as V2 }));
  const fx = applied.reduce((n, f) => n + f.vector[0], 0);
  const fy = applied.reduce((n, f) => n + f.vector[1], 0);
  const weight = p.gravity ? p.mass * p.g : 0;
  const lifted = fy > weight + EPS;
  const normal = lifted ? 0 : Math.max(0, weight - fy);
  const limit = p.friction * normal;
  const held = Math.abs(fx) <= limit + EPS;
  const friction = held ? -fx : -Math.sign(fx) * limit;
  const rx = fx + friction;
  const ry = fy - weight + normal;
  const resultant: V2 = [Math.abs(rx) < EPS ? 0 : rx, Math.abs(ry) < EPS ? 0 : ry];
  return { applied, weight, normal, friction: Math.abs(friction) < EPS ? 0 : friction, held, lifted, resultant, acceleration: [resultant[0] / p.mass, resultant[1] / p.mass] };
}

/** Half-width of the table travel and the lift height, m (1 scene unit = 1 m). */
const TRAVEL_X = 1.25;
const TRAVEL_Y = 1.1;

/** Displacement from rest under constant acceleration, stopped at the table edge; `arrival` = time to stop. */
export function forcesMotion(s: ForcesState): { arrival: number; at: (t: number) => V2; start: V2 } {
  const [ax, ay] = s.acceleration;
  const a = Math.hypot(ax, ay);
  const start: V2 = [ax > EPS ? -TRAVEL_X : ax < -EPS ? TRAVEL_X : 0, 0];
  if (a < EPS) return { arrival: Infinity, at: () => start, start };
  // Distance along a until x hits the far edge or y the lift height.
  const dx = Math.abs(ax) > EPS ? (2 * TRAVEL_X) / (Math.abs(ax) / a) : Infinity;
  const dy = ay > EPS ? TRAVEL_Y / (ay / a) : Infinity;
  const D = Math.min(dx, dy);
  const arrival = Math.sqrt((2 * D) / a);
  const at = (t: number): V2 => {
    const tt = clamp(t, 0, arrival);
    const d = 0.5 * a * tt * tt;
    return [start[0] + (ax / a) * d, start[1] + (ay / a) * d];
  };
  return { arrival, at, start };
}

const SYMBOL = {
  gravity: L('mg', 'mg', 'mg'),
  normal: L('N', 'N', 'N'),
  friction: L('Fтр', 'Fтр', 'Ff'),
  resultant: L('R', 'R', 'R'),
};

const play = (arrival: number) => clamp(arrival, 3, 8);
const PAUSE = 1.5;

export const forces: SimModel = {
  id: 'forces',
  modes: [MODE.vectors(true), MODE.resultant(), LABELS],
  clock(raw, pb, free) {
    const { arrival } = forcesMotion(forcesState(parseForcesParams(raw)));
    if (!Number.isFinite(arrival)) return pb ? pb.time : free;
    if (pb) return pb.fraction * arrival;
    const d = play(arrival);
    return (Math.min(free % (d + PAUSE), d) / d) * arrival;
  },
  build(raw, { modes, lang = 'ru' }) {
    const p = parseForcesParams(raw);
    const s = forcesState(p);
    const motion = forcesMotion(s);
    const b = clamp(0.5 * Math.cbrt(p.mass), 0.3, 0.8);
    const labels = on(modes, 'labels');
    const vectors = on(modes, 'vectors');
    const pos = (t: number): Vec3 => {
      const [x, y] = motion.at(t);
      return [x, y + b / 2, 0];
    };
    // Table: wooden top (surface at y = 0) on four legs.
    const parts: Part[] = [
      { name: 'Table', shape: { kind: 'box', size: [3.6, 0.08, 1.4], bevel: 0.02 }, position: [0, -0.04, 0], color: '#e8d2b0', material: 'wood', textureScale: 1.2 },
    ];
    ([[-1.65, -0.55], [1.65, -0.55], [-1.65, 0.55], [1.65, 0.55]] as const).forEach(([x, z], i) =>
      parts.push({ name: `Table_Leg_${i + 1}`, parent: 'Table', shape: { kind: 'box', size: [0.09, 1, 0.09], bevel: 0.015 }, position: [x, -0.54, z], color: '#b08a5a', material: 'wood' }),
    );
    parts.push({ name: 'BlockAt', shape: { kind: 'group' }, position: pos(0), noPick: true, motion: (t) => ({ position: pos(t) }) });
    parts.push({ name: 'Block', parent: 'BlockAt', shape: { kind: 'box', size: [b, b, b], bevel: b * 0.06 }, color: '#118ab2', material: 'plastic' });
    if (labels) parts.push(text('Block_Label', qty(p.mass, 'kg', lang, 2), [0, 0, b / 2 + 0.01], b * 0.28, { parent: 'BlockAt', billboard: false, plate: false }));

    // Arrows in the block's front plane, so they read over the block and the table.
    const all = [...s.applied.map((f) => f.magnitude), s.weight, s.normal, Math.abs(s.friction), Math.hypot(...s.resultant)];
    const kF = 1.3 / Math.max(EPS, ...all);
    const zf = b / 2 + 0.04;
    const len = (F: number) => Math.max(0.15, F * kF);
    const arrow = (name: string, from: Vec3, dir: V2, F: number, color: string, label: string, r = 0.03): Part[] => {
      const L0 = len(F);
      const v: Vec3 = [dir[0] * L0, dir[1] * L0, 0];
      const out: Part[] = [{ name, parent: 'BlockAt', shape: { kind: 'arrow', from, vector: v, radius: r }, color, ...arrowLook }];
      if (labels) {
        const tip: Vec3 = [from[0] + v[0] + dir[0] * 0.22, from[1] + v[1] + dir[1] * 0.16 + 0.04, from[2]];
        out.push(text(`${name}_Label`, `${label} = ${qty(F, 'N', lang)}`, tip, 0.13, { parent: 'BlockAt', color }));
      }
      return out;
    };
    // Applied forces start where their line leaves the block.
    const exit = (d: V2) => (b / 2) / Math.max(Math.abs(d[0]), Math.abs(d[1]), EPS);
    if (vectors) {
      s.applied.forEach((f, i) => {
        if (f.magnitude <= EPS) return;
        const d: V2 = [f.vector[0] / f.magnitude, f.vector[1] / f.magnitude];
        const e = exit(d);
        parts.push(...arrow(`Arrow_${f.id}`, [d[0] * e, d[1] * e, zf], d, f.magnitude, COLORS.applied[i % COLORS.applied.length], f.id));
      });
      if (p.gravity) parts.push(...arrow('Arrow_Gravity', [-0.05, 0, zf], [0, -1], s.weight, COLORS.gravity, tr(SYMBOL.gravity, lang)));
      if (s.normal > EPS) parts.push(...arrow('Arrow_Normal', [0.05, -b / 2, zf], [0, 1], s.normal, COLORS.normal, tr(SYMBOL.normal, lang)));
      if (Math.abs(s.friction) > EPS) parts.push(...arrow('Arrow_Friction', [0, -b / 2 + 0.035, zf], [Math.sign(s.friction), 0], Math.abs(s.friction), COLORS.friction, tr(SYMBOL.friction, lang), 0.026));
    }
    if (on(modes, 'resultant')) {
      const R = Math.hypot(...s.resultant);
      if (R > EPS) {
        // Drawn a little above the centre so it doesn't hide the horizontal forces.
        parts.push(...arrow('Arrow_Resultant', [0, b * 0.22, zf + 0.03], [s.resultant[0] / R, s.resultant[1] / R], R, COLORS.resultant, tr(SYMBOL.resultant, lang), 0.04));
      } else {
        // Balanced forces: no arrow, the block stays at rest (or keeps its speed).
        parts.push({ name: 'Arrow_Resultant', parent: 'BlockAt', shape: { kind: 'group' }, position: [0, b / 2 + 0.25, zf] });
        parts.push(text('Arrow_Resultant_Label', `${tr(SYMBOL.resultant, lang)} = 0`, [0, 0, 0], 0.15, { parent: 'Arrow_Resultant', color: COLORS.resultant, bold: true }));
      }
    }
    // Spring scale along the first force: hook on the block, spring stretched by the force.
    if (p.dynamometer) {
      const f = s.applied[0];
      const ang = f && f.magnitude > EPS ? Math.atan2(f.vector[1], f.vector[0]) : 0;
      const d: V2 = [Math.cos(ang), Math.sin(ang)];
      const e = exit(d);
      const F = f?.magnitude ?? 0;
      const full = Math.max(10, Math.ceil(F / 5) * 5);
      const rest = 0.28;
      const stretch = rest + 0.45 * (F / full);
      parts.push(...dynamometer([d[0] * e, d[1] * e, 0], ang, stretch, labels ? qty(F, 'N', lang) : null));
    }
    return parts;
  },
};

/** Spring scale lying along +X from `at` (turned by `angle`), its spring stretched to `stretch`. */
function dynamometer(at: Vec3, angle: number, stretch: number, label: string | null): Part[] {
  const caseLen = 0.95;
  const hook = 0.08;
  const coil: Vec3[] = [];
  const turns = 11;
  for (let i = 0; i <= turns * 12; i++) {
    const u = i / (turns * 12);
    const a = u * turns * Math.PI * 2;
    coil.push([hook + 0.04 + u * stretch, Math.sin(a) * 0.045, Math.cos(a) * 0.045]);
  }
  const cx = hook + caseLen / 2;
  const parts: Part[] = [
    { name: 'Dynamometer', shape: { kind: 'group' }, parent: 'BlockAt', position: at, rotation: [0, 0, angle] },
    { name: 'Dynamometer_Hook', parent: 'Dynamometer', shape: { kind: 'tube', from: [0, 0, 0], to: [hook + 0.04, 0, 0], radius: 0.01 }, color: COLORS.steel, material: 'metal' },
    { name: 'Dynamometer_Case', parent: 'Dynamometer', shape: { kind: 'cylinder', radiusTop: 0.075, radiusBottom: 0.075, height: caseLen, segments: 32, openEnded: true }, position: [cx, 0, 0], rotation: [0, 0, Math.PI / 2], color: '#d8f3ff', material: 'glass' },
    { name: 'Dynamometer_Cap', parent: 'Dynamometer', shape: { kind: 'cylinder', radiusTop: 0.08, radiusBottom: 0.08, height: 0.04, segments: 32 }, position: [hook + caseLen, 0, 0], rotation: [0, 0, Math.PI / 2], color: '#f4a261', material: 'plastic' },
    { name: 'Dynamometer_Ring', parent: 'Dynamometer', shape: { kind: 'torus', radius: 0.07, tube: 0.014, segments: 32 }, position: [hook + caseLen + 0.1, 0, 0], color: COLORS.steel, material: 'metal' },
    { name: 'Spring', parent: 'Dynamometer', shape: { kind: 'polyline', points: coil, radius: 0.007 }, color: '#d9dde3', material: 'metal' },
    // Pointer at the end of the spring, over a scale of ticks every 1/10 of full scale.
    { name: 'Dynamometer_Pointer', parent: 'Dynamometer', shape: { kind: 'box', size: [0.015, 0.03, 0.17] }, position: [hook + 0.04 + stretch, 0, 0], color: '#e63946', material: 'plastic' },
  ];
  for (let i = 0; i <= 10; i++) {
    parts.push({ name: `Dynamometer_Tick_${i}`, parent: 'Dynamometer', shape: { kind: 'box', size: [0.006, i % 5 === 0 ? 0.05 : 0.03, 0.006] }, position: [hook + 0.04 + 0.28 + 0.045 * i, 0.085, 0.06], color: '#343a40', noPick: true });
  }
  if (label) parts.push(text('Dynamometer_Label', label, [cx, 0.22, 0.08], 0.13, { parent: 'Dynamometer', color: '#f4a261' }));
  return parts;
}

