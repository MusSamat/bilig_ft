/**
 * `circular` (physics 7 §11, uniform motion along a circle): a body — a ball
 * on a cord, a toy car on a round track or a carousel seat — goes round a
 * horizontal circle of radius R once per period T. The velocity is tangent to
 * the circle, the radius turns with the body; equal arcs in equal times.
 * Readouts: T, ν = 1/T, v = 2πR/T.
 */
import type { Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import { COLORS, LABELS, L, MODE, arrowLook, boolOr, enumOr, fmt, numOr, obj, on, qty, text, tr, type SimModel } from './common.js';
import { q } from './mechCommon.js';

export type CircularObject = 'ball' | 'car' | 'carousel';
export interface CircularParams {
  /** Radius of the circle, m. */
  radius: number;
  /** Time of one turn, s. */
  period: number;
  showVelocity: boolean;
  object: CircularObject;
}
export const DEFAULT_CIRCULAR: CircularParams = { radius: 2, period: 4, showVelocity: true, object: 'ball' };

export function parseCircularParams(raw: unknown): CircularParams {
  const p = obj(raw);
  return {
    radius: numOr(p.radius, 1e-3, 1e5, DEFAULT_CIRCULAR.radius),
    period: numOr(p.period, 0.05, 1e5, DEFAULT_CIRCULAR.period),
    showVelocity: boolOr(p.showVelocity, DEFAULT_CIRCULAR.showVelocity),
    object: enumOr(p.object, ['ball', 'car', 'carousel'] as const, DEFAULT_CIRCULAR.object),
  };
}

export interface CircularState {
  /** Frequency ν = 1/T, 1/s. */
  frequency: number;
  /** Speed v = 2πR/T, m/s. */
  speed: number;
  /** Angular speed ω = 2π/T, rad/s. */
  angularSpeed: number;
  /** Length of the circle 2πR, m. */
  circumference: number;
}

export function circularState(p: CircularParams): CircularState {
  const circumference = 2 * Math.PI * p.radius;
  return { frequency: 1 / p.period, speed: circumference / p.period, angularSpeed: (2 * Math.PI) / p.period, circumference };
}

/** Angle turned (rad, anticlockwise seen from above) at time t. */
export const circularAngle = (p: CircularParams, t: number) => (2 * Math.PI * t) / p.period;

/** Shown radius in scene units: real size for 0.5–3 m, otherwise scaled into that range. */
export const shownRadius = (r: number) => (r < 0.5 ? 0.5 : r > 3 ? 3 : r);

/** Marks on the path every 1/12 of a turn (equal arcs in equal times). */
const MARKS = 12;

export const circular: SimModel = {
  id: 'circular',
  modes: [MODE.vectors(true), MODE.trace(), LABELS],
  modesFor(raw) {
    const p = parseCircularParams(raw);
    return [MODE.vectors(p.showVelocity), MODE.trace(), LABELS];
  },
  clock: (_raw, pb, free) => (pb ? pb.time : free),
  build(raw, { modes, lang = 'ru' }) {
    const p = parseCircularParams(raw);
    const s = circularState(p);
    const R = shownRadius(p.radius);
    const k = R / p.radius;
    const phi = (t: number) => circularAngle(p, t);
    const labels = on(modes, 'labels');
    const y = p.object === 'carousel' ? 0.25 : 0.012;
    const parts: Part[] = [];

    // The floor plate / track and the path.
    if (p.object === 'car') {
      parts.push({ name: 'Path', shape: { kind: 'ring', inner: R - 0.3, outer: R + 0.3, segments: 96 }, position: [0, 0.004, 0], color: '#3a3f47', material: 'matte' });
      parts.push({ name: 'Path_Line', parent: 'Path', shape: { kind: 'torus', radius: R, tube: 0.012, segments: 128 }, position: [0, 0.006, 0], rotation: [Math.PI / 2, 0, 0], color: '#f1f3f5', material: 'matte', noPick: true });
      parts.push({ name: 'Path_Kerb_1', parent: 'Path', shape: { kind: 'torus', radius: R + 0.31, tube: 0.03, segments: 128 }, rotation: [Math.PI / 2, 0, 0], color: '#e63946', material: 'plastic', noPick: true });
      parts.push({ name: 'Path_Kerb_2', parent: 'Path', shape: { kind: 'torus', radius: R - 0.31, tube: 0.03, segments: 128 }, rotation: [Math.PI / 2, 0, 0], color: '#f1f3f5', material: 'plastic', noPick: true });
      parts.push({ name: 'Ground', shape: { kind: 'cylinder', radiusTop: R + 0.6, radiusBottom: R + 0.6, height: 0.04, segments: 96 }, position: [0, -0.02, 0], color: '#6a994e', material: 'matte', noPick: true });
    } else {
      parts.push({ name: 'Ground', shape: { kind: 'cylinder', radiusTop: R + 0.5, radiusBottom: R + 0.5, height: 0.04, segments: 96 }, position: [0, -0.02, 0], color: p.object === 'carousel' ? '#c9b48a' : '#2b3442', material: 'matte', noPick: true });
      parts.push({ name: 'Path', shape: { kind: 'torus', radius: R, tube: 0.018, segments: 128 }, position: [0, y, 0], rotation: [Math.PI / 2, 0, 0], color: '#ffd166', material: 'emissive', glow: 0.6, opacity: 0.85, container: true });
    }

    // Centre: a post (ball on a cord), a flag pole (track) or the carousel mast.
    const mastH = p.object === 'carousel' ? 1.5 : p.object === 'car' ? 0.5 : 0.22;
    parts.push({ name: 'Center', shape: { kind: 'cylinder', radiusTop: 0.04, radiusBottom: 0.06, height: mastH, segments: 24 }, position: [0, mastH / 2, 0], color: COLORS.steel, material: 'brushed' });
    parts.push({ name: 'Center_Base', parent: 'Center', shape: { kind: 'cylinder', radiusTop: 0.12, radiusBottom: 0.14, height: 0.04, segments: 32 }, position: [0, -mastH / 2 + 0.02, 0], color: '#5c6676', material: 'metal', noPick: true });

    // Everything that turns lives in one group rotated about Y: +X of the group points at the body.
    parts.push({ name: 'Spin', shape: { kind: 'group' }, noPick: true, motion: (t) => ({ rotation: [0, phi(t), 0] }) });
    const ry = p.object === 'carousel' ? 0.34 : p.object === 'car' ? 0.16 : 0.12;
    parts.push({ name: 'Radius', parent: 'Spin', shape: { kind: 'tube', from: [0, ry, 0], to: [R, ry, 0], radius: p.object === 'ball' ? 0.008 : 0.014 }, color: p.object === 'ball' ? '#eef1f4' : '#9ad1d4', material: p.object === 'ball' ? 'matte' : 'emissive', glow: p.object === 'ball' ? undefined : 0.7, opacity: p.object === 'ball' ? undefined : 0.8, container: p.object !== 'ball' });

    if (p.object === 'carousel') {
      // A round deck turning with the seats, a canopy on the mast.
      parts.push({ name: 'Carousel_Deck', parent: 'Spin', shape: { kind: 'cylinder', radiusTop: R + 0.25, radiusBottom: R + 0.25, height: 0.08, segments: 96 }, position: [0, 0.2, 0], color: '#f4a261', material: 'wood', textureScale: 1.4 });
      parts.push({ name: 'Carousel_Canopy', parent: 'Spin', shape: { kind: 'cylinder', radiusTop: 0.05, radiusBottom: R + 0.35, height: 0.45, segments: 48 }, position: [0, mastH + 0.18, 0], color: '#e76f51', material: 'plastic' });
      for (let i = 1; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push({ name: `Carousel_Seat_${i}`, parent: 'Spin', shape: { kind: 'box', size: [0.22, 0.18, 0.22], bevel: 0.04 }, position: [Math.cos(a) * R, 0.33, -Math.sin(a) * R], color: ['#118ab2', '#06d6a0', '#ffd166', '#b388ff', '#ef476f'][i - 1], material: 'plastic' });
        parts.push({ name: `Carousel_Pole_${i}`, parent: 'Spin', shape: { kind: 'tube', from: [Math.cos(a) * R, 0.24, -Math.sin(a) * R], to: [Math.cos(a) * R, mastH, -Math.sin(a) * R], radius: 0.015 }, color: '#e9c46a', material: 'copper', noPick: true });
      }
      // The body we follow: the red seat with a rider at +X.
      parts.push({ name: 'Body', parent: 'Spin', shape: { kind: 'box', size: [0.26, 0.2, 0.26], bevel: 0.05 }, position: [R, 0.34, 0], color: '#e63946', material: 'plastic' });
      parts.push({ name: 'Body_Pole', parent: 'Body', shape: { kind: 'tube', from: [0, -0.1, 0], to: [0, mastH - 0.34, 0], radius: 0.016 }, color: '#e9c46a', material: 'copper' });
      parts.push({ name: 'Body_Rider', parent: 'Body', shape: { kind: 'capsule', radius: 0.07, length: 0.16 }, position: [0, 0.22, 0], color: '#3a86ff', material: 'plastic' });
      parts.push({ name: 'Body_Head', parent: 'Body', shape: { kind: 'sphere', radius: 0.07, widthSegments: 20 }, position: [0, 0.4, 0], color: '#f1c27d', material: 'matte' });
    } else if (p.object === 'car') {
      // Toy car driving anticlockwise: its nose points along the velocity (local −Z).
      parts.push({ name: 'Body', parent: 'Spin', shape: { kind: 'group' }, position: [R, 0, 0] });
      parts.push({ name: 'Body_Shell', parent: 'Body', shape: { kind: 'box', size: [0.26, 0.11, 0.5], bevel: 0.04 }, position: [0, 0.12, 0], color: '#e63946', material: 'plastic' });
      parts.push({ name: 'Body_Cabin', parent: 'Body', shape: { kind: 'box', size: [0.23, 0.1, 0.26], bevel: 0.035 }, position: [0, 0.21, 0.04], color: '#9fd3ff', material: 'glass' });
      ([[0.13, 0.16], [-0.13, 0.16], [0.13, -0.16], [-0.13, -0.16]] as const).forEach(([wx, wz], i) => {
        // Wheels roll with the arc length run (s = φR).
        const r0 = 0.065;
        const roll = (t: number): Vec3 => [(-phi(t) * (R + wx)) / r0, 0, Math.PI / 2];
        parts.push({ name: `Body_Wheel_${i + 1}`, parent: 'Body', shape: { kind: 'cylinder', radiusTop: r0, radiusBottom: r0, height: 0.05, segments: 20 }, position: [wx, r0, wz], rotation: roll(0), color: '#1e2229', material: 'rubber', motion: (t) => ({ rotation: roll(t) }) });
        parts.push({ name: `Body_Wheel_${i + 1}_Hub`, parent: `Body_Wheel_${i + 1}`, shape: { kind: 'box', size: [0.08, 0.055, 0.025] }, color: COLORS.steel, material: 'metal', noPick: true });
      });
      parts.push({ name: 'Body_Light_1', parent: 'Body', shape: { kind: 'sphere', radius: 0.022, widthSegments: 10 }, position: [0.08, 0.12, -0.25], color: '#fff3c4', material: 'emissive', glow: 1.2, noPick: true });
      parts.push({ name: 'Body_Light_2', parent: 'Body', shape: { kind: 'sphere', radius: 0.022, widthSegments: 10 }, position: [-0.08, 0.12, -0.25], color: '#fff3c4', material: 'emissive', glow: 1.2, noPick: true });
    } else {
      // A ball on a cord tied to the post, rolling on a smooth table.
      const br = 0.12;
      parts.push({ name: 'Body', parent: 'Spin', shape: { kind: 'sphere', radius: br, widthSegments: 32 }, position: [R, br, 0], color: '#e63946', material: 'plastic', roughness: 0.25 });
      // The ball rolls: two stripes turn about the radius as it runs along −Z.
      const roll = (t: number): Vec3 => [(-phi(t) * R) / br, 0, 0];
      parts.push({ name: 'Body_Roll', parent: 'Body', shape: { kind: 'group' }, noPick: true, rotation: roll(0), motion: (t) => ({ rotation: roll(t) }) });
      parts.push({ name: 'Body_Stripe_1', parent: 'Body_Roll', shape: { kind: 'torus', radius: br * 0.995, tube: br * 0.09, segments: 32 }, color: '#f8f9fa', material: 'plastic', noPick: true });
      parts.push({ name: 'Body_Stripe_2', parent: 'Body_Roll', shape: { kind: 'torus', radius: br * 0.995, tube: br * 0.09, segments: 32 }, rotation: [Math.PI / 2, 0, 0], color: '#f8f9fa', material: 'plastic', noPick: true });
    }

    if (on(modes, 'vectors')) {
      // Tangent velocity at the body: anticlockwise motion → local −Z.
      const len = 0.9;
      const vy = p.object === 'carousel' ? 0.75 : p.object === 'car' ? 0.45 : 0.32;
      parts.push({ name: 'Arrow_Velocity', parent: 'Spin', shape: { kind: 'arrow', from: [R, vy, 0], vector: [0, 0, -len], radius: 0.03 }, color: COLORS.velocity, ...arrowLook });
      if (labels) parts.push(text('Arrow_Velocity_Label', `v = ${qty(s.speed, 'm/s', lang, 2)}`, [R, vy + 0.2, -len * 0.75], 0.13, { parent: 'Spin', color: COLORS.velocity }));
    }

    if (on(modes, 'trace')) {
      // Where the body was every T/12: equal arcs in equal times; the marks stay after the first turn.
      parts.push({ name: 'Trace', shape: { kind: 'group' }, noPick: true });
      const ty = p.object === 'carousel' ? 0.255 : 0.02;
      for (let i = 0; i < MARKS; i++) {
        const a = (i / MARKS) * Math.PI * 2;
        const t0 = (i / MARKS) * p.period;
        parts.push({ name: `Trace_${i + 1}`, parent: 'Trace', shape: { kind: 'cylinder', radiusTop: 0.06, radiusBottom: 0.06, height: 0.012, segments: 20 }, position: [Math.cos(a) * R, ty, -Math.sin(a) * R], color: '#ffd166', material: 'emissive', glow: 1, noPick: true, motion: (t) => ({ visible: t >= t0 - 1e-6 }) });
      }
    }

    if (labels) {
      const lines = [
        `R = ${qty(p.radius, 'm', lang, 2)}`,
        `T = ${qty(p.period, 's', lang, 2)}`,
        `ν = 1/T = ${q(s.frequency, 'Hz', lang, 2)}`,
        `v = 2πR/T = ${qty(s.speed, 'm/s', lang, 2)}`,
      ];
      parts.push(text('Readout', lines.join('\n'), [0, mastH + (p.object === 'carousel' ? 0.95 : 0.6), 0], 0.14));
      parts.push(text('Radius_Label', `R = ${qty(p.radius, 'm', lang, 2)}`, [R / 2, ry + 0.16, 0], 0.12, { parent: 'Spin', color: '#9ad1d4' }));
      if (Math.abs(k - 1) > 1e-6) parts.push(text('Scale_Note', tr(L('Масштаб', 'Масштаб', 'Scale'), lang) + ` 1 : ${fmt(1 / k, 2, lang)}`, [0, 0.05, R + 0.75], 0.11, { plate: true }));
    }
    return parts;
  },
};
