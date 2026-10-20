/**
 * `momentum` (physics 7 §35–37: momentum p = m·v, its conservation, jet
 * propulsion). Variants:
 *  - `collision`: two carts on a track collide at the right moment — elastic
 *    (they bounce) or not (they stick and go on together); Σp is the same
 *    before and after.
 *  - `push`: the carts stand pressed together on a compressed spring tied
 *    with a thread; the thread goes at 0.5 s and they fly apart:
 *    m_A·v_A = −m_B·v_B (Σp stays 0).
 *  - `rocket`: a rocket on a pad throws its fuel down as gas at speed u and
 *    goes up: M·v = m_г·u (the fuel is thrown out at once, as in the book).
 */
import type { Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import { COLORS, LABELS, L, MODE, arrowLook, boolOr, clamp, enumOr, fmt, idOr, numOr, obj, on, qty, rng, text, tr, type SimModel } from './common.js';
import { helixAlongX, q } from './mechCommon.js';

export type MomentumVariant = 'collision' | 'push' | 'rocket';
export interface Cart {
  id: string;
  /** kg */
  mass: number;
  /** m/s along the track (+ = right); ignored by `push`. */
  v: number;
}
export interface RocketParams {
  /** Rocket without fuel, kg. */
  mass: number;
  /** Fuel thrown out as gas, kg. */
  fuelMass: number;
  /** Gas speed relative to the ground, m/s. */
  gasSpeed: number;
}
export interface MomentumParams {
  variant: MomentumVariant;
  /** Exactly two carts: A on the left, B on the right. */
  carts: [Cart, Cart];
  elastic: boolean;
  rocket: RocketParams;
  /** `push`: energy stored in the compressed spring, J. */
  springEnergy: number;
}
export const DEFAULT_MOMENTUM: MomentumParams = {
  variant: 'collision',
  carts: [{ id: 'A', mass: 1, v: 1 }, { id: 'B', mass: 1, v: 0 }],
  elastic: true,
  rocket: { mass: 1, fuelMass: 0.5, gasSpeed: 200 },
  springEnergy: 0.5,
};

export function parseMomentumParams(raw: unknown): MomentumParams {
  const p = obj(raw);
  const list = Array.isArray(p.carts) ? p.carts : [];
  const cart = (i: 0 | 1): Cart => {
    const d = DEFAULT_MOMENTUM.carts[i];
    const o = obj(list[i]);
    return { id: idOr(o.id) ?? d.id, mass: numOr(o.mass, 1e-3, 1e5, d.mass), v: numOr(o.v, -1e3, 1e3, d.v) };
  };
  let carts: [Cart, Cart] = [cart(0), cart(1)];
  if (carts[0].id === carts[1].id) carts = [{ ...carts[0], id: 'A' }, { ...carts[1], id: 'B' }];
  const r = obj(p.rocket);
  const dr = DEFAULT_MOMENTUM.rocket;
  return {
    variant: enumOr(p.variant, ['collision', 'push', 'rocket'] as const, DEFAULT_MOMENTUM.variant),
    carts,
    elastic: boolOr(p.elastic, DEFAULT_MOMENTUM.elastic),
    rocket: { mass: numOr(r.mass, 1e-3, 1e7, dr.mass), fuelMass: numOr(r.fuelMass, 1e-4, 1e7, dr.fuelMass), gasSpeed: numOr(r.gasSpeed, 1e-3, 1e5, dr.gasSpeed) },
    springEnergy: numOr(p.springEnergy, 1e-4, 1e5, DEFAULT_MOMENTUM.springEnergy),
  };
}

/** Speeds after the carts meet: elastic (bounce) or perfectly inelastic (stick together). */
export function collide(a: Cart, b: Cart, elastic: boolean): { vA: number; vB: number; meet: boolean } {
  const meet = a.v - b.v > 1e-9;
  if (!meet) return { vA: a.v, vB: b.v, meet };
  const M = a.mass + b.mass;
  if (!elastic) {
    const v = (a.mass * a.v + b.mass * b.v) / M;
    return { vA: v, vB: v, meet };
  }
  return { vA: ((a.mass - b.mass) * a.v + 2 * b.mass * b.v) / M, vB: ((b.mass - a.mass) * b.v + 2 * a.mass * a.v) / M, meet };
}

/** Speeds after the spring pushes the carts apart: Σp = 0 and the spring energy turns into kinetic energy. */
export function pushApart(a: Cart, b: Cart, energy: number): { vA: number; vB: number } {
  const M = a.mass + b.mass;
  return { vA: -Math.sqrt((2 * energy * b.mass) / (a.mass * M)), vB: Math.sqrt((2 * energy * a.mass) / (b.mass * M)) };
}

/** Rocket speed when the fuel goes out at once: M·v = m_г·u. */
export const rocketSpeed = (r: RocketParams) => (r.fuelMass * r.gasSpeed) / r.mass;

const TC = 1.6; // collision moment, s
const RELEASE = 0.5; // push: the thread goes
const AFTER = 2.4; // run after the event
const PAUSE = 1.2;
// Rocket timeline.
const IGNITE = 0.8;
const BURN = 0.5;
const COAST = 2.4;
const R_HOLD = 0.6;

export function momentumDuration(p: MomentumParams): number {
  if (p.variant === 'rocket') return IGNITE + BURN + COAST + R_HOLD;
  if (p.variant === 'push') return RELEASE + AFTER;
  return TC + AFTER;
}

const CART_L = 0.44;
const U = 1.75; // cart centres stay within ±U (a short track keeps the carts large in the framing)
/** The push-apart carts start together in the middle: a shorter run is enough. */
const U_PUSH = 1.25;
export const trackHalf = (p: MomentumParams) => (p.variant === 'push' ? U_PUSH : U);
const WHEEL_R = 0.05;
const CART_COLORS = ['#118ab2', '#f4a261'];
const P_COLORS = ['#4cc9f0', '#ffd166'];

const TXT = {
  before: L('Кагылышууга чейин', 'До столкновения', 'Before the collision'),
  after: L('Кагылышуудан кийин', 'После столкновения', 'After the collision'),
  pushBefore: L('Жип күйгөнгө чейин', 'До пережигания нити', 'Before the thread burns'),
  pushAfter: L('Жип күйгөндөн кийин', 'После пережигания нити', 'After the thread burns'),
  launchBefore: L('Учурууга чейин', 'До старта', 'Before the launch'),
  launchAfter: L('Учуруудан кийин', 'После старта', 'After the launch'),
  stuck: L('бирге кыймылдайт', 'движутся вместе', 'move together'),
};

/** Positions (scene x of the cart centres) and speeds over time for the cart variants. */
export function cartMotion(p: MomentumParams) {
  const [a, b] = p.carts;
  const D = momentumDuration(p);
  if (p.variant === 'push') {
    const { vA, vB } = pushApart(a, b, p.springEnergy);
    const SC = 0.08; // compressed spring
    const run = D - RELEASE;
    const ks = clamp((U_PUSH - CART_L / 2 - SC / 2) / Math.max(Math.abs(vA) * run, Math.abs(vB) * run, 1e-9), 0.01, 2);
    const x0A = -CART_L / 2 - SC / 2;
    const x0B = CART_L / 2 + SC / 2;
    const dt = (t: number) => Math.max(0, t - RELEASE);
    return {
      ks, event: RELEASE, before: [0, 0] as const, after: [vA, vB] as const, stuck: false,
      xA: (t: number) => x0A + ks * vA * dt(t),
      xB: (t: number) => x0B + ks * vB * dt(t),
      vA: (t: number) => (t >= RELEASE ? vA : 0),
      vB: (t: number) => (t >= RELEASE ? vB : 0),
    };
  }
  const c = collide(a, b, p.elastic);
  if (!c.meet) {
    // They never meet: they just keep their speeds, starting a little apart.
    const GAP = 0.6;
    const offs = [0, a.v * D, 0, b.v * D];
    const span = Math.max(...offs) - Math.min(...offs);
    const ks = clamp((2 * U - CART_L - GAP) / Math.max(span, 1e-9), 0.01, 2);
    const lo = Math.min(-CART_L / 2 - GAP / 2 + ks * Math.min(0, a.v * D), CART_L / 2 + GAP / 2 + ks * Math.min(0, b.v * D));
    const hi = Math.max(-CART_L / 2 - GAP / 2 + ks * Math.max(0, a.v * D), CART_L / 2 + GAP / 2 + ks * Math.max(0, b.v * D));
    const xc = -(lo + hi) / 2;
    return {
      ks, event: Infinity, before: [a.v, b.v] as const, after: [a.v, b.v] as const, stuck: false,
      xA: (t: number) => xc - CART_L / 2 - GAP / 2 + ks * a.v * t,
      xB: (t: number) => xc + CART_L / 2 + GAP / 2 + ks * b.v * t,
      vA: () => a.v,
      vB: () => b.v,
    };
  }
  // A's front meets B's back at xc at t = TC.
  const after = D - TC;
  const offA = [-a.v * TC, 0, c.vA * after];
  const offB = [-b.v * TC, 0, c.vB * after];
  const span = Math.max(...offA, ...offB) - Math.min(...offA, ...offB);
  const ks = clamp((2 * U - CART_L) / Math.max(span, 1e-9), 0.01, 2);
  const lo = Math.min(-CART_L / 2 + ks * Math.min(...offA), CART_L / 2 + ks * Math.min(...offB));
  const hi = Math.max(-CART_L / 2 + ks * Math.max(...offA), CART_L / 2 + ks * Math.max(...offB));
  const xc = -(lo + hi) / 2;
  const x = (v0: number, v1: number, side: number) => (t: number) => xc + side * (CART_L / 2) + ks * (t < TC ? v0 * (t - TC) : v1 * (t - TC));
  return {
    ks, event: TC, before: [a.v, b.v] as const, after: [c.vA, c.vB] as const, stuck: !p.elastic, contact: xc,
    xA: x(a.v, c.vA, -1),
    xB: x(b.v, c.vB, 1),
    vA: (t: number) => (t < TC ? a.v : c.vA),
    vB: (t: number) => (t < TC ? b.v : c.vB),
  };
}

export const momentum: SimModel = {
  id: 'momentum',
  modes: [MODE.vectors(true), LABELS],
  clock(raw, pb, free) {
    const D = momentumDuration(parseMomentumParams(raw));
    if (pb) return pb.fraction * D;
    return Math.min(free % (D + PAUSE), D);
  },
  build(raw, ctx) {
    const p = parseMomentumParams(raw);
    return p.variant === 'rocket' ? buildRocket(p, ctx) : buildCarts(p, ctx);
  },
};

type Ctx = Parameters<SimModel['build']>[1];

function buildCarts(p: MomentumParams, { modes, lang = 'ru' }: Ctx): Part[] {
  const m = cartMotion(p);
  const labels = on(modes, 'labels');
  const push = p.variant === 'push';
  const TL = 2 * trackHalf(p) + CART_L + 0.3;
  const parts: Part[] = [
    { name: 'Track', shape: { kind: 'box', size: [TL, 0.04, 0.5], bevel: 0.012 }, position: [0, -0.02, 0], color: '#5c6676', material: 'brushed' },
    { name: 'Track_Rail_1', parent: 'Track', shape: { kind: 'box', size: [TL, 0.025, 0.025] }, position: [0, 0.03, 0.12], color: COLORS.steel, material: 'metal', noPick: true },
    { name: 'Track_Rail_2', parent: 'Track', shape: { kind: 'box', size: [TL, 0.025, 0.025] }, position: [0, 0.03, -0.12], color: COLORS.steel, material: 'metal', noPick: true },
    { name: 'Track_Stop_1', parent: 'Track', shape: { kind: 'box', size: [0.05, 0.14, 0.5], bevel: 0.01 }, position: [-TL / 2 + 0.025, 0.09, 0], color: '#3d4654', material: 'plastic', noPick: true },
    { name: 'Track_Stop_2', parent: 'Track', shape: { kind: 'box', size: [0.05, 0.14, 0.5], bevel: 0.01 }, position: [TL / 2 - 0.025, 0.09, 0], color: '#3d4654', material: 'plastic', noPick: true },
  ];
  // Scale marks every 0.5 m (of the shown track).
  for (let i = 0, x = -Math.floor(TL / 2 / 0.5) * 0.5; x <= TL / 2 - 0.05 && i < 30; x += 0.5, i++) {
    parts.push({ name: `Track_Mark_${i + 1}`, parent: 'Track', shape: { kind: 'box', size: [0.008, 0.004, 0.08] }, position: [x, 0.022, 0.2], color: '#f8f9fa', noPick: true });
  }
  const carts = p.carts;
  const pos = [m.xA, m.xB];
  const BODY_TOP = 0.21;
  const tops = [BODY_TOP, BODY_TOP];
  carts.forEach((c, i) => {
    const N = `Cart_${c.id}`;
    const x = pos[i];
    // Extra mass rides on the cart as a stack of plates (one per ~kilogram, at most 4).
    const plates = clamp(Math.round(c.mass), 1, 4);
    tops[i] = BODY_TOP + plates * 0.038;
    parts.push({ name: N, shape: { kind: 'group' }, position: [x(0), 0, 0], motion: (t) => ({ position: [x(t), 0, 0] }) });
    parts.push({ name: `${N}_Body`, parent: N, shape: { kind: 'box', size: [CART_L, 0.12, 0.3], bevel: 0.02 }, position: [0, 0.07 + 0.06 + 0.02, 0], color: CART_COLORS[i], material: 'plastic' });
    for (let k = 0; k < plates; k++) {
      parts.push({ name: `${N}_Plate_${k + 1}`, parent: N, shape: { kind: 'box', size: [CART_L * 0.6, 0.035, 0.22], bevel: 0.008 }, position: [0, BODY_TOP + 0.018 + k * 0.038, 0], color: '#8d99ae', material: 'metal', noPick: true });
    }
    ([[0.14, 0.12], [-0.14, 0.12], [0.14, -0.12], [-0.14, -0.12]] as const).forEach(([wx, wz], k) => {
      const spin = (t: number): Vec3 => [Math.PI / 2, -(x(t) - x(0)) / WHEEL_R, 0];
      parts.push({ name: `${N}_Wheel_${k + 1}`, parent: N, shape: { kind: 'cylinder', radiusTop: WHEEL_R, radiusBottom: WHEEL_R, height: 0.03, segments: 20 }, position: [wx, WHEEL_R + 0.04, wz + Math.sign(wz) * 0.02], rotation: spin(0), color: '#1e2229', material: 'rubber', motion: (t) => ({ rotation: spin(t) }) });
      parts.push({ name: `${N}_Wheel_${k + 1}_Hub`, parent: `${N}_Wheel_${k + 1}`, shape: { kind: 'box', size: [0.06, 0.032, 0.015] }, color: COLORS.steel, material: 'metal', noPick: true });
    });
    if (labels) parts.push(text(`${N}_Label`, `${c.id}: ${qty(c.mass, 'kg', lang, 2)}`, [0, 0.15, 0.152], 0.07, { parent: N, billboard: false, plate: false, color: '#f8f9fa', bold: true }));
  });
  const A = `Cart_${carts[0].id}`;
  const B = `Cart_${carts[1].id}`;
  if (!push) {
    if (p.elastic) {
      // A springy bumper on A's nose (elastic collision).
      parts.push({ name: `${A}_Bumper`, parent: A, shape: { kind: 'torus', radius: 0.06, tube: 0.008, segments: 24 }, position: [CART_L / 2 + 0.005, 0.15, 0], rotation: [0, Math.PI / 2, 0], color: COLORS.steel, material: 'metal' });
    } else {
      // Plasticine on both noses: they stick.
      parts.push({ name: `${A}_Clay`, parent: A, shape: { kind: 'sphere', radius: 0.04, widthSegments: 16 }, position: [CART_L / 2 - 0.012, 0.15, 0], scale: [0.4, 1, 1], color: '#9ef01a', material: 'matte' });
      parts.push({ name: `${B}_Clay`, parent: B, shape: { kind: 'sphere', radius: 0.04, widthSegments: 16 }, position: [-CART_L / 2 + 0.012, 0.15, 0], scale: [0.4, 1, 1], color: '#9ef01a', material: 'matte' });
    }
    if (Number.isFinite(m.event)) {
      // A flash where they meet.
      const t0 = m.event;
      parts.push({ name: 'Impact', shape: { kind: 'icosahedron', radius: 0.09, detail: 0 }, position: [m.xA(t0) + CART_L / 2, 0.16, 0], color: '#fff3b0', material: 'emissive', glow: 1.6, noPick: true, halo: { color: '#ffe066', size: 0.6, strength: 0.7 }, motion: (t) => {
        const k = (t - t0) / 0.3;
        return { visible: k >= 0 && k <= 1, scale: [1 + k, 1 + k, 1 + k] };
      } });
    }
  } else {
    // Spring on A's nose, held compressed by a thread until RELEASE, then free to its rest length.
    const REST = 0.26;
    const SC = 0.08;
    const len = (t: number) => clamp(m.xB(t) - m.xA(t) - CART_L, SC, REST);
    parts.push({ name: 'Spring', shape: { kind: 'group' }, motion: (t) => ({ position: [m.xA(t) + CART_L / 2, 0.15, 0] }), position: [m.xA(0) + CART_L / 2, 0.15, 0] });
    parts.push({ name: 'Spring_Coil', parent: 'Spring', shape: { kind: 'polyline', points: helixAlongX(9, 0.045), radius: 0.006 }, scale: [SC, 1, 1], color: '#d9dde3', material: 'metal', motion: (t) => ({ scale: [len(t), 1, 1] }) });
    parts.push({ name: 'Spring_Plate', parent: 'Spring', shape: { kind: 'cylinder', radiusTop: 0.055, radiusBottom: 0.055, height: 0.01, segments: 24 }, rotation: [0, 0, Math.PI / 2], color: COLORS.steel, material: 'metal', motion: (t) => ({ position: [len(t), 0, 0] }), position: [SC, 0, 0] });
    parts.push({ name: 'Thread', shape: { kind: 'tube', from: [m.xA(0) - CART_L / 2 + 0.05, 0.215, 0.152], to: [m.xB(0) + CART_L / 2 - 0.05, 0.215, 0.152], radius: 0.004 }, color: '#f8f9fa', material: 'matte', motion: (t) => ({ visible: t < RELEASE }) });
    parts.push({ name: 'Thread_Flame', shape: { kind: 'cylinder', radiusTop: 0, radiusBottom: 0.025, height: 0.08, segments: 12 }, position: [0, 0.255, 0.152], color: '#ffb703', material: 'emissive', glow: 1.5, noPick: true, halo: { color: '#ffb703', size: 0.3, strength: 0.6 }, motion: (t) => ({ visible: t > RELEASE - 0.35 && t < RELEASE + 0.1 }) });
  }

  // Momentum arrows above the carts: one per phase (before / after the event).
  const pv = (i: number, v: number) => carts[i].mass * v;
  const all = [0, 1].flatMap((i) => [pv(i, m.before[i]), pv(i, m.after[i])]).map(Math.abs);
  const kP = 1.1 / Math.max(...all, 1e-9);
  if (on(modes, 'vectors')) {
    carts.forEach((c, i) => {
      const N = `Arrow_Momentum_${c.id}`;
      const y = Math.max(...tops) + 0.25 + (m.stuck ? i * 0.3 : 0);
      parts.push({ name: N, shape: { kind: 'group' }, motion: (t) => ({ position: [pos[i](t), y, 0] }), position: [pos[i](0), y, 0] });
      ([m.before[i], m.after[i]] as const).forEach((v, k) => {
        const pp = pv(i, v);
        if (Math.abs(pp) < 1e-9) return;
        const show = (t: number) => ({ visible: k === 0 ? t < m.event : t >= m.event });
        const L0 = Math.max(0.12, Math.abs(pp) * kP) * Math.sign(pp);
        parts.push({ name: `${N}_${k + 1}`, parent: N, shape: { kind: 'arrow', from: [-L0 / 2, 0, 0], vector: [L0, 0, 0], radius: 0.026 }, color: P_COLORS[i], ...arrowLook, motion: show });
        if (labels) parts.push(text(`${N}_${k + 1}_Label`, `p${c.id} = ${q(pp, 'kg·m/s', lang, 2)}`, [0, 0.16, 0], 0.09, { parent: N, color: P_COLORS[i], motion: show }));
      });
    });
  }

  if (labels) {
    const [a, b] = carts;
    const line = (i: number, v: number, prime: string) => `p${carts[i].id}${prime} = ${qty(carts[i].mass, 'kg', lang, 2)} · ${qty(v, 'm/s', lang, 2)} = ${q(pv(i, v), 'kg·m/s', lang, 2)}`;
    const sum = (v: readonly [number, number], prime: string) => `Σp${prime} = ${q(pv(0, v[0]) + pv(1, v[1]), 'kg·m/s', lang, 2)}`;
    const head = push ? [TXT.pushBefore, TXT.pushAfter] : [TXT.before, TXT.after];
    const y = Math.max(...tops) + 1.2;
    const before = [tr(head[0], lang), line(0, m.before[0], ''), line(1, m.before[1], ''), sum(m.before, '')];
    parts.push(text('Readout_Before', before.join('\n'), [-1.25, y, 0], 0.1));
    if (Number.isFinite(m.event)) {
      const after = [tr(head[1], lang), line(0, m.after[0], '′'), line(1, m.after[1], '′'), sum(m.after, '′')];
      if (m.stuck) after.splice(3, 0, `${a.id}+${b.id}: ${tr(TXT.stuck, lang)}, v′ = ${qty(m.after[0], 'm/s', lang, 2)}`);
      parts.push(text('Readout_After', after.join('\n'), [1.25, y, 0], 0.1, { motion: (t) => ({ visible: t >= m.event }) }));
    }
    if (Math.abs(m.ks - 1) > 1e-6) parts.push(text('Scale_Note', `${tr(L('Жол масштабы', 'Масштаб пути', 'Path scale'), lang)} ×${fmt(m.ks, 2, lang)}`, [0, -0.12, 0.45], 0.07));
  }
  return parts;
}

const EXHAUST_N = 80;

function buildRocket(p: MomentumParams, { modes, lang = 'ru' }: Ctx): Part[] {
  const r = p.rocket;
  const v = rocketSpeed(r);
  const labels = on(modes, 'labels');
  const PAD = 0.12;
  const BODY = 0.9;
  const RR = 0.11;
  // Shown flight: speeds up during the burn, then coasts up and slows (scene units, not to scale).
  const VD = 2.4;
  const GD = VD / COAST;
  const yOf = (t: number) => {
    const tb = t - IGNITE;
    if (tb <= 0) return 0;
    if (tb <= BURN) return 0.5 * (VD / BURN) * tb * tb;
    const tc = Math.min(tb - BURN, COAST);
    return 0.5 * VD * BURN + VD * tc - 0.5 * GD * tc * tc;
  };
  const base = PAD + 0.12; // rocket bottom at rest (on its fins)
  const parts: Part[] = [
    { name: 'Pad', shape: { kind: 'cylinder', radiusTop: 0.6, radiusBottom: 0.7, height: PAD, segments: 48 }, position: [0, PAD / 2, 0], color: '#6c757d', material: 'matte' },
    { name: 'Pad_Ring', parent: 'Pad', shape: { kind: 'torus', radius: 0.45, tube: 0.015, segments: 48 }, position: [0, PAD / 2 + 0.002, 0], rotation: [Math.PI / 2, 0, 0], color: '#ffd166', material: 'emissive', glow: 0.5, noPick: true },
    { name: 'Pad_Tower', parent: 'Pad', shape: { kind: 'box', size: [0.08, BODY + 0.6, 0.08], bevel: 0.01 }, position: [-0.5, (BODY + 0.6) / 2 + PAD / 2, 0], color: '#e63946', material: 'metal', noPick: true },
    { name: 'Rocket', shape: { kind: 'group' }, position: [0, base, 0], motion: (t) => ({ position: [0, base + yOf(t), 0] }) },
    { name: 'Rocket_Body', parent: 'Rocket', shape: { kind: 'cylinder', radiusTop: RR, radiusBottom: RR, height: BODY, segments: 40 }, position: [0, BODY / 2, 0], color: '#f1f3f5', material: 'plastic' },
    { name: 'Rocket_Band', parent: 'Rocket', shape: { kind: 'cylinder', radiusTop: RR * 1.01, radiusBottom: RR * 1.01, height: 0.08, segments: 40 }, position: [0, BODY * 0.7, 0], color: '#e63946', material: 'plastic', noPick: true },
    { name: 'Rocket_Window', parent: 'Rocket', shape: { kind: 'cylinder', radiusTop: 0.04, radiusBottom: 0.04, height: 0.02, segments: 24 }, position: [0, BODY * 0.55, RR], rotation: [Math.PI / 2, 0, 0], color: '#4cc9f0', material: 'glass', noPick: true },
    { name: 'Rocket_Nose', parent: 'Rocket', shape: { kind: 'cylinder', radiusTop: 0, radiusBottom: RR, height: 0.3, segments: 40 }, position: [0, BODY + 0.15, 0], color: '#e63946', material: 'plastic' },
    { name: 'Rocket_Nozzle', parent: 'Rocket', shape: { kind: 'cylinder', radiusTop: RR * 0.5, radiusBottom: RR * 0.75, height: 0.1, segments: 24 }, position: [0, -0.05, 0], color: '#495057', material: 'metal' },
  ];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    parts.push({ name: `Rocket_Fin_${i + 1}`, parent: 'Rocket', shape: { kind: 'box', size: [0.16, 0.24, 0.02], bevel: 0.006 }, position: [Math.cos(a) * (RR + 0.07), 0.0, Math.sin(a) * (RR + 0.07)], rotation: [0, -a, 0], color: '#e63946', material: 'plastic', noPick: true });
  }
  // Fuel inside the body (shown through a cut-away stripe), gone after the burn.
  parts.push({ name: 'Rocket_Fuel', parent: 'Rocket', shape: { kind: 'box', size: [0.05, BODY * 0.45, 0.01] }, position: [0, BODY * 0.25, RR + 0.002], color: '#ff9f1c', material: 'emissive', glow: 0.6, noPick: true, motion: (t) => {
    const k = 1 - clamp((t - IGNITE) / BURN, 0, 1);
    return { scale: [1, Math.max(1e-3, k), 1], position: [0, 0.02 + (BODY * 0.45 * k) / 2, RR + 0.002], visible: k > 1e-3 };
  } });

  // Flame while the fuel burns.
  parts.push({ name: 'Exhaust_Flame', parent: 'Rocket', shape: { kind: 'cylinder', radiusTop: RR * 0.6, radiusBottom: 0, height: 0.45, segments: 20 }, position: [0, -0.32, 0], color: '#ffb703', material: 'emissive', glow: 1.6, opacity: 0.9, container: true, noPick: true, halo: { color: '#ff9f1c', size: 0.9, strength: 0.6 }, motion: (t) => {
    const on1 = t >= IGNITE && t < IGNITE + BURN;
    return { visible: on1, scale: [1, 1 + 0.15 * Math.sin(t * 40) + 0.1 * Math.sin(t * 67), 1] };
  } });
  // Gas particles: each leaves the nozzle at its moment, shoots down, then spreads over the pad.
  const R = rng(7);
  const seeds = Array.from({ length: EXHAUST_N }, (_, i) => ({ birth: IGNITE + (BURN * i) / EXHAUST_N, ang: R() * Math.PI * 2, spread: 0.15 + R() * 0.25, speed: 4 + R() * 2, out: 0.6 + R() * 0.9, lift: R() * 0.25 }));
  const floorY = PAD + 0.05;
  parts.push({
    name: 'Exhaust', shape: { kind: 'instances', positions: seeds.map(() => [0, base + 0.3, 0] as Vec3), radius: 0.045 }, color: '#ffc87a', material: 'emissive', glow: 0.7, noPick: true,
    motion: (t) => ({ visible: t >= IGNITE }),
    instanceMotion: (t, i) => {
      const s = seeds[i];
      const dt = t - s.birth;
      if (dt < 0) return [0, base + yOf(t) + 0.3, 0];
      const y0 = base + yOf(s.birth) - 0.1;
      const fall = y0 - floorY;
      const tf = fall / s.speed;
      if (dt <= tf) {
        const k = dt / tf;
        return [Math.cos(s.ang) * s.spread * k, y0 - s.speed * dt, Math.sin(s.ang) * s.spread * k];
      }
      // On the pad: rolls outwards and slows down, rising a little like smoke.
      const d = s.spread + s.out * (1 - Math.exp(-(dt - tf) * 2.2));
      return [Math.cos(s.ang) * d, floorY + s.lift * (1 - Math.exp(-(dt - tf) * 1.5)), Math.sin(s.ang) * d];
    },
  });

  // Momenta: the rocket's up, the gas's down — equal in size.
  const pr = r.mass * v;
  const pg = r.fuelMass * r.gasSpeed;
  if (on(modes, 'vectors')) {
    const len = 0.7;
    const show = (t: number) => ({ visible: t >= IGNITE });
    parts.push({ name: 'Arrow_Momentum_Rocket', parent: 'Rocket', shape: { kind: 'arrow', from: [RR + 0.28, BODY * 0.5, 0], vector: [0, len, 0], radius: 0.03 }, color: P_COLORS[0], ...arrowLook, motion: show });
    parts.push({ name: 'Arrow_Momentum_Gas', shape: { kind: 'arrow', from: [0.7, base + 0.75, 0], vector: [0, -len * (pg / pr), 0], radius: 0.03 }, color: P_COLORS[1], ...arrowLook, position: [0, 0, 0], motion: (t) => ({ visible: t >= IGNITE && t < IGNITE + BURN + 0.8, position: [0, yOf(Math.min(t, IGNITE + BURN)), 0] }) });
    if (labels) {
      parts.push(text('Arrow_Momentum_Rocket_Label', `M·v = ${q(pr, 'kg·m/s', lang, 1)}`, [RR + 0.3, BODY * 0.5 + len + 0.15, 0], 0.09, { parent: 'Rocket', color: P_COLORS[0], motion: show }));
      parts.push(text('Arrow_Momentum_Gas_Label', `mг·u = ${q(pg, 'kg·m/s', lang, 1)}`, [1.2, base + 0.4, 0], 0.09, { color: P_COLORS[1], motion: (t) => ({ visible: t >= IGNITE && t < IGNITE + BURN + 0.8 }) }));
    }
  }
  if (labels) {
    const head = [tr(TXT.launchBefore, lang), `Σp = 0`, `M = ${qty(r.mass, 'kg', lang, 2)}, mг = ${qty(r.fuelMass, 'kg', lang, 2)}`];
    parts.push(text('Readout_Before', head.join('\n'), [-1.5, 1.6, 0], 0.1, { motion: (t) => ({ visible: t < IGNITE }) }));
    const after = [
      tr(TXT.launchAfter, lang),
      `mг·u = ${qty(r.fuelMass, 'kg', lang, 2)} · ${qty(r.gasSpeed, 'm/s', lang, 1)} = ${q(pg, 'kg·m/s', lang, 1)}`,
      `M·v = mг·u  →  v = mг·u / M = ${qty(v, 'm/s', lang, 1)}`,
      `Σp = M·v − mг·u = 0`,
    ];
    parts.push(text('Readout_After', after.join('\n'), [-1.5, 1.6, 0], 0.1, { motion: (t) => ({ visible: t >= IGNITE }) }));
  }
  return parts;
}
