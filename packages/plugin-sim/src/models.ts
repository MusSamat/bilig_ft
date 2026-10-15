/**
 * Simulation models: parameters → named parts (content convention: nodes are
 * named by part — `Bob`, `String`, `Block`, `Lamp`, `Planet_<name>` …) and a
 * model clock derived from the process playback (or a free clock).
 */
import type { Localized, Vec3 } from '@bilig/content-model';
import type { ModeDef, ModeState, PlayerView } from '@bilig/scene-core';
import type { Part } from '@bilig/scene-kit';
import { add, len3, norm3, scale3, sub } from '@bilig/scene-kit';
import { Euler, Quaternion, Vector3 } from 'three';
import {
  inclineState, moonState, parseCircuitParams, parseInclineParams, parsePendulumParams, pendulumState,
  type CircuitParams, type InclineParams, type PendulumParams,
} from './physics.js';

export const SIM_MODELS = ['pendulum', 'inclined-plane', 'dc-circuit', 'orbits', 'moon-phases', 'seasons'] as const;
export type SimModelId = (typeof SIM_MODELS)[number];

const L = (ky: string, ru: string, en: string): Localized => ({ ky, ru, en });
const M = {
  vectors: { id: 'vectors', label: L('Векторлор', 'Векторы', 'Vectors') },
  trace: { id: 'trace', label: L('Из', 'След', 'Trace') },
  energy: { id: 'energy', label: L('Энергия', 'Энергия', 'Energy') },
  schematic: { id: 'schematic', label: L('Схема', 'Схема', 'Schematic') },
  electrons: { id: 'electrons', label: L('Электрондор', 'Электроны', 'Electrons') },
  orbits: { id: 'orbits', label: L('Орбиталар', 'Орбиты', 'Orbits'), default: true },
  earthView: { id: 'earth-view', label: L('Жерден көрүнүш', 'Вид с Земли', 'View from Earth') },
  sunRays: { id: 'sun-rays', label: L('Күн нурлары', 'Солнечные лучи', 'Sun rays') },
  trueScale: { id: 'true-scale', label: L('Чыныгы масштаб', 'Истинный масштаб', 'True scale') },
} satisfies Record<string, ModeDef>;

export interface BuildContext {
  modes: ModeState;
  /** Process playback when a process runs. */
  playback?: Pick<PlayerView, 'time' | 'fraction' | 'stepIndex' | 'stepFraction'>;
}

export interface SimModel {
  id: SimModelId;
  modes: ModeDef[];
  /** Parts for the scene (motion closures receive the model clock). */
  build(raw: Record<string, unknown>, ctx: BuildContext): Part[];
  /** Model clock from the playback, or from the free clock (seconds). */
  clock(raw: Record<string, unknown>, playback: BuildContext['playback'], free: number): number;
  /** Uses a directional light from the Sun at this position. */
  sunAt?(raw: Record<string, unknown>): Vec3;
}

const on = (modes: ModeState, id: string) => modes[id] === true;

// ---------------------------------------------------------------------------
// Pendulum — pivot at y = L/2, real length (scene units = m).
// ---------------------------------------------------------------------------

const TRACE_N = 18;

function bobPos(p: PendulumParams, theta: number): Vec3 {
  const pivotY = p.length / 2;
  return [Math.sin(theta) * p.length, pivotY - Math.cos(theta) * p.length, 0];
}

const pendulum: SimModel = {
  id: 'pendulum',
  modes: [M.vectors, M.trace, M.energy],
  clock: (_raw, pb, free) => pb?.time ?? free,
  build(raw, { modes }) {
    const p = parsePendulumParams(raw);
    const L0 = p.length;
    const pivotY = L0 / 2;
    const bobR = Math.max(0.03, 0.05 + 0.1 * Math.cbrt(p.mass) * Math.min(1, L0));
    const amp = Math.abs(p.amplitudeDeg) * (Math.PI / 180);
    const theta = (t: number) => pendulumState(p, t).theta;
    const parts: Part[] = [
      { name: 'Pivot', shape: { kind: 'box', size: [L0 * 0.4, L0 * 0.03, L0 * 0.12] }, position: [0, pivotY, 0], color: '#8892a0', metalness: 0.6 },
      { name: 'Arm', shape: { kind: 'group' }, position: [0, pivotY, 0], noPick: true, motion: (t) => ({ rotation: [0, 0, theta(t)] }) },
      { name: 'String', parent: 'Arm', shape: { kind: 'cylinder', radiusTop: L0 * 0.006, radiusBottom: L0 * 0.006, height: L0, segments: 8 }, position: [0, -L0 / 2, 0], color: '#d7dde5' },
      { name: 'Bob', parent: 'Arm', shape: { kind: 'sphere', radius: bobR }, position: [0, -L0, 0], color: '#f2a65a', metalness: 0.7, roughness: 0.25 },
      { name: 'Marker_Equilibrium', shape: { kind: 'tube', from: [0, pivotY, 0], to: [0, pivotY - L0 - bobR * 1.5, 0], radius: L0 * 0.003 }, color: '#9ad1d4', opacity: 0.5, container: true },
      // Arc symmetric around the lowest point: torus arcs start at +x, so rotate by −90° − amplitude.
      { name: 'Arc_Amplitude', shape: { kind: 'torus', radius: L0, tube: L0 * 0.004, arc: 2 * amp }, position: [0, pivotY, 0], rotation: [0, 0, -Math.PI / 2 - amp], color: '#ffd166', opacity: 0.7, container: true },
    ];
    if (on(modes, 'vectors')) {
      const g = L0 * 0.25;
      // Motion lives on wrapper groups; arrow geometry stays static inside them.
      parts.push({ name: 'GravityAt', shape: { kind: 'group' }, noPick: true, motion: (t) => ({ position: bobPos(p, theta(t)) }) });
      parts.push({ name: 'Vector_Gravity', parent: 'GravityAt', shape: { kind: 'arrow', from: [0, 0, 0], vector: [0, -g, 0], radius: L0 * 0.008 }, color: '#ef476f' });
      parts.push({
        name: 'VelocityAt', shape: { kind: 'group' }, noPick: true,
        motion: (t) => {
          const s = pendulumState(p, t);
          const vmax = Math.sqrt(2 * p.g * L0 * (1 - Math.cos(amp))) || 1;
          const k = s.speed / vmax;
          const dir = Math.sign(s.angularVelocity) || 1;
          return { position: bobPos(p, s.theta), rotation: [0, 0, s.theta + (dir > 0 ? 0 : Math.PI)], scale: [Math.max(0.001, k), 1, 1], visible: k > 0.02 };
        },
      });
      parts.push({ name: 'Vector_Velocity', parent: 'VelocityAt', shape: { kind: 'arrow', from: [0, 0, 0], vector: [g, 0, 0], radius: L0 * 0.008 }, color: '#4cc9f0' });
    }
    if (on(modes, 'trace')) {
      for (let k = 1; k <= TRACE_N; k++) {
        parts.push({ name: `Trace_${k}`, shape: { kind: 'sphere', radius: bobR * 0.35, widthSegments: 10 }, color: '#f2a65a', opacity: 0.5 * (1 - k / (TRACE_N + 1)), container: true, noPick: true, motion: (t) => ({ position: bobPos(p, theta(Math.max(0, t - k * 0.035))) }) });
      }
    }
    if (on(modes, 'energy')) {
      const e0 = pendulumState(p, 0).energy || 1;
      const H = L0 * 0.8;
      const bar = (name: string, x: number, color: string, f: (t: number) => number): Part => ({
        name, shape: { kind: 'box', size: [L0 * 0.08, H, L0 * 0.08] }, position: [x, -L0 / 2, 0], color,
        motion: (t) => {
          const k = Math.max(0.001, Math.min(1, f(t) / e0));
          return { scale: [1, k, 1], position: [x, -L0 / 2 + (H * k) / 2, 0] };
        },
      });
      parts.push(bar('Bar_PE', L0 * 0.75, '#118ab2', (t) => pendulumState(p, t).pe));
      parts.push(bar('Bar_KE', L0 * 0.9, '#ef476f', (t) => pendulumState(p, t).ke));
    }
    return parts;
  },
};

// ---------------------------------------------------------------------------
// Inclined plane — slope from top-left to bottom-right, base on y = 0.
// ---------------------------------------------------------------------------

const BLOCK = 0.3;

function slopeFrame(p: InclineParams) {
  const th = (p.angleDeg * Math.PI) / 180;
  const top: Vec3 = [(-p.length * Math.cos(th)) / 2, p.length * Math.sin(th), 0];
  const bottom: Vec3 = [(p.length * Math.cos(th)) / 2, 0, 0];
  const down: Vec3 = [Math.cos(th), -Math.sin(th), 0];
  const normal: Vec3 = [Math.sin(th), Math.cos(th), 0];
  return { th, top, bottom, down, normal };
}

function blockCenter(p: InclineParams, s: number): Vec3 {
  const f = slopeFrame(p);
  const along = BLOCK / 2 + Math.min(s, p.length - BLOCK);
  return add(add(f.top, scale3(f.down, along)), scale3(f.normal, BLOCK / 2));
}

const incline: SimModel = {
  id: 'inclined-plane',
  modes: [M.vectors, M.trace],
  clock(raw, pb, free) {
    if (pb) return pb.time;
    const s = inclineState(parseInclineParams(raw), 0);
    const loop = (Number.isFinite(s.arrival) ? s.arrival : 2) + 1.5;
    return (free % loop) - 0.5;
  },
  build(raw, { modes }) {
    const p = parseInclineParams(raw);
    const f = slopeFrame(p);
    const depth = 0.8;
    const z = depth / 2;
    const corner: Vec3 = [f.top[0], 0, 0];
    const tri = (dz: number): Vec3[] => [[f.top[0], f.top[1], dz], [f.bottom[0], 0, dz], [corner[0], 0, dz]];
    const parts: Part[] = [
      { name: 'Ramp', shape: { kind: 'group' } },
      { name: 'Ramp_Slope', parent: 'Ramp', shape: { kind: 'polygon', points: [[f.top[0], f.top[1], z], [f.bottom[0], 0, z], [f.bottom[0], 0, -z], [f.top[0], f.top[1], -z]] }, color: '#c9b79c' },
      { name: 'Ramp_Front', parent: 'Ramp', shape: { kind: 'polygon', points: tri(z) }, color: '#b39f82' },
      { name: 'Ramp_Back', parent: 'Ramp', shape: { kind: 'polygon', points: tri(-z) }, color: '#b39f82' },
      { name: 'Ramp_Wall', parent: 'Ramp', shape: { kind: 'polygon', points: [[corner[0], 0, z], [f.top[0], f.top[1], z], [f.top[0], f.top[1], -z], [corner[0], 0, -z]] }, color: '#a8957a' },
      { name: 'Ramp_Base', parent: 'Ramp', shape: { kind: 'polygon', points: [[corner[0], 0, z], [corner[0], 0, -z], [f.bottom[0], 0, -z], [f.bottom[0], 0, z]] }, color: '#a8957a' },
      {
        name: 'Block', shape: { kind: 'box', size: [BLOCK, BLOCK, BLOCK] }, rotation: [0, 0, -f.th], color: '#118ab2',
        motion: (t) => ({ position: blockCenter(p, inclineState(p, t).distance) }),
      },
    ];
    if (on(modes, 'vectors')) {
      const s0 = inclineState(p, 0);
      const k = 0.6 / Math.max(1e-6, s0.forces.gravity);
      parts.push({ name: 'Forces', shape: { kind: 'group' }, noPick: true, motion: (t) => ({ position: add(blockCenter(p, inclineState(p, t).distance), [0, 0, z * 0.3]) }) });
      const vec = (name: string, v: Vec3, color: string): Part => ({ name, parent: 'Forces', shape: { kind: 'arrow', from: [0, 0, 0], vector: v, radius: 0.02 }, color });
      parts.push(vec('Vector_Gravity', [0, -s0.forces.gravity * k, 0], '#ef476f'));
      parts.push(vec('Vector_Normal', scale3(f.normal, s0.forces.normal * k), '#06d6a0'));
      parts.push(vec('Vector_Friction', scale3(f.down, -s0.forces.friction * k), '#ffd166'));
      if (s0.forces.net > 0) parts.push(vec('Vector_Net', scale3(f.down, s0.forces.net * k), '#4cc9f0'));
    }
    if (on(modes, 'trace')) {
      // Group turned so local +Y runs down the slope; the tube grows with the distance travelled.
      parts.push({ name: 'TraceAt', shape: { kind: 'group' }, noPick: true, position: add(blockCenter(p, 0), [0, 0, z * 0.6]), rotation: yTo(f.down) });
      parts.push({
        name: 'Trace', parent: 'TraceAt', shape: { kind: 'tube', from: [0, 0, 0], to: [0, 1, 0], radius: 0.015 }, color: '#4cc9f0', opacity: 0.8, container: true, noPick: true,
        motion: (t) => {
          const d = Math.max(0.001, inclineState(p, t).distance);
          return { position: [0, d / 2, 0], scale: [1, d, 1], visible: d > 0.01 };
        },
      });
    }
    return parts;
  },
};

// ---------------------------------------------------------------------------
// DC circuit — components on a board in the XZ plane, wires along a loop.
// ---------------------------------------------------------------------------

const SLOTS: Record<string, Vec3> = {
  battery: [-1.2, 0, 0],
  switch: [0, 0, -1],
  ammeter: [0.8, 0, -1],
  lamp: [1.2, 0, 0],
  resistor: [0, 0, 1],
  voltmeter: [1.2, 0, 1],
};
const HALF_X = 1.2;

function wireRoute(a: Vec3, b: Vec3): Vec3[] {
  const onVertical = (p: Vec3) => Math.abs(Math.abs(p[0]) - HALF_X) < 1e-6;
  let pts: Vec3[];
  if (onVertical(a) && onVertical(b) && Math.sign(a[0]) !== Math.sign(b[0])) pts = [a, [a[0], 0, 1], [b[0], 0, 1], b];
  else if (onVertical(a)) pts = [a, [a[0], 0, b[2]], b];
  else pts = [a, [b[0], 0, a[2]], b];
  return pts.filter((p, i) => i === 0 || len3(sub(p, pts[i - 1])) > 1e-6);
}

/** Ordered loop of components from `wires` (`"battery-switch"`, …). */
export function circuitLoop(wires: readonly string[]): { name: string; from: string; to: string }[] {
  return wires
    .map((w) => {
      const [from, to] = w.split('-');
      return { name: w, from: from ?? '', to: to ?? '' };
    })
    .filter((w) => w.from && w.to);
}

function polylineAt(points: Vec3[], u: number): Vec3 {
  const segs = points.slice(1).map((p, i) => ({ a: points[i], b: p, l: len3(sub(p, points[i])) }));
  const total = segs.reduce((s, x) => s + x.l, 0) || 1;
  let d = (((u % 1) + 1) % 1) * total;
  for (const s of segs) {
    if (d <= s.l) return add(s.a, scale3(sub(s.b, s.a), s.l ? d / s.l : 0));
    d -= s.l;
  }
  return points[points.length - 1];
}

const circuit: SimModel = {
  id: 'dc-circuit',
  modes: [M.schematic, M.electrons],
  clock: (_raw, _pb, free) => free,
  build(raw, { modes, playback }) {
    const p: CircuitParams = parseCircuitParams(raw);
    const closed = playback ? playback.stepIndex >= 1 : p.switchClosed;
    const flat = on(modes, 'schematic');
    const h = flat ? 0.04 : 1;
    const wires = circuitLoop(Array.isArray(raw.wires) ? (raw.wires as unknown[]).filter((w): w is string => typeof w === 'string') : ['battery-switch', 'switch-lamp', 'lamp-battery']);
    const comps = [...new Set(wires.flatMap((w) => [w.from, w.to]))];
    let extra = 0;
    const slot = (c: string): Vec3 => SLOTS[c] ?? [-0.6 + 0.6 * extra++, 0, 1];
    const pos = new Map(comps.map((c) => [c, slot(c)]));
    const parts: Part[] = [
      { name: 'Board', shape: { kind: 'box', size: [3.2, 0.04, 2.6] }, position: [0, -0.04, 0], color: '#2b3440', noPick: true },
    ];
    const Name = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);
    for (const c of comps) {
      const at = pos.get(c)!;
      switch (c) {
        case 'battery':
          parts.push({ name: 'Battery', shape: { kind: 'cylinder', radiusTop: 0.12, radiusBottom: 0.12, height: 0.6, segments: 24 }, position: [at[0], 0.12 * h, at[2]], rotation: [Math.PI / 2, 0, 0], scale: [1, 1, flat ? 0.3 : 1], color: '#e9c46a', metalness: 0.4 });
          parts.push({ name: 'Battery_Plus', parent: 'Battery', shape: { kind: 'cylinder', radiusTop: 0.04, radiusBottom: 0.04, height: 0.06 }, position: [0, 0.33, 0], color: '#ef476f' });
          break;
        case 'switch':
          parts.push({ name: 'Switch', shape: { kind: 'box', size: [0.4, 0.05, 0.16] }, position: [at[0], 0.03, at[2]], color: '#6c757d' });
          parts.push({ name: 'Switch_Lever', parent: 'Switch', shape: { kind: 'box', size: [0.38, 0.03, 0.05] }, position: [0, 0.05, 0], rotation: [0, 0, closed ? 0 : 0.5], color: '#adb5bd', metalness: 0.7 });
          break;
        case 'lamp':
          parts.push({ name: 'Lamp', shape: { kind: 'group' }, position: [at[0], 0, at[2]] });
          parts.push({ name: 'Lamp_Base', parent: 'Lamp', shape: { kind: 'cylinder', radiusTop: 0.09, radiusBottom: 0.1, height: 0.18 }, position: [0, 0.09, 0], color: '#adb5bd', metalness: 0.6 });
          parts.push({ name: 'Lamp_Bulb', parent: 'Lamp', shape: { kind: 'sphere', radius: 0.2 * (flat ? 0.6 : 1) }, position: [0, 0.38 * h + 0.02, 0], color: closed ? '#ffe66d' : '#e9ecef', glow: closed ? 1.2 : 0, opacity: 0.7, container: false });
          break;
        default:
          parts.push({ name: Name(c), shape: { kind: 'cylinder', radiusTop: 0.16, radiusBottom: 0.16, height: 0.1 * h + 0.02, segments: 32 }, position: [at[0], 0.06 * h, at[2]], color: c === 'ammeter' ? '#90be6d' : '#577590' });
          parts.push({ name: `${Name(c)}_Dial`, parent: Name(c), shape: { kind: 'box', size: [0.02, 0.02, 0.12] }, position: [0, 0.07 * h, 0], rotation: [0, closed ? -0.6 : 0.6, 0], color: '#f8f9fa' });
      }
    }
    const loop: Vec3[] = [];
    wires.forEach((w) => {
      const a = pos.get(w.from)!;
      const b = pos.get(w.to)!;
      const route = wireRoute(a, b).map((q): Vec3 => [q[0], 0.03, q[2]]);
      route.slice(1).forEach((q, k) => parts.push({ name: `Wire_${w.name}_${k + 1}`, shape: { kind: 'tube', from: route[k], to: q, radius: 0.02 }, color: '#d08c60', metalness: 0.5 }));
      loop.push(...(loop.length ? route.slice(1) : route));
    });
    const across = typeof raw.voltmeterAcross === 'string' ? raw.voltmeterAcross : null;
    if (across && pos.has(across) && !comps.includes('voltmeter')) {
      const at = pos.get(across)!;
      const vm: Vec3 = [at[0], 0, at[2] + 1];
      parts.push({ name: 'Voltmeter', shape: { kind: 'cylinder', radiusTop: 0.16, radiusBottom: 0.16, height: 0.1 * h + 0.02, segments: 32 }, position: [vm[0], 0.06 * h, vm[2]], color: '#577590' });
      parts.push({ name: 'Voltmeter_Dial', parent: 'Voltmeter', shape: { kind: 'box', size: [0.02, 0.02, 0.12] }, position: [0, 0.07 * h, 0], rotation: [0, closed ? -0.6 : 0.6, 0], color: '#f8f9fa' });
      parts.push({ name: 'Voltmeter_Lead_1', parent: 'Voltmeter', shape: { kind: 'tube', from: [-0.1, 0, -0.12], to: [-0.12, -0.03, -0.9], radius: 0.012 }, color: '#e63946' });
      parts.push({ name: 'Voltmeter_Lead_2', parent: 'Voltmeter', shape: { kind: 'tube', from: [0.1, 0, -0.12], to: [0.14, -0.03, -1.1], radius: 0.012 }, color: '#1d3557' });
    }
    if (on(modes, 'electrons') && closed && loop.length > 1) {
      const n = 24;
      const back = [...loop].reverse();
      for (let k = 0; k < n; k++) {
        parts.push({
          name: `Electron_${k + 1}`, shape: { kind: 'sphere', radius: 0.025, widthSegments: 8 }, color: '#4cc9f0', glow: 0.9, noPick: true,
          // Electrons drift against the conventional current (battery − → + through the loop).
          motion: (t) => ({ position: add(polylineAt(back, k / n + t * 0.06), [0, 0.03, 0]) }),
        });
      }
    }
    return parts;
  },
};

// ---------------------------------------------------------------------------
// Astronomy helpers
// ---------------------------------------------------------------------------

/** Euler rotation turning the local `axis` onto `dir`. */
function axisTo(axis: Vec3, dir: Vec3): Vec3 {
  const q = new Quaternion().setFromUnitVectors(new Vector3(...axis), new Vector3(...norm3(dir)));
  const e = new Euler().setFromQuaternion(q);
  return [e.x, e.y, e.z];
}
const yTo = (dir: Vec3) => axisTo([0, 1, 0], dir);
const zTo = (dir: Vec3) => axisTo([0, 0, 1], dir);

const vec3 = (v: unknown, d: Vec3): Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (v as Vec3) : d;
const numParam = (raw: Record<string, unknown>, k: string, d: number) => (typeof raw[k] === 'number' && Number.isFinite(raw[k]) ? (raw[k] as number) : d);

// Moon phases — Earth at the origin, Sun far along sunDirection, Moon at radius 2.5.
const MOON_R = 2.5;
const SUN_DIST = 8;

const moonPhases: SimModel = {
  id: 'moon-phases',
  modes: [M.orbits, M.earthView],
  sunAt: (raw) => scale3(norm3(vec3(raw.sunDirection, [-1, 0, 0])), SUN_DIST),
  clock(raw, pb, free) {
    const syn = numParam(raw, 'synodicMonthDays', 29.53);
    return pb ? pb.fraction * syn : (free * syn) / 20;
  },
  build(raw, { modes }) {
    const syn = numParam(raw, 'synodicMonthDays', 29.53);
    const sunDir = norm3(vec3(raw.sunDirection, [-1, 0, 0]));
    const away = scale3(sunDir, -1);
    // Moon position: rotate the Sun direction about +Y by the phase angle (0 = new moon).
    const moonPos = (age: number): Vec3 => {
      const a = moonState(syn, age).phaseAngle;
      const c = Math.cos(a);
      const s = Math.sin(a);
      return [MOON_R * (sunDir[0] * c + sunDir[2] * s), 0, MOON_R * (-sunDir[0] * s + sunDir[2] * c)];
    };
    const parts: Part[] = [
      { name: 'Sun', shape: { kind: 'sphere', radius: 1 }, position: scale3(sunDir, SUN_DIST), color: '#ffd166', glow: 1.6 },
      { name: 'Earth', shape: { kind: 'sphere', radius: 0.6 }, color: '#3a86ff', roughness: 0.6 },
      { name: 'EarthShadow', shape: { kind: 'cylinder', radiusTop: 0.6, radiusBottom: 0.45, height: 4 }, position: scale3(away, 2.6), rotation: yTo(away), color: '#0b0f17', opacity: 0.35, container: true },
      { name: 'Moon', shape: { kind: 'sphere', radius: 0.22 }, color: '#e9ecef', roughness: 0.9, motion: (t) => ({ position: moonPos(t) }) },
      // Day/night boundary of the Moon: a ring perpendicular to the Sun direction.
      { name: 'Terminator', shape: { kind: 'torus', radius: 0.225, tube: 0.008 }, rotation: zTo(sunDir), color: '#ffd166', opacity: 0.8, container: true, motion: (t) => ({ position: moonPos(t) }) },
    ];
    if (on(modes, 'orbits')) parts.push({ name: 'Orbit_Moon', shape: { kind: 'torus', radius: MOON_R, tube: 0.01 }, rotation: [Math.PI / 2, 0, 0], color: '#adb5bd', opacity: 0.4, container: true, noPick: true });
    if (on(modes, 'earth-view')) {
      parts.push({
        name: 'SightLine', shape: { kind: 'tube', from: [0, 0, 0], to: [0, 1, 0], radius: 0.01 }, color: '#80ffdb', opacity: 0.7, container: true, noPick: true,
        motion: (t) => {
          const m = moonPos(t);
          return { position: scale3(m, 0.5), rotation: yTo(m), scale: [1, len3(m), 1] };
        },
      });
    }
    return parts;
  },
};

// Seasons — Sun at the origin, Earth on a circular orbit of radius 6 with a fixed tilted axis.
const ORBIT_R = 6;
const EARTH_R = 0.5;
const POINTS: [string, number][] = [
  ['Point_equinox_march', 0],
  ['Point_solstice_june', 0.25],
  ['Point_equinox_september', 0.5],
  ['Point_solstice_december', 0.75],
];

const seasons: SimModel = {
  id: 'seasons',
  modes: [M.orbits, M.sunRays],
  sunAt: () => [0, 0, 0],
  clock: (_raw, pb, free) => (pb ? pb.fraction : (free / 24) % 1),
  build(raw, { modes }) {
    const tilt = (numParam(raw, 'axialTiltDeg', 23.44) * Math.PI) / 180;
    const phi = (f: number) => 2 * Math.PI * f;
    const at = (f: number): Vec3 => [ORBIT_R * Math.cos(phi(f)), 0, -ORBIT_R * Math.sin(phi(f))];
    // Torus normal is +Z; rotate about X so it matches the axis (0, cos ε, sin ε) (tilted toward the Sun in June).
    const alpha = -(Math.PI / 2 - tilt);
    const tropic = (23.44 * Math.PI) / 180;
    const parts: Part[] = [
      { name: 'Sun', shape: { kind: 'sphere', radius: 1.2 }, color: '#ffd166', glow: 1.6 },
      { name: 'EarthOrbit', shape: { kind: 'group' }, noPick: true, motion: (t) => ({ rotation: [0, phi(t), 0] }) },
      { name: 'EarthHolder', parent: 'EarthOrbit', shape: { kind: 'group' }, position: [ORBIT_R, 0, 0], noPick: true, motion: (t) => ({ rotation: [0, -phi(t), 0] }) },
      { name: 'EarthTilt', parent: 'EarthHolder', shape: { kind: 'group' }, rotation: [alpha, 0, 0], noPick: true },
      { name: 'Earth', parent: 'EarthTilt', shape: { kind: 'sphere', radius: EARTH_R }, color: '#3a86ff', roughness: 0.6, motion: (t) => ({ rotation: [0, 0, t * 2 * Math.PI * 20] }) },
      { name: 'Axis', parent: 'EarthTilt', shape: { kind: 'cylinder', radiusTop: 0.015, radiusBottom: 0.015, height: EARTH_R * 3 }, rotation: [Math.PI / 2, 0, 0], color: '#f8f9fa' },
      { name: 'Equator', parent: 'EarthTilt', shape: { kind: 'torus', radius: EARTH_R * 1.01, tube: 0.008 }, color: '#ef476f' },
      { name: 'Tropic_Cancer', parent: 'EarthTilt', shape: { kind: 'torus', radius: EARTH_R * Math.cos(tropic) * 1.01, tube: 0.006 }, position: [0, 0, EARTH_R * Math.sin(tropic)], color: '#ffd166' },
      { name: 'Tropic_Capricorn', parent: 'EarthTilt', shape: { kind: 'torus', radius: EARTH_R * Math.cos(tropic) * 1.01, tube: 0.006 }, position: [0, 0, -EARTH_R * Math.sin(tropic)], color: '#ffd166' },
      // Night hemisphere faces away from the Sun (+X in the orbit frame).
      { name: 'DayNight', parent: 'EarthOrbit', shape: { kind: 'sphere', radius: EARTH_R * 1.04 }, position: [ORBIT_R + EARTH_R * 0.5, 0, 0], scale: [0.5, 1, 1], color: '#0b0f17', opacity: 0.45, container: true },
      ...POINTS.map(([name, f]): Part => ({ name, shape: { kind: 'sphere', radius: 0.12 }, position: at(f), color: name.includes('solstice') ? '#ef476f' : '#06d6a0' })),
    ];
    if (on(modes, 'orbits')) parts.push({ name: 'Orbit_Earth', shape: { kind: 'torus', radius: ORBIT_R, tube: 0.015 }, rotation: [Math.PI / 2, 0, 0], color: '#adb5bd', opacity: 0.4, container: true, noPick: true });
    if (on(modes, 'sun-rays')) {
      [-0.3, 0, 0.3].forEach((dy, i) =>
        parts.push({ name: `SunRay_${i + 1}`, parent: 'EarthOrbit', shape: { kind: 'arrow', from: [1.3, dy, 0], vector: [ORBIT_R - 1.3 - EARTH_R - 0.1, 0, 0], radius: 0.015 }, color: '#ffd166', glow: 0.8, noPick: true }),
      );
    }
    return parts;
  },
};

// Orbits — Sun + planets on circles (log or true distance scale).
export const BODIES: Record<string, { a: number; radiusKm: number; color: string }> = {
  mercury: { a: 0.387, radiusKm: 2440, color: '#b5b5b5' },
  venus: { a: 0.723, radiusKm: 6052, color: '#e9c46a' },
  earth: { a: 1, radiusKm: 6371, color: '#3a86ff' },
  mars: { a: 1.524, radiusKm: 3390, color: '#e76f51' },
  jupiter: { a: 5.203, radiusKm: 69911, color: '#d4a373' },
  saturn: { a: 9.537, radiusKm: 58232, color: '#e9d8a6' },
  uranus: { a: 19.19, radiusKm: 25362, color: '#90e0ef' },
  neptune: { a: 30.07, radiusKm: 24622, color: '#4361ee' },
};

/** Visual orbit radius: log scale by default, linear in true-scale mode. */
export const orbitRadius = (a: number, trueScale: boolean) => (trueScale ? 0.6 * a : 2 + 4.6 * Math.log(1 + a));
const bodyRadius = (km: number, trueScale: boolean) => (trueScale ? Math.max(0.05, km / 40000) : 0.1 + 0.18 * Math.log10(1 + km / 1000));

const orbits: SimModel = {
  id: 'orbits',
  modes: [M.orbits, M.trueScale],
  sunAt: () => [0, 0, 0],
  clock(raw, pb, free) {
    // Model clock in Earth years.
    return pb ? pb.fraction : (free * numParam(raw, 'timeScaleDaysPerSecond', 10)) / 365.25;
  },
  build(raw, { modes }) {
    const trueScale = on(modes, 'true-scale');
    const names = (Array.isArray(raw.bodies) ? (raw.bodies as unknown[]) : Object.keys(BODIES)).filter((b): b is string => typeof b === 'string');
    const parts: Part[] = [];
    if (names.includes('sun') || !Array.isArray(raw.bodies)) parts.push({ name: 'Sun', shape: { kind: 'sphere', radius: trueScale ? 0.35 : 1.2 }, color: '#ffd166', glow: 1.6 });
    for (const n of names) {
      const b = BODIES[n];
      if (!b) continue;
      const r = orbitRadius(b.a, trueScale);
      const period = b.a ** 1.5;
      const phase0 = (n.length * 1.7) % (2 * Math.PI);
      const angle = (t: number) => phase0 + (2 * Math.PI * t) / period;
      if (on(modes, 'orbits')) parts.push({ name: `Orbit_${n}`, shape: { kind: 'torus', radius: r, tube: 0.03 }, rotation: [Math.PI / 2, 0, 0], color: '#adb5bd', opacity: 0.35, container: true });
      parts.push({ name: `PlanetPivot_${n}`, shape: { kind: 'group' }, noPick: true, motion: (t) => ({ rotation: [0, angle(t), 0] }) });
      parts.push({ name: `Planet_${n}`, parent: `PlanetPivot_${n}`, shape: { kind: 'sphere', radius: bodyRadius(b.radiusKm, trueScale) }, position: [r, 0, 0], color: b.color, roughness: 0.7 });
      if (n === 'saturn') parts.push({ name: 'Rings_saturn', parent: `Planet_${n}`, shape: { kind: 'torus', radius: bodyRadius(b.radiusKm, trueScale) * 1.7, tube: bodyRadius(b.radiusKm, trueScale) * 0.25 }, rotation: [Math.PI / 2.4, 0, 0], scale: [1, 1, 0.15], color: '#d6ccc2' });
    }
    return parts;
  },
};

export const MODELS: Record<SimModelId, SimModel> = {
  pendulum,
  'inclined-plane': incline,
  'dc-circuit': circuit,
  'moon-phases': moonPhases,
  seasons,
  orbits,
};

/** Model for scene params (`model`), pendulum by default. */
export function modelFor(raw: unknown): SimModel {
  const m = raw && typeof raw === 'object' ? (raw as { model?: unknown }).model : undefined;
  return (typeof m === 'string' && (MODELS as Record<string, SimModel>)[m]) || pendulum;
}

/** Every mode across all models (for the unknown-model case and docs). */
export const ALL_SIM_MODES: ModeDef[] = [M.vectors, M.trace, M.energy, M.schematic, M.electrons, M.orbits, M.earthView, M.sunRays, M.trueScale];
