/**
 * Small pieces shared by the mechanics models of physics 7 (`circular`,
 * `spring`, `momentum`, `pulley`): units the common table lacks, readouts
 * that change with the model clock (a few static texts shown in turn),
 * ropes and coils that stretch, and pulley wheels.
 */
import type { Lang, Localized, Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import { L, fmt, text, unit, type TextOpts } from './common.js';

const UNITS: Record<string, Localized> = {
  J: L('Дж', 'Дж', 'J'),
  W: L('Вт', 'Вт', 'W'),
  'N/m': L('Н/м', 'Н/м', 'N/m'),
  'N/kg': L('Н/кг', 'Н/кг', 'N/kg'),
  cm: L('см', 'см', 'cm'),
  Hz: L('Гц', 'Гц', 'Hz'),
  'kg·m/s': L('кг·м/с', 'кг·м/с', 'kg·m/s'),
};
/** Unit in the scene language: the mechanics extras, then the common table. */
export const u = (name: string, lang: Lang = 'ru') => UNITS[name]?.[lang] ?? unit(name, lang);
/** `12,5 Дж` */
export const q = (n: number, name: string, lang: Lang = 'ru', digits = 1) => `${fmt(n, digits, lang)} ${u(name, lang)}`;

/**
 * A readout that changes with the clock: one static text per window
 * [times[i], times[i+1]), the last one stays. `str(i)` gives the text of window i.
 */
export function timedTexts(name: string, times: number[], str: (i: number) => string, at: Vec3, size: number, o: TextOpts = {}): Part[] {
  return times.map((t0, i) => {
    const t1 = i + 1 < times.length ? times[i + 1] : Infinity;
    const first = i === 0;
    return text(`${name}_${i + 1}`, str(i), at, size, { ...o, motion: (t) => ({ visible: (first || t >= t0) && t < t1 }) });
  });
}

/** Up to `max` window starts spread over [0, T]. */
export function sampleTimes(T: number, step: number, max = 30): number[] {
  if (!(T > 0)) return [0];
  const n = Math.max(1, Math.min(max, Math.ceil(T / step)));
  return Array.from({ length: n }, (_, i) => (i * T) / n);
}

/**
 * A straight vertical rope piece between two heights that follow the clock:
 * a unit tube along +Y scaled to the gap (stays round: only Y scales).
 */
export function vRope(name: string, parent: string | undefined, x: number, z: number, y0: (t: number) => number, y1: (t: number) => number, r: number, color: string): Part {
  const at = (t: number) => {
    const a = y0(t);
    const b = y1(t);
    const len = Math.max(1e-3, Math.abs(b - a));
    // A tube mesh sits at its span's midpoint (its geometry is centred), so the motion places the middle.
    return { position: [x, (a + b) / 2, z] as Vec3, scale: [1, len, 1] as Vec3, visible: Math.abs(b - a) > 1e-3 };
  };
  const a0 = at(0);
  return { name, parent, shape: { kind: 'tube', from: [0, 0, 0], to: [0, 1, 0], radius: r }, position: a0.position, scale: a0.scale, color, material: 'matte', motion: at };
}

/** Helix along −Y from 0 to −1 (scale Y to stretch it), `turns` turns of radius `r`. */
export function helixDown(turns: number, r: number, perTurn = 14): Vec3[] {
  const pts: Vec3[] = [];
  const n = turns * perTurn;
  // Straight lead-ins so the ends meet the hook on the axis.
  pts.push([0, 0, 0], [r, -0.03, 0]);
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const a = s * turns * Math.PI * 2;
    pts.push([Math.cos(a) * r, -0.03 - s * 0.94, Math.sin(a) * r]);
  }
  pts.push([0, -1, 0]);
  return pts;
}

/** Helix along +X from 0 to 1 (scale X to compress it). */
export function helixAlongX(turns: number, r: number, perTurn = 14): Vec3[] {
  const pts: Vec3[] = [];
  const n = turns * perTurn;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const a = s * turns * Math.PI * 2;
    pts.push([s, Math.sin(a) * r, Math.cos(a) * r]);
  }
  return pts;
}

/**
 * A pulley wheel in the XY plane centred at `at` (child of `parent`): a disc
 * with a grooved rim, spokes and an axle; `angle(t)` turns it about Z so the
 * spokes show the rope running.
 */
export function wheel(name: string, parent: string | undefined, at: Vec3, R: number, color: string, angle: (t: number) => number): Part[] {
  const spin = `${name}_Spin`;
  const parts: Part[] = [
    { name, parent, shape: { kind: 'group' }, position: at },
    { name: spin, parent: name, shape: { kind: 'group' }, noPick: true, rotation: [0, 0, angle(0)], motion: (t) => ({ rotation: [0, 0, angle(t)] }) },
    { name: `${name}_Disc`, parent: spin, shape: { kind: 'cylinder', radiusTop: R * 0.86, radiusBottom: R * 0.86, height: R * 0.32, segments: 40 }, rotation: [Math.PI / 2, 0, 0], color, material: 'metal' },
    { name: `${name}_Rim_1`, parent: spin, shape: { kind: 'torus', radius: R * 0.93, tube: R * 0.1, segments: 48 }, position: [0, 0, R * 0.13], color, material: 'metal' },
    { name: `${name}_Rim_2`, parent: spin, shape: { kind: 'torus', radius: R * 0.93, tube: R * 0.1, segments: 48 }, position: [0, 0, -R * 0.13], color, material: 'metal' },
    { name: `${name}_Hub`, parent: spin, shape: { kind: 'cylinder', radiusTop: R * 0.22, radiusBottom: R * 0.22, height: R * 0.46, segments: 24 }, rotation: [Math.PI / 2, 0, 0], color: '#5c6676', material: 'metal' },
  ];
  // Painted spokes on both faces: they make the rotation visible.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    for (const side of [1, -1]) {
      parts.push({ name: `${name}_Spoke_${i + 1}${side > 0 ? 'f' : 'b'}`, parent: spin, shape: { kind: 'box', size: [R * 0.62, R * 0.12, R * 0.02] }, position: [Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, side * R * 0.17], rotation: [0, 0, a], color: '#e63946', material: 'plastic', noPick: true });
    }
  }
  return parts;
}

/** Localized symbol. */
export type Sym = Localized;
export const sym = (s: Sym, lang: Lang = 'ru') => s[lang] ?? s.ru;
