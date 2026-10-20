/**
 * `kinematics` (8.1 speed, 8.2 distance–time graphs; physics 7 §6–10): a car
 * runs segments in order along a road with distance markers; the s(t) graph
 * is drawn as it goes (slope = speed, v = 0 is a flat line). A segment may
 * carry an acceleration `a` (m/s², negative brakes): s = v·t + a·t²/2, the
 * speed never goes below 0 (a braking car stops and waits), and a v(t) graph
 * joins the s(t) one.
 */
import type { Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import {
  COLORS, LABELS, MODE, arrowLook, boolOr, clamp, enumOr, fmt, growingSegment, niceStep, numOr, obj, on, qty, text, unit,
  type SimModel,
} from './common.js';

export interface Segment {
  /** Speed at the start of the segment, m/s (≥ 0). */
  v: number;
  /** Duration, s (> 0). */
  t: number;
  /** Acceleration, m/s² (may be negative; absent = 0, uniform motion). */
  a?: number;
}
export type GraphKind = 's' | 'v' | 'both';
export interface KinematicsParams {
  segments: Segment[];
  radar: boolean;
  showGraph: boolean;
  /** Metres between road markers. */
  markEvery: number;
  /** Which graphs: s(t), v(t) or both (default: s for uniform motion, both when any a ≠ 0). */
  graph: GraphKind;
}
export const DEFAULT_KINEMATICS: KinematicsParams = { segments: [{ v: 10, t: 10 }], radar: false, showGraph: true, markEvery: 10, graph: 's' };

/**
 * Lenient: bad segments are dropped. A segment with an `a` but no `v`
 * continues from the previous segment's end speed (0 for the first).
 */
export function parseKinematicsParams(raw: unknown): KinematicsParams {
  const p = obj(raw);
  const segments: Segment[] = [];
  for (const x of Array.isArray(p.segments) ? p.segments : []) {
    const o = obj(x);
    const a = numOr(o.a, -1e4, 1e4, 0);
    const t = numOr(o.t, 1e-6, 1e6, NaN);
    const prev = segments[segments.length - 1];
    const v = o.v === undefined && o.a !== undefined ? (prev ? segmentRun(prev).v1 : 0) : numOr(o.v, 0, 1e5, NaN);
    if (!Number.isFinite(v) || !Number.isFinite(t) || !(t > 0)) continue;
    segments.push(a !== 0 ? { v, t, a } : { v, t });
  }
  const segs = segments.length ? segments : DEFAULT_KINEMATICS.segments;
  const accel = segs.some((g) => (g.a ?? 0) !== 0);
  return {
    segments: segs,
    radar: boolOr(p.radar, DEFAULT_KINEMATICS.radar),
    showGraph: boolOr(p.showGraph, DEFAULT_KINEMATICS.showGraph),
    markEvery: numOr(p.markEvery, 1e-3, 1e7, DEFAULT_KINEMATICS.markEvery),
    graph: enumOr(p.graph, ['s', 'v', 'both'] as const, accel ? 'both' : 's'),
  };
}

/**
 * One segment: s(τ) = v·τ + a·τ²/2 and v(τ) = v + a·τ until a braking car
 * stops (at `stopAt`), then it waits. `v1` = speed at the end, `d` = distance.
 */
export function segmentRun(g: Segment): { stopAt: number; v1: number; d: number; dist: (tau: number) => number; speed: (tau: number) => number } {
  const a = g.a ?? 0;
  const stopAt = a < 0 ? Math.min(g.t, g.v / -a) : g.t;
  const dist = (tau: number) => {
    const x = clamp(tau, 0, stopAt);
    return g.v * x + (a * x * x) / 2;
  };
  const speed = (tau: number) => Math.max(0, g.v + a * clamp(tau, 0, stopAt));
  return { stopAt, v1: speed(g.t), d: dist(g.t), dist, speed };
}

export interface KinematicsState {
  /** Clock clamped to [0, totalTime]. */
  time: number;
  /** Distance travelled, m. */
  distance: number;
  /** Speed now, m/s (the last segment's at the end). */
  speed: number;
  /** Acceleration now, m/s² (0 once a braking car has stopped). */
  acceleration: number;
  /** Index of the current segment. */
  segment: number;
  totalTime: number;
  totalDistance: number;
}

/** Piecewise s(t) = Σ sᵢ (finished segments) + s_k(t − t_k), sᵢ(τ) = vᵢ·τ + aᵢ·τ²/2. */
export function kinematicsState(segments: readonly Segment[], t: number): KinematicsState {
  const runs = segments.map(segmentRun);
  const totalTime = segments.reduce((n, s) => n + s.t, 0);
  const totalDistance = runs.reduce((n, r) => n + r.d, 0);
  const time = clamp(t, 0, totalTime);
  let start = 0;
  let distance = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const r = runs[i];
    if (time <= start + s.t || i === segments.length - 1) {
      const tau = Math.min(s.t, time - start);
      const moving = tau < r.stopAt - 1e-9 || (s.a ?? 0) > 0;
      return { time, distance: distance + r.dist(tau), speed: r.speed(tau), acceleration: moving ? (s.a ?? 0) : 0, segment: i, totalTime, totalDistance };
    }
    start += s.t;
    distance += r.d;
  }
  return { time, distance, speed: 0, acceleration: 0, segment: 0, totalTime, totalDistance };
}

/** Breakpoints (t, s) of the s(t) graph: one per segment boundary. */
export function distanceTimePoints(segments: readonly Segment[]): [number, number][] {
  const pts: [number, number][] = [[0, 0]];
  let t = 0;
  let s = 0;
  for (const g of segments) {
    t += g.t;
    s += segmentRun(g).d;
    pts.push([t, s]);
  }
  return pts;
}

/** The s(t) graph as a polyline: straight for uniform segments, `perCurve` pieces for accelerated ones. */
export function distanceTimeCurve(segments: readonly Segment[], perCurve = 12): [number, number][] {
  const pts: [number, number][] = [[0, 0]];
  let t0 = 0;
  let s0 = 0;
  for (const g of segments) {
    const r = segmentRun(g);
    const n = (g.a ?? 0) !== 0 ? perCurve : 1;
    for (let i = 1; i <= n; i++) {
      const tau = (g.t * i) / n;
      pts.push([t0 + tau, s0 + r.dist(tau)]);
    }
    t0 += g.t;
    s0 += r.d;
  }
  return pts;
}

/** The v(t) graph: (t, v) corners; two points at the same t are a jump between segments. */
export function speedTimePoints(segments: readonly Segment[]): [number, number][] {
  const pts: [number, number][] = [];
  let t0 = 0;
  for (const g of segments) {
    const r = segmentRun(g);
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last[1] - g.v) > 1e-9) pts.push([t0, g.v]);
    if (r.stopAt < g.t - 1e-9) pts.push([t0 + r.stopAt, 0]);
    pts.push([t0 + g.t, r.v1]);
    t0 += g.t;
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
    // The car is drawn larger than its share of the road so it reads at the framing of the whole road.
    const CAR = 1.45;
    parts.push({ name: 'Car', shape: { kind: 'group' }, position: [X0, 0, 0.15], scale: [CAR, CAR, CAR], motion: (t) => ({ position: [carX(t), 0, 0.15] }) });
    parts.push({ name: 'Car_Body', parent: 'Car', shape: { kind: 'box', size: [0.78, 0.17, 0.4], bevel: 0.06 }, position: [0, 0.19, 0], color: '#e63946', material: 'plastic' });
    parts.push({ name: 'Car_Cabin', parent: 'Car', shape: { kind: 'box', size: [0.42, 0.15, 0.36], bevel: 0.05 }, position: [-0.05, 0.33, 0], color: '#e63946', material: 'plastic' });
    parts.push({ name: 'Car_Glass', parent: 'Car', shape: { kind: 'box', size: [0.44, 0.11, 0.37], bevel: 0.04 }, position: [-0.05, 0.335, 0], color: '#9fd3ff', material: 'glass' });
    parts.push({ name: 'Car_Light_1', parent: 'Car', shape: { kind: 'sphere', radius: 0.03, widthSegments: 12 }, position: [0.38, 0.2, 0.13], color: '#fff3c4', material: 'emissive', glow: 1.2, noPick: true });
    parts.push({ name: 'Car_Light_2', parent: 'Car', shape: { kind: 'sphere', radius: 0.03, widthSegments: 12 }, position: [0.38, 0.2, -0.13], color: '#fff3c4', material: 'emissive', glow: 1.2, noPick: true });
    ([[0.24, 0.2], [0.24, -0.2], [-0.24, 0.2], [-0.24, -0.2]] as const).forEach(([wx, wz], i) => {
      const W = `Car_Wheel_${i + 1}`;
      const spin = (t: number): Vec3 => [Math.PI / 2, -(k * st(t).distance) / (wheelR * CAR), 0];
      parts.push({ name: W, parent: 'Car', shape: { kind: 'cylinder', radiusTop: wheelR, radiusBottom: wheelR, height: 0.07, segments: 28 }, position: [wx, wheelR, wz], rotation: spin(0), color: '#1e2229', material: 'rubber', motion: (t) => ({ rotation: spin(t) }) });
      parts.push({ name: `${W}_Hub`, parent: W, shape: { kind: 'box', size: [0.13, 0.075, 0.035] }, color: steel, material: 'metal' });
    });

    const accel = segs.some((g) => (g.a ?? 0) !== 0);
    const runs = segs.map(segmentRun);
    const vmax = Math.max(...segs.map((g, i) => Math.max(g.v, runs[i].v1))) || 1;
    // Brake lights glow while a braking car is still moving.
    if (segs.some((g) => (g.a ?? 0) < 0)) {
      const braking = (t: number) => ({ visible: st(t).acceleration < 0 });
      parts.push({ name: 'Car_Brake_1', parent: 'Car', shape: { kind: 'box', size: [0.02, 0.05, 0.08], bevel: 0.008 }, position: [-0.395, 0.21, 0.13], color: '#ff2d3f', material: 'emissive', glow: 1.6, noPick: true, halo: { color: '#ff4d5e', size: 0.22, strength: 0.6 }, motion: braking });
      parts.push({ name: 'Car_Brake_2', parent: 'Car', shape: { kind: 'box', size: [0.02, 0.05, 0.08], bevel: 0.008 }, position: [-0.395, 0.21, -0.13], color: '#ff2d3f', material: 'emissive', glow: 1.6, noPick: true, halo: { color: '#ff4d5e', size: 0.22, strength: 0.6 }, motion: braking });
    }

    // Velocity arrow: one per segment (crisp head), shown while that segment runs;
    // on an accelerated segment its length follows the speed.
    if (on(modes, 'vectors')) {
      parts.push({ name: 'Arrow_Velocity', shape: { kind: 'group' }, position: [carX(0) + 0.2, 1.05, 0.15], motion: (t) => ({ position: [carX(t) + 0.2, 1.05, 0.15] }) });
      segs.forEach((s, i) => {
        const a = s.a ?? 0;
        if (s.v <= 0 && a <= 0) return;
        const full = 0.25 + 0.95;
        const len = a === 0 ? 0.25 + 0.95 * (s.v / vmax) : full;
        const show = (t: number) => {
          const now = st(t);
          if (a === 0) return { visible: now.segment === i };
          const k = now.speed / vmax;
          return { visible: now.segment === i && k > 0.01, scale: [Math.max(1e-3, (0.25 + 0.95 * k) / full), 1, 1] as Vec3 };
        };
        parts.push({ name: `Arrow_Velocity_${i + 1}`, parent: 'Arrow_Velocity', shape: { kind: 'arrow', from: [0, 0, 0], vector: [len, 0, 0], radius: 0.028 }, color: COLORS.velocity, ...arrowLook, motion: show });
        if (labels && a === 0) parts.push(text(`Arrow_Velocity_${i + 1}_Label`, `v = ${qty(s.v, 'm/s', lang)}`, [len / 2, 0.22, 0], 0.14, { parent: 'Arrow_Velocity', color: COLORS.velocity, motion: show }));
        if (labels && a !== 0) parts.push(text(`Arrow_Velocity_${i + 1}_Label`, 'v', [0.12, 0.2, 0], 0.15, { parent: 'Arrow_Velocity', color: COLORS.velocity, bold: true, motion: (t) => ({ visible: st(t).segment === i && st(t).speed > 0.01 * vmax }) }));
      });
      // Acceleration: forward while speeding up, backward while braking, none at a steady speed.
      if (accel) {
        const amax = Math.max(...segs.map((g) => Math.abs(g.a ?? 0))) || 1;
        parts.push({ name: 'Arrow_Acceleration', shape: { kind: 'group' }, position: [carX(0), 0.8, 0.15], motion: (t) => ({ position: [carX(t), 0.8, 0.15] }) });
        segs.forEach((s, i) => {
          const a = s.a ?? 0;
          if (a === 0) return;
          const len = (0.25 + 0.6 * (Math.abs(a) / amax)) * Math.sign(a);
          const show = (t: number) => ({ visible: st(t).segment === i && st(t).acceleration !== 0 });
          parts.push({ name: `Arrow_Acceleration_${i + 1}`, parent: 'Arrow_Acceleration', shape: { kind: 'arrow', from: [a > 0 ? 0.25 : -0.25, 0, 0], vector: [len, 0, 0], radius: 0.024 }, color: ACCEL_COLOR, ...arrowLook, motion: show });
          if (labels) parts.push(text(`Arrow_Acceleration_${i + 1}_Label`, `a = ${qty(a, 'm/s²', lang)}`, [(a > 0 ? 0.25 : -0.25) + len / 2, -0.17, 0], 0.13, { parent: 'Arrow_Acceleration', color: ACCEL_COLOR, motion: show }));
        });
      }
    }
    // Live readout of v and a above the car (accelerated runs; uniform ones show v on the arrow).
    const times = accel ? readoutTimes(segs) : [];
    const readout = (i: number) => {
      const now = st(times[i]);
      return `v = ${qty(now.speed, 'm/s', lang)}\na = ${qty(now.acceleration, 'm/s²', lang)}`;
    };
    if (labels && accel) {
      parts.push({ name: 'Readout', shape: { kind: 'group' }, noPick: true, position: [carX(0), 1.5, 0.15], motion: (t) => ({ position: [carX(t), 1.5, 0.15] }) });
      times.forEach((t0, i) => {
        const t1 = times[i + 1] ?? Infinity;
        parts.push(text(`Readout_${i + 1}`, readout(i), [0, 0, 0], 0.13, { parent: 'Readout', color: '#f8f9fa', motion: (t) => ({ visible: (i === 0 || t >= t0) && t < t1 }) }));
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
      if (!accel) {
        segs.forEach((s, i) => {
          parts.push(text(`Radar_Display_${i + 1}`, qty(s.v, 'm/s', lang), [0, 1.33, 0], 0.17, { parent: 'Radar', color: '#80ffdb', bold: true, motion: (t) => ({ visible: st(t).segment === i }) }));
        });
      } else {
        // The radar measures the speed now: one display per readout window.
        times.forEach((t0, i) => {
          const t1 = times[i + 1] ?? Infinity;
          parts.push(text(`Radar_Display_${i + 1}`, qty(st(t0).speed, 'm/s', lang), [0, 1.33, 0], 0.17, { parent: 'Radar', color: '#80ffdb', bold: true, motion: (t) => ({ visible: (i === 0 || t >= t0) && t < t1 }) }));
        });
      }
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

    // Distance–time (and speed–time) graphs on panels behind the road.
    if (p.showGraph && on(modes, 'graph')) {
      const both = p.graph === 'both';
      const W = both ? 3.1 : 5.4;
      if (p.graph !== 'v') {
        const pts = distanceTimeCurve(segs);
        parts.push(...graphPanel({ prefix: 'Graph', yKey: 'S', yTitle: `s, ${unit('m', lang)}`, gx: both ? -3.55 : -W / 2, W, T, yMax: S > 0 ? S : 1, pts, at: (t) => [st(t).time, st(t).distance], lang }));
      }
      if (p.graph !== 's') {
        const pts = speedTimePoints(segs);
        parts.push(...graphPanel({ prefix: 'GraphV', yKey: 'V', yTitle: `v, ${unit('m/s', lang)}`, gx: both ? 0.55 : -W / 2, W, T, yMax: vmax, pts, at: (t) => [st(t).time, st(t).speed], lang, color: '#80ffdb' }));
      }
    }
    return parts;
  },
};

const ACCEL_COLOR = '#f15bb5';

/** Readout windows: about every 0.5 s of model time (≤ 30), plus every segment start. */
function readoutTimes(segs: readonly Segment[]): number[] {
  const T = segs.reduce((n, g) => n + g.t, 0);
  const n = Math.max(1, Math.min(30, Math.ceil(T / 0.5)));
  const set = new Set<number>(Array.from({ length: n }, (_, i) => +((i * T) / n).toFixed(9)));
  let t0 = 0;
  for (const g of segs) {
    set.add(+t0.toFixed(9));
    const r = segmentRun(g);
    // The moment a braking car stops reads v = 0 exactly.
    if (r.stopAt < g.t - 1e-9) set.add(+(t0 + r.stopAt).toFixed(9));
    t0 += g.t;
  }
  return [...set].filter((t) => t < T || T === 0).sort((a, b) => a - b);
}

interface GraphOpts {
  prefix: string;
  /** Letter of the vertical axis in part names (`S` → `Graph_Axis_S`). */
  yKey: string;
  yTitle: string;
  gx: number;
  W: number;
  T: number;
  yMax: number;
  /** Polyline of (t, y); two points at the same t are a vertical jump. */
  pts: [number, number][];
  /** Current (t, y) of the moving point. */
  at: (t: number) => [number, number];
  lang: Parameters<typeof unit>[1];
  color?: string;
}

/** A graph panel: axes with nice ticks, the line drawn as time passes, a moving point. */
function graphPanel(o: GraphOpts): Part[] {
  const { prefix: G, yKey, W, T, yMax, lang } = o;
  const H = 2.2;
  const gy = 0.95;
  const gz = -1.35;
  const X = (t: number) => (T > 0 ? (t / T) * W : 0);
  const Y = (y: number) => (y / yMax) * H;
  const A = `${G}_Axes`;
  const parts: Part[] = [
    { name: G, shape: { kind: 'group' }, position: [o.gx, gy, gz], noPick: true },
    { name: `${G}_Panel`, parent: G, shape: { kind: 'box', size: [W + 0.9, H + 0.75, 0.04], bevel: 0.02 }, position: [W / 2 - 0.1, H / 2 + 0.05, -0.05], color: '#14202c', opacity: 0.82, container: true, noPick: true },
    { name: A, parent: G, shape: { kind: 'group' } },
    { name: `${G}_Axis_T`, parent: A, shape: { kind: 'arrow', from: [0, 0, 0], vector: [W + 0.3, 0, 0], radius: 0.014 }, color: COLORS.axis, material: 'plastic' },
    { name: `${G}_Axis_${yKey}`, parent: A, shape: { kind: 'arrow', from: [0, 0, 0], vector: [0, H + 0.3, 0], radius: 0.014 }, color: COLORS.axis, material: 'plastic' },
  ];
  const tStep = niceStep(T, W < 4 ? 4 : 5);
  for (let t = tStep, i = 1; t <= T + 1e-9; t += tStep, i++) {
    parts.push({ name: `${G}_Tick_T${i}`, parent: A, shape: { kind: 'box', size: [0.012, 0.08, 0.01] }, position: [X(t), 0, 0], color: COLORS.axis });
    parts.push({ name: `${G}_Grid_T${i}`, parent: A, shape: { kind: 'box', size: [0.006, H, 0.004] }, position: [X(t), H / 2, -0.01], color: COLORS.axis, opacity: 0.18, container: true, noPick: true });
    parts.push(text(`${G}_Tick_T${i}_Label`, fmt(t, 2, lang), [X(t), -0.17, 0], 0.13, { parent: A, plate: false, billboard: false }));
  }
  const yStep = niceStep(yMax, 4);
  for (let y = yStep, i = 1; y <= yMax + 1e-9; y += yStep, i++) {
    parts.push({ name: `${G}_Tick_${yKey}${i}`, parent: A, shape: { kind: 'box', size: [0.08, 0.012, 0.01] }, position: [0, Y(y), 0], color: COLORS.axis });
    parts.push({ name: `${G}_Grid_${yKey}${i}`, parent: A, shape: { kind: 'box', size: [W, 0.006, 0.004] }, position: [W / 2, Y(y), -0.01], color: COLORS.axis, opacity: 0.18, container: true, noPick: true });
    parts.push(text(`${G}_Tick_${yKey}${i}_Label`, fmt(y, 2, lang), [-0.1, Y(y), 0], 0.13, { parent: A, align: 'right', plate: false, billboard: false }));
  }
  parts.push(text(`${G}_Title_T`, `t, ${unit('s', lang)}`, [W + 0.35, -0.17, 0], 0.15, { parent: A, plate: false, billboard: false, bold: true }));
  parts.push(text(`${G}_Title_${yKey}`, o.yTitle, [0, H + 0.45, 0], 0.15, { parent: A, plate: false, billboard: false, bold: true }));
  // One straight piece per pair of points, each drawn while its time passes.
  parts.push({ name: `${G}_Line`, parent: G, shape: { kind: 'group' }, position: [0, 0, 0.02] });
  o.pts.slice(1).forEach(([t1, y1], i) => {
    const [t0, y0] = o.pts[i];
    if (Math.abs(t1 - t0) < 1e-12 && Math.abs(y1 - y0) < 1e-12) return;
    const share = t1 - t0 > 1e-12 ? (t: number) => (t - t0) / (t1 - t0) : (t: number) => (t >= t0 ? 1 : 0);
    parts.push(...growingSegment(`${G}_Line_${i + 1}`, `${G}_Line`, [X(t0), Y(y0), 0], [X(t1), Y(y1), 0], 0.024, o.color ?? '#ffd166', share));
  });
  parts.push({
    name: `${G}_Point`, parent: G, shape: { kind: 'sphere', radius: 0.06, widthSegments: 20 }, color: '#ff6b6b', material: 'emissive', glow: 1.1,
    halo: { color: '#ff8787', size: 0.35, strength: 0.5 },
    motion: (t) => {
      const [tt, y] = o.at(t);
      return { position: [X(tt), Y(y), 0.04] };
    },
  });
  return parts;
}
