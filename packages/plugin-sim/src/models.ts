/**
 * Simulation models: parameters → named parts (content convention: nodes are
 * named by part — `Bob`, `String`, `Block`, `Lamp`, `Planet_<name>` …) and a
 * model clock derived from the process playback (or a free clock).
 */
import type { Localized, Vec3 } from '@bilig/content-model';
import type { ModeDef, ModeState, PlayerView } from '@bilig/scene-core';
import type { Part, PartTexture } from '@bilig/scene-kit';
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

/** Force / velocity arrows: glossy, slightly self-lit so they read on any stage. */
const arrowLook = { material: 'plastic', glow: 0.18 } as const;

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
    // Lab stand: base plate on the floor, a post behind the swing plane, an arm out to the pivot.
    const floor = -L0 / 2 - bobR - 0.1 * L0;
    const postZ = -0.32 * L0;
    const postX = -0.42 * L0;
    const rod = Math.max(0.006, 0.014 * L0);
    const steel = '#c3cad3';
    const parts: Part[] = [
      { name: 'Stand_Base', shape: { kind: 'box', size: [0.62 * L0, 0.04 * L0, 0.36 * L0], bevel: 0.012 * L0 }, position: [postX + 0.12 * L0, floor - 0.02 * L0, postZ + 0.06 * L0], color: '#3d4654', material: 'plastic', noPick: true },
      { name: 'Stand_Post', shape: { kind: 'cylinder', radiusTop: rod, radiusBottom: rod, height: pivotY + 0.08 * L0 - floor, segments: 20 }, position: [postX, (pivotY + 0.08 * L0 + floor) / 2, postZ], color: steel, material: 'brushed', noPick: true },
      { name: 'Stand_Arm', shape: { kind: 'tube', from: [postX, pivotY + 0.06 * L0, postZ], to: [0, pivotY + 0.06 * L0, 0], radius: rod * 0.85 }, color: steel, material: 'brushed', noPick: true },
      { name: 'Stand_Clamp', shape: { kind: 'box', size: [rod * 4, rod * 4, rod * 4], bevel: rod * 0.6 }, position: [postX, pivotY + 0.06 * L0, postZ], color: '#5c6676', material: 'metal', noPick: true },
      { name: 'Pivot', shape: { kind: 'box', size: [0.09 * L0, 0.07 * L0, 0.09 * L0], bevel: 0.012 * L0 }, position: [0, pivotY + 0.035 * L0, 0], color: '#8892a0', material: 'metal' },
      { name: 'Pivot_Axle', parent: 'Pivot', shape: { kind: 'cylinder', radiusTop: 0.012 * L0, radiusBottom: 0.012 * L0, height: 0.12 * L0, segments: 16 }, position: [0, -0.035 * L0, 0], rotation: [Math.PI / 2, 0, 0], color: '#dfe4ea', material: 'metal' },
      { name: 'Arm', shape: { kind: 'group' }, position: [0, pivotY, 0], noPick: true, motion: (t) => ({ rotation: [0, 0, theta(t)] }) },
      { name: 'String', parent: 'Arm', shape: { kind: 'cylinder', radiusTop: L0 * 0.004, radiusBottom: L0 * 0.004, height: L0 - bobR, segments: 8 }, position: [0, -(L0 - bobR) / 2, 0], color: '#eef1f4', material: 'matte' },
      { name: 'Bob', parent: 'Arm', shape: { kind: 'sphere', radius: bobR, widthSegments: 40 }, position: [0, -L0, 0], color: '#d9a441', material: 'metal', roughness: 0.18 },
      { name: 'Bob_Hook', parent: 'Bob', shape: { kind: 'cylinder', radiusTop: bobR * 0.16, radiusBottom: bobR * 0.22, height: bobR * 0.35, segments: 16 }, position: [0, bobR * 1.05, 0], color: '#c3cad3', material: 'metal' },
      { name: 'Marker_Equilibrium', shape: { kind: 'tube', from: [0, pivotY, 0], to: [0, pivotY - L0 - bobR * 1.5, 0], radius: L0 * 0.0025 }, color: '#9ad1d4', opacity: 0.55, container: true },
      // Arc symmetric around the lowest point: torus arcs start at +x, so rotate by −90° − amplitude.
      { name: 'Arc_Amplitude', shape: { kind: 'torus', radius: L0, tube: L0 * 0.004, arc: 2 * amp, segments: 64 }, position: [0, pivotY, 0], rotation: [0, 0, -Math.PI / 2 - amp], color: '#ffd166', opacity: 0.75, container: true },
    ];
    if (on(modes, 'vectors')) {
      const g = L0 * 0.25;
      // Motion lives on wrapper groups; arrow geometry stays static inside them.
      parts.push({ name: 'GravityAt', shape: { kind: 'group' }, noPick: true, motion: (t) => ({ position: bobPos(p, theta(t)) }) });
      parts.push({ name: 'Vector_Gravity', parent: 'GravityAt', shape: { kind: 'arrow', from: [0, 0, 0], vector: [0, -g, 0], radius: L0 * 0.009 }, color: '#ef476f', ...arrowLook });
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
      parts.push({ name: 'Vector_Velocity', parent: 'VelocityAt', shape: { kind: 'arrow', from: [0, 0, 0], vector: [g, 0, 0], radius: L0 * 0.009 }, color: '#4cc9f0', ...arrowLook });
    }
    if (on(modes, 'trace')) {
      for (let k = 1; k <= TRACE_N; k++) {
        parts.push({ name: `Trace_${k}`, shape: { kind: 'sphere', radius: bobR * 0.3, widthSegments: 12 }, color: '#f2b84b', opacity: 0.55 * (1 - k / (TRACE_N + 1)), container: true, noPick: true, motion: (t) => ({ position: bobPos(p, theta(Math.max(0, t - k * 0.035))) }) });
      }
    }
    if (on(modes, 'energy')) {
      const e0 = pendulumState(p, 0).energy || 1;
      const H = L0 * 0.8;
      const w = L0 * 0.08;
      // Bars stand on the stand's base line; a faint frame shows the total energy (the bars' sum).
      const bar = (name: string, x: number, color: string, f: (t: number) => number): Part[] => [
        { name: `${name}_Frame`, shape: { kind: 'box', size: [w * 1.15, H, w * 1.15] }, position: [x, floor + H / 2, 0], color: '#c8d0da', opacity: 0.12, container: true, noPick: true },
        {
          name, shape: { kind: 'box', size: [w, H, w], bevel: w * 0.12 }, position: [x, floor + H / 2, 0], color, material: 'plastic',
          motion: (t) => {
            const k = Math.max(0.001, Math.min(1, f(t) / e0));
            return { scale: [1, k, 1], position: [x, floor + (H * k) / 2, 0] };
          },
        },
      ];
      parts.push(...bar('Bar_PE', L0 * 0.75, '#118ab2', (t) => pendulumState(p, t).pe));
      parts.push(...bar('Bar_KE', L0 * 0.9, '#ef476f', (t) => pendulumState(p, t).ke));
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
    const wood = { material: 'wood', textureScale: 1.4 } as const;
    const parts: Part[] = [
      { name: 'Ramp', shape: { kind: 'group' } },
      { name: 'Ramp_Slope', parent: 'Ramp', shape: { kind: 'polygon', points: [[f.top[0], f.top[1], z], [f.bottom[0], 0, z], [f.bottom[0], 0, -z], [f.top[0], f.top[1], -z]] }, color: '#f3e3cc', ...wood },
      { name: 'Ramp_Front', parent: 'Ramp', shape: { kind: 'polygon', points: tri(z) }, color: '#d9c2a3', ...wood },
      { name: 'Ramp_Back', parent: 'Ramp', shape: { kind: 'polygon', points: tri(-z) }, color: '#d9c2a3', ...wood },
      { name: 'Ramp_Wall', parent: 'Ramp', shape: { kind: 'polygon', points: [[corner[0], 0, z], [f.top[0], f.top[1], z], [f.top[0], f.top[1], -z], [corner[0], 0, -z]] }, color: '#cfb595', ...wood },
      { name: 'Ramp_Base', parent: 'Ramp', shape: { kind: 'polygon', points: [[corner[0], 0, z], [corner[0], 0, -z], [f.bottom[0], 0, -z], [f.bottom[0], 0, z]] }, color: '#cfb595', ...wood },
      // Angle marker at the foot of the slope (decoration).
      { name: 'Ramp_Angle', shape: { kind: 'torus', radius: Math.min(0.45, p.length * 0.18), tube: 0.014, arc: f.th, segments: 32 }, position: [f.bottom[0], 0.004, z + 0.006], rotation: [0, 0, Math.PI - f.th], color: '#ffd166', noPick: true },
      {
        name: 'Block', shape: { kind: 'box', size: [BLOCK, BLOCK, BLOCK], bevel: BLOCK * 0.08 }, rotation: [0, 0, -f.th], color: '#118ab2', material: 'plastic',
        motion: (t) => ({ position: blockCenter(p, inclineState(p, t).distance) }),
      },
    ];
    if (on(modes, 'vectors')) {
      const s0 = inclineState(p, 0);
      const k = 0.6 / Math.max(1e-6, s0.forces.gravity);
      parts.push({ name: 'Forces', shape: { kind: 'group' }, noPick: true, motion: (t) => ({ position: add(blockCenter(p, inclineState(p, t).distance), [0, 0, z * 0.3]) }) });
      const vec = (name: string, v: Vec3, color: string): Part => ({ name, parent: 'Forces', shape: { kind: 'arrow', from: [0, 0, 0], vector: v, radius: 0.022 }, color, ...arrowLook });
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
    const wires = circuitLoop(Array.isArray(raw.wires) ? (raw.wires as unknown[]).filter((w): w is string => typeof w === 'string') : ['battery-switch', 'switch-lamp', 'lamp-battery']);
    const comps = [...new Set(wires.flatMap((w) => [w.from, w.to]))];
    let extra = 0;
    // `slots` places components the default board layout doesn't know (a second lamp …).
    const custom = raw.slots && typeof raw.slots === 'object' ? (raw.slots as Record<string, unknown>) : {};
    const slot = (c: string): Vec3 => vec3(custom[c], SLOTS[c] ?? [-0.6 + 0.6 * extra++, 0, 1]);
    // `lamp`, `lamp2`, `lamp3` … are all lamps; `lampBrightness` (0–1) dims them (lamps in series).
    const isLamp = (c: string) => /^lamp\d*$/.test(c);
    const brightness = Math.min(1, Math.max(0, numParam(raw, 'lampBrightness', 1)));
    const pos = new Map(comps.map((c) => [c, slot(c)]));
    const parts: Part[] = [
      { name: 'Board', shape: { kind: 'box', size: [3.3, 0.06, 2.7], bevel: 0.025 }, position: [0, -0.05, 0], color: '#ece6dc', material: 'wood', noPick: true },
    ];
    const Name = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);
    // Schematic mode lays every component flat on the board.
    const squash: Vec3 = [1, flat ? 0.22 : 1, 1];
    const meter = (N: string, at: Vec3, color: string, letter: 'A' | 'V') => {
      parts.push({ name: N, shape: { kind: 'cylinder', radiusTop: 0.17, radiusBottom: 0.18, height: 0.1, segments: 40 }, position: [at[0], 0.05 * squash[1], at[2]], scale: squash, color, material: 'plastic' });
      parts.push({ name: `${N}_Face`, parent: N, shape: { kind: 'cylinder', radiusTop: 0.14, radiusBottom: 0.14, height: 0.012, segments: 40 }, position: [0, 0.052, 0], color: '#f8f9fa', material: 'matte' });
      parts.push({ name: `${N}_Scale`, parent: N, shape: { kind: 'torus', radius: 0.11, tube: 0.004, arc: Math.PI * 0.7, segments: 24 }, position: [0, 0.06, 0], rotation: [-Math.PI / 2, 0, Math.PI * 0.15], color: '#343a40', material: 'matte' });
      // Needle from the dial centre; it swings when current flows.
      parts.push({ name: `${N}_Dial`, parent: N, shape: { kind: 'box', size: [0.012, 0.01, 0.12] }, position: [0, 0.066, 0], rotation: [0, closed ? -0.55 : 0.75, 0], color: '#e63946', material: 'plastic' });
      // Letter on the face, drawn with strokes.
      const strokes: [Vec3, Vec3][] = letter === 'A'
        ? [[[-0.03, 0, 0.075], [0, 0, 0.01]], [[0, 0, 0.01], [0.03, 0, 0.075]], [[-0.016, 0, 0.05], [0.016, 0, 0.05]]]
        : [[[-0.03, 0, 0.01], [0, 0, 0.075]], [[0, 0, 0.075], [0.03, 0, 0.01]]];
      strokes.forEach(([f0, t0], i) => parts.push({ name: `${N}_Label_${i + 1}`, parent: N, shape: { kind: 'tube', from: add(f0, [0, 0.061, 0]), to: add(t0, [0, 0.061, 0]), radius: 0.006 }, color: '#212529', material: 'matte' }));
      parts.push({ name: `${N}_Glass`, parent: N, shape: { kind: 'cylinder', radiusTop: 0.15, radiusBottom: 0.15, height: 0.03, segments: 40 }, position: [0, 0.07, 0], color: '#ffffff', material: 'glass' });
    };
    for (const c of comps) {
      const at = pos.get(c)!;
      switch (isLamp(c) ? 'lamp' : c) {
        case 'battery':
          // A D-cell lying along the board: + terminal towards −z (the switch side).
          parts.push({ name: 'Battery', shape: { kind: 'group' }, position: [at[0], 0, at[2]], scale: squash });
          parts.push({ name: 'Battery_Body', parent: 'Battery', shape: { kind: 'cylinder', radiusTop: 0.13, radiusBottom: 0.13, height: 0.56, segments: 40 }, position: [0, 0.13, 0.02], rotation: [Math.PI / 2, 0, 0], color: '#262b36', material: 'plastic' });
          parts.push({ name: 'Battery_Band', parent: 'Battery', shape: { kind: 'cylinder', radiusTop: 0.132, radiusBottom: 0.132, height: 0.2, segments: 40 }, position: [0, 0.13, -0.16], rotation: [Math.PI / 2, 0, 0], color: '#e9a23b', material: 'copper' });
          parts.push({ name: 'Battery_Plus', parent: 'Battery', shape: { kind: 'cylinder', radiusTop: 0.045, radiusBottom: 0.045, height: 0.05, segments: 24 }, position: [0, 0.13, -0.285], rotation: [Math.PI / 2, 0, 0], color: '#dfe4ea', material: 'metal' });
          parts.push({ name: 'Battery_Minus', parent: 'Battery', shape: { kind: 'cylinder', radiusTop: 0.11, radiusBottom: 0.11, height: 0.012, segments: 32 }, position: [0, 0.13, 0.305], rotation: [Math.PI / 2, 0, 0], color: '#c3cad3', material: 'metal' });
          parts.push({ name: 'Battery_Sign', parent: 'Battery', shape: { kind: 'box', size: [0.012, 0.012, 0.08] }, position: [0, 0.263, -0.16], color: '#ffffff', material: 'matte' });
          parts.push({ name: 'Battery_Sign_2', parent: 'Battery', shape: { kind: 'box', size: [0.08, 0.012, 0.012] }, position: [0, 0.263, -0.16], color: '#ffffff', material: 'matte' });
          parts.push({ name: 'Battery_Cradle', parent: 'Battery', shape: { kind: 'box', size: [0.3, 0.05, 0.66], bevel: 0.015 }, position: [0, 0.025, 0.01], color: '#3d4654', material: 'plastic' });
          break;
        case 'switch':
          // Knife switch: ceramic base, hinge post, copper blade with a red handle, contact clip.
          parts.push({ name: 'Switch', shape: { kind: 'box', size: [0.46, 0.05, 0.2], bevel: 0.015 }, position: [at[0], 0.025, at[2]], scale: squash, color: '#eef0f2', material: 'plastic' });
          parts.push({ name: 'Switch_Post_1', parent: 'Switch', shape: { kind: 'box', size: [0.05, 0.08, 0.07], bevel: 0.008 }, position: [-0.17, 0.06, 0], color: '#c79a5b', material: 'copper' });
          parts.push({ name: 'Switch_Post_2', parent: 'Switch', shape: { kind: 'box', size: [0.05, 0.08, 0.07], bevel: 0.008 }, position: [0.17, 0.06, 0], color: '#c79a5b', material: 'copper' });
          parts.push({ name: 'Switch_Hinge', parent: 'Switch', shape: { kind: 'group' }, position: [-0.17, 0.085, 0], rotation: [0, 0, closed ? 0 : 0.6] });
          parts.push({ name: 'Switch_Lever', parent: 'Switch_Hinge', shape: { kind: 'box', size: [0.36, 0.014, 0.04], bevel: 0.004 }, position: [0.18, 0, 0], color: '#d9a066', material: 'copper' });
          parts.push({ name: 'Switch_Handle', parent: 'Switch_Hinge', shape: { kind: 'capsule', radius: 0.022, length: 0.06 }, position: [0.39, 0.035, 0], color: '#e63946', material: 'plastic' });
          break;
        case 'lamp': {
          const L = Name(c);
          const lit = closed && brightness > 0;
          const bulbR = 0.17;
          const bulbY = 0.36;
          parts.push({ name: L, shape: { kind: 'group' }, position: [at[0], 0, at[2]], scale: squash });
          parts.push({ name: `${L}_Holder`, parent: L, shape: { kind: 'box', size: [0.28, 0.06, 0.28], bevel: 0.02 }, position: [0, 0.03, 0], color: '#3d4654', material: 'plastic' });
          // Screw base: ribbed metal socket.
          parts.push({ name: `${L}_Base`, parent: L, shape: { kind: 'lathe', segments: 32, profile: [[0, 0.06], [0.085, 0.06], [0.09, 0.08], [0.082, 0.1], [0.09, 0.12], [0.082, 0.14], [0.09, 0.16], [0.082, 0.18], [0.075, 0.2], [0, 0.2]] }, color: '#c3cad3', material: 'brushed' });
          // Filament on two support wires; glows when current flows.
          const fy = bulbY + 0.01;
          parts.push({ name: `${L}_Support_1`, parent: L, shape: { kind: 'tube', from: [-0.035, 0.2, 0], to: [-0.05, fy, 0], radius: 0.004 }, color: '#adb5bd', material: 'metal' });
          parts.push({ name: `${L}_Support_2`, parent: L, shape: { kind: 'tube', from: [0.035, 0.2, 0], to: [0.05, fy, 0], radius: 0.004 }, color: '#adb5bd', material: 'metal' });
          const coil: Vec3[] = Array.from({ length: 41 }, (_, i) => {
            const u = i / 40;
            const a = u * Math.PI * 2 * 7;
            return [-0.05 + 0.1 * u, fy + Math.sin(a) * 0.012, Math.cos(a) * 0.012];
          });
          parts.push({
            name: `${L}_Filament`, parent: L, shape: { kind: 'polyline', points: coil, radius: 0.0035 },
            ...(lit ? { color: '#ffd27a', material: 'emissive' as const, glow: 1 + 1.5 * brightness } : { color: '#5c6370', material: 'metal' as const }),
          });
          parts.push({
            name: `${L}_Bulb`, parent: L, shape: { kind: 'sphere', radius: bulbR, widthSegments: 40 }, position: [0, bulbY, 0],
            color: lit ? '#fff1c1' : '#f1f3f5', glow: lit ? 1.2 * brightness : 0, material: 'glass',
            ...(lit ? { halo: { color: '#ffcf70', size: 0.5 + 1.1 * brightness, strength: 0.35 + 0.55 * brightness } } : {}),
          });
          parts.push({ name: `${L}_Neck`, parent: L, shape: { kind: 'cylinder', radiusTop: 0.09, radiusBottom: 0.075, height: 0.08, segments: 32 }, position: [0, 0.23, 0], color: lit ? '#fff1c1' : '#f1f3f5', material: 'glass' });
          break;
        }
        default:
          meter(Name(c), at, c === 'ammeter' ? '#5a8f3d' : '#3d5a80', c === 'ammeter' ? 'A' : 'V');
      }
    }
    // Insulated copper wire: red from the battery's + side, dark back to its − side; rounded corners.
    const loop: Vec3[] = [];
    const WIRE_R = 0.022;
    wires.forEach((w) => {
      const a = pos.get(w.from)!;
      const b = pos.get(w.to)!;
      const route = wireRoute(a, b).map((q): Vec3 => [q[0], 0.005, q[2]]);
      const color = w.to === 'battery' ? '#2b2f3a' : '#d62828';
      route.slice(1).forEach((q, k) => parts.push({ name: `Wire_${w.name}_${k + 1}`, shape: { kind: 'tube', from: route[k], to: q, radius: WIRE_R }, color, material: 'rubber' }));
      route.slice(1, -1).forEach((q, k) => parts.push({ name: `Wire_${w.name}_J${k + 1}`, shape: { kind: 'sphere', radius: WIRE_R, widthSegments: 12 }, position: q, color, material: 'rubber' }));
      loop.push(...(loop.length ? route.slice(1) : route));
    });
    // Terminals: copper screw posts where wires meet a component (shared shape, drawn once per end).
    const ends = new Map<string, Vec3>();
    wires.forEach((w) => {
      for (const [c, other] of [[w.from, w.to], [w.to, w.from]] as const) {
        const at = pos.get(c)!;
        const route = wireRoute(at, pos.get(other)!);
        const dir = norm3(sub(route[1] ?? at, at));
        const reach = c === 'battery' ? 0.33 : c === 'switch' ? 0.17 : isLamp(c) ? 0.15 : 0.18;
        const p0 = add(at, scale3(dir, reach));
        ends.set(`${c}:${p0.map((v) => v.toFixed(2)).join(',')}`, p0);
      }
    });
    let ti = 0;
    for (const p0 of ends.values()) parts.push({ name: `Terminal_${++ti}`, shape: { kind: 'cylinder', radiusTop: 0.03, radiusBottom: 0.034, height: 0.05, segments: 16 }, position: [p0[0], 0.02, p0[2]], color: '#d39b5a', material: 'copper', noPick: true });
    const across = typeof raw.voltmeterAcross === 'string' ? raw.voltmeterAcross : null;
    if (across && pos.has(across) && !comps.includes('voltmeter')) {
      const at = pos.get(across)!;
      const vm: Vec3 = [at[0], 0, at[2] + 1];
      meter('Voltmeter', vm, '#3d5a80', 'V');
      parts.push({ name: 'Voltmeter_Lead_1', parent: 'Voltmeter', shape: { kind: 'tube', from: [-0.1, -0.03, -0.14], to: [-0.12, -0.04, -0.9], radius: 0.012 }, color: '#d62828', material: 'rubber' });
      parts.push({ name: 'Voltmeter_Lead_2', parent: 'Voltmeter', shape: { kind: 'tube', from: [0.1, -0.03, -0.14], to: [0.14, -0.04, -1.1], radius: 0.012 }, color: '#2b2f3a', material: 'rubber' });
    }
    if (on(modes, 'electrons') && closed && loop.length > 1) {
      const n = 24;
      const back = [...loop].reverse();
      for (let k = 0; k < n; k++) {
        parts.push({
          name: `Electron_${k + 1}`, shape: { kind: 'sphere', radius: 0.028, widthSegments: 10 }, color: '#7ee8fa', material: 'emissive', glow: 1.3, noPick: true,
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

/** Axial tilt of the Earth, rad. */
const EARTH_TILT = (23.44 * Math.PI) / 180;

/** The Sun: self-lit granulated surface and a soft corona glow. */
function sunPart(radius: number, position: Vec3): Part {
  return {
    name: 'Sun', shape: { kind: 'sphere', radius, widthSegments: 64 }, position,
    color: '#ffffff', texture: 'sun', material: 'emissive', glow: 1.3,
    halo: { color: '#ffb547', size: radius * 6, strength: 1 },
  };
}

const ATMOSPHERE: Partial<Record<PartTexture, string>> = { earth: '#5aa9ff', venus: '#ffdca0', mars: '#ff9f6e' };

/** A body lit by the Sun at `sun` (day/night terminator), with its own texture and atmosphere. */
function planetLook(tex: PartTexture, sun: Vec3): Pick<Part, 'color' | 'texture' | 'material' | 'sunlit' | 'atmosphere' | 'roughness'> {
  return { color: '#ffffff', texture: tex, material: 'matte', roughness: tex === 'earth' ? 0.7 : 0.85, sunlit: sun, atmosphere: ATMOSPHERE[tex] };
}

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
    const sunPos = scale3(sunDir, SUN_DIST);
    // The Moon keeps the same face towards the Earth (tidal locking): its texture's 0° meridian faces −position.
    const moonTurn = (m: Vec3): Vec3 => [0, Math.atan2(m[2], -m[0]), 0];
    const parts: Part[] = [
      sunPart(1, sunPos),
      {
        name: 'Earth', shape: { kind: 'sphere', radius: 0.6, widthSegments: 64 }, ...planetLook('earth', sunPos),
        motion: (t) => ({ rotation: [EARTH_TILT, t * 0.6, 0] }),
      },
      { name: 'EarthShadow', shape: { kind: 'cylinder', radiusTop: 0.6, radiusBottom: 0.36, height: 4, segments: 48, openEnded: true }, position: scale3(away, 2.6), rotation: yTo(away), color: '#04060b', opacity: 0.24, container: true },
      {
        name: 'Moon', shape: { kind: 'sphere', radius: 0.22, widthSegments: 48 }, ...planetLook('moon', sunPos),
        motion: (t) => {
          const m = moonPos(t);
          return { position: m, rotation: moonTurn(m) };
        },
      },
      // Day/night boundary of the Moon: a ring perpendicular to the Sun direction.
      { name: 'Terminator', shape: { kind: 'torus', radius: 0.228, tube: 0.0055, segments: 64 }, rotation: zTo(sunDir), color: '#ffd166', opacity: 0.85, container: true, motion: (t) => ({ position: moonPos(t) }) },
    ];
    if (on(modes, 'orbits')) parts.push({ name: 'Orbit_Moon', shape: { kind: 'torus', radius: MOON_R, tube: 0.008, segments: 160 }, rotation: [Math.PI / 2, 0, 0], color: '#c9d4e5', opacity: 0.4, container: true, noPick: true });
    if (on(modes, 'earth-view')) {
      parts.push({
        name: 'SightLine', shape: { kind: 'tube', from: [0, 0, 0], to: [0, 1, 0], radius: 0.008 }, color: '#80ffdb', opacity: 0.7, container: true, noPick: true,
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
    const tropic = (23.44 * Math.PI) / 180;
    const R = EARTH_R;
    const sunPos: Vec3 = [0, 0, 0];
    const ring = (radius: number, tube: number) => ({ kind: 'torus', radius, tube, segments: 96 }) as const;
    const flatRing: Vec3 = [Math.PI / 2, 0, 0];
    const parts: Part[] = [
      sunPart(1.2, sunPos),
      { name: 'EarthOrbit', shape: { kind: 'group' }, noPick: true, motion: (t) => ({ rotation: [0, phi(t), 0] }) },
      // Holder counter-rotates, so the axis keeps its direction in space all year.
      { name: 'EarthHolder', parent: 'EarthOrbit', shape: { kind: 'group' }, position: [ORBIT_R, 0, 0], noPick: true, motion: (t) => ({ rotation: [0, -phi(t), 0] }) },
      // Local +Y is the rotation axis (0, cos ε, sin ε): tilted towards the Sun in June.
      { name: 'EarthTilt', parent: 'EarthHolder', shape: { kind: 'group' }, rotation: [tilt, 0, 0], noPick: true },
      { name: 'Earth', parent: 'EarthTilt', shape: { kind: 'sphere', radius: R, widthSegments: 64 }, ...planetLook('earth', sunPos), motion: (t) => ({ rotation: [0, t * 2 * Math.PI * 8, 0] }) },
      { name: 'Axis', parent: 'EarthTilt', shape: { kind: 'cylinder', radiusTop: 0.016, radiusBottom: 0.016, height: R * 3, segments: 12 }, color: '#f8f9fa', material: 'plastic' },
      { name: 'Axis_North', parent: 'Axis', shape: { kind: 'cylinder', radiusTop: 0, radiusBottom: 0.045, height: 0.1, segments: 16 }, position: [0, R * 1.5 + 0.05, 0], color: '#f8f9fa', material: 'plastic' },
      { name: 'Equator', parent: 'EarthTilt', shape: ring(R * 1.012, 0.008), rotation: flatRing, color: '#ef476f', material: 'plastic' },
      { name: 'Tropic_Cancer', parent: 'EarthTilt', shape: ring(R * Math.cos(tropic) * 1.012, 0.006), position: [0, R * Math.sin(tropic), 0], rotation: flatRing, color: '#ffd166', material: 'plastic' },
      { name: 'Tropic_Capricorn', parent: 'EarthTilt', shape: ring(R * Math.cos(tropic) * 1.012, 0.006), position: [0, -R * Math.sin(tropic), 0], rotation: flatRing, color: '#ffd166', material: 'plastic' },
      // Night hemisphere: a dark cap facing away from the Sun (+X in the orbit frame).
      { name: 'DayNight', parent: 'EarthOrbit', shape: { kind: 'sphere', radius: R * 1.03, widthSegments: 48, hemisphere: true }, position: [ORBIT_R, 0, 0], rotation: [0, 0, -Math.PI / 2], color: '#0b1226', opacity: 0.3, container: true },
      ...POINTS.map(([name, f]): Part => ({ name, shape: { kind: 'sphere', radius: 0.12, widthSegments: 20 }, position: at(f), color: name.includes('solstice') ? '#ef476f' : '#06d6a0', material: 'plastic', glow: 0.15 })),
    ];
    if (on(modes, 'orbits')) parts.push({ name: 'Orbit_Earth', shape: { kind: 'torus', radius: ORBIT_R, tube: 0.014, segments: 256 }, rotation: [Math.PI / 2, 0, 0], color: '#c9d4e5', opacity: 0.4, container: true, noPick: true });
    if (on(modes, 'sun-rays')) {
      [-0.3, 0, 0.3].forEach((dy, i) =>
        parts.push({ name: `SunRay_${i + 1}`, parent: 'EarthOrbit', shape: { kind: 'arrow', from: [1.4, dy, 0], vector: [ORBIT_R - 1.4 - EARTH_R - 0.08, 0, 0], radius: 0.014 }, color: '#ffd166', material: 'emissive', glow: 1.1, noPick: true }),
      );
    }
    return parts;
  },
};

// Orbits — Sun + planets on circles (log or true distance scale).
export const BODIES: Record<string, { a: number; radiusKm: number; color: string; tiltDeg: number }> = {
  mercury: { a: 0.387, radiusKm: 2440, color: '#b5b5b5', tiltDeg: 0 },
  venus: { a: 0.723, radiusKm: 6052, color: '#e9c46a', tiltDeg: 177 },
  earth: { a: 1, radiusKm: 6371, color: '#3a86ff', tiltDeg: 23.4 },
  mars: { a: 1.524, radiusKm: 3390, color: '#e76f51', tiltDeg: 25.2 },
  jupiter: { a: 5.203, radiusKm: 69911, color: '#d4a373', tiltDeg: 3.1 },
  saturn: { a: 9.537, radiusKm: 58232, color: '#e9d8a6', tiltDeg: 26.7 },
  uranus: { a: 19.19, radiusKm: 25362, color: '#90e0ef', tiltDeg: 97.8 },
  neptune: { a: 30.07, radiusKm: 24622, color: '#4361ee', tiltDeg: 28.3 },
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
    const sunPos: Vec3 = [0, 0, 0];
    if (names.includes('sun') || !Array.isArray(raw.bodies)) parts.push(sunPart(trueScale ? 0.35 : 1.2, sunPos));
    for (const n of names) {
      const b = BODIES[n];
      if (!b) continue;
      const r = orbitRadius(b.a, trueScale);
      const br = bodyRadius(b.radiusKm, trueScale);
      const period = b.a ** 1.5;
      const phase0 = (n.length * 1.7) % (2 * Math.PI);
      const angle = (t: number) => phase0 + (2 * Math.PI * t) / period;
      if (on(modes, 'orbits')) parts.push({ name: `Orbit_${n}`, shape: { kind: 'torus', radius: r, tube: 0.012 + r * 0.0012, segments: Math.min(384, 96 + Math.round(r * 16)) }, rotation: [Math.PI / 2, 0, 0], color: '#c9d4e5', opacity: 0.32, container: true });
      parts.push({ name: `PlanetPivot_${n}`, shape: { kind: 'group' }, noPick: true, motion: (t) => ({ rotation: [0, angle(t), 0] }) });
      // Axial tilt (towards the camera side, so rings and poles read in the default views).
      parts.push({ name: `PlanetTilt_${n}`, parent: `PlanetPivot_${n}`, shape: { kind: 'group' }, position: [r, 0, 0], rotation: [(b.tiltDeg * Math.PI) / 180, 0, 0], noPick: true });
      const tex = n as PartTexture;
      parts.push({ name: `Planet_${n}`, parent: `PlanetTilt_${n}`, shape: { kind: 'sphere', radius: br, widthSegments: 48 }, ...planetLook(tex, sunPos) });
      if (n === 'saturn') parts.push({ name: 'Rings_saturn', parent: `Planet_${n}`, shape: { kind: 'ring', inner: br * 1.24, outer: br * 2.3, segments: 128 }, color: '#ffffff', texture: 'rings', material: 'matte' });
      if (n === 'uranus') parts.push({ name: 'Rings_uranus', parent: `Planet_${n}`, shape: { kind: 'ring', inner: br * 1.6, outer: br * 1.7, segments: 96 }, color: '#cfe8ee', opacity: 0.2, container: true, noPick: true });
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
