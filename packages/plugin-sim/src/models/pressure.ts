/**
 * `pressure` (physics 7, §24–30): pressure of solids, liquids and the air.
 *
 * - `solid` — a brick on a soft slab (sand / foam) on one of its faces; the
 *   slab dents in proportion to p = F/S (same F, different S).
 * - `liquid` — a tall glass vessel with three side holes (jets reach further
 *   from deeper holes, v = √(2gh)), a probe on a U-tube manometer, p = ρgh.
 * - `pascal` — Pascal's ball: a piston pushes liquid out of every hole alike.
 * - `hydraulic` — two connected cylinders with oil: F₂ = F₁·S₂/S₁, s₂ = s₁·S₁/S₂.
 * - `barometer` — Torricelli's tube: the mercury column settles at 760 mm at
 *   sea level (≈ 1 mm less per 12 m of height), p = ρgh.
 *
 * Geometry is computed in metres and drawn at a per-variant scale (scene
 * units per metre) so every scene spans a few units like the other models.
 */
import type { Lang, Localized, Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import {
  COLORS, LABELS, MODE, L, arrowLook, beaker, clamp, enumOr, fmt, numOr, obj, on, smooth, text, tr, unit,
  type SimModel,
} from './common.js';

// ---------------------------------------------------------------------------
// Shared fluid tables, units and number formatting (also used by `buoyancy`)
// ---------------------------------------------------------------------------

export const LIQUIDS = {
  water: { rho: 1000, color: '#3d9be0', name: L('суу', 'вода', 'water') },
  oil: { rho: 900, color: '#e2b33c', name: L('май', 'масло', 'oil') },
  mercury: { rho: 13600, color: '#cdd3da', name: L('сымап', 'ртуть', 'mercury') },
  brine: { rho: 1030, color: '#5fc4bd', name: L('туздуу суу', 'солёная вода', 'salt water') },
} as const;
export type LiquidId = keyof typeof LIQUIDS;
export const LIQUID_IDS = Object.keys(LIQUIDS) as LiquidId[];

/** Look of a liquid body: translucent tinted liquid, mercury as a shiny metal. */
export function liquidLook(id: LiquidId): Partial<Part> {
  if (id === 'mercury') return { color: LIQUIDS.mercury.color, material: 'metal', roughness: 0.1, container: true, opacity: 0.9 };
  return { color: LIQUIDS[id].color, container: true, opacity: id === 'oil' ? 0.7 : 0.55, roughness: 0.06 };
}

const UNITS: Record<string, Localized> = {
  Pa: L('Па', 'Па', 'Pa'),
  kPa: L('кПа', 'кПа', 'kPa'),
  'm²': L('м²', 'м²', 'm²'),
  'm³': L('м³', 'м³', 'm³'),
  'cm³': L('см³', 'см³', 'cm³'),
  'kg/m³': L('кг/м³', 'кг/м³', 'kg/m³'),
  'N/kg': L('Н/кг', 'Н/кг', 'N/kg'),
  mm: L('мм', 'мм', 'mm'),
  cm: L('см', 'см', 'cm'),
  mmHg: L('сым. мам. мм', 'мм рт. ст.', 'mmHg'),
};
/** Localized unit (fluid units here, the rest from common). */
export const fu = (u: string, lang: Lang = 'ru') => (UNITS[u] ? tr(UNITS[u], lang) : unit(u, lang));

/**
 * A number with about `sig` significant digits (never rounding the integer
 * part away), decimal comma in ky/ru, thousands grouped from 10 000.
 */
export function num(n: number, lang: Lang = 'ru', sig = 3): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a < 1e-12) return '0';
  const digits = clamp(sig - 1 - Math.floor(Math.log10(a)), 0, 6);
  const s = fmt(n, digits, lang);
  if (a < 10000) return s;
  const [int, frac] = s.split(/[.,]/);
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return frac ? `${grouped}${lang === 'en' ? '.' : ','}${frac}` : grouped;
}
/** `2940 Па` */
export const q = (n: number, u: string, lang: Lang = 'ru', sig = 3) => `${num(n, lang, sig)} ${fu(u, lang)}`;

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export const PRESSURE_VARIANTS = ['solid', 'liquid', 'pascal', 'hydraulic', 'barometer'] as const;
export type PressureVariant = (typeof PRESSURE_VARIANTS)[number];
export const FACES = ['large', 'side', 'end'] as const;
export type Face = (typeof FACES)[number];
export const SURFACES = ['sand', 'foam'] as const;
export type Surface = (typeof SURFACES)[number];

export interface PressureParams {
  variant: PressureVariant;
  /** solid: brick a × b × c, m (a ≥ b ≥ c after parsing). */
  size: Vec3;
  /** solid: kg */
  mass: number;
  face: Face;
  surface: Surface;
  /** liquid / pascal: the liquid. */
  liquid: LiquidId;
  /** liquid: probe depth below the surface, m (≤ height). */
  depth: number;
  /** liquid: height of the liquid column, m. */
  height: number;
  /** pascal: force on the piston; hydraulic: F₁ on the small piston, N. */
  force: number;
  /** pascal: piston area, m². */
  pistonArea: number;
  /** hydraulic: S₁, S₂, m². */
  smallArea: number;
  largeArea: number;
  /** barometer: height above sea level, m. */
  altitude: number;
  g: number;
}

export const DEFAULT_PRESSURE: PressureParams = {
  variant: 'solid', size: [0.25, 0.12, 0.065], mass: 2.5, face: 'large', surface: 'sand',
  liquid: 'water', depth: 0.3, height: 0.5, force: 100, pistonArea: 0.002, smallArea: 0.001, largeArea: 0.05,
  altitude: 0, g: 9.8,
};

function sizeOr(v: unknown, d: Vec3): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) return d;
  const xs = v.map((x) => numOr(x, 0.01, 2, NaN));
  if (!xs.every(Number.isFinite)) return d;
  const s = [...xs].sort((a, b) => b - a);
  return [s[0], s[1], s[2]];
}

export function parsePressureParams(raw: unknown): PressureParams {
  const p = obj(raw);
  const D = DEFAULT_PRESSURE;
  const height = numOr(p.height, 0.1, 1, D.height);
  return {
    variant: enumOr(p.variant, PRESSURE_VARIANTS, D.variant),
    size: sizeOr(p.size, D.size),
    mass: numOr(p.mass, 0.01, 1000, D.mass),
    face: enumOr(p.face, FACES, D.face),
    surface: enumOr(p.surface, SURFACES, D.surface),
    liquid: enumOr(p.liquid, LIQUID_IDS, D.liquid),
    depth: Math.min(height, numOr(p.depth, 0, 10, D.depth)),
    height,
    force: numOr(p.force, 0, 1e6, D.force),
    pistonArea: numOr(p.pistonArea, 1e-5, 0.1, D.pistonArea),
    smallArea: numOr(p.smallArea, 1e-5, 1, D.smallArea),
    largeArea: numOr(p.largeArea, 1e-5, 10, D.largeArea),
    altitude: numOr(p.altitude, 0, 9000, D.altitude),
    g: numOr(p.g, 0.1, 100, D.g),
  };
}

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------

/** Footprint (x × z) and height (y) of a brick a ≥ b ≥ c lying on `face`. */
export function faceDims([a, b, c]: Vec3, face: Face): { fx: number; fz: number; h: number } {
  if (face === 'side') return { fx: a, fz: c, h: b };
  if (face === 'end') return { fx: b, fz: c, h: a };
  return { fx: a, fz: b, h: c };
}

/** Dent depth per pascal, m/Pa (a soft slab sinks in proportion to p). */
const DENT_PER_PA: Record<Surface, number> = { sand: 6e-6, foam: 1.5e-5 };
const DENT_MAX = 0.05;

export interface SolidState {
  weight: number;
  area: number;
  pressure: number;
  /** Depth of the dent, m. */
  dent: number;
  dims: { fx: number; fz: number; h: number };
}
export function solidState(p: PressureParams, face: Face = p.face): SolidState {
  const dims = faceDims(p.size, face);
  const weight = p.mass * p.g;
  const area = dims.fx * dims.fz;
  const pressure = weight / area;
  return { weight, area, pressure, dent: Math.min(DENT_MAX, pressure * DENT_PER_PA[p.surface]), dims };
}

/** p = ρgh, Pa. */
export const liquidPressure = (rho: number, g: number, h: number) => rho * g * h;

export interface Jet {
  /** Depth of the hole below the surface, m. */
  depth: number;
  /** Outflow speed √(2gh), m/s (Torricelli; the same for every liquid). */
  speed: number;
  /** Pressure at the hole, Pa. */
  pressure: number;
}
export function vesselJets(p: PressureParams): Jet[] {
  const rho = LIQUIDS[p.liquid].rho;
  return [1, 2, 3].map((i) => {
    const depth = (p.height * i) / 4;
    return { depth, speed: Math.sqrt(2 * p.g * depth), pressure: liquidPressure(rho, p.g, depth) };
  });
}

/** Small piston travel shown by the hydraulic scene, m. */
export const HYDRAULIC_S1 = 0.15;
export interface HydraulicState {
  pressure: number;
  /** F₂ = p·S₂ */
  force2: number;
  /** S₂/S₁ */
  gain: number;
  /** Large piston rise for the small one's HYDRAULIC_S1, m (volume kept). */
  s2: number;
  /** Load the large piston holds, kg (F₂/g). */
  loadMass: number;
}
export function hydraulicState(p: PressureParams): HydraulicState {
  const pressure = p.force / p.smallArea;
  const force2 = pressure * p.largeArea;
  return { pressure, force2, gain: p.largeArea / p.smallArea, s2: (HYDRAULIC_S1 * p.smallArea) / p.largeArea, loadMass: force2 / p.g };
}

export const RHO_MERCURY = LIQUIDS.mercury.rho;
/** Height of the mercury column, mm: 760 at sea level, ≈ 1 mm less per 12 m near the ground (exponential above). */
export const barometerMm = (altitude: number) => 760 * Math.exp(-Math.max(0, altitude) / (760 * 12));
export function barometerState(p: PressureParams): { mm: number; pressure: number } {
  const mm = barometerMm(p.altitude);
  return { mm, pressure: RHO_MERCURY * p.g * (mm / 1000) };
}

// ---------------------------------------------------------------------------
// Texts
// ---------------------------------------------------------------------------

const T = {
  pascalLaw: L(
    'Паскаль закону: басым суюктуктун ар бир чекитине бардык багытта бирдей берилет',
    'Закон Паскаля: давление передаётся в каждую точку жидкости во все стороны одинаково',
    "Pascal's law: pressure is passed on to every point of the liquid equally in all directions",
  ),
  vacuum: L('Боштук (вакуум)', 'Пустота (вакуум)', 'Vacuum'),
  air: L('Аба басымы', 'Давление воздуха', 'Air pressure'),
  sea: L('деңиз деңгээли', 'уровень моря', 'sea level'),
  same: L('F бирдей, S ар башка → p ар башка', 'F одинакова, S разная → p разное', 'Same F, different S → different p'),
  load: L('Жүк', 'Груз', 'Load'),
};

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const PASCAL_PERIOD = 5;
const PASCAL_PUSH = 3.5;
const HYD_RUN = 3;
const HYD_HOLD = 2.5;

const ARROW_Y = '#ff8c42';

export const pressure: SimModel = {
  id: 'pressure',
  modes: [MODE.vectors(true), LABELS],
  modesFor(raw) {
    const p = parsePressureParams(raw);
    return p.variant === 'solid' ? [MODE.vectors(true), MODE.compare(), LABELS] : [MODE.vectors(true), LABELS];
  },
  clock(raw, pb, free) {
    const p = parsePressureParams(raw);
    if (p.variant === 'hydraulic') return pb ? pb.fraction * HYD_RUN : free % (HYD_RUN + HYD_HOLD);
    return pb ? pb.time : free;
  },
  build(raw, { modes, lang = 'ru' }) {
    const p = parsePressureParams(raw);
    const o: Opts = { lang, labels: on(modes, 'labels'), vectors: on(modes, 'vectors') };
    switch (p.variant) {
      case 'liquid': return buildLiquid(p, o);
      case 'pascal': return buildPascal(p, o);
      case 'hydraulic': return buildHydraulic(p, o);
      case 'barometer': return buildBarometer(p, o);
      default: return buildSolid(p, { ...o, compare: on(modes, 'compare') });
    }
  },
};

interface Opts {
  lang: Lang;
  labels: boolean;
  vectors: boolean;
  compare?: boolean;
}

/** Scaled vector helper: metres → scene units. */
const scaler = (K: number) => (x: number, y: number, z: number): Vec3 => [x * K, y * K, z * K];

// --- solid -----------------------------------------------------------------

const SURFACE_LOOK: Record<Surface, { top: string; dent: string }> = {
  sand: { top: '#e3c88f', dent: '#c4a467' },
  foam: { top: '#f4d35e', dent: '#d9b43c' },
};
const FACE_SUFFIX: Record<Face, string> = { large: 'Large', side: 'Side', end: 'End' };

function buildSolid(p: PressureParams, o: Opts): Part[] {
  const K = 5;
  const V = scaler(K);
  const { lang } = o;
  const faces: Face[] = o.compare ? [p.face, ...FACES.filter((f) => f !== p.face)] : [p.face];
  const items = faces.map((face, i) => ({ face, s: solidState(p, face), sfx: i === 0 ? '' : `_${FACE_SUFFIX[face]}` }));
  const gap = 0.1;
  const total = items.reduce((n, it) => n + it.s.dims.fx, 0) + gap * (items.length - 1);
  let cursor = -total / 2;
  const xs = items.map((it) => {
    const x = cursor + it.s.dims.fx / 2;
    cursor += it.s.dims.fx + gap;
    return x;
  });
  const W = total + 0.24;
  const D = Math.max(0.22, ...items.map((it) => it.s.dims.fz + 0.12));
  const TH = 0.07;
  const look = SURFACE_LOOK[p.surface];
  const slab = { color: look.top, material: 'matte' as const };
  const parts: Part[] = [{ name: 'Surface', shape: { kind: 'group' } }];
  // The slab is built around the holes the bricks press into it.
  let xl = -W / 2;
  let piece = 0;
  const box = (x0: number, x1: number, z0: number, z1: number) => {
    if (x1 - x0 < 1e-6 || z1 - z0 < 1e-6) return;
    parts.push({ name: `Surface_Piece_${++piece}`, parent: 'Surface', shape: { kind: 'box', size: V(x1 - x0, TH, z1 - z0) }, position: V((x0 + x1) / 2, -TH / 2, (z0 + z1) / 2), ...slab });
  };
  items.forEach((it, i) => {
    const { fx, fz } = it.s.dims;
    box(xl, xs[i] - fx / 2, -D / 2, D / 2);
    box(xs[i] - fx / 2, xs[i] + fx / 2, fz / 2, D / 2);
    box(xs[i] - fx / 2, xs[i] + fx / 2, -D / 2, -fz / 2);
    xl = xs[i] + fx / 2;
  });
  box(xl, W / 2, -D / 2, D / 2);
  // A table under the slab.
  parts.push({ name: 'Table', shape: { kind: 'box', size: V(W + 0.08, 0.03, D + 0.08), bevel: 0.01 }, position: V(0, -TH - 0.015, 0), color: '#e8d2b0', material: 'wood', noPick: true });

  const lower = (t: number) => 0.12 * (1 - smooth(t / 0.8));
  const sink = (t: number) => smooth((t - 0.8) / 1.4);
  const kF = 0.12;
  items.forEach((it, i) => {
    const { fx, fz, h } = it.s.dims;
    const x = xs[i];
    const dent = it.s.dent;
    const d = (t: number) => dent * sink(t);
    // Compressed slab under the brick: its top is the bottom of the dent.
    parts.push({
      name: `Dent${it.sfx}`, parent: 'Surface', shape: { kind: 'box', size: V(fx, TH, fz) }, position: V(x, -TH / 2, 0), color: look.dent, material: 'matte',
      motion: (t) => {
        const k = Math.max(1e-3, (TH - d(t)) / TH);
        return { scale: [1, k, 1], position: V(x, (-TH - d(t)) / 2, 0) };
      },
    });
    const B = `Brick${it.sfx}`;
    parts.push({
      name: B, shape: { kind: 'box', size: V(fx, h, fz), bevel: 0.004 * K }, position: V(x, h / 2 + lower(0), 0), color: '#b4553c', material: 'matte',
      motion: (t) => ({ position: V(x, h / 2 - d(t) + lower(t), 0) }),
    });
    // The face in contact: a glowing frame round the bottom of the brick.
    const e = 0.0025;
    parts.push({
      name: `Contact${it.sfx}`, parent: B, shape: { kind: 'polyline', points: [V(-fx / 2, 0, -fz / 2), V(fx / 2, 0, -fz / 2), V(fx / 2, 0, fz / 2), V(-fx / 2, 0, fz / 2)], radius: e * K, closed: true },
      position: V(0, -h / 2 + e, 0), color: '#ffd166', material: 'emissive', glow: 1.2,
    });
    parts.push({ name: `Contact${it.sfx}_Face`, parent: `Contact${it.sfx}`, shape: { kind: 'box', size: V(fx * 0.995, 0.002, fz * 0.995) }, position: [0, -0.0015 * K, 0], color: '#ffd166', material: 'emissive', glow: 0.7, noPick: true });
    if (o.vectors) {
      const top = h + kF;
      parts.push({ name: `Arrow_Force${it.sfx}`, parent: B, shape: { kind: 'arrow', from: V(0, top - h / 2, fz / 2 + 0.02), vector: V(0, -top, 0), radius: 0.007 * K }, color: COLORS.gravity, ...arrowLook });
      if (o.labels) parts.push(text(`Arrow_Force${it.sfx}_Label`, `F = ${q(it.s.weight, 'N', lang)}`, V(0.045, top - h / 2 + 0.03, fz / 2 + 0.02), 0.12, { parent: B, color: COLORS.gravity }));
    }
    if (o.labels) parts.push(text(`Contact${it.sfx}_Label`, `S = ${q(it.s.area, 'm²', lang)}`, V(fx / 2 + 0.02, -h / 2 + 0.02, fz / 2), 0.12, { parent: B, color: '#ffd166', align: 'left' }));
    if (items.length > 1) parts.push(text(`Brick${it.sfx}_Pressure`, `p = ${q(it.s.pressure, 'Pa', lang)}`, V(x, Math.max(...items.map((u) => u.s.dims.h)) + 0.2, 0), 0.14, { color: '#ffd166', bold: true }));
  });
  const s0 = items[0].s;
  const [a, b] = [s0.dims.fx, s0.dims.fz];
  const lines = [
    `F = mg = ${q(p.mass, 'kg', lang)} · ${q(p.g, 'N/kg', lang)} = ${q(s0.weight, 'N', lang)}`,
    items.length > 1 ? tr(T.same, lang) : `S = ${q(a, 'm', lang)} · ${q(b, 'm', lang)} = ${q(s0.area, 'm²', lang)}`,
    items.length > 1 ? '' : `p = F/S = ${q(s0.pressure, 'Pa', lang)}`,
  ].filter(Boolean);
  // Beside the slab (left), so the default framing of the bricks keeps it in view.
  parts.push(text('Readout', lines.join('\n'), V(-W / 2 - 0.05, 0.1, 0), 0.15, { align: 'right' }));
  return parts;
}

// --- liquid ----------------------------------------------------------------

const GAUGE_FLUID = '#e5383b';

function buildLiquid(p: PressureParams, o: Opts): Part[] {
  const K = 3.2;
  const V = scaler(K);
  const { lang } = o;
  const liq = LIQUIDS[p.liquid];
  const H = p.height;
  const r = 0.075;
  const stand = 0.7 * H;
  const hv = H + 0.07;
  const base = r * 0.06;
  const yS = stand + base + H;
  const jets = vesselJets(p);
  const parts: Part[] = [
    { name: 'Stand', shape: { kind: 'box', size: V(0.22, stand, 0.22), bevel: 0.006 * K }, position: V(0, stand / 2, 0), color: '#c9a678', material: 'wood', noPick: true },
    ...beaker('Vessel', V(0, stand, 0), r * K, hv * K),
    { name: 'Liquid', shape: { kind: 'cylinder', radiusTop: r * 0.955 * K, radiusBottom: r * 0.93 * K, height: H * K, segments: 48 }, position: V(0, stand + base + H / 2, 0), ...liquidLook(p.liquid) },
  ];
  // Tray catching the jets.
  const yTray = 0.012;
  const reach = jets.map((j) => r + j.speed * Math.sqrt((2 * (yS - j.depth - yTray)) / p.g));
  const trayX1 = Math.max(...reach) + 0.12;
  parts.push({ name: 'Tray', shape: { kind: 'box', size: V(trayX1 - r + 0.04, 0.012, 0.26), bevel: 0.003 * K }, position: V((r + trayX1) / 2, 0.006, 0), color: '#5c6676', material: 'plastic', noPick: true });
  parts.push({ name: 'Tray_Liquid', parent: 'Tray', shape: { kind: 'box', size: V(trayX1 - r, 0.004, 0.22) }, position: V(0, 0.007, 0), ...liquidLook(p.liquid), noPick: true });
  const kW = 0.11 / Math.max(1e-9, jets[2].pressure);
  jets.forEach((j, i) => {
    const J = `Jet_${i + 1}`;
    const yh = yS - j.depth;
    const tf = Math.sqrt((2 * (yh - yTray)) / p.g);
    const at = (tau: number): Vec3 => V(r + j.speed * tau, yh - 0.5 * p.g * tau * tau, 0);
    const pts: Vec3[] = Array.from({ length: 20 }, (_, k) => at((tf * k) / 19));
    parts.push({ name: J, shape: { kind: 'polyline', points: pts, radius: 0.0035 * K }, ...liquidLook(p.liquid), opacity: 0.75 });
    parts.push({ name: `${J}_Nozzle`, parent: J, shape: { kind: 'cylinder', radiusTop: 0.006 * K, radiusBottom: 0.006 * K, height: 0.012 * K, segments: 16 }, position: V(r + 0.004, yh, 0), rotation: [0, 0, Math.PI / 2], color: COLORS.steel, material: 'metal', noPick: true });
    const n = 9;
    parts.push({
      name: `${J}_Drops`, parent: J, shape: { kind: 'instances', positions: Array.from({ length: n }, (_, k) => at((tf * k) / n)), radius: 0.0055 * K }, ...liquidLook(p.liquid), opacity: 0.85, noPick: true,
      instanceMotion: (t, k) => at((((t * 1.3 + k / n) % 1) + 1) % 1 * tf),
    });
    if (o.vectors) parts.push({ name: `Arrow_Wall_${i + 1}`, parent: J, shape: { kind: 'arrow', from: V(r - 0.004 - j.pressure * kW, yh + 0.012, 0.0), vector: V(j.pressure * kW, 0, 0), radius: 0.004 * K }, color: ARROW_Y, ...arrowLook });
    if (o.labels) parts.push(text(`${J}_Label`, `h${'₁₂₃'[i]} = ${q(j.depth, 'm', lang)}`, V(r + 0.05, yh + 0.03, 0.04), 0.1, { parent: J, align: 'left', color: '#bde0fe' }));
  });

  // Probe with a membrane at `depth`, a rubber tube over the rim to the U-tube gauge.
  const xp = -r * 0.35;
  const yp = yS - p.depth;
  parts.push({ name: 'Probe', shape: { kind: 'cylinder', radiusTop: 0.006 * K, radiusBottom: 0.02 * K, height: 0.024 * K, segments: 32 }, position: V(xp, yp + 0.012, 0), color: '#c3cad3', material: 'metal' });
  parts.push({ name: 'Probe_Membrane', parent: 'Probe', shape: { kind: 'cylinder', radiusTop: 0.0205 * K, radiusBottom: 0.0205 * K, height: 0.003 * K, segments: 32 }, position: V(0, -0.012, 0), color: '#d62839', material: 'rubber' });
  const xg = -r - 0.2;
  const ag = 0.035;
  const rhoG = p.liquid === 'mercury' ? RHO_MERCURY : 1000;
  const dh = (liq.rho * p.depth) / rhoG;
  const yb = 0.06;
  const yr = yb + dh / 2 + 0.05;
  const ytop = Math.max(yr + dh / 2 + 0.07, 0.32);
  const tubeTop = Math.max(yS + 0.1, ytop + 0.06);
  const tubeR = 0.0035 * K;
  parts.push({
    name: 'Probe_Tube', parent: undefined, shape: {
      kind: 'polyline', radius: tubeR,
      points: [V(xp, yp + 0.024, 0), V(xp, yS + 0.04, 0), V(xp - 0.02, tubeTop, 0), V(-r - 0.04, tubeTop + 0.01, 0), V(xg - ag + 0.01, tubeTop, 0), V(xg - ag, tubeTop - 0.03, 0), V(xg - ag, ytop, 0)],
    }, color: '#2b2d42', material: 'rubber', noPick: true,
  });
  parts.push({ name: 'Gauge', shape: { kind: 'group' }, position: V(xg, 0, 0) });
  parts.push({ name: 'Gauge_Board', parent: 'Gauge', shape: { kind: 'box', size: V(0.14, ytop + 0.02, 0.012), bevel: 0.003 * K }, position: V(0, (ytop + 0.02) / 2, -0.016), color: '#f1f3f5', material: 'matte' });
  for (let y = yb, k = 0; y <= ytop - 0.01 && k < 60; y += 0.01, k++) {
    const major = Math.abs((y - yr) / 0.05 - Math.round((y - yr) / 0.05)) < 1e-6;
    parts.push({ name: `Gauge_Tick_${k}`, parent: 'Gauge', shape: { kind: 'box', size: V(major ? 0.03 : 0.016, 0.0012, 0.001) }, position: V(0, y, -0.0095), color: '#343a40', noPick: true });
  }
  parts.push({ name: 'Gauge_Rest', parent: 'Gauge', shape: { kind: 'box', size: V(0.12, 0.0015, 0.001) }, position: V(0, yr, -0.009), color: '#2a9d8f', noPick: true });
  const gLook = p.liquid === 'mercury' ? liquidLook('mercury') : { color: GAUGE_FLUID, container: true, opacity: 0.8 };
  const ri = 0.0045;
  for (const [side, sx] of [['L', -ag], ['R', ag]] as const) {
    parts.push({ name: `Gauge_Arm_${side}`, parent: 'Gauge', shape: { kind: 'cylinder', radiusTop: 0.0065 * K, radiusBottom: 0.0065 * K, height: (ytop - yb) * K, segments: 20, openEnded: true }, position: V(sx, (ytop + yb) / 2, 0), color: COLORS.glass, material: 'glass', noPick: true });
    const sign = side === 'L' ? -1 : 1;
    const lev = (t: number) => yr + (sign * dh * (1 - Math.exp(-t / 0.7) * Math.cos(3 * t))) / 2;
    parts.push({
      name: `Gauge_Fluid_${side}`, parent: 'Gauge', shape: { kind: 'cylinder', radiusTop: ri * K, radiusBottom: ri * K, height: K, segments: 20 }, position: V(sx, (yr + yb) / 2, 0), scale: [1, yr - yb, 1], ...gLook,
      motion: (t) => {
        const h = Math.max(1e-3, lev(t) - yb);
        return { scale: [1, h, 1], position: V(sx, yb + h / 2, 0) };
      },
    });
  }
  parts.push({ name: 'Gauge_Bend', parent: 'Gauge', shape: { kind: 'torus', radius: ag * K, tube: 0.0065 * K, arc: Math.PI, segments: 24 }, position: V(0, yb, 0), rotation: [0, 0, Math.PI], color: COLORS.glass, material: 'glass', noPick: true });
  parts.push({ name: 'Gauge_Bend_Fluid', parent: 'Gauge', shape: { kind: 'torus', radius: ag * K, tube: ri * K, arc: Math.PI, segments: 24 }, position: V(0, yb, 0), rotation: [0, 0, Math.PI], ...gLook, noPick: true });
  if (o.labels) parts.push(text('Gauge_Label', `Δh = ${q(dh, 'm', lang)}`, V(0, ytop + 0.06, 0), 0.11, { parent: 'Gauge', color: '#ffb3b3' }));

  // Depth: a dimension line from the surface to the probe, beside the vessel.
  const xd = -r - 0.035;
  if (p.depth > 0.005) {
    const half = (yS - yp) / 2;
    parts.push({ name: 'Depth', shape: { kind: 'group' }, position: V(xd, (yS + yp) / 2, r * 0.4) });
    parts.push({ name: 'Depth_Line', parent: 'Depth', shape: { kind: 'tube', from: V(0, half, 0), to: V(0, -half, 0), radius: 0.0018 * K }, color: '#ffd166', material: 'emissive', glow: 1 });
    for (const [k, y] of [[1, half], [2, -half]] as const) parts.push({ name: `Depth_End_${k}`, parent: 'Depth', shape: { kind: 'box', size: V(0.03, 0.002, 0.002) }, position: V(0, y, 0), color: '#ffd166', material: 'emissive', glow: 1, noPick: true });
    parts.push(text('Depth_Label', `h = ${q(p.depth, 'm', lang)}`, V(-0.012, 0, 0), 0.11, { parent: 'Depth', align: 'right', color: '#ffd166' }));
  }
  if (o.vectors) {
    // Pressure on the membrane from every side alike.
    parts.push({ name: 'Arrow_Probe', shape: { kind: 'group' }, position: V(xp, yp - 0.002, 0), noPick: true });
    const L0 = 0.05;
    ([[0, 1], [0, -1], [1, 0], [-1, 0]] as const).forEach(([dx, dy], k) => {
      const from = V(-dx * (L0 + 0.026), -dy * (L0 + 0.026), 0.0);
      parts.push({ name: `Arrow_Probe_${k + 1}`, parent: 'Arrow_Probe', shape: { kind: 'arrow', from, vector: V(dx * L0, dy * L0, 0), radius: 0.003 * K }, color: ARROW_Y, ...arrowLook });
    });
  }
  const pr = liquidPressure(liq.rho, p.g, p.depth);
  const lines = [
    `${tr(liq.name, lang)}: ρ = ${q(liq.rho, 'kg/m³', lang, 5)}`,
    `p = ρgh = ${num(liq.rho, lang, 5)} · ${num(p.g, lang)} · ${num(p.depth, lang)} = ${q(pr, 'Pa', lang)}`,
  ];
  // Upper right, beside the vessel's mouth, clear of the jets below.
  parts.push(text('Readout', lines.join('\n'), V(r + 0.06, yS + 0.02, 0), 0.14, { align: 'left' }));
  return parts;
}

// --- pascal ----------------------------------------------------------------

/** Unit directions of the holes of Pascal's ball (none towards the neck at −x). */
export function pascalHoles(n = 16): Vec3[] {
  const out: Vec3[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const rr = Math.sqrt(1 - y * y);
    const a = i * ga;
    const d: Vec3 = [rr * Math.cos(a), y, rr * Math.sin(a)];
    if (d[0] > -0.45) out.push(d);
  }
  return out;
}

function buildPascal(p: PressureParams, o: Opts): Part[] {
  const K = 4;
  const V = scaler(K);
  const { lang } = o;
  const look = liquidLook(p.liquid);
  const c: Vec3 = [0.16, 0.5, 0];
  const R = 0.08;
  const rc = clamp(Math.sqrt(p.pistonArea / Math.PI), 0.02, 0.05);
  const x1 = c[0] - R - 0.04;
  const len = 0.32;
  const x0 = x1 - len;
  const xs = x0 + 0.03;
  const travel = 0.18;
  const push = (t: number) => {
    const ph = ((t % PASCAL_PERIOD) + PASCAL_PERIOD) % PASCAL_PERIOD;
    return ph < PASCAL_PUSH ? ph / PASCAL_PUSH : 1 - smooth((ph - PASCAL_PUSH) / (PASCAL_PERIOD - PASCAL_PUSH));
  };
  const flowing = (t: number) => {
    const ph = ((t % PASCAL_PERIOD) + PASCAL_PERIOD) % PASCAL_PERIOD;
    return ph > 0.12 && ph < PASCAL_PUSH;
  };
  const xp = (t: number) => xs + travel * push(t);
  const parts: Part[] = [
    { name: 'Base', shape: { kind: 'box', size: V(0.7, 0.02, 0.32), bevel: 0.004 * K }, position: V(-0.05, 0.01, 0), color: '#3d4654', material: 'plastic', noPick: true },
    { name: 'Support', shape: { kind: 'cylinder', radiusTop: 0.008 * K, radiusBottom: 0.008 * K, height: (c[1] - rc - 0.02) * K, segments: 16 }, position: V(x0 + len / 2, (c[1] - rc + 0.02) / 2, 0), color: COLORS.steel, material: 'brushed', noPick: true },
    { name: 'Ball', shape: { kind: 'sphere', radius: R * K, widthSegments: 48 }, position: V(...c), color: COLORS.glass, material: 'glass' },
    { name: 'Ball_Liquid', parent: 'Ball', shape: { kind: 'sphere', radius: R * 0.95 * K, widthSegments: 40 }, ...look, noPick: true },
    { name: 'Ball_Neck', parent: 'Ball', shape: { kind: 'tube', from: V(-R * 0.9, 0, 0), to: V(x1 - c[0], 0, 0), radius: Math.min(rc, 0.022) * K }, color: COLORS.glass, material: 'glass', noPick: true },
    { name: 'Cylinder', shape: { kind: 'cylinder', radiusTop: rc * K, radiusBottom: rc * K, height: len * K, segments: 40, openEnded: true }, position: V(x0 + len / 2, c[1], 0), rotation: [0, 0, Math.PI / 2], color: COLORS.glass, material: 'glass' },
    {
      // Liquid between the piston and the neck.
      name: 'Liquid', shape: { kind: 'cylinder', radiusTop: rc * 0.93 * K, radiusBottom: rc * 0.93 * K, height: K, segments: 32 }, position: V((xs + x1) / 2, c[1], 0), rotation: [0, 0, Math.PI / 2], scale: [1, x1 - xs, 1], ...look,
      motion: (t) => {
        const a = xp(t);
        return { scale: [1, Math.max(1e-3, x1 - a), 1], position: V((a + x1) / 2, c[1], 0) };
      },
    },
    { name: 'Piston_At', shape: { kind: 'group' }, position: V(xs, c[1], 0), noPick: true, motion: (t) => ({ position: V(xp(t), c[1], 0) }) },
    { name: 'Piston', parent: 'Piston_At', shape: { kind: 'cylinder', radiusTop: rc * 0.97 * K, radiusBottom: rc * 0.97 * K, height: 0.016 * K, segments: 40 }, position: V(-0.008, 0, 0), rotation: [0, 0, Math.PI / 2], color: '#495057', material: 'rubber' },
    { name: 'Piston_Rod', parent: 'Piston_At', shape: { kind: 'tube', from: V(-0.016, 0, 0), to: V(-0.3, 0, 0), radius: 0.006 * K }, color: COLORS.steel, material: 'metal' },
    { name: 'Piston_Handle', parent: 'Piston_At', shape: { kind: 'cylinder', radiusTop: 0.01 * K, radiusBottom: 0.01 * K, height: 0.08 * K, segments: 20 }, position: V(-0.3, 0, 0), rotation: [Math.PI / 2, 0, 0], color: '#f4a261', material: 'plastic' },
  ];
  if (o.vectors) {
    parts.push({ name: 'Arrow_Force', parent: 'Piston_At', shape: { kind: 'arrow', from: V(-0.47, 0, 0), vector: V(0.15, 0, 0), radius: 0.006 * K }, color: COLORS.gravity, ...arrowLook });
    if (o.labels) parts.push(text('Arrow_Force_Label', `F = ${q(p.force, 'N', lang)}`, V(-0.4, 0.05, 0), 0.12, { parent: 'Piston_At', color: COLORS.gravity }));
  }
  const holes = pascalHoles();
  const v0 = 1.5;
  const tm = 0.17;
  const g = 9.8;
  holes.forEach((n, i) => {
    const J = `Jet_${i + 1}`;
    const at = (tau: number): Vec3 => V(c[0] + n[0] * (R + v0 * tau), c[1] + n[1] * (R + v0 * tau) - 0.5 * g * tau * tau, c[2] + n[2] * (R + v0 * tau));
    parts.push({ name: `Ball_Hole_${i + 1}`, parent: 'Ball', shape: { kind: 'sphere', radius: 0.006 * K, widthSegments: 12 }, position: V(n[0] * R, n[1] * R, n[2] * R), color: '#1d3557', noPick: true });
    parts.push({ name: J, shape: { kind: 'polyline', points: Array.from({ length: 12 }, (_, k) => at((tm * k) / 11)), radius: 0.0028 * K }, ...look, opacity: 0.7, motion: (t) => ({ visible: flowing(t) }) });
    const m = 5;
    parts.push({
      name: `${J}_Drops`, parent: J, shape: { kind: 'instances', positions: Array.from({ length: m }, (_, k) => at((tm * k) / m)), radius: 0.0045 * K }, ...look, opacity: 0.85, noPick: true,
      instanceMotion: (t, k) => at(((((t * 1.6 + k / m) % 1) + 1) % 1) * tm * 1.1),
    });
    if (o.vectors) parts.push({ name: `Arrow_Pressure_${i + 1}`, parent: 'Ball', shape: { kind: 'arrow', from: V(n[0] * R * 0.45, n[1] * R * 0.45, n[2] * R * 0.45), vector: V(n[0] * R * 0.45, n[1] * R * 0.45, n[2] * R * 0.45), radius: 0.0028 * K }, color: ARROW_Y, ...arrowLook, noPick: true });
  });
  const pr = p.force / p.pistonArea;
  const lines = [`F = ${q(p.force, 'N', lang)},  S = ${q(p.pistonArea, 'm²', lang)}`, `p = F/S = ${q(pr, 'Pa', lang)}`, wrap(tr(T.pascalLaw, lang), 44)];
  parts.push(text('Readout', lines.join('\n'), V(c[0] + R + 0.12, c[1] + R + 0.08, 0), 0.13, { align: 'left' }));
  return parts;
}

/** Breaks a sentence into lines of at most ~`width` characters. */
export function wrap(s: string, width: number): string {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    if (line && line.length + 1 + w.length > width) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out.join('\n');
}

// --- hydraulic -------------------------------------------------------------

function buildHydraulic(p: PressureParams, o: Opts): Part[] {
  const K = 4;
  const V = scaler(K);
  const { lang } = o;
  const s = hydraulicState(p);
  const oil = liquidLook('oil');
  // Radii from the areas, both scaled down together when the large one is huge.
  const r1t = Math.sqrt(p.smallArea / Math.PI);
  const r2t = Math.sqrt(p.largeArea / Math.PI);
  const k = Math.min(1, 0.15 / Math.max(r1t, r2t));
  const r1 = Math.max(0.012, r1t * k);
  const r2 = Math.max(0.012, r2t * k);
  const yB = 0.05;
  const Hc = 0.34;
  const x1 = -0.22;
  const x2 = x1 + r1 + 0.22 + r2;
  const y1 = (u: number) => 0.3 - HYDRAULIC_S1 * u;
  const y2 = (u: number) => 0.13 + s.s2 * u;
  const u = (t: number) => smooth(t / HYD_RUN);
  const parts: Part[] = [
    { name: 'Base', shape: { kind: 'box', size: V(x2 + r2 - x1 + r1 + 0.16, 0.03, Math.max(r1, r2) * 2 + 0.12), bevel: 0.005 * K }, position: V((x1 + x2) / 2, 0.015, 0), color: '#3d4654', material: 'plastic', noPick: true },
    { name: 'Pipe', shape: { kind: 'tube', from: V(x1, yB + 0.02, 0), to: V(x2, yB + 0.02, 0), radius: 0.016 * K }, color: COLORS.glass, material: 'glass' },
    { name: 'Pipe_Oil', parent: 'Pipe', shape: { kind: 'tube', from: V(x1, yB + 0.02, 0), to: V(x2, yB + 0.02, 0), radius: 0.0135 * K }, ...oil, noPick: true },
  ];
  const cyl = (name: string, x: number, r: number, level: (u: number) => number) => {
    parts.push({ name, shape: { kind: 'cylinder', radiusTop: r * K, radiusBottom: r * K, height: Hc * K, segments: 48, openEnded: true }, position: V(x, yB + Hc / 2, 0), color: COLORS.glass, material: 'glass' });
    parts.push({ name: `${name}_Bottom`, parent: name, shape: { kind: 'cylinder', radiusTop: r * K, radiusBottom: r * K, height: 0.008 * K, segments: 48 }, position: V(0, -Hc / 2, 0), color: COLORS.glass, material: 'glass', noPick: true });
    parts.push({
      name: `${name}_Oil`, shape: { kind: 'cylinder', radiusTop: r * 0.95 * K, radiusBottom: r * 0.95 * K, height: K, segments: 40 }, position: V(x, (yB + level(0)) / 2, 0), scale: [1, level(0) - yB, 1], ...oil,
      motion: (t) => {
        const yl = level(u(t));
        return { scale: [1, Math.max(1e-3, yl - yB), 1], position: V(x, (yB + yl) / 2, 0) };
      },
    });
  };
  cyl('Cylinder_Small', x1, r1, y1);
  cyl('Cylinder_Large', x2, r2, y2);
  const piston = (name: string, x: number, r: number, level: (u: number) => number) => {
    parts.push({ name, shape: { kind: 'cylinder', radiusTop: r * 0.97 * K, radiusBottom: r * 0.97 * K, height: 0.02 * K, segments: 48 }, position: V(x, level(0) + 0.01, 0), color: '#6c757d', material: 'metal', motion: (t) => ({ position: V(x, level(u(t)) + 0.01, 0) }) });
  };
  piston('Piston_Small', x1, r1, y1);
  piston('Piston_Large', x2, r2, y2);
  const rodH = 0.16;
  parts.push({ name: 'Piston_Small_Rod', parent: 'Piston_Small', shape: { kind: 'cylinder', radiusTop: 0.005 * K, radiusBottom: 0.005 * K, height: rodH * K, segments: 16 }, position: V(0, rodH / 2 + 0.01, 0), color: COLORS.steel, material: 'metal' });
  parts.push({ name: 'Piston_Small_Knob', parent: 'Piston_Small', shape: { kind: 'cylinder', radiusTop: 0.022 * K, radiusBottom: 0.022 * K, height: 0.012 * K, segments: 24 }, position: V(0, rodH + 0.016, 0), color: '#f4a261', material: 'plastic' });
  const lw = Math.min(2 * r2 * 0.85, 0.22);
  const lh = 0.1;
  parts.push({ name: 'Load', parent: 'Piston_Large', shape: { kind: 'box', size: V(lw, lh, lw), bevel: 0.006 * K }, position: V(0, 0.01 + lh / 2, 0), color: '#495057', material: 'metal', roughness: 0.45 });
  if (o.labels) parts.push(text('Load_Label', `m = ${q(s.loadMass, 'kg', lang)}`, V(0, 0.01 + lh / 2, lw / 2 + 0.003), 0.11, { parent: 'Piston_Large', billboard: false, plate: false }));
  if (o.vectors) {
    const L1 = 0.13;
    const L2 = L1 * clamp(Math.sqrt(s.gain), 0.4, 2.2);
    parts.push({ name: 'Arrow_F1', parent: 'Piston_Small', shape: { kind: 'arrow', from: V(0, rodH + 0.022 + L1, 0), vector: V(0, -L1, 0), radius: 0.006 * K }, color: COLORS.gravity, ...arrowLook });
    parts.push({ name: 'Arrow_F2', parent: 'Piston_Large', shape: { kind: 'arrow', from: V(r2 + 0.035, 0, 0), vector: V(0, L2, 0), radius: 0.007 * K }, color: COLORS.normal, ...arrowLook });
    if (o.labels) {
      parts.push(text('Arrow_F1_Label', `F₁ = ${q(p.force, 'N', lang)}`, V(0, rodH + 0.05 + L1, 0), 0.12, { parent: 'Piston_Small', color: COLORS.gravity }));
      parts.push(text('Arrow_F2_Label', `F₂ = ${q(s.force2, 'N', lang)}`, V(r2 + 0.04, L2 + 0.04, 0), 0.12, { parent: 'Piston_Large', color: COLORS.normal }));
    }
  }
  if (o.labels) {
    parts.push(text('Cylinder_Small_Label', `S₁ = ${q(p.smallArea, 'm²', lang)}`, V(x1, yB - 0.0, r1 + 0.05), 0.1));
    parts.push(text('Cylinder_Large_Label', `S₂ = ${q(p.largeArea, 'm²', lang)}`, V(x2, yB - 0.0, r2 + 0.05), 0.1));
  }
  const s2 = s.s2 >= 0.01 ? q(s.s2 * 100, 'cm', lang) : q(s.s2 * 1000, 'mm', lang);
  const lines = [
    `F₁ = ${q(p.force, 'N', lang)},  S₁ = ${q(p.smallArea, 'm²', lang)}`,
    `p = F₁/S₁ = ${q(s.pressure, 'Pa', lang)}`,
    `F₂ = p·S₂ = ${q(s.force2, 'N', lang)}`,
    `F₂/F₁ = S₂/S₁ = ${num(s.gain, lang)}`,
    `s₁ = ${q(HYDRAULIC_S1 * 100, 'cm', lang)} → s₂ = s₁·S₁/S₂ = ${s2}`,
  ];
  // Left of the small cylinder, at mid-height.
  parts.push(text('Readout', lines.join('\n'), V(x1 - r1 - 0.1, yB + Hc * 0.55, 0), 0.13, { align: 'right' }));
  return parts;
}

// --- barometer -------------------------------------------------------------

function buildBarometer(p: PressureParams, o: Opts): Part[] {
  const K = 2.4;
  const V = scaler(K);
  const { lang } = o;
  const st = barometerState(p);
  const h = st.mm / 1000;
  const merc = liquidLook('mercury');
  const dishR = 0.13;
  const yL = 0.046;
  const Lt = 1.0;
  const yb = yL - 0.03;
  const yTop = yb + Lt;
  const ri = 0.0075;
  const hFull = yTop - 0.004 - yL;
  const col = (t: number) => Math.min(hFull, h + (hFull - h) * Math.exp(-t / 0.9) * Math.cos(2.6 * t));
  const parts: Part[] = [
    { name: 'Base', shape: { kind: 'box', size: V(0.42, 0.012, 0.32), bevel: 0.004 * K }, position: V(-0.03, -0.006, 0), color: '#3d4654', material: 'plastic', noPick: true },
    ...beaker('Dish', V(0, 0, 0), dishR * K, 0.065 * K),
    { name: 'Dish_Mercury', parent: 'Dish', shape: { kind: 'cylinder', radiusTop: dishR * 0.96 * K, radiusBottom: dishR * 0.93 * K, height: (yL - 0.006) * K, segments: 48 }, position: V(0, -0.065 / 2 + 0.006 + (yL - 0.006) / 2, 0), ...merc, opacity: 1, container: false },
    { name: 'Tube', shape: { kind: 'cylinder', radiusTop: 0.011 * K, radiusBottom: 0.011 * K, height: Lt * K, segments: 32 }, position: V(0, yb + Lt / 2, 0), color: COLORS.glass, material: 'glass' },
    { name: 'Tube_Cap', parent: 'Tube', shape: { kind: 'sphere', radius: 0.011 * K, widthSegments: 24, hemisphere: true }, position: V(0, Lt / 2, 0), color: COLORS.glass, material: 'glass', noPick: true },
    {
      name: 'Mercury', shape: { kind: 'cylinder', radiusTop: ri * K, radiusBottom: ri * K, height: K, segments: 24 }, position: V(0, (yb + yL + hFull) / 2, 0), scale: [1, yL + hFull - yb, 1], ...merc, opacity: 1, container: false,
      motion: (t) => {
        const top = yL + col(t);
        return { scale: [1, top - yb, 1], position: V(0, (yb + top) / 2, 0) };
      },
    },
    {
      name: 'Vacuum', shape: { kind: 'cylinder', radiusTop: ri * 0.98 * K, radiusBottom: ri * 0.98 * K, height: K, segments: 24 }, position: V(0, yTop - 0.002, 0), scale: [1, 1e-3, 1], color: '#c8b6ff', container: true, opacity: 0.22,
      motion: (t) => {
        const top = yL + col(t);
        const hv = Math.max(1e-3, yTop - 0.004 - top);
        return { scale: [1, hv, 1], position: V(0, top + hv / 2, 0), visible: hv > 2e-3 };
      },
    },
    // Lab stand holding the tube.
    { name: 'Stand', shape: { kind: 'cylinder', radiusTop: 0.008 * K, radiusBottom: 0.008 * K, height: (yTop + 0.02) * K, segments: 16 }, position: V(-0.17, (yTop + 0.02) / 2, -0.06), color: COLORS.steel, material: 'brushed', noPick: true },
    { name: 'Stand_Arm', shape: { kind: 'tube', from: V(-0.17, 0.82, -0.06), to: V(0, 0.82, 0), radius: 0.005 * K }, color: COLORS.steel, material: 'brushed', noPick: true },
    { name: 'Stand_Clamp', shape: { kind: 'torus', radius: 0.014 * K, tube: 0.004 * K, segments: 24 }, position: V(0, 0.82, 0), rotation: [Math.PI / 2, 0, 0], color: '#5c6676', material: 'metal', noPick: true },
  ];
  // Scale in mm from the mercury surface in the dish.
  const sx = 0.045;
  const scH = 0.82;
  const scY = yL + scH / 2 - 0.005;
  parts.push({ name: 'Scale', shape: { kind: 'box', size: V(0.07, scH, 0.006), bevel: 0.002 * K }, position: V(sx, scY, -0.016), color: '#fdf6e3', material: 'matte' });
  for (let mm = 0; mm <= 800; mm += 10) {
    const major = mm % 50 === 0;
    parts.push({ name: `Scale_Tick_${mm}`, parent: 'Scale', shape: { kind: 'box', size: V(mm % 100 === 0 ? 0.03 : major ? 0.022 : 0.012, 0.0012, 0.001) }, position: V(-0.035 + (mm % 100 === 0 ? 0.015 : major ? 0.011 : 0.006), yL + mm / 1000 - scY, 0.0035), color: '#343a40', noPick: true });
    if (mm % 100 === 0) parts.push(text(`Scale_Label_${mm}`, String(mm), V(0.012, yL + mm / 1000 - scY, 0.004), 0.05, { parent: 'Scale', billboard: false, plate: false, color: '#343a40', align: 'left' }));
  }
  parts.push({
    name: 'Level_Marker', shape: { kind: 'box', size: V(0.075, 0.0025, 0.002) }, position: V(sx - 0.012, yL + h, -0.011), color: '#e63946', material: 'emissive', glow: 1,
    motion: (t) => ({ position: V(sx - 0.012, yL + col(t), -0.011) }),
  });
  if (o.labels) {
    parts.push(text('Vacuum_Label', tr(T.vacuum, lang), V(-0.03, (yL + h + yTop) / 2, 0), 0.1, { align: 'right', color: '#c8b6ff' }));
    parts.push(text('Mercury_Label', `h = ${q(st.mm, 'mmHg', lang)}`, V(sx + 0.05, yL + h, 0), 0.11, { align: 'left', color: '#ffb3b3' }));
  }
  if (o.vectors) {
    parts.push({ name: 'Arrow_Air', shape: { kind: 'group' }, position: V(0, yL, 0), noPick: true });
    ([[-0.085, 0.03], [0.085, 0.05], [-0.05, -0.08], [0.06, -0.075], [-0.045, 0.085]] as const).forEach(([x, z], i) =>
      parts.push({ name: `Arrow_Air_${i + 1}`, parent: 'Arrow_Air', shape: { kind: 'arrow', from: V(x, 0.14, z), vector: V(0, -0.135, 0), radius: 0.0055 * K }, color: '#90e0ef', ...arrowLook }),
    );
    if (o.labels) parts.push(text('Arrow_Air_Label', tr(T.air, lang), V(-0.1, 0.2, 0.06), 0.1, { parent: 'Arrow_Air', color: '#90e0ef' }));
  }
  const lines = [
    `H = ${q(p.altitude, 'm', lang, 4)}${p.altitude < 1 ? ` (${tr(T.sea, lang)})` : ''}`,
    `h = ${q(st.mm, 'mmHg', lang)}`,
    `p = ρgh = ${num(RHO_MERCURY, lang, 5)} · ${num(p.g, lang)} · ${num(h, lang)} ≈ ${q(st.pressure, 'Pa', lang, 4)}`,
  ];
  // Right of the scale, level with the top of the column.
  parts.push(text('Readout', lines.join('\n'), V(0.1, yTop * 0.7, 0), 0.13, { align: 'left' }));
  return parts;
}
