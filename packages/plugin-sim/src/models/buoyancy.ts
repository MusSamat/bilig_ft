/**
 * `buoyancy` (physics 7, §14–16, §31–34): density and Archimedes' force.
 *
 * - `dynamometer` — a body on a spring scale is lowered into an overflow
 *   vessel: the reading falls from P to P₁ = P − F_A while the displaced
 *   liquid runs into a cup (Archimedes' bucket).
 * - `float` — bodies dropped into a wide tank settle: sink (ρ_body > ρ_liquid),
 *   float with the submerged share ρ_body/ρ_liquid, or hover when equal.
 * - `balloon` — a gas balloon with a basket rises in air when F_A > P.
 * - `compare` — bodies of different materials on a two-pan balance, equal
 *   masses (sizes differ) or equal volumes (masses differ): ρ = m/V.
 *
 * Geometry is computed in metres and drawn at a scale fitted to the scene.
 */
import type { Lang, Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import {
  COLORS, LABELS, MODE, L, arrowLook, beaker, clamp, enumOr, idOr, listOf, niceStep, numOr, obj, on, smooth, text, tr, uniqueBy,
  type SimModel,
} from './common.js';
import { LIQUIDS, LIQUID_IDS, liquidLook, num, q, type LiquidId } from './pressure.js';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const MATERIALS = {
  iron: { rho: 7800, name: L('темир', 'железо', 'iron'), look: { color: '#7d858f', material: 'metal', roughness: 0.4 } },
  aluminium: { rho: 2700, name: L('алюминий', 'алюминий', 'aluminium'), look: { color: '#d0d6dd', material: 'brushed' } },
  copper: { rho: 8900, name: L('жез', 'медь', 'copper'), look: { color: '#c87533', material: 'copper' } },
  stone: { rho: 2600, name: L('таш', 'камень', 'stone'), look: { color: '#8f8a80', material: 'matte' } },
  wood: { rho: 600, name: L('жыгач', 'дерево', 'wood'), look: { color: '#c8955a', material: 'wood' } },
  ice: { rho: 900, name: L('муз', 'лёд', 'ice'), look: { color: '#dff4ff', material: 'plastic', container: true, opacity: 0.8, roughness: 0.05 } },
  cork: { rho: 240, name: L('пробка', 'пробка', 'cork'), look: { color: '#b98b5e', material: 'matte' } },
  paraffin: { rho: 900, name: L('парафин', 'парафин', 'paraffin'), look: { color: '#f3eedb', material: 'matte' } },
} as const satisfies Record<string, { rho: number; name: unknown; look: Partial<Part> }>;
export type MaterialId = keyof typeof MATERIALS;
export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];

export const RHO_AIR = 1.29;
export const GASES = {
  helium: { rho: 0.18, name: L('гелий', 'гелий', 'helium') },
  hydrogen: { rho: 0.09, name: L('суутек', 'водород', 'hydrogen') },
} as const;
export type GasId = keyof typeof GASES;

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export const BUOYANCY_VARIANTS = ['dynamometer', 'float', 'balloon', 'compare'] as const;
export type BuoyancyVariant = (typeof BUOYANCY_VARIANTS)[number];
export const SHAPES = ['cube', 'sphere', 'cylinder'] as const;
export type BodyShape = (typeof SHAPES)[number];

export interface Body {
  id: string;
  material: MaterialId;
  /** m³ */
  volume: number;
  shape: BodyShape;
}
export interface BuoyancyParams {
  variant: BuoyancyVariant;
  liquid: LiquidId;
  bodies: Body[];
  /** dynamometer: share of the body's volume lowered under the surface, 0–1. */
  submerged: number;
  g: number;
  /** compare: bodies of equal mass (volumes follow) or equal volume (masses follow). */
  equal: 'mass' | 'volume';
  /** compare, equal mass: the mass, kg (default: the first body's ρ·V). */
  mass: number | null;
  /** balloon: volume of the envelope, m³. */
  balloonVolume: number;
  /** balloon: envelope + basket + cargo, kg. */
  payload: number;
  gas: GasId;
}

const body = (id: string, material: MaterialId, volume = 1e-4, shape: BodyShape = 'cube'): Body => ({ id, material, volume, shape });
/** Bodies when the params give none. */
export const DEFAULT_BODIES: Record<BuoyancyVariant, Body[]> = {
  dynamometer: [body('A', 'iron')],
  float: [body('A', 'iron'), body('B', 'wood'), body('C', 'ice')],
  balloon: [],
  compare: [body('A', 'iron'), body('B', 'wood')],
};
export const MAX_BODIES = 5;
export const DEFAULT_BUOYANCY: BuoyancyParams = {
  variant: 'dynamometer', liquid: 'water', bodies: DEFAULT_BODIES.dynamometer, submerged: 1, g: 9.8,
  equal: 'mass', mass: null, balloonVolume: 0.02, payload: 0.01, gas: 'helium',
};

export function parseBuoyancyParams(raw: unknown): BuoyancyParams {
  const p = obj(raw);
  const D = DEFAULT_BUOYANCY;
  const variant = enumOr(p.variant, BUOYANCY_VARIANTS, D.variant);
  const bodies = uniqueBy(
    listOf(p.bodies, (x): Body | null => {
      const o = obj(x);
      const id = idOr(o.id);
      if (!id) return null;
      return { id, material: enumOr(o.material, MATERIAL_IDS, 'iron'), volume: numOr(o.volume, 1e-7, 1, 1e-4), shape: enumOr(o.shape, SHAPES, 'cube') };
    }),
    (b) => b.id,
  ).slice(0, MAX_BODIES);
  const mass = numOr(p.mass, 1e-5, 1e4, NaN);
  return {
    variant,
    liquid: enumOr(p.liquid, LIQUID_IDS, D.liquid),
    bodies: bodies.length ? bodies : DEFAULT_BODIES[variant],
    submerged: numOr(p.submerged, 0, 1, D.submerged),
    g: numOr(p.g, 0.1, 100, D.g),
    equal: enumOr(p.equal, ['mass', 'volume'] as const, D.equal),
    mass: Number.isFinite(mass) ? mass : null,
    balloonVolume: numOr(p.balloonVolume, 1e-4, 1e4, D.balloonVolume),
    payload: numOr(p.payload, 0, 1e4, D.payload),
    gas: enumOr(p.gas, Object.keys(GASES) as GasId[], D.gas),
  };
}

// ---------------------------------------------------------------------------
// Physics and geometry
// ---------------------------------------------------------------------------

export interface BodyGeom {
  /** Horizontal size and height, m. */
  w: number;
  h: number;
  /** Share of the volume below a plane `d` m above the bottom (0–1). */
  shareAt(d: number): number;
  /** Depth of the bottom below the surface for a submerged share `s`. */
  depthFor(s: number): number;
  shape: Part['shape'];
}
export function bodyGeom(shape: BodyShape, V: number, K = 1): BodyGeom {
  if (shape === 'sphere') {
    const r = Math.cbrt((3 * V) / (4 * Math.PI));
    const cap = (d: number) => {
      const x = clamp(d, 0, 2 * r);
      return (Math.PI * x * x * (3 * r - x)) / 3 / V;
    };
    return {
      w: 2 * r, h: 2 * r, shareAt: cap,
      depthFor(s) {
        const t = clamp(s, 0, 1);
        let lo = 0;
        let hi = 2 * r;
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2;
          if (cap(mid) < t) lo = mid;
          else hi = mid;
        }
        return (lo + hi) / 2;
      },
      shape: { kind: 'sphere', radius: r * K, widthSegments: 40 },
    };
  }
  if (shape === 'cylinder') {
    const r = Math.cbrt(V / (2 * Math.PI));
    return { w: 2 * r, h: 2 * r, shareAt: (d) => clamp(d / (2 * r), 0, 1), depthFor: (s) => clamp(s, 0, 1) * 2 * r, shape: { kind: 'cylinder', radiusTop: r * K, radiusBottom: r * K, height: 2 * r * K, segments: 40 } };
  }
  const a = Math.cbrt(V);
  return { w: a, h: a, shareAt: (d) => clamp(d / a, 0, 1), depthFor: (s) => clamp(s, 0, 1) * a, shape: { kind: 'box', size: [a * K, a * K, a * K], bevel: a * 0.04 * K } };
}

/** F_A = ρ_liquid·g·V_submerged, N. */
export const buoyantForce = (rhoLiquid: number, g: number, V: number) => rhoLiquid * g * V;

export type Fate = 'sinks' | 'floats' | 'hovers';
/** Sinks when denser than the liquid, floats when lighter (submerged share ρ_b/ρ_l), hovers when equal. */
export function fateOf(rhoBody: number, rhoLiquid: number): { fate: Fate; share: number } {
  const r = rhoBody / rhoLiquid;
  if (Math.abs(r - 1) < 1e-3) return { fate: 'hovers', share: 1 };
  return r > 1 ? { fate: 'sinks', share: 1 } : { fate: 'floats', share: r };
}

export interface DynamometerState {
  /** Weight in air, N. */
  weight: number;
  /** Submerged share actually reached (a lighter body floats and the spring goes slack). */
  share: number;
  buoyant: number;
  /** Reading in the liquid, N. */
  reading: number;
  /** Liquid run into the cup, m³. */
  displaced: number;
}
export function dynamometerState(p: BuoyancyParams, b: Body = p.bodies[0]): DynamometerState {
  const rhoL = LIQUIDS[p.liquid].rho;
  const rhoB = MATERIALS[b.material].rho;
  const share = Math.min(p.submerged, rhoB < rhoL ? rhoB / rhoL : 1);
  const weight = rhoB * b.volume * p.g;
  const buoyant = buoyantForce(rhoL, p.g, b.volume * share);
  return { weight, share, buoyant, reading: Math.max(0, weight - buoyant), displaced: b.volume * share };
}

export interface BalloonState {
  buoyant: number;
  gasMass: number;
  weight: number;
  net: number;
  rises: boolean;
}
export function balloonState(p: BuoyancyParams): BalloonState {
  const buoyant = buoyantForce(RHO_AIR, p.g, p.balloonVolume);
  const gasMass = GASES[p.gas].rho * p.balloonVolume;
  const weight = (gasMass + p.payload) * p.g;
  return { buoyant, gasMass, weight, net: buoyant - weight, rises: buoyant > weight };
}

export interface CompareItem {
  body: Body;
  mass: number;
  volume: number;
  rho: number;
}
export function compareItems(p: BuoyancyParams): CompareItem[] {
  const first = p.bodies[0];
  const m0 = p.mass ?? MATERIALS[first.material].rho * first.volume;
  return p.bodies.map((b) => {
    const rho = MATERIALS[b.material].rho;
    return p.equal === 'mass' ? { body: b, mass: m0, volume: m0 / rho, rho } : { body: b, mass: rho * b.volume, volume: b.volume, rho };
  });
}

// ---------------------------------------------------------------------------
// Texts
// ---------------------------------------------------------------------------

const T = {
  rhoL: L('ρс', 'ρж', 'ρl'),
  vb: L('Vн', 'Vт', 'Vb'),
  air: L('абада', 'в воздухе', 'in air'),
  inLiquid: L('суюктукта', 'в жидкости', 'in liquid'),
  fate: {
    sinks: L('чөгөт', 'тонет', 'sinks'),
    floats: L('калкып жүрөт', 'плавает', 'floats'),
    hovers: L('суюктуктун ичинде сүзүп жүрөт', 'плавает внутри жидкости', 'hovers inside'),
  },
  rule: L('ρт > ρс — чөгөт,  ρт < ρс — калкып жүрөт', 'ρт > ρж — тонет,  ρт < ρж — всплывает', 'ρb > ρl — sinks,  ρb < ρl — floats'),
  rhoAir: L('ρаба', 'ρвозд', 'ρair'),
  load: L('mжүк', 'mгруза', 'mload'),
  gasM: L('mгаз', 'mгаза', 'mgas'),
  rises: L('F_A > P — шар көтөрүлөт', 'F_A > P — шар поднимается', 'F_A > P — the balloon rises'),
  stays: L('F_A ≤ P — шар көтөрүлбөйт', 'F_A ≤ P — шар не поднимается', 'F_A ≤ P — the balloon stays down'),
  equalMass: L('Массалары бирдей, көлөмдөрү ар башка', 'Массы равны, объёмы разные', 'Equal masses, different volumes'),
  equalVolume: L('Көлөмдөрү бирдей, массалары ар башка', 'Объёмы равны, массы разные', 'Equal volumes, different masses'),
};
const mat = (b: Body, lang: Lang) => tr(MATERIALS[b.material].name, lang);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Volume in cm³ below 10 litres, else m³. */
const vol = (V: number, lang: Lang) => (V < 0.01 ? q(V * 1e6, 'cm³', lang) : q(V, 'm³', lang));

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const DYN_T = 9;
const BAL_WAIT = 1;

export const buoyancy: SimModel = {
  id: 'buoyancy',
  modes: [MODE.vectors(true), LABELS],
  clock(raw, pb, free) {
    const p = parseBuoyancyParams(raw);
    const period = periodOf(p);
    if (pb) return p.variant === 'dynamometer' ? pb.fraction * DYN_T * 0.75 : pb.time;
    return free % period;
  },
  build(raw, { modes, lang = 'ru' }) {
    const p = parseBuoyancyParams(raw);
    const o: Opts = { lang, labels: on(modes, 'labels'), vectors: on(modes, 'vectors') };
    switch (p.variant) {
      case 'float': return buildFloat(p, o);
      case 'balloon': return buildBalloon(p, o);
      case 'compare': return buildCompare(p, o);
      default: return buildDynamometer(p, o);
    }
  },
};

function periodOf(p: BuoyancyParams): number {
  if (p.variant === 'dynamometer') return DYN_T;
  if (p.variant === 'float') return 0.5 + 0.6 * (p.bodies.length - 1) + 5.5;
  if (p.variant === 'balloon') return BAL_WAIT + 6;
  return 8;
}

interface Opts {
  lang: Lang;
  labels: boolean;
  vectors: boolean;
}
const scaler = (K: number) => (x: number, y: number, z: number): Vec3 => [x * K, y * K, z * K];

/** Smallest 1·2·5×10ⁿ at or above x. */
export function niceCeil(x: number): number {
  if (!(x > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 5, 10]) if (m * p >= x - 1e-12) return m * p;
  return 10 * p;
}

// --- dynamometer -----------------------------------------------------------

function buildDynamometer(p: BuoyancyParams, o: Opts): Part[] {
  const { lang } = o;
  const b = p.bodies[0];
  const st = dynamometerState(p, b);
  const g0 = bodyGeom(b.shape, b.volume);
  const { w: bw, h: bh } = g0;
  const rb = Math.max(0.05, 0.75 * bw + 0.012);
  const Lf = Math.max(0.12, 1.5 * bh + 0.03);
  const hb = Lf + 0.035;
  const gap = 0.05;
  const rest = 0.035;
  const span = 0.09;
  const hook = 0.012;
  /** Thread from the hook to the body: the case stays clear of the beaker. */
  const rod = 0.16;
  const caseLen = rest + span + 0.035;
  const topMax = Lf + gap + bh + rod + hook + rest + span + 0.06;
  const K = 2.6 / topMax;
  const V = scaler(K);
  const geom = bodyGeom(b.shape, b.volume, K);
  const rhoL = LIQUIDS[p.liquid].rho;
  // Fully submerged: a little below the surface.
  const dEff = g0.depthFor(st.share) + (st.share >= 1 ? 0.012 : 0);
  const u = (t: number) => smooth((t - 1) / 3);
  const yBottom = (t: number) => Lf + gap * (1 - u(t)) - dEff * u(t);
  const shareNow = (t: number) => g0.shareAt(clamp(Lf - yBottom(t), 0, bh));
  const reading = (t: number) => Math.max(0, st.weight - buoyantForce(rhoL, p.g, b.volume * shareNow(t)));
  const full = niceCeil(st.weight);
  const stretch = (t: number) => (span * reading(t)) / full;
  const springTop = (t: number) => yBottom(t) + bh + rod + hook + rest + stretch(t);

  // Overflow vessel with a spout and the cup on a block.
  const rc = Math.max(0.025, 0.5 * rb);
  const level = st.displaced / (Math.PI * (rc * 0.94) ** 2);
  let hc = Math.max(level * 1.4 + 0.012, 0.05);
  const yc0 = Math.max(0, Lf - 0.03 - hc);
  hc = Math.min(hc, Lf - 0.03 - yc0);
  const xc = rb + 0.03 + rc;
  const xe = xc - 0.35 * rc;
  const look = liquidLook(p.liquid);
  const parts: Part[] = [
    { name: 'Table', shape: { kind: 'box', size: V(xc + rc + rb + 0.3, 0.02, 2 * rb + 0.16), bevel: 0.004 * K }, position: V((xc + rc - rb - 0.18) / 2, -0.01, 0), color: '#e8d2b0', material: 'wood', noPick: true },
    ...beaker('Beaker', [0, 0, 0], rb * K, hb * K),
    { name: 'Liquid', shape: { kind: 'cylinder', radiusTop: rb * 0.955 * K, radiusBottom: rb * 0.93 * K, height: (Lf - rb * 0.06) * K, segments: 48 }, position: V(0, (Lf + rb * 0.06) / 2, 0), ...look },
    { name: 'Beaker_Spout', parent: 'Beaker', shape: { kind: 'tube', from: V(rb - 0.004, Lf - hb / 2, 0), to: V(xe, Lf - hb / 2 - 0.014, 0), radius: 0.006 * K }, color: COLORS.glass, material: 'glass', noPick: true },
  ];
  if (yc0 > 0.001) parts.push({ name: 'Cup_Stand', shape: { kind: 'box', size: V(2 * rc + 0.02, yc0, 2 * rc + 0.02), bevel: 0.003 * K }, position: V(xc, yc0 / 2, 0), color: '#6c757d', material: 'plastic', noPick: true });
  parts.push(...beaker('Cup', V(xc, yc0, 0), rc * K, hc * K));
  const cupBase = yc0 + rc * 0.06;
  const cupLevel = (t: number) => Math.min(hc - 0.006, level * (st.share > 0 ? shareNow(t) / st.share : 0));
  parts.push({
    name: 'Cup_Liquid', parent: 'Cup', shape: { kind: 'cylinder', radiusTop: rc * 0.94 * K, radiusBottom: rc * 0.92 * K, height: K, segments: 32 }, position: V(0, -hc / 2 + rc * 0.06, 0), scale: [1, 1e-3, 1], ...look,
    motion: (t) => {
      const raw = cupLevel(t);
      const lv = Math.max(1e-4, raw);
      return { scale: [1, lv, 1], position: V(0, -hc / 2 + rc * 0.06 + lv / 2, 0), visible: raw > 2e-4 };
    },
  });
  // Stream from the spout while the body goes in.
  const yStream0 = Lf - 0.014;
  parts.push({
    name: 'Stream', shape: { kind: 'tube', from: V(xe, yStream0, 0), to: V(xe, cupBase, 0), radius: 0.0022 * K }, ...look, opacity: 0.7, noPick: true,
    motion: (t) => ({ visible: t > 1 && t < 4.1 && Lf - yBottom(t) > 0.001 && st.share > 0 }),
  });
  if (o.labels) parts.push(text('Cup_Label', `V = ${vol(st.displaced, lang)}`, V(xc + rc + 0.01, yc0 + hc * 0.5, 0), 0.11, { color: '#bde0fe', align: 'left' }));

  // The body with its hook rod, moving down.
  const yc = (t: number) => yBottom(t) + bh / 2;
  const B = `Body_${b.id}`;
  parts.push({ name: `${B}_At`, shape: { kind: 'group' }, position: V(0, yc(0), 0), noPick: true, motion: (t) => ({ position: V(0, yc(t), 0) }) });
  parts.push({ name: B, parent: `${B}_At`, shape: geom.shape, ...MATERIALS[b.material].look });
  parts.push({ name: `${B}_Rod`, parent: `${B}_At`, shape: { kind: 'tube', from: V(0, bh / 2, 0), to: V(0, bh / 2 + rod + hook, 0), radius: 0.0009 * K }, color: '#343a40', material: 'matte', noPick: true });
  // The larger of P and the full F_A is drawn 1.3 body heights long.
  const kF = (1.3 * bh) / Math.max(st.weight, buoyantForce(rhoL, p.g, b.volume), 1e-9);
  const zf = bw / 2 + 0.012;
  if (o.vectors) {
    parts.push({ name: `Arrow_Gravity_${b.id}`, parent: `${B}_At`, shape: { kind: 'arrow', from: V(-0.008, 0, zf), vector: V(0, -st.weight * kF, 0), radius: 0.0035 * K }, color: COLORS.gravity, ...arrowLook });
    const faMax = buoyantForce(rhoL, p.g, b.volume);
    parts.push({
      name: `Arrow_Buoyancy_${b.id}`, parent: `${B}_At`, shape: { kind: 'arrow', from: [0, 0, 0], vector: V(0, Math.max(faMax * kF, 0.012), 0), radius: 0.0035 * K }, position: V(0.008, 0, zf), color: COLORS.resultant, ...arrowLook,
      motion: (t) => {
        const k = shareNow(t);
        return { scale: [1, Math.max(1e-3, k), 1], visible: k > 0.01 };
      },
    });
    if (o.labels) {
      parts.push(text(`Arrow_Gravity_${b.id}_Label`, `P = ${q(st.weight, 'N', lang)}`, V(-0.02, -st.weight * kF - 0.02, zf), 0.1, { parent: `${B}_At`, color: COLORS.gravity, align: 'right' }));
      parts.push(text(`Arrow_Buoyancy_${b.id}_Label`, `F_A = ${q(st.buoyant, 'N', lang)}`, V(0.02, Math.max(faMax * kF, 0.012) + 0.02, zf), 0.1, { parent: `${B}_At`, color: COLORS.resultant, align: 'left', motion: (t) => ({ visible: u(t) > 0.98 }) }));
    }
  }

  // Spring scale: a glass case whose spring stretches with the reading.
  parts.push({ name: 'Dynamometer', shape: { kind: 'group' }, position: V(0, springTop(0), 0), motion: (t) => ({ position: V(0, springTop(t), 0) }) });
  parts.push({ name: 'Dynamometer_Case', parent: 'Dynamometer', shape: { kind: 'cylinder', radiusTop: 0.016 * K, radiusBottom: 0.016 * K, height: caseLen * K, segments: 32, openEnded: true }, position: V(0, -caseLen / 2 + 0.008, 0), color: '#d8f3ff', material: 'glass' });
  parts.push({ name: 'Dynamometer_Cap', parent: 'Dynamometer', shape: { kind: 'cylinder', radiusTop: 0.017 * K, radiusBottom: 0.017 * K, height: 0.01 * K, segments: 32 }, position: V(0, 0.012, 0), color: '#f4a261', material: 'plastic' });
  parts.push({ name: 'Dynamometer_Ring', parent: 'Dynamometer', shape: { kind: 'torus', radius: 0.011 * K, tube: 0.0022 * K, segments: 24 }, position: V(0, 0.03, 0), color: COLORS.steel, material: 'metal', noPick: true });
  const coil: Vec3[] = [];
  const turns = 12;
  for (let i = 0; i <= turns * 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    coil.push([Math.sin(a) * 0.009 * K, -(i / (turns * 12)) * K, Math.cos(a) * 0.009 * K]);
  }
  parts.push({
    name: 'Dynamometer_Spring', parent: 'Dynamometer', shape: { kind: 'polyline', points: coil, radius: 0.0012 * K }, scale: [1, rest + stretch(0), 1], color: '#d9dde3', material: 'metal', noPick: true,
    motion: (t) => ({ scale: [1, rest + stretch(t), 1] }),
  });
  parts.push({ name: 'Dynamometer_Pointer', parent: 'Dynamometer', shape: { kind: 'box', size: V(0.03, 0.0025, 0.004) }, position: V(0, -rest - stretch(0), 0.012), color: '#e63946', material: 'plastic', motion: (t) => ({ position: V(0, -rest - stretch(t), 0.012) }) });
  parts.push({ name: 'Dynamometer_Hook', parent: 'Dynamometer', shape: { kind: 'tube', from: [0, 0, 0], to: V(0, -hook, 0), radius: 0.0016 * K }, position: V(0, -rest - stretch(0) - hook / 2, 0), color: COLORS.steel, material: 'metal', noPick: true, motion: (t) => ({ position: V(0, -rest - stretch(t) - hook / 2, 0) }) }); // a tube sits at its span's middle
  const step = niceStep(full, 5);
  for (let v = 0, i = 0; v <= full + 1e-9 && i < 30; v += step / 2, i++) {
    const major = i % 2 === 0;
    const y = -rest - (span * v) / full;
    parts.push({ name: `Dynamometer_Tick_${i}`, parent: 'Dynamometer', shape: { kind: 'box', size: V(major ? 0.014 : 0.008, 0.0012, 0.001) }, position: V(-0.004, y, 0.0165), color: '#212529', noPick: true });
    if (major) parts.push(text(`Dynamometer_Tick_${i}_Label`, num(v, lang), V(-0.024, y, 0.017), 0.06, { parent: 'Dynamometer', billboard: false, plate: false, color: '#212529', align: 'right' }));
  }
  parts.push(text('Dynamometer_Air', `P = ${q(st.weight, 'N', lang)} (${tr(T.air, lang)})`, V(0.03, -caseLen / 2, 0), 0.11, { parent: 'Dynamometer', align: 'left', color: '#f4a261', motion: (t) => ({ visible: u(t) < 0.02 }) }));
  parts.push(text('Dynamometer_Liquid', `P₁ = ${q(st.reading, 'N', lang)} (${tr(T.inLiquid, lang)})`, V(0.03, -caseLen / 2, 0), 0.11, { parent: 'Dynamometer', align: 'left', color: '#f4a261', motion: (t) => ({ visible: u(t) > 0.98 }) }));
  // Stand: a post and an arm holding the scale's ring, moving down with it.
  const xs = -rb - 0.06;
  parts.push({ name: 'Stand', shape: { kind: 'cylinder', radiusTop: 0.006 * K, radiusBottom: 0.006 * K, height: topMax * K, segments: 16 }, position: V(xs, topMax / 2, -0.04), color: COLORS.steel, material: 'brushed', noPick: true });
  parts.push({ name: 'Stand_Arm', shape: { kind: 'tube', from: V(xs, 0, -0.04), to: V(0, 0, 0), radius: 0.004 * K }, position: V(xs / 2, springTop(0) + 0.041, -0.02), color: COLORS.steel, material: 'brushed', noPick: true, motion: (t) => ({ position: V(xs / 2, springTop(t) + 0.041, -0.02) }) }); // a tube sits at its span's middle

  const rhoB = MATERIALS[b.material].rho;
  const lines = [
    `${cap(mat(b, lang))}: ρ = ${q(rhoB, 'kg/m³', lang, 5)},  V = ${vol(b.volume, lang)}`,
    `${cap(tr(LIQUIDS[p.liquid].name, lang))}: ${tr(T.rhoL, lang)} = ${q(rhoL, 'kg/m³', lang, 5)}`,
    `F_A = ${tr(T.rhoL, lang)}·g·${tr(T.vb, lang)} = ${num(rhoL, lang, 5)} · ${num(p.g, lang)} · ${num(b.volume * st.share, lang)} = ${q(st.buoyant, 'N', lang)}`,
    `P₁ = P − F_A = ${q(st.weight, 'N', lang)} − ${q(st.buoyant, 'N', lang)} = ${q(st.reading, 'N', lang)}`,
  ];
  // Right of the overflow cup, at the beaker's height: beside the apparatus, not above it.
  parts.push(text('Readout', lines.join('\n'), V(xc + rc + 0.04, Lf * 0.9, 0), 0.12, { align: 'left' }));
  return parts;
}

// --- float -----------------------------------------------------------------

/** Centre height of a body over time (tank bottom at 0, surface at `Hl`): dropped at `t0`, then settles. */
export function floatPath(fate: Fate, share: number, g: BodyGeom, Hl: number, t0: number): (t: number) => number {
  const yStart = Hl + g.h / 2 + 0.04;
  const yEntry = Hl + g.h / 2;
  const yFloor = g.h / 2 + 0.004;
  const td = 0.35;
  const v1 = (2 * (yStart - yEntry)) / td;
  if (fate === 'sinks') {
    const dist = Math.max(0, yEntry - yFloor);
    const Ts = clamp(dist / 0.08, 0.6, 3);
    return (t) => {
      const tau = t - t0;
      if (tau <= 0) return yStart;
      if (tau < td) return yStart - (yStart - yEntry) * (tau / td) ** 2;
      const x = Math.min(1, (tau - td) / Ts);
      return yEntry - dist * (1 - (1 - x) ** 2);
    };
  }
  const yEq = fate === 'floats' ? Hl - g.depthFor(share) + g.h / 2 : Math.max(yFloor, Hl / 2);
  const w = 5;
  const z = 0.3;
  const wd = w * Math.sqrt(1 - z * z);
  const A = yEntry - yEq;
  const Bc = (-v1 + z * w * A) / wd;
  return (t) => {
    const tau = t - t0;
    if (tau <= 0) return yStart;
    if (tau < td) return yStart - (yStart - yEntry) * (tau / td) ** 2;
    const s = tau - td;
    return Math.max(yFloor, yEq + Math.exp(-z * w * s) * (A * Math.cos(wd * s) + Bc * Math.sin(wd * s)));
  };
}

function buildFloat(p: BuoyancyParams, o: Opts): Part[] {
  const { lang } = o;
  const rhoL = LIQUIDS[p.liquid].rho;
  const geoms = p.bodies.map((b) => bodyGeom(b.shape, b.volume));
  const maxW = Math.max(...geoms.map((g) => g.w));
  const maxH = Math.max(...geoms.map((g) => g.h));
  const slot = maxW * 2.2 + 0.04;
  const W = p.bodies.length * slot + 0.04;
  const Hl = Math.max(0.1, 2.6 * maxH);
  const Ht = Hl + maxH + 0.04;
  const D = maxW * 1.8 + 0.06;
  const K = 3 / (W + 0.1);
  const V = scaler(K);
  const th = 0.004;
  const glass = { color: COLORS.glass, material: 'glass' as const };
  const parts: Part[] = [
    { name: 'Table', shape: { kind: 'box', size: V(W + 0.12, 0.02, D + 0.1), bevel: 0.004 * K }, position: V(0, -0.01, 0), color: '#e8d2b0', material: 'wood', noPick: true },
    { name: 'Beaker', shape: { kind: 'group' } },
    { name: 'Beaker_Bottom', parent: 'Beaker', shape: { kind: 'box', size: V(W, th, D) }, position: V(0, th / 2, 0), ...glass },
    { name: 'Beaker_Front', parent: 'Beaker', shape: { kind: 'box', size: V(W, Ht, th) }, position: V(0, Ht / 2, D / 2), ...glass },
    { name: 'Beaker_Back', parent: 'Beaker', shape: { kind: 'box', size: V(W, Ht, th) }, position: V(0, Ht / 2, -D / 2), ...glass },
    { name: 'Beaker_Left', parent: 'Beaker', shape: { kind: 'box', size: V(th, Ht, D) }, position: V(-W / 2, Ht / 2, 0), ...glass },
    { name: 'Beaker_Right', parent: 'Beaker', shape: { kind: 'box', size: V(th, Ht, D) }, position: V(W / 2, Ht / 2, 0), ...glass },
    { name: 'Liquid', shape: { kind: 'box', size: V(W - 2 * th, Hl - th, D - 2 * th) }, position: V(0, th + (Hl - th) / 2, 0), ...liquidLook(p.liquid) },
  ];
  p.bodies.forEach((b, i) => {
    const g0 = geoms[i];
    const geom = bodyGeom(b.shape, b.volume, K);
    const rhoB = MATERIALS[b.material].rho;
    const { fate, share } = fateOf(rhoB, rhoL);
    const t0 = 0.5 + 0.6 * i;
    const y = floatPath(fate, share, g0, Hl, t0);
    const x = -W / 2 + 0.02 + slot * (i + 0.5);
    const B = `Body_${b.id}`;
    const subShare = (t: number) => g0.shareAt(clamp(Hl - (y(t) - g0.h / 2), 0, g0.h));
    parts.push({ name: `${B}_At`, shape: { kind: 'group' }, position: V(x, y(0), 0), noPick: true, motion: (t) => ({ position: V(x, y(t), 0) }) });
    parts.push({ name: B, parent: `${B}_At`, shape: geom.shape, ...MATERIALS[b.material].look });
    const weight = rhoB * b.volume * p.g;
    const faFull = buoyantForce(rhoL, p.g, b.volume);
    const zf = g0.w / 2 + 0.01;
    // Each body's forces on its own scale (the larger one about a body height; half for one lying on the bottom).
    const kF = ((fate === 'sinks' ? 0.5 : 1) * g0.h) / Math.max(weight, faFull, 1e-12);
    if (o.vectors) {
      parts.push({ name: `Arrow_Gravity_${b.id}`, parent: `${B}_At`, shape: { kind: 'arrow', from: V(-0.006, 0, zf), vector: V(0, -weight * kF, 0), radius: 0.003 * K }, color: COLORS.gravity, ...arrowLook });
      parts.push({
        name: `Arrow_Buoyancy_${b.id}`, parent: `${B}_At`, shape: { kind: 'arrow', from: [0, 0, 0], vector: V(0, faFull * kF, 0), radius: 0.003 * K }, position: V(0.006, 0, zf), color: COLORS.resultant, ...arrowLook,
        motion: (t) => {
          const k = subShare(t);
          return { scale: [1, Math.max(1e-3, k), 1], visible: k > 0.01 };
        },
      });
      if (fate === 'sinks') {
        const N = weight - faFull;
        const ts = t0 + 0.35 + clamp(Math.max(0, Hl - 0.004 - g0.h) / 0.08, 0.6, 3);
        parts.push({ name: `Arrow_Support_${b.id}`, parent: `${B}_At`, shape: { kind: 'arrow', from: V(0.02, -g0.h / 2, zf), vector: V(0, N * kF, 0), radius: 0.003 * K }, color: COLORS.normal, ...arrowLook, motion: (t) => ({ visible: t >= ts }) });
        if (o.labels) parts.push(text(`Arrow_Support_${b.id}_Label`, `N = ${q(N, 'N', lang)}`, V(0.03, -g0.h / 2 + N * kF + 0.015, zf), 0.09, { parent: `${B}_At`, align: 'left', color: COLORS.normal, motion: (t) => ({ visible: t >= ts }) }));
      }
      if (o.labels) {
        parts.push(text(`Arrow_Gravity_${b.id}_Label`, `mg = ${q(weight, 'N', lang)}`, V(-0.012, -weight * kF - 0.012, zf), 0.09, { parent: `${B}_At`, align: 'right', color: COLORS.gravity }));
        const fa = buoyantForce(rhoL, p.g, b.volume * share);
        parts.push(text(`Arrow_Buoyancy_${b.id}_Label`, `F_A = ${q(fa, 'N', lang)}`, V(0.012, fa * kF + 0.012, zf), 0.09, { parent: `${B}_At`, align: 'left', color: COLORS.resultant, motion: (t) => ({ visible: t > t0 + 2.5 }) }));
      }
    }
    parts.push(text(`${B}_Label`, `${cap(mat(b, lang))}\nρ = ${q(rhoB, 'kg/m³', lang, 5)}\n${tr(T.fate[fate], lang)}`, V(x, Ht + 0.045 + 0.02 * (i % 2), 0), 0.085, { color: fate === 'sinks' ? '#ffadad' : fate === 'floats' ? '#caffbf' : '#ffd6a5' }));
  });
  const lines = [`${cap(tr(LIQUIDS[p.liquid].name, lang))}: ${tr(T.rhoL, lang)} = ${q(rhoL, 'kg/m³', lang, 5)}`, tr(T.rule, lang)];
  parts.push(text('Readout', lines.join('\n'), V(0, Ht + 0.2, 0), 0.12));
  return parts;
}

// --- balloon ---------------------------------------------------------------

function buildBalloon(p: BuoyancyParams, o: Opts): Part[] {
  const { lang } = o;
  const st = balloonState(p);
  const r = Math.cbrt((3 * p.balloonVolume) / (4 * Math.PI));
  const bs = Math.max(0.25 * r, 0.03);
  const strings = 1.1 * r;
  const objH = 2.2 * r + strings + bs;
  const rise = 2.2 * objH;
  const K = 3 / (rise + objH + 0.2 * objH);
  const V = scaler(K);
  const vRise = 0.45 * objH;
  const tc = 0.6;
  const height = (t: number) => {
    if (!st.rises) return 0;
    const tau = Math.max(0, t - BAL_WAIT);
    return Math.min(rise, vRise * (tau - tc * (1 - Math.exp(-tau / tc))));
  };
  const yc0 = bs + strings + r * 1.1;
  const parts: Part[] = [
    { name: 'Ground', shape: { kind: 'box', size: V(4 * r + 1.2 * objH, 0.04 * objH, 2.4 * r + 0.6 * objH), bevel: 0.01 * objH * K }, position: V(0, -0.02 * objH, 0), color: '#7fb069', material: 'matte', noPick: true },
    { name: 'Balloon_At', shape: { kind: 'group' }, position: V(0, 0, 0), noPick: true, motion: (t) => ({ position: V(0, height(t), 0) }) },
    { name: 'Balloon', parent: 'Balloon_At', shape: { kind: 'sphere', radius: r * K, widthSegments: 48 }, position: V(0, yc0, 0), scale: [1, 1.1, 1], color: '#ef476f', material: 'plastic', roughness: 0.18 },
    { name: 'Balloon_Neck', parent: 'Balloon_At', shape: { kind: 'cylinder', radiusTop: 0.12 * r * K, radiusBottom: 0.05 * r * K, height: 0.14 * r * K, segments: 20 }, position: V(0, yc0 - 1.1 * r - 0.05 * r, 0), color: '#d62850', material: 'plastic', noPick: true },
    { name: 'Basket', parent: 'Balloon_At', shape: { kind: 'box', size: V(bs, bs, bs), bevel: 0.08 * bs * K }, position: V(0, bs / 2, 0), color: '#b08a5a', material: 'wood' },
  ];
  const top: Vec3 = [0, yc0 - 1.1 * r - 0.1 * r, 0];
  ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).forEach(([sx, sz], i) =>
    parts.push({ name: `Basket_String_${i + 1}`, parent: 'Balloon_At', shape: { kind: 'tube', from: V(sx * bs * 0.45, bs, sz * bs * 0.45), to: V(...top), radius: 0.004 * r * K + 0.0005 * K }, color: '#f8f9fa', material: 'matte', noPick: true }),
  );
  if (o.vectors) {
    const kF = (0.9 * r) / Math.max(st.buoyant, st.weight, 1e-12);
    const zf = r * 1.02;
    parts.push({ name: 'Arrow_Buoyancy_Balloon', parent: 'Balloon_At', shape: { kind: 'arrow', from: V(0.05 * r, yc0, zf), vector: V(0, st.buoyant * kF, 0), radius: 0.035 * r * K }, color: COLORS.resultant, ...arrowLook });
    parts.push({ name: 'Arrow_Gravity_Balloon', parent: 'Balloon_At', shape: { kind: 'arrow', from: V(-0.05 * r, yc0, zf), vector: V(0, -st.weight * kF, 0), radius: 0.035 * r * K }, color: COLORS.gravity, ...arrowLook });
    if (o.labels) {
      parts.push(text('Arrow_Buoyancy_Balloon_Label', `F_A = ${q(st.buoyant, 'N', lang)}`, V(0.1 * r, yc0 + st.buoyant * kF + 0.1 * r, zf), 0.11, { parent: 'Balloon_At', align: 'left', color: COLORS.resultant }));
      parts.push(text('Arrow_Gravity_Balloon_Label', `P = ${q(st.weight, 'N', lang)}`, V(-0.1 * r, yc0 - st.weight * kF - 0.1 * r, zf), 0.11, { parent: 'Balloon_At', align: 'right', color: COLORS.gravity }));
    }
  }
  const gas = GASES[p.gas];
  const lines = [
    `${cap(tr(gas.name, lang))}: ρ = ${q(gas.rho, 'kg/m³', lang)},  V = ${vol(p.balloonVolume, lang)}`,
    `F_A = ${tr(T.rhoAir, lang)}·g·V = ${num(RHO_AIR, lang)} · ${num(p.g, lang)} · ${num(p.balloonVolume, lang)} = ${q(st.buoyant, 'N', lang)}`,
    `P = (${tr(T.gasM, lang)} + ${tr(T.load, lang)})·g = (${num(st.gasMass, lang)} + ${num(p.payload, lang)}) · ${num(p.g, lang)} = ${q(st.weight, 'N', lang)}`,
    tr(st.rises ? T.rises : T.stays, lang),
  ];
  parts.push(text('Readout', lines.join('\n'), V(-(r + 0.12 * objH), rise / 2 + objH / 2, 0), 0.12, { align: 'right' }));
  return parts;
}

// --- compare ---------------------------------------------------------------

function buildCompare(p: BuoyancyParams, o: Opts): Part[] {
  const { lang } = o;
  const items = compareItems(p);
  const geoms = items.map((it) => bodyGeom(it.body.shape, it.volume));
  const maxW = Math.max(...geoms.slice(0, 2).map((g) => g.w));
  const rp = Math.max(0.06, 0.6 * maxW + 0.015);
  const Lb = Math.max(0.2, rp + 0.08);
  const stem = 0.04;
  const Hp = 0.18;
  const maxH = Math.max(...geoms.map((g) => g.h));
  const extras = items.slice(2);
  const exW = extras.reduce((n, _, i) => n + geoms[i + 2].w + 0.06, 0);
  const K = 3 / Math.max(2 * Lb + 2 * rp + 0.1, exW);
  const V = scaler(K);
  const mL = items[0]?.mass ?? 0;
  const mR = items[1]?.mass ?? 0;
  const tmax = (12 * Math.PI) / 180;
  const thEq = mL + mR > 0 ? -tmax * Math.tanh((3 * (mR - mL)) / (mL + mR)) : 0;
  const theta = (t: number) => thEq * (1 - Math.exp(-t / 1.0) * Math.cos(2.4 * t));
  const pivot: Vec3 = [0, Hp, 0];
  const panAt = (side: -1 | 1, t: number): Vec3 => {
    const th = theta(t);
    return [pivot[0] + side * Lb * Math.cos(th), pivot[1] + side * Lb * Math.sin(th) + stem, 0];
  };
  const parts: Part[] = [
    { name: 'Table', shape: { kind: 'box', size: V(2 * Lb + 2 * rp + 0.2, 0.02, 2 * rp + 0.3), bevel: 0.004 * K }, position: V(0, -0.01, 0.06), color: '#e8d2b0', material: 'wood', noPick: true },
    { name: 'Balance', shape: { kind: 'group' } },
    { name: 'Balance_Base', parent: 'Balance', shape: { kind: 'box', size: V(0.16, 0.02, 0.1), bevel: 0.004 * K }, position: V(0, 0.01, 0), color: '#3d4654', material: 'metal' },
    { name: 'Balance_Post', parent: 'Balance', shape: { kind: 'cylinder', radiusTop: 0.008 * K, radiusBottom: 0.011 * K, height: Hp * K, segments: 20 }, position: V(0, Hp / 2, 0), color: '#c9a227', material: 'copper' },
    { name: 'Balance_Beam', parent: 'Balance', shape: { kind: 'group' }, position: V(...pivot), noPick: true, motion: (t) => ({ rotation: [0, 0, theta(t)] }) },
    { name: 'Balance_Bar', parent: 'Balance_Beam', shape: { kind: 'box', size: V(2 * Lb, 0.012, 0.016), bevel: 0.003 * K }, color: '#c9a227', material: 'copper' },
    { name: 'Balance_Needle', parent: 'Balance_Beam', shape: { kind: 'box', size: V(0.005, 0.1, 0.004) }, position: V(0, -0.05, 0.012), color: '#e63946', material: 'plastic', noPick: true },
    { name: 'Balance_Dial', parent: 'Balance', shape: { kind: 'box', size: V(0.07, 0.012, 0.004) }, position: V(0, Hp - 0.1, 0.012), color: '#f8f9fa', material: 'matte', noPick: true },
  ];
  for (const side of [-1, 1] as const) {
    const N = `Balance_Pan_${side < 0 ? 'L' : 'R'}`;
    parts.push({ name: N, parent: 'Balance', shape: { kind: 'group' }, position: V(...panAt(side, 0)), noPick: true, motion: (t) => ({ position: V(...panAt(side, t)) }) });
    parts.push({ name: `${N}_Dish`, parent: N, shape: { kind: 'cylinder', radiusTop: rp * K, radiusBottom: rp * 0.85 * K, height: 0.01 * K, segments: 40 }, color: '#c9a227', material: 'copper' });
    parts.push({ name: `${N}_Stem`, parent: N, shape: { kind: 'tube', from: V(0, -0.005, 0), to: V(0, -stem, 0), radius: 0.004 * K }, color: '#c9a227', material: 'copper', noPick: true });
  }
  const label = (it: CompareItem) => `${cap(mat(it.body, lang))}\nm = ${q(it.mass, 'kg', lang)}\nV = ${vol(it.volume, lang)}\nρ = m/V = ${q(it.rho, 'kg/m³', lang, 5)}`;
  let ex = -exW / 2;
  items.forEach((it, i) => {
    const g0 = geoms[i];
    const geom = bodyGeom(it.body.shape, it.volume, K);
    const B = `Body_${it.body.id}`;
    let pos: (t: number) => Vec3;
    if (i < 2) {
      const side = i === 0 ? -1 : 1;
      pos = (t) => {
        const a = panAt(side, t);
        return [a[0], a[1] + 0.005 + g0.h / 2, a[2]];
      };
    } else {
      const x = ex + g0.w / 2;
      ex += g0.w + 0.06;
      pos = () => [x, g0.h / 2, rp + 0.14];
    }
    parts.push({ name: `${B}_At`, shape: { kind: 'group' }, position: V(...pos(0)), noPick: true, motion: i < 2 ? (t) => ({ position: V(...pos(t)) }) : undefined });
    parts.push({ name: B, parent: `${B}_At`, shape: geom.shape, ...MATERIALS[it.body.material].look });
    parts.push(text(`${B}_Label`, label(it), V(0, g0.h / 2 + 0.07, 0), 0.09, { parent: `${B}_At` }));
    if (o.vectors) {
      const kF = 0.1 / Math.max(...items.map((u) => u.mass * p.g), 1e-12);
      parts.push({ name: `Arrow_Gravity_${it.body.id}`, parent: `${B}_At`, shape: { kind: 'arrow', from: V(0, 0, g0.w / 2 + 0.01), vector: V(0, -it.mass * p.g * kF, 0), radius: 0.003 * K }, color: COLORS.gravity, ...arrowLook });
      if (o.labels) parts.push(text(`Arrow_Gravity_${it.body.id}_Label`, `mg = ${q(it.mass * p.g, 'N', lang)}`, V(0.012, -it.mass * p.g * kF, g0.w / 2 + 0.01), 0.08, { parent: `${B}_At`, align: 'left', color: COLORS.gravity }));
    }
  });
  parts.push(text('Readout', `${tr(p.equal === 'mass' ? T.equalMass : T.equalVolume, lang)}\nρ = m/V`, V(0, Hp + stem + maxH + 0.3, 0), 0.13));
  return parts;
}
