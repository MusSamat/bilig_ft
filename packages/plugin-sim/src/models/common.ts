/**
 * Shared pieces of the procedural sim models (contract 0.5.0 §4): lenient
 * param parsing (bad values → defaults, never throw), mode definitions,
 * localized units and numbers, text parts and small geometry helpers.
 */
import { z } from 'zod';
import type { Lang, Localized, Vec3 } from '@bilig/content-model';
import { UNIVERSAL_MODES, type ModeDef, type ModeState, type PlayerView } from '@bilig/scene-core';
import type { Part } from '@bilig/scene-kit';

// ---------------------------------------------------------------------------
// Model interface (shared with models.ts)
// ---------------------------------------------------------------------------

export interface BuildContext {
  modes: ModeState;
  /** Process playback when a process runs. */
  playback?: Pick<PlayerView, 'time' | 'fraction' | 'stepIndex' | 'stepFraction'>;
  /** Interface language for numbers and units drawn in the scene (default `ru`). */
  lang?: Lang;
  /** Names of the parts bound to the selected concept (models with `usesSelection`). */
  selected?: ReadonlySet<string>;
}

export interface SimModel {
  id: string;
  modes: ModeDef[];
  /** Modes for these params when they depend on them (defaults from params); else `modes`. */
  modesFor?(raw: Record<string, unknown>): ModeDef[];
  /** Parts for the scene (motion closures receive the model clock). */
  build(raw: Record<string, unknown>, ctx: BuildContext): Part[];
  /** Model clock from the playback, or from the free clock (seconds). */
  clock(raw: Record<string, unknown>, playback: BuildContext['playback'], free: number): number;
  /** Uses a directional light from the Sun at this position. */
  sunAt?(raw: Record<string, unknown>): Vec3;
  /** Rebuilds when the selection changes (`ctx.selected`). */
  usesSelection?: boolean;
}

// ---------------------------------------------------------------------------
// Lenient parsing
// ---------------------------------------------------------------------------

export const obj = (raw: unknown): Record<string, unknown> => (raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});

/** A finite number in [lo, hi], else the default. */
export function numOr(v: unknown, lo: number, hi: number, d: number): number {
  const r = z.number().finite().min(lo).max(hi).safeParse(v);
  return r.success ? r.data : d;
}
export function boolOr(v: unknown, d: boolean): boolean {
  return typeof v === 'boolean' ? v : d;
}
export function enumOr<T extends string>(v: unknown, values: readonly T[], d: T): T {
  return typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : d;
}
/** Part-name-safe id: a non-empty string without whitespace. */
export const IdSchema = z.string().trim().min(1).max(64).regex(/^\S+$/);
export const idOr = (v: unknown): string | null => {
  const r = IdSchema.safeParse(v);
  return r.success ? r.data : null;
};
/** Items of an array that parse (others dropped); [] when not an array. */
export function listOf<T>(v: unknown, item: (x: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  return v.map(item).filter((x): x is T => x !== null);
}
/** Keeps the first item for every id. */
export function uniqueBy<T>(items: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

export const L = (ky: string, ru: string, en: string): Localized => ({ ky, ru, en });
const def = (id: string, label: Localized, on = false): ModeDef => (on ? { id, label, default: true } : { id, label });

/** The universal «Labels» mode: the core shows concept labels, models add numbers and units. */
export const LABELS: ModeDef = UNIVERSAL_MODES.find((m) => m.id === 'labels')!;
export const MODE = {
  vectors: (on = false) => def('vectors', L('Векторлор', 'Векторы', 'Vectors'), on),
  trace: () => def('trace', L('Из', 'След', 'Trace')),
  graph: (on = true) => def('graph', L('График', 'График', 'Graph'), on),
  resultant: () => def('resultant', L('Тең аракеттүү күч', 'Равнодействующая', 'Resultant')),
  arms: (on = true) => def('arms', L('Күч ийиндери', 'Плечи сил', 'Lever arms'), on),
  balance: () => def('balance', L('Тең салмактуулук', 'Равновесие', 'Balance')),
  motion: (on = true) => def('motion', L('Кыймыл', 'Движение', 'Motion'), on),
  zoom: () => def('zoom', L('Макро көрүнүш', 'Макровид', 'Macro view')),
  run: (on = true) => def('run', L('Жүргүзүү', 'Запуск', 'Run'), on),
  indicator: () => def('indicator', L('Индикатор', 'Индикатор', 'Indicator')),
  temperature: () => def('temperature', L('Температура', 'Температура', 'Temperature')),
  energy: (on = false) => def('energy', L('Энергия', 'Энергия', 'Energy'), on),
  pollutant: () => def('pollutant', L('Булгоочу зат', 'Загрязнитель', 'Pollutant')),
  compare: () => def('compare', L('Салыштыруу', 'Сравнение', 'Compare')),
  groups: (on = true) => def('groups', L('Азык топтору', 'Группы продуктов', 'Food groups'), on),
};

export const on = (modes: ModeState, id: string) => modes[id] === true;

// ---------------------------------------------------------------------------
// Numbers, units, text
// ---------------------------------------------------------------------------

const UNITS: Record<string, Localized> = {
  N: L('Н', 'Н', 'N'),
  m: L('м', 'м', 'm'),
  s: L('с', 'с', 's'),
  kg: L('кг', 'кг', 'kg'),
  g: L('г', 'г', 'g'),
  'm/s': L('м/с', 'м/с', 'm/s'),
  'm/s²': L('м/с²', 'м/с²', 'm/s²'),
  'N·m': L('Н·м', 'Н·м', 'N·m'),
  kJ: L('кДж', 'кДж', 'kJ'),
  kcal: L('ккал', 'ккал', 'kcal'),
  '°C': L('°C', '°C', '°C'),
  ppm: L('ppm', 'ppm', 'ppm'),
  '%': L('%', '%', '%'),
};
export const unit = (u: string, lang: Lang = 'ru') => UNITS[u]?.[lang] ?? u;
export const tr = (s: Localized, lang: Lang = 'ru') => s[lang] ?? s.ru;

/** Rounded number with the language's decimal separator (comma in ky/ru). */
export function fmt(n: number, digits = 1, lang: Lang = 'ru'): string {
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  const s = Object.is(r, -0) ? '0' : String(r);
  return lang === 'en' ? s : s.replace('.', ',');
}
/** `12,5 Н` */
export const qty = (n: number, u: string, lang: Lang = 'ru', digits = 1) => `${fmt(n, digits, lang)} ${unit(u, lang)}`;

export interface TextOpts {
  parent?: string;
  color?: string;
  align?: 'left' | 'center' | 'right';
  plate?: boolean;
  bold?: boolean;
  billboard?: boolean;
  motion?: Part['motion'];
}
/** A text part (never picks). */
export function text(name: string, str: string, at: Vec3, size: number, o: TextOpts = {}): Part {
  return {
    name,
    parent: o.parent,
    shape: { kind: 'text', text: str, size, align: o.align, plate: o.plate ?? true, bold: o.bold, billboard: o.billboard },
    position: at,
    color: o.color ?? '#f8f9fa',
    noPick: true,
    motion: o.motion,
  };
}

// ---------------------------------------------------------------------------
// Looks and geometry
// ---------------------------------------------------------------------------

/** Force / velocity arrows: glossy, slightly self-lit so they read on any stage. */
export const arrowLook = { material: 'plastic', glow: 0.18 } as const;
export const COLORS = {
  gravity: '#ef476f',
  normal: '#06d6a0',
  friction: '#ffd166',
  resultant: '#4cc9f0',
  velocity: '#4cc9f0',
  applied: ['#ff8c42', '#b388ff', '#f15bb5', '#9ef01a', '#00bbf9', '#fee440'],
  axis: '#dfe6ee',
  glass: '#e8f4ff',
  steel: '#c3cad3',
  water: '#4aa3df',
};

/** Deterministic PRNG (mulberry32): the same scene on every machine and thumbnail. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashStr = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

/** Rotation about Z turning +X onto (dx, dy). */
export const zAngle = (dx: number, dy: number) => Math.atan2(dy, dx);
/** smootherstep 0..1 */
export const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/**
 * A straight piece of a graph revealed progressively: a group at `from`
 * turned towards `to`, holding a tube along +X scaled by the share drawn.
 * `share(t)` is 0..1 of the piece shown at clock `t`.
 */
export function growingSegment(name: string, parent: string, from: Vec3, to: Vec3, radius: number, color: string, share: (t: number) => number): Part[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1e-6;
  return [
    { name: `${name}_At`, parent, shape: { kind: 'group' }, position: from, rotation: [0, 0, zAngle(dx, dy)], noPick: true },
    {
      name, parent: `${name}_At`, shape: { kind: 'tube', from: [0, 0, 0], to: [1, 0, 0], radius }, color, material: 'emissive', glow: 1,
      motion: (t) => {
        const k = clamp(share(t), 0, 1);
        return { scale: [1, Math.max(1e-3, k * len), 1], position: [(k * len) / 2, 0, 0], visible: k > 1e-3 };
      },
    },
  ];
}

/** «Nice» tick step for an axis spanning `range` with about `n` ticks. */
export function niceStep(range: number, n = 5): number {
  if (!(range > 0)) return 1;
  const raw = range / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}

/** Glass beaker (open cylinder with a rim and a thick base) standing on y = 0. */
export function beaker(name: string, at: Vec3, r: number, h: number, extra: Partial<Part> = {}): Part[] {
  return [
    { name, shape: { kind: 'cylinder', radiusTop: r, radiusBottom: r * 0.97, height: h, segments: 48, openEnded: true }, position: [at[0], at[1] + h / 2, at[2]], color: COLORS.glass, material: 'glass', ...extra },
    { name: `${name}_Base`, parent: name, shape: { kind: 'cylinder', radiusTop: r * 0.97, radiusBottom: r * 0.95, height: r * 0.06, segments: 48 }, position: [0, -h / 2 + r * 0.03, 0], color: COLORS.glass, material: 'glass' },
    { name: `${name}_Rim`, parent: name, shape: { kind: 'torus', radius: r, tube: r * 0.025, segments: 48 }, position: [0, h / 2, 0], rotation: [Math.PI / 2, 0, 0], color: COLORS.glass, material: 'glass' },
  ];
}

/** A liquid column inside a beaker (bottom at `y0`), its height animated by `level(t)` (0..1 of `h`). */
export function liquid(name: string, at: Vec3, r: number, h: number, color: string, level?: (t: number) => number, extra: Partial<Part> = {}): Part {
  return {
    name, shape: { kind: 'cylinder', radiusTop: r, radiusBottom: r, height: 1, segments: 48 },
    position: [at[0], at[1] + h / 2, at[2]], scale: [1, h, 1], color, opacity: 0.55, container: true, roughness: 0.08,
    motion: level
      ? (t) => {
          const k = Math.max(1e-3, clamp(level(t), 0, 1));
          return { scale: [1, h * k, 1], position: [at[0], at[1] + (h * k) / 2, at[2]], visible: k > 2e-3 };
        }
      : undefined,
    ...extra,
  };
}

/** Bunsen burner standing on y = 0 at `at`, flame on top (noPick decorations under one named group). */
export function burner(name: string, at: Vec3, s = 1, flame = true): Part[] {
  const parts: Part[] = [
    { name, shape: { kind: 'group' }, position: at },
    { name: `${name}_Foot`, parent: name, shape: { kind: 'cylinder', radiusTop: 0.16 * s, radiusBottom: 0.2 * s, height: 0.05 * s, segments: 32 }, position: [0, 0.025 * s, 0], color: '#3d4654', material: 'metal' },
    { name: `${name}_Tube`, parent: name, shape: { kind: 'cylinder', radiusTop: 0.045 * s, radiusBottom: 0.05 * s, height: 0.5 * s, segments: 24 }, position: [0, 0.3 * s, 0], color: COLORS.steel, material: 'brushed' },
    { name: `${name}_Collar`, parent: name, shape: { kind: 'cylinder', radiusTop: 0.06 * s, radiusBottom: 0.06 * s, height: 0.08 * s, segments: 24 }, position: [0, 0.12 * s, 0], color: '#8892a0', material: 'metal' },
  ];
  if (flame) {
    parts.push({
      name: `${name}_Flame`, parent: name, shape: { kind: 'cylinder', radiusTop: 0, radiusBottom: 0.05 * s, height: 0.28 * s, segments: 20 }, position: [0, 0.69 * s, 0],
      color: '#5aa9ff', material: 'emissive', glow: 1.4, opacity: 0.85, container: true, noPick: true, halo: { color: '#6fb3ff', size: 0.5 * s, strength: 0.45 },
      motion: (t) => ({ scale: [1, 1 + 0.08 * Math.sin(t * 17) + 0.05 * Math.sin(t * 29), 1] }),
    });
  }
  return parts;
}
