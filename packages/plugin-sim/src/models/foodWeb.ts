/**
 * `food-web` (3.1 ecosystems, 3.2 human impact, 3.x pollution): organisms on
 * trophic levels, feeding links as arrows in the direction energy flows
 * (eaten → eater), sized by the 10 % rule; removing organisms fades their
 * links and the numbers of the others react; a pollutant concentrates ×factor
 * per trophic level.
 */
import type { Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import {
  L, LABELS, MODE, enumOr, fmt, idOr, listOf, numOr, obj, on, text, tr, uniqueBy, unit, clamp,
  type SimModel,
} from './common.js';

export const BIOMES = ['lake', 'steppe', 'forest', 'mountain'] as const;
export type Biome = (typeof BIOMES)[number];
export const LEVELS = ['producer', 'primary', 'secondary', 'tertiary', 'decomposer'] as const;
export type TrophicLevel = (typeof LEVELS)[number];

export interface Organism {
  id: string;
  level: TrophicLevel;
  icon?: string;
  count?: number;
}
export interface Pollutant {
  name?: string;
  /** ppm in water / soil. */
  start: number;
  /** × per trophic level. */
  factor: number;
}
export interface FoodWebParams {
  biome: Biome;
  organisms: Organism[];
  /** [eaten, eater] */
  links: [string, string][];
  removed: string[];
  pollutant?: Pollutant;
}

const DEFAULT_WEBS: Record<Biome, { organisms: Organism[]; links: [string, string][] }> = {
  lake: {
    organisms: [
      { id: 'algae', level: 'producer', icon: 'algae' }, { id: 'daphnia', level: 'primary', icon: 'daphnia' }, { id: 'snail', level: 'primary', icon: 'snail' },
      { id: 'roach', level: 'secondary', icon: 'fish' }, { id: 'pike', level: 'tertiary', icon: 'pike' }, { id: 'bacteria', level: 'decomposer', icon: 'bacteria' },
    ],
    links: [['algae', 'daphnia'], ['algae', 'snail'], ['daphnia', 'roach'], ['snail', 'roach'], ['roach', 'pike'], ['pike', 'bacteria'], ['algae', 'bacteria']],
  },
  steppe: {
    organisms: [
      { id: 'grass', level: 'producer', icon: 'grass' }, { id: 'grasshopper', level: 'primary', icon: 'grasshopper' }, { id: 'marmot', level: 'primary', icon: 'marmot' },
      { id: 'lark', level: 'secondary', icon: 'bird' }, { id: 'eagle', level: 'tertiary', icon: 'eagle' }, { id: 'fungi', level: 'decomposer', icon: 'fungi' },
    ],
    links: [['grass', 'grasshopper'], ['grass', 'marmot'], ['grasshopper', 'lark'], ['lark', 'eagle'], ['marmot', 'eagle'], ['eagle', 'fungi'], ['grass', 'fungi']],
  },
  forest: {
    organisms: [
      { id: 'tree', level: 'producer', icon: 'tree' }, { id: 'caterpillar', level: 'primary', icon: 'caterpillar' }, { id: 'deer', level: 'primary', icon: 'deer' },
      { id: 'tit', level: 'secondary', icon: 'bird' }, { id: 'wolf', level: 'tertiary', icon: 'wolf' }, { id: 'fungi', level: 'decomposer', icon: 'fungi' },
    ],
    links: [['tree', 'caterpillar'], ['tree', 'deer'], ['caterpillar', 'tit'], ['deer', 'wolf'], ['wolf', 'fungi'], ['tree', 'fungi']],
  },
  mountain: {
    organisms: [
      { id: 'grass', level: 'producer', icon: 'grass' }, { id: 'ibex', level: 'primary', icon: 'goat' }, { id: 'marmot', level: 'primary', icon: 'marmot' },
      { id: 'snow-leopard', level: 'tertiary', icon: 'leopard' }, { id: 'eagle', level: 'secondary', icon: 'eagle' }, { id: 'fungi', level: 'decomposer', icon: 'fungi' },
    ],
    links: [['grass', 'ibex'], ['grass', 'marmot'], ['marmot', 'eagle'], ['ibex', 'snow-leopard'], ['marmot', 'snow-leopard'], ['snow-leopard', 'fungi'], ['grass', 'fungi']],
  },
};

export function parseFoodWebParams(raw: unknown): FoodWebParams {
  const p = obj(raw);
  const biome = enumOr(p.biome, BIOMES, 'lake');
  let organisms = uniqueBy(
    listOf(p.organisms, (x): Organism | null => {
      const o = obj(x);
      const id = idOr(o.id);
      if (!id || !(LEVELS as readonly unknown[]).includes(o.level)) return null;
      const count = numOr(o.count, 0, 1e9, NaN);
      const icon = typeof o.icon === 'string' && o.icon.trim() ? o.icon.trim().slice(0, 24) : undefined;
      return { id, level: o.level as TrophicLevel, icon, count: Number.isFinite(count) ? Math.round(count) : undefined };
    }),
    (o) => o.id,
  );
  let links: [string, string][];
  if (organisms.length) {
    const ids = new Set(organisms.map((o) => o.id));
    links = uniqueBy(
      listOf(p.links, (x) => (Array.isArray(x) && x.length === 2 && ids.has(x[0]) && ids.has(x[1]) && x[0] !== x[1] ? ([x[0], x[1]] as [string, string]) : null)),
      (l) => `${l[0]}>${l[1]}`,
    );
  } else {
    organisms = DEFAULT_WEBS[biome].organisms;
    links = DEFAULT_WEBS[biome].links;
  }
  const ids = new Set(organisms.map((o) => o.id));
  const removed = Array.isArray(p.removed) ? [...new Set(p.removed.filter((r): r is string => typeof r === 'string' && ids.has(r)))] : [];
  const po = obj(p.pollutant);
  const start = numOr(po.start, 0, 1e9, NaN);
  const pollutant = Number.isFinite(start)
    ? { name: typeof po.name === 'string' && po.name.trim() ? po.name.trim().slice(0, 40) : undefined, start, factor: numOr(po.factor, 1, 1e6, 10) }
    : undefined;
  return { biome, organisms, links, removed, pollutant };
}

/** Trophic rank: producers 0 … tertiary consumers 3; decomposers have none. */
export const RANK: Record<TrophicLevel, number | null> = { producer: 0, primary: 1, secondary: 2, tertiary: 3, decomposer: null };

/** 10 % rule: share of the producers' energy reaching a level, % (decomposers: null). */
export function energyShare(level: TrophicLevel): number | null {
  const r = RANK[level];
  return r === null ? null : 100 * 0.1 ** r;
}

/**
 * Pollutant concentration, ppm: start × factor^(rank + 1) — producers are the
 * first trophic level above the water / soil. Decomposers take the highest
 * concentration among what they feed on (or the producers' level).
 */
export function pollutantLevels(p: FoodWebParams): Map<string, number> {
  const out = new Map<string, number>();
  if (!p.pollutant) return out;
  const { start, factor } = p.pollutant;
  for (const o of p.organisms) {
    const r = RANK[o.level];
    if (r !== null) out.set(o.id, start * factor ** (r + 1));
  }
  for (const o of p.organisms) {
    if (RANK[o.level] !== null) continue;
    const food = p.links.filter(([, eater]) => eater === o.id).map(([eaten]) => out.get(eaten) ?? 0);
    out.set(o.id, food.length ? Math.max(...food) : start * factor);
  }
  return out;
}

const DEFAULT_COUNT: Record<TrophicLevel, number> = { producer: 6, primary: 4, secondary: 3, tertiary: 2, decomposer: 4 };
export const baseCount = (o: Organism) => o.count ?? DEFAULT_COUNT[o.level];

/**
 * Counts after removals (direct effects only): a removed organism → 0; each
 * removed predator lets its prey multiply ×(1 + removed / all predators);
 * prey lost cuts a consumer to the share of its food that is left (0 when
 * nothing is left). Decomposers and producers' food are not limited.
 */
export function reactedCounts(p: FoodWebParams): Map<string, number> {
  const removed = new Set(p.removed);
  const out = new Map<string, number>();
  for (const o of p.organisms) {
    if (removed.has(o.id)) {
      out.set(o.id, 0);
      continue;
    }
    let k = 1;
    const predators = p.links.filter(([eaten]) => eaten === o.id).map(([, eater]) => eater);
    const goneP = predators.filter((x) => removed.has(x)).length;
    if (predators.length && goneP) k *= 1 + goneP / predators.length;
    if (o.level !== 'decomposer') {
      const prey = p.links.filter(([, eater]) => eater === o.id).map(([eaten]) => eaten);
      const left = prey.filter((x) => !removed.has(x)).length;
      if (prey.length) k *= left / prey.length;
    }
    out.set(o.id, Math.round(baseCount(o) * k));
  }
  return out;
}

const LEVEL_COLOR: Record<TrophicLevel, string> = { producer: '#57cc99', primary: '#ffd166', secondary: '#f4a261', tertiary: '#e76f51', decomposer: '#b5838d' };
const LEVEL_TITLE: Record<TrophicLevel, ReturnType<typeof L>> = {
  producer: L('Продуценттер', 'Продуценты', 'Producers'),
  primary: L('1-тартиптеги консументтер', 'Консументы I порядка', 'Primary consumers'),
  secondary: L('2-тартиптеги консументтер', 'Консументы II порядка', 'Secondary consumers'),
  tertiary: L('3-тартиптеги консументтер', 'Консументы III порядка', 'Tertiary consumers'),
  decomposer: L('Редуценттер', 'Редуценты', 'Decomposers'),
};
const BIOME_LOOK: Record<Biome, { sky: string; ground: string }> = {
  lake: { sky: '#173247', ground: '#2c6e91' },
  steppe: { sky: '#3a3a24', ground: '#a8a35a' },
  forest: { sky: '#1b3524', ground: '#2f6b3a' },
  mountain: { sky: '#2b3240', ground: '#7d8597' },
};

/** Words content may use for `icon`, drawn as emoji; other non-ASCII icons are drawn as given. */
const ICONS: Record<string, string> = {
  grass: '🌿', plant: '🌱', algae: '🌱', tree: '🌳', oak: '🌳', pine: '🌲', flower: '🌼', berry: '🫐', wheat: '🌾', seaweed: '🌿', plankton: '🦠',
  insect: '🐛', caterpillar: '🐛', grasshopper: '🦗', locust: '🦗', beetle: '🪲', butterfly: '🦋', bee: '🐝', ant: '🐜', worm: '🪱', snail: '🐌', spider: '🕷️',
  daphnia: '🦐', shrimp: '🦐', fish: '🐟', pike: '🐟', roach: '🐟', trout: '🐟', frog: '🐸', snake: '🐍', lizard: '🦎', turtle: '🐢',
  mouse: '🐭', rat: '🐀', rabbit: '🐇', hare: '🐇', marmot: '🐿️', squirrel: '🐿️', deer: '🦌', goat: '🐐', ibex: '🐐', sheep: '🐑', cow: '🐄', horse: '🐎', boar: '🐗',
  bird: '🐦', sparrow: '🐦', duck: '🦆', owl: '🦉', eagle: '🦅', hawk: '🦅', heron: '🪿',
  fox: '🦊', wolf: '🐺', coyote: '🐺', bear: '🐻', leopard: '🐆', 'snow-leopard': '🐆', lynx: '🐈', beaver: '🦫', elk: '🦌', vole: '🐭', human: '🧍',
  bush: '🌳', shrub: '🌳', juniper: '🌲', zooplankton: '🦐', phytoplankton: '🌱',
  bacteria: '🦠', fungi: '🍄', mushroom: '🍄', sun: '☀️',
};
export function iconFor(o: Organism): string {
  const raw = o.icon ?? '';
  if (raw && /[^\x00-\x7f]/.test(raw)) return raw;
  const key = (raw || o.id).toLowerCase();
  return ICONS[key] ?? ICONS[key.replace(/s$/, '')] ?? key.charAt(0).toUpperCase();
}

const TIER_Y = [0.4, 1.55, 2.7, 3.85];
const TOKEN_R = 0.36;
const SPREAD = 6;

export const foodWeb: SimModel = {
  id: 'food-web',
  modes: [MODE.energy(true), MODE.pollutant(), LABELS],
  clock: (_raw, pb, free) => (pb ? pb.time : free),
  build(raw, { modes, lang = 'ru' }) {
    const p = parseFoodWebParams(raw);
    const removed = new Set(p.removed);
    const energy = on(modes, 'energy');
    const labels = on(modes, 'labels');
    const counts = reactedCounts(p);
    const pollution = on(modes, 'pollutant') ? pollutantLevels(p) : new Map<string, number>();
    const look = BIOME_LOOK[p.biome];
    const hasDecomposers = p.organisms.some((o) => o.level === 'decomposer');
    const parts: Part[] = [
      { name: 'Biome', shape: { kind: 'box', size: [11, 5.9, 0.06], bevel: 0.03 }, position: [-0.6, 2.45, -0.7], color: look.sky, material: 'matte', noPick: true },
      { name: 'Biome_Ground', parent: 'Biome', shape: { kind: 'box', size: [11, 0.5, 0.08], bevel: 0.03 }, position: [0, -2.7, 0.02], color: look.ground, material: 'matte', noPick: true },
      // The Sun: the energy source of the web.
      { name: 'Sun', shape: { kind: 'sphere', radius: 0.38, widthSegments: 40 }, position: [-5.15, 4.85, 0], color: '#ffffff', texture: 'sun', material: 'emissive', glow: 1.3, halo: { color: '#ffb547', size: 2.2, strength: 0.8 } },
    ];
    parts.push(...biomeDecor(p.biome));
    // Organism positions: tiers by level, decomposers in a column on the right.
    const pos = new Map<string, Vec3>();
    LEVELS.forEach((lv) => {
      const list = p.organisms.filter((o) => o.level === lv);
      list.forEach((o, i) => {
        if (lv === 'decomposer') pos.set(o.id, [3.95, 1.2 + i * 1.05, 0]);
        else {
          const w = hasDecomposers ? SPREAD - 0.8 : SPREAD;
          const x = list.length === 1 ? (hasDecomposers ? -0.4 : 0) : -w / 2 + (w * i) / (list.length - 1) - (hasDecomposers ? 0.4 : 0);
          pos.set(o.id, [x, TIER_Y[RANK[lv]!], 0]);
        }
      });
    });
    // Level bands behind the organisms.
    for (const lv of LEVELS) {
      if (!p.organisms.some((o) => o.level === lv)) continue;
      const N = `Level_${lv}`;
      const r = RANK[lv];
      if (r === null) {
        const ys = p.organisms.filter((o) => o.level === lv).map((o) => pos.get(o.id)![1]);
        const y0 = Math.min(...ys) - 0.5;
        const y1 = Math.max(...ys) + 0.5;
        parts.push({ name: N, shape: { kind: 'box', size: [1.1, y1 - y0, 0.04], bevel: 0.02 }, position: [3.95, (y0 + y1) / 2, -0.4], color: LEVEL_COLOR[lv], opacity: 0.2, container: true });
      } else {
        parts.push({ name: N, shape: { kind: 'box', size: [hasDecomposers ? 7.4 : 8.2, 0.95, 0.04], bevel: 0.02 }, position: [hasDecomposers ? -0.45 : 0, TIER_Y[r], -0.4], color: LEVEL_COLOR[lv], opacity: 0.2, container: true });
      }
      if (labels || energy) {
        const share = energyShare(lv);
        const lines = [labels ? tr(LEVEL_TITLE[lv], lang) : '', energy && share !== null ? `${fmt(share, 3, lang)} %` : ''].filter(Boolean).join('\n');
        if (lines) {
          const at: Vec3 = r === null ? [3.95, Math.max(...p.organisms.filter((o) => o.level === lv).map((o) => pos.get(o.id)![1])) + 0.7, -0.3] : [(hasDecomposers ? -0.45 - 3.7 : -4.1) - 0.12, TIER_Y[r], -0.3];
          parts.push(text(`${N}_Label`, lines, at, 0.11, { align: r === null ? 'center' : 'right', color: LEVEL_COLOR[lv] }));
        }
      }
    }
    // Organisms: a coin-like token with the icon, a count badge, a red cross when removed.
    for (const o of p.organisms) {
      const at = pos.get(o.id)!;
      const N = `Organism_${o.id}`;
      const gone = removed.has(o.id);
      const base = baseCount(o);
      const now = counts.get(o.id) ?? base;
      parts.push({ name: N, shape: { kind: 'cylinder', radiusTop: TOKEN_R, radiusBottom: TOKEN_R, height: 0.1, segments: 48 }, position: at, rotation: [Math.PI / 2, 0, 0], color: LEVEL_COLOR[o.level], material: 'plastic', ...(gone ? { container: true, opacity: 0.3 } : {}) });
      parts.push({ name: `${N}_Face`, parent: N, shape: { kind: 'cylinder', radiusTop: TOKEN_R * 0.84, radiusBottom: TOKEN_R * 0.84, height: 0.104, segments: 48 }, color: '#f8f9fa', material: 'matte', ...(gone ? { container: true, opacity: 0.3 } : {}) });
      parts.push(text(`${N}_Icon`, iconFor(o), [at[0], at[1], 0.07], 0.42, { plate: false, billboard: false, color: gone ? '#6c757d' : '#ffffff' }));
      const trend = now > base ? ' ↑' : now < base ? ' ↓' : '';
      parts.push(text(`${N}_Count`, `×${now}${trend}`, [at[0] + TOKEN_R * 0.95, at[1] - TOKEN_R * 0.8, 0.1], 0.12, { color: trend === ' ↑' ? '#80ffdb' : trend ? '#ff8fa3' : '#f8f9fa' }));
      if (gone) {
        [Math.PI / 4, -Math.PI / 4].forEach((a, i) => parts.push({ name: `${N}_Cross_${i + 1}`, shape: { kind: 'box', size: [TOKEN_R * 2.3, 0.06, 0.02] }, position: [at[0], at[1], 0.1], rotation: [0, 0, a], color: '#ef233c', material: 'emissive', glow: 1, noPick: true }));
      }
      const c = pollution.get(o.id);
      if (c !== undefined && p.pollutant && p.pollutant.start > 0) {
        // Dots ∝ log₁₀ of the concentration factor: ×10 per level adds four dots.
        const n = clamp(Math.round(4 * Math.log10(c / p.pollutant.start)), 1, 24);
        const P = `Pollutant_${o.id}`;
        parts.push({ name: P, shape: { kind: 'group' }, position: [at[0], at[1], 0.11] });
        for (let i = 0; i < n; i++) {
          const a = i * 2.399963;
          const rr = TOKEN_R * 0.78 * Math.sqrt((i + 0.5) / n);
          parts.push({ name: `${P}_${i + 1}`, parent: P, shape: { kind: 'sphere', radius: 0.032, widthSegments: 10 }, position: [rr * Math.cos(a), rr * Math.sin(a), 0], color: '#7b2cbf', material: 'plastic', glow: 0.2 });
        }
        if (labels) parts.push(text(`${P}_Label`, `${fmt(c, 4, lang)} ${unit('ppm', lang)}`, [at[0] - TOKEN_R * 0.95, at[1] - TOKEN_R * 0.8, 0.12], 0.11, { color: '#d0a8ff' }));
      }
    }
    if (p.pollutant && on(modes, 'pollutant') && labels) {
      parts.push(text('Pollutant_Source_Label', `${p.pollutant.name ?? ''}${p.pollutant.name ? ': ' : ''}${fmt(p.pollutant.start, 4, lang)} ${unit('ppm', lang)} (×${fmt(p.pollutant.factor, 2, lang)})`, [0, -0.45, 0.1], 0.13, { color: '#d0a8ff' }));
    }
    // Feeding links, eaten → eater (the way energy flows).
    const linkR = (eaten: Organism) => {
      if (!energy) return 0.02;
      const r = RANK[eaten.level];
      return r === null ? 0.016 : 0.012 + 0.05 * 0.45 ** r;
    };
    const byId = new Map(p.organisms.map((o) => [o.id, o]));
    for (const [eaten, eater] of p.links) {
      const a = pos.get(eaten)!;
      const b = pos.get(eater)!;
      const d: Vec3 = [b[0] - a[0], b[1] - a[1], 0];
      const len = Math.hypot(d[0], d[1]);
      if (len < 2 * TOKEN_R + 0.05) continue;
      const u: Vec3 = [d[0] / len, d[1] / len, 0];
      const from: Vec3 = [a[0] + u[0] * (TOKEN_R + 0.04), a[1] + u[1] * (TOKEN_R + 0.04), 0.02];
      const vec: Vec3 = [u[0] * (len - 2 * TOKEN_R - 0.1), u[1] * (len - 2 * TOKEN_R - 0.1), 0];
      const faded = removed.has(eaten) || removed.has(eater);
      const src = byId.get(eaten)!;
      parts.push({
        name: `Link_${eaten}_${eater}`, shape: { kind: 'arrow', from, vector: vec, radius: linkR(src) }, color: LEVEL_COLOR[src.level], material: 'plastic', glow: 0.15,
        ...(faded ? { container: true, opacity: 0.12 } : {}),
      });
    }
    // Sunlight reaches the producers.
    const sun: Vec3 = [-5.15, 4.85, 0];
    for (const o of p.organisms.filter((x) => x.level === 'producer')) {
      const b = pos.get(o.id)!;
      const d: Vec3 = [b[0] - sun[0], b[1] - sun[1], 0];
      const len = Math.hypot(d[0], d[1]);
      const u: Vec3 = [d[0] / len, d[1] / len, 0];
      // Faint and behind the links, so it reads as light falling on the producers rather than another feeding link.
      parts.push({ name: `SunRay_${o.id}`, shape: { kind: 'arrow', from: [sun[0] + u[0] * 0.5, sun[1] + u[1] * 0.5, -0.33], vector: [u[0] * (len - 0.5 - TOKEN_R - 0.08), u[1] * (len - 0.5 - TOKEN_R - 0.08), 0], radius: 0.022 }, color: '#ffd166', material: 'emissive', glow: 0.9, opacity: 0.3, container: true, noPick: true });
    }
    return parts;
  },
};

function biomeDecor(b: Biome): Part[] {
  const out: Part[] = [];
  const y = 0.0;
  if (b === 'lake') {
    out.push({ name: 'Biome_Water', shape: { kind: 'box', size: [11, 0.18, 0.06] }, position: [-0.6, y - 0.2, -0.62], color: '#4aa3df', opacity: 0.6, container: true, noPick: true });
  } else if (b === 'mountain') {
    [[-3.2, 1.6], [-1.6, 2.2], [0.6, 1.8], [2.8, 2.4]].forEach(([x, h], i) => {
      out.push({ name: `Biome_Peak_${i + 1}`, shape: { kind: 'cylinder', radiusTop: 0, radiusBottom: h * 0.7, height: h, segments: 4 }, position: [x, y + h / 2 - 0.2, -1.05], scale: [1, 1, 0.22], color: '#5c677d', material: 'matte', noPick: true });
      out.push({ name: `Biome_Snow_${i + 1}`, parent: `Biome_Peak_${i + 1}`, shape: { kind: 'cylinder', radiusTop: 0, radiusBottom: h * 0.21, height: h * 0.3, segments: 4 }, position: [0, h * 0.35 + 0.005, 0], color: '#f1f3f5', material: 'matte', noPick: true });
    });
  } else if (b === 'forest') {
    for (let i = 0; i < 9; i++) {
      const x = -4.2 + i * 1.05;
      const h = 0.9 + ((i * 37) % 5) * 0.12;
      out.push({ name: `Biome_Tree_${i + 1}`, shape: { kind: 'cylinder', radiusTop: 0, radiusBottom: 0.3, height: h, segments: 12 }, position: [x, y + h / 2 - 0.25, -1.05], scale: [1, 1, 0.4], color: '#1f5130', material: 'matte', noPick: true });
    }
  } else {
    [[-3, 0.5], [0, 0.4], [3, 0.55]].forEach(([x, h], i) => out.push({ name: `Biome_Hill_${i + 1}`, shape: { kind: 'sphere', radius: 1.6, widthSegments: 32, hemisphere: true }, position: [x, y - 0.3, -0.95], scale: [1.4, h, 0.3], color: '#8a8f4a', material: 'matte', noPick: true }));
  }
  return out;
}
