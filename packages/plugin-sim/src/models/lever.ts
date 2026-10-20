/**
 * `lever` (8.4 moment of a force, 2.1 the arm as a lever): a beam on a pivot
 * with loads; moments M = m·g·(x − pivot), the beam tilts by the net moment
 * in «balance» mode and stays level when the moments balance.
 */
import type { Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import {
  COLORS, LABELS, MODE, arrowLook, clamp, fmt, idOr, listOf, numOr, obj, on, qty, text, uniqueBy, unit,
  type SimModel,
} from './common.js';

export interface Load {
  id: string;
  /** m from the left end. */
  position: number;
  /** kg */
  mass: number;
}
export interface LeverParams {
  /** Beam length, m. */
  length: number;
  /** Pivot, m from the left end. */
  pivot: number;
  loads: Load[];
  g: number;
}
export const DEFAULT_LEVER: LeverParams = { length: 2, pivot: 1, loads: [], g: 9.81 };

export function parseLeverParams(raw: unknown): LeverParams {
  const p = obj(raw);
  const length = numOr(p.length, 1e-3, 1e4, DEFAULT_LEVER.length);
  const pivot = numOr(p.pivot, 0, length, length / 2);
  const loads = uniqueBy(
    listOf(p.loads, (x) => {
      const o = obj(x);
      const id = idOr(o.id);
      const position = numOr(o.position, 0, length, NaN);
      const mass = numOr(o.mass, 0, 1e6, NaN);
      return id && Number.isFinite(position) && Number.isFinite(mass) ? { id, position, mass } : null;
    }),
    (l) => l.id,
  );
  return { length, pivot, loads, g: numOr(p.g, 0.01, 1000, DEFAULT_LEVER.g) };
}

export interface LeverState {
  loads: { id: string; force: number; arm: number; moment: number }[];
  /** Σ m·g·(x − pivot), N·m: > 0 turns the beam clockwise (right end down). */
  netMoment: number;
  balanced: boolean;
}

export function leverState(p: LeverParams): LeverState {
  const loads = p.loads.map((l) => {
    const force = l.mass * p.g;
    const moment = force * (l.position - p.pivot);
    return { id: l.id, force, arm: Math.abs(l.position - p.pivot), moment };
  });
  const netMoment = loads.reduce((n, l) => n + l.moment, 0);
  const scale = loads.reduce((n, l) => n + Math.abs(l.moment), 0);
  const balanced = Math.abs(netMoment) <= 1e-9 * Math.max(1, scale);
  return { loads, netMoment: balanced ? 0 : netMoment, balanced };
}

/**
 * Beam angle about +Z (rad, counter-clockwise positive): −θmax·tanh(3·ΣM/Σ|M|),
 * so a clockwise net moment lowers the right end; 0 when balanced.
 */
export function leverTilt(s: LeverState, maxTilt: number): number {
  if (s.balanced) return 0;
  const scale = s.loads.reduce((n, l) => n + Math.abs(l.moment), 0) || 1;
  return -maxTilt * Math.tanh((3 * s.netMoment) / scale);
}

const BEAM = 4;
const H = 0.75;
const LOAD_COLORS = ['#c9a227', '#8d99ae', '#e76f51', '#2a9d8f', '#9b5de5', '#f15bb5'];

export const lever: SimModel = {
  id: 'lever',
  modes: [MODE.vectors(), MODE.arms(true), MODE.balance(), LABELS],
  clock: (_raw, pb, free) => (pb ? pb.time : free),
  build(raw, { modes, lang = 'ru' }) {
    const p = parseLeverParams(raw);
    const s = leverState(p);
    const k = BEAM / p.length;
    const xp = (p.pivot - p.length / 2) * k;
    const bx = (x: number) => (x - p.pivot) * k; // beam-local x of a point x m from the left end
    const labels = on(modes, 'labels');
    // The side that goes down must not hit the floor.
    const armDown = s.netMoment > 0 ? (p.length - p.pivot) * k : p.pivot * k;
    const maxTilt = Math.min((15 * Math.PI) / 180, Math.asin(clamp((H - 0.08) / Math.max(armDown, 1e-6), 0, 1)));
    const theta = on(modes, 'balance') ? leverTilt(s, maxTilt) : 0;
    const world = (lx: number, ly: number): Vec3 => [xp + lx * Math.cos(theta) - ly * Math.sin(theta), H + lx * Math.sin(theta) + ly * Math.cos(theta), 0];
    const r = 0.5;
    const parts: Part[] = [
      { name: 'Base', shape: { kind: 'box', size: [BEAM + 0.8, 0.04, 0.9], bevel: 0.015 }, position: [0, -0.02, 0], color: '#3d4654', material: 'plastic', noPick: true },
      // Triangular prism, apex up under the beam.
      { name: 'Pivot', shape: { kind: 'cylinder', radiusTop: r, radiusBottom: r, height: 0.4, segments: 3 }, position: [xp, H - r, 0], rotation: [-Math.PI / 2, 0, 0], color: '#8892a0', material: 'metal' },
      { name: 'BeamTilt', shape: { kind: 'group' }, position: [xp, H, 0], rotation: [0, 0, theta], noPick: true },
      { name: 'Beam', parent: 'BeamTilt', shape: { kind: 'box', size: [BEAM, 0.08, 0.3], bevel: 0.015 }, position: [bx(p.length / 2), 0.04, 0], color: '#e9c891', material: 'wood', textureScale: 1.5 },
    ];
    // Ruler ticks every tenth of the beam.
    for (let i = 0; i <= 10; i++) {
      parts.push({ name: `Beam_Tick_${i}`, parent: 'Beam', shape: { kind: 'box', size: [0.008, i % 5 === 0 ? 0.05 : 0.03, 0.004] }, position: [-BEAM / 2 + (BEAM * i) / 10, 0.01, 0.152], color: '#4a3b2a', noPick: true });
    }
    const fMax = Math.max(1e-9, ...s.loads.map((l) => l.force));
    const mMax = Math.max(1e-9, ...p.loads.map((l) => l.mass));
    p.loads.forEach((l, i) => {
      const st = s.loads[i];
      const color = LOAD_COLORS[i % LOAD_COLORS.length];
      const lx = bx(l.position);
      // Slotted mass: a short cylinder (size by mass) with a knob, standing on the beam.
      // Sized relative to the heaviest load on the beam (so lab masses of a few hundred grams still read).
      const rr = clamp(0.2 * Math.cbrt(Math.max(l.mass, 1e-6) / mMax), 0.07, 0.2);
      const hh = rr * 1.1;
      parts.push({ name: `Load_${l.id}`, parent: 'BeamTilt', shape: { kind: 'cylinder', radiusTop: rr, radiusBottom: rr, height: hh, segments: 40 }, position: [lx, 0.08 + hh / 2, 0], color, material: 'copper' });
      parts.push({ name: `Load_${l.id}_Knob`, parent: `Load_${l.id}`, shape: { kind: 'cylinder', radiusTop: rr * 0.25, radiusBottom: rr * 0.3, height: rr * 0.35, segments: 20 }, position: [0, hh / 2 + rr * 0.17, 0], color, material: 'copper' });
      if (labels) parts.push(text(`Load_${l.id}_Label`, `${l.id}: ${qty(l.mass, 'kg', lang, 2)}`, [lx, 0.08 + hh + 0.22, 0], 0.13, { parent: 'BeamTilt' }));
      if (on(modes, 'arms')) {
        // Dimension line from the pivot to the load, under the beam.
        const y = -0.16 - 0.1 * i;
        const len = Math.abs(lx);
        const A = `Arm_${l.id}`;
        parts.push({ name: A, parent: 'BeamTilt', shape: { kind: 'group' }, position: [0, y, 0.17] });
        if (len > 1e-6) parts.push({ name: `${A}_Line`, parent: A, shape: { kind: 'tube', from: [0, 0, 0], to: [lx, 0, 0], radius: 0.012 }, color, material: 'emissive', glow: 1 });
        parts.push({ name: `${A}_End_1`, parent: A, shape: { kind: 'box', size: [0.012, 0.09, 0.012] }, position: [0, 0, 0], color, material: 'emissive', glow: 1 });
        parts.push({ name: `${A}_End_2`, parent: A, shape: { kind: 'box', size: [0.012, 0.09, 0.012] }, position: [lx, 0, 0], color, material: 'emissive', glow: 1 });
        if (labels) parts.push(text(`${A}_Label`, `d = ${qty(st.arm, 'm', lang, 2)}`, [lx / 2, -0.09, 0.02], 0.11, { parent: A, color }));
      }
      if (on(modes, 'vectors')) {
        // Weight acts on the beam at the load, straight down whatever the tilt.
        const L0 = Math.max(0.15, (st.force / fMax) * 0.9);
        parts.push({ name: `Arrow_${l.id}_At`, shape: { kind: 'group' }, position: world(lx, 0), noPick: true });
        parts.push({ name: `Arrow_${l.id}`, parent: `Arrow_${l.id}_At`, shape: { kind: 'arrow', from: [0, 0, 0.2], vector: [0, -L0, 0], radius: 0.026 }, color: COLORS.gravity, ...arrowLook });
        if (labels) parts.push(text(`Arrow_${l.id}_Label`, `F = ${qty(st.force, 'N', lang)}`, [0.05, -L0 - 0.14, 0.2], 0.12, { parent: `Arrow_${l.id}_At`, color: COLORS.gravity }));
      }
    });
    if (labels && p.loads.length) {
      // Moments: ↺ left of the pivot (anticlockwise), ↻ right of it.
      const lines = s.loads.map((l, i) => `M(${l.id}) = ${fmt(Math.abs(l.moment), 2, lang)} ${unit('N·m', lang)} ${p.loads[i].position < p.pivot ? '↺' : p.loads[i].position > p.pivot ? '↻' : ''}`.trim());
      lines.push(`ΣM = ${fmt(Math.abs(s.netMoment), 2, lang)} ${unit('N·m', lang)}${s.balanced ? '' : s.netMoment > 0 ? ' ↻' : ' ↺'}`);
      parts.push(text('Moments_Label', lines.join('\n'), [xp, H + 1.35, 0], 0.13));
    }
    return parts;
  },
};
