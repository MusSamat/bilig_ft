/**
 * `pulley` (physics 7 §38–39 work and power, §48–50 pulleys, the golden rule
 * of mechanics, efficiency): a load is lifted by h at a steady speed with
 *  - `fixed`: one fixed pulley on the beam — F = P (no gain in force), s = h;
 *  - `movable`: one movable pulley, the rope's end tied to the beam and
 *    pulled up — F = (P + P_блок)/2, s = 2h;
 *  - `tackle`: a movable pulley plus a fixed one turning the pull downwards.
 * Friction loses a share of the work. Readouts: F, s, h, A_п = P·h,
 * A_т = F·s, η = A_п/A_т·100 %, N = A_т/t. The wheels turn as the rope runs.
 */
import type { Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import { COLORS, LABELS, L, MODE, arrowLook, clamp, enumOr, fmt, niceStep, numOr, obj, on, qty, text, tr, type SimModel } from './common.js';
import { q, vRope, wheel } from './mechCommon.js';

export type PulleyVariant = 'fixed' | 'movable' | 'tackle';
export interface PulleyParams {
  variant: PulleyVariant;
  /** kg */
  loadMass: number;
  /** Mass of the movable pulley, kg (lifted with the load). */
  pulleyMass: number;
  /** Height the load is lifted, m. */
  height: number;
  /** Speed of the load, m/s. */
  speed: number;
  /** Share of the total work lost to friction (0–0.5). */
  friction: number;
  g: number;
}
export const DEFAULT_PULLEY: PulleyParams = { variant: 'fixed', loadMass: 10, pulleyMass: 0, height: 1, speed: 0.2, friction: 0, g: 9.8 };

export function parsePulleyParams(raw: unknown): PulleyParams {
  const p = obj(raw);
  return {
    variant: enumOr(p.variant, ['fixed', 'movable', 'tackle'] as const, DEFAULT_PULLEY.variant),
    loadMass: numOr(p.loadMass, 1e-3, 1e6, DEFAULT_PULLEY.loadMass),
    pulleyMass: numOr(p.pulleyMass, 0, 1e6, DEFAULT_PULLEY.pulleyMass),
    height: numOr(p.height, 1e-3, 1e4, DEFAULT_PULLEY.height),
    speed: numOr(p.speed, 1e-4, 1e3, DEFAULT_PULLEY.speed),
    friction: numOr(p.friction, 0, 0.5, DEFAULT_PULLEY.friction),
    g: numOr(p.g, 0.01, 1000, DEFAULT_PULLEY.g),
  };
}

export interface PulleyState {
  /** Weight of the load P = m·g, N. */
  weight: number;
  /** Effort on the rope's end, N. */
  force: number;
  /** Rope pulled, m (h or 2h). */
  ropeLength: number;
  /** Useful work A_п = P·h, J. */
  useful: number;
  /** Total work A_т = F·s, J. */
  total: number;
  /** η = A_п/A_т (0–1). */
  efficiency: number;
  /** Time to lift t = h/v, s. */
  time: number;
  /** Power N = A_т/t, W. */
  power: number;
  /** Gain in force P/F. */
  gain: number;
}

/**
 * A_т = (m + m_блок)·g·h / (1 − friction) for a movable pulley (the fixed one
 * doesn't rise: A_т = m·g·h / (1 − friction)); F = A_т / s.
 */
export function pulleyState(p: PulleyParams): PulleyState {
  const weight = p.loadMass * p.g;
  const movable = p.variant !== 'fixed';
  const ropeLength = movable ? 2 * p.height : p.height;
  const useful = weight * p.height;
  const lifted = (p.loadMass + (movable ? p.pulleyMass : 0)) * p.g * p.height;
  const total = lifted / (1 - p.friction);
  const force = total / ropeLength;
  const time = p.height / p.speed;
  return { weight, force, ropeLength, useful, total, efficiency: useful / total, time, power: total / time, gain: weight / force };
}

const PRE = 0.8;
const HOLD = 1.8;
const MAX_PLAY = 10;

/** Load height (m) at model time t (negative t = waiting). */
export const pulleyLift = (p: PulleyParams, t: number) => p.speed * clamp(t, 0, p.height / p.speed);

const SYM = {
  useful: L('Aп', 'Aп', 'Au'),
  total: L('Aт', 'Aз', 'At'),
  usefulWord: L('пайдалуу жумуш', 'полезная работа', 'useful work'),
  totalWord: L('толук жумуш', 'затраченная работа', 'total work'),
  power: L('N', 'N', 'N'),
  powerWord: L('кубаттуулук', 'мощность', 'power'),
};

const R = 0.16;
const ROPE_R = 0.013;
const ROPE = '#d4a373';
const EFFORT = '#ff8c42';

export const pulley: SimModel = {
  id: 'pulley',
  modes: [MODE.vectors(true), MODE.energy(), LABELS],
  clock(raw, pb, free) {
    const p = parsePulleyParams(raw);
    const T = p.height / p.speed;
    if (pb) return pb.fraction * T;
    const rate = Math.max(1, T / MAX_PLAY);
    const loop = PRE + T / rate + HOLD;
    return Math.min(((free % loop) - PRE) * rate, T);
  },
  build(raw, { modes, lang = 'ru' }) {
    const p = parsePulleyParams(raw);
    const s = pulleyState(p);
    const labels = on(modes, 'labels');
    const kd = Math.min(1, 1.5 / p.height); // scene units per real metre of height
    const H = p.height * kd;
    const lift = (t: number) => pulleyLift(p, t) * kd;
    const side = clamp(0.26 + 0.07 * Math.cbrt(p.loadMass), 0.28, 0.46);
    const loadH = side * 0.85;
    const movable = p.variant !== 'fixed';
    const tackle = p.variant === 'tackle';

    // Layout (x of the load, heights of the wheels, the beam and the hand).
    const loadX = movable ? 0 : -R;
    const yM0 = loadH + 0.3; // movable wheel centre at the start
    const yM = (t: number) => yM0 + lift(t);
    let Yw: number; // fixed wheel centre
    let Yb: number; // beam underside
    let H0: number; // hand at the start
    let handX: number;
    let handDir: 1 | -1; // +1 pulls up
    if (p.variant === 'fixed') {
      Yw = loadH + H + 0.5;
      Yb = Yw + R + 0.3;
      H0 = Yw - 0.3;
      handX = R;
      handDir = -1;
    } else if (p.variant === 'movable') {
      H0 = yM0 + 0.45;
      Yb = H0 + 2 * H + 0.3;
      Yw = Yb;
      handX = R;
      handDir = 1;
    } else {
      Yw = Math.max(0.75 + 2 * H, yM0 + H + 2 * R + 0.3);
      Yb = Yw + R + 0.3;
      H0 = Yw - 0.3;
      handX = 3 * R + 2 * ROPE_R;
      handDir = -1;
    }
    const hand = (t: number) => H0 + handDir * (s.ropeLength / p.height) * lift(t);
    const beamW = tackle ? 1.6 : 1.3;
    const beamX = tackle ? R : 0;
    // A wooden gallows-type stand: a post on a heavy foot, the beam on top held by a brace.
    const energyOn = on(modes, 'energy');
    const floorL = beamX - beamW / 2 - 0.25;
    const floorR = energyOn ? Math.max(handX + 1.1, 1.0) + 1.1 : handX + 0.75;
    const postX = -beamW / 2 + 0.07;
    const brace = Math.min(0.45, Yb * 0.3);
    // The load hangs a little above the floor from the start, so its weight arrow fits above it.
    const Y0 = 0.45;
    const parts: Part[] = [
      { name: 'Floor', shape: { kind: 'box', size: [floorR - floorL, 0.04, 0.9], bevel: 0.01 }, position: [(floorL + floorR) / 2, -Y0 - 0.02, 0], color: '#d9cfc1', material: 'wood', textureScale: 3, noPick: true },
      { name: 'Beam', shape: { kind: 'box', size: [beamW, 0.14, 0.2], bevel: 0.02 }, position: [beamX, Yb + 0.07, 0], color: '#b08a5a', material: 'wood', textureScale: 1.5 },
      { name: 'Beam_Post', parent: 'Beam', shape: { kind: 'box', size: [0.12, Yb + Y0 + 0.14, 0.12], bevel: 0.01 }, position: [postX, -(Yb + Y0 + 0.14) / 2 + 0.07, 0], color: '#8a6a43', material: 'wood' },
      { name: 'Beam_Foot', parent: 'Beam', shape: { kind: 'box', size: [0.5, 0.06, 0.5], bevel: 0.01 }, position: [postX, -Yb - Y0 - 0.07 + 0.03, 0], color: '#6f5232', material: 'wood' },
      { name: 'Beam_Brace', parent: 'Beam', shape: { kind: 'tube', from: [postX + 0.05, -0.07 - brace, 0], to: [postX + 0.05 + brace, -0.06, 0], radius: 0.03 }, color: '#8a6a43', material: 'wood' },
    ];

    // Fixed pulley on a bracket under the beam.
    if (p.variant !== 'movable') {
      const xf = tackle ? 2 * R + 2 * ROPE_R : 0;
      const run = tackle ? 2 : 1; // rope speed over it, in units of the load speed
      parts.push({ name: 'Pulley_Fixed', shape: { kind: 'group' }, position: [xf, Yw, 0] });
      parts.push({ name: 'Pulley_Fixed_Bracket_1', parent: 'Pulley_Fixed', shape: { kind: 'box', size: [0.07, Yb - Yw, 0.012] }, position: [0, (Yb - Yw) / 2, R * 0.32], color: COLORS.steel, material: 'brushed' });
      parts.push({ name: 'Pulley_Fixed_Bracket_2', parent: 'Pulley_Fixed', shape: { kind: 'box', size: [0.07, Yb - Yw, 0.012] }, position: [0, (Yb - Yw) / 2, -R * 0.32], color: COLORS.steel, material: 'brushed' });
      parts.push({ name: 'Pulley_Fixed_Axle', parent: 'Pulley_Fixed', shape: { kind: 'cylinder', radiusTop: 0.02, radiusBottom: 0.02, height: R * 0.75, segments: 16 }, rotation: [Math.PI / 2, 0, 0], color: '#dfe4ea', material: 'metal', noPick: true });
      parts.push(...wheel('Pulley_Fixed_Wheel', 'Pulley_Fixed', [0, 0, 0], R, '#8892a0', (t) => (-run * lift(t)) / R));
    }
    // Movable pulley rising with the load, its clevis and hook holding the load.
    if (movable) {
      parts.push({ name: 'Pulley_Movable', shape: { kind: 'group' }, position: [0, yM(0), 0], motion: (t) => ({ position: [0, yM(t), 0] }) });
      parts.push({ name: 'Pulley_Movable_Clevis_1', parent: 'Pulley_Movable', shape: { kind: 'box', size: [0.07, 0.2, 0.012] }, position: [0, -0.08, R * 0.32], color: COLORS.steel, material: 'brushed' });
      parts.push({ name: 'Pulley_Movable_Clevis_2', parent: 'Pulley_Movable', shape: { kind: 'box', size: [0.07, 0.2, 0.012] }, position: [0, -0.08, -R * 0.32], color: COLORS.steel, material: 'brushed' });
      parts.push({ name: 'Pulley_Movable_Yoke', parent: 'Pulley_Movable', shape: { kind: 'box', size: [0.08, 0.025, R * 0.7], bevel: 0.005 }, position: [0, -0.19, 0], color: COLORS.steel, material: 'brushed' });
      parts.push({ name: 'Pulley_Movable_Hook', parent: 'Pulley_Movable', shape: { kind: 'tube', from: [0, -0.19, 0], to: [0, -0.3 + 0.02, 0], radius: 0.01 }, color: COLORS.steel, material: 'metal' });
      parts.push({ name: 'Pulley_Movable_Axle', parent: 'Pulley_Movable', shape: { kind: 'cylinder', radiusTop: 0.02, radiusBottom: 0.02, height: R * 0.75, segments: 16 }, rotation: [Math.PI / 2, 0, 0], color: '#dfe4ea', material: 'metal', noPick: true });
      // Rolling on the fixed strand: turns at v/R.
      parts.push(...wheel('Pulley_Movable_Wheel', 'Pulley_Movable', [0, 0, 0], R, '#6c9bd2', (t) => lift(t) / R));
    }

    // Rope: straight strands that follow the clock, half-turns around the wheels.
    parts.push({ name: 'Rope', shape: { kind: 'group' }, noPick: true });
    const loadTop = (t: number) => lift(t) + loadH + 0.07;
    const arc = (name: string, parent: string, up: boolean): Part => ({ name, parent, shape: { kind: 'torus', radius: R + ROPE_R, tube: ROPE_R, arc: Math.PI, segments: 32 }, rotation: [0, 0, up ? 0 : Math.PI], color: ROPE, material: 'matte' });
    if (p.variant === 'fixed') {
      parts.push(vRope('Rope_1', 'Rope', -R - ROPE_R, 0, loadTop, () => Yw, ROPE_R, ROPE));
      parts.push(arc('Rope_Arc', 'Pulley_Fixed', true));
      parts.push(vRope('Rope_2', 'Rope', R + ROPE_R, 0, hand, () => Yw, ROPE_R, ROPE));
    } else {
      parts.push(vRope('Rope_1', 'Rope', -R - ROPE_R, 0, yM, () => Yb, ROPE_R, ROPE));
      parts.push(arc('Rope_Arc', 'Pulley_Movable', false));
      if (p.variant === 'movable') {
        parts.push(vRope('Rope_2', 'Rope', R + ROPE_R, 0, yM, hand, ROPE_R, ROPE));
      } else {
        parts.push(vRope('Rope_2', 'Rope', R + ROPE_R, 0, yM, () => Yw, ROPE_R, ROPE));
        parts.push(arc('Rope_Arc_2', 'Pulley_Fixed', true));
        parts.push(vRope('Rope_3', 'Rope', 3 * R + 3 * ROPE_R, 0, hand, () => Yw, ROPE_R, ROPE));
      }
      parts.push({ name: 'Rope_Knot', parent: 'Rope', shape: { kind: 'sphere', radius: ROPE_R * 2.2, widthSegments: 12 }, position: [-R - ROPE_R, Yb - 0.01, 0], color: ROPE, material: 'matte' });
    }

    // The load: a crate with a hook, resting on the floor until the pull starts.
    const loadPos = (t: number): Vec3 => [loadX, lift(t) + loadH / 2, 0];
    parts.push({ name: 'Load', shape: { kind: 'box', size: [side, loadH, side * 0.85], bevel: 0.02 }, position: loadPos(0), color: '#6b705c', material: 'metal', motion: (t) => ({ position: loadPos(t) }) });
    parts.push({ name: 'Load_Eye', parent: 'Load', shape: { kind: 'torus', radius: 0.035, tube: 0.01, segments: 16 }, position: [0, loadH / 2 + 0.04, 0], color: COLORS.steel, material: 'metal', noPick: true });
    if (labels) parts.push(text('Load_Label', qty(p.loadMass, 'kg', lang, 1), [0, 0, side * 0.425 + 0.005], Math.min(0.09, side * 0.25), { parent: 'Load', billboard: false, plate: false, color: '#f8f9fa', bold: true }));

    // Hand gripping the free end, the forearm coming from the side.
    const handPos = (t: number): Vec3 => [handX + 2 * ROPE_R, hand(t), 0];
    parts.push({ name: 'Hand', shape: { kind: 'group' }, position: handPos(0), motion: (t) => ({ position: handPos(t) }) });
    // A fist closed round the rope (thumb on top of the fingers), the forearm and a sleeve
    // coming in from the side: the person stands off to the right.
    const SKIN = '#e0ac69';
    parts.push({ name: 'Hand_Fist', parent: 'Hand', shape: { kind: 'box', size: [0.085, 0.1, 0.09], bevel: 0.03 }, position: [0.02, 0, 0], color: SKIN, material: 'matte' });
    parts.push({ name: 'Hand_Thumb', parent: 'Hand', shape: { kind: 'capsule', radius: 0.018, length: 0.05 }, position: [0.0, 0.0, 0.05], rotation: [0, 0, Math.PI / 2 - 0.4 * handDir], color: SKIN, material: 'matte', noPick: true });
    parts.push({ name: 'Hand_Arm', parent: 'Hand', shape: { kind: 'tube', from: [0.06, 0, 0], to: [0.34, -0.05 * handDir, 0.08], radius: 0.036 }, color: SKIN, material: 'matte' });
    parts.push({ name: 'Hand_Sleeve', parent: 'Hand', shape: { kind: 'tube', from: [0.3, -0.043 * handDir, 0.069], to: [0.62, -0.1 * handDir, 0.16], radius: 0.055 }, color: '#3a86ff', material: 'plastic', noPick: true });

    // Forces: the effort on the rope's end and the weight of the load (same scale).
    if (on(modes, 'vectors')) {
      const kF = 0.55 / Math.max(s.weight, s.force);
      const zf = side * 0.425 + 0.05;
      parts.push({ name: 'Arrow_Effort', parent: 'Hand', shape: { kind: 'arrow', from: [0, handDir > 0 ? 0.08 : -0.08, zf], vector: [0, handDir * s.force * kF, 0], radius: 0.026 }, color: EFFORT, ...arrowLook });
      parts.push({ name: 'Arrow_Weight', parent: 'Load', shape: { kind: 'arrow', from: [0, 0, zf], vector: [0, -s.weight * kF, 0], radius: 0.026 }, color: COLORS.gravity, ...arrowLook });
      if (labels) {
        parts.push(text('Arrow_Effort_Label', `F = ${qty(s.force, 'N', lang, 1)}`, [0.2, handDir * (s.force * kF + 0.18), zf], 0.1, { parent: 'Hand', color: EFFORT }));
        parts.push(text('Arrow_Weight_Label', `P = ${qty(s.weight, 'N', lang, 1)}`, [0.26, -s.weight * kF - 0.1, zf], 0.1, { parent: 'Load', color: COLORS.gravity }));
      }
    }

    // Ruler beside the load (real metres of height) with a mark riding at the load's bottom.
    // Ruler fixed on the front of the post.
    const rx = beamX + postX;
    const rz = 0.075;
    const top = H + loadH + 0.1;
    parts.push({ name: 'Ruler', shape: { kind: 'box', size: [0.07, top, 0.015], bevel: 0.004 }, position: [rx, top / 2, rz], color: '#f6e7b4', material: 'wood', textureScale: 2 });
    const step = niceStep(p.height, 10);
    for (let hh = 0, i = 0; hh <= p.height + 1e-9 && i <= 40; hh += step, i++) {
      const major = i % 5 === 0 || Math.abs(hh - p.height) < 1e-9;
      parts.push({ name: `Ruler_Tick_${i}`, parent: 'Ruler', shape: { kind: 'box', size: [major ? 0.045 : 0.025, 0.004, 0.003] }, position: [0.035 - (major ? 0.0225 : 0.0125), hh * kd - top / 2, 0.009], color: '#212529', noPick: true });
      if (major && labels) parts.push(text(`Ruler_Tick_${i}_Label`, fmt(hh, 2, lang), [-0.05, hh * kd - top / 2, 0.01], 0.06, { parent: 'Ruler', align: 'right', plate: false, billboard: false }));
    }
    parts.push({ name: 'Ruler_Mark', shape: { kind: 'cylinder', radiusTop: 0, radiusBottom: 0.025, height: 0.06, segments: 12 }, rotation: [0, 0, -Math.PI / 2], position: [rx + 0.07, 0, rz], color: '#e63946', material: 'plastic', noPick: true, motion: (t) => ({ position: [rx + 0.07, lift(t), rz] }) });

    // Dimension lines h (load) and s (rope's end) once the lift is done.
    if (labels) {
      const T = s.time;
      const done = (t: number) => ({ visible: t >= T - 1e-6 });
      const dim = (name: string, x: number, y0: number, y1: number, label: string, color: string) => {
        parts.push({ name, shape: { kind: 'tube', from: [x, y0, 0.2], to: [x, y1, 0.2], radius: 0.008 }, color, material: 'emissive', glow: 0.9, noPick: true, motion: done });
        parts.push({ name: `${name}_End_1`, shape: { kind: 'box', size: [0.08, 0.008, 0.008] }, position: [x, y0, 0.2], color, material: 'emissive', glow: 0.9, noPick: true, motion: done });
        parts.push({ name: `${name}_End_2`, shape: { kind: 'box', size: [0.08, 0.008, 0.008] }, position: [x, y1, 0.2], color, material: 'emissive', glow: 0.9, noPick: true, motion: done });
        parts.push(text(`${name}_Label`, label, [x + 0.1, (y0 + y1) / 2, 0.2], 0.1, { color, align: 'left', motion: done }));
      };
      dim('Dim_H', loadX + side / 2 + 0.08, 0, H, `h = ${qty(p.height, 'm', lang, 2)}`, '#ffd166');
      const sx = handX + 0.55;
      dim('Dim_S', sx, H0, H0 + handDir * (s.ropeLength / p.height) * H, `s = ${qty(s.ropeLength, 'm', lang, 2)}`, EFFORT);
    }

    // Energy: bars of the useful and the total work done so far.
    if (on(modes, 'energy')) {
      const BH = 1.4;
      const bx = Math.max(handX + 1.1, 1.0);
      const w = 0.16;
      const frac = (t: number) => (s.time > 0 ? clamp(t / s.time, 0, 1) : 1);
      const bar = (name: string, x: number, value: number, color: string, word: string, symbol: string) => {
        const hFull = (value / s.total) * BH;
        parts.push({ name: `${name}_Frame`, shape: { kind: 'box', size: [w * 1.2, hFull, w * 1.2] }, position: [x, hFull / 2, 0], color: '#c8d0da', opacity: 0.14, container: true, noPick: true });
        parts.push({ name, shape: { kind: 'box', size: [w, 1, w], bevel: 0.01 }, position: [x, 0, 0], scale: [1, 1e-3, 1], color, material: 'plastic', motion: (t) => {
          const k = Math.max(1e-3, frac(t) * hFull);
          return { scale: [1, k, 1], position: [x, k / 2, 0], visible: frac(t) > 0 };
        } });
        if (labels) parts.push(text(`${name}_Label`, `${symbol} = ${q(value, 'J', lang, 1)}\n(${word})`, [x, hFull + 0.2, 0], 0.08, { color }));
      };
      bar('Bar_Useful', bx, s.useful, '#06d6a0', tr(SYM.usefulWord, lang), tr(SYM.useful, lang));
      bar('Bar_Total', bx + 0.75, s.total, EFFORT, tr(SYM.totalWord, lang), tr(SYM.total, lang));
      if (labels) parts.push(text('Bar_Efficiency_Label', `η = ${fmt(s.efficiency * 100, 1, lang)} %`, [bx + 0.375, -0.12, 0.2], 0.1, { color: '#f8f9fa', bold: true }));
    }

    // Readout: the golden rule in numbers.
    if (labels) {
      const Au = tr(SYM.useful, lang);
      const At = tr(SYM.total, lang);
      const lines = [
        `P = mg = ${qty(s.weight, 'N', lang, 1)}`,
        `F = ${qty(s.force, 'N', lang, 1)}`,
        `h = ${qty(p.height, 'm', lang, 2)},  s = ${qty(s.ropeLength, 'm', lang, 2)}`,
        `${Au} = P·h = ${q(s.useful, 'J', lang, 1)}`,
        `${At} = F·s = ${q(s.total, 'J', lang, 1)}`,
        `η = ${Au}/${At} · 100 % = ${fmt(s.efficiency * 100, 1, lang)} %`,
        `t = h/v = ${qty(s.time, 's', lang, 1)},  ${tr(SYM.power, lang)} = ${At}/t = ${q(s.power, 'W', lang, 1)}`,
      ];
      parts.push(text('Readout', lines.join('\n'), [-1.15, Yb - 0.2, 0], 0.09, { align: 'right' }));
    }
    return parts;
  },
};
