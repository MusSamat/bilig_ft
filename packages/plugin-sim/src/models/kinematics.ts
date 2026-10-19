/**
 * `kinematics` (8.1 speed, 8.2 distance–time graphs): a car runs segments of
 * uniform motion in order along a road with distance markers; the s(t) graph
 * is drawn as it goes (slope = speed, v = 0 is a flat line).
 */
import type { Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import {
  COLORS, LABELS, MODE, arrowLook, boolOr, clamp, fmt, growingSegment, listOf, niceStep, numOr, obj, on, qty, text, unit,
  type SimModel,
} from './common.js';

export interface Segment {
  /** Speed, m/s (≥ 0). */
  v: number;
  /** Duration, s (> 0). */
  t: number;
}
export interface KinematicsParams {
  segments: Segment[];
  radar: boolean;
  showGraph: boolean;
  /** Metres between road markers. */
  markEvery: number;
}
export const DEFAULT_KINEMATICS: KinematicsParams = { segments: [{ v: 10, t: 10 }], radar: false, showGraph: true, markEvery: 10 };

export function parseKinematicsParams(raw: unknown): KinematicsParams {
  const p = obj(raw);
  const segments = listOf(p.segments, (x) => {
    const o = obj(x);
    const v = numOr(o.v, 0, 1e5, NaN);
    const t = numOr(o.t, 1e-6, 1e6, NaN);
    return Number.isFinite(v) && Number.isFinite(t) && t > 0 ? { v, t } : null;
  });
  return {
    segments: segments.length ? segments : DEFAULT_KINEMATICS.segments,
    radar: boolOr(p.radar, DEFAULT_KINEMATICS.radar),
    showGraph: boolOr(p.showGraph, DEFAULT_KINEMATICS.showGraph),
    markEvery: numOr(p.markEvery, 1e-3, 1e7, DEFAULT_KINEMATICS.markEvery),
  };
}

export interface KinematicsState {
  /** Clock clamped to [0, totalTime]. */
  time: number;
  /** Distance travelled, m. */
  distance: number;
  /** Speed now, m/s (the last segment's at the end). */
  speed: number;
  /** Index of the current segment. */
  segment: number;
  totalTime: number;
  totalDistance: number;
}

/** Piecewise s(t) = Σ vᵢ·tᵢ (finished segments) + v_k·(t − t_k). */
export function kinematicsState(segments: readonly Segment[], t: number): KinematicsState {
  const totalTime = segments.reduce((n, s) => n + s.t, 0);
  const totalDistance = segments.reduce((n, s) => n + s.v * s.t, 0);
  const time = clamp(t, 0, totalTime);
  let start = 0;
  let distance = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (time <= start + s.t || i === segments.length - 1) {
      return { time, distance: distance + s.v * Math.min(s.t, time - start), speed: s.v, segment: i, totalTime, totalDistance };
    }
    start += s.t;
    distance += s.v * s.t;
  }
  return { time, distance, speed: 0, segment: 0, totalTime, totalDistance };
}

/** Breakpoints (t, s) of the s(t) graph: one per segment boundary. */
export function distanceTimePoints(segments: readonly Segment[]): [number, number][] {
  const pts: [number, number][] = [[0, 0]];
  let t = 0;
  let s = 0;
  for (const g of segments) {
    t += g.t;
    s += g.v * g.t;
    pts.push([t, s]);
  }
  return pts;
}

/** Road markers: every `markEvery` m, coarsened to at most 40 markers. Returns the spacing used and the count. */
export function markerSpacing(totalDistance: number, markEvery: number): { spacing: number; count: number } {
  const n = Math.floor(totalDistance / markEvery + 1e-9);
  const k = Math.max(1, Math.ceil(n / 40));
  const spacing = markEvery * k;
  return { spacing, count: Math.floor(totalDistance / spacing + 1e-9) };
}

/** The whole run lasts at most this long on the free clock (long trips play as a time-lapse). */
const MAX_PLAY = 12;
const PAUSE = 2;
const ROAD = 7.5;
const X0 = -ROAD / 2;

export const kinematics: SimModel = {
  id: 'kinematics',
  modes: [MODE.vectors(), MODE.trace(), MODE.graph(true), LABELS],
  clock(raw, pb, free) {
    const T = kinematicsState(parseKinematicsParams(raw).segments, 0).totalTime;
    if (pb) return pb.fraction * T;
    const rate = Math.max(1, T / MAX_PLAY);
    const dur = T / rate;
    return Math.min(free % (dur + PAUSE), dur) * rate;
  },
  build(raw, { modes, lang = 'ru' }) {
    const p = parseKinematicsParams(raw);
    const segs = p.segments;
    const st = (t: number) => kinematicsState(segs, t);
    const { totalTime: T, totalDistance: S } = st(0);
    const { spacing, count } = markerSpacing(S, p.markEvery);
    const k = S > 0 ? ROAD / S : ROAD / (p.markEvery * 5);
    const carX = (t: number) => X0 + k * st(t).distance;
    const labels = on(modes, 'labels');
    const steel = COLORS.steel;
    const parts: Part[] = [
      // Asphalt with a dashed centre line, start and finish lines.
      { name: 'Road', shape: { kind: 'box', size: [ROAD + 1.4, 0.05, 1.1], bevel: 0.015 }, position: [0, -0.025, 0], color: '#3a3f47', material: 'matte' },
      { name: 'Road_Kerb_1', parent: 'Road', shape: { kind: 'box', size: [ROAD + 1.4, 0.06, 0.06], bevel: 0.01 }, position: [0, 0.01, 0.56], color: '#d9dde3', material: 'matte' },
      { name: 'Road_Kerb_2', parent: 'Road', shape: { kind: 'box', size: [ROAD + 1.4, 0.06, 0.06], bevel: 0.01 }, position: [0, 0.01, -0.56], color: '#d9dde3', material: 'matte' },
      { name: 'Road_Start', parent: 'Road', shape: { kind: 'box', size: [0.05, 0.004, 1.02] }, position: [X0, 0.026, 0], color: '#f8f9fa', material: 'matte' },
      { name: 'Road_Finish', parent: 'Road', shape: { kind: 'box', size: [0.05, 0.004, 1.02] }, position: [X0 + k * S, 0.026, 0], color: '#f8f9fa', material: 'matte' },
    ];
    for (let x = -ROAD / 2 - 0.5, i = 1; x < ROAD / 2 + 0.5; x += 0.42, i++) {
      parts.push({ name: `Road_Dash_${i}`, parent: 'Road', shape: { kind: 'box', size: [0.22, 0.004, 0.03] }, position: [x + 0.11, 0.026, 0], color: '#f1f3f5', material: 'matte', noPick: true });
    }
    // Distance posts beside the road.
    for (let i = 0; i <= count; i++) {
      const x = X0 + k * i * spacing;
      const N = `Marker_${i}`;
      parts.push({ name: N, shape: { kind: 'cylinder', radiusTop: 0.035, radiusBottom: 0.04, height: 0.36, segments: 16 }, position: [x, 0.18, -0.7], color: '#f8f9fa', material: 'plastic' });
      parts.push({ name: `${N}_Band`, parent: N, shape: { kind: 'cylinder', radiusTop: 0.037, radiusBottom: 0.037, height: 0.07, segments: 16 }, position: [0, 0.12, 0], color: '#e63946', material: 'plastic' });
      // Every marker gets a distance label while they fit; otherwise every other one.
      if (labels && (count <= 14 || i % 2 === 0)) parts.push(text(`${N}_Label`, qty(i * spacing, 'm', lang, 1), [x, 0.52, -0.7], 0.13));
    }
    // The car: body, cabin, glass, wheels that roll with the distance.
    const wheelR = 0.1;
    parts.push({ name: 'Car', shape: { kind: 'group' }, position: [X0, 0, 0.15], motion: (t) => ({ position: [carX(t), 0, 0.15] }) });
    parts.push({ name: 'Car_Body', parent: 'Car', shape: { kind: 'box', size: [0.78, 0.17, 0.4], bevel: 0.06 }, position: [0, 0.19, 0], color: '#e63946', material: 'plastic' });
    parts.push({ name: 'Car_Cabin', parent: 'Car', shape: { kind: 'box', size: [0.42, 0.15, 0.36], bevel: 0.05 }, position: [-0.05, 0.33, 0], color: '#e63946', material: 'plastic' });
    parts.push({ name: 'Car_Glass', parent: 'Car', shape: { kind: 'box', size: [0.44, 0.11, 0.37], bevel: 0.04 }, position: [-0.05, 0.335, 0], color: '#9fd3ff', material: 'glass' });
    parts.push({ name: 'Car_Light_1', parent: 'Car', shape: { kind: 'sphere', radius: 0.03, widthSegments: 12 }, position: [0.38, 0.2, 0.13], color: '#fff3c4', material: 'emissive', glow: 1.2, noPick: true });
    parts.push({ name: 'Car_Light_2', parent: 'Car', shape: { kind: 'sphere', radius: 0.03, widthSegments: 12 }, position: [0.38, 0.2, -0.13], color: '#fff3c4', material: 'emissive', glow: 1.2, noPick: true });
    ([[0.24, 0.2], [0.24, -0.2], [-0.24, 0.2], [-0.24, -0.2]] as const).forEach(([wx, wz], i) => {
      const W = `Car_Wheel_${i + 1}`;
      const spin = (t: number): Vec3 => [Math.PI / 2, -(k * st(t).distance) / wheelR, 0];
      parts.push({ name: W, parent: 'Car', shape: { kind: 'cylinder', radiusTop: wheelR, radiusBottom: wheelR, height: 0.07, segments: 28 }, position: [wx, wheelR, wz], rotation: spin(0), color: '#1e2229', material: 'rubber', motion: (t) => ({ rotation: spin(t) }) });
      parts.push({ name: `${W}_Hub`, parent: W, shape: { kind: 'box', size: [0.13, 0.075, 0.035] }, color: steel, material: 'metal' });
    });

    // Velocity arrow: one per segment (crisp head), shown while that segment runs.
    if (on(modes, 'vectors')) {
      const vmax = Math.max(...segs.map((s) => s.v)) || 1;
      parts.push({ name: 'Arrow_Velocity', shape: { kind: 'group' }, motion: (t) => ({ position: [carX(t) + 0.2, 0.85, 0.15] }) });
      segs.forEach((s, i) => {
        if (s.v <= 0) return;
        const len = 0.25 + 0.95 * (s.v / vmax);
        const show = (t: number) => ({ visible: st(t).segment === i });
        parts.push({ name: `Arrow_Velocity_${i + 1}`, parent: 'Arrow_Velocity', shape: { kind: 'arrow', from: [0, 0, 0], vector: [len, 0, 0], radius: 0.028 }, color: COLORS.velocity, ...arrowLook, motion: show });
        if (labels) parts.push(text(`Arrow_Velocity_${i + 1}_Label`, `v = ${qty(s.v, 'm/s', lang)}`, [len / 2, 0.22, 0], 0.14, { parent: 'Arrow_Velocity', color: COLORS.velocity, motion: show }));
      });
    }
    // Car positions every second (sparser for long trips: at most 60 marks).
    if (on(modes, 'trace')) {
      const step = Math.max(1, Math.ceil(T / 60));
      for (let s = step, i = 1; s <= T + 1e-9; s += step, i++) {
        const x = X0 + k * st(s).distance;
        parts.push({ name: `Trace_${i}`, shape: { kind: 'cylinder', radiusTop: 0.05, radiusBottom: 0.05, height: 0.012, segments: 20 }, position: [x, 0.03, 0.42], color: '#ffd166', material: 'emissive', glow: 1, noPick: true, motion: (t) => ({ visible: t >= s - 1e-6 }) });
      }
    }
    // Speed camera beside the road: its display shows the current segment's speed.
    if (p.radar) {
      parts.push({ name: 'Radar', shape: { kind: 'group' }, position: [ROAD / 2 - 0.9, 0, -0.85] });
      parts.push({ name: 'Radar_Pole', parent: 'Radar', shape: { kind: 'cylinder', radiusTop: 0.025, radiusBottom: 0.03, height: 1, segments: 16 }, position: [0, 0.5, 0], color: steel, material: 'brushed' });
      parts.push({ name: 'Radar_Box', parent: 'Radar', shape: { kind: 'box', size: [0.26, 0.2, 0.2], bevel: 0.03 }, position: [0, 1.05, 0], rotation: [0, 0.5, 0], color: '#f1f3f5', material: 'plastic' });
      parts.push({ name: 'Radar_Lens', parent: 'Radar', shape: { kind: 'cylinder', radiusTop: 0.055, radiusBottom: 0.055, height: 0.03, segments: 24 }, position: [-0.07, 1.05, 0.1], rotation: [Math.PI / 2, 0, 0.5], color: '#1d2b3a', material: 'glass' });
      segs.forEach((s, i) => {
        parts.push(text(`Radar_Display_${i + 1}`, qty(s.v, 'm/s', lang), [0, 1.33, 0], 0.17, { parent: 'Radar', color: '#80ffdb', bold: true, motion: (t) => ({ visible: st(t).segment === i }) }));
      });
    }
    // Stopwatch: the hand makes one turn per minute of model time.
    parts.push({ name: 'Stopwatch', shape: { kind: 'group' }, position: [ROAD / 2 + 0.55, 0.62, 0.75] });
    parts.push({ name: 'Stopwatch_Case', parent: 'Stopwatch', shape: { kind: 'cylinder', radiusTop: 0.3, radiusBottom: 0.3, height: 0.08, segments: 48 }, rotation: [Math.PI / 2, 0, 0], color: steel, material: 'metal' });
    parts.push({ name: 'Stopwatch_Face', parent: 'Stopwatch', shape: { kind: 'cylinder', radiusTop: 0.26, radiusBottom: 0.26, height: 0.01, segments: 48 }, position: [0, 0, 0.042], rotation: [Math.PI / 2, 0, 0], color: '#f8f9fa', material: 'matte' });
    parts.push({ name: 'Stopwatch_Crown', parent: 'Stopwatch', shape: { kind: 'cylinder', radiusTop: 0.04, radiusBottom: 0.04, height: 0.08, segments: 16 }, position: [0, 0.34, 0], color: steel, material: 'metal' });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      parts.push({ name: `Stopwatch_Tick_${i + 1}`, parent: 'Stopwatch', shape: { kind: 'box', size: [0.012, i % 3 === 0 ? 0.06 : 0.035, 0.006] }, position: [Math.sin(a) * 0.215, Math.cos(a) * 0.215, 0.05], rotation: [0, 0, -a], color: '#212529', noPick: true });
    }
    parts.push({ name: 'Stopwatch_HandAt', parent: 'Stopwatch', shape: { kind: 'group' }, position: [0, 0, 0.056], noPick: true, motion: (t) => ({ rotation: [0, 0, -(st(t).time / 60) * Math.PI * 2] }) });
    parts.push({ name: 'Stopwatch_Hand', parent: 'Stopwatch_HandAt', shape: { kind: 'box', size: [0.012, 0.22, 0.006] }, position: [0, 0.09, 0], color: '#e63946', material: 'plastic' });
    if (labels) {
      // One readout per whole second would be too many textures: show the total instead.
      parts.push(text('Stopwatch_Label', `t = ${qty(T, 's', lang, 1)}`, [0, -0.45, 0], 0.14, { parent: 'Stopwatch' }));
    }

    // Distance–time graph on a panel behind the road.
    if (p.showGraph && on(modes, 'graph')) {
      const W = 5.4;
      const H = 2.2;
      const gx = -W / 2;
      const gy = 0.95;
      const gz = -1.35;
      const sMax = S > 0 ? S : 1;
      const X = (t: number) => (T > 0 ? (t / T) * W : 0);
      const Y = (s: number) => (s / sMax) * H;
      parts.push({ name: 'Graph', shape: { kind: 'group' }, position: [gx, gy, gz], noPick: true });
      parts.push({ name: 'Graph_Panel', parent: 'Graph', shape: { kind: 'box', size: [W + 0.9, H + 0.75, 0.04], bevel: 0.02 }, position: [W / 2 - 0.1, H / 2 + 0.05, -0.05], color: '#14202c', opacity: 0.82, container: true, noPick: true });
      parts.push({ name: 'Graph_Axes', parent: 'Graph', shape: { kind: 'group' } });
      parts.push({ name: 'Graph_Axis_T', parent: 'Graph_Axes', shape: { kind: 'arrow', from: [0, 0, 0], vector: [W + 0.3, 0, 0], radius: 0.014 }, color: COLORS.axis, material: 'plastic' });
      parts.push({ name: 'Graph_Axis_S', parent: 'Graph_Axes', shape: { kind: 'arrow', from: [0, 0, 0], vector: [0, H + 0.3, 0], radius: 0.014 }, color: COLORS.axis, material: 'plastic' });
      const tStep = niceStep(T, 5);
      for (let t = tStep, i = 1; t <= T + 1e-9; t += tStep, i++) {
        parts.push({ name: `Graph_Tick_T${i}`, parent: 'Graph_Axes', shape: { kind: 'box', size: [0.012, 0.08, 0.01] }, position: [X(t), 0, 0], color: COLORS.axis });
        parts.push({ name: `Graph_Grid_T${i}`, parent: 'Graph_Axes', shape: { kind: 'box', size: [0.006, H, 0.004] }, position: [X(t), H / 2, -0.01], color: COLORS.axis, opacity: 0.18, container: true, noPick: true });
        parts.push(text(`Graph_Tick_T${i}_Label`, fmt(t, 2, lang), [X(t), -0.17, 0], 0.13, { parent: 'Graph_Axes', plate: false, billboard: false }));
      }
      const sStep = niceStep(sMax, 4);
      for (let s = sStep, i = 1; s <= sMax + 1e-9; s += sStep, i++) {
        parts.push({ name: `Graph_Tick_S${i}`, parent: 'Graph_Axes', shape: { kind: 'box', size: [0.08, 0.012, 0.01] }, position: [0, Y(s), 0], color: COLORS.axis });
        parts.push({ name: `Graph_Grid_S${i}`, parent: 'Graph_Axes', shape: { kind: 'box', size: [W, 0.006, 0.004] }, position: [W / 2, Y(s), -0.01], color: COLORS.axis, opacity: 0.18, container: true, noPick: true });
        parts.push(text(`Graph_Tick_S${i}_Label`, fmt(s, 2, lang), [-0.1, Y(s), 0], 0.13, { parent: 'Graph_Axes', align: 'right', plate: false, billboard: false }));
      }
      parts.push(text('Graph_Title_T', `t, ${unit('s', lang)}`, [W + 0.35, -0.17, 0], 0.15, { parent: 'Graph_Axes', plate: false, billboard: false, bold: true }));
      parts.push(text('Graph_Title_S', `s, ${unit('m', lang)}`, [0, H + 0.45, 0], 0.15, { parent: 'Graph_Axes', plate: false, billboard: false, bold: true }));
      // s(t) is piecewise linear: one straight piece per segment, drawn as time passes.
      parts.push({ name: 'Graph_Line', parent: 'Graph', shape: { kind: 'group' }, position: [0, 0, 0.02] });
      const pts = distanceTimePoints(segs);
      pts.slice(1).forEach(([t1, s1], i) => {
        const [t0, s0] = pts[i];
        parts.push(...growingSegment(`Graph_Line_${i + 1}`, 'Graph_Line', [X(t0), Y(s0), 0], [X(t1), Y(s1), 0], 0.024, '#ffd166', (t) => (t - t0) / (t1 - t0)));
      });
      parts.push({
        name: 'Graph_Point', parent: 'Graph', shape: { kind: 'sphere', radius: 0.06, widthSegments: 20 }, color: '#ff6b6b', material: 'emissive', glow: 1.1,
        halo: { color: '#ff8787', size: 0.35, strength: 0.5 },
        motion: (t) => {
          const s = st(t);
          return { position: [X(s.time), Y(s.distance), 0.04] };
        },
      });
    }
    return parts;
  },
};
